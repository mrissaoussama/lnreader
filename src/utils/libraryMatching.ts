import {
  findLibraryMatchesAsync,
  hasLibraryMatchAsync,
  updateNovelHasMatch,
} from '@database/queries/LibraryQueries';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import { APP_SETTINGS, AppSettings } from '@hooks/persisted/useSettings';
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
  const appSettings = getMMKVObject(APP_SETTINGS) as AppSettings;
  const novelMatching = appSettings?.novelMatching;
  return novelMatching?.enabled === true;
};

export const shouldShowBadges = (): boolean => {
  const appSettings = getMMKVObject(APP_SETTINGS) as AppSettings;
  const novelMatching = appSettings?.novelMatching;

  if (!novelMatching?.enabled) {
    return false;
  }
  // showBadges defaults to true when matching is enabled
  return novelMatching.showBadges !== false;
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

  // Validate the search title before proceeding
  if (
    !searchTitle ||
    typeof searchTitle !== 'string' ||
    searchTitle.trim().length === 0
  ) {
    return [];
  }

  // const variations = generateVariations(searchTitle);
  const allAlternatives = [...new Set([...searchTitleAlternatives])];

  const results = await findLibraryMatchesAsync(
    searchTitle,
    allAlternatives,
    rule,
    excludePluginId,
    excludePath,
    excludeNovelId,
  );
  return results;
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

  // Validate the search title before proceeding
  if (
    !searchTitle ||
    typeof searchTitle !== 'string' ||
    searchTitle.trim().length === 0
  ) {
    return false;
  }

  if (excludePath && excludePluginId) {
    const novel = getNovelByPath(excludePath, excludePluginId);
    if (novel?.hasMatch) {
      return novel.hasMatch;
    }
  }

  // const variations = generateVariations(searchTitle);
  const allAlternatives = [...new Set([...searchTitleAlternatives])];

  const hasMatch = await hasLibraryMatchAsync(
    searchTitle,
    allAlternatives,
    rule,
    excludePluginId,
    excludePath,
    excludeNovelId,
  );
  return hasMatch ? 'title' : false;
};
