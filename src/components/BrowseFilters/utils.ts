import { getString } from '@strings/translations';
import { BrowseFilter } from '../../types/browseFilters';

export const getFilterModeText = (
  mode: 'contains' | 'not_contains',
): string => {
  return mode === 'contains'
    ? getString('browseFilters.contains')
    : getString('browseFilters.excludes');
};

export const getFilterDisplayText = (filter: BrowseFilter): string => {
  const modeText = getFilterModeText(filter.mode);
  const caseSensitiveText = filter.caseSensitive
    ? ` (${getString('browseFilters.caseSensitive')})`
    : '';

  return `${modeText}: "${filter.pattern}"${caseSensitiveText}`;
};

export const getFilterStatusText = (enabled: boolean): string => {
  return enabled
    ? getString('browseFilters.enabled')
    : getString('browseFilters.disabled');
};
