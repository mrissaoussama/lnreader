import React, { useMemo, useState, useCallback, useEffect } from 'react';
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

const PAGE_SIZE = 50;

// Store novels and scroll positions per category (including search state)
const categoryStates = new Map<
  string,
  { novels: NovelInfo[]; scrollOffset: number; hasMoreData: boolean }
>();

const getCategoryKey = (categoryId: number, searchText: string) => {
  return searchText ? `${categoryId}_search_${searchText}` : `${categoryId}`;
};

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
    sortOrder,
    downloadedOnlyMode = false,
    libraryLoadLimit = 50,
  } = useLibrarySettings();

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
    (reset: boolean = false, currentNovels: NovelInfo[] = []) => {
      if (!isFocused) return;

      const offset = reset ? 0 : currentNovels.length;
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
        ).filter(novel => !hiddenPlugins.has(novel.pluginId));

        if (reset) {
          setNovels(searchResults);
        } else {
          setNovels(prev => [...prev, ...searchResults]);
        }

        setHasMoreData(
          libraryLoadLimit !== -1 && searchResults.length === pageSize,
        );
      } else {
        const categoryNovels = getLibraryNovelsFromDb(
          sortOrder,
          filter,
          undefined,
          downloadedOnlyMode,
          pageSize,
          offset,
          undefined,
          categoryNovelIds,
        ).filter(novel => !hiddenPlugins.has(novel.pluginId));

        if (reset) {
          setNovels(categoryNovels);
        } else {
          setNovels(prev => [...prev, ...categoryNovels]);
        }

        setHasMoreData(
          libraryLoadLimit !== -1 && categoryNovels.length === pageSize,
        );
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
    ],
  );

  const loadMoreNovels = useCallback(() => {
    if (hasMoreData && libraryLoadLimit !== -1) {
      loadNovels(false, novels);
    }
  }, [hasMoreData, loadNovels, novels, libraryLoadLimit]);

  // Only reset novels when filters change or it's a new search/category without stored state
  useEffect(() => {
    if (isFocused) {
      const stored = categoryStates.get(categoryKey);
      // Only force reload if no stored data exists (first load of this category)
      if (!stored) {
        loadNovels(true);
      }
      // If we have stored data, use it (no reload) - prevents refreshes during downloads
      // The libraryChangeKey dependency has been removed to prevent unnecessary refreshes
    }
  }, [
    categoryKey,
    isFocused,
    sortOrder,
    filter,
    downloadedOnlyMode,
    loadNovels,
    // Removed libraryChangeKey - it was causing full refreshes on every download
  ]);

  // Notify parent component about visible novels for select all functionality
  useEffect(() => {
    if (onSelectAllVisible && novels.length > 0) {
      onSelectAllVisible(novels.map(novel => novel.id));
    }
  }, [novels, onSelectAllVisible]);

  const memoizedNovels = useMemo(() => novels, [novels]);
  const { matches: libraryMatches } = useLibraryMatching({
    novels: memoizedNovels,
  });

  const renderItem = useCallback(
    ({ item }: { item: NovelInfo }) => {
      return (
        <NovelCover
          item={item}
          theme={theme}
          isSelected={selectedNovelIds.includes(item.id)}
          match={libraryMatches[item.id]}
          onLongPress={() =>
            setSelectedNovelIds(xor(selectedNovelIds, [item.id]))
          }
          onPress={() => {
            if (selectedNovelIds.length) {
              setSelectedNovelIds(xor(selectedNovelIds, [item.id]));
            } else {
              navigation.navigate('ReaderStack', {
                screen: 'Novel',
                params: item,
              });
            }
          }}
          libraryStatus={false}
          selectedNovelIds={selectedNovelIds}
        />
      );
    },
    [theme, selectedNovelIds, libraryMatches, setSelectedNovelIds, navigation],
  );

  const onRefresh = useCallback(() => {
    if (categoryId === 2) {
      return;
    }
    const updateOnPull =
      MMKVStorage.getBoolean(UPDATE_ON_PULL_REFRESH_ENABLED) ?? true;
    if (!updateOnPull) {
      // Just refresh the local data without triggering update task
      loadNovels(true);
      return;
    }
    setRefreshing(true);
    ServiceManager.manager.addTask({
      name: 'UPDATE_LIBRARY',
      data: {
        categoryId,
        categoryName,
      },
    });

    setTimeout(() => {
      loadNovels(true);
      setRefreshing(false);
    }, 1000);
  }, [categoryId, categoryName, loadNovels]);

  return (
    <View style={styles.flex}>
      <NovelList
        data={novels}
        extraData={[selectedNovelIds]}
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
