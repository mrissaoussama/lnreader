import BackgroundService from 'react-native-background-actions';
import * as Notifications from 'expo-notifications';

import { getMMKVObject, setMMKVObject, MMKVStorage } from '@utils/mmkv/mmkv';
import { importEpub } from './epub/import';
import { getString } from '@strings/translations';
import { updateLibrary } from './updates';
import { DriveFile } from '@api/drive/types';
import { createDriveBackup, driveRestore } from './backup/drive';
import {
  createSelfHostBackup,
  SelfHostData,
  selfHostRestore,
} from './backup/selfhost';
import { migrateNovel, MigrateNovelData } from './migrate/migrateNovel';
import { downloadChapter } from './download/downloadChapter';
import { askForPostNotificationsPermission } from '@utils/askForPostNoftificationsPermission';
import { massImport } from './updates/massImport';
import { ProgressSyncService } from './Trackers/ProgressSyncService';
import { Platform, TurboModuleRegistry } from 'react-native';

import { createBackup, restoreBackup } from './backup/local';
import { addCancelledChapter } from './download/cancelRegistry';

type taskNames =
  | 'IMPORT_EPUB'
  | 'UPDATE_LIBRARY'
  | 'DRIVE_BACKUP'
  | 'DRIVE_RESTORE'
  | 'SELF_HOST_BACKUP'
  | 'SELF_HOST_RESTORE'
  | 'LOCAL_BACKUP'
  | 'LOCAL_RESTORE'
  | 'MIGRATE_NOVEL'
  | 'DOWNLOAD_CHAPTER'
  | 'MASS_IMPORT'
  | 'SYNC_FROM_TRACKERS'
  | 'SYNC_TO_TRACKERS'
  | 'SYNC_ALL_TRACKERS';

export type BackgroundTask =
  | {
      name: 'IMPORT_EPUB';
      data: {
        filename: string;
        uri: string;
      };
    }
  | {
      name: 'UPDATE_LIBRARY';
      data?: {
        categoryId?: number;
        categoryName?: string;
      };
    }
  | { name: 'DRIVE_BACKUP'; data: DriveFile }
  | { name: 'DRIVE_RESTORE'; data: DriveFile }
  | { name: 'SELF_HOST_BACKUP'; data: SelfHostData }
  | { name: 'SELF_HOST_RESTORE'; data: SelfHostData }
  | {
      name: 'LOCAL_BACKUP';
      data: {
        includeCovers: boolean;
        includeChapters: boolean;
        includeDownloads: boolean;
        includeSettings: boolean;
        includeRepositories: boolean;
        includePlugins: boolean;
        directoryUri?: string;
      };
    }
  | {
      name: 'LOCAL_RESTORE';
      data: {
        includeCovers: boolean;
        includeChapters: boolean;
        includeDownloads: boolean;
        includeSettings: boolean;
        includeRepositories: boolean;
        includePlugins: boolean;
        backupFile?: any;
      };
    }
  | { name: 'MIGRATE_NOVEL'; data: MigrateNovelData }
  | { name: 'MASS_IMPORT'; data: { urls: string[]; delay?: number } }
  | DownloadChapterTask;
export type DownloadChapterTask = {
  name: 'DOWNLOAD_CHAPTER';
  data: {
    chapterId: number;
    novelId: number;
    pluginId: string;
    novelName: string;
    chapterName: string;
    novelCover?: string;
  };
};

export type BackgroundTaskMetadata = {
  name: string;
  isRunning: boolean;
  progress: number | undefined;
  progressText: string | undefined;
  result?: any;
};

export type QueuedBackgroundTask = {
  task: BackgroundTask;
  meta: BackgroundTaskMetadata;
  id: string;
};

type TaskListListener = (tasks: QueuedBackgroundTask[]) => void;

function makeId() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

export default class ServiceManager {
  STORE_KEY = 'APP_SERVICE';
  lastNotifUpdate = 0;
  currentPendingUpdate = 0;
  private static instance?: ServiceManager;
  private listeners: { [key: string]: TaskListListener[] } = {};
  private globalListeners: TaskListListener[] = [];
  private cancelledTasks: Set<string> = new Set();

  private constructor() {}

  static get manager() {
    if (!this.instance) {
      this.instance = new ServiceManager();
    }
    return this.instance;
  }

