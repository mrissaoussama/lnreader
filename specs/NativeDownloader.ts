import { TurboModule, TurboModuleRegistry } from 'react-native';

// Avoid index signatures in specs to satisfy RN codegen
export interface Spec extends TurboModule {
  // Quick availability check
  isAvailable: () => Promise<boolean>;
  // Set limits for the downloader.
  // maxSimultaneous: Maximum number of simultaneous downloads.
  // maxPerPlugin: Maximum number of downloads per plugin.
  // delayBetweenSamePluginMs: Delay between starting downloads for the same plugin, in milliseconds.
  setLimits: (
    maxSimultaneous: number,
    maxPerPlugin: number,
    delayBetweenSamePluginMs: number,
  ) => Promise<void>;
  pauseChapter: (chapterId: number) => Promise<void>;
  resumeChapter: (chapterId: number) => Promise<void>;
  cancelChapter: (chapterId: number) => Promise<void>;
  // Download an ordered list of image URLs into destDirPath.
  // Emits progress events named 'NativeDownloaderProgress' with payload:
  // { chapterId: number, index: number, total: number, url: string }
  // Resolves with an ordered list of local file paths.
  downloadImages: (
    chapterId: number,
    pluginId: string,
    destDirPath: string,
    urls: string[],
    headers: Object | null,
  ) => Promise<string[]>;
  // Full native handling: write the provided HTML into index.html and download images.
  // The HTML should already have image src attributes rewritten to the destination file paths.
  // headers are optional request headers to use when downloading images.
  downloadChapterAssets: (
    chapterId: number,
    pluginId: string,
    destDirPath: string,
    html: string,
    urls: string[],
    headers: Object | null,
  ) => Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeDownloader');
export const NAME = 'NativeDownloader';
