import { useTrackedNovel } from '@hooks/persisted/useTrackedNovel';
import { useTracker } from '@hooks/persisted/useTracker';
import { useAppSettings } from '@hooks/persisted/useSettings';
import { updateUserListEntry, getUserListEntry } from '@services/Trackers';
import { updateTrackProgress, getTracks } from '@database/queries/TrackQueries';
import {
  markChaptersRead,
  getNovelChapters,
} from '@database/queries/ChapterQueries';
import { getLibraryNovelsFromDb } from '@database/queries/LibraryQueries';
import { TrackerAuthUtils } from './common/utils';
import { NovelInfo } from '@database/types';

interface SyncProgress {
  processed: number;
  total: number;
  currentNovel: string;
}

interface SyncResult {
  novelName: string;
  trackerChanges: Array<{
    tracker: string;
    oldProgress: number;
    newProgress: number;
  }>;
  appChange?: {
    oldProgress: number;
    newProgress: number;
  };
  error?: string;
}

/**
 * Progress sync service that handles automatic synchronization
 * of reading progress with external trackers
 */
export class ProgressSyncService {
  /**
   * Syncs chapter progress to external trackers when reading chapters
   * @param novelId Database ID of the novel
   * @param chapterNumber Current chapter number being read
   * @param isCompleted Whether the chapter/novel is completed
   * @param tracks Array of tracker entries for this novel
   * @param getTracker Function to get tracker authentication
   * @param novel Novel information object
   * @param chapterName Name of the current chapter
   * @param chapterPath Path identifier for the chapter
   */
  static async syncChapterProgress(
    novelId: number,
    chapterNumber: number,
    isCompleted: boolean = false,
    tracks: any[],
    getTracker: any,
    novel?: any,
    chapterName?: string,
    chapterPath?: string,
  ) {
    try {
      for (const track of tracks) {
        const auth = getTracker(track.source);
        if (!auth) continue;

        // Don't sync if chapter is lower than tracker progress (unless completed)
        if (chapterNumber < track.lastChapterRead && !isCompleted) continue;

        try {
          await updateUserListEntry(
            track.source,
            track.sourceId,
            {
              progress: chapterNumber,
              ...(isCompleted &&
                chapterNumber === track.totalChapters && {
                  status: 'COMPLETED',
                }),
              ...(chapterName &&
                chapterPath && {
                  chapterName,
                  chapterPath,
                }),
            },
            auth,
          );

          await updateTrackProgress(novelId, track.source, chapterNumber);
        } catch (error) {
          // Silently ignore individual tracker errors
        }
      }
    } catch (error) {
      // Silently ignore sync errors to prevent interrupting reading
    }
  }

  /**
   * Syncs novel visit progress to external trackers based on threshold settings
   * @param novelId Database ID of the novel
   * @param currentChapter Current chapter number the user is viewing
   * @param tracks Array of tracker entries for this novel
   * @param getTracker Function to get tracker authentication
   * @param settings Auto-sync settings with threshold configuration
   */
  static async syncNovelVisit(
    novelId: number,
    currentChapter: number,
    tracks: any[],
    getTracker: any,
    settings?: { autoSyncTracker?: boolean; autoSyncThreshold?: number },
  ) {
    try {
      // Don't sync if auto-sync is disabled
      if (!settings?.autoSyncTracker) return;

      const threshold = settings.autoSyncThreshold || 1;

      for (const track of tracks) {
        const auth = getTracker(track.source);
        if (!auth) continue;

        // Don't sync if chapter is lower than tracker progress
        if (currentChapter < track.lastChapterRead) continue;

        // Check if we've read enough chapters ahead to trigger sync
        const chaptersAhead = currentChapter - track.lastChapterRead;
        if (chaptersAhead < threshold) continue;

        try {
          await updateUserListEntry(
            track.source,
            track.sourceId,
            {
              progress: currentChapter,
              metadata: track.metadata,
            },
            auth,
          );

          await updateTrackProgress(novelId, track.source, currentChapter);
        } catch (error) {
          // Silently ignore individual tracker errors
        }
      }
    } catch (error) {
      // Silently ignore sync errors to prevent interrupting navigation
    }
  }