  private notifyListeners(taskName?: taskNames) {
    const tasks = this.getTaskList();
    if (taskName) {
      const listeners = this.listeners[taskName] || [];
      for (const listener of listeners) {
        listener(tasks);
      }
    }
    for (const listener of this.globalListeners) {
      listener(tasks);
    }
  }

  private updateTaskList(
    tasks: QueuedBackgroundTask[],
    notifyTaskName?: taskNames,
  ) {
    setMMKVObject(this.STORE_KEY, tasks);
    // For DOWNLOAD_CHAPTER, notify global listeners (TaskQueue) but not specific task listeners
    // This prevents library from re-fetching when chapters download
    if (notifyTaskName === 'DOWNLOAD_CHAPTER') {
      // Only notify global listeners (TaskQueue screen)
      for (const listener of this.globalListeners) {
        listener(tasks);
      }
      return;
    }
    this.notifyListeners(notifyTaskName);
  }

  get isRunning() {
    return BackgroundService.isRunning();
  }

  isMultiplicableTask(task: BackgroundTask) {
    return (
      [
        'DOWNLOAD_CHAPTER',
        'IMPORT_EPUB',
        'MIGRATE_NOVEL',
        'MASS_IMPORT',
      ] as Array<BackgroundTask['name']>
    ).includes(task.name);
  }

  async start() {
    if (!this.isRunning) {
      const notificationsAllowed = await askForPostNotificationsPermission();
      if (!notificationsAllowed) return;
      BackgroundService.start(ServiceManager.launch, {
        taskName: 'app_services',
        taskTitle: 'App Service',
        taskDesc: getString('common.preparing'),
        taskIcon: { name: 'notification_icon', type: 'drawable' },
        color: '#00adb5',
        linkingURI: 'lnreader://',
        parameters: {
          delay: 100,
        },
      }).catch(error => {
        Notifications.scheduleNotificationAsync({
          content: {
            title: getString('backupScreen.drive.backupInterruped'),
            body: error.message,
          },
          trigger: null,
        });
        BackgroundService.stop();
      });
    }
  }

  setMeta(
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) {
    const taskList = [...this.getTaskList()];
    if (!taskList[0]) {
      return;
    }
    const taskName = taskList[0].task.name;
    taskList[0] = {
      ...taskList[0],
      meta: transformer(taskList[0].meta),
    };

    if (
      taskList[0].meta.isRunning &&
      taskList[0].task.name !== 'DOWNLOAD_CHAPTER'
    ) {
      const now = Date.now();
      const elapsed = now - this.lastNotifUpdate;
      if (elapsed < 1000 && this.currentPendingUpdate === 0) {
        const delay = 1000 - elapsed;
        this.currentPendingUpdate = setTimeout(() => {
          BackgroundService.updateNotification({
            taskTitle: taskList[0].meta.name,
            taskDesc: taskList[0].meta.progressText ?? '',
            progressBar: {
              indeterminate: taskList[0].meta.progress === undefined,
              value: (taskList[0].meta.progress || 0) * 100,
              max: 100,
            },
          });
          this.lastNotifUpdate = Date.now();
          this.currentPendingUpdate = 0;
        }, delay);
      } else if (elapsed >= 1000) {
        BackgroundService.updateNotification({
          taskTitle: taskList[0].meta.name,
          taskDesc: taskList[0].meta.progressText ?? '',
          progressBar: {
            indeterminate: taskList[0].meta.progress === undefined,
            value: (taskList[0].meta.progress || 0) * 100,
            max: 100,
          },
        });
        this.lastNotifUpdate = now;
        if (this.currentPendingUpdate) {
          clearTimeout(this.currentPendingUpdate);
          this.currentPendingUpdate = 0;
        }
      }
    }

    this.updateTaskList(taskList, taskName);
  }

  getProgressForNotification(
    currentTask: QueuedBackgroundTask,
    startingTasks: QueuedBackgroundTask[],
  ) {
    let i = null;
    let count = 0;
    for (const task of startingTasks) {
      if (
        task.task.name === 'DOWNLOAD_CHAPTER' &&
        task.meta.name === currentTask.meta.name
      ) {
        if (task.id === currentTask.id) {
          i = count;
        }
        count++;
      } else {
        if (i !== null) {
          break;
        }
        count = 0;
      }
    }
    if (i === null) {
      return null;
    }
    return (i / count) * 100;
  }

