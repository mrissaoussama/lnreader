import React, { useCallback, useRef, useState } from 'react';

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

import { NovelItem } from '@plugins/types';
import { getString } from '@strings/translations';
import { StyleSheet } from 'react-native';
import { NovelInfo } from '@database/types';
import SourceScreenSkeletonLoading from '@screens/browse/loadingAnimation/SourceScreenSkeletonLoading';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrowseSourceScreenProps } from '@navigators/types';
import { useLibraryContext } from '@components/Context/LibraryContext';
import ServiceManager from '@services/ServiceManager';
import { showToast } from '@utils/showToast';
import * as Clipboard from 'expo-clipboard';

const BrowseSourceScreen = ({ route, navigation }: BrowseSourceScreenProps) => {
  const theme = useTheme();
  const { pluginId, pluginName, site, showLatestNovels } = route.params;

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
  } = useBrowseSource(pluginId, showLatestNovels);

  const {
    isSearching,
    searchResults,
    searchSource,
    searchNextPage,
    hasNextSearchPage,
    clearSearchResults,
    searchError,
  } = useSearchSource(pluginId);
  const novelList = searchResults.length > 0 ? searchResults : novels;
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

  const { hideInLibraryItems } = useBrowseSettings();

  const navigateToNovel = useCallback(
    (item: NovelItem | NovelInfo) =>
      navigation.navigate('ReaderStack', {
        screen: 'Novel',
        params: {
          ...item,
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
      return `${pluginId}-${item.path}-${item.name.replace(/\s+/g, '_')}`;
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
      const baseUrl = site.endsWith('/') ? site.slice(0, -1) : site;
      return `${baseUrl}${item.path}`;
    });

    const urlsText = urls.join('\n');
    await Clipboard.setStringAsync(urlsText);

    ServiceManager.manager.addTask({
      name: 'MASS_IMPORT',
      data: { urls },
    });

    showToast(
      getString('browseScreen.urlsCopiedAndImported', {
        count: selectedItems.length,
      }),
    );

    setIsMultiSelectMode(false);
    setSelectedItems([]);
  }, [selectedItems, site]);

  const selectAllItems = () => {
    setSelectedItems([...novelList]);
  };

  const clearAllSelections = () => {
    setSelectedItems([]);
  };

  React.useEffect(() => {
    if (isMultiSelectMode && selectedItems.length > 0) {
      const validSelections = selectedItems.filter(selectedItem =>
        novelList.some(
          novelItem => getItemKey(novelItem) === getItemKey(selectedItem),
        ),
      );
      if (validSelections.length !== selectedItems.length) {
        setSelectedItems(validSelections);
      }
    }
  }, [novelList, isMultiSelectMode, selectedItems, getItemKey]);

  React.useEffect(() => {
    const unsubscribe = ServiceManager.manager.observe('MASS_IMPORT', task => {
      if (task && !task.isRunning) {
        refetchLibrary();
      }
    });

    return unsubscribe;
  }, [refetchLibrary]);

  const { bottom, right } = useSafeAreaInsets();
  const filterSheetRef = useRef<BottomSheetModal | null>(null);
  return (
    <SafeAreaView>
      <SearchbarV2
        searchText={searchText}
        leftIcon={isMultiSelectMode ? 'close' : 'magnify'}
        placeholder={
          isMultiSelectMode
            ? `${selectedItems.length} selected`
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
                    selectedItems.length === novelList.length
                      ? 'checkbox-multiple-blank-outline'
                      : 'checkbox-multiple-marked',
                  onPress:
                    selectedItems.length === novelList.length
                      ? clearAllSelections
                      : selectAllItems,
                },
              ]
            : [
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
      ) : errorMessage || novelList.length === 0 ? (
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
          data={novelList}
          inSource
          renderItem={({ item }) => {
            if (hideInLibraryItems && novelInLibrary(pluginId, item.path)) {
              return null;
            }
            const inLibrary = novelInLibrary(pluginId, item.path);

            return (
              <NovelCover
                item={item}
                theme={theme}
                libraryStatus={inLibrary}
                inActivity={inActivity[item.path]}
                onPress={() => {
                  if (isMultiSelectMode) {
                    toggleItemSelection(item);
                  } else {
                    navigateToNovel(item);
                  }
                }}
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
                selectedNovelIds={[]}
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
      {!showLatestNovels &&
      filterValues &&
      !searchText &&
      !isMultiSelectMode ? (
        <>
          <FAB
            icon={'filter-variant'}
            style={[
              styles.filterFab,
              {
                backgroundColor: theme.primary,
                marginBottom: bottom + 16,
                marginRight: right + 16,
              },
            ]}
            label={getString('common.filter')}
            uppercase={false}
            color={theme.onPrimary}
            onPress={() => filterSheetRef?.current?.present()}
          />
          <FilterBottomSheet
            filterSheetRef={filterSheetRef}
            filters={filterValues}
            setFilters={setFilters}
            clearFilters={clearFilters}
            pluginId={pluginId}
          />
        </>
      ) : null}
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
});
