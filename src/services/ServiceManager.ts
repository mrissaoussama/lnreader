import BackgroundService from 'react-native-background-actions';
import * as Notifications from 'expo-notifications';
import NetInfo from '@react-native-community/netinfo';
import { DeviceEventEmitter, Platform, AppState } from 'react-native';

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
import { updateNovel } from './updates/LibraryUpdateQueries';
import { getNovelById } from '@database/queries/NovelQueries';

import { createBackup, restoreBackup } from './backup/local';
import { addCancelledChapter } from './download/cancelRegistry';
import { TTSService } from './TTS/TTSService';

import { NetworkSettings } from './NetworkSettings';
import { TaskTypes, TaskType } from './TaskTypes';
import { ChapterInfo } from '@database/types';
import { NotificationManager } from './managers/NotificationManager';
import { DownloadManager } from './managers/DownloadManager';

export type BackgroundTask =
  | {
      name: typeof TaskTypes.IMPORT_EPUB;
      data: {
        filename: string;
        uri: string;
      };
    }
  | {
      name: typeof TaskTypes.TTS;
      data: {
        chapter: ChapterInfo;
        text: string;
        options: any;
      };
    }
  | {
      name: typeof TaskTypes.UPDATE_LIBRARY;
      data?: {
        categoryId?: number;
        categoryName?: string;
      };
    }
  | { name: typeof TaskTypes.DRIVE_BACKUP; data: DriveFile }
  | { name: typeof TaskTypes.DRIVE_RESTORE; data: DriveFile }
  | { name: typeof TaskTypes.SELF_HOST_BACKUP; data: SelfHostData }
  | { name: typeof TaskTypes.SELF_HOST_RESTORE; data: SelfHostData }
  | {
      name: typeof TaskTypes.LOCAL_BACKUP;
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
      name: typeof TaskTypes.LOCAL_RESTORE;
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
  | { name: typeof TaskTypes.MIGRATE_NOVEL; data: MigrateNovelData }
  | {
      name: typeof TaskTypes.MASS_IMPORT;
      data: { urls: string[]; delay?: number };
    }
  | { name: typeof TaskTypes.UPDATE_SELECTED; data: { novelIds: number[] } }
  | {
      name: typeof TaskTypes.SYNC_FROM_TRACKERS;
      data?: { forceUpdate?: boolean };
    }
  | {
      name: typeof TaskTypes.SYNC_TO_TRACKERS;
      data?: { forceUpdate?: boolean };
    }
  | {
      name: typeof TaskTypes.SYNC_ALL_TRACKERS;
      data?: { forceUpdate?: boolean };
    }
  | DownloadChapterTask
  | DownloadNovelTask;

export type DownloadChapterTask = {
  name: typeof TaskTypes.DOWNLOAD_CHAPTER;
  data: {
    chapterId: number;
    novelId: number;
    pluginId: string;
    novelName: string;
    chapterName: string;
    novelCover?: string;
  };
};

export type DownloadNovelTask = {
  name: typeof TaskTypes.DOWNLOAD_NOVEL;
  data: {
    novelId: number;
    pluginId: string;
    novelName: string;
    novelCover?: string;
    mode?: 'all' | 'unread';
    chapters?: number[]; // Specific chapter IDs to download (optional)
    // Runtime state - managed internally during download
    pendingChapterIds?: number[]; // Chapters waiting to be downloaded
    completedCount?: number; // Number of completed downloads
    totalCount?: number; // Total chapters to download
    failedChapterIds?: number[]; // Chapters that failed (for potential retry)
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
  private static instance?: ServiceManager;
  private listeners: { [key: string]: TaskListListener[] } = {};
  private globalListeners: TaskListListener[] = [];
  private cancelledTasks: Set<string> = new Set();

  private pendingTaskListUpdate: NodeJS.Timeout | null = null;
  private batchedTaskList: QueuedBackgroundTask[] | null = null;
  private appStateListener: ((state: string) => void) | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private isStopping = false;
  private isPaused = false;
  private resumeTimeout: NodeJS.Timeout | null = null;

  private isReadingSessionActive = false;

  private constructor() {
    NetInfo.addEventListener(state => {
      if (
        state.type === 'wifi' &&
        NetworkSettings.resumeOnWifiOnly &&
        !this.isRunning
      ) {
        this.resume();
      }
    });

    DeviceEventEmitter.addListener('backgroundAction', (actionId: string) => {
      if (actionId === 'pause') {
        this.pause();
      } else if (actionId === 'resume') {
        this.resume();
      } else if (actionId === 'cancel') {
        this.stop();
      }
    });
  }

  static get manager() {
    if (!this.instance) {
      this.instance = new ServiceManager();
    }
    return this.instance;
  }

  private notifyListeners(taskName?: TaskType) {
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
    notifyTaskName?: TaskType,
  ) {
    // Batch MMKV writes to reduce ANR - only write every 300ms max
    this.batchedTaskList = tasks;

    if (this.pendingTaskListUpdate) {
      // Already scheduled, just update the batched list
      return;
    }

    this.pendingTaskListUpdate = setTimeout(() => {
      if (this.batchedTaskList) {
        setMMKVObject(this.STORE_KEY, this.batchedTaskList);
        this.pendingTaskListUpdate = null;

        // For DOWNLOAD_CHAPTER, notify global listeners (TaskQueue) but not specific task listeners
        // This prevents library from re-fetching when chapters download
        if (notifyTaskName === TaskTypes.DOWNLOAD_CHAPTER) {
          // Only notify global listeners (TaskQueue screen)
          for (const listener of this.globalListeners) {
            listener(this.batchedTaskList);
          }
        } else {
          this.notifyListeners(notifyTaskName);
        }
      }
    }, 300);
  }

  // Force immediate write (for critical operations)
  private flushTaskList() {
    if (this.pendingTaskListUpdate) {
      clearTimeout(this.pendingTaskListUpdate);
      this.pendingTaskListUpdate = null;
    }
    if (this.batchedTaskList) {
      setMMKVObject(this.STORE_KEY, this.batchedTaskList);

      // CRITICAL: Notify listeners immediately when flushing
      // This ensures the UI updates when tasks are removed
      for (const listener of this.globalListeners) {
        listener(this.batchedTaskList);
      }

      this.batchedTaskList = null;
    }
  }

  get isRunning() {
    return BackgroundService.isRunning();
  }

  isMultiplicableTask(task: BackgroundTask) {
    return (
      [
        TaskTypes.DOWNLOAD_CHAPTER,
        TaskTypes.DOWNLOAD_NOVEL,
        TaskTypes.IMPORT_EPUB,
        TaskTypes.MIGRATE_NOVEL,
        TaskTypes.MASS_IMPORT,
      ] as Array<BackgroundTask['name']>
    ).includes(task.name);
  }

  async start() {
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout);
      this.resumeTimeout = null;
    }
    if (!this.isRunning) {
      this.isStopping = false;
      // On Android 13+, ensure we only request permission when app is active (Activity attached)
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        if (AppState.currentState !== 'active') {
          if (!this.appStateListener) {
            this.appStateListener = (state: string) => {
              if (state === 'active') {
                // Detach and retry start once
                if (this.appStateSubscription) {
                  this.appStateSubscription.remove();
                  this.appStateSubscription = null;
                }
                this.appStateListener = null;
                // Retry starting service (will request permission now)
                this.start();
              }
            };
            this.appStateSubscription = AppState.addEventListener(
              'change',
              this.appStateListener,
            );
          }
          return; // Defer start until active
        }
      }

      const notificationsAllowed = await askForPostNotificationsPermission();
      if (!notificationsAllowed) return;
      // Ensure high-importance channel on Android
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('app_services', {
            name: 'Background Tasks',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [250],
            lightColor: '#00adb5',
          });
        }
      } catch {}

      // Reset managers
      NotificationManager.manager.reset();
      DownloadManager.manager.reset();

      NotificationManager.manager.setDefaultActions([
        {
          id: 'pause',
          text: getString('common.pause'),
          icon: { name: 'notification_icon', type: 'drawable' },
        },
        {
          id: 'cancel',
          text: getString('common.cancel'),
          icon: { name: 'notification_icon', type: 'drawable' },
        },
      ]);

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
        actions: [
          {
            id: 'pause',
            text: getString('common.pause'),
            icon: { name: 'notification_icon', type: 'drawable' },
          },
          {
            id: 'cancel',
            text: getString('common.cancel'),
            icon: { name: 'notification_icon', type: 'drawable' },
          },
        ],
      }).catch(error => {
        Notifications.scheduleNotificationAsync({
          content: {
            title: getString('backupScreen.drive.backupInterruped'),
            body: error.message,
          },
          trigger: null,
          channelId: Platform.OS === 'android' ? 'app_services' : undefined,
        });
        BackgroundService.stop();
      });
    }
  }

  setTaskMeta(
    taskId: string,
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) {
    const taskList = [...this.getTaskList()];
    const taskIndex = taskList.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      return;
    }
    const task = taskList[taskIndex];
    const taskName = task.task.name;

    taskList[taskIndex] = {
      ...task,
      meta: transformer(task.meta),
    };

    // Only update notification if it's the first task AND not a download chapter/novel task
    // (Download notifications are handled by the main loop)
    if (
      taskIndex === 0 &&
      taskList[0].meta.isRunning &&
      taskList[0].task.name !== TaskTypes.DOWNLOAD_CHAPTER &&
      taskList[0].task.name !== TaskTypes.DOWNLOAD_NOVEL
    ) {
      NotificationManager.manager.update(
        taskList[0].meta.name,
        taskList[0].meta.progressText ?? '',
        taskList[0].meta.progress,
      );
    }

    this.updateTaskList(taskList, taskName);
  }

  setMeta(
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) {
    // Legacy support - updates the first task
    const taskList = this.getTaskList();
    if (taskList.length > 0) {
      this.setTaskMeta(taskList[0].id, transformer);
    }
  }

  getProgressForNotification(
    currentTask: QueuedBackgroundTask,
    startingTasks: QueuedBackgroundTask[],
  ) {
    let i = null;
    let count = 0;
    for (const task of startingTasks) {
      if (
        task.task.name === TaskTypes.DOWNLOAD_CHAPTER &&
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
    const setMeta = (
      transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
    ) => this.setTaskMeta(task.id, transformer);

    const progress =
      task.task.name === TaskTypes.DOWNLOAD_CHAPTER
        ? this.getProgressForNotification(task, startingTasks)
        : null;

    if (
      task.task.name !== TaskTypes.DOWNLOAD_NOVEL &&
      task.task.name !== TaskTypes.DOWNLOAD_CHAPTER
    ) {
      NotificationManager.manager.update(
        task.meta.name,
        task.meta.progressText ?? '',
        progress ?? undefined,
      );
    }

    switch (task.task.name) {
      case TaskTypes.IMPORT_EPUB:
        return importEpub(task.task.data, setMeta);
      case TaskTypes.UPDATE_LIBRARY:
        const result = await updateLibrary(
          task.task.data || {},
          setMeta,
          () => this.isTaskCancelled(task.id),
          () => this.isPaused,
        );
        return result;
      case TaskTypes.DRIVE_BACKUP:
        return createDriveBackup(task.task.data, setMeta);
      case TaskTypes.DRIVE_RESTORE:
        return driveRestore(task.task.data, setMeta);
      case TaskTypes.SELF_HOST_BACKUP:
        return createSelfHostBackup(task.task.data, setMeta);
      case TaskTypes.SELF_HOST_RESTORE:
        return selfHostRestore(task.task.data, setMeta);
      case TaskTypes.LOCAL_BACKUP:
        return createBackup(
          task.task.data.includeDownloads,
          setMeta,
          task.task.data.directoryUri,
          {
            includeCovers: task.task.data.includeCovers,
            includeChapters: task.task.data.includeChapters,
            includeSettings: task.task.data.includeSettings,
            includeRepositories: task.task.data.includeRepositories,
            includePlugins: task.task.data.includePlugins,
          },
        );
      case TaskTypes.LOCAL_RESTORE:
        return restoreBackup(
          task.task.data.includeDownloads,
          setMeta,
          task.task.data.backupFile,
          {
            includeCovers: task.task.data.includeCovers,
            includeChapters: task.task.data.includeChapters,
            includeSettings: task.task.data.includeSettings,
            includeRepositories: task.task.data.includeRepositories,
            includePlugins: task.task.data.includePlugins,
          },
        );
      case TaskTypes.MIGRATE_NOVEL:
        return migrateNovel(task.task.data, setMeta);
      case TaskTypes.DOWNLOAD_CHAPTER:
        if (!task.task.data) {
          // eslint-disable-next-line no-console
          console.warn(
            '[ServiceManager] Missing data for DOWNLOAD_CHAPTER task:',
            task.id,
          );
          return { skipped: true };
        }
        return downloadChapter(task.task.data, setMeta);
      case TaskTypes.DOWNLOAD_NOVEL: {
        if (!task.task.data) {
          // eslint-disable-next-line no-console
          console.warn(
            '[ServiceManager] Missing data for DOWNLOAD_NOVEL task:',
            task.id,
          );
          return { isComplete: true };
        }
        const currentQueue = this.getTaskList();
        const { updatedTaskData, isComplete, newTasks } =
          await DownloadManager.manager.processNovelTask(
            task as QueuedBackgroundTask & { task: DownloadNovelTask },
            currentQueue,
          );

        // Update the local task object so it can be saved back to storage
        (task.task as DownloadNovelTask).data = updatedTaskData;

        if (newTasks.length > 0) {
          this.addTask(newTasks);
          // Flush immediately so next novel task sees updated queue
          this.flushTaskList();
        }

        // Update progress
        const { completedCount, totalCount } = updatedTaskData;
        const novelProgress =
          (totalCount || 0) > 0 ? (completedCount || 0) / (totalCount || 1) : 0;

        setMeta(meta => ({
          ...meta,
          isRunning: !isComplete,
          progress: novelProgress,
          progressText: `${completedCount}/${totalCount} chapters`,
        }));

        // Return state for the task
        return {
          added: newTasks.length,
          pending:
            (updatedTaskData.pendingChapterIds?.length || 0) - newTasks.length,
          completed: completedCount,
          total: totalCount,
          isComplete,
        };
      }
      case TaskTypes.MASS_IMPORT: {
        const data = task.task.data;
        const massImportData: { urls: string[]; delay: number } =
          data &&
          typeof data === 'object' &&
          Array.isArray(data.urls) &&
          typeof data.delay === 'number'
            ? (data as { urls: string[]; delay: number })
            : { urls: [], delay: 500 };
        return massImport(massImportData, setMeta, task.id);
      }
      case TaskTypes.UPDATE_SELECTED: {
        const ids = Array.isArray(task.task.data?.novelIds)
          ? task.task.data.novelIds
          : [];
        const options = {
          downloadNewChapters: NetworkSettings.downloadNewChapters,
          refreshNovelMetadata: NetworkSettings.refreshNovelMetadata,
        };
        let processed = 0;
        for (const id of ids) {
          if (this.isTaskCancelled(task.id)) break;
          try {
            const novel = await getNovelById(id);
            if (novel) {
              await updateNovel(novel.pluginId, novel.path, novel.id, options);
            }
          } catch (e) {}
          processed += 1;
          setMeta(meta => ({
            ...meta,
            progress: ids.length ? processed / ids.length : undefined,
            progressText: `${processed}/${ids.length} novels`,
          }));
        }
        setMeta(meta => ({ ...meta, isRunning: false, progress: 1 }));
        return { processed };
      }
      case TaskTypes.SYNC_FROM_TRACKERS: {
        const data = task.task.data;
        const forceUpdate = data?.forceUpdate || false;
        const results = await ProgressSyncService.syncFromTrackers(
          syncProgress => {
            setMeta(meta => ({
              ...meta,
              progress: syncProgress.processed / syncProgress.total,
              progressText: `Syncing ${syncProgress.currentNovel} (${syncProgress.processed}/${syncProgress.total})`,
            }));
          },
          forceUpdate,
        );
        setMeta(meta => ({
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
      case TaskTypes.SYNC_TO_TRACKERS: {
        const data = task.task.data;
        const forceUpdate = data?.forceUpdate || false;
        const results = await ProgressSyncService.syncToTrackers(
          syncProgress => {
            setMeta(meta => ({
              ...meta,
              progress: syncProgress.processed / syncProgress.total,
              progressText: `Syncing ${syncProgress.currentNovel} (${syncProgress.processed}/${syncProgress.total})`,
            }));
          },
          forceUpdate,
        );
        setMeta(meta => ({
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
      case TaskTypes.SYNC_ALL_TRACKERS: {
        const data = task.task.data;
        const forceUpdate = data?.forceUpdate || false;
        const results = await ProgressSyncService.syncAllTrackers(
          syncProgress => {
            setMeta(meta => ({
              ...meta,
              progress: syncProgress.processed / syncProgress.total,
              progressText: `Syncing ${syncProgress.currentNovel} (${syncProgress.processed}/${syncProgress.total})`,
            }));
          },
          forceUpdate,
        );
        setMeta(meta => ({
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
      case TaskTypes.TTS:
        return TTSService.play(task.task.data, setMeta);
    }
  }

  static async launch() {
    const manager = ServiceManager.manager;

    // Ensure default actions are set (fix for Headless JS/Background)
    NotificationManager.manager.setDefaultActions([
      {
        id: 'pause',
        text: getString('common.pause'),
        icon: { name: 'notification_icon', type: 'drawable' },
      },
      {
        id: 'cancel',
        text: getString('common.cancel'),
        icon: { name: 'notification_icon', type: 'drawable' },
      },
    ]);

    const doneTasks: Record<BackgroundTask['name'], number> = {
      [TaskTypes.IMPORT_EPUB]: 0,
      [TaskTypes.UPDATE_LIBRARY]: 0,
      [TaskTypes.DRIVE_BACKUP]: 0,
      [TaskTypes.DRIVE_RESTORE]: 0,
      [TaskTypes.SELF_HOST_BACKUP]: 0,
      [TaskTypes.SELF_HOST_RESTORE]: 0,
      [TaskTypes.LOCAL_BACKUP]: 0,
      [TaskTypes.LOCAL_RESTORE]: 0,
      [TaskTypes.MIGRATE_NOVEL]: 0,
      [TaskTypes.DOWNLOAD_CHAPTER]: 0,
      [TaskTypes.DOWNLOAD_NOVEL]: 0,
      [TaskTypes.MASS_IMPORT]: 0,
      [TaskTypes.SYNC_FROM_TRACKERS]: 0,
      [TaskTypes.SYNC_TO_TRACKERS]: 0,
      [TaskTypes.SYNC_ALL_TRACKERS]: 0,
    };

    const sleep = (ms: number) =>
      new Promise(resolve => setTimeout(resolve, ms + Math.random() * 100));

    // Download management state
    const maxConcurrency = NetworkSettings.maxConcurrency;

    // Helper to get paused items from storage
    const getPausedSets = () => {
      let pausedPlugins: Set<string> = new Set();
      let pausedNovels: Set<number> = new Set();
      try {
        const pluginsStr = MMKVStorage.getString('DOWNLOAD_PAUSED_PLUGINS');
        if (pluginsStr) {
          pausedPlugins = new Set(JSON.parse(pluginsStr));
        }
      } catch {}
      try {
        const novelsStr = MMKVStorage.getString('DOWNLOAD_PAUSED_NOVELS');
        if (novelsStr) {
          pausedNovels = new Set(JSON.parse(novelsStr));
        }
      } catch {}
      return { pausedPlugins, pausedNovels };
    };

    const startingTasks = manager.getTaskList();
    const tasksSet = new Set(startingTasks.map(t => t.id));

    // Calculate initial total: chapter tasks + chapters from novel tasks
    const initialChapterTasks = startingTasks.filter(
      t => t.task.name === TaskTypes.DOWNLOAD_CHAPTER,
    ) as Array<QueuedBackgroundTask & { task: DownloadChapterTask }>;
    const novelTasks = startingTasks.filter(
      t => t.task.name === TaskTypes.DOWNLOAD_NOVEL,
    ) as Array<QueuedBackgroundTask & { task: DownloadNovelTask }>;

    const novelIdsWithDownloadTask = new Set(
      novelTasks.map(t => t.task.data.novelId),
    );

    // Sum up expected chapters from DOWNLOAD_NOVEL tasks
    let novelChaptersTotal = 0;
    let novelChaptersCompleted = 0;
    for (const nt of novelTasks) {
      const data = nt.task.data;
      if (data.totalCount !== undefined) {
        novelChaptersTotal += data.totalCount;
        novelChaptersCompleted += data.completedCount || 0;
      }
    }

    // Count independent chapter tasks (those not covered by a novel task)
    let independentChapterTasksCount = 0;
    for (const ct of initialChapterTasks) {
      if (!novelIdsWithDownloadTask.has(ct.task.data.novelId)) {
        independentChapterTasksCount++;
      }
    }

    DownloadManager.manager.totalExpectedDownloads =
      independentChapterTasksCount + novelChaptersTotal;
    DownloadManager.manager.completedDownloadsCount = novelChaptersCompleted;

    while (BackgroundService.isRunning()) {
      if (manager.isPaused) {
        NotificationManager.manager.update(
          'App Service',
          getString('common.paused'),
          undefined,
          true,
        );
        await sleep(1000);
        continue;
      }

      // Flush any pending updates before reading queue to avoid stale data
      manager.flushTaskList();

      // Small delay to allow any pending addTask operations to complete
      await sleep(50);

      const queue = manager.getTaskList();

      // Reconcile DownloadManager state with current queue
      DownloadManager.manager.reconcileState(queue);

      const hasPendingDownloads =
        DownloadManager.manager.activeDownloads.size > 0 ||
        queue.some(t => t.task.name === TaskTypes.DOWNLOAD_CHAPTER);

      if (queue.length === 0 && !hasPendingDownloads) {
        if (manager.isReadingSessionActive) {
          NotificationManager.manager.update(
            'Reading',
            'App is running in background',
            undefined,
          );
          await sleep(1000);
          continue;
        }
        break;
      }

      // Add any newly queued tasks to the starting tasks list
      const newTasks = queue.filter(t => !tasksSet.has(t.id));

      startingTasks.push(...newTasks);
      newTasks.forEach(t => tasksSet.add(t.id));

      // Separate download and non-download tasks
      // DOWNLOAD_NOVEL is handled specially - it expands into DOWNLOAD_CHAPTER tasks
      const nonDownloadTask = queue.find(
        t =>
          t.task.name !== TaskTypes.DOWNLOAD_CHAPTER &&
          t.task.name !== TaskTypes.DOWNLOAD_NOVEL,
      );

      // Handle DOWNLOAD_NOVEL tasks - they stay in queue and manage chapter batches
      const downloadNovelTasks = queue.filter(
        t => t.task.name === TaskTypes.DOWNLOAD_NOVEL,
      ) as Array<QueuedBackgroundTask & { task: DownloadNovelTask }>;

      // Process ALL DOWNLOAD_NOVEL tasks, not just the first one
      for (const downloadNovelTask of downloadNovelTasks) {
        // Execute DOWNLOAD_NOVEL to replenish chapter batch if needed
        try {
          const result = await manager.executeTask(
            downloadNovelTask,
            startingTasks,
          );

          // Update totalExpectedDownloads if this novel task just initialized
          // Note: DownloadManager.processNovelTask already updates totalExpectedDownloads
          // so we don't need to do it here to avoid double counting

          // Check if all chapters are complete
          if (result?.isComplete) {
            // All chapters downloaded - remove the DOWNLOAD_NOVEL task
            if (doneTasks[TaskTypes.DOWNLOAD_NOVEL] !== undefined) {
              doneTasks[TaskTypes.DOWNLOAD_NOVEL] += 1;
            }
            manager.flushTaskList();
            const updatedQueue = manager.getTaskList();
            const filtered = updatedQueue.filter(
              t => t.id !== downloadNovelTask.id,
            );
            manager.updateTaskList(filtered, TaskTypes.DOWNLOAD_NOVEL);
            manager.flushTaskList();
          } else {
            // Update the task data in queue with new state
            manager.flushTaskList();
            const updatedQueue = manager.getTaskList();
            const taskIndex = updatedQueue.findIndex(
              t => t.id === downloadNovelTask.id,
            );
            if (taskIndex >= 0) {
              // Update the task in the fresh queue with the modified data
              if (
                updatedQueue[taskIndex].task.name === TaskTypes.DOWNLOAD_NOVEL
              ) {
                (updatedQueue[taskIndex].task as any).data =
                  downloadNovelTask.task.data;
              }
              manager.updateTaskList(updatedQueue, TaskTypes.DOWNLOAD_NOVEL);
            }
          }
        } catch (error: any) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: downloadNovelTask.meta.name,
              body: error?.message || String(error),
            },
            trigger: null,
            channelId: Platform.OS === 'android' ? 'app_services' : undefined,
          });
          // On error, remove the task
          manager.flushTaskList();
          const updatedQueue = manager.getTaskList();
          const filtered = updatedQueue.filter(
            t => t.id !== downloadNovelTask.id,
          );
          manager.updateTaskList(filtered, TaskTypes.DOWNLOAD_NOVEL);
          manager.flushTaskList();
        }
        // Don't continue - let download chapter processing happen
      }

      // Check Wi-Fi constraint for downloads
      if (NetworkSettings.resumeOnWifiOnly) {
        const state = await NetInfo.fetch();
        if (state.type !== 'wifi' && !nonDownloadTask) {
          if (DownloadManager.manager.activeDownloads.size === 0) {
            // Stop service if only downloads remain and we are not on Wi-Fi
            // The NetInfo listener in constructor will resume when Wi-Fi connects
            break;
          }
          // If downloads are running, let them finish (or we could stop them?)
          // For now, let's just prevent new ones from starting
        }
      }

      // Process non-download tasks with priority
      if (nonDownloadTask) {
        NotificationManager.manager.update(
          nonDownloadTask.meta.name,
          nonDownloadTask.meta.progressText ?? '',
          nonDownloadTask.meta.progress,
        );

        try {
          await manager.executeTask(nonDownloadTask, startingTasks);
          if (doneTasks[nonDownloadTask.task.name] !== undefined) {
            doneTasks[nonDownloadTask.task.name] += 1;
          }
        } catch (error: any) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: nonDownloadTask.meta.name,
              body: error?.message || String(error),
            },
            trigger: null,
            channelId: Platform.OS === 'android' ? 'app_services' : undefined,
          });
        } finally {
          // CRITICAL: Flush any pending updates before reading to ensure we have current state
          manager.flushTaskList();

          // Remove completed task
          const updatedQueue = manager.getTaskList();

          const filtered = updatedQueue.filter(
            t => t.id !== nonDownloadTask.id,
          );

          manager.updateTaskList(filtered, nonDownloadTask.task.name);
          manager.flushTaskList(); // Immediately write the removal
        }
        await sleep(100);
        continue;
      }

      // From here on, we only have download tasks
      const downloadQueue = queue.filter(
        t => t.task.name === TaskTypes.DOWNLOAD_CHAPTER,
      ) as Array<QueuedBackgroundTask & { task: DownloadChapterTask }>;

      if (downloadQueue.length === 0) {
        // If no non-download tasks are left, and no downloads, wait for running downloads before exiting
        if (DownloadManager.manager.activeDownloads.size === 0) {
          break;
        }
        await sleep(100);
        continue;
      }

      // Check if we can start more downloads
      if (DownloadManager.manager.activeDownloads.size >= maxConcurrency) {
        await sleep(100);
        continue;
      }

      if (NetworkSettings.resumeOnWifiOnly) {
        const state = await NetInfo.fetch();
        if (state.type !== 'wifi') {
          await sleep(1000);
          continue;
        }
      }

      const { pausedPlugins, pausedNovels } = getPausedSets();

      // Find next downloadable task
      let taskToStart:
        | (QueuedBackgroundTask & { task: DownloadChapterTask })
        | null = null;
      let skipReason = '';

      for (const task of downloadQueue) {
        const { canStart, reason } = DownloadManager.manager.canStartDownload(
          task,
          pausedPlugins,
          pausedNovels,
        );

        if (canStart) {
          taskToStart = task;
          break;
        } else {
          skipReason = reason || 'Unknown reason';
        }
      }

      if (!taskToStart && downloadQueue.length > 0 && skipReason) {
        // No task to start
      }

      if (taskToStart) {
        const task = taskToStart;

        DownloadManager.manager.startDownload(task.id, task.task.data.pluginId);

        // Execute download task asynchronously
        (async () => {
          try {
            const result = await manager.executeTask(task, startingTasks);
            if (result?.skipped) {
              DownloadManager.manager.finishDownload(
                task.id,
                task.task.data.pluginId,
                true,
                true,
              );
            } else {
              doneTasks.DOWNLOAD_CHAPTER++;
              DownloadManager.manager.finishDownload(
                task.id,
                task.task.data.pluginId,
                true,
                false,
              );
            }
          } catch (error: any) {
            DownloadManager.manager.failedDownloads.push(
              task.task.data.chapterName,
            );
            DownloadManager.manager.finishDownload(
              task.id,
              task.task.data.pluginId,
              false,
              false,
            );
          } finally {
            // Throttled notification update
            const now = Date.now();
            if (
              now - DownloadManager.manager.lastNotificationTime > 2000 ||
              DownloadManager.manager.activeDownloads.size === 0
            ) {
              DownloadManager.manager.lastNotificationTime = now;
              const displayTotal =
                DownloadManager.manager.totalExpectedDownloads > 0
                  ? DownloadManager.manager.totalExpectedDownloads
                  : DownloadManager.manager.completedDownloadsCount;

              NotificationManager.manager.update(
                'Downloads',
                `${DownloadManager.manager.completedDownloadsCount}/${displayTotal} chapters`,
                displayTotal > 0
                  ? DownloadManager.manager.completedDownloadsCount /
                      displayTotal
                  : 0,
              );
            }

            // Remove completed chapter task and update parent DOWNLOAD_NOVEL if exists
            const updatedQueue = manager.getTaskList();

            // Find and update parent DOWNLOAD_NOVEL task
            const parentNovelTask = updatedQueue.find(
              t =>
                t.task.name === TaskTypes.DOWNLOAD_NOVEL &&
                (t.task as DownloadNovelTask).data.novelId ===
                  task.task.data.novelId,
            ) as
              | (QueuedBackgroundTask & { task: DownloadNovelTask })
              | undefined;

            if (parentNovelTask) {
              const novelData = parentNovelTask.task.data;
              // Update completed count
              novelData.completedCount = (novelData.completedCount || 0) + 1;
              // Remove from pending
              if (novelData.pendingChapterIds) {
                novelData.pendingChapterIds =
                  novelData.pendingChapterIds.filter(
                    id => id !== task.task.data.chapterId,
                  );
              }
            }

            const filtered = updatedQueue.filter(t => t.id !== task.id);
            manager.updateTaskList(filtered, TaskTypes.DOWNLOAD_CHAPTER);
          }
        })();
      }

      await sleep(100); // Yield to event loop
    }

    // Wait for any remaining downloads to complete
    while (DownloadManager.manager.activeDownloads.size > 0) {
      await sleep(100);
    }

    // Final summary notification
    // Only show if we are NOT stopping due to reading session end or if we actually did something
    const hasDoneWork = Object.values(doneTasks).some(count => count > 0);

    if (hasDoneWork && !manager.isReadingSessionActive) {
      const summaryParts: string[] = [];

      Object.entries(doneTasks).forEach(([taskName, count]) => {
        if (count > 0) {
          summaryParts.push(
            `${getString(`notifications.${taskName as TaskType}`)}: ${count}`,
          );
        }
      });

      if (DownloadManager.manager.skippedDownloads > 0) {
        summaryParts.push(
          `Skipped (already downloaded): ${DownloadManager.manager.skippedDownloads}`,
        );
      }
      if (DownloadManager.manager.failedDownloads.length > 0) {
        summaryParts.push(
          `Failed: ${DownloadManager.manager.failedDownloads.length}`,
        );
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Background tasks done',
          body: summaryParts.join('\n') || 'All tasks completed',
        },
        trigger: null,
        channelId: Platform.OS === 'android' ? 'app_services' : undefined,
      });
    }

    manager.isStopping = true;
    BackgroundService.stop();
  }

  getTaskName(task: BackgroundTask) {
    switch (task.name) {
      case TaskTypes.DOWNLOAD_CHAPTER:
        return `Download ${task.data.novelName} [${task.data.pluginId}]`;
      case TaskTypes.DOWNLOAD_NOVEL:
        return `Download ${task.data.novelName} [${task.data.pluginId}]`;
      case TaskTypes.IMPORT_EPUB:
        return 'Import Epub ' + task.data.filename;
      case TaskTypes.MIGRATE_NOVEL:
        return 'Migrate Novel ' + task.data.fromNovel.name;
      case TaskTypes.UPDATE_LIBRARY:
        if (task.data !== undefined) {
          return 'Update Category ' + task.data.categoryName;
        }
        return 'Update Library';
      case TaskTypes.DRIVE_BACKUP:
        return 'Drive Backup';
      case TaskTypes.DRIVE_RESTORE:
        return 'Drive Restore';
      case TaskTypes.SELF_HOST_BACKUP:
        return 'Self Host Backup';
      case TaskTypes.SELF_HOST_RESTORE:
        return 'Self Host Restore';
      case TaskTypes.LOCAL_BACKUP:
        return 'Local Backup';
      case TaskTypes.LOCAL_RESTORE:
        return 'Local Restore';
      case TaskTypes.MASS_IMPORT:
        return 'Mass Import';
      case TaskTypes.UPDATE_SELECTED:
        return 'Update Selected Novels';
      case TaskTypes.SYNC_FROM_TRACKERS:
        return 'Sync from Trackers';
      case TaskTypes.SYNC_TO_TRACKERS:
        return 'Sync to Trackers';
      case TaskTypes.SYNC_ALL_TRACKERS:
        return 'Sync All Trackers';
      case TaskTypes.TTS:
        return 'TTS: ' + task.data.chapter.name;
      default:
        return 'Unknown Task';
    }
  }

  private getTaskListFromStorage(): QueuedBackgroundTask[] {
    const tasks =
      getMMKVObject<Array<QueuedBackgroundTask>>(this.STORE_KEY) || [];
    return tasks.filter(t => t && t.task && t.task.name && t.id);
  }

  getTaskList() {
    return this.getTaskListFromStorage();
  }

  getTaskCount(): number {
    const tasks = this.getTaskList();
    return tasks.length;
  }

  getDownloadTaskCount(): number {
    const tasks = this.getTaskList();
    return tasks.filter(t => t.task.name === TaskTypes.DOWNLOAD_CHAPTER).length;
  }

  addTask(tasks: BackgroundTask | BackgroundTask[]) {
    const currentTasks = this.getTaskList();
    const inputTasks = Array.isArray(tasks) ? tasks : [tasks];

    const addableTasks = inputTasks.filter(task => {
      // Multiplicable tasks can always be added
      if (this.isMultiplicableTask(task)) {
        return true;
      }

      // For non-multiplicable tasks, check if one exists in queue OR is currently running
      const existingTask = currentTasks.find(_t => _t.task.name === task.name);
      if (existingTask) {
        return false;
      }

      return true;
    });

    if (addableTasks.length) {
      const newTasks: QueuedBackgroundTask[] = addableTasks.map(task => ({
        task,
        meta: {
          name: this.getTaskName(task),
          isRunning: false,
          progress: undefined,
          progressText:
            task.name === TaskTypes.DOWNLOAD_CHAPTER
              ? task.data.chapterName
              : undefined,
        },
        id: makeId(),
      }));

      // Determine the task name for notification filtering
      // If all tasks are the same type, use that name, otherwise use undefined
      const taskNames = new Set(addableTasks.map(t => t.name));
      const uniqueTaskNames = Array.from(taskNames);
      const notifyTaskName =
        uniqueTaskNames.length === 1 ? uniqueTaskNames[0] : undefined;

      // Update task list ONCE with all new tasks to prevent notification spam
      this.updateTaskList(currentTasks.concat(newTasks), notifyTaskName);

      // Flush the task list to ensure it's written immediately
      this.flushTaskList();

      // CRITICAL FIX: Reset isStopping flag when adding new tasks
      // This ensures the service can restart after it was stopped
      if (this.isStopping) {
        this.isStopping = false;
      }

      // Start service immediately without blocking - ensures tasks start automatically
      if (!this.isRunning) {
        this.start().catch(() => {});
      }
    }
  }

  observe(
    taskName: TaskType,
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

  removeTaskById(taskId: string) {
    const taskList = this.getTaskList();
    const task = taskList.find(t => t.id === taskId);

    if (!task) return;

    // Mark task as cancelled
    this.cancelledTasks.add(taskId);

    const filtered = taskList.filter(t => t.id !== taskId);
    this.updateTaskList(filtered, task.task.name);

    // If no tasks left and service is running, stop it
    if (filtered.length === 0 && this.isRunning) {
      BackgroundService.stop();
    }
  }

  prioritizeTask(taskId: string) {
    const taskList = this.getTaskList();
    const taskIndex = taskList.findIndex(t => t.id === taskId);

    if (taskIndex === -1 || taskIndex === 0) return; // Not found or already first

    const task = taskList[taskIndex];

    // Check if the first task is currently running
    const firstTask = taskList[0];
    if (firstTask && firstTask.meta.isRunning) {
      // If first task is running, insert after it (position 1)
      const filtered = taskList.filter(t => t.id !== taskId);
      filtered.splice(1, 0, task);
      this.updateTaskList(filtered, task.task.name);
    } else {
      // Move to front
      const filtered = taskList.filter(t => t.id !== taskId);
      filtered.unshift(task);
      this.updateTaskList(filtered, task.task.name);
    }
  }

  removeDownloadTaskByChapterId(chapterId: number) {
    const name: BackgroundTask['name'] = TaskTypes.DOWNLOAD_CHAPTER;
    const taskList = this.getTaskList();

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

  promoteDownloads(filter: (t: QueuedBackgroundTask) => boolean) {
    const taskList = this.getTaskList();
    const remaining: QueuedBackgroundTask[] = [];
    const promoted: QueuedBackgroundTask[] = [];
    for (const t of taskList) {
      if (t.task.name === TaskTypes.DOWNLOAD_CHAPTER && filter(t)) {
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
        TaskTypes.DOWNLOAD_CHAPTER,
      );
    }
  }

  removeDownloads(filter: (t: QueuedBackgroundTask) => boolean) {
    const taskList = this.getTaskList();
    // Collect matching chapter IDs
    const ids: number[] = [];
    taskList.forEach(t => {
      if (t.task.name === TaskTypes.DOWNLOAD_CHAPTER && filter(t)) {
        const id = (t.task as any).data?.chapterId as number;
        if (id) ids.push(id);
      }
    });

    // Mark matching download tasks as cancelled in memory
    taskList.forEach(t => {
      if (t.task.name === TaskTypes.DOWNLOAD_CHAPTER && filter(t)) {
        this.cancelledTasks.add(t.id);
      }
    });

    const filtered = taskList.filter(
      t => !(t.task.name === TaskTypes.DOWNLOAD_CHAPTER && filter(t)),
    );
    this.updateTaskList(filtered, TaskTypes.DOWNLOAD_CHAPTER);

    // If no tasks left and service is running, stop it
    if (filtered.length === 0 && this.isRunning) {
      BackgroundService.stop();
    }
  }

  clearTaskList() {
    // Mark everything as cancelled
    this.getTaskList().forEach(t => this.cancelledTasks.add(t.id));
    this.updateTaskList([]);
    // Stop service if running
    if (this.isRunning) {
      BackgroundService.stop();
    }
  }

  cancelTask(taskName: TaskType) {
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
    this.isPaused = true;
    NotificationManager.manager.setDefaultActions([
      {
        id: 'resume',
        text: getString('common.resume'),
        icon: { name: 'notification_icon', type: 'drawable' },
      },
      {
        id: 'cancel',
        text: getString('common.cancel'),
        icon: { name: 'notification_icon', type: 'drawable' },
      },
    ]);
    if (this.isRunning) {
      NotificationManager.manager.update(
        'App Service',
        getString('common.paused'),
        undefined,
        true,
      );
    }

    if (this.isRunning) {
      const resumeAfter = MMKVStorage.getNumber('RESUME_DOWNLOAD_AFTER') || 0;
      if (resumeAfter > 0) {
        if (this.resumeTimeout) {
          clearTimeout(this.resumeTimeout);
        }
        this.resumeTimeout = setTimeout(() => {
          this.resume();
          this.resumeTimeout = null;
        }, resumeAfter * 1000);
      }
    }
  }

  resume() {
    this.isPaused = false;
    NotificationManager.manager.setDefaultActions([
      {
        id: 'pause',
        text: getString('common.pause'),
        icon: { name: 'notification_icon', type: 'drawable' },
      },
      {
        id: 'cancel',
        text: getString('common.cancel'),
        icon: { name: 'notification_icon', type: 'drawable' },
      },
    ]);
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout);
      this.resumeTimeout = null;
    }
    const taskCount = this.getTaskCount();
    // Only resume if there are tasks in the queue and service is not running
    if (!this.isRunning && taskCount > 0) {
      setTimeout(() => this.start(), 0);
    }
  }

  stop() {
    if (this.isRunning) {
      this.isStopping = true;
      BackgroundService.stop();
    }
    this.clearTaskList();
  }

  startReadingSession() {
    this.isReadingSessionActive = true;
    if (!this.isRunning) {
      this.start();
    } else {
      // Update notification immediately if already running
      NotificationManager.manager.update(
        'Reading',
        'App is running in background',
        undefined,
        true, // Force update
      );
    }
  }

  stopReadingSession() {
    this.isReadingSessionActive = false;
    // The main loop will exit if queue is empty
  }
}
