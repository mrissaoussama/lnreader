import * as cheerio from 'cheerio';
import { NOVEL_STORAGE } from '@utils/Storages';
import { Plugin } from '@plugins/types';
import { downloadFile } from '@plugins/helpers/fetch';
import { getPlugin } from '@plugins/pluginManager';
import { getString } from '@strings/translations';
import { getChapter } from '@database/queries/ChapterQueries';
import { getNovelById } from '@database/queries/NovelQueries';
import { db } from '@database/db';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import NativeFile from '@specs/NativeFile';
import {
  DeviceEventEmitter,
  Platform,
  TurboModuleRegistry,
} from 'react-native';
import type { Spec as NativeDownloaderSpec } from '@specs/NativeDownloader';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { isCancelledChapter, clearCancelledChapter } from './cancelRegistry';
import { sleep } from '@utils/sleep';

async function markDownloadedWithRetry(
  chapterId: number,
  attempts = 3,
): Promise<void> {
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      await db.runAsync('UPDATE Chapter SET isDownloaded = 1 WHERE id = ?', [
        chapterId,
      ]);
      return;
    } catch (e) {
      lastErr = e;
      await sleep(50 * (i + 1));
    }
  }
  // If all attempts failed, keep going without throwing
  // eslint-disable-next-line no-console
  console.error('[Downloader] Failed to mark chapter downloaded', lastErr);
}

// Acquire native downloader only on Android to avoid iOS crashes
const NativeDownloader: NativeDownloaderSpec | null =
  Platform.OS === 'android'
    ? (TurboModuleRegistry.get<NativeDownloaderSpec>(
        'NativeDownloader',
      ) as NativeDownloaderSpec | null)
    : null;

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
  const chapterFolder = `${path}/${pluginId}/${novelId}/${chapterId}`;
  NativeFile.mkdir(chapterFolder);
  const nomediaPath = chapterFolder + '/.nomedia';
  NativeFile.writeFile(nomediaPath, ',');
  return chapterFolder;
};

const downloadFilesNativeOrJs = async (
  html: string,
  plugin: Plugin,
  novelId: number,
  chapterId: number,
): Promise<boolean> => {
  const folder = await createChapterFolder(NOVEL_STORAGE, {
    pluginId: plugin.id,
    novelId,
    chapterId,
  });
  const $ = cheerio.load(html);
  const imgs = $('img').toArray();
  // collect urls and rewrite src
  const urls: string[] = [];
  imgs.forEach((img, i) => {
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
  const headers = (plugin.imageRequestInit?.headers as any) || null;

  if (urls.length > 0 && NativeDownloader) {
    try {
      const available = await NativeDownloader.isAvailable();
      if (
        available &&
        typeof NativeDownloader.downloadChapterAssets === 'function'
      ) {
        await NativeDownloader.downloadChapterAssets(
          chapterId,
          plugin.id,
          folder,
          rewrittenHtml,
          urls,
          headers,
        );
        return true;
      }
    } catch {
      // fall back to JS
    }
  }

  // JS fallback: write HTML and download images sequentially
  NativeFile.writeFile(folder + '/index.html', rewrittenHtml);
  for (let i = 0; i < urls.length; i++) {
    if (isCancelledChapter(chapterId)) throw new Error('Cancelled');
    await waitIfPaused(plugin.id, novelId, chapterId);
    if (isCancelledChapter(chapterId)) throw new Error('Cancelled');
    try {
      await downloadFile(
        urls[i],
        `${folder}/${i}.b64.png`,
        plugin.imageRequestInit,
      );
    } catch (err) {
      const elem = $(imgs[i]);
      elem.attr('alt', String(err));
    }
  }
  return true;
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

  const chapterText = await plugin.parseChapter(chapter.path);
  if (!chapterText || !chapterText.length) {
    throw new Error(getString('downloadScreen.chapterEmptyOrScrapeError'));
  }

  let removeListener: (() => void) | null = null;
  try {
    const sub = DeviceEventEmitter.addListener(
      'NativeDownloaderProgress',
      (evt: {
        chapterId: number;
        index: number;
        total: number;
        url: string;
      }) => {
        if (evt && evt.chapterId === chapter.id) {
          const frac = evt.total > 0 ? (evt.index + 1) / evt.total : undefined;
          setMeta(meta => ({
            ...meta,
            progress: frac,
            progressText: `${evt.index + 1}/${evt.total}`,
          }));
        }
      },
    );
    removeListener = () => sub.remove();
  } catch {}

  clearCancelledChapter(chapter.id);

  await downloadFilesNativeOrJs(chapterText, plugin, novel.id, chapter.id);

  if (removeListener) removeListener();
  try {
    await markDownloadedWithRetry(chapter.id, 3);
  } catch {}

  setMeta(meta => ({ ...meta, progress: 1, isRunning: false }));
  return { skipped: false };
};
