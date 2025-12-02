import { db } from '@database/db';

/**
 * Detects how cover images are stored in the Novel table.
 * Returns mode 'blob' if the cover column is BLOB; otherwise 'path'.
 * Also returns which column to use: 'coverPath' if present; otherwise 'cover'.
 */
export const detectCoverStorage = async (): Promise<{
  mode: 'blob' | 'path';
  column: 'cover' | 'coverPath';
}> => {
  try {
    const rows = await db.getAllAsync<{ name: string; type: string }>(
      "PRAGMA table_info('Novel')",
    );
    let column: 'cover' | 'coverPath' = 'cover';
    let coverType = 'TEXT';
    for (const row of rows) {
      const name = (row as any).name as string;
      const type = ((row as any).type || '').toString().toUpperCase();
      if (name === 'coverPath') {
        column = 'coverPath';
      }
      if (name === 'cover') {
        coverType = type || 'TEXT';
      }
    }
    const mode: 'blob' | 'path' = coverType.includes('BLOB') ? 'blob' : 'path';
    return { mode, column };
  } catch {
    return { mode: 'path', column: 'cover' };
  }
};

/**
 * Alias for detectCoverStorage that matches the naming in BackupQueries.
 * Returns pathColumn instead of column for compatibility.
 */
export const detectCoverSchema = async (): Promise<{
  mode: 'blob' | 'path';
  pathColumn: 'cover' | 'coverPath';
}> => {
  const { mode, column } = await detectCoverStorage();
  return { mode, pathColumn: column };
};
