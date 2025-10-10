import { showToast } from '@utils/showToast';
import { Plugin } from '@plugins/types';
import { LOCAL_PLUGIN_ID, getPlugin, plugins } from '@plugins/pluginManager';
import { db } from '@database/db';
import NativeFile from '@specs/NativeFile';
import { fetchNovel } from '@services/plugin/fetch';
import ServiceManager, {
  BackgroundTaskMetadata,
} from '@services/ServiceManager';
import { sleep } from '@utils/sleep';
import { insertNovelAndChapters } from '@database/queries/NovelQueries';
import * as Clipboard from 'expo-clipboard';
import { getString } from '@strings/translations';
import { extractPathFromUrl, normalizePath } from '@utils/urlUtils';
import { setMMKVObject } from '@utils/mmkv/mmkv';

// Simple retry for database operations with exponential backoff
const simpleRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 5, // Increased from 3
): Promise<T> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isDbBusyError =
        error.message?.includes('SQLITE_BUSY') ||
        error.message?.includes('database is locked') ||
        error.message?.includes('SQLITE_LOCKED') ||
        error.code === 'SQLITE_BUSY' ||
        error.code === 'SQLITE_LOCKED';

      if (isDbBusyError && !isLastAttempt) {
        // Exponential backoff with jitter
        const baseDelay = Math.min(100 * Math.pow(2, attempt), 1000);
        const jitter = Math.random() * baseDelay * 0.5;
        await sleep(baseDelay + jitter);
        continue;
      }

      throw error;
    }
  }
  throw new Error('Operation failed after retries');
};
export interface ImportResult {
  added: { name: string; url: string }[];
  skipped: { name: string; url: string }[];
  errored: { name: string; url: string; error: string }[];
  staged: { name: string; url: string; novelId: number }[]; // New: novels ready to be added to library
}

export { plugins } from '@plugins/pluginManager';

// Export utility functions for copying errored results
export const copyErroredWithErrors = (
  erroredItems: { name: string; url: string; error: string }[],
) => {
  const erroredText = erroredItems
    .map(item => `${item.name}: ${item.url} (Error: ${item.error})`)
    .join('\n');
  Clipboard.setStringAsync(erroredText);
  showToast('Errored novels with errors copied to clipboard');
};

export const copyErroredLinksOnly = (
  erroredItems: { name: string; url: string; error: string }[],
) => {
  const linksText = erroredItems.map(item => item.url).join('\n');
  Clipboard.setStringAsync(linksText);
  showToast('Errored URLs copied to clipboard');
};

