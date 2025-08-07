import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Switch } from 'react-native-gesture-handler';
import { BrowseFilter, BrowseFilterGroup } from '../../types/browseFilters';
import { getString } from '@strings/translations';
import { getFilterDisplayText } from './utils';
import { commonStyles } from './styles';

interface GroupsTabProps {
  groups: BrowseFilterGroup[];
  filters: BrowseFilter[];
  theme: any;
  onGroupEdit: (group: BrowseFilterGroup) => void;
  onGroupDelete: (groupId: string) => void;
  onGroupToggle: (groupId: string, enabled: boolean) => void;
  onShowForm: () => void;
  getGroupFilters: (group: BrowseFilterGroup) => BrowseFilter[];
}

export const GroupsTab: React.FC<GroupsTabProps> = ({
  groups,
  theme,
  onGroupEdit,
  onGroupDelete,
  onGroupToggle,
  onShowForm,
  getGroupFilters,
}) => {
  return (
    <View>
      {groups.map(group => {
        const groupFilters = getGroupFilters(group);

        return (
          <GroupItem
            key={group.id}
            group={group}
            filters={groupFilters}
            theme={theme}
            onEdit={() => onGroupEdit(group)}
            onDelete={() => onGroupDelete(group.id)}
            onToggle={enabled => onGroupToggle(group.id, enabled)}
          />
        );
      })}

      {groups.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
            {getString('browseFilters.noGroupsYet')}
          </Text>
          <Text
            style={[styles.emptySubtext, { color: theme.onSurfaceVariant }]}
          >
            {getString('browseFilters.groupsHelpOrganize')}
          </Text>
          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: theme.primary }]}
            onPress={onShowForm}
          >
            <Text style={[styles.createButtonText, { color: theme.onPrimary }]}>
              {getString('browseFilters.createFirstGroup')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

interface GroupItemProps {
  group: BrowseFilterGroup;
  filters: BrowseFilter[];
  theme: any;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

const GroupItem: React.FC<GroupItemProps> = ({
  group,
  filters,
  theme,
  onEdit,
  onDelete,
  onToggle,
}) => {
  const enabledFilters = filters.filter(f => f.enabled);

  return (
    <View style={[styles.groupItem, { backgroundColor: theme.surfaceVariant }]}>
      <View style={styles.groupHeader}>
        <View style={styles.groupInfo}>
          <Text style={[styles.groupName, { color: theme.onSurface }]}>
            {group.name}
          </Text>
          <Text style={[styles.groupStats, { color: theme.onSurfaceVariant }]}>
            {filters.length}{' '}
            {getString('browseFilters.filtersInGroup', {
              count: enabledFilters.length,
            })}
          </Text>
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
        </View>
        <Switch
          value={group.enabled}
          onValueChange={onToggle}
          trackColor={{ false: theme.outline, true: theme.primary }}
          thumbColor={group.enabled ? theme.onPrimary : theme.onSurfaceVariant}
        />
      </View>

      {filters.length > 0 && (
        <View style={styles.filterPreview}>
          <Text style={[styles.previewTitle, { color: theme.onSurface }]}>
            {getString('browseFilters.filters')}:
          </Text>
          {filters.slice(0, 3).map(filter => (
            <View key={filter.id} style={styles.previewFilter}>
              <Text
                style={[
                  styles.previewFilterName,
                  {
                    color: filter.enabled
                      ? theme.onSurface
                      : theme.onSurfaceVariant,
                  },
                ]}
              >
                • {filter.name}
              </Text>
              <Text
                style={[
                  styles.previewFilterPattern,
                  { color: theme.onSurfaceVariant },
                ]}
              >
                ({getFilterDisplayText(filter)})
              </Text>
            </View>
          ))}
          {filters.length > 3 && (
            <Text
              style={[styles.moreFilters, { color: theme.onSurfaceVariant }]}
            >
              {getString('browseFilters.andMore', {
                count: filters.length - 3,
              })}
            </Text>
          )}
        </View>
      )}

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
  groupItem: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  groupInfo: {
    flex: 1,
    marginRight: 12,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  groupStats: {
    fontSize: 14,
    marginBottom: 4,
  },
  groupDescription: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  filterPreview: {
    marginBottom: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  previewFilter: {
    marginBottom: 4,
  },
  previewFilterName: {
    fontSize: 14,
    fontWeight: '500',
  },
  previewFilterPattern: {
    fontSize: 12,
    marginLeft: 12,
  },
  moreFilters: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 20,
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
