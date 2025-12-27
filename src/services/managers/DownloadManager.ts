import {
  BackgroundTaskMetadata,
  DownloadChapterTask,
  DownloadNovelTask,
  QueuedBackgroundTask,
} from '../ServiceManager';
import { TaskTypes } from '../TaskTypes';
import { NetworkSettings } from '../NetworkSettings';
import { getNovelChapters } from '@database/queries/ChapterQueries';
import { ChapterInfo } from '@database/types';
import { downloadChapter } from '../download/downloadChapter';

export class DownloadManager {
  private static instance?: DownloadManager;

  // Runtime state
  activeDownloads: Set<string> = new Set();
  private pluginRunningCount = new Map<string, number>();
  private pluginNextAllowedTime = new Map<string, number>();
  lastNotificationTime = 0;

  // Stats
  skippedDownloads = 0;
  completedDownloadsCount = 0;
  failedDownloads: string[] = [];
  totalExpectedDownloads = 0;

  private constructor() {}

  static get manager() {
    if (!this.instance) {
      this.instance = new DownloadManager();
    }
    return this.instance;
  }

  reset() {
    this.activeDownloads.clear();
    this.pluginRunningCount.clear();
    this.pluginNextAllowedTime.clear();
    this.skippedDownloads = 0;
    this.completedDownloadsCount = 0;
    this.failedDownloads = [];
    this.totalExpectedDownloads = 0;
  }

  /**
   * Processes a DOWNLOAD_NOVEL task to generate DOWNLOAD_CHAPTER tasks.
   * Returns the updated task data and whether the task is complete.
   */
  async processNovelTask(
    task: QueuedBackgroundTask & { task: DownloadNovelTask },
    currentQueue: QueuedBackgroundTask[],
  ): Promise<{
    updatedTaskData: DownloadNovelTask['data'];
    isComplete: boolean;
    newTasks: DownloadChapterTask[];
  }> {
    const taskData = { ...task.task.data };
    const {
      novelId,
      pluginId,
      novelName,
      novelCover,
      mode,
      chapters: requestedChapterIds,
    } = taskData;

    // Initialize if needed
    if (!taskData.pendingChapterIds) {
      const allChapters = await getNovelChapters(novelId);
      let chaptersToDownload: ChapterInfo[];

      if (requestedChapterIds && requestedChapterIds.length > 0) {
        chaptersToDownload = allChapters.filter(
          c => requestedChapterIds.includes(c.id) && !c.isDownloaded,
        );
      } else if (mode === 'unread') {
        chaptersToDownload = allChapters.filter(
          c => c.unread && !c.isDownloaded,
        );
      } else {
        chaptersToDownload = allChapters.filter(c => !c.isDownloaded);
      }

      taskData.pendingChapterIds = chaptersToDownload.map(c => c.id);
      taskData.totalCount = taskData.pendingChapterIds.length;
      taskData.completedCount = 0;
      taskData.failedChapterIds = [];

      // Update global stats
      this.totalExpectedDownloads += taskData.totalCount;
    }

    // Calculate batching
    const existingChapterTasks = currentQueue.filter(
      t =>
        t.task.name === TaskTypes.DOWNLOAD_CHAPTER &&
        (t.task as DownloadChapterTask).data.novelId === novelId,
    );

    const chaptersInQueueOrActive = new Set<number>();
    existingChapterTasks.forEach(t => {
      chaptersInQueueOrActive.add(
        (t.task as DownloadChapterTask).data.chapterId,
      );
    });
    this.activeDownloads.forEach(taskId => {
      const activeTask = currentQueue.find(t => t.id === taskId);
      if (activeTask && activeTask.task.name === TaskTypes.DOWNLOAD_CHAPTER) {
        chaptersInQueueOrActive.add(
          (activeTask.task as DownloadChapterTask).data.chapterId,
        );
      }
    });

    const actuallyPending = (taskData.pendingChapterIds || []).filter(
      id => !chaptersInQueueOrActive.has(id),
    );

    const pluginSettings = NetworkSettings.pluginSettings[pluginId] || {};
    const maxPerPlugin =
      pluginSettings.maxConcurrentTasks ?? NetworkSettings.maxPerPlugin;
    const maxConcurrency = NetworkSettings.maxConcurrency;

    const pluginTasksInQueue = currentQueue.filter(
      t =>
        t.task.name === TaskTypes.DOWNLOAD_CHAPTER &&
        (t.task as DownloadChapterTask).data.pluginId === pluginId,
    ).length;

    const targetQueueSize = Math.min(maxPerPlugin * 2, maxConcurrency);
    const availableSlots = Math.max(0, targetQueueSize - pluginTasksInQueue);
    const chaptersToAdd = Math.min(availableSlots, actuallyPending.length);

    let newTasks: DownloadChapterTask[] = [];

    if (chaptersToAdd > 0) {
      const allChapters = await getNovelChapters(novelId);
      const chapterMap = new Map(allChapters.map(c => [c.id, c]));

      // Filter out any chapters that got downloaded in the meantime
      const chaptersStillToDownload = actuallyPending
        .slice(0, chaptersToAdd)
        .filter(chapterId => {
          const chapter = chapterMap.get(chapterId);
          if (chapter?.isDownloaded) {
            return false;
          }
          return true;
        });

      newTasks = chaptersStillToDownload.map(chapterId => {
        const chapter = chapterMap.get(chapterId);
        return {
          name: TaskTypes.DOWNLOAD_CHAPTER,
          data: {
            chapterId,
            novelId,
            pluginId,
            novelName,
            chapterName: chapter?.name || `Chapter ${chapterId}`,
            novelCover,
          },
        };
      });

      // Update pending list to remove any chapters that were already downloaded
      taskData.pendingChapterIds = (taskData.pendingChapterIds || []).filter(
        id => {
          const chapter = chapterMap.get(id);
          return !chapter?.isDownloaded;
        },
      );
    }

    const isComplete =
      actuallyPending.length === 0 && existingChapterTasks.length === 0;

    return {
      updatedTaskData: taskData,
      isComplete,
      newTasks,
    };
  }

