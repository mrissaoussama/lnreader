import { NovelItem, SourceNovel } from '@plugins/types';
import { NovelInfo } from '@database/types';
import {
  BrowseFilter,
  BrowseFilterGroup,
  FilterMatchInfo,
} from '../types/browseFilters';

export const normalizeText = (
  text: unknown,
  caseSensitive: boolean = false,
): string => {
  if (text == null || text === undefined) return '';
  const str = typeof text === 'string' ? text : String(text);
  if (!str) return '';

  const normalized = caseSensitive ? str : str.toLowerCase();
  return normalized
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

export const extractSearchableText = (
  item: NovelItem | NovelInfo | SourceNovel,
): string[] => {
  const texts: string[] = [];

  if (item.name) texts.push(item.name);

  if ('summary' in item && item.summary) texts.push(item.summary);
  if ('author' in item && item.author) texts.push(item.author);
  if ('artist' in item && item.artist) texts.push(item.artist);
  if ('genres' in item && item.genres) texts.push(item.genres);

  if ('alternativeTitles' in item && Array.isArray(item.alternativeTitles)) {
    texts.push(...item.alternativeTitles);
  }

  /*  // Chapter names if available
  if ('chapters' in item && Array.isArray(item.chapters)) {
    const chapterNames = item.chapters
      .map(ch => ch.name)
      .filter(Boolean);

    texts.push(...chapterNames);
  }*/

  return texts.filter(Boolean);
};

export const testFilter = (
  filter: BrowseFilter,
  searchableTexts: string[],
): boolean => {
  if (!filter.enabled || !String(filter.pattern ?? '').trim()) return false;

  const normalizedPattern = normalizeText(filter.pattern, filter.caseSensitive);

  const hasMatch = searchableTexts.some(text => {
    const normalizedText = normalizeText(text, filter.caseSensitive);
    return normalizedText.includes(normalizedPattern);
  });

  return hasMatch;
};

export const applyFilters = (
  item: NovelItem | NovelInfo | SourceNovel,
  filters: BrowseFilter[],
  groups: BrowseFilterGroup[],
): FilterMatchInfo => {
  const searchableTexts = extractSearchableText(item);
  const matchedFilters: string[] = [];

  // Get enabled filters from enabled groups
  const enabledGroups = groups.filter(g => g.enabled);
  const enabledFilterIds = new Set(enabledGroups.flatMap(g => g.filterIds));

  // Add standalone enabled filters (not in any group)
  const groupedFilterIds = new Set(groups.flatMap(g => g.filterIds));
  const standaloneFilters = filters.filter(
    f => f.enabled && !groupedFilterIds.has(f.id),
  );
  standaloneFilters.forEach(f => enabledFilterIds.add(f.id));

  const activeFilters = filters.filter(
    f => f.enabled && enabledFilterIds.has(f.id),
  );

  // Test each active filter
  for (const filter of activeFilters) {
    const matches = testFilter(filter, searchableTexts);
    if (matches) {
      matchedFilters.push(filter.id);

      if (filter.mode === 'not_contains') {
        return {
          matchedFilters,
          hidden: true,
          reason: `Excluded by filter: ${filter.name}`,
        };
      }
    }
  }

  // For "contains" filters, hide if none match (when there are contains filters)
  const containsFilters = activeFilters.filter(f => f.mode === 'contains');

  if (
    containsFilters.length > 0 &&
    !matchedFilters.some(id => {
      const filter = filters.find(f => f.id === id);
      if (!filter) return false;
      return filter.mode === 'contains';
    })
  ) {
    return {
      matchedFilters,
      hidden: true,
      reason: 'Does not match any include filters',
    };
  }

  return {
    matchedFilters,
    hidden: false,
  };
};

export const generateFilterId = (): string => {
  return `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const generateGroupId = (): string => {
  return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};
