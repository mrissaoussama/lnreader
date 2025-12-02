import { showToast } from '@utils/showToast';
import {
  ChapterInfo,
  DownloadedChapter,
  UpdateOverview,
  Update,
} from '../types';
import { ChapterItem } from '@plugins/types';

import { getString } from '@strings/translations';
import { NOVEL_STORAGE } from '@utils/Storages';
import { db } from '@database/db';
import NativeFile from '@specs/NativeFile';
import { dbWriteQueue } from '@database/utils/DbWriteQueue';

// #region Mutations

export const insertChapters = async (
  novelId: number,
  chapters?: ChapterItem[],
  options?: { transactional?: boolean },
) => {
  if (!chapters?.length) {
    return;
  }

  const transactional = options?.transactional !== false;

  const exec = async () => {
    const statement = db.prepareSync(`
        INSERT INTO Chapter (path, name, releaseTime, novelId, chapterNumber, page, position)
        VALUES (?, ?, ?, ${novelId}, ?, ?, ?)
        ON CONFLICT(path, novelId) DO UPDATE SET
        page = excluded.page,
        position = excluded.position,
        name = excluded.name,
        releaseTime = excluded.releaseTime,
        chapterNumber = excluded.chapterNumber;
        `);
    try {
      chapters.map((chapter, index) =>
        statement.executeSync(
          chapter.path,
          chapter.name ?? 'Chapter ' + (index + 1),
          chapter.releaseTime || '',
          chapter.chapterNumber || null,
          chapter.page || '1',
          index,
        ),
      );
    } finally {
      statement.finalizeSync();
    }
  };

  if (transactional) {
    await db.withTransactionAsync(exec).catch();
  } else {
    await exec().catch(() => {});
  }
};

export const markChapterRead = (chapterId: number) =>
  db.runAsync('UPDATE Chapter SET `unread` = 0 WHERE id = ?', chapterId);

export const markChaptersRead = (chapterIds: number[]) =>
  db.execAsync(
    `UPDATE Chapter SET \`unread\` = 0 WHERE id IN (${chapterIds.join(',')})`,
  );

export const markChapterUnread = (chapterId: number) =>
  db.runAsync('UPDATE Chapter SET `unread` = 1 WHERE id = ?', chapterId);

export const markChaptersUnread = (chapterIds: number[]) =>
  db.execAsync(
    `UPDATE Chapter SET \`unread\` = 1 WHERE id IN (${chapterIds.join(',')})`,
  );

export const markAllChaptersRead = (novelId: number) =>
  db.runAsync('UPDATE Chapter SET `unread` = 0 WHERE novelId = ?', novelId);

export const markAllChaptersUnread = (novelId: number) =>
  db.runAsync('UPDATE Chapter SET `unread` = 1 WHERE novelId = ?', novelId);

export const deleteDownloadedFiles = async (
  pluginId: string,
  novelId: number,
  chapterId: number,
) => {
  try {
    const chapterFolder = `${NOVEL_STORAGE}/${pluginId}/${novelId}/${chapterId}`;
    NativeFile.unlink(chapterFolder);
  } catch {
    throw new Error(getString('novelScreen.deleteChapterError'));
  }
};

// delete downloaded chapter
export const deleteChapter = async (
  pluginId: string,
  novelId: number,
  chapterId: number,
) => {
  try {
    await deleteDownloadedFiles(pluginId, novelId, chapterId);
    await db.runAsync(
      'UPDATE Chapter SET isDownloaded = 0 WHERE id = ?',
      chapterId,
    );
  } catch (error) {
    // Re-throw the error to be handled by the caller
    throw error;
  }
};

export const deleteChapters = async (
  pluginId: string,
  novelId: number,
  chapters?: ChapterInfo[],
) => {
  if (!chapters?.length) {
    return;
  }

  await dbWriteQueue.enqueue(
    async () => {
      const chapterIdsString = chapters?.map(chapter => chapter.id).toString();

      await db.withTransactionAsync(async () => {
        // Batch file deletions to avoid overwhelming the bridge/FS
        const BATCH_SIZE = 50;
        for (let i = 0; i < chapters.length; i += BATCH_SIZE) {
          const batch = chapters.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(chapter =>
              deleteDownloadedFiles(pluginId, novelId, chapter.id),
            ),
          );
        }

        await db.execAsync(
          `UPDATE Chapter SET isDownloaded = 0 WHERE id IN (${chapterIdsString})`,
        );
      });
    },
    {
      taskType: 'OTHER',
      label: 'deleteChapters',
    },
  );
};

