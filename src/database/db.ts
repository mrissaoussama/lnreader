import * as SQLite from 'expo-sqlite';
import {
  createCategoriesTableQuery,
  createCategoryTriggerQuery,
} from './tables/CategoryTable';
import {
  createNovelIndexQuery,
  createNovelTableQuery,
  createNovelTriggerQueryDelete,
  createNovelTriggerQueryInsert,
  createNovelTriggerQueryUpdate,
  dropNovelIndexQuery,
} from './tables/NovelTable';
import {
  createAlternativeTitleTableQuery,
  createAlternativeTitleIndexQuery,
  dropAlternativeTitleIndexQuery,
} from './tables/AlternativeTitleTable';
import { createNovelCategoryTableQuery } from './tables/NovelCategoryTable';
import {
  createChapterTableQuery,
  createChapterIndexQuery,
  dropChapterIndexQuery,
} from './tables/ChapterTable';
import {
  createNotesTableQuery,
  createNotesIndexQuery,
  createNotesTriggerQuery,
  dropNotesIndexQuery,
} from './tables/NotesTable';

import { createRepositoryTableQuery } from './tables/RepositoryTable';
import { showToast } from '@utils/showToast';
import { getString } from '@strings/translations';
import { createTrackTableQuery } from './tables/TrackTable';
const dbName = 'lnreader.db';

export const db = SQLite.openDatabaseSync(dbName);

// Utility helpers for defensive migrations
function columnExists(table: string, column: string): boolean {
  try {
    const rows = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
    return rows.some(r => r.name === column);
  } catch {
    return false;
  }
}
// (tableExists utility removed as unused)

export const createTables = () => {
  // PRAGMAs each start
  db.execSync('PRAGMA busy_timeout = 5000');
  db.execSync('PRAGMA cache_size = 10000');
  db.execSync('PRAGMA foreign_keys = ON');
  db.execSync('PRAGMA journal_mode = WAL');
  db.execSync('PRAGMA synchronous = NORMAL');
  db.execSync('PRAGMA temp_store = MEMORY');

  let userVersion =
    db.getFirstSync<{ user_version: number }>('PRAGMA user_version')
      ?.user_version ?? 0;

  // If fresh (version 0) ensure base tables exist (idempotent with IF NOT EXISTS)
  if (userVersion === 0) {
    db.withTransactionSync(() => {
      db.runSync(createNovelTableQuery);
      db.runSync(createNovelIndexQuery);
      db.runSync(createChapterTableQuery);
      db.runSync(createChapterIndexQuery);
      db.runSync(createCategoriesTableQuery);
      try {
        // safer default categories
        db.runSync(
          'INSERT OR IGNORE INTO Category (id,name,sort) VALUES (1, ?, 1)',
          [
            ((getString as any)
              ? (getString as any)('categories.default')
              : 'Default') as any,
          ],
        );
        db.runSync(
          'INSERT OR IGNORE INTO Category (id,name,sort) VALUES (2, ?, 2)',
          [
            ((getString as any)
              ? (getString as any)('categories.local')
              : 'Local') as any,
          ],
        );
      } catch {}
      db.runSync(createCategoryTriggerQuery);
      db.runSync(createAlternativeTitleTableQuery);
      db.runSync(createAlternativeTitleIndexQuery);
      db.runSync(createNovelCategoryTableQuery);
      db.runSync(createNotesTableQuery);
      db.runSync(createNotesIndexQuery);
      db.runSync(createNotesTriggerQuery);
      db.runSync(createRepositoryTableQuery);
      db.runSync(createTrackTableQuery);
      db.runSync(createNovelTriggerQueryInsert);
      db.runSync(createNovelTriggerQueryUpdate);
      db.runSync(createNovelTriggerQueryDelete);
    });
  }

  // Sequential guarded migrations
  if (userVersion < 1) {
    updateToDBVersion1();
    userVersion = 1;
  }
  if (userVersion < 2) {
    updateToDBVersion2();
    userVersion = 2;
  }
  if (userVersion < 3) {
    updateToDBVersion3();
    userVersion = 3;
  }
  if (userVersion < 4) {
    updateToDBVersion4();
    userVersion = 4;
  }
  if (userVersion < 5) {
    updateToDBVersion5();
    userVersion = 5;
  }
  if (userVersion < 6) {
    updateToDBVersion6();
    userVersion = 6;
  }
};

