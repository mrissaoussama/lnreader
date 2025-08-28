import { useCallback, useEffect, useState } from 'react';
import { trackers } from '@services/Trackers';
import { formatProgressDisplay } from '@services/Trackers/common/utils';
import { updateTrack } from '@database/queries/TrackQueries';

interface ProgressItem {
  source: string;
  progress: number;
  isLoading: boolean;
  error?: string;
  progressDisplay?: string;
}

export function useTrackerProgress(params: {
  tracks: any[];
  appProgress: number;
  getTrackerAuth: (src: string) => any;
  visible: boolean;
  onPersistLocal?: () => Promise<void> | void;
}) {
  const { tracks, appProgress, getTrackerAuth, visible, onPersistLocal } =
    params;
  const [data, setData] = useState<ProgressItem[]>([]);
  const [highest, setHighest] = useState(0);

  const fetchProgress = useCallback(async () => {
    const initial: ProgressItem[] = tracks.map(t => ({
      source: t.source,
      progress: t.lastChapterRead,
      isLoading: true,
    }));
    setData(initial);
    const promises = tracks.map(async track => {
      try {
        const tracker = trackers[track.source];
        if (!tracker) throw new Error('Tracker not found');
        const auth = getTrackerAuth(track.source);
        if (!auth) throw new Error('Not logged in');
        const entry = await tracker.getUserListEntry(
          track.sourceId,
          auth as any,
          { id: 0 } as any,
        );
        if (!entry) throw new Error('No entry');
        const progress = entry.progress || 0;
        // If remote progress ahead of local, persist locally
        const remoteVolume = (entry as any).volume;
        const remoteTotalVolumes = (entry as any).totalVolumes;
        try {
          if (
            typeof track.id === 'number' &&
            (progress > track.lastChapterRead ||
              (typeof remoteVolume === 'number' && !isNaN(remoteVolume)))
          ) {
            let nextMetadata: any = {};
            try {
              if (track.metadata) nextMetadata = JSON.parse(track.metadata);
            } catch {}
            if (typeof remoteVolume === 'number') {
              nextMetadata.currentVolume = remoteVolume;
            }
            if (typeof remoteTotalVolumes === 'number') {
              nextMetadata.maxVolume = remoteTotalVolumes;
            }
            await updateTrack(track.id, {
              lastChapterRead:
                progress > track.lastChapterRead
                  ? progress
                  : track.lastChapterRead,
              metadata: Object.keys(nextMetadata).length
                ? JSON.stringify(nextMetadata)
                : track.metadata,
              lastSyncAt: new Date().toISOString(),
            });
          }
        } catch {}
        setData(prev =>
          prev.map(p =>
            p.source === track.source
              ? {
                  ...p,
                  progress,
                  progressDisplay:
                    (entry as any).progressDisplay ||
                    formatProgressDisplay({
                      progress,
                      volume: (entry as any).volume,
                      totalVolumes: (entry as any).totalVolumes,
                    }),
                  isLoading: false,
                }
              : p,
          ),
        );
      } catch (e: any) {
        const errorMessage =
          e instanceof Error ? e.message : String(e ?? 'Error');
        setData(prev =>
          prev.map(p =>
            p.source === track.source
              ? { ...p, isLoading: false, error: errorMessage }
              : p,
          ),
        );
      }
    });
    await Promise.allSettled(promises);
    try {
      if (onPersistLocal) await onPersistLocal();
    } catch {}
  }, [tracks, getTrackerAuth, onPersistLocal]);

  useEffect(() => {
    if (visible) {
      fetchProgress();
    } else {
      setData([]);
    }
  }, [visible, fetchProgress]);

  useEffect(() => {
    setHighest(Math.max(appProgress, ...data.map(d => d.progress)));
  }, [appProgress, data]);

  return { data, highest, refresh: fetchProgress };
}
