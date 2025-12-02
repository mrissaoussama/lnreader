import { db as rawDb } from '../db';
import NativeFile from '@specs/NativeFile';
import { NOVEL_STORAGE } from '@utils/Storages';
import { normalizePath } from '@utils/urlUtils';
import { MMKVStorage } from '@utils/mmkv/mmkv';

// A single-writer queue to serialize all DB write operations
// This prevents overlapping/nested transactions across concurrent tasks.
// Now with batched JSON persistence for crash recovery and smart validation.

const SKIP_UPDATE_THRESHOLD_KEY = 'SKIP_UPDATE_THRESHOLD';

type DbHandle = typeof rawDb;

interface BatchedTaskData {
  taskType: 'UPDATE_LIBRARY' | 'DOWNLOAD' | 'MASS_IMPORT';
  items: any[]; // Array of task data items
  timestamp: number;
  batchId: string;
}

interface SerializableTaskData {
  taskType: 'UPDATE_LIBRARY' | 'DOWNLOAD' | 'MASS_IMPORT' | 'OTHER';
  label?: string;
  data: any;
  timestamp: number;
  id: string;
}

type Task<T> = {
  run: (db: DbHandle) => Promise<T>;
  transactional?: boolean;
  exclusive?: boolean;
  label?: string;
  taskType?: 'UPDATE_LIBRARY' | 'DOWNLOAD' | 'MASS_IMPORT' | 'OTHER';
  persistentData?: any;
  persistentId?: string;
  skipValidation?: boolean; // New: skip validation for single novel updates
  priority?: 'high' | 'normal';
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
};

class DbWriteQueue {
  private queue: Task<any>[] = [];
  private running = false;
  private db: DbHandle;
  private batchThreshold = 5;
  private batchTimeout: NodeJS.Timeout | null = null;
  private batchTimeoutMs = 300000;
  private persistentQueueDir: string;
  private initialized = false;

  // Batched persistence system
  private batchInsertThreshold = 5; // Write JSON after this many inserts
  private batchFlushTimeout = 5000; // Flush after 5 seconds of no activity
  private updateSkipTimeWindow = 300000; // 5 minutes - skip updates within this time window
  private pendingBatches: Map<
    string,
    {
      items: any[];
      timer: NodeJS.Timeout | null;
    }
  > = new Map();

  constructor(db: DbHandle) {
    this.db = db;
    this.persistentQueueDir = `${NOVEL_STORAGE}/.dbqueue`;
    this.initPersistence();
  }

  private getUpdateSkipTimeWindow(): number {
    const threshold = MMKVStorage.getString(SKIP_UPDATE_THRESHOLD_KEY) || 'off';

    switch (threshold) {
      case '1h':
        return 60 * 60 * 1000; // 1 hour
      case '12h':
        return 12 * 60 * 60 * 1000; // 12 hours
      case '1d':
        return 24 * 60 * 60 * 1000; // 1 day
      case '1w':
        return 7 * 24 * 60 * 60 * 1000; // 1 week
      case 'off':
      default:
        return 0; // No skip window
    }
  }

  private async initPersistence() {
    try {
      if (!(await NativeFile.exists(this.persistentQueueDir))) {
        await NativeFile.mkdir(this.persistentQueueDir);
      }

      // Mark as initialized immediately to prevent blocking
      this.initialized = true;

      // Recover batched tasks in background (non-blocking)
      setTimeout(async () => {
        try {
          await this.recoverBatchedTasks();
        } catch (error) {
          // Recovery errors are non-critical
        }
      }, 100);
    } catch (error) {
      this.initialized = true;
    }
  }

