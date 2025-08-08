export const createNotesTableQuery = `
CREATE TABLE IF NOT EXISTS Note (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    novelId INTEGER NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (novelId) REFERENCES Novel (id) ON DELETE CASCADE,
    UNIQUE(novelId)
);`;

export const createNotesIndexQuery = `
CREATE INDEX IF NOT EXISTS idx_note_novel_id ON Note (novelId);`;

export const dropNotesIndexQuery = `
DROP INDEX IF EXISTS idx_note_novel_id;`;

export const createNotesTriggerQuery = `
CREATE TRIGGER IF NOT EXISTS update_note_timestamp 
AFTER UPDATE OF content ON Note
BEGIN
    UPDATE Note SET updatedAt = datetime('now','localtime') WHERE id = NEW.id;
END;`;

export const createNotesNovelTriggerInsert = `
CREATE TRIGGER IF NOT EXISTS update_novel_hasnote_on_insert
AFTER INSERT ON Note
BEGIN
    UPDATE Novel 
    SET hasNote = CASE 
      WHEN NEW.content != '' THEN 1 
      ELSE 0 
    END
    WHERE id = NEW.novelId;
END;`;

export const createNotesNovelTriggerUpdate = `
CREATE TRIGGER IF NOT EXISTS update_novel_hasnote_on_update
AFTER UPDATE ON Note
BEGIN
    UPDATE Novel 
    SET hasNote = CASE 
      WHEN NEW.content != '' THEN 1 
      ELSE 0 
    END
    WHERE id = NEW.novelId;
END;`;

export const createNotesNovelTriggerDelete = `
CREATE TRIGGER IF NOT EXISTS update_novel_hasnote_on_delete
AFTER DELETE ON Note
BEGIN
    UPDATE Novel 
    SET hasNote = 0
    WHERE id = OLD.novelId;
END;`;