  /**
   * Retrieves authentication credentials for all configured trackers
   * @returns Record mapping tracker names to their authentication data
   */
  private static getAllTrackerAuth(): Record<string, any> {
    return TrackerAuthUtils.getAllTrackerAuth();
  }

  /**
   * Sorts chapters by chapter number or ID as fallback
   * @param chapters Array of chapter objects
   * @returns Sorted array of chapters
   */
  private static sortChapters(chapters: any[]): any[] {
    return chapters.sort((a: any, b: any) => {
      const aNum = parseFloat(a.chapterNumber) || a.id;
      const bNum = parseFloat(b.chapterNumber) || b.id;
      return aNum - bNum;
    });
  }

  /**
   * Marks chapters as read up to the specified progress
   * @param chapters Array of all chapters
   * @param targetProgress Number of chapters to mark as read
   */
  private static async markChaptersToProgress(
    chapters: any[],
    targetProgress: number,
  ): Promise<void> {
    const sortedChapters = this.sortChapters(chapters);
    const chaptersToMarkRead = sortedChapters.slice(0, targetProgress);
    const unreadChapterIds = chaptersToMarkRead
      .filter((ch: any) => ch.unread)
      .map((ch: any) => ch.id);

    if (unreadChapterIds.length > 0) {
      await markChaptersRead(unreadChapterIds);
    }
  }

