import { db } from '../db';
import { ChapterInfo } from '../types';
import { dbWriteQueue } from '../utils/DbWriteQueue';
import { deleteDownloadedFiles } from './ChapterQueries';

/**
 * Batch delete chapters by criteria for multiple novels - optimized for library screen
 */
export const batchDeleteChaptersByCriteria = async (
  novels: Array<{ pluginId: string; id: number }>,
  criteria: {
    downloaded?: boolean;
    notDownloaded?: boolean;
    read?: boolean;
    unread?: boolean;
  },
) => {
  if (!novels.length) {
    return;
  }

  const conditions: string[] = [];

  if (criteria.downloaded) {
    conditions.push('isDownloaded = 1');
  }
  if (criteria.notDownloaded) {
    conditions.push('isDownloaded = 0');
  }
  if (criteria.read) {
    conditions.push('unread = 0');
  }
  if (criteria.unread) {
    conditions.push('unread = 1');
  }

  const novelIds = novels.map(n => n.id).join(',');
  const whereCondition =
    conditions.length > 0
      ? `novelId IN (${novelIds}) AND (${conditions.join(' AND ')})`
      : `novelId IN (${novelIds})`;

  await dbWriteQueue.enqueue(
    async () => {
      try {
        const chaptersToDelete = await db.getAllAsync<ChapterInfo>(
          `SELECT * FROM Chapter WHERE ${whereCondition}`,
        );

        if (chaptersToDelete.length === 0) {
          return;
        }

        // Group chapters by novel for file deletion
        const byNovel = new Map<number, ChapterInfo[]>();
        chaptersToDelete.forEach(ch => {
          if (!byNovel.has(ch.novelId)) {
            byNovel.set(ch.novelId, []);
          }
          byNovel.get(ch.novelId)!.push(ch);
        });

        // Delete files for downloaded chapters
        for (const [novelId, chapters] of byNovel) {
          const novel = novels.find(n => n.id === novelId);

          if (!novel) {
            continue;
          }

          if (!novel.pluginId) {
            continue;
          }

          const downloadedChapters = chapters.filter(c => c.isDownloaded);
          for (const chapter of downloadedChapters) {
            try {
              await deleteDownloadedFiles(novel.pluginId, novelId, chapter.id);
            } catch (e) {
              // Continue on individual file deletion errors
            }
          }
        }

        const ids = chaptersToDelete.map(c => c.id).join(',');
        await db.execAsync(`DELETE FROM Chapter WHERE id IN (${ids})`);

        // Update counts for affected novels
        const affectedNovelIds = Array.from(byNovel.keys());
        if (affectedNovelIds.length > 0) {
          const novelIdsStr = affectedNovelIds.join(',');
          await db.execAsync(`
            UPDATE Novel 
            SET 
              chaptersUnread = (SELECT COUNT(*) FROM Chapter WHERE novelId = Novel.id AND unread = 1),
              chaptersDownloaded = (SELECT COUNT(*) FROM Chapter WHERE novelId = Novel.id AND isDownloaded = 1)
            WHERE id IN (${novelIdsStr})
          `);
        }
      } catch (error) {
        throw error;
      }
    },
    {
      taskType: 'OTHER',
      label: 'batchDeleteChaptersByCriteria',
      transactional: true,
    },
  );
};
