import { anilist } from './aniList';
import { myAnimeList } from './myAnimeList';
import { novelUpdates } from './novelUpdates';
import { novellist } from './novellist';
import mangaUpdates from './mangaUpdates';
export * from './types';
export const trackers: any = {
  AniList: anilist,
  MyAnimeList: myAnimeList,
  'Novel-Updates': novelUpdates,
  'Novellist': novellist,
  MangaUpdates: mangaUpdates,
};
export const searchTracker = async (
  source: any,
  query: any,
  auth?: any,
  options?: any,
) => {
  return trackers[source].handleSearch(query, auth, options);
};
export const getUserListEntry = async (source: any, id: any, auth: any) => {
  return trackers[source].getUserListEntry(id, auth);
};
export const updateUserListEntry = async (
  source: any,
  id: any,
  payload: any,
  auth: any,
) => {
  if (!trackers[source]) {
    throw new Error(`Tracker not found for source: ${source}`);
  }

  const result = await trackers[source].updateUserListEntry(id, payload, auth);
  return result;
};

export const getTrackerEntryUrl = (
  source: any,
  track: { sourceId: string | number; metadata?: string },
  novel?: { path?: string; pluginId?: string; [k: string]: any },
): string | null => {
  const impl = trackers[source];
  if (impl && typeof impl.getEntryUrl === 'function') {
    return impl.getEntryUrl(track, novel);
  }
  return null;
};
