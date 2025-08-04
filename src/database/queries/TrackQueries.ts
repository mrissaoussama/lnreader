import { db } from '../db';
import { Track, TrackSource, TrackStatus } from '../types/Track';

export const getTracks = async (novelId: number): Promise<Track[]> => {
  const tracks = await db.getAllAsync(
    'SELECT * FROM tracks WHERE novelId = ? ORDER BY createdAt DESC',
    [novelId],
  );
  return tracks as Track[];
};

export const getTrackBySource = async (
  novelId: number,
  source: TrackSource,
): Promise<Track | null> => {
  const track = await db.getFirstAsync(
    'SELECT * FROM tracks WHERE novelId = ? AND source = ?',
    [novelId, source],
  );
  return track as Track | null;
};

export const insertTrack = async (
  track: Omit<Track, 'id' | 'createdAt' | 'updatedAt' | 'lastSyncAt'>,
): Promise<void> => {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO tracks (
      novelId, source, sourceId, title, lastChapterRead, totalChapters,
      status, score, startDate, finishDate, notes, metadata, lastSyncAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      track.novelId,
      track.source,
      track.sourceId,
      track.title,
      track.lastChapterRead || 0,
      track.totalChapters || null,
      track.status || TrackStatus.Reading,
      track.score || null,
      track.startDate || null,
      track.finishDate || null,
      track.notes || null,
      track.metadata || null,
      now,
      now,
      now,
    ],
  );
};

export const updateTrack = async (
  trackId: number,
  updates: Partial<Omit<Track, 'id' | 'novelId' | 'source' | 'createdAt'>>,
): Promise<void> => {
  const updateFields = Object.keys(updates).filter(
    key => updates[key as keyof typeof updates] !== undefined,
  );
  if (updateFields.length === 0) return;

  const setClause = updateFields.map(field => `${field} = ?`).join(', ');
  const values = updateFields.map(
    field => updates[field as keyof typeof updates],
  );
  values.push(new Date().toISOString());
  values.push(trackId);

  await db.runAsync(
    `UPDATE tracks SET ${setClause}, updatedAt = ? WHERE id = ?`,
    values,
  );
};

export const updateTrackProgress = async (
  novelId: number,
  source: TrackSource,
  lastChapterRead: number,
): Promise<void> => {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE tracks SET lastChapterRead = ?, lastSyncAt = ?, updatedAt = ?
     WHERE novelId = ? AND source = ?`,
    [lastChapterRead, now, now, novelId, source],
  );
};

export const deleteTrack = async (trackId: number): Promise<void> => {
  await db.runAsync('DELETE FROM tracks WHERE id = ?', [trackId]);
};

export const deleteTracksByNovel = async (novelId: number): Promise<void> => {
  await db.runAsync('DELETE FROM tracks WHERE novelId = ?', [novelId]);
};

export const deleteTracksBySource = async (
  source: TrackSource,
): Promise<void> => {
  await db.runAsync('DELETE FROM tracks WHERE source = ?', [source]);
};

export const getAllTrackedNovels = async (): Promise<
  { novelId: number; source: TrackSource }[]
> => {
  const tracks = await db.getAllAsync(
    'SELECT DISTINCT novelId, source FROM tracks ORDER BY novelId',
  );
  return tracks as { novelId: number; source: TrackSource }[];
};

export const getOutOfSyncTracks = async (
  novelId: number,
  currentChapter: number,
): Promise<Track[]> => {
  const tracks = await db.getAllAsync(
    'SELECT * FROM tracks WHERE novelId = ? AND lastChapterRead < ?',
    [novelId, currentChapter],
  );
  return tracks as Track[];
};
