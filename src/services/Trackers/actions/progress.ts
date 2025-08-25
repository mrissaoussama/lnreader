import { trackers, updateUserListEntry } from '../index';
import { updateTrack } from '@database/queries/TrackQueries';
import { addAlternativeTitle } from '@database/queries/NovelQueries';

export async function updateTrackProgressExtended(params: {
  track: any;
  newChapter: number;
  newVolume?: number;
  forceUpdate?: boolean;
  dialogSelectedListId?: string | null;
  availableLists?: Array<{ id: string; name: string }>;
  novelId?: number | string;
  getTrackerAuth: (source: string) => any;
  loadTracks: () => Promise<any> | void;
  onAltTitle?: (title: string) => Promise<void> | void;
}): Promise<{ updated: boolean; error?: string }> {
  const {
    track,
    newChapter,
    newVolume,
    forceUpdate,
    dialogSelectedListId,
    availableLists = [],
    novelId,
    getTrackerAuth,
    loadTracks,
    onAltTitle,
  } = params;
  try {
    if (typeof newChapter !== 'number' || isNaN(newChapter) || newChapter < 0) {
      throw new Error('Invalid chapter number');
    }
    const currentProgress = track.lastChapterRead || 0;
    if (newChapter < currentProgress && !forceUpdate) {
      throw new Error(
        `Cannot set progress to ${newChapter} (current: ${currentProgress}). Use force update to override.`,
      );
    }
    const auth = getTrackerAuth(track.source);
    if (!auth) throw new Error(`Not logged in to ${track.source}`);
    const trackerImpl = trackers[track.source];

    if (
      dialogSelectedListId &&
      trackerImpl?.addToReadingList &&
      typeof trackerImpl.addToReadingList === 'function'
    ) {
      try {
        await trackerImpl.addToReadingList(
          track.sourceId,
          dialogSelectedListId,
          auth,
        );
      } catch {}
    }

    const statusPayload =
      !trackerImpl?.addToReadingList &&
      trackerImpl?.capabilities?.hasStaticLists &&
      dialogSelectedListId
        ? { status: dialogSelectedListId as any }
        : {};
    const volumePayload =
      trackerImpl?.capabilities?.supportsVolumes &&
      typeof newVolume === 'number' &&
      !isNaN(newVolume) &&
      newVolume >= 0
        ? { volume: newVolume as any }
        : {};
    const listPayload = dialogSelectedListId
      ? { listId: dialogSelectedListId }
      : {};

    const updateResult = await updateUserListEntry(
      track.source,
      track.sourceId,
      {
        progress: newChapter,
        ...statusPayload,
        ...volumePayload,
        ...listPayload,
      },
      auth,
    );

    if (
      updateResult.alternativeTitles &&
      updateResult.alternativeTitles.length > 0 &&
      novelId !== 'NO_ID'
    ) {
      for (const title of updateResult.alternativeTitles) {
        try {
          if (onAltTitle) {
            await onAltTitle(title);
          } else if (typeof novelId === 'number') {
            await addAlternativeTitle(novelId, title);
          }
        } catch {}
      }
    }

    let nextMetadata = {} as any;
    try {
      if (track.metadata) nextMetadata = JSON.parse(track.metadata);
    } catch {}
    if (typeof (updateResult as any)?.totalVolumes === 'number') {
      nextMetadata.maxVolume = (updateResult as any).totalVolumes;
    }
    if (
      typeof (updateResult as any)?.volume === 'number' ||
      (typeof newVolume === 'number' && !isNaN(newVolume))
    ) {
      if (typeof newVolume === 'number' && !isNaN(newVolume)) {
        nextMetadata.currentVolume = newVolume;
      } else if (typeof (updateResult as any)?.volume === 'number') {
        nextMetadata.currentVolume = (updateResult as any).volume;
      }
    } else if (trackerImpl?.getUserListEntry) {
      try {
        const refreshed = await trackerImpl.getUserListEntry(
          track.sourceId,
          auth,
          { id: track.novelId },
        );
        if (typeof (refreshed as any)?.totalVolumes === 'number') {
          nextMetadata.maxVolume = (refreshed as any).totalVolumes;
        }
        if (typeof (refreshed as any)?.volume === 'number') {
          nextMetadata.currentVolume = (refreshed as any).volume;
        }
      } catch {}
    }

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
    } else if (dialogSelectedListId && availableLists.length > 0) {
      const name = availableLists.find(
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
    return { updated: true };
  } catch (e: any) {
    return { updated: false, error: e.message || 'Failed to update track' };
  }
}
