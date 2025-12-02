import {
  DisplayModes,
  LibraryFilter,
  LibrarySortOrder,
} from '@screens/library/constants/constants';
import { useMMKVObject } from 'react-native-mmkv';
import { Voice } from 'expo-speech';

export const APP_SETTINGS = 'APP_SETTINGS';
export const BROWSE_SETTINGS = 'BROWSE_SETTINGS';
export const LIBRARY_SETTINGS = 'LIBRARY_SETTINGS';
export const CHAPTER_GENERAL_SETTINGS = 'CHAPTER_GENERAL_SETTINGS';
export const CHAPTER_READER_SETTINGS = 'CHAPTER_READER_SETTINGS';
export const NETWORK_SETTINGS = 'NETWORK_SETTINGS';

export interface AppSettings {
  /**
   * General settings
   */

  incognitoMode: boolean;
  disableHapticFeedback: boolean;

  /**
   * Appearence settings
   */

  showHistoryTab: boolean;
  showUpdatesTab: boolean;
  showLabelsInNav: boolean;
  useFabForContinueReading: boolean;
  disableLoadingAnimations: boolean;

  /**
   * Library settings
   */

  downloadedOnlyMode: boolean;
  useLibraryFAB: boolean;

  /**
   * Update settings
   */

  onlyUpdateOngoingNovels: boolean;
  updateLibraryOnLaunch: boolean;
  downloadNewChapters: boolean;
  refreshNovelMetadata: boolean;

  /**
   * Novel settings
   */

  hideBackdrop: boolean;
  defaultChapterSort: string;

  /**
   * Tracker settings
   */

  autoSyncTracker: boolean;
  autoSyncChapterThreshold: number;

  /**
   * Novel Matching settings
   */

  novelMatching?: {
    enabled?: boolean;
    showBadges?: boolean;
    pluginRule?:
      | 'exact'
      | 'contains'
      | 'normalized-exact'
      | 'normalized-contains';
    libraryRule?:
      | 'exact'
      | 'contains'
      | 'normalized-exact'
      | 'normalized-contains';
  };
}

export interface BrowseSettings {
  showMyAnimeList: boolean;
  showAniList: boolean;
  globalSearchConcurrency?: number;
  hideInLibraryItems?: boolean;
  enableAdvancedFilters?: boolean;
  disableInfiniteScroll?: boolean;
  displayMode?: DisplayModes;
  novelsPerRow?: number;
  confirmPluginLeave?: boolean;
}

export interface LibrarySettings {
  sortOrder?: LibrarySortOrder;
  filter?: LibraryFilter;
  showDownloadBadges?: boolean;
  showUnreadBadges?: boolean;
  showNotesBadges?: boolean;
  showMatchingBadges?: boolean;
  showNumberOfNovels?: boolean;
  showCovers?: boolean;
  displayMode?: DisplayModes;
  novelsPerRow?: number;
  incognitoMode?: boolean;
  downloadedOnlyMode?: boolean;
  libraryLoadLimit?: number; // Number of novels to load at once in library
  novelTitleLines?: number;
}

export interface ChapterGeneralSettings {
  keepScreenOn: boolean;
  fullScreenMode: boolean;
  pageReader: boolean;
  swipeGestures: boolean;
  showScrollPercentage: boolean;
  useVolumeButtons: boolean;
  showBatteryAndTime: boolean;
  autoScroll: boolean;
  autoScrollInterval: number;
  autoScrollOffset: number | null;
  pauseAutoscrollOnTap: boolean;
  verticalSeekbar: boolean;
  removeExtraParagraphSpacing: boolean;
  bionicReading: boolean;
  tapToScroll: boolean;
  TTSEnable: boolean;
  progressBarPosition: 'left' | 'right' | 'bottom';
  useServiceForeground: boolean;
}

export interface ReaderTheme {
  backgroundColor: string;
  textColor: string;
}

export interface ChapterReaderSettings {
  theme: string;
  textColor: string;
  textSize: number;
  textAlign: string;
  padding: number;
  fontFamily: string;
  lineHeight: number;
  customCSS: string;
  customJS: string;
  customThemes: ReaderTheme[];
  tts?: {
    voice?: Voice;
    rate?: number;
    pitch?: number;
  };
  epubLocation: string;
  epubUseAppTheme: boolean;
  epubUseCustomCSS: boolean;
  epubUseCustomJS: boolean;
}

export interface NetworkSettings {
  maxConcurrentTasks: number;
  maxGlobalConcurrentTasks: number;
  taskDelay: number;
  randomDelayRange: { min: number; max: number };
  pluginSettings: Record<
    string,
    {
      maxConcurrentTasks?: number;
      taskDelay?: number;
      randomDelayRange?: { min: number; max: number };
    }
  >;
}

const initialAppSettings: AppSettings = {
  /**
   * General settings
   */

  incognitoMode: false,
  disableHapticFeedback: false,

  /**
   * Appearence settings
   */

  showHistoryTab: true,
  showUpdatesTab: true,
  showLabelsInNav: true,
  useFabForContinueReading: false,
  disableLoadingAnimations: false,

  /**
   * Library settings
   */

  downloadedOnlyMode: false,
  useLibraryFAB: false,

  /**
   * Update settings
   */

  onlyUpdateOngoingNovels: false,
  updateLibraryOnLaunch: false,
  downloadNewChapters: false,
  refreshNovelMetadata: false,

  /**
   * Novel settings
   */

  hideBackdrop: false,
  defaultChapterSort: 'ORDER BY position ASC',

  /**
   * Tracker settings
   */

  autoSyncTracker: false,
  autoSyncChapterThreshold: 3,
};

