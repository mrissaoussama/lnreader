import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { FAB } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@hooks/persisted';
import { BrowseFilter, BrowseFilterGroup } from '../types/browseFilters';
import { BrowseFilterStorage } from '@services/browseFilterStorage';
import { FiltersTab } from './FiltersTab';
import { GroupsTab } from './GroupsTab';
import { FilterForm } from './FilterForm';
import { GroupForm } from './GroupForm';
import { getString } from '@strings/translations';
import { commonStyles } from './styles';

interface FilterManagerProps {
  visible: boolean;
  onClose: () => void;
  onFiltersChanged: () => void;
}

export const FilterManager: React.FC<FilterManagerProps> = ({
  visible,
  onClose,
  onFiltersChanged,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const storage = BrowseFilterStorage.getInstance();

  const [filters, setFilters] = useState<BrowseFilter[]>([]);
  const [groups, setGroups] = useState<BrowseFilterGroup[]>([]);
  const [editingFilter, setEditingFilter] = useState<BrowseFilter | null>(null);
  const [editingGroup, setEditingGroup] = useState<BrowseFilterGroup | null>(
    null,
  );
  const [showFilterForm, setShowFilterForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'filters' | 'groups'>('filters');

  React.useEffect(() => {
    if (visible) {
      setFilters(storage.getFilters());
      setGroups(storage.getGroups());
    }
  }, [visible, storage]);

  const handleFilterSave = useCallback(
    (filter: Partial<BrowseFilter>) => {
      if (editingFilter) {
        storage.updateFilter(editingFilter.id, filter);
      } else {
        storage.addFilter(filter as Omit<BrowseFilter, 'id' | 'createdAt'>);
      }
      setFilters(storage.getFilters());
      setEditingFilter(null);
      setShowFilterForm(false);
      onFiltersChanged();
    },
    [editingFilter, storage, onFiltersChanged],
  );

  const handleFilterDelete = useCallback(
    (filterId: string) => {
      Alert.alert(
        getString('browseFilters.deleteFilter'),
        getString('browseFilters.deleteFilterConfirm'),
        [
          { text: getString('browseFilters.cancel'), style: 'cancel' },
          {
            text: getString('browseFilters.delete'),
            style: 'destructive',
            onPress: () => {
              storage.deleteFilter(filterId);
              setFilters(storage.getFilters());
              setGroups(storage.getGroups());
              onFiltersChanged();
            },
          },
        ],
      );
    },
    [storage, onFiltersChanged],
  );

  const handleGroupSave = useCallback(
    (group: Partial<BrowseFilterGroup>) => {
      if (editingGroup) {
        storage.updateGroup(editingGroup.id, group);
      } else {
        storage.addGroup(group as Omit<BrowseFilterGroup, 'id' | 'createdAt'>);
      }
      setGroups(storage.getGroups());
      setEditingGroup(null);
      setShowGroupForm(false);
      onFiltersChanged();
    },
    [editingGroup, storage, onFiltersChanged],
  );

  const handleGroupDelete = useCallback(
    (groupId: string) => {
      Alert.alert(
        getString('browseFilters.deleteGroup'),
        getString('browseFilters.deleteGroupConfirm'),
        [
          { text: getString('browseFilters.cancel'), style: 'cancel' },
          {
            text: getString('browseFilters.delete'),
            style: 'destructive',
            onPress: () => {
              storage.deleteGroup(groupId);
              setGroups(storage.getGroups());
              onFiltersChanged();
            },
          },
        ],
      );
    },
    [storage, onFiltersChanged],
  );

  const toggleFilterEnabled = useCallback(
    (filterId: string, enabled: boolean) => {
      storage.updateFilter(filterId, { enabled });
      setFilters(storage.getFilters());
      onFiltersChanged();
    },
    [storage, onFiltersChanged],
  );

  const toggleGroupEnabled = useCallback(
    (groupId: string, enabled: boolean) => {
      storage.updateGroup(groupId, { enabled });
      setGroups(storage.getGroups());
      onFiltersChanged();
    },
    [storage, onFiltersChanged],
  );

  const ungroupedFilters = useMemo(() => {
    const groupedFilterIds = new Set(groups.flatMap(g => g.filterIds));
    return filters.filter(f => !groupedFilterIds.has(f.id));
  }, [filters, groups]);

  const getGroupFilters = useCallback(
    (group: BrowseFilterGroup) => {
      return group.filterIds
        .map((id: string) => filters.find(f => f.id === id))
        .filter(Boolean) as BrowseFilter[];
    },
    [filters],
  );

  if (!visible) return null;

  return (
    <View style={commonStyles.content}>
      <View
        style={[
          commonStyles.header,
          { paddingTop: insets.top, borderBottomColor: theme.outline },
        ]}
      >
        <Text style={[commonStyles.title, { color: theme.onSurface }]}>
          {getString('browseFilters.filterManager')}
        </Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={[styles.closeText, { color: theme.primary }]}>
            {getString('browseFilters.done')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'filters' && { backgroundColor: theme.primary },
          ]}
          onPress={() => setActiveTab('filters')}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  activeTab === 'filters' ? theme.onPrimary : theme.onSurface,
              },
            ]}
          >
            {getString('browseFilters.filters')} ({filters.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'groups' && { backgroundColor: theme.primary },
          ]}
          onPress={() => setActiveTab('groups')}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  activeTab === 'groups' ? theme.onPrimary : theme.onSurface,
              },
            ]}
          >
            {getString('browseFilters.groups')} ({groups.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'filters' && (
          <FiltersTab
            filters={filters}
            ungroupedFilters={ungroupedFilters}
            groups={groups}
            theme={theme}
            onFilterEdit={setEditingFilter}
            onFilterDelete={handleFilterDelete}
            onFilterToggle={toggleFilterEnabled}
            onShowForm={() => setShowFilterForm(true)}
            getGroupFilters={getGroupFilters}
          />
        )}

        {activeTab === 'groups' && (
          <GroupsTab
            groups={groups}
            filters={filters}
            theme={theme}
            onGroupEdit={setEditingGroup}
            onGroupDelete={handleGroupDelete}
            onGroupToggle={toggleGroupEnabled}
            onShowForm={() => setShowGroupForm(true)}
            getGroupFilters={getGroupFilters}
          />
        )}
      </ScrollView>

      <FAB
        style={[styles.fab, { backgroundColor: theme.primary }]}
        icon="plus"
        onPress={() => {
          if (activeTab === 'filters') {
            setEditingFilter(null);
            setShowFilterForm(true);
          } else {
            setEditingGroup(null);
            setShowGroupForm(true);
          }
        }}
      />

      {showFilterForm && (
        <FilterForm
          filter={editingFilter}
          theme={theme}
          onSave={handleFilterSave}
          onCancel={() => {
            setShowFilterForm(false);
            setEditingFilter(null);
          }}
        />
      )}

      {showGroupForm && (
        <GroupForm
          group={editingGroup}
          filters={filters}
          theme={theme}
          storage={storage}
          onSave={handleGroupSave}
          onCancel={() => {
            setShowGroupForm(false);
            setEditingGroup(null);
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '500',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  tab: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
  },
});