  private async recoverBatchedTasks() {
    try {
      // Check if directory exists before trying to read it
      if (!(await NativeFile.exists(this.persistentQueueDir))) {
        return;
      }

      const files = await NativeFile.readDir(this.persistentQueueDir);

      if (!files || files.length === 0) {
        return;
      }

      for (const file of files) {
        if (!file.name.endsWith('.json')) continue;

        try {
          const filePath = `${this.persistentQueueDir}/${file.name}`;
          const content = await NativeFile.readFile(filePath);

          // Check if it's a batched file or single task file
          if (file.name.startsWith('batch_')) {
            const batchData: BatchedTaskData = JSON.parse(content);
            await this.processBatchedRecovery(batchData, filePath);
          } else {
            const taskData: SerializableTaskData = JSON.parse(content);
            await this.reconstructAndEnqueue(taskData, filePath);
          }

          // Delete the file after successful recovery
          await NativeFile.unlink(filePath);
        } catch (fileError) {}
      }
    } catch (error) {}
  }

  private async processBatchedRecovery(batchData: BatchedTaskData) {
    const { taskType, items, timestamp } = batchData;

    switch (taskType) {
      case 'MASS_IMPORT':
        for (const item of items) {
          // Check if novel already exists before re-adding
          const exists = await this.checkNovelExists(item.pluginId, item.path);
          if (!exists) {
            this.enqueue(
              async db => {
                await db.runAsync(
                  'UPDATE Novel SET inLibrary = 1 WHERE id = ?',
                  [item.novelId],
                );
                if (item.categoryId) {
                  await db.runAsync(
                    'INSERT OR IGNORE INTO NovelCategory (novelId, categoryId) VALUES (?, ?)',
                    [item.novelId, item.categoryId],
                  );
                }
              },
              {
                taskType: 'MASS_IMPORT',
                label: 'recovered-batch',
                skipPersistence: true,
              },
            );
          }
        }
        break;

      case 'UPDATE_LIBRARY':
        for (const item of items) {
          if (item.novelId && item.updates) {
            // Check if update is still needed
            const shouldUpdate = await this.shouldUpdateNovel(
              item.novelId,
              timestamp,
              item.pluginId,
              item.path,
            );
            if (shouldUpdate) {
              this.enqueue(
                async db => {
                  const setClauses = Object.keys(item.updates)
                    .map(key => `${key} = ?`)
                    .join(', ');
                  const values = [...Object.values(item.updates), item.novelId];
                  await db.runAsync(
                    `UPDATE Novel SET ${setClauses} WHERE id = ?`,
                    values,
                  );
                },
                {
                  taskType: 'UPDATE_LIBRARY',
                  label: 'recovered-batch',
                  skipPersistence: true,
                },
              );
            }
          }
        }
        break;

      case 'DOWNLOAD':
        for (const item of items) {
          if (item.chapterId) {
            // Check if chapter is already downloaded
            const isDownloaded = await this.checkChapterDownloaded(
              item.chapterId,
            );
            if (!isDownloaded) {
              this.enqueue(
                async db => {
                  await db.runAsync(
                    'UPDATE Chapter SET isDownloaded = 1 WHERE id = ?',
                    [item.chapterId],
                  );
                },
                {
                  taskType: 'DOWNLOAD',
                  label: 'recovered-batch',
                  skipPersistence: true,
                },
              );
            }
          }
        }
        break;
    }
  }

