export const createAlternativeTitleTableQuery = `
  CREATE TABLE IF NOT EXISTS AlternativeTitle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    novelId INTEGER NOT NULL,
    title TEXT NOT NULL,
    FOREIGN KEY (novelId) REFERENCES Novel(id) ON DELETE CASCADE,
    UNIQUE(novelId, title)
  );
`;

export const createAlternativeTitleIndexQuery = `
  CREATE INDEX IF NOT EXISTS AlternativeTitleIndex 
  ON AlternativeTitle(novelId, title);
`;

export const dropAlternativeTitleIndexQuery = `
  DROP INDEX IF EXISTS AlternativeTitleIndex;
`;
