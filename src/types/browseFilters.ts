export interface BrowseFilter {
  id: string;
  name: string;
  pattern: string;
  mode: 'contains' | 'not_contains';
  enabled: boolean;
  caseSensitive: boolean;
  createdAt: number;
}

export interface BrowseFilterGroup {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  mode: 'contains' | 'not_contains';
  filterIds: string[];
  createdAt: number;
}

export interface BrowseFilterState {
  enabled: boolean;
  showHiddenCount: boolean;
  lastApplied: number;
}

export interface FilterMatchInfo {
  matchedFilters: string[];
  hidden: boolean;
  reason?: string;
}
