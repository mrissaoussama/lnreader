import * as React from 'react';
import ChapterItem from './ChapterItem';
import NovelInfoHeader from './Info/NovelInfoHeader';
import { useRef, useState } from 'react';
import { pickCustomNovelCover } from '@database/queries/NovelQueries';
import { ChapterInfo, NovelInfo } from '@database/types';
import { useBoolean } from '@hooks/index';
import { useAppSettings, useDownload, useTheme } from '@hooks/persisted';
import {
  updateNovel,
  updateNovelPage,
} from '@services/updates/LibraryUpdateQueries';
import { getString } from '@strings/translations';
import { showToast } from '@utils/showToast';
import {
  NativeSyntheticEvent,
  NativeScrollEvent,
  RefreshControl,
  StyleSheet,
  Text,
} from 'react-native';
import { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrackModal from './Tracker/TrackModal';
import NovelBottomSheet from './NovelBottomSheet';
import * as Haptics from 'expo-haptics';
import { AnimatedFAB } from 'react-native-paper';
import { ChapterListSkeleton } from '@components/Skeleton/Skeleton';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { useNovelContext } from '../NovelContext';
import { FlashList } from '@shopify/flash-list';
import FileManager from '@specs/NativeFile';
import { downloadFile } from '@plugins/helpers/fetch';
import { StorageAccessFramework } from 'expo-file-system';
import { DisplayModes } from '@hooks/persisted/useNovel';

type NovelScreenListProps = {
  headerOpacity: SharedValue<number>;
  listRef: React.RefObject<FlashList<ChapterInfo> | null>;
  navigation: any;
  openDrawer: () => void;
  selected: ChapterInfo[];
  setSelected: React.Dispatch<React.SetStateAction<ChapterInfo[]>>;
  getNextChapterBatch: () => void;
  clearAndRefreshChapters: () => void;
  routeBaseNovel: {
    name: string;
    path: string;
    pluginId: string;
    cover?: string;
  };
};

const ListEmptyComponent = () => <ChapterListSkeleton />;

const getVolume = (name: string) => {
  const match = name.match(/(Volume|Vol\.?|Book) \d+/i);
  return match ? match[0] : null;
};

const NovelScreenList = ({
  headerOpacity,
  listRef,
  navigation,
  openDrawer,
  routeBaseNovel,
  selected,
  setSelected,
  getNextChapterBatch,
  clearAndRefreshChapters,
}: NovelScreenListProps) => {
  const {
    chapters,
    deleteChapter,
    fetching,
    getNovel,
    lastRead,
    loading,
    novelSettings,
    pages,
    setNovel,
    sortAndFilterChapters,
    setDisplayMode,
    updateChapter,
    deleteChaptersByCriteria,
    deleteAllDownloadedChapters,
    deleteCover,
    novel: fetchedNovel,
    batchInformation,
    pageIndex,
  } = useNovelContext();

  const { pluginId } = routeBaseNovel;
  const routeNovel: Omit<NovelInfo, 'id'> & { id: 'NO_ID' } = {
    inLibrary: false,
    isLocal: false,
    totalPages: 0,
    ...routeBaseNovel,
    id: 'NO_ID',
  };
  const novel = fetchedNovel ?? routeNovel;
  const [updating, setUpdating] = useState(false);
  const {
    useFabForContinueReading,
    defaultChapterSort,
    disableHapticFeedback,
    downloadNewChapters,
    refreshNovelMetadata,
  } = useAppSettings();

  const {
    sort = defaultChapterSort,
    filter = '',
    displayMode = DisplayModes.Title,
  } = novelSettings;

  const theme = useTheme();
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();

  const { downloadQueue, downloadChapter } = useDownload();

  const [isFabExtended, setIsFabExtended] = useState(true);

  const novelBottomSheetRef = useRef<BottomSheetModalMethods>(null);
  const trackerSheetRef = useRef<BottomSheetModalMethods>(null);

  const deleteDownloadsSnackbar = useBoolean();

  const onPageScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;

    headerOpacity.set(y < 50 ? 0 : (y - 50) / 150);
    const currentScrollPosition = Math.floor(y) ?? 0;
    if (useFabForContinueReading && lastRead) {
      setIsFabExtended(currentScrollPosition <= 0);
    }
  };

  const onRefresh = async () => {
    if (novel.id !== 'NO_ID') {
      setUpdating(true);
      updateNovel(pluginId, novel.path, novel.id, {
        downloadNewChapters,
        refreshNovelMetadata,
      })
        .then(() => getNovel())
        .then(() =>
          showToast(
            getString('novelScreen.updatedToast', { name: novel.name }),
          ),
        )
        .catch(error => showToast('Failed updating: ' + error.message))
        .finally(() => setUpdating(false));
    }
  };

  const onRefreshPage = async (page: string) => {
    if (novel.id !== 'NO_ID') {
      setUpdating(true);
      updateNovelPage(pluginId, novel.path, novel.id, page, {
        downloadNewChapters,
      })
        .then(() => getNovel())
        .then(() => showToast(`Updated page: ${page}`))
        .catch(e => showToast('Failed updating: ' + e.message))
        .finally(() => setUpdating(false));
    }
  };

  const refreshControl = () => (
    <RefreshControl
      progressViewOffset={topInset + 32}
      onRefresh={onRefresh}
      refreshing={updating}
      colors={[theme.primary]}
      progressBackgroundColor={theme.onPrimary}
    />
  );

  const isSelected = (id: number) => {
    return selected.some(obj => obj.id === id);
  };

  const onSelectPress = (chapter: ChapterInfo) => {
    if (selected.length === 0) {
      navigateToChapter(chapter);
    } else {
      if (isSelected(chapter.id)) {
        setSelected(sel => sel.filter(it => it.id !== chapter.id));
      } else {
        setSelected(sel => [...sel, chapter]);
      }
    }
  };

  const onSelectLongPress = (chapter: ChapterInfo) => {
    if (selected.length === 0) {
      if (!disableHapticFeedback) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      setSelected(sel => [...sel, chapter]);
    } else {
      if (selected.length === chapters.length) {
        return;
      }

      /**
       * Select custom range
       */
      const lastSelectedChapter = selected[selected.length - 1];

      if (lastSelectedChapter.id !== chapter.id) {
        if (lastSelectedChapter.id > chapter.id) {
          setSelected(sel => [
            ...sel,
            chapter,
            ...chapters.filter(
              (chap: ChapterInfo) =>
                (chap.id <= chapter.id || chap.id >= lastSelectedChapter.id) ===
                false,
            ),
          ]);
        } else {
          setSelected(sel => [
            ...sel,
            chapter,
            ...chapters.filter(
              (chap: ChapterInfo) =>
                (chap.id >= chapter.id || chap.id <= lastSelectedChapter.id) ===
                false,
            ),
          ]);
        }
      }
    }
  };

  const navigateToChapter = (chapter: ChapterInfo) => {
    navigation.navigate('ReaderStack', {
      screen: 'Chapter',
      params: { novel, chapter },
    });
  };

  const setCustomNovelCover = async () => {
    if (!novel || novel.id === 'NO_ID') {
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

  const saveNovelCover = async () => {
    if (!novel) {
      showToast(getString('novelScreen.coverNotSaved'));
      return;
    }
    if (!novel.cover) {
      showToast(getString('novelScreen.noCoverFound'));
      return;
    }
    const permissions =
      await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) {
      showToast(getString('novelScreen.coverNotSaved'));
      return;
    }
    const cover = novel.cover;
    let tempCoverUri: string | null = null;
    try {
      let imageExtension = cover.split('.').pop() || 'png';
      if (imageExtension.includes('?')) {
        imageExtension = imageExtension.split('?')[0] || 'png';
      }
      imageExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(
        imageExtension || '',
      )
        ? imageExtension
        : 'png';

      // sanitize novel name as app crashes while copying file with ':' character
      const novelName = novel.name.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${novelName}_${novel.id}.${imageExtension}`;
      const coverDestUri = await StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        fileName,
        'image/' + imageExtension,
      );
      if (cover.startsWith('http')) {
        const { ExternalCachesDirectoryPath } = FileManager.getConstants();
        tempCoverUri = ExternalCachesDirectoryPath + '/' + fileName;
        await downloadFile(cover, tempCoverUri);
        FileManager.copyFile(tempCoverUri, coverDestUri);
      } else {
        FileManager.copyFile(cover, coverDestUri);
      }
      showToast(getString('novelScreen.coverSaved'));
    } catch (err: any) {
      showToast(err.message);
    } finally {
      if (tempCoverUri) {
        FileManager.unlink(tempCoverUri);
      }
    }
  };

  const data = React.useMemo(() => {
    if (!chapters.length) return [];

    // Check if we should group
    const hasVolumes = chapters.some(c => getVolume(c.name));
    if (!hasVolumes) return chapters;

    const result: (
      | ChapterInfo
      | { type: 'header'; title: string; id: string }
    )[] = [];
    let currentVolume = '';

    chapters.forEach(chapter => {
      const volume = getVolume(chapter.name);
      if (volume && volume !== currentVolume) {
        currentVolume = volume;
        result.push({ type: 'header', title: volume, id: `header_${volume}` });
      }
      result.push(chapter);
    });

    return result;
  }, [chapters]);

  const stickyHeaderIndices = React.useMemo(() => {
    return data
      .map((item, index) =>
        'type' in item && item.type === 'header' ? index : null,
      )
      .filter((item): item is number => item !== null);
  }, [data]);

  return (
    <>
      <FlashList
        ref={listRef}
        estimatedItemSize={64}
        data={data}
        stickyHeaderIndices={stickyHeaderIndices}
        extraData={[
          chapters.length,
          selected.length,
          novel.id,
          loading,
          downloadQueue.length,
        ]}
        // ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={!fetching ? undefined : ListEmptyComponent}
        renderItem={({ item, index }) => {
          if (novel.id === 'NO_ID') {
            return null;
          }
          if ('type' in item && item.type === 'header') {
            return (
              <Text
                style={[
                  styles.volumeHeader,
                  { color: theme.onSurface, backgroundColor: theme.surface },
                ]}
              >
                {item.title}
              </Text>
            );
          }
          return (
            <ChapterItem
              isDownloading={downloadQueue.some(
                c => c.task.data.chapterId === item.id,
              )}
              isBookmarked={!!item.bookmark}
              isLocal={novel.isLocal}
              theme={theme}
              chapter={item as ChapterInfo}
              displayMode={displayMode}
              deleteChapter={() => deleteChapter(item as ChapterInfo)}
              downloadChapter={() =>
                downloadChapter(novel, item as ChapterInfo)
              }
              isSelected={isSelected(item.id)}
              onSelectPress={onSelectPress}
              onSelectLongPress={onSelectLongPress}
              navigateToChapter={navigateToChapter}
              novelName={novel.name}
              setChapterDownloaded={(value: boolean) =>
                updateChapter?.(index, { isDownloaded: value })
              }
            />
          );
        }}
        keyExtractor={item =>
          'type' in item ? item.id : 'c' + (item as ChapterInfo).id
        }
        contentContainerStyle={styles.contentContainer}
        refreshControl={refreshControl()}
        onEndReached={getNextChapterBatch}
        onEndReachedThreshold={6}
        onScroll={onPageScroll}
        drawDistance={1000}
        ListHeaderComponent={
          <NovelInfoHeader
            chapters={chapters}
            deleteDownloadsSnackbar={deleteDownloadsSnackbar}
            fetching={fetching}
            filter={filter}
            isLoading={loading}
            lastRead={lastRead}
            navigateToChapter={navigateToChapter}
            navigation={navigation}
            novel={novel}
            novelBottomSheetRef={novelBottomSheetRef}
            onRefreshPage={onRefreshPage}
            openDrawer={openDrawer}
            page={pages.length > 1 ? pages[pageIndex] : undefined}
            setCustomNovelCover={setCustomNovelCover}
            saveNovelCover={saveNovelCover}
            deleteCover={deleteCover}
            theme={theme}
            totalChapters={batchInformation.totalChapters}
            trackerSheetRef={trackerSheetRef}
          />
        }
      />
      {novel.id !== 'NO_ID' && (
        <>
          <NovelBottomSheet
            bottomSheetRef={novelBottomSheetRef}
            sortAndFilterChapters={sortAndFilterChapters}
            setDisplayMode={setDisplayMode}
            sort={sort}
            theme={theme}
            filter={filter}
            displayMode={displayMode}
            deleteChaptersByCriteria={deleteChaptersByCriteria}
            deleteAllDownloadedChapters={deleteAllDownloadedChapters}
            clearAndRefreshChapters={clearAndRefreshChapters}
          />
          <TrackModal
            bottomSheetRef={trackerSheetRef}
            novel={novel}
            theme={theme}
          />
          {useFabForContinueReading && (lastRead || chapters[0]) ? (
            <AnimatedFAB
              style={[
                styles.fab,
                { backgroundColor: theme.primary, marginBottom: bottomInset },
              ]}
              extended={isFabExtended && !loading}
              color={theme.onPrimary}
              uppercase={false}
              label={
                lastRead
                  ? getString('common.resume')
                  : getString('novelScreen.startReadingChapters', {
                      name: '',
                    }).trim()
              }
              icon="play"
              onPress={() => {
                navigation.navigate('ReaderStack', {
                  screen: 'Chapter',
                  params: {
                    novel: novel,
                    chapter: lastRead ?? chapters[0],
                  },
                });
              }}
            />
          ) : null}
        </>
      )}
    </>
  );
};
const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { paddingBottom: 100 },
  fab: {
    bottom: 16,
    margin: 16,
    position: 'absolute',
    right: 0,
  },
  rowBack: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  volumeHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontWeight: 'bold',
    fontSize: 14,
  },
});

export default React.memo(NovelScreenList);
