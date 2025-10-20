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

const SKIP_UPDATE_THRESHOLD_KEY = 'SKIP_UPDATE_THRESHOLD';

const shouldSkipNovel = (
  novel: LibraryNovelInfo,
  threshold: string,
): boolean => {
  if (threshold === 'off' || !novel.lastUpdate) return false;

  const lastUpdate = dayjs(novel.lastUpdate);
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

  const { downloadNewChapters, refreshNovelMetadata, onlyUpdateOngoingNovels } =
    getMMKVObject<AppSettings>(APP_SETTINGS) || {};
  const options: UpdateNovelOptions = {
    downloadNewChapters: downloadNewChapters || false,
    refreshNovelMetadata: refreshNovelMetadata || false,
  };

  const skipThreshold =
    MMKVStorage.getString(SKIP_UPDATE_THRESHOLD_KEY) || 'off';

  // Scheduler settings
  const maxSimultaneousRaw =
    MMKVStorage.getNumber('UPDATE_MAX_SIMULTANEOUS') ?? 0; // 0 = unlimited
  const maxSimultaneous = Math.max(0, Number(maxSimultaneousRaw) || 0);
  const maxPerPluginRaw = MMKVStorage.getNumber('UPDATE_MAX_PER_PLUGIN') || 0; // 0 = unlimited
  const maxPerPlugin = Math.max(0, Number(maxPerPluginRaw) || 0);
  const delayBetweenSamePlugin =
    MMKVStorage.getNumber('UPDATE_DELAY_SAME_PLUGIN_MS') || 0;

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

  // Concurrency scheduler state
  const running = new Set<number>(); // novel ids
  const started = new Set<number>(); // novel ids
  const pluginRunningCount = new Map<string, number>();
  const pluginLastStart = new Map<string, number>();
  let completed = 0;

  const canStart = (novel: LibraryNovelInfo) => {
    if (started.has(novel.id)) return false;
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

    // Update progress text to show the novel being started
    setMeta(meta => ({
      ...meta,
      progressText: novel.name,
    }));

    try {
      await updateNovel(novel.pluginId, novel.path, novel.id, options);
    } catch (error: any) {
      showToast(novel.name + ': ' + (error?.message || String(error)));
    } finally {
      // Finish
      running.delete(novel.id);
      pluginRunningCount.set(
        novel.pluginId,
        Math.max(0, (pluginRunningCount.get(novel.pluginId) || 1) - 1),
      );
      completed += 1;
      // Update progress
      setMeta(meta => ({
        ...meta,
        progress: completed / total,
        progressText: `${completed}/${total} novels`,
      }));
    }
  };

  // Main scheduling loop
  while (completed < total) {
    if (isCancelled?.()) {
      // Stop launching new tasks
      break;
    }

    const globalCap = maxSimultaneous > 0 ? maxSimultaneous : total;
    const availableSlots = Math.max(0, globalCap - running.size);

    if (availableSlots > 0) {
      let startedCount = 0;
      for (const novel of novelsToUpdate) {
        if (startedCount >= availableSlots) break;
        if (running.has(novel.id) || started.has(novel.id)) continue;
        if (!canStart(novel)) continue;
        // Fire and forget
        startOne(novel);
        startedCount++;
      }
    }

    if (completed >= total) break;

    // Small tick; also lets per-plugin delay windows elapse
    await sleep(50);
  }

  // If cancelled we exit promptly without waiting for in-flight updates to finish
  setMeta(meta => ({
    ...meta,
    progress: total > 0 ? completed / total : 1,
    isRunning: false,
    progressText: `${completed}/${total} novels`,
  }));
};

export { updateLibrary };
