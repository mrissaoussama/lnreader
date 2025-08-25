import { MMKVStorage } from '@utils/mmkv/mmkv';
import { AuthenticationResult, TrackSource } from '../types';

// Reusable progress formatting (chapter first with Ch. prefix, optional volumes)
export function formatProgressDisplay(params: {
  progress: number | undefined;
  totalChapters?: number | undefined | null;
  volume?: number | undefined | null;
  totalVolumes?: number | undefined | null;
}): string {
  const { progress, totalChapters, volume, totalVolumes } = params;
  const ch = typeof progress === 'number' && progress >= 0 ? progress : 0;
  const chPart = `Ch.${ch}${
    typeof totalChapters === 'number' && totalChapters > 0
      ? `/${totalChapters}`
      : ''
  }`;
  const volPart =
    typeof volume === 'number' && volume >= 0
      ? ` • V.${volume}${
          typeof totalVolumes === 'number' && totalVolumes > 0
            ? `/${totalVolumes}`
            : ''
        }`
      : '';
  return chPart + volPart;
}

export class TrackerAuthUtils {
  /**
   * Get authentication for a specific tracker from MMKV storage
   */
  static getTrackerAuth(source: TrackSource): AuthenticationResult | null {
    try {
      const auth = MMKVStorage.getString('tracker_auth');
      if (auth) {
        const parsed = JSON.parse(auth);
        return parsed[source] || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get all tracker authentication data from MMKV storage
   */
  static getAllTrackerAuth(): Record<TrackSource, AuthenticationResult> {
    try {
      const auth = MMKVStorage.getString('tracker_auth');
      if (auth) {
        return JSON.parse(auth);
      }
      return {} as Record<TrackSource, AuthenticationResult>;
    } catch {
      return {} as Record<TrackSource, AuthenticationResult>;
    }
  }
}

// Reading list caching helpers
export interface TrackerReadingListItem {
  id: string;
  name: string;
}

const READING_LISTS_PREFIX = 'reading_lists_';

export function getReadingListsCacheKey(source: TrackSource | string) {
  return `${READING_LISTS_PREFIX}${source}`;
}

/**
 * Load cached reading lists for a tracker.
 */
export function loadReadingListsCache(
  source: TrackSource | string,
): TrackerReadingListItem[] {
  try {
    const raw = MMKVStorage.getString(getReadingListsCacheKey(source));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as TrackerReadingListItem[];
    // Support future shape { lists: [...], updatedAt: number }
    if (parsed && Array.isArray(parsed.lists)) {
      return parsed.lists as TrackerReadingListItem[];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Save reading lists to cache.
 */
export function saveReadingListsCache(
  source: TrackSource | string,
  lists: TrackerReadingListItem[],
) {
  try {
    MMKVStorage.set(getReadingListsCacheKey(source), JSON.stringify(lists));
  } catch {}
}

/**
 * Clear cached reading lists for a tracker.
 */
export function clearReadingListsCache(source: TrackSource | string) {
  try {
    MMKVStorage.delete(getReadingListsCacheKey(source));
  } catch {}
}
