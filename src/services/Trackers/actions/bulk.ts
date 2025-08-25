import { updateUserListEntry } from '../index';
import { addAlternativeTitle } from '@database/queries/NovelQueries';
import { updateTrack } from '@database/queries/TrackQueries';

export async function bulkUpdateTrackProgress(params: {
  tracks: any[];
  targetProgress: number;
  getTrackerAuth: (source: string) => any;
  novelId?: number | string;
  onAltTitle?: (title: string) => Promise<void> | void;
  onTrackUpdated?: (count: { success: number; failed: number }) => void;
}): Promise<{ success: number; failed: number }> {
  const {
    tracks,
    targetProgress,
    getTrackerAuth,
    novelId,
    onAltTitle,
    onTrackUpdated,
  } = params;
  let success = 0;
  let failed = 0;
  for (const track of tracks) {
    try {
      if (track.lastChapterRead === targetProgress) {
        continue;
      }
      const auth = getTrackerAuth(track.source);
      if (!auth) {
        throw new Error(`Not logged in to ${track.source}`);
      }
      const updateResult = await updateUserListEntry(
        track.source,
        track.sourceId,
        { progress: targetProgress },
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
      let nextMetadata: any = {};
      try {
        if (track.metadata) nextMetadata = JSON.parse(track.metadata);
      } catch {}
      try {
        if (typeof (updateResult as any)?.totalVolumes === 'number') {
          nextMetadata.maxVolume = (updateResult as any).totalVolumes;
        }
        if (typeof (updateResult as any)?.volume === 'number') {
          nextMetadata.currentVolume = (updateResult as any).volume;
        }
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
      }
      await updateTrack(track.id, {
        lastChapterRead: targetProgress,
        lastSyncAt: new Date().toISOString(),
        metadata: Object.keys(nextMetadata).length
          ? JSON.stringify(nextMetadata)
          : track.metadata,
      });
      success++;
      if (onTrackUpdated) onTrackUpdated({ success, failed });
    } catch {
      failed++;
      if (onTrackUpdated) onTrackUpdated({ success, failed });
    }
  }
  return { success, failed };
}
