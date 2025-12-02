import { ChapterInfo, NovelInfo } from '@database/types';
import ServiceManager, {
  BackgroundTaskMetadata,
  DownloadChapterTask,
  QueuedBackgroundTask,
} from '@services/ServiceManager';
import { useMemo, useState, useEffect } from 'react';
import { useMMKVObject } from 'react-native-mmkv';

export const DOWNLOAD_QUEUE = 'DOWNLOAD';
export const CHAPTER_DOWNLOADING = 'CHAPTER_DOWNLOADING';

export default function useDownload() {
  const [queue] = useMMKVObject<QueuedBackgroundTask[]>(
    ServiceManager.manager.STORE_KEY,
  );
  const [totalChapters, setTotalChapters] = useState(0);

  const downloadQueue = useMemo(
    () => queue?.filter(t => t.task?.name === 'DOWNLOAD_CHAPTER') || [],
    [queue],
  ) as { task: DownloadChapterTask; meta: BackgroundTaskMetadata }[];

  useEffect(() => {
    // Only update totalChapters when it increases (new downloads added)
    // Never decrease it - keep it stable during the download session
    if (downloadQueue.length > totalChapters) {
      setTotalChapters(downloadQueue.length);
    }
    // Don't reset to 0 when queue empties - let it stay at the final count
  }, [downloadQueue.length, totalChapters]);

  const downloadChapter = (novel: NovelInfo, chapter: ChapterInfo) =>
    ServiceManager.manager.addTask({
      name: 'DOWNLOAD_CHAPTER',
      data: {
        chapterId: chapter.id,
        novelId: novel.id,
        pluginId: novel.pluginId,
        novelName: novel.name,
        chapterName: chapter.name,
      },
    });
  const downloadChapters = (novel: NovelInfo, chapters: ChapterInfo[]) => {
    if (chapters.length > 5) {
      ServiceManager.manager.addTask({
        name: 'DOWNLOAD_NOVEL',
        data: {
          novelId: novel.id,
          pluginId: novel.pluginId,
          novelName: novel.name,
          chapters: chapters.map(c => c.id),
        },
      });
    } else {
      ServiceManager.manager.addTask(
        chapters.map(chapter => ({
          name: 'DOWNLOAD_CHAPTER',
          data: {
            chapterId: chapter.id,
            novelId: novel.id,
            pluginId: novel.pluginId,
            novelName: novel.name,
            chapterName: chapter.name,
          },
        })),
      );
    }
  };

  const downloadAll = (novel: NovelInfo) =>
    ServiceManager.manager.addTask({
      name: 'DOWNLOAD_NOVEL',
      data: {
        novelId: novel.id,
        pluginId: novel.pluginId,
        novelName: novel.name,
        mode: 'all',
      },
    });

  const downloadUnread = (novel: NovelInfo) =>
    ServiceManager.manager.addTask({
      name: 'DOWNLOAD_NOVEL',
      data: {
        novelId: novel.id,
        pluginId: novel.pluginId,
        novelName: novel.name,
        mode: 'unread',
      },
    });

  const resumeDowndload = () => ServiceManager.manager.resume();

  const pauseDownload = () => ServiceManager.manager.pause();

  const cancelDownload = () =>
    ServiceManager.manager.removeTasksByName('DOWNLOAD_CHAPTER');

  return {
    downloadQueue,
    totalChapters,
    resumeDowndload,
    downloadChapter,
    downloadChapters,
    downloadAll,
    downloadUnread,
    pauseDownload,
    cancelDownload,
  };
}
