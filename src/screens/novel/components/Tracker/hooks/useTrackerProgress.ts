import { useCallback, useEffect, useState } from 'react';
import { trackers } from '@services/Trackers';
import { formatProgressDisplay } from '@services/Trackers/common/utils';

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
}) {
  const { tracks, appProgress, getTrackerAuth, visible } = params;
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
        setData(prev =>
          prev.map(p =>
            p.source === track.source
              ? { ...p, isLoading: false, error: e.message || 'Error' }
              : p,
          ),
        );
      }
    });
    await Promise.allSettled(promises);
  }, [tracks, getTrackerAuth]);

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
