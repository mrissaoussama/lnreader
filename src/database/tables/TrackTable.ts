export const createTrackTableQuery = `CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  novelId INTEGER NOT NULL,
  source TEXT NOT NULL,
  sourceId TEXT NOT NULL,
  title TEXT NOT NULL,
  lastChapterRead INTEGER DEFAULT 0,
  totalChapters INTEGER,
  status TEXT DEFAULT 'Reading',
  score INTEGER,
  startDate TEXT,
  finishDate TEXT,
  notes TEXT,
  metadata TEXT,
  lastSyncAt TEXT DEFAULT CURRENT_TIMESTAMP,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(novelId, source),
  FOREIGN KEY(novelId) REFERENCES Novel(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tracks_novel_id ON tracks(novelId);
CREATE INDEX IF NOT EXISTS idx_tracks_source ON tracks(source);`;
