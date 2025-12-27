import { NativeModules, DeviceEventEmitter } from 'react-native';
import * as cheerio from 'cheerio';
import { Plugin } from '@plugins/types';
import { downloadFile } from '@plugins/helpers/fetch';
import { getPlugin } from '@plugins/pluginManager';
import { getString } from '@strings/translations';
import { getChapter } from '@database/queries/ChapterQueries';
import { getNovelById } from '@database/queries/NovelQueries';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import NativeFile from '@specs/NativeFile';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { isCancelledChapter, clearCancelledChapter } from './cancelRegistry';
import { sleep } from '@utils/sleep';
import { dbWriteQueue } from '@database/utils/DbWriteQueue';
import { StorageManager } from '@utils/StorageManager';

const { TaskModule } = NativeModules;

async function markChapterDownloaded(chapterId: number): Promise<void> {
  return dbWriteQueue.enqueue(
    async db => {
      await db.runAsync('UPDATE Chapter SET isDownloaded = 1 WHERE id = ?', [
        chapterId,
      ]);
    },
    {
      taskType: 'DOWNLOAD',
      persistentData: { chapterId },
    },
  );
}

const getPausedPlugins = (): Set<string> => {
  try {
    return new Set<string>(
      JSON.parse(MMKVStorage.getString('DOWNLOAD_PAUSED_PLUGINS') || '[]'),
    );
  } catch {
    return new Set();
  }
};

const getPausedNovels = (): Set<number> => {
  try {
    return new Set<number>(
      JSON.parse(MMKVStorage.getString('DOWNLOAD_PAUSED_NOVELS') || '[]'),
    );
  } catch {
    return new Set();
  }
};

async function waitIfPaused(
  pluginId: string,
  novelId: number,
  chapterId: number,
) {
  // If paused by plugin or novel, wait until unpaused or cancelled
  // Re-check every 150ms
  // Exit early if chapter is cancelled
  // Note: Keep this lightweight; MMKV getString is cheap.
  for (;;) {
    if (isCancelledChapter(chapterId)) return; // allow caller to throw if needed
    const pausedPlugins = getPausedPlugins();
    const pausedNovels = getPausedNovels();
    if (!pausedPlugins.has(pluginId) && !pausedNovels.has(novelId)) {
      return;
    }
    await sleep(150);
  }
}

const createChapterFolder = async (
  path: string,
  data: { pluginId: string; novelId: number; chapterId: number },
): Promise<string> => {
  const { pluginId, novelId, chapterId } = data;

  // Try to use the configured storage path (SD card if enabled, otherwise internal)
  let rootPath = path;

  try {
    // Get the novel's current storage location or the default root storage
    const novelBasePath = StorageManager.getNovelPath(novelId, pluginId);

    // Extract the root path from the novel path (remove the /Novels/pluginId/novelId part)
    const parts = novelBasePath.split('/Novels/');
    if (parts.length > 0) {
      rootPath = parts[0];
    } else {
      // Fallback to StorageManager's root storage
      rootPath = StorageManager.getRootStorage();
    }
  } catch (error) {
    rootPath = path;
  }

  const chapterFolder = `${rootPath}/Novels/${pluginId}/${novelId}/${chapterId}`;

  try {
    await NativeFile.mkdir(chapterFolder);
    // Try to create .nomedia but don't fail if it doesn't work
    try {
      await NativeFile.writeFile(chapterFolder + '/.nomedia', '');
    } catch {
      // Ignore .nomedia errors - not critical
    }
    return chapterFolder;
  } catch (error) {
    // Primary storage failed (likely SAF/SD card issue), use internal storage
    const fallbackFolder = `${
      NativeFile.getConstants().ExternalDirectoryPath
    }/Novels/${pluginId}/${novelId}/${chapterId}`;

    try {
      await NativeFile.mkdir(fallbackFolder);
      // Try to create .nomedia but don't fail if it doesn't work
      try {
        await NativeFile.writeFile(fallbackFolder + '/.nomedia', '');
      } catch {
        // Ignore .nomedia errors
      }
      return fallbackFolder;
    } catch (fallbackError) {
      // Both primary and fallback failed
      throw new Error('Failed to create download folder. Please check storage permissions.');
    }
  }
};

// Simple concurrency limiter
const pLimit = (concurrency: number) => {
  const queue: (() => Promise<void>)[] = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const task = queue.shift();
      if (task) {
        activeCount++;
        task();
      }
    }
  };

  const run = <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const task = async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          next();
        }
      };

      if (activeCount < concurrency) {
        activeCount++;
        task();
      } else {
        queue.push(task);
      }
    });
  };

  return run;
};

