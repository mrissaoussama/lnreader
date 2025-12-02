import React, {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { xor } from 'lodash-es';

import { EmptyView } from '@components/index';
import NovelCover from '@components/NovelCover';
import NovelList, { NovelListRenderItem } from '@components/NovelList';

import { NovelInfo } from '@database/types';
import { getLibraryNovelsFromDb } from '@database/queries/LibraryQueries';

import { getString } from '@strings/translations';
import { useTheme, useLibrarySettings } from '@hooks/persisted';
import { LibraryScreenProps } from '@navigators/types';
import ServiceManager from '@services/ServiceManager';
import { useLibraryMatching } from '@hooks/useLibraryMatching';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { UPDATE_ON_PULL_REFRESH_ENABLED } from '@screens/settings/SettingsLibraryScreen/SettingsLibraryScreen';
import { useMMKVString } from 'react-native-mmkv';
import { LibrarySortOrder } from '@screens/library/constants/constants';

const PAGE_SIZE = 50;

// Store novels and scroll positions per category (including search state)
const categoryStates = new Map<
  string,
  { novels: NovelInfo[]; scrollOffset: number; hasMoreData: boolean }
>();

const getCategoryKey = (categoryId: number, searchText: string) =>
  searchText ? `${categoryId}_search_${searchText}` : `${categoryId}`;

interface Props {
  categoryId: number;
  categoryName: string;
  categoryNovelIds: number[];
  searchText?: string;
  selectedNovelIds: number[];
  setSelectedNovelIds: React.Dispatch<React.SetStateAction<number[]>>;
  navigation: LibraryScreenProps['navigation'];
  pickAndImport: () => void;
  isFocused?: boolean;
  libraryChangeKey?: number;
  onSelectAllVisible?: (novelIds: number[]) => void;
}

export const LibraryView: React.FC<Props> = ({
  categoryId,
  categoryName,
  categoryNovelIds,
  searchText = '',
  selectedNovelIds,
  setSelectedNovelIds,
  pickAndImport,
  navigation,
  isFocused = true,
  libraryChangeKey: _libraryChangeKey,
  onSelectAllVisible,
}) => {
  const theme = useTheme();
  const {
    filter,
    sortOrder: globalSortOrder,
    downloadedOnlyMode = false,
    libraryLoadLimit = 50,
  } = useLibrarySettings();

  const [categorySortOrder] = useMMKVString(`CATEGORY_SORT_${categoryId}`);
  const sortOrder = (categorySortOrder as LibrarySortOrder) || globalSortOrder;

  const categoryKey = getCategoryKey(categoryId, searchText);

  // Initialize from stored state or empty
  const [novels, setNovels] = useState<NovelInfo[]>(() => {
    const stored = categoryStates.get(categoryKey);
    return stored?.novels || [];
  });
  const [hasMoreData, setHasMoreData] = useState(() => {
    const stored = categoryStates.get(categoryKey);
    return stored?.hasMoreData ?? true;
  });
  const [refreshing, setRefreshing] = useState(false);
  const [initialScrollOffset, _setInitialScrollOffset] = useState(() => {
    const stored = categoryStates.get(categoryKey);
    return stored?.scrollOffset || 0;
  });

  // Save state when component unmounts or category/search changes
  useEffect(() => {
    return () => {
      if (novels.length > 0) {
        categoryStates.set(categoryKey, {
          novels,
          scrollOffset: initialScrollOffset,
          hasMoreData,
        });
      }
    };
  }, [categoryKey, novels, initialScrollOffset, hasMoreData]);
  const loadNovels = useCallback(
    (reset: boolean = false) => {
      if (!isFocused) return;

      const offset = reset ? 0 : novels.length;
      const pageSize =
        libraryLoadLimit === -1 ? 999999 : libraryLoadLimit || PAGE_SIZE;

      // Get hidden plugins filter
      let hiddenPlugins: Set<string> = new Set();
      try {
        hiddenPlugins = new Set(
          JSON.parse(MMKVStorage.getString('LIBRARY_HIDDEN_PLUGINS') || '[]'),
        );
      } catch {}

      if (searchText.trim()) {
        const searchResults = getLibraryNovelsFromDb(
          sortOrder,
          filter,
          searchText,
          downloadedOnlyMode,
          pageSize,
          offset,
          undefined,
          categoryNovelIds,
          Array.from(hiddenPlugins),
        );

        const uniqueResults = searchResults.reduce((acc, novel) => {
          if (
            categoryNovelIds.includes(novel.id) &&
            !acc.some(n => n.id === novel.id)
          ) {
            acc.push(novel);
          }
          return acc;
        }, [] as NovelInfo[]);

        if (reset) {
          setNovels(uniqueResults);
        } else {
          setNovels(prev => {
            const combined = [...prev, ...uniqueResults];
            return combined.reduce((acc, novel) => {
              if (!acc.some(n => n.id === novel.id)) acc.push(novel);
              return acc;
            }, [] as NovelInfo[]);
          });
        }

        setHasMoreData(
          libraryLoadLimit !== -1 && uniqueResults.length === pageSize,
        );
      } else {
        const categoryNovels = getLibraryNovelsFromDb(
          sortOrder,
          filter,
          '',
          downloadedOnlyMode,
          pageSize,
          offset,
          undefined,
          categoryNovelIds,
          Array.from(hiddenPlugins),
        );

        const uniqueCategoryNovels = categoryNovels.reduce((acc, novel) => {
          if (
            categoryNovelIds.includes(novel.id) &&
            !acc.some(n => n.id === novel.id)
          ) {
            acc.push(novel);
          }
          return acc;
        }, [] as NovelInfo[]);

        if (reset) {
          setNovels(uniqueCategoryNovels);
        } else {
          setNovels(prev => {
            const combined = [...prev, ...uniqueCategoryNovels];
            return combined.reduce((acc, novel) => {
              if (!acc.some(n => n.id === novel.id)) acc.push(novel);
              return acc;
            }, [] as NovelInfo[]);
          });
        }

        setHasMoreData(uniqueCategoryNovels.length === pageSize);
      }
    },
    [
      isFocused,
      searchText,
      sortOrder,
      filter,
      downloadedOnlyMode,
      categoryNovelIds,
      libraryLoadLimit,
      novels.length,
    ],
  );

  // Reload when sort/filter/downloadedOnlyMode changes
  useEffect(() => {
    loadNovels(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder, filter, downloadedOnlyMode]);

  // Listen for plugin filter changes and force reload
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const listener = MMKVStorage.addOnValueChangedListener(key => {
      if (
        key === 'LIBRARY_HIDDEN_PLUGINS' ||
        key === 'LIBRARY_PLUGIN_FILTER_KEY'
      ) {
        // Clear any pending timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        // Use longer timeout to ensure we're outside render cycle
        timeoutId = setTimeout(() => {
          // Clear cached state for this category/search so it refetches
          categoryStates.delete(categoryKey);
          if (isFocused) {
            loadNovels(true);
          }
        }, 100);
      }
    });
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      listener.remove();
    };
  }, [categoryKey, loadNovels, isFocused]);

  const memoizedNovels = useMemo(() => novels, [novels]);
  const { matches: libraryMatches } = useLibraryMatching({
    novels: memoizedNovels,
  });

  // Update parent component with visible novel IDs for select all functionality
  useEffect(() => {
    if (onSelectAllVisible) {
      const visibleIds = novels.map(novel => novel.id);
      onSelectAllVisible(visibleIds);
    }
  }, [novels, onSelectAllVisible]);

  const loadMoreNovels = useCallback(() => {
    if (!hasMoreData) return;
    loadNovels(false);
  }, [hasMoreData, loadNovels]);

  const renderItem = useCallback(
    ({ item }: { item: NovelInfo }) => {
      const toggleSelection = (novel: NovelInfo) =>
        setSelectedNovelIds(xor(selectedNovelIds, [novel.id]));
      const inSelectionMode = selectedNovelIds.length > 0;
      return (
        <NovelCover
          item={item}
          theme={theme}
          isSelected={selectedNovelIds.includes(item.id)}
          match={libraryMatches[String(item.id)]}
          onLongPress={toggleSelection}
          onPress={() => {
            if (inSelectionMode) {
              toggleSelection(item);
            } else {
              navigation.navigate('ReaderStack', {
                screen: 'Novel',
                params: item,
              });
            }
          }}
          libraryStatus={false}
          selectionMode={inSelectionMode}
        />
      );
    },
    [theme, selectedNovelIds, libraryMatches, setSelectedNovelIds, navigation],
  );

  const onRefresh = useCallback(() => {
    if (categoryId === 2) return;

    let updateOnPull = true;
    try {
      updateOnPull =
        MMKVStorage.getBoolean(UPDATE_ON_PULL_REFRESH_ENABLED) ?? true;
    } catch {}

    if (onSelectAllVisible) {
      const uniqueVisibleIds = [...new Set(novels.map(novel => novel.id))];
      const categorySpecificIds = uniqueVisibleIds.filter(id =>
        categoryNovelIds.includes(id),
      );
      onSelectAllVisible(categorySpecificIds);
    }

    if (updateOnPull) {
      setRefreshing(true);
      ServiceManager.manager.addTask({
        name: 'UPDATE_LIBRARY',
        data: { categoryId, categoryName },
      });

      // Subscribe to the update task completion to properly refresh
      const unsubscribe = ServiceManager.manager.observe(
        'UPDATE_LIBRARY',
        task => {
          if (!task || !task.meta.isRunning) {
            loadNovels(true);
            setRefreshing(false);
            unsubscribe();
          }
        },
      );
    } else {
      // Just refetch library data without calling update task
      setRefreshing(true);
      loadNovels(true).finally(() => setRefreshing(false));
    }
  }, [
    categoryId,
    categoryName,
    loadNovels,
    novels,
    onSelectAllVisible,
    categoryNovelIds,
  ]);

  // Refresh automatically if plugin filter (hidden plugins) changes
  useEffect(() => {
    const listener = MMKVStorage.addOnValueChangedListener(key => {
      if (key === 'LIBRARY_HIDDEN_PLUGINS') {
        // Clear cached state for this category/search so it refetches
        categoryStates.delete(categoryKey);
        loadNovels(true);
      }
    });
    return () => listener.remove();
  }, [categoryKey, loadNovels]);

  // Incremental update: observe global queue and update chaptersDownloaded as downloads complete
  const prevDownloadCountsRef = useRef<Map<number, number>>(new Map());
  useEffect(() => {
    const unsubscribe = ServiceManager.manager.observeQueue(tasks => {
      // Count current downloads per novelId
      const currentCounts = new Map<number, number>();
      tasks.forEach(t => {
        if (t.task.name === 'DOWNLOAD_CHAPTER') {
          const novelId = (t.task as any).data?.novelId as number | undefined;
          if (typeof novelId === 'number') {
            currentCounts.set(novelId, (currentCounts.get(novelId) || 0) + 1);
          }
        }
      });

      const prev = prevDownloadCountsRef.current;
      // For any novel where count decreased, increment chaptersDownloaded in UI by the delta
      const deltas: Array<{ novelId: number; delta: number }> = [];
      const allNovelIds = new Set<number>([
        ...prev.keys(),
        ...currentCounts.keys(),
      ]);
      allNovelIds.forEach(id => {
        const before = prev.get(id) || 0;
        const after = currentCounts.get(id) || 0;
        if (after < before) {
          deltas.push({ novelId: id, delta: before - after });
        }
      });

      if (deltas.length > 0) {
        setNovels(prevNovels => {
          if (!prevNovels || prevNovels.length === 0) return prevNovels;
          let changed = false;
          const updated = prevNovels.map(n => {
            const d = deltas.find(x => x.novelId === n.id);
            if (d) {
              changed = true;
              const current = (n as any).chaptersDownloaded || 0;
              return {
                ...n,
                chaptersDownloaded: Math.max(0, current + d.delta),
              } as any;
            }
            return n;
          });
          return changed ? updated : prevNovels;
        });
      }

      // Save current counts for next diff
      prevDownloadCountsRef.current = currentCounts;
    });
    return unsubscribe;
  }, []);

  return (
    <View style={styles.flex}>
      <NovelList
        data={novels}
        extraData={[selectedNovelIds.length]}
        renderItem={renderItem as NovelListRenderItem}
        onEndReached={loadMoreNovels}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <EmptyView
            theme={theme}
            icon="Σ(ಠ_ಠ)"
            description={getString('libraryScreen.empty')}
            actions={[
              categoryId !== 2
                ? {
                    iconName: 'compass-outline',
                    title: getString('browse'),
                    onPress: () => navigation.navigate('Browse'),
                  }
                : {
                    iconName: 'book-arrow-up-outline',
                    title: getString('advancedSettingsScreen.importEpub'),
                    onPress: pickAndImport,
                  },
            ]}
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.onPrimary]}
            progressBackgroundColor={theme.primary}
          />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