export const deleteChaptersByCriteria = async (
  pluginId: string,
  novelId: number,
  criteria: {
    downloaded?: boolean;
    notDownloaded?: boolean;
    read?: boolean;
    unread?: boolean;
  },
) => {
  let where = 'novelId = ?';
  const args: any[] = [novelId];

  if (criteria.downloaded) {
    where += ' AND isDownloaded = 1';
  }
  if (criteria.notDownloaded) {
    where += ' AND isDownloaded = 0';
  }
  if (criteria.read) {
    where += ' AND unread = 0';
  }
  if (criteria.unread) {
    where += ' AND unread = 1';
  }

  await dbWriteQueue.enqueue(
    async () => {
      const chaptersToDelete = await db.getAllAsync<ChapterInfo>(
        `SELECT * FROM Chapter WHERE ${where}`,
        ...args,
      );

      if (chaptersToDelete.length === 0) {
        return;
      }

      await db.withTransactionAsync(async () => {
        // Delete files sequentially with error handling
        const downloadedChapters = chaptersToDelete.filter(c => c.isDownloaded);

        for (const chapter of downloadedChapters) {
          try {
            await deleteDownloadedFiles(pluginId, novelId, chapter.id);
          } catch (e) {
            // Continue on individual file deletion errors
          }
        }

        // Delete chapters from database
        const ids = chaptersToDelete.map(c => c.id).join(',');
        await db.execAsync(`DELETE FROM Chapter WHERE id IN (${ids})`);
      });
    },
    {
      taskType: 'OTHER',
      label: 'deleteChaptersByCriteria',
    },
  );
};

export const deleteDownloads = async (chapters: DownloadedChapter[]) => {
  if (!chapters?.length) {
    return;
  }

  await dbWriteQueue.enqueue(
    async () => {
      const chapterIdsString = chapters.map(chapter => chapter.id).join(',');

      await db.withTransactionAsync(async () => {
        // Delete files sequentially with error handling
        for (const chapter of chapters) {
          try {
            await deleteDownloadedFiles(
              chapter.pluginId,
              chapter.novelId,
              chapter.id,
            );
          } catch (e) {
            // Continue on individual file deletion errors
          }
        }

        await db.execAsync(
          `UPDATE Chapter SET isDownloaded = 0 WHERE id IN (${chapterIdsString})`,
        );
      });
    },
    {
      taskType: 'OTHER',
      label: 'deleteDownloads',
    },
  );

  showToast(
    `${getString('common.delete')} ${chapters.length} ${getString(
      'downloadScreen.downloadsLower',
    )}`,
  );
};

export const deleteReadDownloadedChapters = async () => {
  await dbWriteQueue.enqueue(
    async () => {
      const chapters = await getReadDownloadedChapters();
      if (!chapters || chapters.length === 0) return;

      // Batch file deletions
      const BATCH_SIZE = 50;
      for (let i = 0; i < chapters.length; i += BATCH_SIZE) {
        const batch = chapters.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(chapter =>
            deleteDownloadedFiles(
              chapter.pluginId,
              chapter.novelId,
              chapter.novelId,
            ),
          ),
        );
      }

      const chapterIdsString = chapters?.map(chapter => chapter.id).toString();
      await db.execAsync(
        `UPDATE Chapter SET isDownloaded = 0 WHERE id IN (${chapterIdsString})`,
      );
    },
    {
      taskType: 'OTHER',
      label: 'deleteReadDownloadedChapters',
    },
  );
  showToast(getString('novelScreen.readChaptersDeleted'));
};

/**
 * Clear chapters from DB by chapter IDs (batch deletion)
 * This permanently removes chapters from the database
 */
export const clearChaptersByIds = async (
  pluginId: string,
  novelId: number,
  chapterIds: number[],
) => {
  if (!chapterIds || chapterIds.length === 0) {
    return;
  }

  await dbWriteQueue.enqueue(
    async () => {
      await db.withTransactionAsync(async () => {
        // First, get the chapters to check which are downloaded
        const chaptersToDelete = await db.getAllAsync<ChapterInfo>(
          `SELECT * FROM Chapter WHERE id IN (${chapterIds.join(',')})`,
        );

        // Delete downloaded files for chapters that are downloaded
        const downloadedChapters = chaptersToDelete.filter(c => c.isDownloaded);
        for (const chapter of downloadedChapters) {
          try {
            await deleteDownloadedFiles(pluginId, novelId, chapter.id);
          } catch (e) {
            // Continue even if file deletion fails
          }
        }

        // Delete chapters from DB in single query
        await db.execAsync(
          `DELETE FROM Chapter WHERE id IN (${chapterIds.join(',')})`,
        );
      });
    },
    {
      taskType: 'OTHER',
      label: 'clearChaptersByIds',
    },
  );

  showToast(
    `${getString('common.delete')} ${chapterIds.length} ${getString(
      'common.chapters',
    )}`,
  );
};