  private async shouldUpdateNovel(
    novelId: number,
    jsonTimestamp: number,
    pluginId?: string,
    path?: string,
  ): Promise<boolean> {
    try {
      // Get the skip window from settings
      const skipWindow = this.getUpdateSkipTimeWindow();

      // If skip window is 0 (off), don't skip any updates
      if (skipWindow === 0) {
        return true;
      }

      let novel: { updatedAt?: number | string } | null = null;

      // Try to get novel by ID first, then by pluginId+path if provided
      if (novelId) {
        novel = await this.db.getFirstAsync<{ updatedAt?: number | string }>(
          'SELECT updatedAt FROM Novel WHERE id = ?',
          [novelId],
        );
      } else if (pluginId && path) {
        const normalizedPath = normalizePath(path);
        novel = await this.db.getFirstAsync<{ updatedAt?: number | string }>(
          'SELECT updatedAt FROM Novel WHERE pluginId = ? AND (path = ? OR path = ?)',
          [pluginId, normalizedPath, '/' + normalizedPath],
        );
      }

      if (!novel) {
        // Novel doesn't exist, skip update
        return false;
      }

      // Convert updatedAt to timestamp if it's a string
      let dbUpdatedAt = 0;
      if (novel.updatedAt) {
        if (typeof novel.updatedAt === 'number') {
          dbUpdatedAt = novel.updatedAt;
        } else if (typeof novel.updatedAt === 'string') {
          dbUpdatedAt = new Date(novel.updatedAt).getTime();
        }
      }

      // If DB was updated after JSON timestamp, skip
      if (dbUpdatedAt >= jsonTimestamp) {
        return false;
      }

      // Check if update is within skip time window from settings
      if (dbUpdatedAt > 0) {
        const timeSinceDbUpdate = Date.now() - dbUpdatedAt;
        if (timeSinceDbUpdate < skipWindow) {
          return false;
        }
      }

      return true;
    } catch (error) {
      // On error, allow update to proceed
      return true;
    }
  }

  private async checkChapterDownloaded(chapterId: number): Promise<boolean> {
    try {
      const chapter = await this.db.getFirstAsync<{ isDownloaded: number }>(
        'SELECT isDownloaded FROM Chapter WHERE id = ?',
        [chapterId],
      );
      return chapter?.isDownloaded === 1;
    } catch (error) {
      return false;
    }
  }

  private async checkNovelExists(
    pluginId: string,
    path: string,
  ): Promise<boolean> {
    try {
      const normalizedPath = normalizePath(path);
      const novel = await this.db.getFirstAsync<{
        id: number;
        inLibrary: number;
      }>(
        'SELECT id, inLibrary FROM Novel WHERE pluginId = ? AND (path = ? OR path = ?)',
        [pluginId, normalizedPath, '/' + normalizedPath],
      );
      return novel?.inLibrary === 1;
    } catch (error) {
      return false;
    }
  }

  private async reconstructAndEnqueue(taskData: SerializableTaskData) {
    const { taskType, data, label, timestamp } = taskData;

    switch (taskType) {
      case 'UPDATE_LIBRARY':
        if (data.novelId && data.updates) {
          // Check if update is still needed
          const shouldUpdate = await this.shouldUpdateNovel(
            data.novelId,
            timestamp,
            data.pluginId,
            data.path,
          );
          if (shouldUpdate) {
            this.enqueue(
              async db => {
                const { updates, novelId } = data;
                const setClauses = Object.keys(updates)
                  .map(key => `${key} = ?`)
                  .join(', ');
                const values = [...Object.values(updates), novelId];
                await db.runAsync(
                  `UPDATE Novel SET ${setClauses} WHERE id = ?`,
                  values,
                );
              },
              {
                taskType: 'UPDATE_LIBRARY',
                label: label || 'recovered',
                skipPersistence: true,
              },
            );
          }
        }
        break;

      case 'DOWNLOAD':
        if (data.chapterId) {
          // Check if chapter is already downloaded
          const isDownloaded = await this.checkChapterDownloaded(
            data.chapterId,
          );
          if (!isDownloaded) {
            this.enqueue(
              async db => {
                await db.runAsync(
                  'UPDATE Chapter SET isDownloaded = 1 WHERE id = ?',
                  [data.chapterId],
                );
              },
              {
                taskType: 'DOWNLOAD',
                label: label || 'recovered',
                skipPersistence: true,
              },
            );
          }
        }
        break;

      case 'MASS_IMPORT':
        if (data.novelId) {
          const exists = await this.checkNovelExists(data.pluginId, data.path);
          if (!exists) {
            this.enqueue(
              async db => {
                await db.runAsync(
                  'UPDATE Novel SET inLibrary = 1 WHERE id = ?',
                  [data.novelId],
                );
                if (data.categoryId) {
                  await db.runAsync(
                    'INSERT OR IGNORE INTO NovelCategory (novelId, categoryId) VALUES (?, ?)',
                    [data.novelId, data.categoryId],
                  );
                }
              },
              {
                taskType: 'MASS_IMPORT',
                label: label || 'recovered',
                skipPersistence: true,
              },
            );
          }
        }
        break;
    }
  }

