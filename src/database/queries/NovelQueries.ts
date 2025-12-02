import * as DocumentPicker from 'expo-document-picker';

import { fetchNovel } from '@services/plugin/fetch';
import { insertChapters } from './ChapterQueries';

import { showToast } from '@utils/showToast';
import {
  getAllAsync,
  getFirstAsync,
  getFirstSync,
  QueryObject,
  runAsync,
  runSync,
  transactionAsync,
} from '../utils/helpers';
import { getString } from '@strings/translations';
import { BackupNovel, NovelInfo } from '../types';
import { SourceNovel } from '@plugins/types';
import { StorageManager } from '@utils/StorageManager';
import { downloadFile } from '@plugins/helpers/fetch';
import { getPlugin } from '@plugins/pluginManager';
import { db } from '@database/db';
import { updateNovelHasMatch } from '@database/queries/LibraryQueries';
import NativeFile from '@specs/NativeFile';
import { dbWriteQueue } from '@database/utils/DbWriteQueue';

export const insertNovelAndChapters = async (
  pluginId: string,
  sourceNovel: SourceNovel,
): Promise<number | undefined> => {
  const { normalizePath } = require('@utils/urlUtils');
  const normalizedPath = normalizePath(sourceNovel.path || '');
  let novelId: number | undefined;

  await dbWriteQueue.enqueue(
    async qdb => {
      const insertNovelQuery =
        'INSERT INTO Novel (path, pluginId, name, cover, summary, author, artist, status, genres, totalPages) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
      const result = await qdb.runAsync(insertNovelQuery, [
        normalizedPath,
        pluginId,
        sourceNovel.name,
        sourceNovel.cover || null,
        sourceNovel.summary || null,
        sourceNovel.author || null,
        sourceNovel.artist || null,
        sourceNovel.status || null,
        sourceNovel.genres || null,
        sourceNovel.totalPages || 0,
      ]);
      novelId = (result as any).lastInsertRowId;

      if (novelId) {
        // Insert alternative titles if they exist
        const alternativeTitles = sourceNovel.alternativeTitles || [];
        const cleanTitles = [
          ...new Set(
            alternativeTitles
              .map(title => title.trim())
              .filter(title => title.length > 0),
          ),
        ];

        for (const title of cleanTitles) {
          try {
            await qdb.runAsync(
              'INSERT OR IGNORE INTO AlternativeTitle (novelId, title) VALUES (?, ?)',
              novelId,
              title,
            );
          } catch (e) {}
        }
        await updateNovelHasMatch(novelId);
        if (sourceNovel.cover) {
          const novelDir = StorageManager.getNovelDirectory(pluginId, novelId);
          NativeFile.mkdir(novelDir);
          const novelCoverPath = novelDir + '/cover.png';
          const novelCoverUri = 'file://' + novelCoverPath;
          await downloadFile(
            sourceNovel.cover,
            novelCoverPath,
            getPlugin(pluginId)?.imageRequestInit,
          );
          await qdb.runAsync(
            'UPDATE Novel SET cover = ? WHERE id = ?',
            novelCoverUri,
            novelId,
          );
        }
        // Insert chapters without starting a nested transaction
        await insertChapters(novelId, sourceNovel.chapters, {
          transactional: false,
        });
      }
    },
    { transactional: true, exclusive: true, label: 'insertNovelAndChapters' },
  );
  return novelId;
};

export const getAllNovels = async () => {
  return getAllAsync<NovelInfo>(['SELECT * FROM Novel']);
};

export const getNovelById = async (novelId: number) => {
  const novel = await getFirstAsync<NovelInfo>([
    'SELECT * FROM Novel WHERE id = ?',
    [novelId],
  ]);
  if (novel) {
    const altTitles = await getAllAsync<{ title: string }>([
      'SELECT title FROM AlternativeTitle WHERE novelId = ?',
      [novelId],
    ]);
    novel.alternativeTitles = altTitles.map(t => t.title);
  }
  return novel;
};

export const getNovelByPath = (
  novelPath: string,
  pluginId: string,
): NovelInfo | undefined => {
  const { normalizePath } = require('@utils/urlUtils');
  const normalized = normalizePath(novelPath || '');
  // Backward-compatible lookup: accept both normalized and with leading slash
  const res = getFirstSync<NovelInfo>([
    'SELECT * FROM Novel WHERE pluginId = ? AND (path = ? OR path = ?)',
    [pluginId, normalized, '/' + normalized],
  ]);
  if (!res) {
    return undefined;
  }
  const altTitles =
    db.getAllSync<{ title: string }>(
      'SELECT title FROM AlternativeTitle WHERE novelId = ?',
      [res.id],
    ) || [];
  return { ...res, alternativeTitles: altTitles.map(t => t.title) };
};

