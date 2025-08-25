import { trackers, TRACKER_SOURCES, updateUserListEntry } from '../index';
import { addAlternativeTitle } from '@database/queries/NovelQueries';
import {
  insertTrack,
  updateTrackProgress,
  deleteTracksByNovelAndSource,
} from '@database/queries/TrackQueries';
import { TrackStatus } from '@database/types/Track';
import { showToast } from '@utils/showToast';

interface LinkParams {
  novel: any;
  item: any;
  selectedTracker: string;
  selectedReadingList?: { id: string; name: string } | null;
  getTrackerAuth: (source: string) => any;
  getHighestReadChapter: () => number;
  loadTracks: () => Promise<any> | void;
  linkingCancelledRef: React.MutableRefObject<boolean>;
}

export async function handleLinkFlow(params: LinkParams) {
  const {
    novel,
    item,
    selectedTracker,
    selectedReadingList,
    getTrackerAuth,
    getHighestReadChapter,
    loadTracks,
    linkingCancelledRef,
  } = params;
  if (typeof novel.id === 'string') {
    throw new Error('Cannot track novel without valid ID');
  }
  const tracker = trackers[selectedTracker];
  if (!tracker) throw new Error(`Unknown tracker ${selectedTracker}`);

  if (selectedReadingList && tracker.addToReadingList) {
    try {
      const auth = getTrackerAuth(selectedTracker);
      if (auth) {
        await tracker.addToReadingList(
          String(item.id),
          selectedReadingList.id,
          auth,
        );
      }
    } catch {}
  }

  await createTrackRecord({
    novel,
    item,
    selectedTracker,
    selectedReadingList,
    getTrackerAuth,
    getHighestReadChapter,
    loadTracks,
    linkingCancelledRef,
  });
}

interface CreateTrackRecordParams extends Omit<LinkParams, 'item'> {
  item: any;
}

export async function createTrackRecord(params: CreateTrackRecordParams) {
  const {
    novel,
    item,
    selectedTracker,
    selectedReadingList,
    getTrackerAuth,
    getHighestReadChapter,
    loadTracks,
    linkingCancelledRef,
  } = params;
  if (linkingCancelledRef.current) return;

  if (item.alternativeTitles && item.alternativeTitles.length > 0) {
    for (const title of item.alternativeTitles) {
      try {
        await addAlternativeTitle(novel.id, title);
      } catch {}
    }
  }

  const appProgress = getHighestReadChapter();
  let trackerProgress = 0;
  try {
    const auth = getTrackerAuth(selectedTracker);
    const trackerImpl = trackers[selectedTracker];
    if (auth && trackerImpl?.getUserListEntry) {
      const entry = await trackerImpl.getUserListEntry(String(item.id), auth, {
        id: novel.id,
      });
      if (entry && typeof entry.progress === 'number') {
        trackerProgress = entry.progress;
      }
    }
  } catch {}
  const initialProgress = Math.max(appProgress || 0, trackerProgress || 0);

  const selectedListMeta = selectedReadingList
    ? { listId: selectedReadingList.id, listName: selectedReadingList.name }
    : undefined;

  const trackData = {
    novelId: novel.id,
    source: selectedTracker as any,
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
      ...(typeof (item as any).totalVolumes === 'number'
        ? { maxVolume: (item as any).totalVolumes }
        : {}),
      ...(selectedListMeta || {}),
    }),
  };

  await insertTrack(trackData);
  if (linkingCancelledRef.current) {
    // If the user cancelled while we were inserting, attempt to remove the partial record
    try {
      await deleteTracksByNovelAndSource(novel.id, selectedTracker as any);
    } catch {}
    return;
  }

  if (initialProgress > trackerProgress) {
    try {
      const auth = getTrackerAuth(selectedTracker);
      if (auth) {
        const trackerImpl = trackers[selectedTracker];
        const statusPayload =
          trackerImpl?.capabilities?.hasStaticLists &&
          !trackerImpl?.addToReadingList &&
          selectedReadingList?.id
            ? { status: selectedReadingList.id as any }
            : {};
        const listPayload = selectedReadingList?.id
          ? { listId: selectedReadingList.id }
          : {};
        await updateUserListEntry(
          selectedTracker,
          String(item.id),
          { progress: initialProgress, ...statusPayload, ...listPayload },
          auth,
        );
      }
    } catch {}
  } else if (selectedReadingList) {
    try {
      const auth = getTrackerAuth(selectedTracker);
      if (auth) {
        const trackerImpl = trackers[selectedTracker];
        if (
          trackerImpl?.capabilities?.hasStaticLists &&
          !trackerImpl?.addToReadingList &&
          selectedReadingList?.id
        ) {
          await updateUserListEntry(
            selectedTracker,
            String(item.id),
            { status: selectedReadingList.id, listId: selectedReadingList.id },
            auth,
          );
        }
      }
    } catch {}
  }

  try {
    await updateTrackProgress(
      novel.id,
      selectedTracker as any,
      initialProgress,
    );
  } catch {}
  await loadTracks();
  showToast(
    `Linked to ${selectedTracker}${
      initialProgress ? ` (progress ${initialProgress})` : ''
    }`,
  );
}