const initialBrowseSettings: BrowseSettings = {
  showMyAnimeList: true,
  showAniList: true,
  globalSearchConcurrency: 3,
  hideInLibraryItems: false,
  enableAdvancedFilters: true,
  disableInfiniteScroll: false,
  displayMode: DisplayModes.Comfortable,
  novelsPerRow: 3,
  confirmPluginLeave: false,
};

export const initialChapterGeneralSettings: ChapterGeneralSettings = {
  keepScreenOn: true,
  fullScreenMode: true,
  pageReader: false,
  swipeGestures: false,
  showScrollPercentage: true,
  useVolumeButtons: false,
  showBatteryAndTime: false,
  autoScroll: false,
  autoScrollInterval: 10,
  autoScrollOffset: null,
  pauseAutoscrollOnTap: true,
  verticalSeekbar: true,
  removeExtraParagraphSpacing: false,
  bionicReading: false,
  tapToScroll: false,
  TTSEnable: false,
  progressBarPosition: 'right',
  useServiceForeground: false,
};

export const initialChapterReaderSettings: ChapterReaderSettings = {
  theme: '#292832',
  textColor: '#CCCCCC',
  textSize: 16,
  textAlign: 'left',
  padding: 16,
  fontFamily: '',
  lineHeight: 1.5,
  customCSS: '',
  customJS: '',
  customThemes: [],
  tts: {
    rate: 1,
    pitch: 1,
  },
  epubLocation: '',
  epubUseAppTheme: false,
  epubUseCustomCSS: false,
  epubUseCustomJS: false,
};

export const initialNetworkSettings: NetworkSettings = {
  maxConcurrentTasks: 1,
  maxGlobalConcurrentTasks: 3,
  taskDelay: 1000,
  randomDelayRange: { min: 0, max: 0 },
  pluginSettings: {},
};

export const useAppSettings = () => {
  const [appSettings = initialAppSettings, setSettings] =
    useMMKVObject<AppSettings>(APP_SETTINGS);

  const setAppSettings = (values: Partial<AppSettings>) =>
    setSettings({ ...appSettings, ...values });

  return {
    ...appSettings,
    setAppSettings,
  };
};

export const useBrowseSettings = () => {
  const [browseSettings = initialBrowseSettings, setSettings] =
    useMMKVObject<BrowseSettings>(BROWSE_SETTINGS);

  const setBrowseSettings = (values: Partial<BrowseSettings>) =>
    setSettings({ ...browseSettings, ...values });

  return {
    ...browseSettings,
    setBrowseSettings,
  };
};

const defaultLibrarySettings: LibrarySettings = {
  showNumberOfNovels: false,
  downloadedOnlyMode: false,
  incognitoMode: false,
  displayMode: DisplayModes.Comfortable,
  showDownloadBadges: true,
  showUnreadBadges: true,
  showNotesBadges: true,
  showMatchingBadges: true,
  showCovers: true,
  novelsPerRow: 3,
  sortOrder: LibrarySortOrder.DateAdded_DESC,
  libraryLoadLimit: 50, // Default to 50 novels per load
  novelTitleLines: 2,
};

export const useLibrarySettings = () => {
  const [librarySettings, setSettings] =
    useMMKVObject<LibrarySettings>(LIBRARY_SETTINGS);

  const setLibrarySettings = useCallback(
    (value: Partial<LibrarySettings>) =>
      setSettings(currentSettings => ({ ...currentSettings, ...value })),
    [setSettings],
  );

  return useMemo(
    () => ({
      ...defaultLibrarySettings,
      ...librarySettings,
      setLibrarySettings,
    }),
    [librarySettings, setLibrarySettings],
  );
};

export const useChapterGeneralSettings = () => {
  const [chapterGeneralSettings = initialChapterGeneralSettings, setSettings] =
    useMMKVObject<ChapterGeneralSettings>(CHAPTER_GENERAL_SETTINGS);

  const setChapterGeneralSettings = (values: Partial<ChapterGeneralSettings>) =>
    setSettings({ ...chapterGeneralSettings, ...values });

  return {
    ...chapterGeneralSettings,
    setChapterGeneralSettings,
  };
};

export const useChapterReaderSettings = () => {
  const [chapterReaderSettings = initialChapterReaderSettings, setSettings] =
    useMMKVObject<ChapterReaderSettings>(CHAPTER_READER_SETTINGS);

  const setChapterReaderSettings = (values: Partial<ChapterReaderSettings>) =>
    setSettings({ ...chapterReaderSettings, ...values });

  const saveCustomReaderTheme = (theme: ReaderTheme) =>
    setSettings({
      ...chapterReaderSettings,
      customThemes: [theme, ...chapterReaderSettings.customThemes],
    });

  const deleteCustomReaderTheme = (theme: ReaderTheme) =>
    setSettings({
      ...chapterReaderSettings,
      customThemes: chapterReaderSettings.customThemes.filter(
        v =>
          !(
            v.backgroundColor === theme.backgroundColor &&
            v.textColor === theme.textColor
          ),
      ),
    });

  return {
    ...chapterReaderSettings,
    setChapterReaderSettings,
    saveCustomReaderTheme,
    deleteCustomReaderTheme,
  };
};

export const useNetworkSettings = () => {
  const [networkSettings = initialNetworkSettings, setSettings] =
    useMMKVObject<NetworkSettings>(NETWORK_SETTINGS);

  const setNetworkSettings = (values: Partial<NetworkSettings>) =>
    setSettings({ ...networkSettings, ...values });

  return {
    ...networkSettings,
    setNetworkSettings,
  };
};