// if query is insert novel || add to library => add default category name for it
// else remove all it's categories

export const switchNovelToLibraryQuery = async (
  novelPath: string,
  pluginId: string,
): Promise<NovelInfo | undefined> => {
  const novel = await getNovelByPath(novelPath, pluginId);
  if (novel) {
    const queries: QueryObject[] = [
      [
        'UPDATE Novel SET inLibrary = ? WHERE id = ?',
        [Number(!novel.inLibrary), novel.id],
      ],
      novel.inLibrary
        ? [
            'DELETE FROM NovelCategory WHERE novelId = ?',
            [novel.id],
            () => showToast(getString('browseScreen.removeFromLibrary')),
          ]
        : [
            'INSERT INTO NovelCategory (novelId, categoryId) VALUES (?, (SELECT DISTINCT id FROM Category WHERE sort = 1))',
            [novel.id],
            () => showToast(getString('browseScreen.addedToLibrary')),
          ],
    ];
    if (novel.pluginId === 'local') {
      queries.push([
        'INSERT INTO NovelCategory (novelId, categoryId) VALUES (?, 2)',
        [novel.id],
      ]);
    }
    await runAsync(queries);
    return { ...novel, inLibrary: !novel.inLibrary };
  }
  return undefined;
};

// allow to delete local novels
export const removeNovelsFromLibrary = (novelIds: Array<number>) => {
  runSync([
    [`UPDATE Novel SET inLibrary = 0 WHERE id IN (${novelIds.join(', ')});`],
    [`DELETE FROM NovelCategory WHERE novelId IN (${novelIds.join(', ')});`],
  ]);
  showToast(getString('browseScreen.removeFromLibrary'));
};

export const getCachedNovels = () => {
  return getAllAsync<NovelInfo>(['SELECT * FROM Novel WHERE inLibrary = 0']);
};
export const deleteCachedNovels = async () => {
  runAsync([
    [
      'DELETE FROM Novel WHERE inLibrary = 0',
      [],
      () =>
        showToast(getString('advancedSettingsScreen.cachedNovelsDeletedToast')),
    ],
  ]);
};

const restoreFromBackupQuery =
  'INSERT OR REPLACE INTO Novel (path, name, pluginId, cover, summary, author, artist, status, genres, totalPages) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

export const restoreLibrary = async (novel: NovelInfo) => {
  const sourceNovel = await fetchNovel(novel.pluginId, novel.path).catch(e => {
    throw e;
  });

  let novelId: number | undefined;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(restoreFromBackupQuery, [
      sourceNovel.path,
      novel.name,
      novel.pluginId,
      novel.cover || '',
      novel.summary || '',
      novel.author || '',
      novel.artist || '',
      novel.status || '',
      novel.genres || '',
      sourceNovel.totalPages || 0,
    ]);
    novelId = result.lastInsertRowId;

    // Restore alternative titles from source novel (plugins may have updated them)
    if (novelId) {
      const sourceTitles = sourceNovel.alternativeTitles || [];
      const cleanTitles = [
        ...new Set(
          sourceTitles
            .map(title => title.trim())
            .filter(title => title.length > 0),
        ),
      ];

      for (const title of cleanTitles) {
        try {
          await db.runAsync(
            'INSERT OR IGNORE INTO AlternativeTitle (novelId, title) VALUES (?, ?)',
            novelId,
            title,
          );
        } catch (e) {}
      }
    }
  });

  if (novelId && novelId > 0) {
    await new Promise((resolve, reject) => {
      runAsync([
        [
          'INSERT OR REPLACE INTO NovelCategory (novelId, categoryId) VALUES (?, (SELECT DISTINCT id FROM Category WHERE sort = 1))',
          [novelId!],
          () => {
            db.runAsync('UPDATE Novel SET inLibrary = 1 WHERE id = ?', [
              novelId!,
            ]);
            resolve(null);
          },
          () => {
            reject(null);
            return false;
          },
        ],
      ]);
    }).catch(e => {
      throw e;
    });
    if (sourceNovel.chapters) {
      await insertChapters(novelId, sourceNovel.chapters);
    }
  }
};

