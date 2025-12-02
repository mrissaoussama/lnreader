import { fetchNovel, fetchPage } from '../plugin/fetch';
import { ChapterItem, SourceNovel } from '@plugins/types';
import { getPlugin, LOCAL_PLUGIN_ID } from '@plugins/pluginManager';
import { downloadFile } from '@plugins/helpers/fetch';
import ServiceManager from '@services/ServiceManager';
import { db } from '@database/db';
import NativeFile from '@specs/NativeFile';
import { getNovelById } from '@database/queries/NovelQueries';
import { detectCoverStorage } from '@utils/detectCoverStorage';
import { dbWriteQueue } from '@database/utils/DbWriteQueue';
import { StorageManager } from '@utils/StorageManager';

const updateNovelMetadata = async (
  pluginId: string,
  novelId: number,
  novel: SourceNovel,
) => {
  const { name, summary, author, artist, genres, status, totalPages } = novel;
  let coverValue = novel.cover;

  // Detect cover storage mode first
  const { mode, column } = await detectCoverStorage();

  if (coverValue) {
    try {
      const novelDir = StorageManager.getNovelDirectory(pluginId, novelId);

      // Ensure directory exists before any file operations
      if (!(await NativeFile.exists(novelDir))) {
        await NativeFile.mkdir(novelDir);
      }

      const tempCoverPath = novelDir + '/cover.png';

      // Download the cover file
      await downloadFile(
        coverValue,
        tempCoverPath,
        getPlugin(pluginId)?.imageRequestInit,
      );

      // Verify the file was actually downloaded
      if (!(await NativeFile.exists(tempCoverPath))) {
        throw new Error('Cover file was not created after download');
      }

      if (mode === 'blob') {
        // For blob mode, check if readFileAsBase64 is available
        if (typeof NativeFile.readFileAsBase64 !== 'function') {
          // Fall back to path mode if function not available
          const novelCoverUri = 'file://' + tempCoverPath;
          coverValue = novelCoverUri + '?' + Date.now();
        } else {
          // Read as base64 for blob storage
          const base64Data = await NativeFile.readFileAsBase64(tempCoverPath);
          if (base64Data) {
            coverValue = base64Data;

            // Clean up the file since we only need base64
            try {
              await NativeFile.unlink(tempCoverPath);
            } catch {
              // Ignore cleanup errors
            }
          } else {
            throw new Error('Failed to read cover as base64');
          }
        }
      } else {
        // For path mode, keep the file and store the path
        const novelCoverUri = 'file://' + tempCoverPath;
        coverValue = novelCoverUri + '?' + Date.now();
      }
    } catch (error) {
      // Keep the existing cover value from database instead of setting to null
      try {
        const existingNovel = await getNovelById(novelId);
        if (existingNovel) {
          coverValue =
            column === 'coverPath'
              ? (existingNovel as any).coverPath
              : existingNovel.cover;
        } else {
          coverValue = null;
        }
      } catch {
        coverValue = null;
      }
    }
  }

  await dbWriteQueue.enqueue(
    async () => {
      // Use the correct column name based on detection
      const coverColumn = column === 'coverPath' ? 'coverPath' : 'cover';
      const updateQuery = `UPDATE Novel SET
        name = ?, ${coverColumn} = ?, summary = ?, author = ?, artist = ?,
        genres = ?, status = ?, totalPages = ?
        WHERE id = ?`;

      await db.runAsync(updateQuery, [
        name,
        coverValue || null,
        summary || null,
        author || 'unknown',
        artist || null,
        genres || null,
        status || null,
        totalPages || 0,
        novelId,
      ]);
    },
    {
      taskType: 'UPDATE_LIBRARY',
      persistentData: {
        novelId,
        updates: {
          name,
          [column === 'coverPath' ? 'coverPath' : 'cover']: coverValue || null,
          summary: summary || null,
          author: author || 'unknown',
          artist: artist || null,
          genres: genres || null,
          status: status || null,
          totalPages: totalPages || 0,
        },
      },
    },
  );
};

const updateNovelTotalPages = async (novelId: number, totalPages: number) => {
  await dbWriteQueue.enqueue(
    async () => {
      await db.runAsync('UPDATE Novel SET totalPages = ? WHERE id = ?', [
        totalPages,
        novelId,
      ]);
    },
    {
      taskType: 'UPDATE_LIBRARY',
      persistentData: {
        novelId,
        updates: { totalPages },
      },
    },
  );
};

