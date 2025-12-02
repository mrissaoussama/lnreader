import {
  getLibraryWithCategory,
  getLibraryNovelsFromDb,
} from '../../database/queries/LibraryQueries';

import { showToast } from '../../utils/showToast';
import { UpdateNovelOptions, updateNovel } from './LibraryUpdateQueries';
import { LibraryNovelInfo } from '@database/types';
import { sleep } from '@utils/sleep';
import { MMKVStorage, getMMKVObject } from '@utils/mmkv/mmkv';
import { LAST_UPDATE_TIME } from '@hooks/persisted/useUpdates';
import dayjs from 'dayjs';
import { APP_SETTINGS, AppSettings } from '@hooks/persisted/useSettings';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import { ErrorLogger } from '@utils/ErrorLogger';

const SKIP_UPDATE_THRESHOLD_KEY = 'SKIP_UPDATE_THRESHOLD';

// Simple retry for operations with exponential backoff
const simpleRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1;
      // Retry on network errors or DB locks
      const shouldRetry =
        error.message?.includes('SQLITE_BUSY') ||
        error.message?.includes('database is locked') ||
        error.message?.includes('SQLITE_LOCKED') ||
        error.code === 'SQLITE_BUSY' ||
        error.code === 'SQLITE_LOCKED' ||
        error.message?.includes('Network request failed') ||
        error.message?.includes('timeout') ||
        error.message?.includes('socket hang up');

      if (shouldRetry && !isLastAttempt) {
        const baseDelay = Math.min(1000 * Math.pow(2, attempt), 5000);
        const jitter = Math.random() * baseDelay * 0.5;
        await sleep(baseDelay + jitter);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Operation failed after retries');
};

const shouldSkipNovel = (
  novel: LibraryNovelInfo,
  threshold: string,
): boolean => {
  if (threshold === 'off' || !novel.lastUpdatedAt) return false;

  const lastUpdate = dayjs(novel.lastUpdatedAt);
  const now = dayjs();

  switch (threshold) {
    case '1h':
      return now.diff(lastUpdate, 'hour') < 1;
    case '12h':
      return now.diff(lastUpdate, 'hour') < 12;
    case '1d':
      return now.diff(lastUpdate, 'day') < 1;
    case '1w':
      return now.diff(lastUpdate, 'week') < 1;
    default:
      return false;
  }
};

