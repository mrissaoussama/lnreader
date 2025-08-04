import { useMMKVObject } from 'react-native-mmkv';
import type { Dispatch, SetStateAction } from 'react';

export const TRACKER_AUTH = 'tracker_auth';

export type TrackerAuthMap = Record<string, { [key: string]: any }>;

/**
 * Access and manage tracker-auth map via MMKV.
 */
export function useTracker() {
  const [auth, setAuth] = useMMKVObject<TrackerAuthMap>(TRACKER_AUTH);

  const getTrackerAuth = (source: string): TrackerAuthMap[string] | undefined =>
    auth?.[source];

  const setTracker = (source: string, authData: TrackerAuthMap[string]) => {
    setAuth({ ...(auth ?? {}), [source]: authData });
  };

  const removeTracker = (source: string) => {
    if (!auth) return;
    const copy = { ...auth };
    delete copy[source];
    setAuth(copy);
  };

  const getLoggedInTrackers = () =>
    Object.keys(auth ?? {}).filter(src => auth?.[src]);

  return {
    tracker: auth,
    getTrackerAuth,
    setTracker,
    removeTracker,
    getLoggedInTrackers,
    isLoggedIn: (source: string) => !!auth?.[source],
    _setAuth: setAuth as Dispatch<SetStateAction<TrackerAuthMap | undefined>>, // for rare advanced cases
  };
}

/**
 * Retrieve Tracker API-like object for a source.
 */
export function useTrackerFor(
  source: string,
): { name: string; auth: TrackerAuthMap[string] } | undefined {
  const { getTrackerAuth } = useTracker();
  const authData = getTrackerAuth(source);
  if (!authData) return undefined;
  return { name: source, auth: authData };
}

export function getTrackerSync(
  trackerAuthMap: TrackerAuthMap | undefined,
  source: string,
): { name: string; auth: TrackerAuthMap[string] } | undefined {
  const authData = trackerAuthMap?.[source];
  if (!authData) return undefined;
  return { name: source, auth: authData };
}

/**
 * Legacy function for backward compatibility
 * Returns auth data for a tracker source from stored tracker auth
 */
export function getTracker(source: string): TrackerAuthMap[string] | undefined {
  const auth = require('@utils/mmkv/mmkv').MMKVStorage.getString(TRACKER_AUTH);
  if (!auth) return undefined;

  try {
    const parsed = JSON.parse(auth);
    return parsed[source];
  } catch {
    return undefined;
  }
}
