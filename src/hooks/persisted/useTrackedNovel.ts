import { Track, TrackSource } from '@database/types/Track';
import { useEffect, useState, useCallback } from 'react';
import { getTracks, updateTrackProgress } from '@database/queries/TrackQueries';
import { useTracker } from './useTracker';
import { updateUserListEntry } from '@services/Trackers';

export const useTrackedNovel = (novelId: number | string) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const { getTrackerAuth } = useTracker();

  const loadTracks = useCallback(async () => {
    if (typeof novelId === 'string' || novelId === 0) {
      setTracks([]);
      setLoading(false);
      return;
    }

    try {
      const novelTracks = await getTracks(novelId);
      setTracks(novelTracks);
    } catch (error) {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  const getTrackForSource = useCallback(
    (source: TrackSource) => {
      return tracks.find(track => track.source === source);
    },
    [tracks],
  );

  const isTrackedOnSource = useCallback(
    (source: TrackSource) => {
      return tracks.some(track => track.source === source);
    },
    [tracks],
  );

  const syncProgress = useCallback(
    async (chapterNumber: number) => {
      if (typeof novelId === 'string' || novelId === 0) return;

      for (const track of tracks) {
        const auth = getTrackerAuth(track.source);
        if (!auth || track.lastChapterRead >= chapterNumber) continue;

        try {
          // Update local database
          await updateTrackProgress(novelId, track.source, chapterNumber);

          // Update remote tracker
          await updateUserListEntry(
            track.source,
            track.sourceId,
            { progress: chapterNumber },
            auth,
          );
        } catch (error) {}
      }

      // Reload tracks to reflect changes
      await loadTracks();
    },
    [tracks, novelId, getTrackerAuth, loadTracks],
  );

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  return {
    tracks,
    trackedNovel: tracks[0], // For backwards compatibility
    loading,
    loadTracks,
    getTrackForSource,
    isTrackedOnSource,
    syncProgress,
    hasAnyTracks: tracks.length > 0,
  };
};
