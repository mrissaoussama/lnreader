import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { BottomSheetModal, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import {
  deleteTrack,
  insertTrack,
  updateTrack,
} from '@database/queries/TrackQueries';
import {
  getAlternativeTitles,
  addAlternativeTitle,
} from '@database/queries/NovelQueries';
import { TrackStatus } from '@database/types/Track';
import { List, Button, IconButton } from 'react-native-paper';
import { useBoolean } from '@hooks/index';
import { useTracker, useTrackedNovel } from '@hooks/persisted';
import {
  searchTracker,
  updateUserListEntry,
  trackers as allTrackers,
  TRACKER_SOURCES,
} from '@services/Trackers';
import { showToast } from '@utils/showToast';
import { getTotalReadChaptersCount } from '@database/queries/ChapterQueries';
import { getString } from '@strings/translations';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import SearchbarV2 from '@components/SearchbarV2/SearchbarV2';
import SetTrackChaptersDialog from './SetTrackChaptersDialog';
import UpdateAllTrackersDialog from './UpdateAllTrackersDialog';

type TrackSheetProps = {
  bottomSheetRef: React.RefObject<BottomSheetModal>;
  novel: any;
  theme: any;
};

const TrackSheet: React.FC<TrackSheetProps> = ({
  bottomSheetRef,
  novel,
  theme,
}) => {
  const [searchText, setSearchText] = useState(novel.name);
  const [selectedTracker, setSelectedTracker] = useState();
  const [selectedReadingList, setSelectedReadingList] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isUpdating, _setIsUpdating] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [availableLists, setAvailableLists] = useState([]);
  const [refreshingLists, setRefreshingLists] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [updateAllDialogVisible, setUpdateAllDialogVisible] = useState(false);
  const [titlePickerVisible, setTitlePickerVisible] = useState(false);
  const [availableTitles, setAvailableTitles] = useState<string[]>([]);

  const snapPoints = useMemo(() => ['50%', '90%'], []);

  const {
    setTrue: showChaptersDialog,
    setFalse: hideChaptersDialog,
    value: chaptersDialog,
  } = useBoolean();
  const { getTrackerAuth, setTracker } = useTracker();
  const { tracks, loadTracks, getTrackForSource } = useTrackedNovel(novel.id);
  const getReadingListsCacheKey = useCallback(
    tracker => `reading_lists_${tracker}`,
    [],
  );
  const loadCachedReadingLists = useCallback(
    async tracker => {
      try {
        const cached = MMKVStorage.getString(getReadingListsCacheKey(tracker));
        if (cached) {
          const lists = JSON.parse(cached);
          setAvailableLists(lists);
          return lists;
        }
      } catch {}
      return [];
    },
    [getReadingListsCacheKey],
  );

  const renderAccountOffIcon = useCallback(
    () => <List.Icon icon="account-off" />,
    [],
  );
  const renderSyncIcon = useCallback(() => <List.Icon icon="sync" />, []);
  const renderCheckCircleIcon = useCallback(
    () => <List.Icon icon="check-circle" color={theme.primary} />,
    [theme.primary],
  );

  const renderSearchItemIcon = useCallback(
    item =>
      item.coverImage ? (
        <Image
          source={{
            uri: item.coverImage,
          }}
          style={styles.coverImage}
        />
      ) : (
        <List.Icon icon="book" />
      ),
    [],
  );
  const saveCachedReadingLists = (tracker, lists) => {
    try {
      MMKVStorage.set(getReadingListsCacheKey(tracker), JSON.stringify(lists));
    } catch {}
  };
  const refreshReadingLists = async () => {
    if (!selectedTracker) return;
    setRefreshingLists(true);
    try {
      const auth = getTrackerAuth(selectedTracker);
      if (!auth) {
        throw new Error(`Not logged in to ${selectedTracker}`);
      }
      const tracker = allTrackers[selectedTracker];
      if (tracker.getAvailableReadingLists) {
        const lists = await tracker.getAvailableReadingLists('dummy', auth);
        setAvailableLists(lists);
        await saveCachedReadingLists(selectedTracker, lists);
        if (lists.length > 0) {
          setSelectedReadingList(lists[0]);
        }
        showToast(`Refreshed ${lists.length} reading lists`);
      }
    } catch (error) {
      showToast(
        error.message || getString('trackingDialog.failedToRefreshLists'),
      );
    } finally {
      setRefreshingLists(false);
    }
  };
  const loadReadingListsOnTrackerChange = useCallback(async () => {
    if (!selectedTracker) {
      setAvailableLists([]);
      setSelectedReadingList(null);
      return;
    }
    const tracker = allTrackers[selectedTracker];
    if (!tracker) return;
    const cachedLists = loadCachedReadingLists(selectedTracker);
    if (cachedLists && cachedLists.length > 0) {
      setAvailableLists(cachedLists);
      setSelectedReadingList(cachedLists[0]);
    }
    if (tracker.getAvailableReadingLists) {
      if (
        tracker.capabilities.hasStaticLists ||
        tracker.capabilities.hasDynamicLists
      ) {
        try {
          const auth = getTrackerAuth(selectedTracker);
          if (auth || !tracker.capabilities.requiresAuth) {
            const lists = await tracker.getAvailableReadingLists(
              'dummy',
              auth || {},
            );
            setAvailableLists(lists);
            if (lists.length > 0) {
              setSelectedReadingList(lists[0]);
            }
          } else {
          }
        } catch (error) {}
      }
    }
  }, [selectedTracker, getTrackerAuth, loadCachedReadingLists]);
  useEffect(() => {
    loadReadingListsOnTrackerChange();
  }, [loadReadingListsOnTrackerChange]);
  const handleSearch = useCallback(
    async (page = 1, isNewSearch = false) => {
      if (!selectedTracker) return;
      if (isNewSearch) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const auth = getTrackerAuth(selectedTracker);
        if (!auth) {
          throw new Error(`Not logged in to ${selectedTracker}`);
        }
        const results = await searchTracker(selectedTracker, searchText, auth, {
          page,
        });

        if (isNewSearch) {
          setSearchResults(results);
          setCurrentPage(1);
          const tracker = allTrackers[selectedTracker];
          if (tracker && tracker.capabilities.supportsPagination) {
            setHasMore(results.length > 0);
          } else {
            setHasMore(false);
          }
        } else {
          // Check for duplicate results when loading more pages, for some reason nu and mal keep loading dupes
          setSearchResults(prev => {
            const existingIds = new Set(prev.map(item => item.id));
            const newResults = results.filter(
              item => !existingIds.has(item.id),
            );

            // If no new results or all results are duplicates, stop loading more
            if (newResults.length === 0) {
              setHasMore(false);
              return prev;
            }

            return [...prev, ...newResults];
          });

          if (results.length === 0) {
            setHasMore(false);
          }
        }
        setCurrentPage(page);
      } catch (error) {
        showToast(error.message);
        if (isNewSearch) {
          setSearchResults([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [selectedTracker, searchText, getTrackerAuth],
  );

  // Auto-search when tracker search becomes active with novel title
  useEffect(() => {
    if (
      searchActive &&
      selectedTracker &&
      searchText === novel.name &&
      searchText.trim()
    ) {
      const timeoutId = setTimeout(() => {
        handleSearch(1, true);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [searchActive, selectedTracker, searchText, novel.name, handleSearch]);

  // Load alternative titles when component mounts
  const loadAlternativeTitles = useCallback(async () => {
    try {
      const altTitles = await getAlternativeTitles(novel.id);
      // Combine main title with alternative titles
      const allTitles = [novel.name, ...altTitles].filter(Boolean);
      setAvailableTitles(allTitles);
    } catch (error) {
      // If loading fails, just use the main title
      setAvailableTitles([novel.name]);
    }
  }, [novel.id, novel.name]);

  useEffect(() => {
    loadAlternativeTitles();
  }, [loadAlternativeTitles]);

  const handleTitleSelect = (title: string) => {
    setSearchText(title);
    setTitlePickerVisible(false);
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      // if we have very few results (less than 10) and we're on page 1,
      // it's likely that there are no more results, so don't try to load more
      if (searchResults.length < 10 && currentPage === 1) {
        setHasMore(false);
        return;
      }
      handleSearch(currentPage + 1, false);
    }
  };
  const getHighestReadChapter = useCallback(() => {
    try {
      if (novel.id === 'NO_ID' || typeof novel.id === 'string') {
        return 0;
      }
      const result = getTotalReadChaptersCount(novel.id);
      return result;
    } catch (error) {
      return 0;
    }
  }, [novel.id]);
  const handleUpdateAll = async () => {
    if (isUpdating) return;
    const appProgress = getHighestReadChapter();
    if (appProgress === 0 && tracks.length === 0) {
      showToast(getString('trackingDialog.noChaptersRead'));
      return;
    }
    setUpdateAllDialogVisible(true);
  };
  const handleUpdateAllConfirm = async targetProgress => {
    try {
      const tracksToUpdate = tracks.filter(
        track => track.lastChapterRead !== targetProgress,
      );
      if (tracksToUpdate.length === 0) {
        showToast('No trackers need updating');
        return;
      }

      showToast(`Updating ${tracksToUpdate.length} trackers...`);

      let successCount = 0;
      let errorCount = 0;

      for (const track of tracksToUpdate) {
        try {
          const auth = getTrackerAuth(track.source);
          if (!auth) {
            throw new Error(`Not logged in to ${track.source}`);
          }

          const updateResult = await updateUserListEntry(
            track.source,
            track.sourceId,
            {
              progress: targetProgress,
            },
            auth,
          );

          // Add alternative titles from tracker update to database if available
          if (
            updateResult.alternativeTitles &&
            updateResult.alternativeTitles.length > 0 &&
            novel.id !== 'NO_ID'
          ) {
            for (const title of updateResult.alternativeTitles) {
              try {
                await addAlternativeTitle(novel.id, title);
              } catch (e) {}
            }
          }

          // Update the local database
          await updateTrack(track.id, {
            lastChapterRead: targetProgress,
            lastSyncAt: new Date().toISOString(),
          });

          successCount++;
        } catch (error) {
          errorCount++;
        }
      }

      // Refresh the tracks to update the UI
      await loadTracks();

      if (errorCount > 0) {
        showToast(`Updated ${successCount} trackers, ${errorCount} failed`);
      } else {
        showToast(`Successfully updated ${successCount} trackers`);
      }
    } catch (error) {
      showToast(
        error.message || getString('trackingDialog.failedToUpdateTrackers'),
      );
    }
  };
  const handleLink = async item => {
    try {
      if (typeof novel.id === 'string') {
        throw new Error(getString('trackingDialog.cannotTrackNovelWithoutID'));
      }
      if (!selectedTracker) {
        showToast(getString('trackingDialog.pleaseSelectTracker'));
        return;
      }
      const tracker = allTrackers[selectedTracker];
      if (
        tracker &&
        (tracker.capabilities.hasDynamicLists ||
          tracker.capabilities.hasStaticLists)
      ) {
        if (!selectedReadingList) {
          const listType = tracker.capabilities.hasDynamicLists
            ? getString('common.readingList')
            : getString('common.status');
          showToast(
            getString('trackingDialog.selectReadingList', {
              listType,
            }),
          );
          return;
        }
        await addToReadingListAndTrack(item, selectedReadingList);
        return;
      }
      await createTrackRecord(item);
    } catch (error) {
      showToast(error.message || getString('trackingDialog.failedToLinkNovel'));
    }
  };
  const addToReadingListAndTrack = async (item, readingList) => {
    try {
      const auth = getTrackerAuth(selectedTracker);
      const tracker = allTrackers[selectedTracker];
      if (tracker.addToReadingList && auth) {
        await tracker.addToReadingList(item.id, readingList.id, auth);
      } else {
      }
      await createTrackRecord(item);
    } catch (error) {
      showToast(error.message || getString('trackingDialog.failedToAddToList'));
    }
  };
  const createTrackRecord = async item => {
    if (typeof novel.id === 'string') {
      throw new Error('Cannot track novel without valid ID');
    }

    // Add alternative titles from tracker if available
    if (item.alternativeTitles && item.alternativeTitles.length > 0) {
      for (const title of item.alternativeTitles) {
        try {
          await addAlternativeTitle(novel.id, title);
        } catch (e) {}
      }
    }

    const trackData = {
      novelId: novel.id,
      source: selectedTracker,
      sourceId: String(item.id),
      title: item.title,
      lastChapterRead: 1,
      totalChapters: item.totalChapters,
      status: TrackStatus.Reading,
      metadata: JSON.stringify({
        novelId: item.id,
      }),
    };
    await insertTrack(trackData);
    await loadTracks();
    setSearchActive(false);
    setSearchResults([]);
    showToast(`Linked to ${selectedTracker}`);
  };
  const handleUnlink = useCallback(
    async track => {
      try {
        await deleteTrack(track.id);
        await loadTracks();
        showToast(`Unlinked from ${track.source}`);
      } catch (error) {
        showToast(error.message);
      }
    },
    [loadTracks],
  );
  const handleUpdate = async (track, newChapter, forceUpdate = false) => {
    try {
      if (
        typeof newChapter !== 'number' ||
        isNaN(newChapter) ||
        newChapter < 0
      ) {
        throw new Error('Invalid chapter number');
      }
      const currentProgress = track.lastChapterRead || 0;
      if (newChapter < currentProgress && !forceUpdate) {
        showToast(
          `Cannot set progress to ${newChapter} (current: ${currentProgress}). Use force update to override.`,
        );
        return;
      }
      const auth = getTrackerAuth(track.source);
      if (!auth) {
        throw new Error(`Not logged in to ${track.source}`);
      }
      const updateResult = await updateUserListEntry(
        track.source,
        track.sourceId,
        {
          progress: newChapter,
        },
        auth,
      );

      // Add alternative titles from tracker update to database if available
      if (
        updateResult.alternativeTitles &&
        updateResult.alternativeTitles.length > 0 &&
        novel.id !== 'NO_ID'
      ) {
        for (const title of updateResult.alternativeTitles) {
          try {
            await addAlternativeTitle(novel.id, title);
          } catch (e) {}
        }
      }

      await updateTrack(track.id, {
        lastChapterRead: newChapter,
        lastSyncAt: new Date().toISOString(),
      });
      await loadTracks();
      showToast(`Updated progress on ${track.source}`);
    } catch (error) {
      showToast(error.message);
    }
  };

  const handleLogin = useCallback(
    async source => {
      try {
        const trackerAuth = await allTrackers[source].authenticate();
        if (trackerAuth) {
          setTracker(source, trackerAuth);
          showToast(`Logged in to ${source}`);
          // After successful login, continue with tracker selection
          const auth = getTrackerAuth(source);
          if (auth) {
            setSelectedTracker(source);
            setSearchText(novel.name);
            setSearchActive(true);
          }
        }
      } catch (error) {
        showToast((error as Error).message);
      }
    },
    [setTracker, getTrackerAuth, novel.name],
  );
  const handleTrackerPress = useCallback(
    source => {
      const existingTrack = getTrackForSource(source);
      if (existingTrack) {
        const currentReadChapters = getHighestReadChapter();
        const updatedTrack = {
          ...existingTrack,
          lastChapterRead:
            currentReadChapters || existingTrack.lastChapterRead || 0,
          totalChapters: existingTrack.totalChapters || 0,
          title: existingTrack.title || 'Unknown',
          sourceId: existingTrack.sourceId || '',
          source: existingTrack.source || source,
          id: existingTrack.id || 0,
          novelId:
            existingTrack.novelId ||
            (typeof novel.id === 'number' ? novel.id : 0),
          status: existingTrack.status || 'Reading',
          score: existingTrack.score || 0,
          notes: existingTrack.notes || '',
          metadata: existingTrack.metadata || '',
          lastSyncAt: existingTrack.lastSyncAt || new Date().toISOString(),
          createdAt: existingTrack.createdAt || new Date().toISOString(),
          updatedAt: existingTrack.updatedAt || new Date().toISOString(),
        };

        if (
          updatedTrack &&
          typeof updatedTrack === 'object' &&
          typeof updatedTrack.lastChapterRead === 'number'
        ) {
          setSelectedTrack(updatedTrack);
          showChaptersDialog();
        } else {
          showToast('Error: Invalid track data');
        }
      } else {
        const auth = getTrackerAuth(source);
        if (!auth) {
          if (source === TRACKER_SOURCES.NOVEL_UPDATES) {
            handleLogin(source);
          } else {
            showToast(
              getString('trackingDialog.pleaseLoginTo', {
                tracker: source,
              }),
            );
          }
          return;
        }
        setSelectedTracker(source);
        setSearchText(novel.name);
        setSearchActive(true);
      }
    },
    [
      getTrackForSource,
      getHighestReadChapter,
      novel.id,
      novel.name,
      showChaptersDialog,
      getTrackerAuth,
      handleLogin,
    ],
  );

  const renderTrackActions = useCallback(
    track => (
      <View style={styles.trackActions}>
        <Button
          mode="text"
          onPress={() => handleUnlink(track)}
          textColor={theme.error}
        >
          {getString('trackingDialog.unlink')}
        </Button>
      </View>
    ),
    [theme.error, handleUnlink],
  );

  const renderLinkButton = useCallback(
    item => (
      <Button
        mode="text"
        onPress={() => handleTrackerPress(item)}
        textColor={theme.primary}
      >
        {getString('trackingDialog.link')}
      </Button>
    ),
    [theme.primary, handleTrackerPress],
  );

  const renderTrackerItem = ({ item }) => {
    const track = getTrackForSource(item);
    const isLoggedIn = getTrackerAuth(item);

    if (!isLoggedIn) {
      // Check if it's a webview auth required case
      const description =
        isLoggedIn?.accessToken === 'webview_auth_required'
          ? 'Please login in tracking settings'
          : getString('trackingDialog.notLoggedIn');

      return (
        <List.Item
          title={item}
          description={description}
          left={renderAccountOffIcon}
          onPress={() => handleTrackerPress(item)}
          titleStyle={{
            color: theme.onSurfaceVariant,
          }}
          descriptionStyle={{
            color: theme.onSurfaceVariant,
          }}
        />
      );
    }
    if (track) {
      return (
        <List.Item
          title={item}
          description={`${getString('trackingDialog.progress')}: ${
            track.lastChapterRead || 0
          }/${track.totalChapters || '?'} ${getString(
            'trackingDialog.chapters',
          )}`}
          left={renderCheckCircleIcon}
          right={() => renderTrackActions(track)}
          onPress={() => handleTrackerPress(item)}
        />
      );
    } else {
      return (
        <List.Item
          title={item}
          description={getString('trackingDialog.notTracked')}
          left={renderSyncIcon}
          right={() => renderLinkButton(item)}
          onPress={() => handleTrackerPress(item)}
        />
      );
    }
  };
  const renderSearchItem = ({ item }) => (
    <List.Item
      title={item.title}
      description={`${
        item.totalChapters ? `${item.totalChapters} chapters` : ''
      } • ${item.description?.substring(0, 300)}${
        item.description && item.description.length > 300 ? '...' : ''
      }`}
      left={() => renderSearchItemIcon(item)}
      onPress={() => handleLink(item)}
      titleNumberOfLines={2}
      descriptionNumberOfLines={3}
    />
  );
  return (
    <>
      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        backgroundStyle={{
          backgroundColor: theme.surface2,
        }}
        handleIndicatorStyle={{
          backgroundColor: theme.onSurface,
        }}
      >
        {searchActive && selectedTracker ? (
          <>
            <View
              style={[
                styles.appbarHeader,
                {
                  backgroundColor: theme.surface2,
                },
              ]}
            >
              <IconButton
                icon="arrow-left"
                onPress={() => {
                  setSearchActive(false);
                  setSearchResults([]);
                  setSelectedTracker(undefined);
                }}
                iconColor={theme.onSurface}
              />
              <Text
                style={[
                  styles.appbarTitle,
                  {
                    color: theme.onSurface,
                  },
                ]}
              >
                {getString('trackingDialog.searchTracker', {
                  tracker: selectedTracker,
                })}
              </Text>
            </View>

            <View
              style={[
                styles.searchContainer,
                {
                  backgroundColor: theme.surface2,
                },
              ]}
            >
              <SearchbarV2
                searchText={searchText}
                onChangeText={setSearchText}
                onSubmitEditing={() => handleSearch(1, true)}
                theme={theme}
                placeholder={`Search ${selectedTracker}...`}
                leftIcon="magnify"
                clearSearchbar={() => setSearchText('')}
                rightIcons={[
                  {
                    iconName: 'magnify',
                    onPress: () => handleSearch(1, true),
                  },
                ]}
              />

              {/* Title Picker Button */}
              {availableTitles.length > 1 && (
                <TouchableOpacity
                  style={[
                    styles.titlePickerButton,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.outline,
                    },
                  ]}
                  onPress={() => setTitlePickerVisible(true)}
                >
                  <Text
                    style={[
                      styles.titlePickerText,
                      {
                        color: theme.onSurface,
                      },
                    ]}
                  >
                    Use alternative title ({availableTitles.length} available)
                  </Text>
                  <IconButton icon="chevron-down" size={16} />
                </TouchableOpacity>
              )}

              {}
              {selectedTracker &&
                allTrackers[selectedTracker] &&
                (allTrackers[selectedTracker].capabilities.hasDynamicLists ||
                  allTrackers[selectedTracker].capabilities.hasStaticLists) && (
                  <View
                    style={[
                      styles.readingListContainer,
                      {
                        backgroundColor: theme.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.readingListLabel,
                        {
                          color: theme.onSurface,
                        },
                      ]}
                    >
                      {allTrackers[selectedTracker].capabilities.hasStaticLists
                        ? 'Status:'
                        : 'Reading List:'}
                    </Text>
                    <View style={styles.readingListSelector}>
                      <Button
                        mode="outlined"
                        onPress={() => {
                          setShowListModal(true);
                        }}
                        style={[
                          styles.readingListButton,
                          {
                            borderColor: theme.outline,
                          },
                        ]}
                        contentStyle={styles.readingListButtonContent}
                      >
                        {selectedReadingList?.name || 'Select...'}
                      </Button>
                      {selectedTracker &&
                        allTrackers[selectedTracker]?.capabilities
                          .hasDynamicLists && (
                          <IconButton
                            icon="refresh"
                            size={20}
                            onPress={refreshReadingLists}
                            disabled={refreshingLists}
                            style={styles.refreshButton}
                          />
                        )}
                    </View>
                  </View>
                )}
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={theme.primary} size="large" />
                <Text
                  style={[
                    styles.loadingText,
                    {
                      color: theme.onSurface,
                    },
                  ]}
                >
                  {getString('trackingDialog.searchingFor', {
                    query: selectedTracker,
                  })}
                </Text>
              </View>
            ) : (
              <BottomSheetFlatList
                data={searchResults}
                renderItem={renderSearchItem}
                keyExtractor={(item, index) => `${String(item.id)}-${index}`}
                contentContainerStyle={{
                  backgroundColor: theme.surface2,
                }}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  loadingMore ? (
                    <View style={styles.loadingMoreContainer}>
                      <ActivityIndicator color={theme.primary} size="small" />
                      <Text
                        style={[
                          styles.loadingMoreText,
                          {
                            color: theme.onSurfaceVariant,
                          },
                        ]}
                      >
                        {getString('trackingDialog.loadingMore')}
                      </Text>
                    </View>
                  ) : null
                }
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text
                      style={[
                        styles.emptyText,
                        {
                          color: theme.onSurfaceVariant,
                        },
                      ]}
                    >
                      {searchText
                        ? getString('trackingDialog.noResults')
                        : getString('common.searchFor')}
                    </Text>
                  </View>
                }
              />
            )}
          </>
        ) : (
          <>
            <View
              style={[
                styles.appbarHeader,
                {
                  backgroundColor: theme.surface2,
                },
              ]}
            >
              <Text
                style={[
                  styles.appbarTitle,
                  {
                    color: theme.onSurface,
                  },
                ]}
              >
                {getString('trackingDialog.trackNovel')}
              </Text>
              {tracks.length > 0 && (
                <IconButton
                  icon={isUpdating ? 'loading' : 'update'}
                  onPress={isUpdating ? undefined : handleUpdateAll}
                  iconColor={
                    isUpdating ? theme.onSurfaceVariant : theme.primary
                  }
                  disabled={isUpdating}
                />
              )}
            </View>

            <BottomSheetFlatList
              data={Object.keys(allTrackers)}
              renderItem={renderTrackerItem}
              keyExtractor={item => item}
              contentContainerStyle={{
                backgroundColor: theme.surface2,
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text
                    style={[
                      styles.emptyText,
                      {
                        color: theme.onSurfaceVariant,
                      },
                    ]}
                  >
                    {getString('trackingDialog.noTrackersAvailable')}
                  </Text>
                </View>
              }
            />
          </>
        )}
      </BottomSheetModal>

      {selectedTrack && (
        <SetTrackChaptersDialog
          track={selectedTrack}
          visible={chaptersDialog}
          onDismiss={hideChaptersDialog}
          onSubmit={handleUpdate}
          theme={theme}
        />
      )}

      <UpdateAllTrackersDialog
        visible={updateAllDialogVisible}
        onDismiss={() => setUpdateAllDialogVisible(false)}
        onConfirm={handleUpdateAllConfirm}
        tracks={tracks}
        appProgress={getHighestReadChapter()}
      />

      {/* Title Picker Modal */}
      <Modal
        visible={titlePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTitlePickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.surface,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                {
                  color: theme.onSurface,
                },
              ]}
            >
              Select Title to Search
            </Text>
            <FlatList
              data={availableTitles}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    {
                      backgroundColor:
                        searchText === item
                          ? theme.primaryContainer
                          : theme.surface,
                      borderBottomColor: theme.outline,
                    },
                  ]}
                  onPress={() => handleTitleSelect(item)}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      {
                        color:
                          searchText === item
                            ? theme.onPrimaryContainer
                            : theme.onSurface,
                      },
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
              keyExtractor={(item, index) => `title-${index}`}
            />
            <TouchableOpacity
              style={[
                styles.modalCancelButton,
                {
                  backgroundColor: theme.primary,
                },
              ]}
              onPress={() => setTitlePickerVisible(false)}
            >
              <Text
                style={[
                  styles.modalCancelText,
                  {
                    color: theme.onPrimary,
                  },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {}
      <Modal
        visible={showListModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowListModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.surface,
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                {
                  color: theme.onSurface,
                },
              ]}
            >
              {selectedTracker &&
              allTrackers[selectedTracker]?.capabilities.hasStaticLists
                ? 'Select Status'
                : 'Select Reading List'}
            </Text>
            <FlatList
              data={availableLists}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    {
                      borderBottomColor: theme.outline,
                    },
                  ]}
                  onPress={() => {
                    setSelectedReadingList(item);
                    setShowListModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      {
                        color: theme.onSurface,
                      },
                    ]}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={[
                styles.modalCancelButton,
                {
                  backgroundColor: theme.primary,
                },
              ]}
              onPress={() => setShowListModal(false)}
            >
              <Text
                style={[
                  styles.modalCancelText,
                  {
                    color: theme.onPrimary,
                  },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};
const styles = StyleSheet.create({
  appbarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 4,
    elevation: 0,
  },
  appbarTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '500',
    marginLeft: 8,
  },
  searchContainer: {
    padding: 16,
  },
  readingListContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  readingListLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  readingListSelector: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  readingListButton: {
    flex: 1,
    marginRight: 8,
  },
  readingListButtonContent: {
    height: 40,
  },
  refreshButton: {
    margin: 0,
  },
  readingListMenu: {
    maxHeight: 200,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loadingMoreText: {
    marginLeft: 8,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  coverImage: {
    width: 48,
    height: 72,
    borderRadius: 4,
    margin: 8,
  },
  trackActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '80%',
    maxHeight: '70%',
    borderRadius: 8,
    padding: 16,
    elevation: 0,
  },
  modalContent: {
    width: '80%',
    maxHeight: '70%',
    borderRadius: 8,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalList: {
    maxHeight: 300,
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderRadius: 4,
    marginVertical: 1,
  },
  modalItemText: {
    fontSize: 16,
  },
  modalCancelButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  surfaceNoElevation: {
    elevation: 0,
  },
  titlePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  titlePickerText: {
    fontSize: 14,
    flex: 1,
  },
});
export default TrackSheet;
