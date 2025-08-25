import { useCallback, useState } from 'react';
import {
  loadReadingListsCache,
  saveReadingListsCache,
} from '@services/Trackers/common/utils';
import { trackers } from '@services/Trackers';
import { showToast } from '@utils/showToast';

interface ReadingListItem {
  id: string;
  name: string;
}

interface UseReadingListsOptions {
  trackerId?: string | null;
  auth?: any;
  autoSelectFirst?: boolean;
}

export function useReadingLists({
  trackerId,
  auth,
  autoSelectFirst = true,
}: UseReadingListsOptions) {
  const [lists, setLists] = useState<ReadingListItem[]>([]);
  const [selected, setSelected] = useState<ReadingListItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadFromCache = useCallback(
    (id: string) => {
      const cached = loadReadingListsCache(id);
      setLists(cached);
      if (autoSelectFirst && cached.length) {
        setSelected(prev =>
          prev && cached.find(l => l.id === prev.id) ? prev : cached[0],
        );
      }
      return cached;
    },
    [autoSelectFirst],
  );

  const refresh = useCallback(async () => {
    if (!trackerId) return;
    const impl = trackers[trackerId];
    if (!impl || typeof impl.getAvailableReadingLists !== 'function') return;
    setRefreshing(true);
    try {
      if (!auth) throw new Error(`Not logged in to ${trackerId}`);
      const fetched = await impl.getAvailableReadingLists(
        undefined as any,
        auth,
      );
      if (Array.isArray(fetched)) {
        setLists(fetched);
        saveReadingListsCache(trackerId, fetched);
        setSelected(prev => {
          if (prev) {
            const still = fetched.find(l => l.id === prev.id);
            return still || (autoSelectFirst ? fetched[0] : null);
          }
          return autoSelectFirst && fetched.length ? fetched[0] : null;
        });
        showToast(`Refreshed ${fetched.length} reading lists`);
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to refresh lists');
    } finally {
      setRefreshing(false);
    }
  }, [trackerId, auth, autoSelectFirst]);

  const select = useCallback(
    (id: string) => {
      setSelected(lists.find(l => l.id === id) || null);
    },
    [lists],
  );

  const setTracker = useCallback(
    (nextId: string | null | undefined) => {
      setLists([]);
      setSelected(null);
      if (!nextId) return;
      const cached = loadFromCache(nextId);
      if (!cached.length) {
        setSelected(null);
      }
    },
    [loadFromCache],
  );

  return {
    lists,
    selected,
    refreshing,
    refresh,
    select,
    setTracker,
    setSelected,
  };
}
