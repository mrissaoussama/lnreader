import { MMKV } from 'react-native-mmkv';
import {
  BrowseFilter,
  BrowseFilterGroup,
  BrowseFilterState,
} from '../types/browseFilters';
import { generateFilterId, generateGroupId } from '@utils/browseFilters';

export class BrowseFilterStorage {
  private storage: MMKV;
  private static instance: BrowseFilterStorage;

  private readonly FILTERS_KEY = 'browse_filters';
  private readonly GROUPS_KEY = 'browse_filter_groups';
  private readonly FILTER_STATE_KEY = 'browse_filter_state';

  private constructor() {
    this.storage = new MMKV({
      id: 'browse-filters',
      encryptionKey: 'browse-filters-key',
    });
  }

  public static getInstance(): BrowseFilterStorage {
    if (!BrowseFilterStorage.instance) {
      BrowseFilterStorage.instance = new BrowseFilterStorage();
    }
    return BrowseFilterStorage.instance;
  }

  public getFilters(): BrowseFilter[] {
    try {
      const filtersJson = this.storage.getString(this.FILTERS_KEY);
      return filtersJson ? JSON.parse(filtersJson) : [];
    } catch (error) {
      return [];
    }
  }

  public saveFilters(filters: BrowseFilter[]): void {
    try {
      this.storage.set(this.FILTERS_KEY, JSON.stringify(filters));
    } catch (error) {}
  }

  public addFilter(
    filter: Omit<BrowseFilter, 'id' | 'createdAt'>,
  ): BrowseFilter {
    const newFilter: BrowseFilter = {
      ...filter,
      id: generateFilterId(),
      createdAt: Date.now(),
    };

    const filters = this.getFilters();
    filters.push(newFilter);
    this.saveFilters(filters);

    return newFilter;
  }

  public updateFilter(id: string, updates: Partial<BrowseFilter>): boolean {
    const filters = this.getFilters();
    const index = filters.findIndex(f => f.id === id);

    if (index === -1) return false;

    filters[index] = { ...filters[index], ...updates };
    this.saveFilters(filters);
    return true;
  }

  public deleteFilter(id: string): boolean {
    const filters = this.getFilters();
    const filtered = filters.filter(f => f.id !== id);

    if (filtered.length === filters.length) return false;

    this.saveFilters(filtered);

    this.removeFilterFromAllGroups(id);

    return true;
  }

  public getGroups(): BrowseFilterGroup[] {
    try {
      const groupsJson = this.storage.getString(this.GROUPS_KEY);
      const groups = groupsJson ? JSON.parse(groupsJson) : [];

      const migratedGroups = groups.map((group: any) => ({
        ...group,
        mode: group.mode || 'contains',
      }));

      if (
        migratedGroups.some((group: any, index: number) => !groups[index]?.mode)
      ) {
        this.saveGroups(migratedGroups);
      }

      return migratedGroups;
    } catch (error) {
      return [];
    }
  }

  public saveGroups(groups: BrowseFilterGroup[]): void {
    try {
      this.storage.set(this.GROUPS_KEY, JSON.stringify(groups));
    } catch (error) {}
  }

  public addGroup(
    group: Omit<BrowseFilterGroup, 'id' | 'createdAt'>,
  ): BrowseFilterGroup {
    const newGroup: BrowseFilterGroup = {
      ...group,
      id: generateGroupId(),
      createdAt: Date.now(),
    };

    const groups = this.getGroups();
    groups.push(newGroup);
    this.saveGroups(groups);

    return newGroup;
  }

  public updateGroup(id: string, updates: Partial<BrowseFilterGroup>): boolean {
    const groups = this.getGroups();
    const index = groups.findIndex(g => g.id === id);

    if (index === -1) return false;

    groups[index] = { ...groups[index], ...updates };
    this.saveGroups(groups);
    return true;
  }

  public deleteGroup(id: string): boolean {
    const groups = this.getGroups();
    const filtered = groups.filter(g => g.id !== id);

    if (filtered.length === groups.length) return false;

    this.saveGroups(filtered);
    return true;
  }

  public addFilterToGroup(groupId: string, filterId: string): boolean {
    const groups = this.getGroups();
    const group = groups.find(g => g.id === groupId);

    if (!group || group.filterIds.includes(filterId)) return false;

    group.filterIds.push(filterId);
    this.saveGroups(groups);
    return true;
  }

  public removeFilterFromGroup(groupId: string, filterId: string): boolean {
    const groups = this.getGroups();
    const group = groups.find(g => g.id === groupId);

    if (!group) return false;

    const filtered = group.filterIds.filter((id: string) => id !== filterId);
    if (filtered.length === group.filterIds.length) return false;

    group.filterIds = filtered;
    this.saveGroups(groups);
    return true;
  }

  private removeFilterFromAllGroups(filterId: string): void {
    const groups = this.getGroups();
    let modified = false;

    groups.forEach(group => {
      const originalLength = group.filterIds.length;
      group.filterIds = group.filterIds.filter((id: string) => id !== filterId);
      if (group.filterIds.length !== originalLength) {
        modified = true;
      }
    });

    if (modified) {
      this.saveGroups(groups);
    }
  }

  public getFilterState(): BrowseFilterState {
    try {
      const stateJson = this.storage.getString(this.FILTER_STATE_KEY);
      return stateJson
        ? JSON.parse(stateJson)
        : {
            enabled: false,
            showHiddenCount: true,
            lastApplied: 0,
          };
    } catch (error) {
      return {
        enabled: false,
        showHiddenCount: true,
        lastApplied: 0,
      };
    }
  }

  public saveFilterState(state: BrowseFilterState): void {
    try {
      this.storage.set(this.FILTER_STATE_KEY, JSON.stringify(state));
    } catch (error) {}
  }

  public updateFilterState(updates: Partial<BrowseFilterState>): void {
    const currentState = this.getFilterState();
    const newState = { ...currentState, ...updates };
    this.saveFilterState(newState);
  }

  public exportFilters(): {
    filters: BrowseFilter[];
    groups: BrowseFilterGroup[];
    state: BrowseFilterState;
  } {
    return {
      filters: this.getFilters(),
      groups: this.getGroups(),
      state: this.getFilterState(),
    };
  }

  public importFilters(data: {
    filters?: BrowseFilter[];
    groups?: BrowseFilterGroup[];
    state?: BrowseFilterState;
  }): boolean {
    try {
      if (data.filters) {
        this.saveFilters(data.filters);
      }
      if (data.groups) {
        this.saveGroups(data.groups);
      }
      if (data.state) {
        this.saveFilterState(data.state);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  public clearAll(): void {
    this.storage.delete(this.FILTERS_KEY);
    this.storage.delete(this.GROUPS_KEY);
    this.storage.delete(this.FILTER_STATE_KEY);
  }
}
