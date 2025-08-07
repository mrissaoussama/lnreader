import { useState, useEffect, useCallback, useRef } from 'react';
import { NovelItem } from '@plugins/types';

import { getPlugin } from '@plugins/pluginManager';
import { FilterToValues, Filters } from '@plugins/types/filterTypes';
import { useBrowseSettings } from '@hooks/persisted/useSettings';
import { useLibraryContext } from '@components/Context/LibraryContext';

export const useBrowseSource = (
  pluginId: string,
  showLatestNovels?: boolean,
  isFilterSheetOpen?: boolean,
) => {
  const [isLoading, setIsLoading] = useState(true);
  const [novels, setNovels] = useState<NovelItem[]>([]);
  const [error, setError] = useState<string>();

  const [currentPage, setCurrentPage] = useState(1);
  const [filterValues, _setFilterValues] = useState<Filters | undefined>(
    getPlugin(pluginId)?.filters,
  );
  const [selectedFilters, setSelectedFilters] = useState<
    FilterToValues<Filters> | undefined
  >(filterValues);
  const [hasNextPage, setHasNextPage] = useState(true);

  const isScreenMounted = useRef(true);

  const { hideInLibraryItems } = useBrowseSettings();
  const { novelInLibrary } = useLibraryContext();

  const fetchNovels = useCallback(
    async (page: number, filters?: FilterToValues<Filters>) => {
      // Don't fetch if filter sheet is open to avoid unnecessary network requests
      if (isFilterSheetOpen) {
        return;
      }
      if (isScreenMounted.current === true) {
        try {
          const plugin = getPlugin(pluginId);
          if (!plugin) {
            throw new Error(`Unknown plugin: ${pluginId}`);
          }
          let res = await plugin.popularNovels(page, {
            showLatestNovels,
            filters,
          });
          if (hideInLibraryItems) {
            res = res.filter(
              pluginNovel => !novelInLibrary(pluginId, pluginNovel.path),
            );
          }
          setNovels(prevState => (page === 1 ? res : [...prevState, ...res]));
          if (!res.length) {
            setHasNextPage(false);
          }
        } catch (err: unknown) {
          setError(`${err}`);
        } finally {
          setIsLoading(false);
        }
      }
    },
    [
      pluginId,
      showLatestNovels,
      hideInLibraryItems,
      novelInLibrary,
      isFilterSheetOpen,
    ],
  );

  const fetchNextPage = () => {
    // Don't fetch next page if filter sheet is open
    if (isFilterSheetOpen) {
      return;
    }
    if (hasNextPage) setCurrentPage(prevState => prevState + 1);
  };

  /**
   * On screen unmount
   */
  useEffect(() => {
    return () => {
      isScreenMounted.current = false;
    };
  }, []);

  useEffect(() => {
    // Don't fetch if filter sheet is open
    if (!isFilterSheetOpen) {
      fetchNovels(currentPage, selectedFilters);
    }
  }, [
    fetchNovels,
    currentPage,
    selectedFilters,
    hideInLibraryItems,
    isFilterSheetOpen,
  ]);

  const refetchNovels = () => {
    setError('');
    setIsLoading(true);
    setNovels([]);
    setCurrentPage(1);
    fetchNovels(1, selectedFilters);
  };

  const clearFilters = useCallback(
    (filters: Filters) => setSelectedFilters(filters),
    [],
  );

  const setFilters = (filters?: FilterToValues<Filters>) => {
    setIsLoading(true);
    setCurrentPage(1);
    fetchNovels(1, filters);
    setSelectedFilters(filters);
  };

  return {
    isLoading,
    novels,
    hasNextPage,
    fetchNextPage,
    error,
    filterValues,
    setFilters,
    clearFilters,
    refetchNovels,
  };
};

export const useSearchSource = (
  pluginId: string,
  isFilterSheetOpen?: boolean,
) => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<NovelItem[]>([]);
  const [searchError, setSearchError] = useState<string>();
  const [hasNextSearchPage, setHasNextSearchPage] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchText, setSearchText] = useState('');

  const { hideInLibraryItems } = useBrowseSettings();
  const { novelInLibrary } = useLibraryContext();

  const searchSource = (searchTerm: string) => {
    // Don't start search if filter sheet is open
    if (isFilterSheetOpen) {
      return;
    }
    setSearchResults([]);
    setHasNextSearchPage(true);
    setCurrentPage(1);
    setSearchText(searchTerm);
    setIsSearching(true);
  };

  const isScreenMounted = useRef(true);

  const fetchNovels = useCallback(
    async (localSearchText: string, page: number) => {
      // Don't fetch if filter sheet is open to avoid unnecessary network requests
      if (isFilterSheetOpen) {
        return;
      }
      if (isScreenMounted.current === true) {
        try {
          const plugin = getPlugin(pluginId);
          if (!plugin) {
            throw new Error(`Unknown plugin: ${pluginId}`);
          }
          let res = await plugin.searchNovels(localSearchText, page);
          if (hideInLibraryItems) {
            res = res.filter(
              pluginNovel => !novelInLibrary(pluginId, pluginNovel.path),
            );
          }
          setSearchResults(prevState =>
            page === 1 ? res : [...prevState, ...res],
          );
          if (!res.length) {
            setHasNextSearchPage(false);
          }
        } catch (err: unknown) {
          setSearchError(`${err}`);
          setHasNextSearchPage(false);
        } finally {
          setIsSearching(false);
        }
      }
    },
    [pluginId, hideInLibraryItems, novelInLibrary, isFilterSheetOpen],
  );

  const searchNextPage = () => {
    // Don't fetch next page if filter sheet is open
    if (isFilterSheetOpen) {
      return;
    }
    if (hasNextSearchPage) setCurrentPage(prevState => prevState + 1);
  };

  useEffect(() => {
    // Don't fetch if filter sheet is open and we have search text
    if (searchText && !isFilterSheetOpen) {
      fetchNovels(searchText, currentPage);
    }
  }, [
    currentPage,
    fetchNovels,
    searchText,
    hideInLibraryItems,
    isFilterSheetOpen,
  ]);

  const clearSearchResults = useCallback(() => {
    setSearchText('');
    setSearchResults([]);
    setCurrentPage(1);
    setHasNextSearchPage(true);
  }, []);

  return {
    isSearching,
    searchResults,
    hasNextSearchPage,
    searchNextPage,
    searchSource,
    clearSearchResults,
    searchError,
  };
};