const downloadChapterImages = async (
  html: string,
  plugin: Plugin,
  novelId: number,
  chapterId: number,
  setMeta?: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
): Promise<void> => {
  // Use runtime-resolved storage path
  const folder = await createChapterFolder(StorageManager.getNovelStorage(), {
    pluginId: plugin.id,
    novelId,
    chapterId,
  });

  // Acquire CPU lock for Cheerio parsing
  // const releaseCpuLock = await ServiceManager.manager.acquireCpuLock();
  let $: cheerio.CheerioAPI;
  let imgs: cheerio.Cheerio<cheerio.Element>;

  try {
    $ = cheerio.load(html);
    imgs = $('img');
  } finally {
    // releaseCpuLock();
  }

  const urls: string[] = [];

  // Collect urls and rewrite src
  imgs.each((i, img) => {
    const elem = $(img);
    const url = elem.attr('src');
    if (url) {
      const absoluteURL = new URL(url, plugin.site).href;
      urls.push(absoluteURL);
      const fileurl = `${folder}/${i}.b64.png`;
      elem.attr('src', 'file://' + fileurl);
    }
  });

  const rewrittenHtml = $.html();

  // Write HTML file
  await NativeFile.writeFile(folder + '/index.html', rewrittenHtml);

  let lastUpdate = 0;
  let completedCount = 0;

  // Download images in parallel with limit
  const limit = pLimit(5);

  const promises = urls.map((url, i) => {
    return limit(async () => {
      if (isCancelledChapter(chapterId)) {
        // We can't easily stop other promises, but we can skip execution
        return;
      }

      try {
        await downloadFile(
          url,
          `${folder}/${i}.b64.png`,
          {},
          plugin.imageRequestInit,
        );
      } catch (error) {}

      completedCount++;

      if (setMeta) {
        const now = Date.now();
        if (now - lastUpdate > 1000 || completedCount === urls.length) {
          setMeta(meta => ({
            ...meta,
            progress: urls.length > 0 ? completedCount / urls.length : undefined,
            progressText: `${completedCount}/${urls.length}`,
          }));
          lastUpdate = now;
        }
      }
    });
  });

  await Promise.all(promises);

  if (isCancelledChapter(chapterId)) {
    throw new Error('Download cancelled');
  }
};

export const downloadChapter = async (
  { chapterId }: { chapterId: number },
  setMeta: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
) => {
  setMeta(meta => ({ ...meta, isRunning: true }));

  const chapter = await getChapter(chapterId);
  if (!chapter) {
    throw new Error('Chapter not found with id: ' + chapterId);
  }
  if (chapter.isDownloaded) {
    setMeta(meta => ({ ...meta, progress: 1, isRunning: false }));
    return { skipped: true };
  }
  const novel = await getNovelById(chapter.novelId);
  if (!novel) {
    throw new Error('Novel not found for chapter: ' + chapter.name);
  }
  const plugin = getPlugin(novel.pluginId);
  if (!plugin) {
    throw new Error(getString('downloadScreen.pluginNotFound'));
  }

  // Check if cancelled before starting
  if (isCancelledChapter(chapter.id)) {
    throw new Error('Download cancelled');
  }

  // Wait if paused
  await waitIfPaused(plugin.id, novel.id, chapter.id);

  // Native Plugin Delegation
  if (plugin.isNative) {
    return new Promise((resolve, reject) => {
      const taskId = `download_${chapter.id}`;

      const subscription = DeviceEventEmitter.addListener('TASK_PROGRESS', (event) => {
        if (event.taskId === taskId) {
          if (event.progress === 100) {
            subscription.remove();
            setMeta(meta => ({ ...meta, progress: 1, isRunning: false }));
            resolve({ skipped: false });
          } else if (event.progress === -1) {
            subscription.remove();
            reject(new Error(event.message));
          } else {
            setMeta(meta => ({
              ...meta,
              progress: event.progress / 100,
              progressText: event.message,
            }));
          }
        }
      });

      // Check cancellation periodically
      const cancelCheckInterval = setInterval(() => {
        if (isCancelledChapter(chapter.id)) {
          clearInterval(cancelCheckInterval);
          subscription.remove();
          reject(new Error('Download cancelled'));
        }
      }, 1000);

      try {
        TaskModule.queueTask(taskId, 'DOWNLOAD_CHAPTER', JSON.stringify({
          pluginId: plugin.id,
          novelId: novel.id,
          chapterId: chapter.id,
          chapterUrl: chapter.url,
          novelPath: novel.path,
        }));
      } catch (e) {
        clearInterval(cancelCheckInterval);
        subscription.remove();
        reject(e);
      }
    });
  }

  // Acquire CPU lock for heavy parsing
  // const releaseCpuLock = await ServiceManager.manager.acquireCpuLock();
  let chapterText = '';
  try {
    chapterText = await plugin.parseChapter(chapter.path);
  } finally {
    // releaseCpuLock();
  }

  if (!chapterText || !chapterText.length) {
    throw new Error(getString('downloadScreen.chapterEmptyOrScrapeError'));
  }

  clearCancelledChapter(chapter.id);

  await downloadChapterImages(
    chapterText,
    plugin,
    novel.id,
    chapter.id,
    setMeta,
  );

  try {
    await markChapterDownloaded(chapter.id);
  } catch {}

  setMeta(meta => ({ ...meta, progress: 1, isRunning: false }));
  return { skipped: false };
};