const updateNovelChapters = (
  novelName: string,
  novelId: number,
  chapters: ChapterItem[],
  downloadNewChapters?: boolean,
  page?: string,
) =>
  dbWriteQueue.enqueue(async () => {
    const novel = await getNovelById(novelId);
    const pluginId = novel?.pluginId || '';

    // Validate chapters array
    if (!chapters || !Array.isArray(chapters)) {
      throw new Error(
        `Invalid chapters data for novel ${novelName}: expected array but got ${typeof chapters}`,
      );
    }

    const newChapterIds: number[] = [];

    for (let position = 0; position < chapters.length; position++) {
      const chapter = chapters[position];

      // Validate chapter object
      if (!chapter || typeof chapter !== 'object') {
        continue;
      }

      const {
        name,
        path,
        releaseTime,
        page: customPage,
        chapterNumber,
      } = chapter;

      // Skip chapters without required data
      if (!name || !path) {
        continue;
      }

      const chapterPage = page || customPage || '1';

      try {
        // Try to insert the chapter using a simple query instead of prepared statement
        const insertResult = await db.runAsync(
          `INSERT INTO Chapter (path, name, releaseTime, novelId, updatedTime, chapterNumber, page, position)
           SELECT ?, ?, ?, ?, datetime('now','localtime'), ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM Chapter WHERE path = ? AND novelId = ?)`,
          [
            path,
            name,
            releaseTime || null,
            novelId,
            chapterNumber || null,
            chapterPage,
            position,
            path,
            novelId,
          ],
        );

        const insertId = (insertResult as any).lastInsertRowId;

        if (insertId && insertId > 0) {
          // New chapter was inserted
          if (downloadNewChapters) {
            newChapterIds.push(insertId);
          }
        } else {
          // Chapter already exists, update it
          try {
            await db.runAsync(
              `UPDATE Chapter SET
                name = ?, releaseTime = ?, updatedTime = datetime('now','localtime'), page = ?, position = ?
              WHERE path = ? AND novelId = ?`,
              [name, releaseTime || null, chapterPage, position, path, novelId],
            );
          } catch (updateError) {}
        }
      } catch (error) {
        // Continue with other chapters
      }
    }

    if (newChapterIds.length > 0) {
      ServiceManager.manager.addTask({
        name: 'DOWNLOAD_NOVEL',
        data: {
          novelId,
          pluginId,
          novelName,
          novelCover: novel?.cover,
          chapters: newChapterIds,
        },
      });
    }
  });

const updateNovel = async (
  pluginId: string,
  novelPath: string,
  novelId: number,
  options: UpdateNovelOptions,
) => {
  if (pluginId === LOCAL_PLUGIN_ID) {
    return;
  }

  const { downloadNewChapters, refreshNovelMetadata } = options;

  // Fetch novel data
  const novel = await fetchNovel(pluginId, novelPath);

  // Validate novel data
  if (!novel || typeof novel !== 'object') {
    throw new Error(
      `Plugin ${pluginId} returned invalid novel data: ${typeof novel}`,
    );
  }

  if (!novel.name) {
    throw new Error(`Plugin ${pluginId} returned novel without a name`);
  }

  if (refreshNovelMetadata) {
    await updateNovelMetadata(pluginId, novelId, novel);
  } else if (novel.totalPages) {
    // at least update totalPages,
    await updateNovelTotalPages(novelId, novel.totalPages);
  }

  // Protect against null or undefined chapters
  const chapters = novel.chapters || [];
  if (!Array.isArray(chapters)) {
    throw new Error(
      `Invalid chapters data for novel ${
        novel.name
      }: expected array but got ${typeof chapters}`,
    );
  }

  await updateNovelChapters(novel.name, novelId, chapters, downloadNewChapters);
};

const updateNovelPage = async (
  pluginId: string,
  novelPath: string,
  novelId: number,
  page: string,
  options: Pick<UpdateNovelOptions, 'downloadNewChapters'>,
) => {
  const { downloadNewChapters } = options;
  const sourcePage = await fetchPage(pluginId, novelPath, page);

  // Validate page data
  if (!sourcePage || typeof sourcePage !== 'object') {
    throw new Error(
      `Plugin ${pluginId} returned invalid page data for page ${page}`,
    );
  }

  const novel = await getNovelById(novelId);
  const novelName = novel?.name || '';

  // Validate chapters
  const chapters = sourcePage.chapters || [];
  if (!Array.isArray(chapters)) {
    throw new Error(
      `Invalid chapters data in page ${page}: expected array but got ${typeof chapters}`,
    );
  }

  await updateNovelChapters(
    novelName,
    novelId,
    chapters,
    downloadNewChapters,
    page,
  );
};

export interface UpdateNovelOptions {
  downloadNewChapters?: boolean;
  refreshNovelMetadata?: boolean;
}

export { updateNovel, updateNovelPage, updateNovelChapters };
