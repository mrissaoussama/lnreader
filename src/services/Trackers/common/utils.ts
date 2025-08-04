import { MMKVStorage } from '@utils/mmkv/mmkv';
import { AuthenticationResult, TrackSource } from '../types';

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
