import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Switch } from 'react-native-gesture-handler';
import { BrowseFilter, BrowseFilterGroup } from '../../types/browseFilters';
import { getString } from '@strings/translations';
import { getFilterDisplayText } from './utils';
import { commonStyles } from './styles';

interface FiltersTabProps {
  filters: BrowseFilter[];
  ungroupedFilters: BrowseFilter[];
  groups: BrowseFilterGroup[];
  theme: any;
  onFilterEdit: (filter: BrowseFilter) => void;
  onFilterDelete: (filterId: string) => void;
  onFilterToggle: (filterId: string, enabled: boolean) => void;
  onShowForm: () => void;
  getGroupFilters: (group: BrowseFilterGroup) => BrowseFilter[];
}

export const FiltersTab: React.FC<FiltersTabProps> = ({
  filters,
  ungroupedFilters,
  groups,
  theme,
  onFilterEdit,
  onFilterDelete,
  onFilterToggle,
  onShowForm,
  getGroupFilters,
}) => {
  return (
    <View>
      {/* Ungrouped Filters */}
      {ungroupedFilters.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>
            Individual Filters
          </Text>
          {ungroupedFilters.map(filter => (
            <FilterItem
              key={filter.id}
              filter={filter}
              theme={theme}
              onEdit={() => onFilterEdit(filter)}
              onDelete={() => onFilterDelete(filter.id)}
              onToggle={enabled => onFilterToggle(filter.id, enabled)}
            />
          ))}
        </View>
      )}

      {/* Grouped Filters */}
      {groups.map(group => {
        const groupFilters = getGroupFilters(group);
        if (groupFilters.length === 0) return null;

        return (
          <View key={group.id} style={styles.section}>
            <View style={styles.groupHeader}>
              <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>
                {group.name} ({groupFilters.length})
              </Text>
              <Switch
                value={group.enabled}
                onValueChange={enabled => onFilterToggle(group.id, enabled)}
                trackColor={{ false: theme.outline, true: theme.primary }}
                thumbColor={
                  group.enabled ? theme.onPrimary : theme.onSurfaceVariant
                }
              />
            </View>
            {group.description && (
              <Text
                style={[
                  styles.groupDescription,
                  { color: theme.onSurfaceVariant },
                ]}
              >
                {group.description}
              </Text>
            )}
            {groupFilters.map(filter => (
              <FilterItem
                key={filter.id}
                filter={filter}
                theme={theme}
                isInGroup={true}
                onEdit={() => onFilterEdit(filter)}
                onDelete={() => onFilterDelete(filter.id)}
                onToggle={enabled => onFilterToggle(filter.id, enabled)}
              />
            ))}
          </View>
        );
      })}

      {filters.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
            No filters created yet
          </Text>
          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: theme.primary }]}
            onPress={onShowForm}
          >
            <Text style={[styles.createButtonText, { color: theme.onPrimary }]}>
              Create First Filter
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

interface FilterItemProps {
  filter: BrowseFilter;
  theme: any;
  isInGroup?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

const FilterItem: React.FC<FilterItemProps> = ({
  filter,
  theme,
  isInGroup = false,
  onEdit,
  onDelete,
  onToggle,
}) => {
  return (
    <View
      style={[
        styles.filterItem,
        { backgroundColor: theme.surfaceVariant },
        isInGroup && styles.groupedFilterItem,
      ]}
    >
      <View style={styles.filterHeader}>
        <View style={styles.filterInfo}>
          <Text style={[styles.filterName, { color: theme.onSurface }]}>
            {filter.name}
          </Text>
          <Text
            style={[styles.filterPattern, { color: theme.onSurfaceVariant }]}
          >
            {getFilterDisplayText(filter)}
          </Text>
        </View>
        <Switch
          value={filter.enabled}
          onValueChange={onToggle}
          trackColor={{ false: theme.outline, true: theme.primary }}
          thumbColor={filter.enabled ? theme.onPrimary : theme.onSurfaceVariant}
        />
      </View>
      <View style={commonStyles.itemActions}>
        <TouchableOpacity
          style={[
            commonStyles.actionButton,
            { backgroundColor: theme.primary },
          ]}
          onPress={onEdit}
        >
          <Text
            style={[commonStyles.actionButtonText, { color: theme.onPrimary }]}
          >
            {getString('browseFilters.edit')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[commonStyles.actionButton, { backgroundColor: theme.error }]}
          onPress={onDelete}
        >
          <Text
            style={[commonStyles.actionButtonText, { color: theme.onError }]}
          >
            {getString('browseFilters.delete')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  groupDescription: {
    fontSize: 14,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  filterItem: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  groupedFilterItem: {
    marginLeft: 16,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  filterInfo: {
    flex: 1,
    marginRight: 12,
  },
  filterName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  filterPattern: {
    fontSize: 14,
  },
  filterActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  createButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
