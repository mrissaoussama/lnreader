import { db } from '@database/db';

export interface NovelNote {
  id: number;
  novelId: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const getNovelNote = async (
  novelId: number,
): Promise<NovelNote | null> => {
  return await db.getFirstAsync<NovelNote>(
    'SELECT * FROM Note WHERE novelId = ?',
    [novelId],
  );
};

export const saveNovelNote = async (
  novelId: number,
  content: string,
): Promise<void> => {
  await db.runAsync(
    `INSERT OR REPLACE INTO Note (novelId, content, createdAt, updatedAt) 
     VALUES (?, ?, 
       COALESCE((SELECT createdAt FROM Note WHERE novelId = ?), datetime('now','localtime')),
       datetime('now','localtime'))`,
    [novelId, content, novelId],
  );
};

export const deleteNovelNote = async (novelId: number): Promise<void> => {
  await db.runAsync('DELETE FROM Note WHERE novelId = ?', [novelId]);
};

export const getAllNotes = async (): Promise<NovelNote[]> => {
  return await db.getAllAsync<NovelNote>(
    'SELECT * FROM Note ORDER BY updatedAt DESC',
  );
};

export const deleteAllNotes = async (): Promise<void> => {
  await db.runAsync('DELETE FROM Note');
};

export const hasNote = async (novelId: number): Promise<boolean> => {
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM Note WHERE novelId = ? AND content != ""',
    [novelId],
  );
  return (result?.count ?? 0) > 0;
};

export interface BackupNote {
  pluginId: string;
  path: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const getAllNotesForBackup = async (): Promise<BackupNote[]> => {
  return await db.getAllAsync<BackupNote>(
    `SELECT n.pluginId, n.path, note.content, note.createdAt, note.updatedAt
     FROM Note note
     JOIN Novel n ON note.novelId = n.id
     WHERE note.content != ""
     ORDER BY note.updatedAt DESC`,
  );
};

export const restoreNotesFromBackup = async (
  backupNotes: BackupNote[],
): Promise<void> => {
  if (!backupNotes || backupNotes.length === 0) return;

  for (const backupNote of backupNotes) {
    try {
      const novel = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM Novel WHERE pluginId = ? AND path = ?',
        [backupNote.pluginId, backupNote.path],
      );

      if (!novel) {
        continue;
      }

      const existingNote = await getNovelNote(novel.id);

      if (!existingNote) {
        await saveNovelNote(novel.id, backupNote.content);
        continue;
      }

      const backupContent = backupNote.content.trim();
      const existingContent = existingNote.content.trim();

      if (backupContent === existingContent) {
        continue;
      }

      if (existingContent.includes(backupContent)) {
        continue;
      }

      if (backupContent.includes(existingContent)) {
        await saveNovelNote(novel.id, backupContent);
        continue;
      }

      const backupDate = new Date(backupNote.updatedAt).toLocaleDateString();
      const separator = `\n\n--- Backup (${backupDate}) ---\n`;
      const mergedContent = existingContent + separator + backupContent;

      await saveNovelNote(novel.id, mergedContent);
    } catch (error) {
      continue;
    }
  }
};
