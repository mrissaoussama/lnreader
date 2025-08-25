import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteTrack } from '@database/queries/TrackQueries';
import {
  getAlternativeTitles,
  addAlternativeTitle,
} from '@database/queries/NovelQueries';
import { Portal, Modal } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import {
  searchTracker,
  trackers as allTrackers,
  TRACKER_SOURCES,
  SearchResult,
  getTrackerEntryUrl,
} from '@services/Trackers';
import { showToast } from '@utils/showToast';
import { getTotalReadChaptersCount } from '@database/queries/ChapterQueries';
import { getString } from '@strings/translations';
import { useBoolean } from '@hooks';
import { useTracker, useTrackedNovel } from '@hooks/persisted';
import {
  loadReadingListsCache,
  saveReadingListsCache,
} from '@services/Trackers/common/utils';
import { useReadingLists } from './hooks/useReadingLists';
import { handleLinkFlow } from '@services/Trackers/actions/link';
import { updateTrackProgressExtended } from '@services/Trackers/actions/progress';
import { bulkUpdateTrackProgress } from '@services/Trackers/actions/bulk';
import { trackModalStyles as styles } from './TrackModal.styles';
import { TrackerListSection } from './TrackerListSection';
import { SearchSection } from './SearchSection';
import { TrackDialogs } from './TrackDialogs';

const TRACKER_ORDER = [
  TRACKER_SOURCES.ANILIST,
  TRACKER_SOURCES.MYANIMELIST,
  TRACKER_SOURCES.NOVEL_UPDATES,
  TRACKER_SOURCES.NOVELLIST,
  TRACKER_SOURCES.MANGAUPDATES,
];

interface TrackModalProps {
  bottomSheetRef: React.RefObject<any>;
  novel: any;
  theme: any;
}

