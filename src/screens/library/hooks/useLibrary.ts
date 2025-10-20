import { useCallback, useState, useMemo, useEffect } from 'react';

import { getCategoriesFromDb } from '@database/queries/CategoryQueries';
import { getLibraryNovelsFromDb } from '@database/queries/LibraryQueries';

import { Category, NovelInfo, DBNovelInfo } from '@database/types';

import { useLibrarySettings } from '@hooks/persisted';
import { LibrarySortOrder } from '../constants/constants';
import { switchNovelToLibraryQuery } from '@database/queries/NovelQueries';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import ServiceManager from '@services/ServiceManager';

// type Library = Category & { novels: LibraryNovelInfo[] };
export type ExtendedCategory = Category & { novelIds: number[] };
export type UseLibraryReturnType = {
  library: DBNovelInfo[];
  categories: ExtendedCategory[];
  isLoading: boolean;
  setCategories: React.Dispatch<React.SetStateAction<ExtendedCategory[]>>;
  refreshCategories: () => Promise<void>;
  setLibrary: React.Dispatch<React.SetStateAction<DBNovelInfo[]>>;
  novelInLibrary: (pluginId: string, novelPath: string) => boolean;
  switchNovelToLibrary: (novelPath: string, pluginId: string) => Promise<void>;
  refetchLibrary: () => void;
  setLibrarySearchText: (text: string) => void;
};

export const useLibrary = (
  searchText: string,
): Omit<UseLibraryReturnType, 'setLibrarySearchText'> => {
  const librarySettings = useLibrarySettings();

  // Memoize settings to prevent infinite re-renders
  const { filter, sortOrder, downloadedOnlyMode, libraryLoadLimit } = useMemo(
    () => ({
      filter: librarySettings.filter,
      sortOrder: librarySettings.sortOrder || LibrarySortOrder.DateAdded_DESC,
      downloadedOnlyMode: librarySettings.downloadedOnlyMode || false,
      libraryLoadLimit: librarySettings.libraryLoadLimit || 50,
    }),
    [
      librarySettings.filter,
      librarySettings.sortOrder,
      librarySettings.downloadedOnlyMode,
      librarySettings.libraryLoadLimit,
    ],
  );

  const [library, setLibrary] = useState<DBNovelInfo[]>([]);
  const [categories, setCategories] = useState<ExtendedCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCategories = useCallback(async () => {
    const dbCategories = getCategoriesFromDb();

    const res = dbCategories.map(c => ({
      ...c,
      novelIds: (c.novelIds ?? '').split(',').map(Number),
    }));

    setCategories(res);
  }, []);

  const getLibrary = useCallback(async () => {
    setIsLoading(true);

    // Get hidden plugins from MMKV
    let hiddenPlugins: string[] = [];
    try {
      hiddenPlugins = JSON.parse(
        MMKVStorage.getString('LIBRARY_HIDDEN_PLUGINS') || '[]',
      );
    } catch {}

    const [_, novels] = await Promise.all([
      refreshCategories(),
      getLibraryNovelsFromDb(
        sortOrder,
        filter,
        searchText,
        downloadedOnlyMode,
        libraryLoadLimit,
        undefined, // offset
        undefined, // categoryId
        undefined, // categoryNovelIds
        hiddenPlugins, // hidden plugins
      ),
    ]);

    setLibrary(novels);
    setIsLoading(false);
  }, [
    refreshCategories,
    downloadedOnlyMode,
    filter,
    searchText,
    sortOrder,
    libraryLoadLimit,
  ]);

  // Only observe UPDATE_LIBRARY task to refresh library, not all tasks
  useEffect(() => {
    const unsubscribe = ServiceManager.manager.observe(
      'UPDATE_LIBRARY',
      task => {
        if (task && !task.meta.isRunning && task.meta.progress === 1) {
          // Task completed, refresh library
          getLibrary();
        }
      },
    );

    return unsubscribe;
  }, [getLibrary]);

  // Separate observer for when novels are added/removed from library
  // This avoids refreshing during download progress updates
  useEffect(() => {
    const unsubscribe = ServiceManager.manager.observe('MASS_IMPORT', task => {
      if (task && !task.meta.isRunning && task.meta.progress === 1) {
        // Mass import completed, refresh library
        getLibrary();
      }
    });

    return unsubscribe;
  }, [getLibrary]);

  // Removed useFocusEffect - it was causing library to refresh on every focus event
  // Library will refresh through the above observers for UPDATE_LIBRARY and MASS_IMPORT only

  const novelInLibrary = useCallback(
    (pluginId: string, novelPath: string) => {
      const { normalizePath } = require('@utils/urlUtils');
      const normalized = normalizePath(novelPath || '');
      return library?.some(novel => {
        if (novel.pluginId !== pluginId) return false;
        const np = normalizePath(novel.path || '');
        return np === normalized;
      });
    },
    [library],
  );

  const switchNovelToLibrary = useCallback(
    async (novelPath: string, pluginId: string) => {
      await switchNovelToLibraryQuery(novelPath, pluginId);

      // Get hidden plugins from MMKV
      let hiddenPlugins: string[] = [];
      try {
        hiddenPlugins = JSON.parse(
          MMKVStorage.getString('LIBRARY_HIDDEN_PLUGINS') || '[]',
        );
      } catch {}

      // Important to get correct chapters count
      // Count is set by sql trigger
      refreshCategories();
      const novels = getLibraryNovelsFromDb(
        sortOrder,
        filter,
        searchText,
        downloadedOnlyMode,
        libraryLoadLimit,
        undefined,
        undefined,
        undefined,
        hiddenPlugins,
      );

      setLibrary(novels);
    },
    [
      downloadedOnlyMode,
      filter,
      refreshCategories,
      searchText,
      sortOrder,
      libraryLoadLimit,
    ],
  );

  return {
    library,
    categories,
    isLoading,
    setLibrary,
    setCategories,
    refreshCategories,
    novelInLibrary,
    switchNovelToLibrary,
    refetchLibrary: getLibrary,
  };
};

export const useLibraryNovels = () => {
  const [library, setLibrary] = useState<NovelInfo[]>([]);

  const getLibrary = useCallback(async () => {
    const novels = getLibraryNovelsFromDb();
    setLibrary(novels);
  }, []);

  useEffect(() => {
    getLibrary();
  }, [getLibrary]);

  return {
    library,
    setLibrary,
  };
};
