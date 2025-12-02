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
    const nomediaPath = chapterFolder + '/.nomedia';
    try {
      await NativeFile.writeFile(nomediaPath, '');
    } catch (error) {}
    return chapterFolder;
  } catch (error) {
    // If SD card fails, fallback to internal storage

    const fallbackFolder = `${
      NativeFile.getConstants().ExternalDirectoryPath
    }/Novels/${pluginId}/${novelId}/${chapterId}`;
    try {
      await NativeFile.mkdir(fallbackFolder);
      const nomediaPath = fallbackFolder + '/.nomedia';
      try {
        await NativeFile.writeFile(nomediaPath, '');
      } catch (nomediaError) {}

      return fallbackFolder;
    } catch (fallbackError) {
      throw error; // Throw original error
    }
  }
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
  const $ = cheerio.load(html);
  const imgs = $('img');
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

  // Download images sequentially
  for (let i = 0; i < urls.length; i++) {
    if (isCancelledChapter(chapterId)) {
      throw new Error('Download cancelled');
    }

    if (setMeta) {
      const now = Date.now();
      if (now - lastUpdate > 1000 || i === 0 || i === urls.length - 1) {
        setMeta(meta => ({
          ...meta,
          progress: urls.length > 0 ? (i + 1) / urls.length : undefined,
          progressText: `${i + 1}/${urls.length}`,
        }));
        lastUpdate = now;
      }
    }

    try {
      await downloadFile(
        urls[i],
        `${folder}/${i}.b64.png`,
        {},
        plugin.imageRequestInit,
      );
    } catch (error) {}
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

  const chapterText = await plugin.parseChapter(chapter.path);
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
