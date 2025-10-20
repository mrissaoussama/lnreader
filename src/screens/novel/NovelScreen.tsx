import React, {
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from 'react';
import { StyleSheet, View, StatusBar, Text, Share } from 'react-native';
import { Drawer } from 'react-native-drawer-layout';
import Animated, {
  SlideInUp,
  SlideOutUp,
  useSharedValue,
} from 'react-native-reanimated';

import { Portal, Appbar, Snackbar } from 'react-native-paper';
import { useDownload, useTheme, useBrowseSettings } from '@hooks/persisted';
import JumpToChapterModal from './components/JumpToChapterModal';
import { Actionbar } from '../../components/Actionbar/Actionbar';
import EditInfoModal from './components/EditInfoModal';
import { pickCustomNovelCover } from '../../database/queries/NovelQueries';
import DownloadCustomChapterModal from './components/DownloadCustomChapterModal';
import DeleteRangeModal from './components/DeleteRangeModal';
import { useBoolean } from '@hooks';
import NovelScreenLoading from './components/LoadingAnimation/NovelScreenLoading';
import { NovelScreenProps } from '@navigators/types';
import { ChapterInfo } from '@database/types';
import { getString } from '@strings/translations';
import NovelDrawer from './components/NovelDrawer';
import { isNumber, noop } from 'lodash-es';
import NovelAppbar from './components/NovelAppbar';
import { resolveUrl } from '@services/plugin/fetch';
import {
  updateChapterProgressByIds,
  getNovelChapters,
} from '@database/queries/ChapterQueries';
import { MaterialDesignIconName } from '@type/icon';
import NovelScreenList from './components/NovelScreenList';
import { ThemeColors } from '@theme/types';
import { SafeAreaView } from '@components';
import { useNovelContext } from './NovelContext';
import { FlashList } from '@shopify/flash-list';
import NotesModal from './components/NotesModal';
import AlternativeTitlesModal from './components/AlternativeTitlesModal';
import LibraryMatchesModal from './components/LibraryMatchesModal';
import { hasNote } from '@database/queries/NotesQueries';
import { findLibraryMatches, LibraryMatch } from '@utils/libraryMatching';
import { showToast } from '@utils/showToast';

const Novel = ({ route, navigation }: NovelScreenProps) => {
  const {
    pageIndex,
    pages,
    novel,
    chapters,
    fetching,
    batchInformation,
    getNextChapterBatch,
    openPage,
    setNovel,
    bookmarkChapters,
    markChaptersRead,
    markChaptersUnread,
    markPreviouschaptersRead,
    markPreviousChaptersUnread,
    refreshChapters,
    deleteChapters,
  } = useNovelContext();

  const theme = useTheme();
  const { downloadChapters } = useDownload();
  const { novelMatching } = useBrowseSettings();

  const [selected, setSelected] = useState<ChapterInfo[]>([]);
  const [editInfoModal, showEditInfoModal] = useState(false);
  const [notesModal, setNotesModal] = useState(false);
  const [alternativeTitlesModal, setAlternativeTitlesModal] = useState(false);
  const [libraryMatchesModal, setLibraryMatchesModal] = useState(false);
  const [libraryMatches, setLibraryMatches] = useState<LibraryMatch[]>([]);
  const [novelHasNote, setNovelHasNote] = useState(false);
  const [deleteRangeModal, setDeleteRangeModal] = useState(false);

  const chapterListRef = useRef<FlashList<ChapterInfo> | null>(null);

  const deleteDownloadsSnackbar = useBoolean();

  const headerOpacity = useSharedValue(0);
  const {
    value: drawerOpen,
    setTrue: openDrawer,
    setFalse: closeDrawer,
  } = useBoolean();

  useEffect(() => {
    const checkNote = async () => {
      if (novel?.id) {
        const hasNoteResult = await hasNote(novel.id);
        setNovelHasNote(hasNoteResult);
      }
    };
    checkNote();
  }, [novel?.id]);

  useEffect(() => {
    const getLibraryMatches = async () => {
      if (novel) {
        const matches = await findLibraryMatches(
          novel.name,
          novelMatching?.libraryRule || 'normalized-contains',
          novel.pluginId,
          novel.path,
          novel.alternativeTitles || [],
          novel.id,
        );
        setLibraryMatches(matches);
      }
    };
    getLibraryMatches();
  }, [novel, novelMatching?.libraryRule]);

  // TODO: fix this
  // useEffect(() => {
  //   if (chapters.length !== 0 && !fetching) {
  //     refreshChapters();
  //   }
  // }, [chapters.length, downloadQueue.length, fetching, refreshChapters]);

  // useFocusEffect(refreshChapters);

  const downloadChs = useCallback(
    async (amount: number | 'all' | 'unread') => {
      if (!novel) {
        return;
      }
      // Fetch all chapters from DB for 'all' and 'unread' to ensure we get everything
      let baseChapters: ChapterInfo[] = chapters;
      if (amount === 'all' || amount === 'unread') {
        baseChapters = await getNovelChapters(novel.id);
      }

      let filtered = baseChapters.filter(chapter => !chapter.isDownloaded);
      if (amount === 'unread') {
        filtered = filtered.filter(chapter => chapter.unread);
      }
      if (isNumber(amount)) {
        filtered = filtered.slice(0, amount);
      }
      if (filtered.length) {
        downloadChapters(novel, filtered);
      }
    },
    [chapters, downloadChapters, novel],
  );
  const deleteChapterRange = useCallback(
    async (start: number, end: number) => {
      if (!novel) return;
      const allChapters = await getNovelChapters(novel.id);
      const toDelete = allChapters.filter(
        ch =>
          ch.chapterNumber &&
          ch.chapterNumber >= start &&
          ch.chapterNumber <= end &&
          ch.isDownloaded,
      );
      if (toDelete.length) {
        deleteChapters(toDelete);
      }
      setDeleteRangeModal(false);
    },
    [novel, deleteChapters],
  );

  const clearAndRefreshChapters = useCallback(async () => {
    if (!novel) return;

    // Show confirmation dialog
    const { Alert } = await import('react-native');
    Alert.alert(
      'Clear and Refresh Chapters',
      'This will delete all chapter entries, read status, and downloads for this novel. Are you sure?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete all chapter entries and their downloads for this novel
              const { db } = await import('@database/db');
              await db.withTransactionAsync(async () => {
                // Delete all downloaded chapter files
                const allChapters = await getNovelChapters(novel.id);
                const downloadedChapters = allChapters.filter(
                  ch => ch.isDownloaded,
                );
                if (downloadedChapters.length > 0) {
                  await deleteChapters(downloadedChapters);
                }

                // Delete all chapter entries from database
                await db.runAsync('DELETE FROM Chapter WHERE novelId = ?', [
                  novel.id,
                ]);
              });

              // Call the same function as pull-to-refresh (onRefreshPage)
              const page = pages[pageIndex];
              if (page) {
                const { fetchPage } = await import('@services/plugin/fetch');
                const { insertChapters } = await import(
                  '@database/queries/ChapterQueries'
                );

                const sourcePage = await fetchPage(
                  novel.pluginId,
                  novel.path,
                  page,
                );
                const sourceChapters = sourcePage.chapters.map(ch => ({
                  ...ch,
                  page,
                }));
                await insertChapters(novel.id, sourceChapters);
              }

              // Refresh the chapter list
              await refreshChapters();
              showToast('Chapters cleared and refreshed successfully');
            } catch (error: any) {
              showToast(`Failed to clear chapters: ${error.message}`);
            }
          },
        },
      ],
    );
  }, [novel, deleteChapters, refreshChapters, pages, pageIndex]);

  const deleteChs = useCallback(() => {
    deleteChapters(chapters.filter(c => c.isDownloaded));
  }, [chapters, deleteChapters]);

  const showNotesModal = () => setNotesModal(true);
  const hideNotesModal = () => setNotesModal(false);

  const showLibraryMatchesModal = () => setLibraryMatchesModal(true);
  const hideLibraryMatchesModal = () => setLibraryMatchesModal(false);

  const handleNoteChanged = (hasNoteValue: boolean) => {
    setNovelHasNote(hasNoteValue);
  };
  const shareNovel = () => {
    if (!novel) {
      return;
    }
    Share.share({
      message: resolveUrl(novel.pluginId, novel.path, true),
    });
  };

  const [jumpToChapterModal, showJumpToChapterModal] = useState(false);
  const {
    value: dlChapterModalVisible,
    setTrue: openDlChapterModal,
    setFalse: closeDlChapterModal,
  } = useBoolean();

  const actions = useMemo(() => {
    const list: { icon: MaterialDesignIconName; onPress: () => void }[] = [];

    if (!novel?.isLocal && selected.some(obj => !obj.isDownloaded)) {
      list.push({
        icon: 'download-outline',
        onPress: () => {
          if (novel) {
            downloadChapters(
              novel,
              selected.filter(chapter => !chapter.isDownloaded),
            );
          }
          setSelected([]);
        },
      });
    }
    if (!novel?.isLocal && selected.some(obj => obj.isDownloaded)) {
      list.push({
        icon: 'trash-can-outline',
        onPress: () => {
          deleteChapters(selected.filter(chapter => chapter.isDownloaded));
          setSelected([]);
        },
      });
    }

    list.push({
      icon: 'bookmark-outline',
      onPress: () => {
        bookmarkChapters(selected);
        setSelected([]);
      },
    });

    if (selected.some(obj => obj.unread)) {
      list.push({
        icon: 'check',
        onPress: () => {
          markChaptersRead(selected);
          setSelected([]);
        },
      });
    }

    if (selected.some(obj => !obj.unread)) {
      const chapterIds = selected.map(chapter => chapter.id);

      list.push({
        icon: 'check-outline',
        onPress: () => {
          markChaptersUnread(selected);
          updateChapterProgressByIds(chapterIds, 0);
          setSelected([]);
          refreshChapters();
        },
      });
    }

    if (selected.length === 1) {
      if (selected[0].unread) {
        list.push({
          icon: 'playlist-check',
          onPress: () => {
            markPreviouschaptersRead(selected[0].id);
            setSelected([]);
          },
        });
      } else {
        list.push({
          icon: 'playlist-remove',
          onPress: () => {
            markPreviousChaptersUnread(selected[0].id);
            setSelected([]);
          },
        });
      }
    }

    return list;
  }, [
    bookmarkChapters,
    deleteChapters,
    downloadChapters,
    markChaptersRead,
    markChaptersUnread,
    markPreviousChaptersUnread,
    markPreviouschaptersRead,
    novel,
    refreshChapters,
    selected,
  ]);

  const setCustomNovelCover = async () => {
    if (!novel) {
      return;
    }
    const newCover = await pickCustomNovelCover(novel);
    if (newCover) {
      setNovel({
        ...novel,
        cover: newCover,
      });
    }
  };
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Drawer
      open={drawerOpen}
      onOpen={openDrawer}
      onClose={closeDrawer}
      swipeEnabled={pages.length > 1}
      hideStatusBarOnOpen={true}
      swipeMinVelocity={1000}
      drawerStyle={styles.drawer}
      renderDrawerContent={() =>
        (novel?.totalPages ?? 0) > 1 || pages.length > 1 ? (
          <NovelDrawer
            theme={theme}
            pages={pages}
            pageIndex={pageIndex}
            openPage={openPage}
            closeDrawer={closeDrawer}
          />
        ) : (
          <></>
        )
      }
    >
      <Portal.Host>
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <Portal>
            {selected.length === 0 ? (
              <NovelAppbar
                novel={novel}
                chapters={chapters}
                deleteChapters={deleteChs}
                downloadChapters={downloadChs}
                showEditInfoModal={showEditInfoModal}
                setCustomNovelCover={setCustomNovelCover}
                downloadCustomChapterModal={openDlChapterModal}
                showJumpToChapterModal={showJumpToChapterModal}
                shareNovel={shareNovel}
                showNotesModal={showNotesModal}
                hasNote={novelHasNote}
                showAlternativeTitlesModal={() =>
                  setAlternativeTitlesModal(true)
                }
                showLibraryMatchesModal={showLibraryMatchesModal}
                libraryMatchesCount={libraryMatches.length}
                theme={theme}
                isLocal={novel?.isLocal ?? route.params?.isLocal}
                goBack={navigation.goBack}
                headerOpacity={headerOpacity}
                openDeleteRangeModal={() => setDeleteRangeModal(true)}
                clearAndRefreshChapters={clearAndRefreshChapters}
              />
            ) : (
              <Animated.View
                entering={SlideInUp.duration(250)}
                exiting={SlideOutUp.duration(250)}
                style={styles.appbar}
              >
                <Appbar.Action
                  icon="close"
                  iconColor={theme.onBackground}
                  onPress={() => setSelected([])}
                />
                <Appbar.Content
                  title={`${selected.length}`}
                  titleStyle={{ color: theme.onSurface }}
                />
                <Appbar.Action
                  icon="select-all"
                  iconColor={theme.onBackground}
                  onPress={() => {
                    setSelected(chapters);
                  }}
                />
              </Animated.View>
            )}
          </Portal>
          <SafeAreaView excludeTop>
            <Suspense fallback={<NovelScreenLoading theme={theme} />}>
              <NovelScreenList
                headerOpacity={headerOpacity}
                listRef={chapterListRef}
                navigation={navigation}
                openDrawer={openDrawer}
                routeBaseNovel={route.params}
                selected={selected}
                setSelected={setSelected}
                getNextChapterBatch={
                  batchInformation.batch < batchInformation.total && !fetching
                    ? getNextChapterBatch
                    : noop
                }
              />
            </Suspense>
          </SafeAreaView>

          <Portal>
            <Actionbar active={selected.length > 0} actions={actions} />
            <Snackbar
              visible={deleteDownloadsSnackbar.value}
              onDismiss={deleteDownloadsSnackbar.setFalse}
              action={{
                label: getString('common.delete'),
                onPress: () => {
                  deleteChapters(chapters.filter(c => c.isDownloaded));
                },
              }}
              theme={{ colors: { primary: theme.primary } }}
              style={styles.snackbar}
            >
              <Text style={{ color: theme.onSurface }}>
                {getString('novelScreen.deleteMessage')}
              </Text>
            </Snackbar>
          </Portal>
          <Portal>
            {novel && (
              <>
                <JumpToChapterModal
                  modalVisible={jumpToChapterModal}
                  hideModal={() => showJumpToChapterModal(false)}
                  chapters={chapters}
                  novel={novel}
                  chapterListRef={chapterListRef}
                  navigation={navigation}
                />
                <EditInfoModal
                  modalVisible={editInfoModal}
                  hideModal={() => showEditInfoModal(false)}
                  novel={novel}
                  setNovel={setNovel}
                  theme={theme}
                />
                <NotesModal
                  visible={notesModal}
                  onDismiss={hideNotesModal}
                  novelId={novel.id}
                  novelName={novel.name}
                  theme={theme}
                  onNoteChanged={handleNoteChanged}
                />
                <AlternativeTitlesModal
                  visible={alternativeTitlesModal}
                  onDismiss={() => setAlternativeTitlesModal(false)}
                  novelId={novel.id}
                  novelName={novel.name}
                  sourceId={novel.sourceId}
                  theme={theme}
                />
                <LibraryMatchesModal
                  visible={libraryMatchesModal}
                  onClose={hideLibraryMatchesModal}
                  matches={libraryMatches}
                  theme={theme}
                  onSelectMatch={match => {
                    hideLibraryMatchesModal();
                    navigation.push('ReaderStack', {
                      screen: 'Novel',
                      params: {
                        pluginId: match.pluginId,
                        path: match.path,
                        name: match.name,
                      },
                    });
                  }}
                />
                <DownloadCustomChapterModal
                  modalVisible={dlChapterModalVisible}
                  hideModal={closeDlChapterModal}
                  novel={novel}
                  chapters={chapters}
                  theme={theme}
                  downloadChapters={downloadChapters}
                />
                <DeleteRangeModal
                  visible={deleteRangeModal}
                  onDismiss={() => setDeleteRangeModal(false)}
                  onConfirm={deleteChapterRange}
                  theme={theme}
                />
              </>
            )}
          </Portal>
        </View>
      </Portal.Host>
    </Drawer>
  );
};

export default Novel;

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    appbar: {
      alignItems: 'center',
      backgroundColor: theme.surface2,
      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
      flexDirection: 'row',
      paddingBottom: 8,
      paddingTop: StatusBar.currentHeight || 0,
      position: 'absolute',
      width: '100%',
    },
    container: { flex: 1 },
    drawer: { backgroundColor: 'transparent' },
    rowBack: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    snackbar: { backgroundColor: theme.surface, marginBottom: 32 },
  });
}
