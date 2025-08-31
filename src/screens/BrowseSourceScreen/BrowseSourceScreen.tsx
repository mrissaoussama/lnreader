import React, { useCallback, useRef, useState, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { FAB } from 'react-native-paper';
import { ErrorScreenV2, SafeAreaView, SearchbarV2 } from '@components/index';
import NovelList from '@components/NovelList';
import NovelCover from '@components/NovelCover';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import FilterBottomSheet from './components/FilterBottomSheet';

import { useSearch } from '@hooks';
import { useTheme } from '@hooks/persisted';
import { useBrowseSource, useSearchSource } from './useBrowseSource';
import { useBrowseSettings } from '@hooks/persisted/useSettings';
import { useAdvancedFilters } from '@hooks/useAdvancedFilters';
import { useLibraryMatching } from '@hooks/useLibraryMatching';

import { NovelItem } from '@plugins/types';
import { getString } from '@strings/translations';
import { NovelInfo } from '@database/types';
import SourceScreenSkeletonLoading from '@screens/browse/loadingAnimation/SourceScreenSkeletonLoading';
import { mergeUrlAndPath } from '@utils/urlUtils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrowseSourceScreenProps } from '@navigators/types';
import { useLibraryContext } from '@components/Context/LibraryContext';
import ServiceManager from '@services/ServiceManager';
import MassImportModal from '@screens/library/components/MassImportModal/MassImportModal';

// Optimized novel item component to improve performance, no rerenders ect
const OptimizedNovelItem = React.memo<{
  item: NovelItem | NovelInfo;
  theme: any;
  libraryStatus: boolean;
  inActivity: boolean;
  isMultiSelectMode: boolean;
  onPress: () => void;
  onToggleSelection: () => void;
  isSelected: boolean;
  addSkeletonLoading: boolean;
  onLongPress: () => Promise<void>;
  match: any;
}>(
  ({
    item,
    theme,
    libraryStatus,
    inActivity,
    isMultiSelectMode,
    onPress,
    onToggleSelection,
    isSelected,
    addSkeletonLoading,
    onLongPress,
    match,
  }) => {
    return (
      <NovelCover
        item={item}
        theme={theme}
        libraryStatus={libraryStatus}
        inActivity={inActivity}
        match={match}
        onPress={() => {
          if (isMultiSelectMode) {
            onToggleSelection();
          } else {
            onPress();
          }
        }}
        isSelected={isSelected}
        addSkeletonLoading={addSkeletonLoading}
        onLongPress={onLongPress}
        selectedNovelIds={[]}
      />
    );
  },
);

const BrowseSourceScreen = ({ route, navigation }: BrowseSourceScreenProps) => {
  const theme = useTheme();
  const { pluginId, pluginName, site, showLatestNovels } = route.params;

  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isLocalFiltersOpen, setIsLocalFiltersOpen] = useState(false);

  const isAnyFilterOpen = isFilterSheetOpen || isLocalFiltersOpen;

  const {
    isLoading,
    novels,
    hasNextPage,
    fetchNextPage,
    error,
    filterValues,
    setFilters,
    clearFilters,
    refetchNovels,
  } = useBrowseSource(pluginId, showLatestNovels, isAnyFilterOpen);

  const {
    isSearching,
    searchResults,
    searchSource,
    searchNextPage,
    hasNextSearchPage,
    clearSearchResults,
    searchError,
  } = useSearchSource(pluginId, isAnyFilterOpen);

  const { matches: libraryMatches } = useLibraryMatching({
    novels: searchResults.length > 0 ? searchResults : novels,
    pluginId,
  });

  const { hiddenCount, applyFiltersToList } =
    useAdvancedFilters(isAnyFilterOpen);

  const novelList = searchResults.length > 0 ? searchResults : novels;
  const filteredNovelList = useMemo(
    () => applyFiltersToList(novelList),
    [applyFiltersToList, novelList],
  );
  const errorMessage = error || searchError;

  const { searchText, setSearchText, clearSearchbar } = useSearch();
  const onChangeText = (text: string) => setSearchText(text);
  const onSubmitEditing = () => {
    searchSource(searchText);
    if (isMultiSelectMode) {
      setSelectedItems([]);
    }
  };
  const handleClearSearchbar = () => {
    clearSearchbar();
    clearSearchResults();
    if (isMultiSelectMode) {
      setSelectedItems([]);
    }
  };

  const handleOpenWebView = async () => {
    navigation.navigate('WebviewScreen', {
      name: pluginName,
      url: site,
      pluginId,
    });
  };

  const { novelInLibrary, switchNovelToLibrary, refetchLibrary } =
    useLibraryContext();
  const [inActivity, setInActivity] = useState<Record<string, boolean>>({});

  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<(NovelItem | NovelInfo)[]>(
    [],
  );
  const [isMassImportModalVisible, setIsMassImportModalVisible] =
    useState(false);
  const [massImportUrls, setMassImportUrls] = useState<string>('');

  const { hideInLibraryItems, enableAdvancedFilters } = useBrowseSettings();

  const navigateToNovel = useCallback(
    (item: NovelItem | NovelInfo) =>
      navigation.navigate('ReaderStack', {
        screen: 'Novel',
        params: {
          ...item,
          path: require('@utils/urlUtils').normalizePath(item.path || ''),
          pluginId: pluginId,
        },
      }),
    [navigation, pluginId],
  );

  const toggleMultiSelectMode = () => {
    setIsMultiSelectMode(!isMultiSelectMode);
    setSelectedItems([]);
  };

  const getItemKey = useCallback(
    (item: NovelItem | NovelInfo) => {
      const np = require('@utils/urlUtils').normalizePath(item.path || '');
      return `${pluginId}-${np}-${item.name.replace(/\s+/g, '_')}`;
    },
    [pluginId],
  );

  const toggleItemSelection = (item: NovelItem | NovelInfo) => {
    const itemKey = getItemKey(item);
    setSelectedItems(prev => {
      const isSelected = prev.some(
        selected => getItemKey(selected) === itemKey,
      );
      if (isSelected) {
        return prev.filter(selected => getItemKey(selected) !== itemKey);
      } else {
        return [...prev, item];
      }
    });
  };

  const handleImportSelected = useCallback(async () => {
    if (selectedItems.length === 0) return;

    const urls = selectedItems.map(item => {
      return mergeUrlAndPath(site, item.path);
    });

    const urlsText = urls.join('\n');
    setMassImportUrls(urlsText);
    setIsMassImportModalVisible(true);
  }, [selectedItems, site]);

  const selectAllItems = useCallback(() => {
    setSelectedItems([...filteredNovelList]);
  }, [filteredNovelList]);

  const clearAllSelections = useCallback(() => {
    setSelectedItems([]);
  }, []);

  React.useEffect(() => {
    if (isMultiSelectMode && selectedItems.length > 0) {
      const validSelections = selectedItems.filter(selectedItem =>
        filteredNovelList.some(
          novelItem => getItemKey(novelItem) === getItemKey(selectedItem),
        ),
      );
      if (validSelections.length !== selectedItems.length) {
        setSelectedItems(validSelections);
      }
    }
  }, [filteredNovelList, isMultiSelectMode, selectedItems, getItemKey]);

  React.useEffect(() => {
    const unsubscribe = ServiceManager.manager.observe('MASS_IMPORT', task => {
      if (task) {
        refetchLibrary();
      }
    });

    return unsubscribe;
  }, [refetchLibrary]);

  // Listen for navigation focus to detect when user returns from LocalFiltersScreen
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setIsLocalFiltersOpen(false);
    });

    return unsubscribe;
  }, [navigation, setIsLocalFiltersOpen]);

  const { bottom, right } = useSafeAreaInsets();
  const filterSheetRef = useRef<BottomSheetModal | null>(null);
  return (
    <SafeAreaView>
      <SearchbarV2
        searchText={searchText}
        leftIcon={isMultiSelectMode ? 'close' : 'magnify'}
        placeholder={
          isAnyFilterOpen
            ? isLocalFiltersOpen
              ? 'loading paused'
              : 'local Filtering paused'
            : isMultiSelectMode
            ? `${selectedItems.length} selected`
            : enableAdvancedFilters && hiddenCount > 0
            ? `${getString(
                'common.search',
              )} ${pluginName} (${hiddenCount} hidden)`
            : `${getString('common.search')} ${pluginName}`
        }
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        clearSearchbar={handleClearSearchbar}
        handleBackAction={
          isMultiSelectMode ? toggleMultiSelectMode : navigation.goBack
        }
        rightIcons={
          isMultiSelectMode
            ? [
                {
                  iconName:
                    selectedItems.length === filteredNovelList.length
                      ? 'checkbox-multiple-blank-outline'
                      : 'checkbox-multiple-marked',
                  onPress:
                    selectedItems.length === filteredNovelList.length
                      ? clearAllSelections
                      : selectAllItems,
                },
              ]
            : [
                ...(enableAdvancedFilters
                  ? [
                      {
                        iconName: (hiddenCount > 0
                          ? 'filter'
                          : 'filter-outline') as any,
                        onPress: () => {
                          setIsLocalFiltersOpen(true);
                          navigation.navigate('LocalFiltersScreen');
                        },
                        color: hiddenCount > 0 ? theme.primary : undefined,
                      },
                    ]
                  : []),
                {
                  iconName: 'checkbox-multiple-outline',
                  onPress: toggleMultiSelectMode,
                },
                { iconName: 'earth', onPress: handleOpenWebView },
              ]
        }
        theme={theme}
      />

      {isLoading || isSearching ? (
        <SourceScreenSkeletonLoading theme={theme} />
      ) : errorMessage || filteredNovelList.length === 0 ? (
        <ErrorScreenV2
          error={errorMessage || getString('sourceScreen.noResultsFound')}
          actions={[
            {
              iconName: 'refresh',
              title: getString('common.retry'),
              onPress: () => {
                if (searchText) {
                  searchSource(searchText);
                } else {
                  refetchNovels();
                }
              },
            },
          ]}
        />
      ) : (
        <NovelList
          data={filteredNovelList}
          inSource
          renderItem={({ item }) => {
            if (hideInLibraryItems && novelInLibrary(pluginId, item.path)) {
              return null;
            }
            const inLibrary = novelInLibrary(pluginId, item.path);

            return (
              <OptimizedNovelItem
                item={item}
                theme={theme}
                libraryStatus={inLibrary}
                inActivity={inActivity[item.path]}
                isMultiSelectMode={isMultiSelectMode}
                onPress={() => navigateToNovel(item)}
                onToggleSelection={() => toggleItemSelection(item)}
                isSelected={
                  isMultiSelectMode &&
                  selectedItems.some(
                    selected => getItemKey(selected) === getItemKey(item),
                  )
                }
                addSkeletonLoading={
                  (hasNextPage && !searchText) ||
                  (hasNextSearchPage && Boolean(searchText))
                }
                onLongPress={async () => {
                  if (isMultiSelectMode) {
                    toggleItemSelection(item);
                  } else {
                    setInActivity(prev => ({ ...prev, [item.path]: true }));
                    await switchNovelToLibrary(item.path, pluginId);
                    setInActivity(prev => ({ ...prev, [item.path]: false }));
                  }
                }}
                match={libraryMatches[item.path]}
              />
            );
          }}
          onEndReached={() => {
            if (searchText) {
              if (hasNextSearchPage) {
                searchNextPage();
              }
            } else if (hasNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={1.5}
        />
      )}

      {/* Multi-select Import FAB */}
      {isMultiSelectMode && selectedItems.length > 0 ? (
        <FAB
          icon={'import'}
          style={[
            styles.importFab,
            {
              backgroundColor: theme.primary,
              marginBottom: bottom + 16,
              marginRight: right + 16,
            },
          ]}
          label={getString('browseScreen.importSelected', {
            count: selectedItems.length,
          })}
          uppercase={false}
          color={theme.onPrimary}
          onPress={handleImportSelected}
        />
      ) : null}

      {/* Plugin Filter FAB */}
      {!showLatestNovels &&
      filterValues &&
      !searchText &&
      !isMultiSelectMode ? (
        <FAB
          icon={'filter-variant'}
          style={[
            styles.filterFab,
            {
              backgroundColor: theme.primary,
              marginBottom:
                enableAdvancedFilters && !searchText
                  ? bottom + 80
                  : bottom + 16,
              marginRight: right + 16,
            },
          ]}
          label={getString('common.filter')}
          uppercase={false}
          color={theme.onPrimary}
          onPress={() => {
            setIsFilterSheetOpen(true);
            filterSheetRef?.current?.present();
          }}
        />
      ) : null}

      {/* Plugin Filter Bottom Sheet */}
      {!showLatestNovels &&
      filterValues &&
      !searchText &&
      !isMultiSelectMode ? (
        <FilterBottomSheet
          filterSheetRef={filterSheetRef}
          filters={filterValues}
          setFilters={setFilters}
          clearFilters={clearFilters}
          pluginId={pluginId}
          onSheetChange={isOpen => setIsFilterSheetOpen(isOpen)}
        />
      ) : null}

      <MassImportModal
        visible={isMassImportModalVisible}
        closeModal={() => {
          setIsMassImportModalVisible(false);
          setMassImportUrls('');
          setIsMultiSelectMode(false);
          setSelectedItems([]);
        }}
        initialText={massImportUrls}
      />
    </SafeAreaView>
  );
};

export default BrowseSourceScreen;

const styles = StyleSheet.create({
  filterFab: {
    bottom: 0,
    margin: 16,
    position: 'absolute',
    right: 0,
  },
  importFab: {
    bottom: 0,
    margin: 16,
    position: 'absolute',
    right: 0,
  },
  filterStatus: {
    margin: 8,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  filterStatusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  container: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 16,
  },
});