  /**
   * Determines if a download task can start based on concurrency and throttling rules.
   */
  canStartDownload(
    task: QueuedBackgroundTask & { task: DownloadChapterTask },
    pausedPlugins: Set<string>,
    pausedNovels: Set<number>,
  ): { canStart: boolean; reason?: string } {
    const data = task.task.data;

    if (this.activeDownloads.has(task.id)) {
      return { canStart: false, reason: 'Already running' };
    }

    if (pausedPlugins.has(data.pluginId)) {
      return { canStart: false, reason: `Plugin ${data.pluginId} is paused` };
    }
    if (pausedNovels.has(data.novelId)) {
      return { canStart: false, reason: `Novel ${data.novelId} is paused` };
    }

    const pluginSettings = NetworkSettings.pluginSettings[data.pluginId] || {};
    const maxPerPlugin =
      pluginSettings.maxConcurrentTasks ?? NetworkSettings.maxPerPlugin;
    const pluginCount = this.pluginRunningCount.get(data.pluginId) ?? 0;

    if (pluginCount >= maxPerPlugin) {
      return {
        canStart: false,
        reason: `Plugin limit reached (${pluginCount}/${maxPerPlugin})`,
      };
    }

    const nextAllowed = this.pluginNextAllowedTime.get(data.pluginId);
    if (nextAllowed && Date.now() < nextAllowed) {
      return { canStart: false, reason: 'Plugin delay active' };
    }

    return { canStart: true };
  }

  /**
   * Marks a download as started.
   */
  startDownload(taskId: string, pluginId: string) {
    this.activeDownloads.add(taskId);
    this.pluginRunningCount.set(
      pluginId,
      (this.pluginRunningCount.get(pluginId) ?? 0) + 1,
    );

    // Calculate next allowed time
    const pluginSettings = NetworkSettings.pluginSettings[pluginId] || {};
    const baseDelay = pluginSettings.taskDelay ?? NetworkSettings.delaySamePlugin;
    const randomRange =
      pluginSettings.randomDelayRange ?? NetworkSettings.randomDelayRange;

    let delay = baseDelay;
    if (randomRange && randomRange.max > randomRange.min) {
      delay +=
        Math.floor(Math.random() * (randomRange.max - randomRange.min + 1)) +
        randomRange.min;
    }

    this.pluginNextAllowedTime.set(pluginId, Date.now() + delay);
  }

  /**
   * Marks a download as finished.
   */
  finishDownload(
    taskId: string,
    pluginId: string,
    success: boolean,
    skipped: boolean,
  ) {
    this.activeDownloads.delete(taskId);
    this.pluginRunningCount.set(
      pluginId,
      Math.max(0, (this.pluginRunningCount.get(pluginId) ?? 1) - 1),
    );

    if (skipped) {
      this.skippedDownloads++;
    } else if (success) {
      this.completedDownloadsCount++;
    }
  }

  /**
   * Executes the download logic.
   */
  async executeDownload(
    task: DownloadChapterTask,
    setMeta: (
      transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
    ) => void,
  ) {
    return downloadChapter(task.data, setMeta);
  }

  /**
   * Reconciles the internal state with the current queue.
   * This ensures that pluginRunningCount is accurate even if tasks were removed unexpectedly.
   */
  reconcileState(currentQueue: QueuedBackgroundTask[]) {
    // Rebuild pluginRunningCount from activeDownloads
    this.pluginRunningCount.clear();
    const activeIds = Array.from(this.activeDownloads);

    for (const taskId of activeIds) {
      const task = currentQueue.find(t => t.id === taskId);
      if (task && task.task.name === TaskTypes.DOWNLOAD_CHAPTER) {
        const pluginId = (task.task as DownloadChapterTask).data.pluginId;
        this.pluginRunningCount.set(
          pluginId,
          (this.pluginRunningCount.get(pluginId) || 0) + 1,
        );
      } else {
        // Task is in activeDownloads but not in queue (or not a download chapter)
        // This shouldn't happen normally, but if it does, remove it from activeDownloads
        this.activeDownloads.delete(taskId);
      }
    }
  }
}