  private async addToBatch(
    taskType: 'UPDATE_LIBRARY' | 'DOWNLOAD' | 'MASS_IMPORT',
    data: any,
  ) {
    if (!this.initialized) return;

    const batchKey = `batch_${taskType}`;

    if (!this.pendingBatches.has(batchKey)) {
      this.pendingBatches.set(batchKey, {
        items: [],
        timer: null,
      });
    }

    const batch = this.pendingBatches.get(batchKey)!;
    batch.items.push(data);

    // Clear existing timer
    if (batch.timer) {
      clearTimeout(batch.timer);
      batch.timer = null;
    }

    // Check if we should flush immediately
    if (batch.items.length >= this.batchInsertThreshold) {
      await this.flushBatch(taskType);
    } else {
      // Only set timeout if there are items to flush
      if (batch.items.length > 0) {
        batch.timer = setTimeout(() => {
          this.flushBatch(taskType);
        }, this.batchFlushTimeout);
      }
    }
  }

  private async flushBatch(
    taskType: 'UPDATE_LIBRARY' | 'DOWNLOAD' | 'MASS_IMPORT',
  ) {
    const batchKey = `batch_${taskType}`;
    const batch = this.pendingBatches.get(batchKey);

    if (!batch || batch.items.length === 0) return;

    try {
      const batchData: BatchedTaskData = {
        taskType,
        items: [...batch.items],
        timestamp: Date.now(),
        batchId: `${taskType}_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`,
      };

      const filePath = `${this.persistentQueueDir}/batch_${batchData.batchId}.json`;
      await NativeFile.writeFile(filePath, JSON.stringify(batchData));

      // Clear the batch
      batch.items = [];
      if (batch.timer) {
        clearTimeout(batch.timer);
        batch.timer = null;
      }
    } catch (error) {}
  }

  private async persistTask(task: Task<any>, id: string) {
    if (!this.initialized || !task.persistentData) return;

    try {
      // Use batched persistence for supported task types
      if (
        task.taskType === 'MASS_IMPORT' ||
        task.taskType === 'UPDATE_LIBRARY' ||
        task.taskType === 'DOWNLOAD'
      ) {
        await this.addToBatch(task.taskType, task.persistentData);
      } else {
        // Fall back to individual file persistence for OTHER types
        const taskData: SerializableTaskData = {
          taskType: task.taskType || 'OTHER',
          label: task.label,
          data: task.persistentData,
          timestamp: Date.now(),
          id,
        };

        const filePath = `${this.persistentQueueDir}/${id}.json`;
        await NativeFile.writeFile(filePath, JSON.stringify(taskData));
      }
    } catch (error) {}
  }