const updateLibrary = async (
  {
    categoryId,
  }: {
    categoryId?: number;
  },
  setMeta: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
  isCancelled?: () => boolean,
  isPaused?: () => boolean,
) => {
  setMeta(meta => ({
    ...meta,
    isRunning: true,
    progress: 0,
  }));

  if (isCancelled?.()) {
    setMeta(meta => ({ ...meta, isRunning: false }));
    return;
  }

  // Wait if paused at start
  while (isPaused?.()) {
    if (isCancelled?.()) return;
    await sleep(1000);
  }

  const { downloadNewChapters, refreshNovelMetadata, onlyUpdateOngoingNovels } =
    getMMKVObject<AppSettings>(APP_SETTINGS) || {};
  const options: UpdateNovelOptions = {
    downloadNewChapters: downloadNewChapters || false,
    refreshNovelMetadata: refreshNovelMetadata || false,
  };

  const skipThreshold =
    MMKVStorage.getString(SKIP_UPDATE_THRESHOLD_KEY) || 'off';

  const pausedPlugins = new Set(
    JSON.parse(MMKVStorage.getString('DOWNLOAD_PAUSED_PLUGINS') || '[]'),
  );

  let libraryNovels: LibraryNovelInfo[] = [];
  if (categoryId) {
    libraryNovels = getLibraryWithCategory({
      filter:
        `categoryId = ${categoryId}` +
        (onlyUpdateOngoingNovels ? " AND status = 'Ongoing'" : ''),
    });
  } else {
    libraryNovels = getLibraryNovelsFromDb(
      '',
      onlyUpdateOngoingNovels ? "status = 'Ongoing'" : '',
    ) as LibraryNovelInfo[];
  }

  // Filter out novels based on skip threshold
  const novelsToUpdate = libraryNovels.filter(
    novel => !shouldSkipNovel(novel, skipThreshold),
  );
  const total = novelsToUpdate.length;
  const skippedCount = libraryNovels.length - total;

  if (skippedCount > 0) {
    showToast(`Skipping ${skippedCount} recently updated novels`);
  }

  if (total === 0) {
    showToast("There's no novel to be updated");

    setMeta(meta => ({ ...meta, progress: 1, isRunning: false }));
    return;
  }

  MMKVStorage.set(LAST_UPDATE_TIME, dayjs().format('YYYY-MM-DD HH:mm:ss'));

  // Scheduler settings - ignore limits if only 1 novel
  const maxSimultaneousRaw =
    MMKVStorage.getNumber('UPDATE_MAX_SIMULTANEOUS') ?? 0; // 0 = unlimited
  const maxSimultaneous =
    total === 1 ? 0 : Math.max(0, Number(maxSimultaneousRaw) || 0);
  const maxPerPluginRaw = MMKVStorage.getNumber('UPDATE_MAX_PER_PLUGIN') || 0; // 0 = unlimited
  const maxPerPlugin =
    total === 1 ? 0 : Math.max(0, Number(maxPerPluginRaw) || 0);
  const delayBetweenSamePlugin =
    total === 1 ? 0 : MMKVStorage.getNumber('UPDATE_DELAY_SAME_PLUGIN_MS') || 0; // Ignore delay if only 1 novel

  // Concurrency scheduler state
  const running = new Set<number>(); // novel ids
  const started = new Set<number>(); // novel ids
  const pluginRunningCount = new Map<string, number>();
  const pluginLastStart = new Map<string, number>();
  let completed = 0;
  let lastProgressUpdate = 0; // Track last progress update time to debounce

  const canStart = (novel: LibraryNovelInfo) => {
    if (started.has(novel.id)) return false;
    if (pausedPlugins.has(novel.pluginId)) return false;
    // Per-plugin cap
    if (maxPerPlugin > 0) {
      const c = pluginRunningCount.get(novel.pluginId) || 0;
      if (c >= maxPerPlugin) return false;
    }
    // Per-plugin delay
    if (delayBetweenSamePlugin > 0) {
      const last = pluginLastStart.get(novel.pluginId) || 0;
      if (Date.now() - last < delayBetweenSamePlugin) return false;
    }
    return true;
  };

  const startOne = async (novel: LibraryNovelInfo) => {
    // Mark start
    started.add(novel.id);
    running.add(novel.id);
    pluginRunningCount.set(
      novel.pluginId,
      (pluginRunningCount.get(novel.pluginId) || 0) + 1,
    );
    pluginLastStart.set(novel.pluginId, Date.now());

    try {
      // Use simpleRetry for robustness against network/DB glitches
      await simpleRetry(() =>
        updateNovel(novel.pluginId, novel.path, novel.id, options),
      );
    } catch (error: any) {
      // Log error instead of showing toast
      ErrorLogger.log({
        timestamp: new Date().toISOString(),
        pluginId: novel.pluginId,
        novelName: novel.name,
        novelId: novel.id,
        error: error?.message || String(error),
        taskType: 'UPDATE_LIBRARY',
      });
    } finally {
      // Finish
      running.delete(novel.id);
      pluginRunningCount.set(
        novel.pluginId,
        Math.max(0, (pluginRunningCount.get(novel.pluginId) || 1) - 1),
      );
      completed += 1;

      // Debounce progress updates to reduce UI overhead (update every 500ms max)
      const now = Date.now();
      if (now - lastProgressUpdate > 500 || completed === total) {
        lastProgressUpdate = now;
        setMeta(meta => ({
          ...meta,
          progress: completed / total,
          progressText: `${completed}/${total} novels`,
        }));
      }
    }
  };

  while (completed < total) {
    if (isCancelled?.()) {
      break;
    }

    if (isPaused?.()) {
      await sleep(1000);
      continue;
    }

    const globalCap = maxSimultaneous > 0 ? maxSimultaneous : total;
    let startedSomething = false;

    // Check if we can start more updates
    while (running.size < globalCap) {
      const novelToStart = novelsToUpdate.find(novel => canStart(novel));

      if (novelToStart) {
        // Fire and forget, the function handles its own completion status
        startOne(novelToStart);
        startedSomething = true;
      } else {
        // No more novels can start right now (e.g. due to plugin limits)
        break;
      }
    }

    // CRITICAL: More aggressive yielding to prevent ANR
    if (startedSomething) {
      // If we started something, yield briefly to let event loop turn
      await sleep(10);
    } else {
      // If we couldn't start anything, wait a bit longer to avoid busy loop
      // Add jitter to prevent thundering herd
      await sleep(100 + Math.random() * 50);
    }
  }

  while (running.size > 0) {
    if (isCancelled?.()) {
      break;
    }
    await sleep(100);
  }

  // CRITICAL: Force final progress update to ensure UI shows completion
  setMeta(meta => ({
    ...meta,
    progress: completed / total,
    progressText: `${completed}/${total} novels`,
  }));

  // Mark task as complete - show final summary toast
  const finalMessage = `Update completed: ${completed}/${total} novels`;
  showToast(finalMessage);

  setMeta(meta => ({
    ...meta,
    progress: 1,
    isRunning: false,
    progressText: finalMessage,
  }));
};

export { updateLibrary };
