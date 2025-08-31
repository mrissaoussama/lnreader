import { showToast } from '@utils/showToast';
import { Plugin } from '@plugins/types';
import { LOCAL_PLUGIN_ID, getPlugin, plugins } from '@plugins/pluginManager';
import { db } from '@database/db';
import NativeFile from '@specs/NativeFile';
import { fetchNovel } from '@services/plugin/fetch';
import { BackgroundTaskMetadata } from '@services/ServiceManager';
import { sleep } from '@utils/sleep';
import {
  insertNovelAndChapters,
  switchNovelToLibraryQuery,
} from '@database/queries/NovelQueries';
import * as Clipboard from 'expo-clipboard';
import { getString } from '@strings/translations';
import { extractPathFromUrl, normalizePath } from '@utils/urlUtils';

export interface ImportResult {
  added: { name: string; url: string }[];
  skipped: { name: string; url: string }[];
  errored: { name: string; url: string; error: string }[];
}

export { plugins } from '@plugins/pluginManager';

const processUrl = async (
  url: string,
  workingPlugins: Plugin[],
  results: ImportResult,
) => {
  try {
    const plugin = workingPlugins.find(p => {
      if (!p || !p.site || typeof p.site !== 'string') {
        return false;
      }
      const matches = url.startsWith(p.site);

      return matches;
    });

    if (!plugin) {
      const error = 'No plugin found';
      showToast(`No plugin found for: ${url}`);
      results.errored.push({ name: url, url, error });
      return;
    }

    if (plugin.id === LOCAL_PLUGIN_ID) {
      const error = 'Cannot import from local plugin';
      showToast(error + `: ${url}`);
      results.errored.push({ name: url, url, error });
      return;
    }

    let novelPath = url;
    if (url.startsWith(plugin.site)) {
      novelPath = extractPathFromUrl(url, plugin.site);
    }
    // Normalize for consistent DB behavior
    const normalizedPath = normalizePath(novelPath);

    try {
      const novel = await fetchNovel(plugin.id, novelPath);
      if (!novel) {
        const error = 'Failed to fetch novel data';
        showToast(`${error}: ${url}`);
        results.errored.push({ name: url, url, error });
        return;
      }

      if (
        !novel.name ||
        typeof novel.name !== 'string' ||
        novel.name.trim() === ''
      ) {
        const urlSegments = url.split('/');
        const lastSegment = urlSegments[urlSegments.length - 1];
        const fallbackName = lastSegment
          .replace('.html', '')
          .replace(/-/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase())
          .trim();

        if (fallbackName && fallbackName.length > 0) {
          novel.name = fallbackName;
        } else {
          const error = 'Failed to extract novel name';
          showToast(`${error} from: ${url}`);
          results.errored.push({ name: url, url, error });
          return;
        }
      }

      if (!novel.path || typeof novel.path !== 'string') {
        novel.path = normalizedPath;
      } else if (novel.path !== novelPath) {
        novel.path = normalizePath(extractPathFromUrl(novel.path, plugin.site));
      }

      if (!Array.isArray(novel.chapters)) {
        novel.chapters = [];
      }

      try {
        const existingNovel = await db.getFirstAsync<{
          id: number;
          inLibrary: number;
        }>(
          'SELECT id, inLibrary FROM Novel WHERE pluginId = ? AND (path = ? OR path = ?)',
          [plugin.id, normalizedPath, '/' + normalizedPath],
        );

        if (existingNovel) {
          if (existingNovel.inLibrary) {
            results.skipped.push({ name: novel.name, url });
          } else {
            const result = await switchNovelToLibraryQuery(
              normalizedPath,
              plugin.id,
            );
            if (result?.inLibrary) {
              results.added.push({ name: novel.name, url });
            } else {
              const error = `Failed to add existing novel to library: ${novel.name}`;
              results.errored.push({ name: novel.name, url, error });
            }
          }
          return;
        }
        const novelId = await insertNovelAndChapters(plugin.id, {
          ...novel,
          path: normalizedPath,
        });

        if (novelId) {
          const result = await switchNovelToLibraryQuery(
            normalizedPath,
            plugin.id,
          );
          if (result?.inLibrary) {
            results.added.push({ name: novel.name, url });
          } else {
            const error = 'Novel imported but failed to add to library';
            results.errored.push({ name: novel.name, url, error });
          }
        } else {
          const error = 'Failed to insert novel';
          results.errored.push({ name: novel.name, url, error });
        }
      } catch (insertError: any) {
        results.errored.push({
          name: novel.name,
          url,
          error: insertError.message,
        });
      }
    } catch (fetchError: any) {
      const error = `Plugin error: ${plugin.name} ${fetchError.message}`;
      results.errored.push({ name: url, url, error: error });
    }
  } catch (error: any) {
    results.errored.push({ name: url, url, error: error.message });
  }
};

