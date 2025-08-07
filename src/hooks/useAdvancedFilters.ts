import { useState, useEffect, useCallback, useMemo } from 'react';
import { NovelItem } from '@plugins/types';
import { NovelInfo } from '@database/types';
import {
  BrowseFilter,
  BrowseFilterGroup,
  FilterMatchInfo,
} from '../types/browseFilters';
import { BrowseFilterStorage } from '@services/browseFilterStorage';
import { applyFilters } from '@utils/browseFilters';
import { useBrowseSettings } from '@hooks/persisted/useSettings';

export interface UseAdvancedFiltersResult {
  filtersEnabled: boolean;
  filters: BrowseFilter[];
  groups: BrowseFilterGroup[];
  hiddenCount: number;

  toggleFiltersEnabled: () => void;

  applyFiltersToList: <T extends NovelItem | NovelInfo>(list: T[]) => T[];
}

export const useAdvancedFilters = (
  isPaused?: boolean,
): UseAdvancedFiltersResult => {
  const { enableAdvancedFilters } = useBrowseSettings();
  const storage = BrowseFilterStorage.getInstance();

  const [filters, setFilters] = useState<BrowseFilter[]>([]);
  const [groups, setGroups] = useState<BrowseFilterGroup[]>([]);
  const [filterState, setFilterState] = useState(() =>
    storage.getFilterState(),
  );
  const [lastAppliedResults, setLastAppliedResults] = useState<{
    total: number;
    hidden: number;
  }>({ total: 0, hidden: 0 });

  const loadFiltersAndGroups = useCallback(() => {
    setFilters(storage.getFilters());
    setGroups(storage.getGroups());
    setFilterState(storage.getFilterState());
  }, [storage]);

  useEffect(() => {
    loadFiltersAndGroups();
  }, [loadFiltersAndGroups]);

  useEffect(() => {
    const interval = setInterval(() => {
      const currentState = storage.getFilterState();
      if (currentState.lastApplied !== filterState.lastApplied) {
        loadFiltersAndGroups();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [storage, filterState.lastApplied, loadFiltersAndGroups]);

  const filtersEnabled = useMemo(
    () => enableAdvancedFilters && filterState.enabled,
    [enableAdvancedFilters, filterState.enabled],
  );

  const toggleFiltersEnabled = useCallback(() => {
    const newState = !filterState.enabled;
    storage.updateFilterState({ enabled: newState });
    setFilterState(prev => ({ ...prev, enabled: newState }));

    if (!newState) {
      setLastAppliedResults({ total: 0, hidden: 0 });
    }
  }, [storage, filterState.enabled]);

  const applyFiltersToList = useCallback(
    <T extends NovelItem | NovelInfo>(list: T[]): T[] => {
      // Don't apply filters if paused (filter interfaces are open) or filters are disabled
      if (isPaused) {
        setLastAppliedResults({ total: list.length, hidden: 0 });
        return list;
      }

      if (!filtersEnabled || filters.length === 0) {
        // Always update state to ensure re-render when toggling
        setLastAppliedResults({ total: list.length, hidden: 0 });
        return list;
      }

      let hiddenCount = 0;
      const filteredList = list.filter(item => {
        const result: FilterMatchInfo = applyFilters(item, filters, groups);
        if (result.hidden) {
          hiddenCount++;
          return false;
        }
        return true;
      });

      // Always update state to ensure re-render
      setLastAppliedResults({
        total: list.length,
        hidden: hiddenCount,
      });

      storage.updateFilterState({ lastApplied: Date.now() });
      setFilterState(prev => ({ ...prev, lastApplied: Date.now() }));

      return filteredList;
    },
    [isPaused, filtersEnabled, filters, groups, storage],
  );

  return {
    filtersEnabled: filtersEnabled ?? false,
    filters,
    groups,
    hiddenCount: lastAppliedResults.hidden,

    toggleFiltersEnabled,

    applyFiltersToList,
  };
};