export const updateNovelInfo = async (info: NovelInfo) => {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE Novel SET name = ?, cover = ?, path = ?, summary = ?, author = ?, artist = ?, genres = ?, status = ?, isLocal = ? WHERE id = ?',
      [
        info.name,
        info.cover || '',
        info.path,
        info.summary || '',
        info.author || '',
        info.artist || '',
        info.genres || '',
        info.status || '',
        Number(info.isLocal),
        info.id,
      ],
    );
    await updateNovelHasMatch(info.id);
  });
};

export const pickCustomNovelCover = async (novel: NovelInfo) => {
  const image = await DocumentPicker.getDocumentAsync({ type: 'image/*' });
  if (image.assets && image.assets[0]) {
    // Use StorageManager to get the correct novel path (respects SD card setting)
    let novelDir: string;
    try {
      novelDir = StorageManager.getNovelPath(novel.id, novel.pluginId);
    } catch (error) {
      novelDir = `${StorageManager.getNovelStorage()}/${novel.pluginId}/${
        novel.id
      }`;
    }

    let novelCoverUri = 'file://' + novelDir + '/cover.png';

    try {
      if (!NativeFile.exists(novelDir)) {
        NativeFile.mkdir(novelDir);
      }
      await NativeFile.copyFile(image.assets[0].uri, novelCoverUri);
    } catch (copyError) {
      // If SD card fails, fallback to internal storage

      const fallbackDir = `${
        NativeFile.getConstants().ExternalDirectoryPath
      }/Novels/${novel.pluginId}/${novel.id}`;
      if (!NativeFile.exists(fallbackDir)) {
        NativeFile.mkdir(fallbackDir);
      }
      novelCoverUri = 'file://' + fallbackDir + '/cover.png';
      await NativeFile.copyFile(image.assets[0].uri, novelCoverUri);
    }

    novelCoverUri += '?' + Date.now();
    await db.runAsync(
      'UPDATE Novel SET cover = ? WHERE id = ?',
      novelCoverUri,
      novel.id,
    );
    return novelCoverUri;
  }
};

export const deleteNovelCover = async (novel: NovelInfo) => {
  if (novel.cover && novel.cover.startsWith('file://')) {
    const coverPath = novel.cover.replace('file://', '');
    if (await NativeFile.exists(coverPath)) {
      await NativeFile.unlink(coverPath);
    }
  }
  await db.runAsync('UPDATE Novel SET cover = ? WHERE id = ?', null, novel.id);
};

export const updateNovelCategoryById = async (
  novelId: number,
  categoryIds: number[],
) => {
  runAsync(
    categoryIds.map(categoryId => {
      return [
        'INSERT INTO NovelCategory (novelId, categoryId) VALUES (?, ?)',
        [novelId, categoryId],
      ];
    }),
  );
};

export const updateNovelCategories = async (
  novelIds: number[],
  categoryIds: number[],
): Promise<void> => {
  const queries: QueryObject[] = [];
  queries.push([
    `DELETE FROM NovelCategory WHERE novelId IN (${novelIds.join(
      ',',
    )}) AND categoryId != 2`,
  ]);
  // if no category is selected => set to the default category
  if (categoryIds.length) {
    novelIds.forEach(novelId => {
      categoryIds.forEach(categoryId =>
        queries.push([
          `INSERT INTO NovelCategory (novelId, categoryId) VALUES (${novelId}, ${categoryId})`,
        ]),
      );
    });
  } else {
    novelIds.forEach(novelId => {
      // hacky: insert local novel category -> failed -> ignored
      queries.push([
        `INSERT OR IGNORE INTO NovelCategory (novelId, categoryId)
         VALUES (
          ${novelId},
          IFNULL((SELECT categoryId FROM NovelCategory WHERE novelId = ${novelId}), (SELECT id FROM Category WHERE sort = 1))
        )`,
      ]);
    });
  }
  return runSync(queries);
};

const restoreObjectQuery = (table: string, obj: any) => {
  return `
  INSERT INTO ${table}
  (${Object.keys(obj).join(',')})
  VALUES (${Object.keys(obj)
    .map(() => '?')
    .join(',')})
  `;
};