  async executeTask(
    task: QueuedBackgroundTask,
    startingTasks: QueuedBackgroundTask[],
  ) {
    const progress =
      task.task.name === 'DOWNLOAD_CHAPTER'
        ? this.getProgressForNotification(task, startingTasks)
        : null;
    await BackgroundService.updateNotification({
      taskTitle: task.meta.name,
      taskDesc: task.meta.progressText ?? '',
      progressBar: {
        indeterminate: progress === null,
        max: 100,
        value: progress == null ? 0 : progress,
      },
    });
    this.lastNotifUpdate = Date.now();
    if (this.currentPendingUpdate) {
      clearTimeout(this.currentPendingUpdate);
    }
    this.currentPendingUpdate = 0;

    switch (task.task.name) {
      case 'IMPORT_EPUB':
        return importEpub(task.task.data, this.setMeta.bind(this));
      case 'UPDATE_LIBRARY':
        return updateLibrary(
          task.task.data || {},
          this.setMeta.bind(this),
          () => this.isTaskCancelled(task.id),
        );
      case 'DRIVE_BACKUP':
        return createDriveBackup(task.task.data, this.setMeta.bind(this));
      case 'DRIVE_RESTORE':
        return driveRestore(task.task.data, this.setMeta.bind(this));
      case 'SELF_HOST_BACKUP':
        return createSelfHostBackup(task.task.data, this.setMeta.bind(this));
      case 'SELF_HOST_RESTORE':
        return selfHostRestore(task.task.data, this.setMeta.bind(this));
      case 'LOCAL_BACKUP':
        return createBackup(
          task.task.data.includeDownloads,
          this.setMeta.bind(this),
          task.task.data.directoryUri,
          {
            includeCovers: task.task.data.includeCovers,
            includeChapters: task.task.data.includeChapters,
            includeSettings: task.task.data.includeSettings,
            includeRepositories: task.task.data.includeRepositories,
            includePlugins: task.task.data.includePlugins,
          },
        );
      case 'LOCAL_RESTORE':
        return restoreBackup(
          task.task.data.includeDownloads,
          this.setMeta.bind(this),
          task.task.data.backupFile,
          {
            includeCovers: task.task.data.includeCovers,
            includeChapters: task.task.data.includeChapters,
            includeSettings: task.task.data.includeSettings,
            includeRepositories: task.task.data.includeRepositories,
            includePlugins: task.task.data.includePlugins,
          },
        );
      case 'MIGRATE_NOVEL':
        return migrateNovel(task.task.data, this.setMeta.bind(this));
      case 'DOWNLOAD_CHAPTER':
        return downloadChapter(task.task.data, this.setMeta.bind(this));
      case 'MASS_IMPORT': {
        const data = task.task.data;
        const massImportData: { urls: string[]; delay: number } =
          data &&
          typeof data === 'object' &&
          Array.isArray(data.urls) &&
          typeof data.delay === 'number'
            ? (data as { urls: string[]; delay: number })
            : { urls: [], delay: 500 };
        return massImport(massImportData, this.setMeta.bind(this), task.id);
      }
      case 'SYNC_FROM_TRACKERS': {
        const data = task.task.data;
        const forceUpdate = data?.forceUpdate || false;
        const results = await ProgressSyncService.syncFromTrackers(
          syncProgress => {
            this.setMeta(meta => ({
              ...meta,
              progress: syncProgress.processed / syncProgress.total,
              progressText: `Syncing ${syncProgress.currentNovel} (${syncProgress.processed}/${syncProgress.total})`,
            }));
          },
          forceUpdate,
        );
        this.setMeta(meta => ({
          ...meta,
          progress: 1,
          progressText: `Sync completed. ${
            results.novels.length
          } novels processed (${
            results.novels.filter(
              n =>
                n.appChange &&
                n.appChange.oldProgress !== n.appChange.newProgress,
            ).length
          } app updates, ${
            results.novels.filter(
              n => n.error || n.trackerChanges?.some(c => c.error),
            ).length
          } errors)`,
          isRunning: false,
          result: results,
        }));
        return results;
      }
      case 'SYNC_TO_TRACKERS': {
        const data = task.task.data;
        const forceUpdate = data?.forceUpdate || false;
        const results = await ProgressSyncService.syncToTrackers(
          syncProgress => {
            this.setMeta(meta => ({
              ...meta,
              progress: syncProgress.processed / syncProgress.total,
              progressText: `Syncing ${syncProgress.currentNovel} (${syncProgress.processed}/${syncProgress.total})`,
            }));
          },
          forceUpdate,
        );
        this.setMeta(meta => ({
          ...meta,
          progress: 1,
          progressText: `Sync completed. ${
            results.novels.length
          } novels processed (${
            results.novels.filter(
              n =>
                n.trackerChanges &&
                n.trackerChanges.some(c => c.oldProgress !== c.newProgress),
            ).length
          } novels with tracker updates, ${results.novels.reduce(
            (count, n) =>
              count +
              (n.trackerChanges?.filter(c => c.oldProgress !== c.newProgress)
                .length || 0),
            0,
          )} total tracker changes, ${
            results.novels.filter(
              n => n.error || n.trackerChanges?.some(c => c.error),
            ).length
          } errors)`,
          isRunning: false,
          result: results,
        }));
        return results;
      }
      case 'SYNC_ALL_TRACKERS': {
        const data = task.task.data;
        const forceUpdate = data?.forceUpdate || false;
        const results = await ProgressSyncService.syncAllTrackers(
          syncProgress => {
            this.setMeta(meta => ({
              ...meta,
              progress: syncProgress.processed / syncProgress.total,
              progressText: `Syncing ${syncProgress.currentNovel} (${syncProgress.processed}/${syncProgress.total})`,
            }));
          },
          forceUpdate,
        );
        this.setMeta(meta => ({
          ...meta,
          progress: 1,
          progressText: `Sync completed. ${
            results.novels.length
          } novels processed (${
            results.novels.filter(
              n =>
                n.appChange &&
                n.appChange.oldProgress !== n.appChange.newProgress,
            ).length
          } app updates, ${
            results.novels.filter(
              n =>
                n.trackerChanges &&
                n.trackerChanges.some(c => c.oldProgress !== c.newProgress),
            ).length
          } novels with tracker updates, ${results.novels.reduce(
            (count, n) =>
              count +
              (n.trackerChanges?.filter(c => c.oldProgress !== c.newProgress)
                .length || 0),
            0,
          )} total tracker changes, ${
            results.novels.filter(
              n => n.error || n.trackerChanges?.some(c => c.error),
            ).length
          } errors)`,
          isRunning: false,
          result: results,
        }));
        return results;
      }
    }
  }

