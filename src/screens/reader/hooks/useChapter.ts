import {
  getChapter as getDbChapter,
  getNextChapter,
  getPrevChapter,
} from '@database/queries/ChapterQueries';
import { insertHistory } from '@database/queries/HistoryQueries';
import { ChapterInfo, NovelInfo } from '@database/types';
import {
  useChapterGeneralSettings,
  useLibrarySettings,
  useTrackedNovel,
  useTracker,
} from '@hooks/persisted';
import { fetchChapter } from '@services/plugin/fetch';
import { RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import { sanitizeChapterText } from '../utils/sanitizeChapterText';
import { parseChapterNumber } from '@utils/parseChapterNumber';
import WebView from 'react-native-webview';
import { useFullscreenMode } from '@hooks';
import { Dimensions, NativeEventEmitter } from 'react-native';
import * as Speech from 'expo-speech';
import { showToast } from '@utils/showToast';
import { getString } from '@strings/translations';
import NativeVolumeButtonListener from '@specs/NativeVolumeButtonListener';
import { useNovelContext } from '@screens/novel/NovelContext';

const emmiter = new NativeEventEmitter(NativeVolumeButtonListener);

export default function useChapter(
  webViewRef: RefObject<WebView | null>,
  initialChapter: ChapterInfo,
  novel: NovelInfo,
) {
  const {
    setLastRead,
    markChapterRead,
    updateChapterProgress,
    chapterTextCache,
  } = useNovelContext();
  const [hidden, setHidden] = useState(true);
  const [chapter, setChapter] = useState(initialChapter);
  const [loading, setLoading] = useState(true);
  const [chapterText, setChapterText] = useState('');

  const [[nextChapter, prevChapter], setAdjacentChapter] = useState<
    (ChapterInfo | undefined)[]
  >([]);
  const { useVolumeButtons } = useChapterGeneralSettings();
  const { incognitoMode } = useLibrarySettings();
  const [error, setError] = useState<string>();
  const { tracker } = useTracker();
  const { trackedNovel, syncProgress } = useTrackedNovel(novel.id);
  const { setImmersiveMode, showStatusAndNavBar } = useFullscreenMode();

  const getChapter = useCallback(
    async (targetChapter: ChapterInfo = chapter, forceUpdate: 'network' | 'local' | false = false) => {
      try {
        setLoading(true);
        setError(undefined);

        let text = '';

        // Use cache if not forcing an update
        if (!forceUpdate && chapterTextCache.has(targetChapter.id)) {
          const cached = chapterTextCache.get(targetChapter.id)!;
          text = cached instanceof Promise ? await cached : cached;
        } else {
          const dbChapter = await getDbChapter(targetChapter.id);

          // Force network: always fetch from internet
          if (forceUpdate === 'network') {
            text = await fetchChapter(novel.pluginId, targetChapter.path);
          }
          // Force local: only read from downloaded file, no fallback
          else if (forceUpdate === 'local') {
            if (dbChapter?.isDownloaded) {
              const { StorageManager } = await import('@utils/StorageManager');
              const novelDir = StorageManager.getNovelPath(
                novel.id,
                novel.pluginId,
              );
              const chapterPath = `${novelDir}/${targetChapter.id}/index.html`;
              const NativeFile = (await import('@specs/NativeFile')).default;

              if (await NativeFile.exists(chapterPath)) {
                text = await NativeFile.readFile(chapterPath);
              } else {
                throw new Error('Chapter file not found. Try reloading from network.');
              }
            } else {
              throw new Error('Chapter is not downloaded. Use network reload instead.');
            }
          }
          // Normal load: prefer local if downloaded, otherwise network
          else {
            if (dbChapter?.isDownloaded) {
              try {
                const { StorageManager } = await import('@utils/StorageManager');
                const novelDir = StorageManager.getNovelPath(
                  novel.id,
                  novel.pluginId,
                );
                const chapterPath = `${novelDir}/${targetChapter.id}/index.html`;
                const NativeFile = (await import('@specs/NativeFile')).default;

                if (await NativeFile.exists(chapterPath)) {
                  text = await NativeFile.readFile(chapterPath);
                } else {
                  // Fallback to network if file missing
                  text = await fetchChapter(novel.pluginId, targetChapter.path);
                }
              } catch (e) {
                // If reading downloaded file fails, fetch from internet
                text = await fetchChapter(novel.pluginId, targetChapter.path);
              }
            } else {
              // Not downloaded, fetch from internet
              text = await fetchChapter(novel.pluginId, targetChapter.path);
            }
          }
        }

        if (text) {
          const sanitized = sanitizeChapterText(
            novel.pluginId,
            novel.name,
            targetChapter.name,
            text,
          );
          setChapterText(sanitized);
          chapterTextCache.set(targetChapter.id, text);
        } else {
          setError('Chapter content is empty');
        }

        setChapter(targetChapter);

        const next = await getNextChapter(
          targetChapter.novelId,
          targetChapter.position || 0,
          targetChapter.page,
        );
        const prev = await getPrevChapter(
          targetChapter.novelId,
          targetChapter.position || 0,
          targetChapter.page,
        );
        setAdjacentChapter([next ?? undefined, prev ?? undefined]);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [chapter, chapterTextCache, incognitoMode, novel.pluginId, novel.id, novel.name],
  );

  const connectVolumeButton = useCallback(() => {
    emmiter.addListener('VolumeUp', () => {
      webViewRef.current?.injectJavaScript(`(()=>{
          window.scrollBy({top: -${
            Dimensions.get('window').height * 0.75
          }, behavior: 'smooth'})
        })()`);
    });
    emmiter.addListener('VolumeDown', () => {
      webViewRef.current?.injectJavaScript(`(()=>{
          window.scrollBy({top: ${
            Dimensions.get('window').height * 0.75
          }, behavior: 'smooth'})
        })()`);
    });
  }, [webViewRef]);

  useEffect(() => {
    if (useVolumeButtons) {
      connectVolumeButton();
    } else {
      emmiter.removeAllListeners('VolumeUp');
      emmiter.removeAllListeners('VolumeDown');
      // this is just for sure, without it app still works properly
    }

    return () => {
      emmiter.removeAllListeners('VolumeUp');
      emmiter.removeAllListeners('VolumeDown');
      Speech.stop();
    };
  }, [useVolumeButtons, chapter, connectVolumeButton]);

  const updateTracker = useCallback(() => {
    const chapterNumber = parseChapterNumber(novel.name, chapter.name);
    if (
      tracker &&
      trackedNovel &&
      chapterNumber > trackedNovel.lastChapterRead
    ) {
      syncProgress(chapterNumber);
    }
  }, [chapter.name, novel.name, trackedNovel, tracker, syncProgress]);

  const saveProgress = useCallback(
    (percentage: number) => {
      if (!incognitoMode) {
        updateChapterProgress(chapter.id, percentage > 100 ? 100 : percentage);

        if (percentage >= 97) {
          // a relative number
          markChapterRead(chapter.id);
          updateTracker();
        }
      }
    },
    [
      chapter.id,
      incognitoMode,
      markChapterRead,
      updateChapterProgress,
      updateTracker,
    ],
  );

  const hideHeader = useCallback(() => {
    if (!hidden) {
      webViewRef.current?.injectJavaScript('reader.hidden.val = true');
      setImmersiveMode();
    } else {
      webViewRef.current?.injectJavaScript('reader.hidden.val = false');
      showStatusAndNavBar();
    }
    setHidden(!hidden);
  }, [hidden, setImmersiveMode, showStatusAndNavBar, webViewRef]);

  const navigateChapter = useCallback(
    (position: 'NEXT' | 'PREV') => {
      let nextNavChapter;
      if (position === 'NEXT') {
        nextNavChapter = nextChapter;
      } else if (position === 'PREV') {
        nextNavChapter = prevChapter;
      } else {
        return;
      }
      if (nextNavChapter) {
        // setLoading(true);

        getChapter(nextNavChapter);
      } else {
        showToast(
          position === 'NEXT'
            ? getString('readerScreen.noNextChapter')
            : getString('readerScreen.noPreviousChapter'),
        );
      }
    },
    [getChapter, nextChapter, prevChapter],
  );

  const reloadChapter = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    chapterTextCache.delete(chapter.id);
    await getChapter(chapter, 'network'); // Force refresh from network
  }, [chapter, getChapter, chapterTextCache, setLoading, setError]);

  const reloadChapterLocal = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    chapterTextCache.delete(chapter.id);
    await getChapter(chapter, 'local'); // Force reload from local file only
  }, [chapter, getChapter, chapterTextCache, setLoading, setError]);

  useEffect(() => {
    getChapter();
  }, [getChapter]);

  useEffect(() => {
    if (!incognitoMode) {
      insertHistory(chapter.id);
      getDbChapter(chapter.id).then(result => result && setLastRead(result));
    }

    return () => {
      if (!incognitoMode) {
        getDbChapter(chapter.id).then(result => result && setLastRead(result));
      }
    };
  }, [incognitoMode, setLastRead, setLoading, chapter.id]);

  useEffect(() => {
    if (!chapter || !chapterText) {
      getChapter();
    }
  }, [chapter, chapterText, getChapter]);

  return useMemo(
    () => ({
      chapter,
      nextChapter,
      prevChapter,
      chapterText,
      loading,
      error,
      hidden,
      saveProgress,
      navigateChapter,
      hideHeader,
      reloadChapter,
      reloadChapterLocal,
    }),
    [
      chapter,
      nextChapter,
      prevChapter,
      chapterText,
      loading,
      error,
      hidden,
      saveProgress,
      navigateChapter,
      hideHeader,
      reloadChapter,
      reloadChapterLocal,
    ],
  );
}
