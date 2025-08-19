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

const PAGE_SIZE = 50;

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
  libraryChangeKey?: number; // Add dependency to trigger reloads when library changes
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
  libraryChangeKey,
}) => {
  const theme = useTheme();
  const {
    filter,
    sortOrder,
    downloadedOnlyMode = false,
  } = useLibrarySettings();

  const [novels, setNovels] = useState<NovelInfo[]>([]);
  const [hasMoreData, setHasMoreData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNovels = useCallback(
    (reset: boolean = false, currentNovels: NovelInfo[] = []) => {
      if (!isFocused) return;

      const offset = reset ? 0 : currentNovels.length;

      if (searchText.trim()) {
        const searchResults = getLibraryNovelsFromDb(
          sortOrder,
          filter,
          searchText,
          downloadedOnlyMode,
          PAGE_SIZE,
          offset,
          undefined,
          categoryNovelIds,
        );

        if (reset) {
          setNovels(searchResults);
        } else {
          setNovels(prev => [...prev, ...searchResults]);
        }

        setHasMoreData(searchResults.length === PAGE_SIZE);
      } else {
        const categoryNovels = getLibraryNovelsFromDb(
          sortOrder,
          filter,
          undefined,
          downloadedOnlyMode,
          PAGE_SIZE,
          offset,
          undefined,
          categoryNovelIds,
        );

        if (reset) {
          setNovels(categoryNovels);
        } else {
          setNovels(prev => [...prev, ...categoryNovels]);
        }

        setHasMoreData(categoryNovels.length === PAGE_SIZE);
      }
    },
    [
      isFocused,
      searchText,
      sortOrder,
      filter,
      downloadedOnlyMode,
      categoryNovelIds,
    ],
  );

  const loadMoreNovels = useCallback(() => {
    if (hasMoreData) {
      loadNovels(false, novels);
    }
  }, [hasMoreData, loadNovels, novels]);

  useEffect(() => {
    setNovels([]);
    setHasMoreData(true);
    if (isFocused) {
      loadNovels(true);
    }
  }, [
    searchText,
    categoryId,
    sortOrder,
    filter,
    downloadedOnlyMode,
    libraryChangeKey,
    isFocused,
    loadNovels,
  ]);

  useEffect(() => {
    if (isFocused && novels.length === 0) {
      setHasMoreData(true);
      loadNovels(true);
    }
  }, [isFocused, novels.length, loadNovels]);

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
