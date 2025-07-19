import { getFirstAsync, runAsync } from '@database/utils/helpers';
import { db } from '@database/db';

export const checkExistingNovelByPath = async (
  path: string,
  pluginId: string,
) => {
  return await getFirstAsync<{ id: number; inLibrary: number }>([
    'SELECT id, inLibrary FROM Novel WHERE path = ? AND pluginId = ?',
    [path, pluginId],
  ]);
};

export const switchNovelToLibrary = async (path: string, pluginId: string) => {
  await runAsync([
    [
      'UPDATE Novel SET inLibrary = 1 WHERE path = ? AND pluginId = ?',
      [path, pluginId],
    ],
  ]);

  return await getFirstAsync<{ id: number; inLibrary: number }>([
    'SELECT id, inLibrary FROM Novel WHERE path = ? AND pluginId = ?',
    [path, pluginId],
  ]);
};

export const insertNovelForImport = async (
  novelData: any,
): Promise<number | null> => {
  const novelKeys = Object.keys(novelData);
  const novelQuery = `
    INSERT INTO Novel
    (${novelKeys.join(',')})
    VALUES (${novelKeys.map(() => '?').join(',')})
  `;

  const novelValues = Object.values(novelData).map(value =>
    value === null || value === undefined ? null : value,
  ) as (string | number | null)[];

  try {
    const result = await db.runAsync(novelQuery, novelValues);
    return result.lastInsertRowId || null;
  } catch (error: any) {
    throw new Error(`Failed to insert novel for import: ${error.message}`);
  }
};

export const insertChaptersForImport = async (
  chapters: any[],
  novelId: number,
): Promise<void> => {
  if (!chapters || chapters.length === 0) return;

  for (const chapter of chapters) {
    const chapterData = {
      ...chapter,
      novelId: novelId,
    };

    const chapterKeys = Object.keys(chapterData);
    const chapterQuery = `
      INSERT INTO Chapter
      (${chapterKeys.join(',')})
      VALUES (${chapterKeys.map(() => '?').join(',')})
    `;

    const chapterValues = Object.values(chapterData).map(value =>
      value === null || value === undefined ? null : value,
    ) as (string | number | null)[];

    await db.runAsync(chapterQuery, chapterValues);
  }
};

export const insertOrUpdateChapter = async (chapterData: {
  path: string;
  name: string;
  releaseTime?: string | null;
  novelId: number;
  chapterNumber?: number | null;
  page: string;
  position: number;
}): Promise<{ insertId: number | null; wasInserted: boolean }> => {
  try {
    const insertResult = await db.runAsync(
      `INSERT INTO Chapter (path, name, releaseTime, novelId, updatedTime, chapterNumber, page, position)
       SELECT ?, ?, ?, ?, datetime('now','localtime'), ?, ?, ?
       WHERE NOT EXISTS (SELECT id FROM Chapter WHERE path = ? AND novelId = ?)`,
      [
        chapterData.path,
        chapterData.name,
        chapterData.releaseTime || null,
        chapterData.novelId,
        chapterData.chapterNumber || null,
        chapterData.page,
        chapterData.position,
        chapterData.path,
        chapterData.novelId,
      ],
    );

    if (insertResult.lastInsertRowId) {
      return {
        insertId: insertResult.lastInsertRowId,
        wasInserted: true,
      };
    }
  } catch (error) {}

  await db.runAsync(
    `UPDATE Chapter SET
       name = ?, releaseTime = ?, updatedTime = datetime('now','localtime'), page = ?, position = ?
     WHERE path = ? AND novelId = ? AND (name != ? OR releaseTime != ? OR page != ? OR position != ?)`,
    [
      chapterData.name,
      chapterData.releaseTime || null,
      chapterData.page,
      chapterData.position,
      chapterData.path,
      chapterData.novelId,
      chapterData.name,
      chapterData.releaseTime || null,
      chapterData.page,
      chapterData.position,
    ],
  );

  return {
    insertId: null,
    wasInserted: false,
  };
};

export const updateChapterDownloadStatus = async (
  chapterId: number,
): Promise<void> => {
  await runAsync([
    ['UPDATE Chapter SET isDownloaded = 1 WHERE id = ?', [chapterId]],
  ]);
};

export const updateNovelCover = async (
  novelId: number,
  coverUri: string,
): Promise<void> => {
  await runAsync([
    ['UPDATE Novel SET cover = ? WHERE id = ?', [coverUri, novelId]],
  ]);
};