const processUrl = async (
  url: string,
  workingPlugins: Plugin[],
  results: ImportResult,
  taskId?: string, // Add taskId for cancellation checks
) => {
  try {
    // Check for cancellation at the start
    if (taskId && ServiceManager.manager.isTaskCancelled(taskId)) {
      return; // Early exit if cancelled
    }

    const plugin = workingPlugins.find(p => {
      if (!p || !p.site || typeof p.site !== 'string') {
        return false;
      }
      const matches = url.startsWith(p.site);

      return matches;
    });

    if (!plugin) {
      const error = 'No plugin found';
      results.errored.push({ name: url, url, error });
      return;
    }

    if (plugin.id === LOCAL_PLUGIN_ID) {
      const error = 'Cannot import from local plugin';
      results.errored.push({ name: url, url, error });
      return;
    }

    let novelPath = url;
    if (url.startsWith(plugin.site)) {
      novelPath = extractPathFromUrl(url, plugin.site);
    }
    // Normalize for consistent DB behavior
    const normalizedPath = normalizePath(novelPath);

    // Check if the novel is already in the library to avoid fetching it again.
    const preCheckNovel = await db.getFirstAsync<{
      name: string;
      inLibrary: number;
    }>(
      'SELECT name, inLibrary FROM Novel WHERE pluginId = ? AND (path = ? OR path = ?)',
      [plugin.id, normalizedPath, '/' + normalizedPath],
    );

    if (preCheckNovel?.inLibrary) {
      results.skipped.push({ name: preCheckNovel.name, url });
      return;
    }

    // Check for cancellation before network request
    if (taskId && ServiceManager.manager.isTaskCancelled(taskId)) {
      return; // Early exit if cancelled
    }

    // Fetch (network) first – not serialized so we keep parallelism.
    const novel = await fetchNovel(plugin.id, novelPath);
    if (!novel) {
      const error = 'Failed to fetch novel data';
      results.errored.push({ name: url, url, error });
      return;
    }

    // Check for cancellation after network request
    if (taskId && ServiceManager.manager.isTaskCancelled(taskId)) {
      return; // Early exit if cancelled
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

    // Database operations with simple retry (no mutex needed for better performance)
    try {
      // Check for cancellation before DB operations
      if (taskId && ServiceManager.manager.isTaskCancelled(taskId)) {
        return; // Early exit if cancelled
      }

      const existingNovel = await simpleRetry(async () => {
        return await db.getFirstAsync<{
          id: number;
          inLibrary: number;
        }>(
          'SELECT id, inLibrary FROM Novel WHERE pluginId = ? AND (path = ? OR path = ?)',
          [plugin.id, normalizedPath, '/' + normalizedPath],
        );
      });

      if (existingNovel) {
        if (existingNovel.inLibrary) {
          results.skipped.push({ name: novel.name, url });
        } else {
          // Novel exists but not in library - add it to library
          try {
            await simpleRetry(async () => {
              await db.withTransactionAsync(async () => {
                await db.runAsync(
                  'UPDATE Novel SET inLibrary = 1 WHERE id = ?',
                  [existingNovel.id],
                );

                await db.runAsync(
                  'INSERT OR IGNORE INTO NovelCategory (novelId, categoryId) VALUES (?, (SELECT DISTINCT id FROM Category WHERE sort = 1))',
                  [existingNovel.id],
                );
              });
            });

            results.added.push({ name: novel.name, url });
          } catch (addError: any) {
            results.errored.push({
              name: novel.name,
              url,
              error: `Failed to add existing novel to library: ${addError.message}`,
            });
          }
        }
        return;
      }

      // Insert novel but don't add to library yet (inLibrary = 0 by default)
      const novelId = await simpleRetry(async () => {
        return await insertNovelAndChapters(plugin.id, {
          ...novel,
          path: normalizedPath,
        });
      });

      if (novelId) {
        // Stage the novel for library addition
        results.staged.push({
          name: novel.name,
          url,
          novelId: novelId,
        });
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
  } catch (error: any) {
    results.errored.push({ name: url, url, error: error.message });
  }
};

export const massImport = async (
  data: any,
  setMeta: (
    transformer: (meta: BackgroundTaskMetadata) => BackgroundTaskMetadata,
  ) => void,
  taskId?: string, // Add taskId parameter for cancellation checks
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

  // Process and filter URLs
  const rawUrls = data.urls
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
      // Remove trailing punctuation that might be copied accidentally
      let cleanUrl = url.replace(/[.,;!?]+$/, '');

      // Add https:// if no protocol specified
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl;
      }

      return cleanUrl;
    })
    .filter(
      (url: string, index: number, array: string[]) =>
        array.indexOf(url) === index, // Remove duplicates
    );

  // Count filtered out items for reporting (only duplicates now)
  const totalInputCount = data.urls.reduce((count: number, input: string) => {
    if (!input || typeof input !== 'string') return count;
    return (
      count + input.split(/[\s\n]+/).filter(url => url.trim() !== '').length
    );
  }, 0);

  const filteredCount = totalInputCount - rawUrls.length;

  const urls = rawUrls;

  if (urls.length === 0) {
    const errorMsg =
      filteredCount > 0
        ? `Mass import failed: No URLs found (${filteredCount} filtered out as duplicates)`
        : 'Mass import failed: No URLs provided';
    showToast(errorMsg);
    setMeta(meta => ({
      ...meta,
      isRunning: false,
    }));
    return;
  }

  // Show filtering stats if any duplicates were filtered
  if (filteredCount > 0) {
    showToast(
      `Removed ${filteredCount} duplicate URLs. Processing ${urls.length} URLs.`,
    );
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
      staged: [],
    };

    const urlsToProcess: string[] = [];
    const totalUrls = urls.length;
    let processedCount = 0;

    setMeta(meta => ({
      ...meta,
      progressText: 'Prefiltering URLs...',
    }));

    for (const url of urls) {
      await sleep(0); // Yield to prevent ANR
      try {
        const urlObj = new URL(url);
        if (!urlObj) throw new Error('Invalid URL');

        const plugin = workingPlugins.find(p => url.startsWith(p.site));

        if (!plugin) {
          results.errored.push({ name: url, url, error: 'No plugin found' });
          continue;
        }

        if (plugin.id === LOCAL_PLUGIN_ID) {
          results.errored.push({
            name: url,
            url,
            error: 'Cannot import from local plugin',
          });
          continue;
        }

        let novelPath = url;
        if (url.startsWith(plugin.site)) {
          novelPath = extractPathFromUrl(url, plugin.site);
        }
        const normalizedPath = normalizePath(novelPath);

        const preCheckNovel = await simpleRetry(async () => {
          return await db.getFirstAsync<{
            id: number;
            name: string;
            inLibrary: number;
          }>(
            'SELECT id, name, inLibrary FROM Novel WHERE pluginId = ? AND (path = ? OR path = ?)',
            [plugin.id, normalizedPath, '/' + normalizedPath],
          );
        });

        if (preCheckNovel) {
          if (preCheckNovel.inLibrary) {
            results.skipped.push({ name: preCheckNovel.name, url });
          } else {
            // Novel exists but not in library - add it to library
            try {
              await simpleRetry(async () => {
                await db.withTransactionAsync(async () => {
                  await db.runAsync(
                    'UPDATE Novel SET inLibrary = 1 WHERE id = ?',
                    [preCheckNovel.id],
                  );

                  await db.runAsync(
                    'INSERT OR IGNORE INTO NovelCategory (novelId, categoryId) VALUES (?, (SELECT DISTINCT id FROM Category WHERE sort = 1))',
                    [preCheckNovel.id],
                  );
                });
              });

              results.added.push({ name: preCheckNovel.name, url });
            } catch (addError: any) {
              results.errored.push({
                name: preCheckNovel.name,
                url,
                error: `Failed to add existing novel to library: ${addError.message}`,
              });
            }
          }
          continue;
        }

        urlsToProcess.push(url);
      } catch (e: any) {
        results.errored.push({
          name: url,
          url,
          error: 'Invalid URL or format',
        });
      }
    }

    processedCount = totalUrls - urlsToProcess.length;

    const urlsByDomain: Record<string, string[]> = urlsToProcess.reduce(
      (acc: Record<string, string[]>, url: string) => {
        const domain = new URL(url).hostname;
        if (!acc[domain]) {
          acc[domain] = [];
        }
        acc[domain].push(url);
        return acc;
      },
      {},
    );

    const domainPromises = Object.values(urlsByDomain).map(
      async (urlGroup: string[]) => {
        for (let i = 0; i < urlGroup.length; i++) {
          await sleep(0); // Yield to prevent ANR

          // Additional yield every 5 URLs to be more aggressive about preventing ANR
          if (i > 0 && i % 5 === 0) {
            await sleep(50);
          }

          // Check for cancellation before each URL
          if (taskId && ServiceManager.manager.isTaskCancelled(taskId)) {
            setMeta(meta => ({
              ...meta,
              isRunning: false,
              progressText: 'Mass import cancelled',
            }));
            return;
          }

          const url = urlGroup[i];
          setMeta(meta => ({
            ...meta,
            progressText: `Processing: ${url} (${
              processedCount + 1
            }/${totalUrls})`,
            progress: processedCount / totalUrls,
          }));

          await processUrl(url, workingPlugins, results, taskId); // Pass taskId
          processedCount++;

          // Apply delay between same domain fetches, but not after the last URL in the group
          if (i < urlGroup.length - 1) {
            await sleep(domainDelay);
          }
        }
      },
    );

    await Promise.all(domainPromises);

    // Check if cancelled after processing
    if (taskId && ServiceManager.manager.isTaskCancelled(taskId)) {
      setMeta(meta => ({
        ...meta,
        isRunning: false,
        progressText: 'Mass import cancelled',
      }));
      return;
    }

    // Now add staged novels to library in batches to reduce DB locks
    if (results.staged.length > 0) {
      setMeta(meta => ({
        ...meta,
        progressText: `Adding ${results.staged.length} novels to library in batches...`,
      }));

      const BATCH_SIZE = 50;
      const batches: (typeof results.staged)[] = [];

      // Split staged novels into batches
      for (let i = 0; i < results.staged.length; i += BATCH_SIZE) {
        batches.push(results.staged.slice(i, i + BATCH_SIZE));
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];

        // Yield control every batch to prevent ANR
        await sleep(10);

        if (taskId && ServiceManager.manager.isTaskCancelled(taskId)) {
          break; // Stop if cancelled during library addition
        }

        setMeta(meta => ({
          ...meta,
          progressText: `Adding batch ${batchIndex + 1}/${batches.length} (${
            batch.length
          } novels)...`,
        }));

        try {
          // Process entire batch in a single transaction for better performance
          await simpleRetry(async () => {
            await db.withTransactionAsync(async () => {
              for (const stagedNovel of batch) {
                // Update novel to be in library
                await db.runAsync(
                  'UPDATE Novel SET inLibrary = 1 WHERE id = ?',
                  [stagedNovel.novelId],
                );

                // Add to default category
                await db.runAsync(
                  'INSERT OR IGNORE INTO NovelCategory (novelId, categoryId) VALUES (?, (SELECT DISTINCT id FROM Category WHERE sort = 1))',
                  [stagedNovel.novelId],
                );
              }
            });
          });

          // Mark all novels in this batch as successfully added
          batch.forEach(stagedNovel => {
            results.added.push({
              name: stagedNovel.name,
              url: stagedNovel.url,
            });
          });
        } catch (error: any) {
          // If batch fails, try individual items to see which ones work
          for (const stagedNovel of batch) {
            await sleep(5); // Small yield for individual operations
            if (taskId && ServiceManager.manager.isTaskCancelled(taskId)) {
              break;
            }

            try {
              await simpleRetry(async () => {
                await db.runAsync(
                  'UPDATE Novel SET inLibrary = 1 WHERE id = ?',
                  [stagedNovel.novelId],
                );

                await db.runAsync(
                  'INSERT OR IGNORE INTO NovelCategory (novelId, categoryId) VALUES (?, (SELECT DISTINCT id FROM Category WHERE sort = 1))',
                  [stagedNovel.novelId],
                );
              });

              results.added.push({
                name: stagedNovel.name,
                url: stagedNovel.url,
              });
            } catch (individualError: any) {
              results.errored.push({
                name: stagedNovel.name,
                url: stagedNovel.url,
                error: `Failed to add to library: ${individualError.message}`,
              });
            }
          }
        }
      }

      // Clear staged array since they're now added or errored
      results.staged = [];
    }

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

    // Store results safely
    try {
      setMMKVObject('LAST_MASS_IMPORT_RESULT', results);
    } catch (storageError: any) {}

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