/**
 * Delete downloaded files by chapter IDs (batch operation)
 * This only removes downloaded files and marks isDownloaded = 0
 */
export const deleteDownloadsByIds = async (
  pluginId: string,
  novelId: number,
  chapterIds: number[],
) => {
  if (!chapterIds || chapterIds.length === 0) {
    return;
  }

  await dbWriteQueue.enqueue(
    async () => {
      await db.withTransactionAsync(async () => {
        // Get chapters that are actually downloaded
        const downloadedChapters = await db.getAllAsync<ChapterInfo>(
          `SELECT * FROM Chapter WHERE id IN (${chapterIds.join(
            ',',
          )}) AND isDownloaded = 1`,
        );

        if (downloadedChapters.length === 0) {
          return;
        }

        // Delete downloaded files
        for (const chapter of downloadedChapters) {
          try {
            await deleteDownloadedFiles(pluginId, novelId, chapter.id);
          } catch (e) {
            // Continue even if file deletion fails
          }
        }

        // Mark as not downloaded in single query
        await db.execAsync(
          `UPDATE Chapter SET isDownloaded = 0 WHERE id IN (${chapterIds.join(
            ',',
          )})`,
        );
      });
    },
    {
      taskType: 'OTHER',
      label: 'deleteDownloadsByIds',
    },
  );

  showToast(`${getString('common.delete')} downloads`);
};

export const updateChapterProgress = (chapterId: number, progress: number) =>
  db.runAsync(
    'UPDATE Chapter SET progress = ? WHERE id = ?',
    progress,
    chapterId,
  );

export const updateChapterProgressByIds = (
  chapterIds: number[],
  progress: number,
) =>
  db.runAsync(
    `UPDATE Chapter SET progress = ? WHERE id in (${chapterIds.join(',')})`,
    progress,
  );

export const bookmarkChapter = (chapterId: number) =>
  db.runAsync(
    'UPDATE Chapter SET bookmark = (CASE WHEN bookmark = 0 THEN 1 ELSE 0 END) WHERE id = ?',
    chapterId,
  );

export const markPreviuschaptersRead = (chapterId: number, novelId: number) =>
  db.runAsync(
    'UPDATE Chapter SET `unread` = 0 WHERE id <= ? AND novelId = ?',
    chapterId,
    novelId,
  );

export const markPreviousChaptersUnread = (
  chapterId: number,
  novelId: number,
) =>
  db.runAsync(
    'UPDATE Chapter SET `unread` = 1 WHERE id <= ? AND novelId = ?',
    chapterId,
    novelId,
  );

export const clearUpdates = () =>
  db.execAsync('UPDATE Chapter SET updatedTime = NULL');

// #endregion
// #region Selectors

export const getCustomPages = (novelId: number) =>
  db.getAllSync<{ page: string }>(
    'SELECT DISTINCT page from Chapter WHERE novelId = ?',
    novelId,
  );

export const getNovelChapters = (novelId: number) =>
  db.getAllAsync<ChapterInfo>(
    'SELECT * FROM Chapter WHERE novelId = ?',
    novelId,
  );

export const getChapter = (chapterId: number) =>
  db.getFirstAsync<ChapterInfo>(
    'SELECT * FROM Chapter WHERE id = ?',
    chapterId,
  );

const getPageChaptersQuery = (
  sort = 'ORDER BY position ASC',
  filter = '',
  limit?: number,
  offset?: number,
) =>
  `
    SELECT * FROM Chapter 
    WHERE novelId = ? AND page = ? 
    ${filter} ${sort} 
    ${limit ? `LIMIT ${limit}` : ''} 
    ${offset ? `OFFSET ${offset}` : ''}`;

export const getPageChapters = (
  novelId: number,
  sort?: string,
  filter?: string,
  page?: string,
  offset?: number,
  limit?: number,
) => {
  return db.getAllAsync<ChapterInfo>(
    getPageChaptersQuery(sort, filter, limit, offset),
    novelId,
    page || '1',
  );
};

export const getChapterCount = (novelId: number, page: string = '1') =>
  db.getFirstSync<{ 'COUNT(*)': number }>(
    'SELECT COUNT(*) FROM Chapter WHERE novelId = ? AND page = ?',
    novelId,
    page,
  )?.['COUNT(*)'] ?? 0;

