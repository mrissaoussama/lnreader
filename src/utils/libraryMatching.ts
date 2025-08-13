import {
  findLibraryMatchesAsync,
  hasLibraryMatchAsync,
  updateNovelHasMatch,
} from '@database/queries/LibraryQueries';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import { BROWSE_SETTINGS, BrowseSettings } from '@hooks/persisted/useSettings';
import { getAllNovels, getNovelByPath } from '@database/queries/NovelQueries';

export interface LibraryMatch {
  id: number;
  name: string;
  author?: string;
  pluginId: string;
  path: string;
  chaptersDownloaded: number;
  chaptersUnread: number;
  totalChapters: number;
  alternativeTitles?: string[];
  matchType: 'title';
  cover?: string;
}

export type MatchingRule =
  | 'exact'
  | 'contains'
  | 'normalized-exact'
  | 'normalized-contains';
export type MatchType = 'title';

export const recalculateAllLibraryMatches = async () => {
  if (!isLibraryMatchingEnabled()) {
    return;
  }
  const libraryNovels = await getAllNovels();
  for (const novel of libraryNovels) {
    await updateNovelHasMatch(novel.id);
  }
};

export const isLibraryMatchingEnabled = (): boolean => {
  const browseSettings = getMMKVObject(BROWSE_SETTINGS) as BrowseSettings;
  const novelMatching = browseSettings?.novelMatching;
  return novelMatching?.enabled === true;
};

export const shouldShowBadges = (): boolean => {
  const browseSettings = getMMKVObject(BROWSE_SETTINGS) as BrowseSettings;
  const novelMatching = browseSettings?.novelMatching || {
    enabled: false,
    showBadges: true,
  };
  return novelMatching?.enabled === true && novelMatching?.showBadges !== false;
};

export const findLibraryMatches = async (
  searchTitle: string,
  rule: MatchingRule = 'exact',
  excludePluginId?: string,
  excludePath?: string,
  searchTitleAlternatives: string[] = [],
  excludeNovelId?: number,
): Promise<LibraryMatch[]> => {
  if (!isLibraryMatchingEnabled()) {
    return [];
  }
  return findLibraryMatchesAsync(
    searchTitle,
    searchTitleAlternatives,
    rule,
    excludePluginId,
    excludePath,
    excludeNovelId,
  );
};

export const hasLibraryMatch = async (
  searchTitle: string,
  rule: MatchingRule = 'exact',
  excludePluginId?: string,
  excludePath?: string,
  searchTitleAlternatives: string[] = [],
  excludeNovelId?: number,
): Promise<MatchType | false> => {
  if (!isLibraryMatchingEnabled()) {
    return false;
  }

  if (excludePath && excludePluginId) {
    const novel = getNovelByPath(excludePath, excludePluginId);
    if (novel?.hasMatch) {
      return novel.hasMatch;
    }
  }
  const hasMatch = await hasLibraryMatchAsync(
    searchTitle,
    searchTitleAlternatives,
    rule,
    excludePluginId,
    excludePath,
    excludeNovelId,
  );
  return hasMatch ? 'title' : false;
};