  private async removePersistence(id: string) {
    if (!this.initialized || !id) return;

    try {
      const filePath = `${this.persistentQueueDir}/${id}.json`;
      if (await NativeFile.exists(filePath)) {
        await NativeFile.unlink(filePath);
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  }

  // Pre-execution validation for tasks with persistent data
  private async validateTaskBeforeExecution(task: Task<any>): Promise<boolean> {
    if (!task.persistentData) return true; // No validation needed

    try {
      switch (task.taskType) {
        case 'UPDATE_LIBRARY':
          if (task.persistentData.novelId) {
            // Use current time as timestamp for validation
            return await this.shouldUpdateNovel(
              task.persistentData.novelId,
              Date.now(),
              task.persistentData.pluginId,
              task.persistentData.path,
            );
          }
          break;

        case 'DOWNLOAD':
          if (task.persistentData.chapterId) {
            const isDownloaded = await this.checkChapterDownloaded(
              task.persistentData.chapterId,
            );
            if (isDownloaded) {
              return false;
            }
          }
          break;

        case 'MASS_IMPORT':
          if (task.persistentData.pluginId && task.persistentData.path) {
            const exists = await this.checkNovelExists(
              task.persistentData.pluginId,
              task.persistentData.path,
            );
            if (exists) {
              return false;
            }
          }
          break;
      }
    } catch (error) {
      // On error, allow task to proceed
    }

    return true;
  }

  enqueue<T>(
    run: (db: DbHandle) => Promise<T>,
    options?: {
      transactional?: boolean;
      exclusive?: boolean;
      label?: string;
      taskType?: 'UPDATE_LIBRARY' | 'DOWNLOAD' | 'MASS_IMPORT' | 'OTHER';
      persistentData?: any;
      skipPersistence?: boolean;
      priority?: 'high' | 'normal';
    },
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const persistentId = options?.skipPersistence
        ? undefined
        : `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const task: Task<T> = {
        run,
        transactional: options?.transactional !== false,
        exclusive: !!options?.exclusive,
        label: options?.label,
        taskType: options?.taskType || 'OTHER',
        persistentData: options?.persistentData,
        persistentId,
        priority: options?.priority || 'normal',
        resolve,
        reject,
      };

      this.queue.push(task);

      // Persist task to disk if it has persistentData
      if (
        persistentId &&
        options?.persistentData &&
        !options?.skipPersistence
      ) {
        this.persistTask(task, persistentId).catch(() => {
          // Continue even if persistence fails
        });
      }

      // Start processing
      this.process();

      // Set up batch timeout if needed
      if (!this.batchTimeout && this.shouldConsiderBatching()) {
        this.batchTimeout = setTimeout(() => {
          this.batchTimeout = null;
          this.process();
        }, this.batchTimeoutMs);
      }
    });
  }

  private shouldConsiderBatching(): boolean {
    if (this.queue.length < this.batchThreshold) return false;

    const typeCounts = new Map<string, number>();
    for (const task of this.queue) {
      const type = task.taskType || 'OTHER';
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }

    return Array.from(typeCounts.values()).some(
      count => count >= this.batchThreshold,
    );
  }

  private async process() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      // Check for high priority tasks first
      // Find the FIRST high priority task (FIFO)
      let highPriorityIndex = -1;
      for (let i = 0; i < this.queue.length; i++) {
        if (this.queue[i].priority === 'high') {
          highPriorityIndex = i;
          break;
        }
      }

      if (highPriorityIndex > -1) {
        const task = this.queue.splice(highPriorityIndex, 1)[0];
        await this.processSingleTask(task);
        continue;
      }

      const batchableTasks = this.getBatchableTasks();

      if (batchableTasks.length >= this.batchThreshold) {
        await this.processBatch(batchableTasks);
      } else {
        // FIFO: Use shift() to get the FIRST task added
        const task = this.queue.shift()!;
        await this.processSingleTask(task);
      }
    }

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    this.running = false;
  }

  private getBatchableTasks(): Task<any>[] {
    const typeCounts = new Map<string, Task<any>[]>();

    for (const task of this.queue) {
      const type = task.taskType || 'OTHER';
      if (!typeCounts.has(type)) {
        typeCounts.set(type, []);
      }
      typeCounts.get(type)!.push(task);
    }

    for (const [type, tasks] of typeCounts) {
      if (
        tasks.length >= this.batchThreshold &&
        (type === 'UPDATE_LIBRARY' ||
          type === 'DOWNLOAD' ||
          type === 'MASS_IMPORT')
      ) {
        return tasks.slice(0, this.batchThreshold);
      }
    }

    return [];
  }

  private async processSingleTask(task: Task<any>) {
    try {
      // Validate task before execution
      const isValid = await this.validateTaskBeforeExecution(task);

      if (!isValid) {
        // Task is no longer needed, remove persistence and resolve
        if (task.persistentId) {
          await this.removePersistence(task.persistentId);
        }
        task.resolve(undefined); // Resolve with undefined to indicate skipped
        return;
      }

      let result: any;
      if (task.transactional) {
        if (
          task.exclusive &&
          typeof this.db.withExclusiveTransactionAsync === 'function'
        ) {
          result = await this.db.withExclusiveTransactionAsync(async () => {
            return await task.run(this.db);
          });
        } else {
          result = await this.db.withTransactionAsync(async () => {
            return await task.run(this.db);
          });
        }
      } else {
        result = await task.run(this.db);
      }

      if (task.persistentId) {
        await this.removePersistence(task.persistentId);
      }

      task.resolve(result);
    } catch (e) {
      task.reject(e);
    }
  }

  private async processBatch(tasks: Task<any>[]) {
    // Remove these tasks from queue
    for (const task of tasks) {
      const index = this.queue.indexOf(task);
      if (index > -1) {
        this.queue.splice(index, 1);
      }
    }

    // Validate all tasks before execution
    const validTasks: Task<any>[] = [];
    const invalidTasks: Task<any>[] = [];

    for (const task of tasks) {
      const isValid = await this.validateTaskBeforeExecution(task);
      if (isValid) {
        validTasks.push(task);
      } else {
        invalidTasks.push(task);
      }
    }

    // Resolve invalid tasks and remove their persistence
    for (const task of invalidTasks) {
      if (task.persistentId) {
        await this.removePersistence(task.persistentId);
      }
      task.resolve(undefined); // Resolve with undefined to indicate skipped
    }

    // Process valid tasks
    if (validTasks.length === 0) {
      return;
    }

    try {
      await this.db.withTransactionAsync(async () => {
        const results = await Promise.all(
          validTasks.map(task => task.run(this.db)),
        );
        validTasks.forEach((task, index) => {
          task.resolve(results[index]);
        });
      });

      for (const task of validTasks) {
        if (task.persistentId) {
          await this.removePersistence(task.persistentId);
        }
      }
    } catch (e) {
      validTasks.forEach(task => task.reject(e));
    }
  }

  // Force flush all pending batches
  async flushAllBatches(): Promise<void> {
    const flushPromises: Promise<void>[] = [];

    for (const [batchKey] of this.pendingBatches) {
      const taskType = batchKey.replace('batch_', '') as
        | 'UPDATE_LIBRARY'
        | 'DOWNLOAD'
        | 'MASS_IMPORT';
      flushPromises.push(this.flushBatch(taskType));
    }

    await Promise.all(flushPromises);
  }

  // Clear all batch timers (useful for cleanup)
  clearAllBatchTimers(): void {
    for (const [, batch] of this.pendingBatches) {
      if (batch.timer) {
        clearTimeout(batch.timer);
        batch.timer = null;
      }
    }
  }

  async clearPersistentQueue(): Promise<number> {
    try {
      // First flush any pending batches
      await this.flushAllBatches();

      if (!(await NativeFile.exists(this.persistentQueueDir))) {
        return 0;
      }

      const files = await NativeFile.readDir(this.persistentQueueDir);
      let count = 0;

      for (const file of files) {
        if (file.name.endsWith('.json')) {
          try {
            await NativeFile.unlink(`${this.persistentQueueDir}/${file.name}`);
            count++;
          } catch (error) {}
        }
      }

      // Clear all batch timers after clearing files
      this.clearAllBatchTimers();

      return count;
    } catch (error) {
      return 0;
    }
  }

  async getPersistentQueueCount(): Promise<number> {
    try {
      if (!(await NativeFile.exists(this.persistentQueueDir))) {
        return 0;
      }

      const files = await NativeFile.readDir(this.persistentQueueDir);
      return files.filter(f => f.name.endsWith('.json')).length;
    } catch (error) {
      return 0;
    }
  }

  // Get stats about pending batches in memory
  getPendingBatchesInfo(): { [key: string]: number } {
    const info: { [key: string]: number } = {};
    for (const [batchKey, batch] of this.pendingBatches) {
      info[batchKey] = batch.items.length;
    }
    return info;
  }
}

export const dbWriteQueue = new DbWriteQueue(rawDb);