  static async launch() {
    const manager = ServiceManager.manager;
    const doneTasks: Record<BackgroundTask['name'], number> = {
      'IMPORT_EPUB': 0,
      'UPDATE_LIBRARY': 0,
      'DRIVE_BACKUP': 0,
      'DRIVE_RESTORE': 0,
      'SELF_HOST_BACKUP': 0,
      'SELF_HOST_RESTORE': 0,
      'LOCAL_BACKUP': 0,
      'LOCAL_RESTORE': 0,
      'MIGRATE_NOVEL': 0,
      'DOWNLOAD_CHAPTER': 0,
      'MASS_IMPORT': 0,
      'SYNC_FROM_TRACKERS': 0,
      'SYNC_TO_TRACKERS': 0,
      'SYNC_ALL_TRACKERS': 0,
    };

    const sleep = (ms: number) =>
      new Promise(resolve => setTimeout(resolve, ms));

    // Download management state
    const maxConcurrency =
      MMKVStorage.getNumber('DOWNLOAD_MAX_SIMULTANEOUS') || 3; // 0 treated as unlimited
    const maxPerPlugin = MMKVStorage.getNumber('DOWNLOAD_MAX_PER_PLUGIN') || 1; // 0 = unlimited
    const delayMs =
      MMKVStorage.getNumber('DOWNLOAD_DELAY_SAME_PLUGIN_MS') || 1000; // ms

    // Runtime state for downloads
    const runningDownloads = new Set<string>();
    const pluginRunningCount = new Map<string, number>();
    const pluginLastDownloadTime = new Map<string, number>();
    let skippedDownloads = 0;
    let completedDownloadsCount = 0;
    const failedDownloads: string[] = [];

    // Propagate limits to native downloader if present
    try {
      const NativeDownloader: any =
        Platform.OS === 'android'
          ? TurboModuleRegistry.get('NativeDownloader')
          : null;
      if (
        NativeDownloader &&
        typeof NativeDownloader.setLimits === 'function'
      ) {
        await NativeDownloader.setLimits(
          Math.max(0, maxConcurrency),
          Math.max(0, maxPerPlugin),
          Math.max(0, delayMs),
        );
      }
    } catch {}

    // Helper to get paused items from storage
    const getPausedSets = () => {
      let pausedPlugins: Set<string> = new Set();
      let pausedNovels: Set<number> = new Set();
      try {
        const plugins = JSON.parse(
          MMKVStorage.getString('DOWNLOAD_PAUSED_PLUGINS') || '[]',
        );
        pausedPlugins = new Set(plugins);
      } catch {}
      try {
        const novels = JSON.parse(
          MMKVStorage.getString('DOWNLOAD_PAUSED_NOVELS') || '[]',
        );
        pausedNovels = new Set(novels);
      } catch {}
      return { pausedPlugins, pausedNovels };
    };

    const startingTasks = manager.getTaskList();
    const tasksSet = new Set(startingTasks.map(t => t.id));
    const totalDownloads = startingTasks.filter(
      t => t.task.name === 'DOWNLOAD_CHAPTER',
    ).length;

    while (BackgroundService.isRunning()) {
      const queue = manager.getTaskList();

      if (queue.length === 0) {
        break;
      }

      // Add any newly queued tasks to the starting tasks list
      const newTasks = queue.filter(t => !tasksSet.has(t.id));
      startingTasks.push(...newTasks);
      newTasks.forEach(t => tasksSet.add(t.id));

      // Separate download and non-download tasks
      const nonDownloadTask = queue.find(
        t => t.task.name !== 'DOWNLOAD_CHAPTER',
      );

      // Process non-download tasks with priority
      if (nonDownloadTask) {
        await BackgroundService.updateNotification({
          taskTitle: nonDownloadTask.meta.name,
          taskDesc: nonDownloadTask.meta.progressText ?? '',
          progressBar: {
            indeterminate: nonDownloadTask.meta.progress === undefined,
            max: 100,
            value: (nonDownloadTask.meta.progress || 0) * 100,
          },
        });

        try {
          await manager.executeTask(nonDownloadTask, startingTasks);
          doneTasks[nonDownloadTask.task.name] += 1;
        } catch (error: any) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: nonDownloadTask.meta.name,
              body: error?.message || String(error),
            },
            trigger: null,
          });
        } finally {
          // Remove completed task
          const updatedQueue = manager.getTaskList();
          const filtered = updatedQueue.filter(
            t => t.id !== nonDownloadTask.id,
          );
          manager.updateTaskList(filtered, nonDownloadTask.task.name);
        }
        await sleep(100);
        continue;
      }

      // From here on, we only have download tasks
      const downloadQueue = queue.filter(
        t => t.task.name === 'DOWNLOAD_CHAPTER',
      ) as Array<QueuedBackgroundTask & { task: DownloadChapterTask }>;

      if (downloadQueue.length === 0) {
        break;
      }

      // Check if we can start more downloads
      if (runningDownloads.size >= maxConcurrency) {
        await sleep(100);
        continue;
      }

      const { pausedPlugins, pausedNovels } = getPausedSets();

      // Find next downloadable task
      let taskToStart:
        | (QueuedBackgroundTask & { task: DownloadChapterTask })
        | null = null;

      for (const task of downloadQueue) {
        // Skip if already running
        if (runningDownloads.has(task.id)) continue;

        const data = task.task.data;

        // Skip if paused
        if (
          pausedPlugins.has(data.pluginId) ||
          pausedNovels.has(data.novelId)
        ) {
          continue;
        }

        // Check plugin concurrency limit
        const pluginCount = pluginRunningCount.get(data.pluginId) ?? 0;
        if (pluginCount >= maxPerPlugin) {
          continue;
        }

        // Check delay requirement
        const lastDownload = pluginLastDownloadTime.get(data.pluginId);
        if (lastDownload && Date.now() - lastDownload < delayMs) {
          continue;
        }

        taskToStart = task;
        break;
      }

      if (taskToStart) {
        const task = taskToStart;
        runningDownloads.add(task.id);
        const pluginId = task.task.data.pluginId;
        pluginRunningCount.set(
          pluginId,
          (pluginRunningCount.get(pluginId) ?? 0) + 1,
        );
        pluginLastDownloadTime.set(pluginId, Date.now());

        // Execute download task asynchronously
        (async () => {
          try {
            const result = await manager.executeTask(task, startingTasks);
            if (result?.skipped) {
              skippedDownloads++;
            } else {
              doneTasks.DOWNLOAD_CHAPTER++;
            }
          } catch (error: any) {
            failedDownloads.push(task.task.data.chapterName);
          } finally {
            // Increment completed count BEFORE updating notification
            completedDownloadsCount++;

            runningDownloads.delete(task.id);
            pluginRunningCount.set(
              pluginId,
              Math.max(0, (pluginRunningCount.get(pluginId) ?? 1) - 1),
            );

            // Update notification with new progress after completion
            await BackgroundService.updateNotification({
              taskTitle: 'Downloads',
              taskDesc: `${completedDownloadsCount}/${totalDownloads} chapters`,
              progressBar: {
                indeterminate: false,
                max: 100,
                value:
                  totalDownloads > 0
                    ? (completedDownloadsCount / totalDownloads) * 100
                    : 0,
              },
            });

            // Remove completed task - this won't trigger library refresh anymore
            const updatedQueue = manager.getTaskList();
            const filtered = updatedQueue.filter(t => t.id !== task.id);
            manager.updateTaskList(filtered, 'DOWNLOAD_CHAPTER');
          }
        })();
      }

      await sleep(100); // Yield to event loop
    }

    // Wait for any remaining downloads to complete
    while (runningDownloads.size > 0) {
      await sleep(100);
    }

    // Final summary notification
    const summaryParts: string[] = [];

    Object.entries(doneTasks).forEach(([taskName, count]) => {
      if (count > 0) {
        summaryParts.push(
          `${getString(`notifications.${taskName as taskNames}`)}: ${count}`,
        );
      }
    });

    if (skippedDownloads > 0) {
      summaryParts.push(`Skipped (already downloaded): ${skippedDownloads}`);
    }
    if (failedDownloads.length > 0) {
      summaryParts.push(`Failed: ${failedDownloads.length}`);
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Background tasks done',
        body: summaryParts.join('\n') || 'All tasks completed',
      },
      trigger: null,
    });

    BackgroundService.stop();
  }

  getTaskName(task: BackgroundTask) {
    switch (task.name) {
      case 'DOWNLOAD_CHAPTER':
        return 'Download ' + task.data.novelName;
      case 'IMPORT_EPUB':
        return 'Import Epub ' + task.data.filename;
      case 'MIGRATE_NOVEL':
        return 'Migrate Novel ' + task.data.fromNovel.name;
      case 'UPDATE_LIBRARY':
        if (task.data !== undefined) {
          return 'Update Category ' + task.data.categoryName;
        }
        return 'Update Library';
      case 'DRIVE_BACKUP':
        return 'Drive Backup';
      case 'DRIVE_RESTORE':
        return 'Drive Restore';
      case 'SELF_HOST_BACKUP':
        return 'Self Host Backup';
      case 'SELF_HOST_RESTORE':
        return 'Self Host Restore';
      case 'LOCAL_BACKUP':
        return 'Local Backup';
      case 'LOCAL_RESTORE':
        return 'Local Restore';
      case 'MASS_IMPORT':
        return 'Mass Import';
      case 'SYNC_FROM_TRACKERS':
        return 'Sync from Trackers';
      case 'SYNC_TO_TRACKERS':
        return 'Sync to Trackers';
      case 'SYNC_ALL_TRACKERS':
        return 'Sync All Trackers';
      default:
        return 'Unknown Task';
    }
  }

  private getTaskListFromStorage(): QueuedBackgroundTask[] {
    return getMMKVObject<Array<QueuedBackgroundTask>>(this.STORE_KEY) || [];
  }

  getTaskList() {
    return getMMKVObject<Array<QueuedBackgroundTask>>(this.STORE_KEY) || [];
  }

  addTask(tasks: BackgroundTask | BackgroundTask[]) {
    let currentTasks = this.getTaskList();
    currentTasks = currentTasks.filter(task => !task?.name);

    const addableTasks = (Array.isArray(tasks) ? tasks : [tasks]).filter(
      task =>
        this.isMultiplicableTask(task) ||
        !currentTasks.some(_t => _t.task.name === task.name),
    );
    if (addableTasks.length) {
      const newTasks: QueuedBackgroundTask[] = addableTasks.map(task => ({
        task,
        meta: {
          name: this.getTaskName(task),
          isRunning: false,
          progress: undefined,
          progressText:
            task.name === 'DOWNLOAD_CHAPTER'
              ? task.data.chapterName
              : undefined,
        },
        id: makeId(),
      }));

      // Determine the task name for notification filtering
      // If all tasks are the same type, use that name, otherwise use undefined
      const taskNames = new Set(addableTasks.map(t => t.name));
      const notifyTaskName =
        taskNames.size === 1 ? addableTasks[0].name : undefined;

      // Update task list ONCE with all new tasks to prevent notification spam
      this.updateTaskList(currentTasks.concat(newTasks), notifyTaskName);
      this.start();
    }
  }

  observe(
    taskName: taskNames,
    listener: (task: QueuedBackgroundTask | undefined) => void,
  ): () => void {
    const taskListener: TaskListListener = tasks => {
      const task = tasks.find(t => t.task.name === taskName);
      listener(task);
    };
    if (!this.listeners[taskName]) {
      this.listeners[taskName] = [];
    }
    this.listeners[taskName].push(taskListener);
    return () => {
      this.listeners[taskName] = this.listeners[taskName].filter(
        l => l !== taskListener,
      );
    };
  }

  observeQueue(listener: TaskListListener): () => void {
    this.globalListeners.push(listener);
    return () => {
      this.globalListeners = this.globalListeners.filter(l => l !== listener);
    };
  }

  removeTasksByName(name: BackgroundTask['name']) {
    const taskList = this.getTaskList();
    const toCancel = taskList.filter(t => t.task.name === name).map(t => t.id);
    // Mark matching tasks as cancelled to allow running tasks to detect and stop
    toCancel.forEach(id => this.cancelledTasks.add(id));

    const filtered = taskList.filter(t => t.task.name !== name);
    this.updateTaskList(filtered, name);

    // If no tasks left and service is running, stop it
    if (filtered.length === 0 && this.isRunning) {
      BackgroundService.stop();
    }
  }

  removeDownloadTaskByChapterId(chapterId: number) {
    const name: BackgroundTask['name'] = 'DOWNLOAD_CHAPTER';
    const taskList = this.getTaskList();
    // Trigger native cancellation immediately
    try {
      const NativeDownloader: any =
        Platform.OS === 'android'
          ? TurboModuleRegistry.get('NativeDownloader')
          : null;
      if (
        NativeDownloader &&
        typeof NativeDownloader.cancelChapter === 'function'
      ) {
        NativeDownloader.cancelChapter(chapterId);
      }
    } catch {}
    // Mark for JS fallback path
    addCancelledChapter(chapterId);
    const toCancel = taskList
      .filter(
        t =>
          t.task.name === name && (t.task as any).data?.chapterId === chapterId,
      )
      .map(t => t.id);
    toCancel.forEach(id => this.cancelledTasks.add(id));

    const filtered = taskList.filter(
      t =>
        !(
          t.task.name === name && (t.task as any).data?.chapterId === chapterId
        ),
    );
    this.updateTaskList(filtered, name);

    // If no tasks left and service is running, stop it
    if (filtered.length === 0 && this.isRunning) {
      BackgroundService.stop();
    }
  }

  pauseDownloads(filter: (t: QueuedBackgroundTask) => boolean) {
    const taskList = this.getTaskList();
    try {
      const NativeDownloader: any =
        Platform.OS === 'android'
          ? TurboModuleRegistry.get('NativeDownloader')
          : null;
      if (
        NativeDownloader &&
        typeof NativeDownloader.pauseChapter === 'function'
      ) {
        taskList.forEach(t => {
          if (t.task.name === 'DOWNLOAD_CHAPTER' && filter(t)) {
            const id = (t.task as any).data?.chapterId as number;
            if (id) NativeDownloader.pauseChapter(id);
          }
        });
      }
    } catch {}
  }

  resumeDownloads(filter: (t: QueuedBackgroundTask) => boolean) {
    const taskList = this.getTaskList();
    try {
      const NativeDownloader: any =
        Platform.OS === 'android'
          ? TurboModuleRegistry.get('NativeDownloader')
          : null;
      if (
        NativeDownloader &&
        typeof NativeDownloader.resumeChapter === 'function'
      ) {
        taskList.forEach(t => {
          if (t.task.name === 'DOWNLOAD_CHAPTER' && filter(t)) {
            const id = (t.task as any).data?.chapterId as number;
            if (id) NativeDownloader.resumeChapter(id);
          }
        });
      }
    } catch {}
  }

  promoteDownloads(filter: (t: QueuedBackgroundTask) => boolean) {
    const taskList = this.getTaskList();
    const remaining: QueuedBackgroundTask[] = [];
    const promoted: QueuedBackgroundTask[] = [];
    for (const t of taskList) {
      if (t.task.name === 'DOWNLOAD_CHAPTER' && filter(t)) {
        promoted.push(t);
      } else {
        remaining.push(t);
      }
    }
    if (promoted.length) {
      const newList = [...([] as QueuedBackgroundTask[])];
      // Preserve current running task at head if any
      if (taskList[0] && !promoted.includes(taskList[0])) {
        newList.push(taskList[0]);
        const idx = remaining.indexOf(taskList[0]);
        if (idx >= 0) remaining.splice(idx, 1);
      }
      this.updateTaskList(
        newList.concat(promoted, remaining),
        'DOWNLOAD_CHAPTER',
      );
    }
  }

  removeDownloads(filter: (t: QueuedBackgroundTask) => boolean) {
    const taskList = this.getTaskList();
    // Collect matching chapter IDs
    const ids: number[] = [];
    taskList.forEach(t => {
      if (t.task.name === 'DOWNLOAD_CHAPTER' && filter(t)) {
        const id = (t.task as any).data?.chapterId as number;
        if (id) ids.push(id);
      }
    });

    // Native cancellation and JS fallback marking (batch persist)
    try {
      // Batch persist registry module
      if (ids.length) {
        try {
          require('./download/cancelRegistry');
        } catch {}
      }
    } catch {}

    // Mark matching download tasks as cancelled in memory
    taskList.forEach(t => {
      if (t.task.name === 'DOWNLOAD_CHAPTER' && filter(t)) {
        this.cancelledTasks.add(t.id);
      }
    });

    // Persist cancel registry in batch and invoke native cancels
    try {
      // Batch persist
      const { addCancelledChapters } =
        require('./download/cancelRegistry') as typeof import('./download/cancelRegistry');
      if (ids.length) addCancelledChapters(ids);
      // Native per-id cancel
      const NativeDownloader: any =
        Platform.OS === 'android'
          ? TurboModuleRegistry.get('NativeDownloader')
          : null;
      if (
        NativeDownloader &&
        typeof NativeDownloader.cancelChapter === 'function'
      ) {
        ids.forEach(id => {
          try {
            NativeDownloader.cancelChapter(id);
          } catch {}
        });
      }
    } catch {}

    const filtered = taskList.filter(
      t => !(t.task.name === 'DOWNLOAD_CHAPTER' && filter(t)),
    );
    this.updateTaskList(filtered, 'DOWNLOAD_CHAPTER');

    // If no tasks left and service is running, stop it
    if (filtered.length === 0 && this.isRunning) {
      BackgroundService.stop();
    }
  }

  clearTaskList() {
    // Mark everything as cancelled
    this.getTaskList().forEach(t => this.cancelledTasks.add(t.id));
    this.updateTaskList([]);
  }

  cancelTask(taskName: taskNames) {
    const taskList = this.getTaskList();
    const taskToCancel = taskList.find(t => t.task.name === taskName);

    if (taskToCancel) {
      // Mark as cancelled
      this.cancelledTasks.add(taskToCancel.id);
      this.updateTaskList(
        taskList.filter(t => t.id !== taskToCancel.id),
        taskName,
      );
    }
  }

  isTaskCancelled(taskId: string): boolean {
    return this.cancelledTasks.has(taskId);
  }

  pause() {
    if (this.isRunning) {
      BackgroundService.stop();
    }
  }

  resume() {
    if (!this.isRunning) {
      this.start();
    }
  }

  async applyDownloadLimits() {
    try {
      const maxConcurrency =
        MMKVStorage.getNumber('DOWNLOAD_MAX_SIMULTANEOUS') || 3;
      const maxPerPlugin =
        MMKVStorage.getNumber('DOWNLOAD_MAX_PER_PLUGIN') || 1;
      const delayMs =
        MMKVStorage.getNumber('DOWNLOAD_DELAY_SAME_PLUGIN_MS') || 1000;
      const NativeDownloader: any =
        Platform.OS === 'android'
          ? TurboModuleRegistry.get('NativeDownloader')
          : null;
      if (
        NativeDownloader &&
        typeof NativeDownloader.setLimits === 'function'
      ) {
        await NativeDownloader.setLimits(
          Math.max(0, maxConcurrency),
          Math.max(0, maxPerPlugin),
          Math.max(0, delayMs),
        );
      }
    } catch (e) {}
  }

  stop() {
    if (this.isRunning) {
      BackgroundService.stop();
    }
    this.clearTaskList();
  }
}