export const recreateDBIndex = () => {
  try {
    db.execSync('PRAGMA analysis_limit=4000');
    db.execSync('PRAGMA optimize');

    db.execSync('PRAGMA journal_mode = WAL');
    db.execSync('PRAGMA foreign_keys = ON');
    db.execSync('PRAGMA synchronous = NORMAL');
    db.execSync('PRAGMA cache_size = 10000');
    db.execSync('PRAGMA temp_store = MEMORY');
    db.execSync('PRAGMA busy_timeout = 5000');
    db.withTransactionSync(() => {
      db.runSync(dropNovelIndexQuery);
      db.runSync(dropChapterIndexQuery);
      db.runSync(dropNotesIndexQuery);
      db.runSync(dropAlternativeTitleIndexQuery);
      db.runSync(createNovelIndexQuery);
      db.runSync(createChapterIndexQuery);
      db.runSync(createNotesIndexQuery);
      db.runSync(createAlternativeTitleIndexQuery);
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    showToast(message);
  }
};

function updateToDBVersion1() {
  db.withTransactionSync(() => {
    const cols = [
      ['chaptersDownloaded', 'INTEGER DEFAULT 0'],
      ['chaptersUnread', 'INTEGER DEFAULT 0'],
      ['totalChapters', 'INTEGER DEFAULT 0'],
      ['lastReadAt', 'TEXT'],
      ['lastUpdatedAt', 'TEXT'],
    ] as const;
    for (const [col, def] of cols) {
      if (!columnExists('Novel', col)) {
        try {
          db.runSync(`ALTER TABLE Novel ADD COLUMN ${col} ${def}`);
        } catch (e) {
          // ignore duplicate column errors
        }
      }
    }
    try {
      db.runSync(`UPDATE Novel
        SET chaptersDownloaded = (
            SELECT COUNT(*)
            FROM Chapter
            WHERE Chapter.novelId = Novel.id AND Chapter.isDownloaded = 1
        );`);
      db.runSync(`UPDATE Novel
        SET chaptersUnread = (
            SELECT COUNT(*)
            FROM Chapter
            WHERE Chapter.novelId = Novel.id AND Chapter.unread = 1
        );`);
      db.runSync(`UPDATE Novel
        SET totalChapters = (
            SELECT COUNT(*)
            FROM Chapter
            WHERE Chapter.novelId = Novel.id
        );`);
      db.runSync(`UPDATE Novel
        SET lastReadAt = (
            SELECT MAX(readTime)
            FROM Chapter
            WHERE Chapter.novelId = Novel.id
        );`);
      db.runSync(`UPDATE Novel
        SET lastUpdatedAt = (
            SELECT MAX(updatedTime)
            FROM Chapter
            WHERE Chapter.novelId = Novel.id
        );`);
    } catch {}
    db.runSync(createNovelTriggerQueryInsert);
    db.runSync(createNovelTriggerQueryUpdate);
    db.runSync(createNovelTriggerQueryDelete);
    db.execSync('PRAGMA user_version = 1');
  });
}

function updateToDBVersion2() {
  db.execSync('PRAGMA journal_mode = WAL');
  db.execSync('PRAGMA synchronous = NORMAL');
  db.execSync('PRAGMA temp_store = MEMORY');

  db.withTransactionSync(() => {
    db.runSync(createNotesTableQuery);
    db.runSync(createNotesIndexQuery);
    db.runSync(createNotesTriggerQuery);
    db.runSync(createRepositoryTableQuery);
    db.execSync('PRAGMA user_version = 2');
  });
}
const updateToDBVersion3 = () => {
  db.withTransactionSync(() => {
    db.runSync(createTrackTableQuery);
    db.execSync('PRAGMA user_version = 3');
  });
};
const updateToDBVersion4 = () => {
  db.withTransactionSync(() => {
    if (!columnExists('tracks', 'metadata')) {
      try {
        db.runSync('ALTER TABLE tracks ADD COLUMN metadata TEXT');
      } catch {}
    }
    db.execSync('PRAGMA user_version = 4');
  });
};

const updateToDBVersion5 = () => {
  db.withTransactionSync(() => {
    // Create the new AlternativeTitle table
    db.runSync(createAlternativeTitleTableQuery);
    db.runSync(createAlternativeTitleIndexQuery);

    db.execSync('PRAGMA user_version = 5');
  });
};

const updateToDBVersion6 = () => {
  db.withTransactionSync(() => {
    if (!columnExists('Novel', 'hasMatch')) {
      try {
        db.runSync('ALTER TABLE Novel ADD COLUMN hasMatch INTEGER DEFAULT 0');
      } catch {}
    }
    db.execSync('PRAGMA user_version = 6');
  });
};