export const massImport = async (
  data: any,
  setMeta: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
) => {
  if (!data || typeof data !== 'object') {
    const errorMsg =
      'Mass import failed: Invalid data provided (not an object)';
    showToast(errorMsg);
    setMeta(meta => ({
      ...meta,
      isRunning: false,
    }));
    return;
  }

  if (!Array.isArray(data.urls)) {
    const errorMsg = 'Mass import failed: URLs must be provided as an array';
    showToast(errorMsg);
    setMeta(meta => ({
      ...meta,
      isRunning: false,
    }));
    return;
  }

  const domainDelay = data.delay || 500;

  const urls = data.urls
    .flatMap((input: string) => {
      if (!input || typeof input !== 'string') {
        return [];
      }

      return input
        .split(/[\s\n]+/)
        .map(url => url.trim())
        .filter(url => url !== '');
    })
    .map((url: string) => {
      let cleanUrl = url.replace(/[.,;!?]+$/, '');

      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl;
      }

      return cleanUrl;
    })
    .filter(
      (url: string, index: number, array: string[]) =>
        array.indexOf(url) === index,
    );

  if (urls.length === 0) {
    const errorMsg = 'Mass import failed: No valid URLs provided';
    showToast(errorMsg);
    setMeta(meta => ({
      ...meta,
      isRunning: false,
    }));
    return;
  }

  setMeta(meta => ({
    ...meta,
    isRunning: true,
    progress: 0,
    progressText: 'Starting mass import...',
  }));

  try {
    const PLUGIN_STORAGE = require('@utils/Storages').PLUGIN_STORAGE;

    if (NativeFile.exists(PLUGIN_STORAGE)) {
      const pluginDirs = NativeFile.readDir(PLUGIN_STORAGE);

      for (const pluginDir of pluginDirs) {
        const pluginPath = `${PLUGIN_STORAGE}/${pluginDir.name}/index.js`;
        if (NativeFile.exists(pluginPath)) {
          getPlugin(pluginDir.name);
        }
      }
    }

    const workingPlugins = Object.values(plugins).filter(p => p) as Plugin[];
    if (workingPlugins.length === 0) {
      showToast('Mass import failed: No plugins found.');
      setMeta(meta => ({
        ...meta,
        isRunning: false,
      }));
      return;
    }

    const results: ImportResult = {
      added: [],
      skipped: [],
      errored: [],
    };

    const urlsByDomain: Record<string, string[]> = urls.reduce(
      (acc: Record<string, string[]>, url: string) => {
        try {
          const domain = new URL(url).hostname;
          if (!acc[domain]) {
            acc[domain] = [];
          }
          acc[domain].push(url);
        } catch (e) {
          results.errored.push({
            name: url,
            url,
            error: 'Invalid URL format',
          });
        }
        return acc;
      },
      {},
    );

    let processedCount = 0;
    const totalUrls = urls.length;

    const domainPromises = Object.values(urlsByDomain).map(
      async (urlGroup: string[]) => {
        for (let i = 0; i < urlGroup.length; i++) {
          const url = urlGroup[i];
          setMeta(meta => ({
            ...meta,
            progressText: `Processing: ${url}`,
            progress: processedCount / totalUrls,
          }));

          await processUrl(url, workingPlugins, results);
          processedCount++;

          // Apply delay between same domain fetches, but not after the last URL in the group
          if (i < urlGroup.length - 1) {
            await sleep(domainDelay);
          }
        }
      },
    );

    await Promise.all(domainPromises);

    const getSummaryText = (localResults: ImportResult) => {
      let summary = `ADDED (${localResults.added.length}):\n`;
      localResults.added.forEach(
        item => (summary += `- ${item.name}: ${item.url}\n`),
      );

      summary += `\nSKIPPED (${localResults.skipped.length}):\n`;
      localResults.skipped.forEach(
        item => (summary += `- ${item.name}: ${item.url}\n`),
      );

      summary += `\nERRORED (${localResults.errored.length}):\n`;
      localResults.errored.forEach(
        item =>
          (summary += `- ${item.name}: ${item.url} (Error: ${item.error})\n`),
      );

      return summary;
    };

    const summaryText = getSummaryText(results);
    Clipboard.setStringAsync(summaryText);

    const finalMessage = `Mass import completed. Added: ${results.added.length}, Skipped: ${results.skipped.length}, Errored: ${results.errored.length}`;
    showToast(finalMessage + '. ' + getString('common.copiedToClipboard'));

    setMeta(meta => ({
      ...meta,
      progress: 1,
      progressText: finalMessage,
      isRunning: false,
      result: results,
    }));
  } catch (error: any) {
    showToast(`Mass import failed: ${error.message}`);
    setMeta(meta => ({
      ...meta,
      isRunning: false,
      progressText: `Failed: ${error.message}`,
    }));
  }
};