export const getPageChaptersBatched = (
  novelId: number,
  sort?: string,
  filter?: string,
  page?: string,
  batch: number = 0,
) => {
  return db.getAllSync<ChapterInfo>(
    getPageChaptersQuery(sort, filter, 300, 300 * batch),
    novelId,
    page || '1',
  );
};

export const getPrevChapter = (
  novelId: number,
  chapterPosition: number,
  page: string,
) =>
  db.getFirstAsync<ChapterInfo>(
    `SELECT * FROM Chapter 
      WHERE novelId = ? 
      AND (
        (position < ? AND page = ?) 
        OR page < ?
      )
      ORDER BY position DESC, page DESC`,
    novelId,
    chapterPosition,
    page,
    page,
  );

export const getNextChapter = (
  novelId: number,
  chapterPosition: number,
  page: string,
) =>
  db.getFirstAsync<ChapterInfo>(
    `SELECT * FROM Chapter 
      WHERE novelId = ? 
      AND (
        (page = ? AND position > ?)  
        OR (position = 0 AND page > ?) 
      )
      ORDER BY position ASC, page ASC`,
    novelId,
    page,
    chapterPosition,
    page,
  );

const getReadDownloadedChapters = () =>
  db.getAllAsync<DownloadedChapter>(`
        SELECT Chapter.id, Chapter.novelId, pluginId 
        FROM Chapter
        JOIN Novel
        ON Novel.id = Chapter.novelId AND unread = 0 AND isDownloaded = 1`);

export const getDownloadedChapters = () =>
  db.getAllAsync<DownloadedChapter>(`
    SELECT
      Chapter.*,
      Novel.pluginId, Novel.name as novelName, Novel.cover as novelCover, Novel.path as novelPath
    FROM Chapter
    JOIN Novel
    ON Chapter.novelId = Novel.id
    WHERE Chapter.isDownloaded = 1
  `);

export const getUpdatedOverviewFromDb = () =>
  db.getAllAsync<UpdateOverview>(`SELECT
  Novel.id AS novelId,
  Novel.name AS novelName,
  Novel.cover AS novelCover,
  Novel.path AS novelPath,
  DATE(Chapter.updatedTime) AS updateDate, -- Extract the date from updatedTime
  COUNT(*) AS updatesPerDay
FROM
  Chapter
JOIN
  Novel
ON
  Chapter.novelId = Novel.id
WHERE
  Chapter.updatedTime IS NOT NULL
GROUP BY
  Novel.id,
  Novel.name,
  Novel.cover,
  Novel.path,
  DATE(Chapter.updatedTime) -- Group by date and novelId
ORDER BY
  novelId,
  updateDate;

`);

export const getDetailedUpdatesFromDb = async (
  novelId: number,
  onlyDownloadableChapters?: boolean,
) => {
  const result = db.getAllAsync<Update>(
    `
SELECT
  Chapter.*,
  pluginId, Novel.id as novelId, Novel.name as novelName, Novel.path as novelPath, cover as novelCover
FROM
  Chapter
JOIN
  Novel
  ON Chapter.novelId = Novel.id
WHERE novelId = ?  ${
      onlyDownloadableChapters
        ? 'AND Chapter.isDownloaded = 1 '
        : 'AND updatedTime IS NOT NULL'
    }
ORDER BY updatedTime DESC; 
`,
    novelId,
  );

  return await result;
};

export const isChapterDownloaded = (chapterId: number) =>
  !!db.getFirstSync<ChapterInfo>(
    'SELECT * FROM Chapter WHERE id = ? AND isDownloaded = 1',
    chapterId,
  );
export const getTotalReadChaptersCount = novelId => {
  const result =
    db.getFirstSync(
      `SELECT COUNT(*) as totalRead
     FROM Chapter 
     WHERE novelId = ? AND unread = 0`,
      novelId,
    )?.totalRead ?? 0;
  return result;
};
export const getHighestReadChapterNumber = novelId => {
  const resultByNumber =
    db.getFirstSync(
      `SELECT 
      COALESCE(MAX(chapterNumber), 0) as highestChapter
     FROM Chapter 
     WHERE novelId = ? AND unread = 0 AND chapterNumber IS NOT NULL`,
      novelId,
    )?.highestChapter ?? 0;
  if (resultByNumber === 0) {
    const resultByPosition =
      db.getFirstSync(
        `SELECT 
        COALESCE(MAX(position), 0) as highestPosition
       FROM Chapter 
       WHERE novelId = ? AND unread = 0`,
        novelId,
      )?.highestPosition ?? 0;
    return resultByPosition > 0 ? resultByPosition + 1 : 0;
  }
  return resultByNumber;
};
