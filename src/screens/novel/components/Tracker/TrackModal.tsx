import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deleteTrack,
  insertTrack,
  updateTrack,
  updateTrackProgress,
} from '@database/queries/TrackQueries';
import {
  getAlternativeTitles,
  addAlternativeTitle,
} from '@database/queries/NovelQueries';
import { Button, List, Portal, IconButton, Modal } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import {
  searchTracker,
  updateUserListEntry,
  trackers as allTrackers,
  TRACKER_SOURCES,
  getTrackerEntryUrl,
} from '@services/Trackers';
import { TrackStatus } from '@database/types/Track';
import { showToast } from '@utils/showToast';
import { getTotalReadChaptersCount } from '@database/queries/ChapterQueries';
import { getString } from '@strings/translations';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import SearchbarV2 from '@components/SearchbarV2/SearchbarV2';
import SetTrackChaptersDialog from './SetTrackChaptersDialog';
import UpdateAllTrackersDialog from './UpdateAllTrackersDialog';
import { useBoolean } from '@hooks';
import { useTracker, useTrackedNovel } from '@hooks/persisted';

type TrackModalProps = {
  bottomSheetRef: React.RefObject<any>;
  novel: any;
  theme: any;
};

const TrackModal: React.FC<TrackModalProps> = ({
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
  const [linking, setLinking] = useState(false);
  const linkingCancelledRef = React.useRef(false);
  const [visible, setVisible] = useState(false);
  const [unlinkDialogVisible, setUnlinkDialogVisible] = useState(false);
  const [trackPendingUnlink, setTrackPendingUnlink] = useState<any | null>(
    null,
  );
  const navigation = useNavigation();
  const [dialogAvailableLists, setDialogAvailableLists] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [expandedSearchItem, setExpandedSearchItem] = useState<any | null>(
    null,
  );
  const [dialogSelectedListId, setDialogSelectedListId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!bottomSheetRef) return;
    (bottomSheetRef as any).current = {
      present: () => setVisible(true),
      close: () => setVisible(false),
      dismiss: () => setVisible(false),
    };
    return () => {
      if (bottomSheetRef) {
        (bottomSheetRef as any).current = null;
      }
    };
  }, [bottomSheetRef]);

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
    tracker => {
      try {
        const cached = MMKVStorage.getString(getReadingListsCacheKey(tracker));
        if (cached) {
          const lists = JSON.parse(cached);
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

  const renderSearchItemIcon = useCallback(item => {
    return item.coverImage ? (
      <Image
        source={{
          uri: item.coverImage,
        }}
        style={styles.coverImage}
      />
    ) : (
      <List.Icon icon="book" />
    );
  }, []);
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
        if (lists.length > 0 && !selectedReadingList) {
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

    setSelectedReadingList(null);

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
          setExpandedSearchItem(null);
          const tracker = allTrackers[selectedTracker];
          if (tracker && tracker.capabilities.supportsPagination) {
            setHasMore(results.length > 0);
          } else {
            setHasMore(false);
          }
        } else {
          // De-duplicate when loading more pages
          setSearchResults(prev => {
            const existingIds = new Set(prev.map(item => item.id));
            const newResults = results.filter(
              item => !existingIds.has(item.id),
            );
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

  const loadAlternativeTitles = useCallback(async () => {
    try {
      if (novel.id !== 'NO_ID' && typeof novel.id === 'number') {
        const altTitles = await getAlternativeTitles(novel.id);
        const allTitles = [novel.name, ...altTitles].filter(Boolean);
        setAvailableTitles(allTitles);
      } else {
        setAvailableTitles([novel.name]);
      }
    } catch (error) {
      setAvailableTitles([novel.name]);
    }
  }, [novel.id, novel.name]);

  useEffect(() => {
    loadAlternativeTitles();
  }, [loadAlternativeTitles]);

  useEffect(() => {
    if (visible) {
      loadAlternativeTitles();
      try {
        loadTracks();
      } catch {}
    }
  }, [visible, loadAlternativeTitles, loadTracks]);

  useEffect(() => {
    if (searchActive) {
      loadAlternativeTitles();
    }
  }, [searchActive, loadAlternativeTitles]);

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
          let nextMetadata: any = {};
          try {
            if (track.metadata) nextMetadata = JSON.parse(track.metadata);
          } catch {}
          if (
            (updateResult as any)?.listId ||
            (updateResult as any)?.listName
          ) {
            nextMetadata = {
              ...nextMetadata,
              ...((updateResult as any).listId
                ? { listId: (updateResult as any).listId }
                : {}),
              ...((updateResult as any).listName
                ? { listName: (updateResult as any).listName }
                : {}),
            };
          }
          await updateTrack(track.id, {
            lastChapterRead: targetProgress,
            lastSyncAt: new Date().toISOString(),
            metadata: Object.keys(nextMetadata).length
              ? JSON.stringify(nextMetadata)
              : track.metadata,
          });

          successCount++;
        } catch (error) {
          errorCount++;
        }
      }
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
      linkingCancelledRef.current = false;
      setLinking(true);

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
    } finally {
      linkingCancelledRef.current = false;
      setLinking(false);
    }
  };
  const addToReadingListAndTrack = async (item, readingList) => {
    try {
      if (linkingCancelledRef.current) return;
      const auth = getTrackerAuth(selectedTracker);
      const tracker = allTrackers[selectedTracker];
      if (tracker.addToReadingList && auth) {
        await tracker.addToReadingList(item.id, readingList.id, auth);
      }
      if (linkingCancelledRef.current) return;
      await createTrackRecord(item);
    } catch (error) {
      showToast(error.message || getString('trackingDialog.failedToAddToList'));
    }
  };
  const createTrackRecord = async item => {
    if (linkingCancelledRef.current) return;
    if (typeof novel.id === 'string') {
      throw new Error('Cannot track novel without valid ID');
    }
    if (item.alternativeTitles && item.alternativeTitles.length > 0) {
      for (const title of item.alternativeTitles) {
        try {
          await addAlternativeTitle(novel.id, title);
        } catch (e) {}
      }
    }
    const appProgress = getHighestReadChapter();
    let trackerProgress = 0;
    try {
      const auth = getTrackerAuth(selectedTracker);
      const tracker = allTrackers[selectedTracker];
      if (auth && tracker && tracker.getUserListEntry) {
        const entry = await tracker.getUserListEntry(
          String(item.id),
          auth,
          novel,
        );
        if (entry && typeof entry.progress === 'number') {
          trackerProgress = entry.progress;
        }
      }
    } catch (e) {}

    const initialProgress = Math.max(appProgress || 0, trackerProgress || 0);
    if (linkingCancelledRef.current) {
      return;
    }

    const selectedListMeta = selectedReadingList
      ? {
          listId: selectedReadingList.id,
          listName: selectedReadingList.name,
        }
      : undefined;

    const trackData = {
      novelId: novel.id,
      source: selectedTracker,
      sourceId: String(item.id),
      title: item.title,
      lastChapterRead: initialProgress,
      totalChapters: item.totalChapters,
      status: TrackStatus.Reading,
      metadata: JSON.stringify({
        ...(selectedTracker === TRACKER_SOURCES.NOVEL_UPDATES
          ? {
              novelId: item.__trackerMeta?.nuNovelId,
              slug: item.__trackerMeta?.nuSlug,
            }
          : {}),
        ...(selectedTracker === TRACKER_SOURCES.NOVELLIST
          ? { slug: item.__trackerMeta?.novellistSlug }
          : {}),
        ...(selectedListMeta || {}),
      }),
    };

    await insertTrack(trackData);
    if (linkingCancelledRef.current) {
      try {
        await deleteTrack({
          novelId: novel.id,
          source: selectedTracker,
        });
      } catch (cleanupError) {}
      return;
    }

    if (initialProgress > trackerProgress) {
      try {
        const auth = getTrackerAuth(selectedTracker);
        if (auth) {
          const trackerImpl = allTrackers[selectedTracker];
          const statusPayload =
            trackerImpl?.capabilities?.hasStaticLists &&
            !trackerImpl?.addToReadingList &&
            selectedReadingList?.id
              ? { status: selectedReadingList.id as any }
              : {};
          await updateUserListEntry(
            selectedTracker,
            String(item.id),
            { progress: initialProgress, ...statusPayload },
            auth,
          );
        }
      } catch (e) {}
    } else if (selectedReadingList) {
      try {
        const auth = getTrackerAuth(selectedTracker);
        if (auth) {
          const trackerImpl = allTrackers[selectedTracker];
          if (
            trackerImpl?.capabilities?.hasStaticLists &&
            !trackerImpl?.addToReadingList &&
            selectedReadingList?.id
          ) {
            await updateUserListEntry(
              selectedTracker,
              String(item.id),
              { status: selectedReadingList.id },
              auth,
            );
          }
        }
      } catch (e) {}
    }

    try {
      const auth = getTrackerAuth(selectedTracker);
      const tracker = allTrackers[selectedTracker];
      if (auth && tracker && tracker.getUserListEntry) {
        const refreshed = await tracker.getUserListEntry(String(item.id), auth);
        const p =
          typeof refreshed?.progress === 'number'
            ? refreshed.progress
            : initialProgress;
        if (typeof p === 'number' && p >= 0) {
          await updateTrackProgress(novel.id, selectedTracker, p);
        }
      }
    } catch (e) {}

    await loadTracks();
    setSearchActive(false);
    setSearchResults([]);
    showToast(
      `Linked to ${selectedTracker}${
        initialProgress ? ` (progress ${initialProgress})` : ''
      }`,
    );
  };
  const handleUnlink = useCallback(
    async track => {
      try {
        await deleteTrack(track.id);
        await loadTracks();
        showToast(`Unlinked from ${track.source}: ${track.title}`);
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
      const tracker = allTrackers[track.source];

      try {
        if (
          dialogSelectedListId &&
          tracker?.addToReadingList &&
          typeof tracker.addToReadingList === 'function'
        ) {
          await tracker.addToReadingList(
            track.sourceId,
            dialogSelectedListId,
            auth,
          );
        }
      } catch (e) {}

      const statusPayload =
        !tracker?.addToReadingList &&
        tracker?.capabilities?.hasStaticLists &&
        dialogSelectedListId
          ? { status: dialogSelectedListId as any }
          : {};

      const updateResult = await updateUserListEntry(
        track.source,
        track.sourceId,
        { progress: newChapter, ...statusPayload },
        auth,
      );

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

      let nextMetadata = {} as any;
      try {
        if (track.metadata) nextMetadata = JSON.parse(track.metadata);
      } catch {}
      if ((updateResult as any)?.listId || (updateResult as any)?.listName) {
        nextMetadata = {
          ...nextMetadata,
          ...((updateResult as any).listId
            ? { listId: (updateResult as any).listId }
            : {}),
          ...((updateResult as any).listName
            ? { listName: (updateResult as any).listName }
            : {}),
        };
      } else if (dialogSelectedListId && dialogAvailableLists.length > 0) {
        const name = dialogAvailableLists.find(
          l => l.id === dialogSelectedListId,
        )?.name;
        nextMetadata = {
          ...nextMetadata,
          listId: dialogSelectedListId,
          ...(name ? { listName: name } : {}),
        };
      }

      await updateTrack(track.id, {
        lastChapterRead: newChapter,
        metadata: Object.keys(nextMetadata).length
          ? JSON.stringify(nextMetadata)
          : track.metadata,
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
          (async () => {
            try {
              const tracker = allTrackers[updatedTrack.source];
              const auth = getTrackerAuth(updatedTrack.source);
              if (tracker?.getAvailableReadingLists && auth) {
                const lists = await tracker.getAvailableReadingLists(
                  updatedTrack.sourceId,
                  auth,
                );
                setDialogAvailableLists(lists);
                let initialListId: string | null = null;
                try {
                  if (updatedTrack.metadata) {
                    const md = JSON.parse(updatedTrack.metadata);
                    if (typeof md.listId === 'string') {
                      initialListId = md.listId;
                    }
                  }
                } catch {}
                setDialogSelectedListId(
                  initialListId || (lists[0]?.id ?? null),
                );
              } else {
                setDialogAvailableLists([]);
                setDialogSelectedListId(null);
              }
            } catch {
              setDialogAvailableLists([]);
              setDialogSelectedListId(null);
            } finally {
              showChaptersDialog();
            }
          })();
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
    (track: any) => (
      <View style={styles.trackActions}>
        <IconButton
          icon="link-off"
          size={20}
          onPress={() => {
            setTrackPendingUnlink(track);
            setUnlinkDialogVisible(true);
          }}
          accessibilityLabel="Unlink tracker"
        />
        <IconButton
          icon="earth"
          size={20}
          onPress={() => {
            const url = getTrackerEntryUrl(track.source, track, novel);
            if (url) {
              navigation.navigate(
                'WebviewScreen' as never,
                {
                  name: track.title,
                  url,
                  pluginId: track.source,
                  isNovel: true,
                } as never,
              );
            } else {
              showToast('Could not open tracker page');
            }
          }}
          style={styles.actionIconSpacing}
          accessibilityLabel="Open tracker page"
        />
      </View>
    ),
    [navigation, novel],
  );

  const renderLinkButton = useCallback(
    item => (
      <IconButton
        icon="link"
        size={20}
        onPress={() => handleTrackerPress(item)}
        accessibilityLabel={getString('trackingDialog.link')}
        iconColor={theme.primary}
      />
    ),
    [theme.primary, handleTrackerPress],
  );

  const renderTrackerItem = ({ item }) => {
    const track = getTrackForSource(item);
    const isLoggedIn = getTrackerAuth(item);

    if (!isLoggedIn) {
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
      let listSuffix = '';
      try {
        if (track.metadata) {
          const md = JSON.parse(track.metadata);
          if (md.listName) {
            listSuffix = ` • ${md.listName}`;
          }
        }
      } catch {}
      return (
        <List.Item
          title={item}
          titleNumberOfLines={20}
          description={`${track.title} | ${track.lastChapterRead || 0}/${
            track.totalChapters || '?'
          }${listSuffix}`}
          descriptionNumberOfLines={20}
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
  const renderSearchItem = ({ item }) => {
    const isExpanded = expandedSearchItem === item;
    let description = '';
    if (item.totalChapters) {
      description += `${item.totalChapters} chapters`;
    }

    if (item.description) {
      if (description) description += ' • ';
      description += item.description;
    }

    if (isExpanded && item.genres?.length > 0) {
      if (description) description += '\n\n';
      description += `Genres: ${item.genres.join(', ')}`;
    }

    const handleWebViewPress = () => {
      let url = item.url;
      if (!url && selectedTracker) {
        const trackerImpl = allTrackers[selectedTracker];
        if (trackerImpl && typeof trackerImpl.getEntryUrl === 'function') {
          const trackData = {
            sourceId: item.id,
            metadata: item.__trackerMeta
              ? JSON.stringify(item.__trackerMeta)
              : undefined,
          };
          url = trackerImpl.getEntryUrl(trackData);
        }
      }

      if (url) {
        navigation.navigate(
          'WebviewScreen' as never,
          {
            url: url,
            name: item.title,
          } as never,
        );
      }
    };

    return (
      <TouchableOpacity
        style={[styles.searchResultItem, { borderBottomColor: theme.outline }]}
        onPress={() => handleLink(item)}
        onLongPress={() => {
          if (isExpanded) {
            setExpandedSearchItem(null);
          } else {
            setExpandedSearchItem(item);
          }
        }}
      >
        <View style={styles.searchResultContent}>
          {/* Left icon */}
          <View style={styles.searchResultIcon}>
            {renderSearchItemIcon(item)}
          </View>

          {/* Content */}
          <View style={styles.searchResultText}>
            {/* Title */}
            <Text
              style={[styles.searchResultTitle, { color: theme.onSurface }]}
              numberOfLines={2}
            >
              {item.title}
            </Text>

            {/* Web icon row - only show when expanded */}
            {isExpanded &&
              (() => {
                const trackerImpl = selectedTracker
                  ? allTrackers[selectedTracker]
                  : null;
                const hasUrl =
                  item.url ||
                  (trackerImpl &&
                    typeof trackerImpl.getEntryUrl === 'function');
                return hasUrl;
              })() && (
                <TouchableOpacity
                  style={styles.webIconRow}
                  onPress={handleWebViewPress}
                >
                  <IconButton
                    icon="web"
                    iconColor={theme.primary}
                    size={20}
                    style={styles.webIcon}
                  />
                  <Text style={[styles.webText, { color: theme.primary }]}>
                    View on web
                  </Text>
                </TouchableOpacity>
              )}

            {/* Description */}
            <Text
              style={[
                styles.searchResultDescription,
                { color: theme.onSurfaceVariant },
              ]}
              numberOfLines={isExpanded ? undefined : 3}
            >
              {description}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };
  const { top: topInset } = useSafeAreaInsets();

  const onDismiss = () => setVisible(false);

  const confirmUnlink = async () => {
    if (trackPendingUnlink) {
      try {
        await handleUnlink(trackPendingUnlink);
      } finally {
        setTrackPendingUnlink(null);
        setUnlinkDialogVisible(false);
      }
    } else {
      setUnlinkDialogVisible(false);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          searchActive
            ? styles.modalContainerLinking
            : styles.modalContainerTracker,
          { backgroundColor: theme.surface2, paddingTop: topInset },
        ]}
      >
        <View style={styles.modalContent}>
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
                    setExpandedSearchItem(null);
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
                <IconButton
                  icon="close"
                  onPress={onDismiss}
                  iconColor={theme.onSurface}
                />
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
                  placeholder={`${getString(
                    'common.search',
                  )} ${selectedTracker}...`}
                  leftIcon="magnify"
                  clearSearchbar={() => setSearchText('')}
                  rightIcons={[
                    {
                      iconName: 'magnify',
                      onPress: () => handleSearch(1, true),
                    },
                  ]}
                />

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

                {selectedTracker &&
                  allTrackers[selectedTracker] &&
                  (allTrackers[selectedTracker].capabilities.hasDynamicLists ||
                    allTrackers[selectedTracker].capabilities
                      .hasStaticLists) && (
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
                          { color: theme.onSurface },
                        ]}
                      >
                        {allTrackers[selectedTracker].capabilities
                          .hasStaticLists
                          ? `${getString('common.status')}:`
                          : `${getString('common.readingList')}:`}
                      </Text>
                      <View style={styles.readingListSelector}>
                        <Text
                          onPress={() => setShowListModal(true)}
                          style={[
                            styles.readingListLink,
                            { color: theme.primary },
                          ]}
                        >
                          {selectedReadingList?.name ||
                            getString('common.select') ||
                            'Select...'}
                        </Text>
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
                      query: searchText,
                    })}
                  </Text>
                </View>
              ) : (
                <FlatList
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
                <IconButton
                  icon="close"
                  onPress={onDismiss}
                  iconColor={theme.onSurface}
                />
              </View>

              <FlatList
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
        </View>
      </Modal>
      <SetTrackChaptersDialog
        track={selectedTrack}
        visible={chaptersDialog}
        hideDialog={hideChaptersDialog}
        onSubmit={handleUpdate}
        theme={theme}
        trackerName={selectedTrack?.source}
        allowListChange={true}
        availableLists={dialogAvailableLists}
        selectedListId={dialogSelectedListId}
        onChangeList={setDialogSelectedListId}
      />
      <UpdateAllTrackersDialog
        tracks={tracks}
        visible={updateAllDialogVisible}
        onDismiss={() => {
          setUpdateAllDialogVisible(false);
          loadTracks();
        }}
        onConfirm={handleUpdateAllConfirm}
        appProgress={getHighestReadChapter()}
        theme={theme}
      />
      {/* Title Picker Modal */}
      <Modal
        visible={titlePickerVisible}
        onDismiss={() => setTitlePickerVisible(false)}
        contentContainerStyle={[
          styles.pickerModalContainer,
          { backgroundColor: theme.surface },
        ]}
      >
        <View style={styles.pickerModalContent}>
          <Text style={[styles.pickerTitle, { color: theme.onSurface }]}>
            Select an alternative title
          </Text>

          <FlatList
            data={availableTitles}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.titleOption}
                onPress={() => handleTitleSelect(item)}
              >
                <Text
                  style={[styles.pickerItemText, { color: theme.onSurface }]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            )}
            keyExtractor={(item, index) => `${item}-${index}`}
          />

          <TouchableOpacity
            style={[
              styles.modalCancelButton,
              { backgroundColor: theme.primary },
            ]}
            onPress={() => setTitlePickerVisible(false)}
          >
            <Text style={[styles.modalCancelText, { color: theme.onPrimary }]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
      <Modal
        visible={showListModal}
        onDismiss={() => setShowListModal(false)}
        contentContainerStyle={[
          styles.pickerModalContainer,
          { backgroundColor: theme.surface },
        ]}
      >
        <View style={styles.pickerModalContent}>
          <Text style={[styles.pickerTitle, { color: theme.onSurface }]}>
            Select a reading list
          </Text>

          <FlatList
            data={availableLists}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.listOption}
                onPress={() => {
                  setSelectedReadingList(item);
                  setShowListModal(false);
                }}
              >
                <Text
                  style={[styles.pickerItemText, { color: theme.onSurface }]}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            )}
            keyExtractor={(item, index) => `${item.id}-${index}`}
          />

          <TouchableOpacity
            style={[
              styles.modalCancelButton,
              { backgroundColor: theme.primary },
            ]}
            onPress={() => setShowListModal(false)}
          >
            <Text style={[styles.modalCancelText, { color: theme.onPrimary }]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Linking progress overlay */}
      <Modal
        visible={linking}
        onDismiss={() => {
          linkingCancelledRef.current = true;
          setLinking(false);
        }}
        contentContainerStyle={[
          styles.linkingModalContainer,
          { backgroundColor: theme.surface },
        ]}
      >
        <ActivityIndicator color={theme.primary} size="large" />
        <Text style={[styles.loadingText, { color: theme.onSurface }]}>
          Linking...
        </Text>
        <TouchableOpacity
          style={[styles.modalCancelButton, { backgroundColor: theme.primary }]}
          onPress={() => {
            linkingCancelledRef.current = true;
            setLinking(false);
          }}
        >
          <Text style={[styles.modalCancelText, { color: theme.onPrimary }]}>
            Cancel
          </Text>
        </TouchableOpacity>
      </Modal>

      {/* Unlink confirmation */}
      <Modal
        visible={unlinkDialogVisible}
        onDismiss={() => setUnlinkDialogVisible(false)}
        contentContainerStyle={[
          styles.pickerModalContainer,
          { backgroundColor: theme.surface },
        ]}
      >
        <View style={styles.pickerModalContent}>
          <Text style={[styles.pickerTitle, { color: theme.onSurface }]}>
            {getString('common.areYouSure')}
          </Text>
          <Text
            style={[styles.pickerItemText, { color: theme.onSurfaceVariant }]}
          >
            {getString('trackingDialog.unlink')} {trackPendingUnlink?.source}:{' '}
            {trackPendingUnlink?.title}?
          </Text>
          <View style={styles.rowEndWithGap}>
            <Button mode="text" onPress={() => setUnlinkDialogVisible(false)}>
              {getString('common.cancel')}
            </Button>
            <Button
              mode="contained"
              onPress={confirmUnlink}
              buttonColor={theme.error}
              textColor={theme.onError}
            >
              {getString('common.confirm')}
            </Button>
          </View>
        </View>
      </Modal>

      {/* End of Portal content */}
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalContainerLinking: {
    flex: 1,
    marginVertical: '5%',
    marginHorizontal: 20,
    borderRadius: 32,
    maxHeight: '90%',
  },
  modalContainerTracker: {
    flex: 1,
    marginVertical: '5%',
    marginHorizontal: 20,
    borderRadius: 32,
    maxHeight: '60%',
  },
  modalContent: {
    flex: 1,
  },
  appbarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 2,
    elevation: 0,
  },
  appbarTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    marginLeft: 4,
  },
  searchContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  readingListContainer: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  readingListLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
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
    height: 36,
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
    padding: 16,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  loadingMoreText: {
    marginLeft: 8,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
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
  actionIconSpacing: {
    marginLeft: 8,
  },
  modalCancelButton: {
    marginTop: 8,
    paddingVertical: 8,
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
    padding: 8,
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 8,
  },
  titlePickerText: {
    fontSize: 14,
    flex: 1,
  },
  pickerModalContainer: {
    margin: 20,
    borderRadius: 8,
  },
  pickerModalContent: {
    padding: 12,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerItemText: {
    fontSize: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  titleOption: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  listOption: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  linkingModalContainer: {
    margin: 20,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webviewModalContainer: {
    margin: 20,
    borderRadius: 8,
    padding: 12,
  },
  webviewContainer: {
    height: 500,
  },
  fullscreenWebview: {
    margin: 0,
    borderRadius: 0,
    padding: 0,
    flex: 1,
  },
  fullscreenWebviewInner: {
    height: '90%',
  },
  rowEndWithGap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
  },
  rowEndPaddingTop: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 8,
  },
  readingListLink: {
    marginTop: 4,
    textDecorationLine: 'underline',
    fontSize: 16,
  },
  searchResultItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  searchResultContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  searchResultIcon: {
    marginRight: 12,
  },
  searchResultText: {
    flex: 1,
  },
  searchResultTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  searchResultDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  webIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 2,
  },
  webIcon: {
    margin: 0,
    marginRight: 4,
  },
  webText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export default memo(TrackModal);