export const _restoreNovelAndChapters = async (backupNovel: BackupNovel) => {
  const { chapters, ...novel } = backupNovel;

  try {
    // Prepare all transaction queries
    const transactionQueries: [string, ...(string | number | null)[]][] = [];

    // Delete existing data
    transactionQueries.push([
      'DELETE FROM Chapter WHERE novelId = ?',
      novel.id,
    ]);
    transactionQueries.push(['DELETE FROM Novel WHERE id = ?', novel.id]);

    // Insert novel
    const novelWithLibraryFlag = { ...novel, inLibrary: 1 };
    const novelQuery = restoreObjectQuery('Novel', novelWithLibraryFlag);
    const novelValues = Object.values(novelWithLibraryFlag).map(value =>
      value === null || value === undefined ? null : value,
    ) as (string | number | null)[];

    transactionQueries.push([novelQuery, ...novelValues]);

    // Insert chapters in batches
    if (chapters.length > 0) {
      const BULK_SIZE = 500;
      const chapterKeys = Object.keys(chapters[0]);

      for (let i = 0; i < chapters.length; i += BULK_SIZE) {
        const batch = chapters.slice(i, i + BULK_SIZE);
        const placeholders = chapterKeys.map(() => '?').join(',');
        const valueGroups = batch.map(() => `(${placeholders})`).join(',');
        const bulkQuery = `INSERT INTO Chapter (${chapterKeys.join(
          ',',
        )}) VALUES ${valueGroups}`;

        const allValues: (string | number | null)[] = [];
        for (const chapter of batch) {
          const chapterValues = Object.values(chapter).map(value =>
            value === null || value === undefined ? null : value,
          ) as (string | number | null)[];
          allValues.push(...chapterValues);
        }

        transactionQueries.push([bulkQuery, ...allValues]);
      }
    }

    // Execute all queries in a transaction
    await transactionAsync(transactionQueries);
  } catch (error: any) {
    throw new Error(
      `Failed to restore novel "${novel.name}": ${error.message}`,
    );
  }
};

export const getAlternativeTitles = async (
  novelId: number,
): Promise<string[]> => {
  const titles = await getAllAsync<{ title: string }>([
    'SELECT title FROM AlternativeTitle WHERE novelId = ? ORDER BY title',
    [novelId],
  ]);

  return titles.map(row => row.title);
};

export const updateAlternativeTitles = async (
  novelId: number,
  titles: string[],
): Promise<void> => {
  // Clean titles: trim whitespace, remove empty strings, and remove duplicates
  const cleanTitles = [
    ...new Set(
      titles.map(title => title.trim()).filter(title => title.length > 0),
    ),
  ];

  await db.withTransactionAsync(async () => {
    // Delete all existing alternative titles for this novel
    await db.runAsync(
      'DELETE FROM AlternativeTitle WHERE novelId = ?',
      novelId,
    );

    // Insert the new titles
    for (const title of cleanTitles) {
      await db.runAsync(
        'INSERT INTO AlternativeTitle (novelId, title) VALUES (?, ?)',
        novelId,
        title,
      );
    }
  });
  await updateNovelHasMatch(novelId);
};

export const addAlternativeTitle = async (
  novelId: number,
  title: string,
): Promise<void> => {
  const trimmedTitle = title.trim();

  if (trimmedTitle && trimmedTitle.length > 0) {
    try {
      // Check if a case-insensitive match already exists
      const existingTitle = await db.getFirstAsync<{ title: string }>(
        'SELECT title FROM AlternativeTitle WHERE novelId = ? AND LOWER(title) = LOWER(?)',
        novelId,
        trimmedTitle,
      );
      if (!existingTitle) {
        await db.runAsync(
          'INSERT INTO AlternativeTitle (novelId, title) VALUES (?, ?)',
          novelId,
          trimmedTitle,
        );
        await updateNovelHasMatch(novelId);
      }
    } catch (e) {
      // Silently ignore if title already exists or other constraint violations
    }
  }
};

export const removeAlternativeTitle = async (
  novelId: number,
  title: string,
): Promise<void> => {
  await db.runAsync(
    'DELETE FROM AlternativeTitle WHERE novelId = ? AND title = ?',
    novelId,
    title.trim(),
  );
  await updateNovelHasMatch(novelId);
};

export const clearAlternativeTitles = async (
  novelId: number,
): Promise<void> => {
  await db.runAsync('DELETE FROM AlternativeTitle WHERE novelId = ?', novelId);
  await updateNovelHasMatch(novelId);
};

export const getTrackedNovelsInLibrary = async (): Promise<NovelInfo[]> => {
  return getAllAsync<NovelInfo>([
    `SELECT DISTINCT n.* FROM Novel n
     INNER JOIN tracks t ON n.id = t.novelId
     WHERE n.inLibrary = 1`,
  ]);
};
