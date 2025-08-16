import { anilist } from './aniList';
import { myAnimeList } from './myAnimeList';
import { novelUpdates } from './novelUpdates';
import { novellist } from './novellist';
export * from './types';
export const trackers = {
  AniList: anilist,
  MyAnimeList: myAnimeList,
  'Novel-Updates': novelUpdates,
  'Novellist': novellist,
};
export const searchTracker = async (source, query, auth, options) => {
  return trackers[source].handleSearch(query, auth, options);
};
export const getUserListEntry = async (source, id, auth) => {
  return trackers[source].getUserListEntry(id, auth);
};
export const updateUserListEntry = async (source, id, payload, auth) => {
  if (!trackers[source]) {
    throw new Error(`Tracker not found for source: ${source}`);
  }

  const result = await trackers[source].updateUserListEntry(id, payload, auth);
  return result;
};

export const getTrackerEntryUrl = (
  source: string,
  track: { sourceId: string | number; metadata?: string },
  novel?: { path?: string; pluginId?: string; [k: string]: any },
): string | null => {
  const impl = trackers[source];
  if (impl && typeof impl.getEntryUrl === 'function') {
    return impl.getEntryUrl(track, novel);
  }
  return null;
};