const TrackModal: React.FC<TrackModalProps> = ({
  bottomSheetRef,
  novel,
  theme,
}) => {
  const [searchText, setSearchText] = useState(novel.name);
  const [selectedTracker, setSelectedTracker] = useState<string | undefined>();
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSearchItem, setExpandedSearchItem] = useState<any | null>(
    null,
  );
  const [selectedTrack, setSelectedTrack] = useState<any | null>(null);
  const [availableTitles, setAvailableTitles] = useState<string[]>([]);
  const [titlePickerVisible, setTitlePickerVisible] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [updateAllDialogVisible, setUpdateAllDialogVisible] = useState(false);
  const [dialogAvailableLists, setDialogAvailableLists] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [dialogSelectedListId, setDialogSelectedListId] = useState<
    string | null
  >(null);
  const [linking, setLinking] = useState(false);
  const linkingCancelledRef = useRef(false);
  const [unlinkDialogVisible, setUnlinkDialogVisible] = useState(false);
  const [trackPendingUnlink, setTrackPendingUnlink] = useState<any | null>(
    null,
  );
  const [visible, setVisible] = useState(false);

  const navigation = useNavigation();
  const {
    setTrue: showChaptersDialog,
    setFalse: hideChaptersDialog,
    value: chaptersDialog,
  } = useBoolean();
  const { tracks, loadTracks, getTrackForSource } = useTrackedNovel(novel.id);
  const { getTrackerAuth } = useTracker();
  const trackerAuth = selectedTracker
    ? getTrackerAuth(selectedTracker)
    : undefined;
  const {
    lists: linkingLists,
    selected: selectedReadingList,
    refreshing: refreshingLists,
    refresh: refreshReadingLists,
    setTracker: setListTracker,
    setSelected: setSelectedReadingList,
  } = useReadingLists({
    trackerId: selectedTracker,
    auth: trackerAuth,
    autoSelectFirst: true,
  });

  const trackMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const t of tracks) {
      if (t?.source) {
        map[t.source] = t;
      }
    }
    return map;
  }, [tracks]);

  const loadAlternativeTitles = useCallback(async () => {
    try {
      if (novel.id === 'NO_ID' || typeof novel.id !== 'number') {
        return;
      }
      const titles = await getAlternativeTitles(novel.id);
      const unique = Array.from(
        new Set([novel.name, ...(titles || [])].filter(Boolean)),
      );
      setAvailableTitles(unique);
    } catch {}
  }, [novel.id, novel.name]);

  const handleSearch = useCallback(
    async (page = 1, isNew = false) => {
      if (!selectedTracker) {
        return;
      }
      if (isNew) {
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
        if (isNew) {
          setSearchResults(results);
          setCurrentPage(1);
          setExpandedSearchItem(null);
          const tracker = allTrackers[selectedTracker];
          setHasMore(
            !!tracker?.capabilities.supportsPagination && results.length > 0,
          );
        } else {
          setSearchResults(prev => {
            const existing = new Set(prev.map(r => r.id));
            const filtered = (results as any[]).filter(
              r => !existing.has(r.id),
            );
            if (!filtered.length) {
              setHasMore(false);
            }
            return [...prev, ...filtered];
          });
          if (!results.length) {
            setHasMore(false);
          }
        }
        setCurrentPage(page);
      } catch (e) {
        showToast((e as any)?.message);
        if (isNew) {
          setSearchResults([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [selectedTracker, searchText, getTrackerAuth],
  );

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) {
      return;
    }
    handleSearch(currentPage + 1, false);
  }, [hasMore, loadingMore, loading, handleSearch, currentPage]);

  useEffect(() => {
    loadAlternativeTitles();
  }, [loadAlternativeTitles]);

  useEffect(() => {
    setListTracker(selectedTracker);
    setDialogSelectedListId(null);
  }, [selectedTracker, setListTracker]);

  useEffect(() => {
    if (
      searchActive &&
      selectedTracker &&
      searchText === novel.name &&
      searchText.trim()
    ) {
      const timer = setTimeout(() => handleSearch(1, true), 300);
      return () => clearTimeout(timer);
    }
  }, [searchActive, selectedTracker, searchText, novel.name, handleSearch]);

  useEffect(() => {
    if (!bottomSheetRef) {
      return;
    }
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

  const getHighestReadChapter = useCallback(() => {
    try {
      return novel.id === 'NO_ID' || typeof novel.id === 'string'
        ? 0
        : getTotalReadChaptersCount(novel.id);
    } catch {
      return 0;
    }
  }, [novel.id]);

  const handleUpdateAllConfirm = useCallback(
    async (targetProgress: number) => {
      try {
        const toUpdate = tracks.filter(
          t => t.lastChapterRead !== targetProgress,
        );
        if (!toUpdate.length) {
          showToast('No trackers need updating');
          return;
        }
        showToast(`Updating ${toUpdate.length} trackers...`);
        const { success, failed } = await bulkUpdateTrackProgress({
          tracks: toUpdate,
          targetProgress,
          getTrackerAuth,
          novelId: novel.id,
          onAltTitle: async (title: string) => {
            if (novel.id !== 'NO_ID' && typeof novel.id === 'number') {
              try {
                await addAlternativeTitle(novel.id, title);
              } catch {}
            }
          },
        });
        await loadTracks();
        showToast(
          failed
            ? `Updated ${success} trackers, ${failed} failed`
            : `Successfully updated ${success} trackers`,
        );
      } catch (e) {
        showToast(
          (e as any)?.message ||
            (getString('trackingDialog.failedToUpdateTrackers' as any) as any),
        );
      }
    },
    [tracks, getTrackerAuth, novel.id, loadTracks],
  );

  const handleUpdate = useCallback(
    async (
      track: any,
      newChapter: number,
      forceUpdate = false,
      newVolume?: number,
    ) => {
      const res = await updateTrackProgressExtended({
        track,
        newChapter,
        newVolume,
        forceUpdate,
        dialogSelectedListId,
        availableLists: dialogAvailableLists,
        novelId: novel.id,
        getTrackerAuth,
        loadTracks,
        onAltTitle: async (title: string) => {
          if (novel.id !== 'NO_ID' && typeof novel.id === 'number') {
            try {
              await addAlternativeTitle(novel.id, title);
            } catch {}
          }
        },
      });
      if (res.updated) {
        showToast(`Updated progress on ${track.source}`);
      } else if (res.error) {
        showToast(res.error);
      }
    },
    [
      dialogSelectedListId,
      dialogAvailableLists,
      novel.id,
      getTrackerAuth,
      loadTracks,
    ],
  );

  const handleTitleSelect = useCallback(
    (title: string) => {
      setSearchText(title);
      setTitlePickerVisible(false);
      handleSearch(1, true);
    },
    [handleSearch],
  );

  const handleLink = useCallback(
    async (item: any) => {
      if (!selectedTracker) {
        return;
      }
      linkingCancelledRef.current = false;
      setLinking(true);
      try {
        await handleLinkFlow({
          novel,
          item,
          selectedTracker,
          selectedReadingList,
          getTrackerAuth,
          getHighestReadChapter,
          loadTracks,
          linkingCancelledRef,
        });
        if (!linkingCancelledRef.current) {
          showToast(`Linked with ${selectedTracker}`);
          await loadTracks();
          setSearchActive(false);
          setSelectedTracker(undefined);
          setSearchResults([]);
          setExpandedSearchItem(null);
        }
      } catch (e) {
        if (!(e as any)?.silent) {
          showToast((e as any)?.message);
        }
      } finally {
        setLinking(false);
      }
    },
    [
      selectedTracker,
      getTrackerAuth,
      selectedReadingList,
      novel,
      loadTracks,
      getHighestReadChapter,
    ],
  );

  const handleUpdateAll = useCallback(
    () => setUpdateAllDialogVisible(true),
    [],
  );

  const handleUnlink = useCallback(
    async (track: any) => {
      try {
        if (track?.id) {
          await deleteTrack(track.id);
          await loadTracks();
          showToast('Unlinked');
        }
      } catch (e) {
        showToast((e as any)?.message || 'Failed to unlink');
      }
    },
    [loadTracks],
  );

  const handleTrackerPress = useCallback(
    async (source: string) => {
      const trackerSource = source as any;
      const existing = trackMap[trackerSource];
      if (existing) {
        await loadTracks();
        const refreshed =
          trackMap[trackerSource] ||
          getTrackForSource(trackerSource) ||
          existing;
        if (!refreshed) {
          showToast('Track not found');
          return;
        }
        const updated = { ...refreshed };
        if (typeof updated.lastChapterRead === 'number') {
          setSelectedTrack(updated);
          (async () => {
            try {
              const impl = allTrackers[updated.source];
              const auth = getTrackerAuth(updated.source as any);
              if (impl?.getAvailableReadingLists && auth) {
                let lists = loadReadingListsCache(updated.source);
                if (!lists?.length) {
                  lists = await impl.getAvailableReadingLists(
                    updated.sourceId,
                    auth,
                  );
                  if (lists?.length) {
                    try {
                      saveReadingListsCache(updated.source, lists);
                    } catch {}
                  }
                }
                setDialogAvailableLists(lists || []);
                let initial: string | null = null;
                try {
                  if (updated.metadata) {
                    const md = JSON.parse(updated.metadata);
                    if (md.listId != null) {
                      initial = String(md.listId);
                    }
                  }
                } catch {}
                setDialogSelectedListId(initial || lists?.[0]?.id || null);
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
          showToast('Invalid track data');
        }
        return;
      }
      const auth = getTrackerAuth(trackerSource);
      if (!auth) {
        showToast(
          getString('trackingDialog.pleaseLoginTo' as any, {
            tracker: source,
          }) as any,
        );
        return;
      }
      setSelectedTrack(null);
      setDialogAvailableLists([]);
      setDialogSelectedListId(null);
      setSelectedTracker(source);
      setSearchText(novel.name);
      setSearchActive(true);
      setSelectedReadingList(null);
    },
    [
      trackMap,
      loadTracks,
      getTrackForSource,
      getTrackerAuth,
      showChaptersDialog,
      novel.name,
      setSelectedReadingList,
    ],
  );

  const confirmUnlink = useCallback(async () => {
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
  }, [trackPendingUnlink, handleUnlink]);

  const trackersCapabilities = useMemo(() => {
    const caps: Record<string, any> = {};
    for (const k of Object.keys(allTrackers)) {
      caps[k] = allTrackers[k].capabilities || {};
    }
    return caps;
  }, []);

  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  const onDismiss = () => setVisible(false);

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
            <SearchSection
              theme={theme}
              searchText={searchText}
              setSearchText={setSearchText}
              handleSearch={handleSearch}
              availableTitles={availableTitles}
              setTitlePickerVisible={setTitlePickerVisible}
              selectedTracker={selectedTracker}
              allTrackers={allTrackers}
              selectedReadingList={selectedReadingList}
              setShowListModal={setShowListModal}
              refreshReadingLists={refreshReadingLists}
              refreshingLists={refreshingLists}
              loading={loading}
              searchResults={searchResults}
              loadingMore={loadingMore}
              bottomInset={bottomInset}
              handleLoadMore={handleLoadMore}
              handleLink={handleLink}
              onBack={() => {
                setSearchActive(false);
                setSearchResults([]);
                setSelectedTracker(undefined);
                setExpandedSearchItem(null);
              }}
              expandedSearchItem={expandedSearchItem}
              setExpandedSearchItem={setExpandedSearchItem}
            />
          ) : (
            <TrackerListSection
              theme={theme}
              trackersOrder={TRACKER_ORDER}
              allTrackers={allTrackers}
              trackMap={trackMap}
              getTrackerAuth={getTrackerAuth}
              handleTrackerPress={handleTrackerPress}
              tracks={tracks}
              isUpdating={false}
              handleUpdateAll={handleUpdateAll}
              onDismiss={onDismiss}
              onUnlink={track => {
                setTrackPendingUnlink(track);
                setUnlinkDialogVisible(true);
              }}
              onOpenWeb={track => {
                const url = getTrackerEntryUrl(track.source, track, novel);
                if (url) {
                  (navigation as any).navigate('WebviewScreen', {
                    name: track.title,
                    url,
                    pluginId: track.source,
                    isNovel: true,
                  });
                } else {
                  showToast('Could not open tracker page');
                }
              }}
            />
          )}
        </View>
      </Modal>
      <TrackDialogs
        theme={theme}
        selectedTrack={selectedTrack}
        chaptersDialog={chaptersDialog}
        hideChaptersDialog={hideChaptersDialog}
        handleUpdate={handleUpdate}
        availableLists={dialogAvailableLists}
        dialogSelectedListId={dialogSelectedListId}
        setDialogSelectedListId={setDialogSelectedListId}
        setSelectedReadingList={setSelectedReadingList}
        refreshReadingLists={refreshReadingLists}
        refreshingLists={refreshingLists}
        tracks={tracks}
        updateAllDialogVisible={updateAllDialogVisible}
        setUpdateAllDialogVisible={setUpdateAllDialogVisible}
        handleUpdateAllConfirm={handleUpdateAllConfirm}
        appProgress={getHighestReadChapter()}
        loadTracks={loadTracks}
        titlePickerVisible={titlePickerVisible}
        setTitlePickerVisible={setTitlePickerVisible}
        availableTitles={availableTitles}
        handleTitleSelect={handleTitleSelect}
        showListModal={showListModal}
        setShowListModal={setShowListModal}
        linkingLists={linkingLists}
        selectedReadingList={selectedReadingList}
        linking={linking}
        setLinking={setLinking}
        linkingCancelledRef={linkingCancelledRef}
        unlinkDialogVisible={unlinkDialogVisible}
        setUnlinkDialogVisible={setUnlinkDialogVisible}
        trackPendingUnlink={trackPendingUnlink}
        confirmUnlink={confirmUnlink}
        trackersCapabilities={trackersCapabilities}
      />
    </Portal>
  );
};

export default memo(TrackModal);
