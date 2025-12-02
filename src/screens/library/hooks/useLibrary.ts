import { useCallback, useState, useMemo, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';

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

  const refreshCategories = useCallback(async () => {
    const dbCategories = getCategoriesFromDb();

    const res = dbCategories.map(c => ({
      ...c,
      novelIds: (c.novelIds ?? '').split(',').map(Number),
    }));

    setCategories(res);
  }, []);

  useFocusEffect(
    useCallback(() => {
      getLibrary();
    }, [getLibrary]),
  );

  // Only observe UPDATE_LIBRARY task to refresh library, not all tasks
  useEffect(() => {
    const unsubscribe = ServiceManager.manager.observe(
      'UPDATE_LIBRARY',
      task => {
        // Only refresh when task is completely removed from queue (undefined)
        // Previously this would trigger when task.meta.isRunning was false,
        // which happened BEFORE the task was removed, causing race conditions
        if (!task) {
          // Task completed and removed, refresh library
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
      // Only refresh when task is completely removed from queue (undefined)
      if (!task) {
        // Mass import completed, refresh library
        getLibrary();
      }
    });

    return unsubscribe;
  }, [getLibrary]);

  const novelInLibrary = useCallback(
    (pluginId: string, novelPath: string) => {
      // Import the database query function
      const { getNovelByPath } = require('@database/queries/NovelQueries');

      // Check database directly instead of just in-memory array
      const novel = getNovelByPath(novelPath, pluginId);

      // Return true if novel exists in database AND has inLibrary=1
      return novel && novel.inLibrary === 1;
    },
    [], // Remove library dependency since we're checking database directly
  );

  const switchNovelToLibrary = useCallback(
    async (novelPath: string, pluginId: string) => {
      await switchNovelToLibraryQuery(novelPath, pluginId);
      getLibrary();
    },
    [getLibrary],
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
    // Create completely new array with new object references to force React re-render
    const freshLibrary = novels.map(n => ({ ...n }));
    setLibrary(freshLibrary);
  }, []);

  useFocusEffect(
    useCallback(() => {
      getLibrary();
    }, [getLibrary]),
  );

  return {
    library,
    setLibrary,
  };
};