  /**
   * Gets progress information for a single tracker
   * @param track Tracker entry
   * @param auth Authentication for the tracker
   * @returns Progress information or null if failed
   */
  private static async getTrackerProgress(
    track: any,
    auth: any,
  ): Promise<{
    track: any;
    tracker: string;
    oldProgress: number;
    newProgress: number;
    progress: number;
  } | null> {
    try {
      const userEntry = await getUserListEntry(
        track.source,
        track.sourceId,
        auth,
      );
      const trackerProgress = userEntry.progress || 0;

      return {
        track,
        tracker: track.source,
        oldProgress: track.lastChapterRead,
        newProgress: trackerProgress,
        progress: trackerProgress,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Updates a single tracker with new progress
   * @param track Tracker entry
   * @param progress New progress value
   * @param auth Authentication for the tracker
   * @param novelId Novel database ID
   * @returns Tracker change result
   */
  private static async updateSingleTracker(
    track: any,
    progress: number,
    auth: any,
    novelId: number,
  ): Promise<{
    tracker: string;
    oldProgress: number;
    newProgress: number;
  }> {
    try {
      if (progress > track.lastChapterRead) {
        await updateUserListEntry(
          track.source,
          track.sourceId,
          { progress },
          auth,
        );
        await updateTrackProgress(novelId, track.source, progress);

        return {
          tracker: track.source,
          oldProgress: track.lastChapterRead,
          newProgress: progress,
        };
      }
    } catch (error) {
      // Fall through to return no change
    }

    return {
      tracker: track.source,
      oldProgress: track.lastChapterRead,
      newProgress: track.lastChapterRead,
    };
  }

  /**
   * Syncs reading progress from all trackers to the app, marking chapters as read based on tracker progress
   * @param onProgress Optional callback function to report sync progress
   * @param forceUpdate Whether to force update even if progress hasn't changed
   * @returns Promise resolving to sync results for all novels
   */
  static async syncFromTrackers(
    onProgress?: (progress: SyncProgress) => void,
    forceUpdate: boolean = false,
  ): Promise<{ novels: SyncResult[] }> {
    const allAuth = this.getAllTrackerAuth();
    const libraryNovels = getLibraryNovelsFromDb(null, null, null, false);
    const results: SyncResult[] = [];

    let processed = 0;

    for (const novel of libraryNovels as NovelInfo[]) {
      try {
        onProgress?.({
          processed,
          total: libraryNovels.length,
          currentNovel: novel.name,
        });

        const tracks = await getTracks(novel.id);
        if (tracks.length === 0) {
          processed++;
          continue;
        }

        // Get current app progress
        const appChapters = await getNovelChapters(novel.id);
        const readChapters = appChapters.filter((ch: any) => !ch.unread);
        const appProgress = readChapters.length;

        // Get tracker progress in parallel
        const trackerProgressPromises = tracks.map(async track => {
          const auth = allAuth[track.source];
          if (!auth) return null;
          return this.getTrackerProgress(track, auth);
        });

        const trackerResults = await Promise.all(trackerProgressPromises);
        const trackerChanges: Array<{
          tracker: string;
          oldProgress: number;
          newProgress: number;
        }> = [];
        let maxTrackerProgress = 0;

        for (const result of trackerResults) {
          if (result) {
            trackerChanges.push({
              tracker: result.tracker,
              oldProgress: result.oldProgress,
              newProgress: result.newProgress,
            });

            if (result.progress > maxTrackerProgress) {
              maxTrackerProgress = result.progress;
            }
          }
        }

        // Update app if tracker has more progress or force update is enabled
        if (
          maxTrackerProgress > appProgress ||
          (forceUpdate && maxTrackerProgress !== appProgress)
        ) {
          await this.markChaptersToProgress(appChapters, maxTrackerProgress);

          results.push({
            novelName: `${novel.name}|${novel.pluginId}`,
            trackerChanges,
            appChange: {
              oldProgress: appProgress,
              newProgress: maxTrackerProgress,
            },
          });
        } else {
          results.push({
            novelName: `${novel.name}|${novel.pluginId}`,
            trackerChanges,
          });
        }
      } catch (error) {
        results.push({
          novelName: `${novel.name}|${novel.pluginId}`,
          trackerChanges: [],
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      processed++;
    }

    return { novels: results };
  }

  /**
   * Sync from app to all trackers (update tracker progress based on app reading progress)
   * @param onProgress Optional callback function to report sync progress
   * @param forceUpdate Whether to force update even if progress hasn't changed
   * @returns Promise resolving to sync results for all novels
   */
  static async syncToTrackers(
    onProgress?: (progress: SyncProgress) => void,
    forceUpdate: boolean = false,
  ): Promise<{ novels: SyncResult[] }> {
    const allAuth = this.getAllTrackerAuth();
    const libraryNovels = getLibraryNovelsFromDb(null, null, null, false);
    const results: SyncResult[] = [];

    let processed = 0;

    for (const novel of libraryNovels as NovelInfo[]) {
      try {
        onProgress?.({
          processed,
          total: libraryNovels.length,
          currentNovel: novel.name,
        });

        const tracks = await getTracks(novel.id);
        if (tracks.length === 0) {
          processed++;
          continue;
        }

        // Get current app progress
        const appChapters = await getNovelChapters(novel.id);
        const readChapters = appChapters.filter((ch: any) => !ch.unread);
        const appProgress = readChapters.length;

        // Update all trackers in parallel
        const updatePromises = tracks.map(async track => {
          const auth = allAuth[track.source];
          if (!auth) {
            return {
              tracker: track.source,
              oldProgress: track.lastChapterRead,
              newProgress: track.lastChapterRead,
            };
          }

          // Only sync if app has more progress or force update is enabled
          if (
            appProgress > track.lastChapterRead ||
            (forceUpdate && appProgress !== track.lastChapterRead)
          ) {
            return this.updateSingleTracker(track, appProgress, auth, novel.id);
          }

          return {
            tracker: track.source,
            oldProgress: track.lastChapterRead,
            newProgress: track.lastChapterRead,
          };
        });

        const trackerChanges = await Promise.all(updatePromises);

        results.push({
          novelName: `${novel.name}|${novel.pluginId}`,
          trackerChanges,
        });
      } catch (error) {
        results.push({
          novelName: `${novel.name}|${novel.pluginId}`,
          trackerChanges: [],
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      processed++;
    }

    return { novels: results };
  }

  /**
   * Sync all trackers bidirectionally (keep highest progress across app and all trackers)
   * @param onProgress Optional callback function to report sync progress
   * @param forceUpdate Whether to force update even if progress hasn't changed
   * @returns Promise resolving to sync results for all novels
   */
  static async syncAllTrackers(
    onProgress?: (progress: SyncProgress) => void,
    forceUpdate: boolean = false,
  ): Promise<{ novels: SyncResult[] }> {
    const allAuth = this.getAllTrackerAuth();
    const libraryNovels = getLibraryNovelsFromDb(null, null, null, false);
    const results: SyncResult[] = [];

    let processed = 0;

    for (const novel of libraryNovels as NovelInfo[]) {
      try {
        onProgress?.({
          processed,
          total: libraryNovels.length,
          currentNovel: novel.name,
        });

        const tracks = await getTracks(novel.id);
        if (tracks.length === 0) {
          processed++;
          continue;
        }

        // Get current app progress
        const appChapters = await getNovelChapters(novel.id);
        const readChapters = appChapters.filter((ch: any) => !ch.unread);
        const appProgress = readChapters.length;

        // Get tracker progress in parallel
        const trackerProgressPromises = tracks.map(async track => {
          const auth = allAuth[track.source];
          if (!auth) return null;
          return this.getTrackerProgress(track, auth);
        });

        const trackerResults = await Promise.all(trackerProgressPromises);
        let maxProgress = appProgress;

        // Find the highest progress
        for (const result of trackerResults) {
          if (result && result.progress > maxProgress) {
            maxProgress = result.progress;
          }
        }

        let appChange: { oldProgress: number; newProgress: number } | undefined;

        // Update app if needed or if force update is enabled
        if (
          maxProgress > appProgress ||
          (forceUpdate && maxProgress !== appProgress)
        ) {
          await this.markChaptersToProgress(appChapters, maxProgress);
          appChange = {
            oldProgress: appProgress,
            newProgress: maxProgress,
          };
        }

        // Update all trackers to max progress in parallel
        const updatePromises = tracks.map(async track => {
          const auth = allAuth[track.source];
          if (!auth) {
            return {
              tracker: track.source,
              oldProgress: track.lastChapterRead,
              newProgress: track.lastChapterRead,
            };
          }

          if (maxProgress > track.lastChapterRead) {
            return this.updateSingleTracker(track, maxProgress, auth, novel.id);
          }

          return {
            tracker: track.source,
            oldProgress: track.lastChapterRead,
            newProgress: maxProgress,
          };
        });

        const trackerChanges = await Promise.all(updatePromises);

        results.push({
          novelName: `${novel.name}|${novel.pluginId}`,
          trackerChanges,
          appChange,
        });
      } catch (error) {
        results.push({
          novelName: `${novel.name}|${novel.pluginId}`,
          trackerChanges: [],
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      processed++;
    }

    return { novels: results };
  }
}

/**
 * Hook for easy progress syncing in components
 */
export const useProgressSync = (novel: any) => {
  const novelId = novel?.id || 0;
  const { tracks } = useTrackedNovel(novelId);
  const { getTrackerAuth } = useTracker();
  const { autoSyncTracker, autoSyncChapterThreshold } = useAppSettings();

  const syncProgress = async (
    chapterNumber: number,
    isCompleted: boolean = false,
    chapterName?: string,
    chapterPath?: string,
  ) => {
    if (typeof novelId === 'string' || novelId === 0) return;

    // Only auto-sync if enabled in settings
    if (!autoSyncTracker) return;

    // Check if we've read enough chapters to trigger sync for each tracker
    const tracksToSync = tracks.filter(track => {
      const chaptersReadSinceLastSync = chapterNumber - track.lastChapterRead;
      return chaptersReadSinceLastSync >= autoSyncChapterThreshold;
    });

    if (tracksToSync.length === 0) return;

    await ProgressSyncService.syncChapterProgress(
      novelId,
      chapterNumber,
      isCompleted,
      tracksToSync, // Only sync trackers that meet the threshold
      getTrackerAuth,
      novel, // Pass the full novel object
      chapterName,
      chapterPath,
    );
  };

  const syncVisit = async (currentChapter: number) => {
    if (typeof novelId === 'string' || novelId === 0) return;

    await ProgressSyncService.syncNovelVisit(
      novelId,
      currentChapter,
      tracks,
      getTrackerAuth,
      { autoSyncTracker, autoSyncThreshold: autoSyncChapterThreshold },
    );
  };

  // Manual sync function that ignores settings (for user-initiated syncs)
  const manualSyncProgress = async (
    chapterNumber: number,
    isCompleted: boolean = false,
    chapterName?: string,
    chapterPath?: string,
  ) => {
    if (typeof novelId === 'string' || novelId === 0) return;

    await ProgressSyncService.syncChapterProgress(
      novelId,
      chapterNumber,
      isCompleted,
      tracks, // Sync all tracks when manual
      getTrackerAuth,
      novel,
      chapterName,
      chapterPath,
    );
  };

  return { syncProgress, syncVisit, manualSyncProgress };
};
