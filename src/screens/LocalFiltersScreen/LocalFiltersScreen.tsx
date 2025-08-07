import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { Switch } from 'react-native-gesture-handler';
import { FAB } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@hooks/persisted';
import { Button, SafeAreaView } from '@components/index';
import { BrowseFilter, BrowseFilterGroup } from '../../types/browseFilters';
import { BrowseFilterStorage } from '@services/browseFilterStorage';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { LocalFiltersScreenProps } from '@navigators/types';

const LocalFiltersScreen: React.FC<LocalFiltersScreenProps> = ({
  navigation,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const storage = BrowseFilterStorage.getInstance();

  const [filters, setFilters] = useState<BrowseFilter[]>([]);
  const [groups, setGroups] = useState<BrowseFilterGroup[]>([]);
  const [filtersEnabled, setFiltersEnabled] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showFilterForm, setShowFilterForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingFilter, setEditingFilter] = useState<BrowseFilter | null>(null);
  const [editingGroup, setEditingGroup] = useState<BrowseFilterGroup | null>(
    null,
  );

  const [filterPattern, setFilterPattern] = useState('');
  const [filterMode, setFilterMode] = useState<'contains' | 'not_contains'>(
    'contains',
  );
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [filterEnabled, setFilterEnabled] = useState(true);

  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');

  const [showGroupManager, setShowGroupManager] = useState(false);
  const [managingFilter, setManagingFilter] = useState<BrowseFilter | null>(
    null,
  );
  const [isBulkLoading, setIsBulkLoading] = useState(false);

  const loadData = useCallback(() => {
    const loadedFilters = storage.getFilters();
    const loadedGroups = storage.getGroups();
    const state = storage.getFilterState();

    setFilters(loadedFilters);
    setGroups(loadedGroups);
    setFiltersEnabled(state.enabled);
  }, [storage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleFiltersEnabled = useCallback(() => {
    const newState = !filtersEnabled;
    storage.updateFilterState({ enabled: newState });
    setFiltersEnabled(newState);
  }, [storage, filtersEnabled]);

  const generateFilterName = (
    mode: 'contains' | 'not_contains',
    pattern: string,
  ) => {
    const operatorText = mode === 'contains' ? 'contains' : "doesn't contain";
    return `${operatorText} "${pattern}"`;
  };

  const performBulkOperation = useCallback(
    async (operation: () => void, _description: string) => {
      setIsBulkLoading(true);
      try {
        operation();
        setTimeout(() => {
          setIsBulkLoading(false);
        }, 300);
      } catch (error) {
        setIsBulkLoading(false);
      }
    },
    [],
  );

  const createFilter = useCallback(() => {
    if (!filterPattern.trim()) {
      Alert.alert('Error', 'Please enter a filter pattern');
      return;
    }

    if (editingFilter) {
      const updatedFilter: Partial<BrowseFilter> = {
        name: generateFilterName(filterMode, filterPattern.trim()),
        pattern: filterPattern.trim(),
        mode: filterMode,
        caseSensitive: caseSensitive,
        enabled: filterEnabled,
      };

      storage.updateFilter(editingFilter.id, updatedFilter);
    } else {
      const filter: BrowseFilter = {
        id: Date.now().toString(),
        name: generateFilterName(filterMode, filterPattern.trim()),
        pattern: filterPattern.trim(),
        mode: filterMode,
        enabled: filterEnabled,
        caseSensitive: caseSensitive,
        createdAt: Date.now(),
      };

      storage.addFilter(filter);
    }

    storage.updateFilterState({ lastApplied: Date.now() });
    loadData();

    setFilterPattern('');
    setFilterMode('contains');
    setCaseSensitive(false);
    setFilterEnabled(true);
    setShowFilterForm(false);
    setEditingFilter(null);
  }, [
    filterPattern,
    filterMode,
    caseSensitive,
    filterEnabled,
    storage,
    loadData,
    editingFilter,
  ]);

  const createGroup = useCallback(() => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    if (editingGroup) {
      const updatedGroup: Partial<BrowseFilterGroup> = {
        name: groupName.trim(),
        description: groupDescription.trim() || undefined,
      };

      storage.updateGroup(editingGroup.id, updatedGroup);
    } else {
      const group: BrowseFilterGroup = {
        id: Date.now().toString(),
        name: groupName.trim(),
        description: groupDescription.trim() || undefined,
        enabled: true,
        mode: 'contains',
        filterIds: [],
        createdAt: Date.now(),
      };

      storage.addGroup(group);
    }

    storage.updateFilterState({ lastApplied: Date.now() });
    loadData();

    setGroupName('');
    setGroupDescription('');
    setShowGroupForm(false);
    setEditingGroup(null);
  }, [groupName, groupDescription, storage, loadData, editingGroup]);

  const toggleGroupExpanded = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  }, []);

  const handleFilterDelete = useCallback(
    (filterId: string) => {
      Alert.alert(
        'Delete Filter',
        'Are you sure you want to delete this filter?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              storage.deleteFilter(filterId);
              storage.updateFilterState({ lastApplied: Date.now() });
              loadData();
            },
          },
        ],
      );
    },
    [storage, loadData],
  );

  const handleGroupDelete = useCallback(
    (groupId: string) => {
      Alert.alert(
        'Delete Group',
        'Are you sure you want to delete this group?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              storage.deleteGroup(groupId);
              storage.updateFilterState({ lastApplied: Date.now() });
              loadData();
            },
          },
        ],
      );
    },
    [storage, loadData],
  );

  const toggleFilterEnabled = useCallback(
    (filterId: string, enabled: boolean) => {
      storage.updateFilter(filterId, { enabled });
      storage.updateFilterState({ lastApplied: Date.now() });
      loadData();
    },
    [storage, loadData],
  );

  const toggleGroupEnabled = useCallback(
    (groupId: string, enabled: boolean) => {
      storage.updateGroup(groupId, { enabled });
      storage.updateFilterState({ lastApplied: Date.now() });
      loadData();
    },
    [storage, loadData],
  );

  const handleEditFilter = useCallback((filter: BrowseFilter) => {
    setEditingFilter(filter);
    setFilterPattern(filter.pattern);
    setFilterMode(filter.mode);
    setCaseSensitive(filter.caseSensitive);
    setFilterEnabled(filter.enabled);
    setShowFilterForm(true);
  }, []);

  const handleEditGroup = useCallback((group: BrowseFilterGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupDescription(group.description || '');
    setShowGroupForm(true);
  }, []);

  const handleManageGroupFilters = useCallback((filter: BrowseFilter) => {
    setManagingFilter(filter);
    setShowGroupManager(true);
  }, []);

  const addFilterToGroup = useCallback(
    (filterId: string, groupId: string) => {
      const group = groups.find(g => g.id === groupId);
      if (group && !group.filterIds.includes(filterId)) {
        storage.updateGroup(groupId, {
          filterIds: [...group.filterIds, filterId],
        });
        storage.updateFilterState({ lastApplied: Date.now() });
        loadData();
      }
    },
    [groups, storage, loadData],
  );

  const removeFilterFromGroup = useCallback(
    (filterId: string, groupId: string) => {
      const group = groups.find(g => g.id === groupId);
      if (group) {
        storage.updateGroup(groupId, {
          filterIds: group.filterIds.filter(id => id !== filterId),
        });
        storage.updateFilterState({ lastApplied: Date.now() });
        loadData();
      }
    },
    [groups, storage, loadData],
  );

  const handleRemoveFilterFromGroup = useCallback(
    (filterId: string, groupId: string) => {
      Alert.alert(
        'Remove from Group',
        'Remove this filter from the group? (The filter will remain in Individual Filters)',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => removeFilterFromGroup(filterId, groupId),
          },
        ],
      );
    },
    [removeFilterFromGroup],
  );

  const groupedFilterIds = new Set(groups.flatMap(g => g.filterIds));
  const ungroupedFilters = filters.filter(f => !groupedFilterIds.has(f.id));

  const getGroupFilters = useCallback(
    (group: BrowseFilterGroup) => {
      return group.filterIds
        .map((id: string) => filters.find(f => f.id === id))
        .filter(Boolean) as BrowseFilter[];
    },
    [filters],
  );

  return (
    <>
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.surface }]}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.outline }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={theme.onSurface}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.onSurface }]}>
            Local Filters
          </Text>
          <View style={styles.headerActions}>
            <Switch
              value={filtersEnabled}
              onValueChange={toggleFiltersEnabled}
              trackColor={{ false: theme.outline, true: theme.primary }}
              thumbColor={
                filtersEnabled ? theme.onPrimary : theme.onSurfaceVariant
              }
            />
          </View>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          {/* Stats */}
          <View
            style={[
              styles.statsContainer,
              { backgroundColor: theme.surfaceVariant },
            ]}
          >
            <Text style={[styles.statsText, { color: theme.onSurfaceVariant }]}>
              {filters.filter(f => f.enabled).length}/{filters.length} filter
              {filters.length !== 1 ? 's' : ''} •{' '}
              {groups.filter(g => g.enabled).length}/{groups.length} group
              {groups.length !== 1 ? 's' : ''}
            </Text>
            <Text
              style={[
                styles.statusText,
                {
                  color: filtersEnabled
                    ? theme.primary
                    : theme.onSurfaceVariant,
                },
              ]}
            >
              {filtersEnabled ? 'Active' : 'Disabled'}
            </Text>
          </View>

          {/* Filter explanation */}
          {filters.length > 0 && (
            <View
              style={[
                styles.explanationContainer,
                { backgroundColor: theme.surface },
              ]}
            >
              <Text
                style={[
                  styles.explanationText,
                  { color: theme.onSurfaceVariant },
                ]}
              >
                <Text style={styles.boldText}>Include</Text> shows only matching
                items • <Text style={styles.boldText}>Exclude</Text> hides
                matching items
              </Text>
            </View>
          )}

          {/* Global Controls */}
          {filters.length > 0 && (
            <View
              style={[
                styles.globalControls,
                { backgroundColor: theme.surface, borderColor: theme.outline },
              ]}
            >
              <Text
                style={[styles.globalControlsTitle, { color: theme.onSurface }]}
              >
                Bulk Actions
              </Text>
              <View style={styles.globalButtonRow}>
                <TouchableOpacity
                  style={[
                    styles.globalButton,
                    {
                      backgroundColor: isBulkLoading
                        ? theme.surfaceVariant
                        : theme.primary,
                    },
                  ]}
                  disabled={isBulkLoading}
                  onPress={() =>
                    performBulkOperation(() => {
                      filters.forEach(filter => {
                        storage.updateFilter(filter.id, { enabled: true });
                      });
                      groups.forEach(group => {
                        storage.updateGroup(group.id, { enabled: true });
                      });
                      storage.updateFilterState({ lastApplied: Date.now() });
                      loadData();
                    }, 'Enable All')
                  }
                >
                  <Text
                    style={[
                      styles.globalButtonText,
                      { color: theme.onPrimary },
                    ]}
                  >
                    {isBulkLoading ? 'Processing...' : 'Enable All'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.globalButton,
                    {
                      backgroundColor: isBulkLoading
                        ? theme.surfaceVariant
                        : theme.outline,
                    },
                  ]}
                  disabled={isBulkLoading}
                  onPress={() =>
                    performBulkOperation(() => {
                      filters.forEach(filter => {
                        storage.updateFilter(filter.id, { enabled: false });
                      });
                      groups.forEach(group => {
                        storage.updateGroup(group.id, { enabled: false });
                      });
                      storage.updateFilterState({ lastApplied: Date.now() });
                      loadData();
                    }, 'Disable All')
                  }
                >
                  <Text
                    style={[
                      styles.globalButtonText,
                      { color: theme.onSurface },
                    ]}
                  >
                    {isBulkLoading ? 'Processing...' : 'Disable All'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.globalButton,
                    {
                      backgroundColor: isBulkLoading
                        ? theme.surfaceVariant
                        : theme.secondary,
                    },
                  ]}
                  disabled={isBulkLoading}
                  onPress={() =>
                    performBulkOperation(() => {
                      filters.forEach(filter => {
                        storage.updateFilter(filter.id, {
                          enabled: !filter.enabled,
                        });
                      });
                      groups.forEach(group => {
                        storage.updateGroup(group.id, {
                          enabled: !group.enabled,
                        });
                      });
                      storage.updateFilterState({ lastApplied: Date.now() });
                      loadData();
                    }, 'Toggle All')
                  }
                >
                  <Text
                    style={[
                      styles.globalButtonText,
                      { color: theme.onSecondary },
                    ]}
                  >
                    {isBulkLoading ? 'Processing...' : 'Toggle All'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

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
                  onEdit={() => handleEditFilter(filter)}
                  onDelete={() => handleFilterDelete(filter.id)}
                  onToggle={enabled => toggleFilterEnabled(filter.id, enabled)}
                  onManageGroups={() => handleManageGroupFilters(filter)}
                />
              ))}
            </View>
          )}

          {/* Groups */}
          {groups.map(group => {
            const groupFilters = getGroupFilters(group);
            const isExpanded = expandedGroups.has(group.id);

            return (
              <View key={group.id} style={styles.section}>
                <TouchableOpacity
                  style={[
                    styles.groupHeader,
                    { backgroundColor: theme.surfaceVariant },
                  ]}
                  onPress={() => toggleGroupExpanded(group.id)}
                >
                  <View style={styles.groupHeaderContent}>
                    <MaterialCommunityIcons
                      name={isExpanded ? 'chevron-down' : 'chevron-right'}
                      size={20}
                      color={theme.onSurface}
                    />
                    <Text
                      style={[styles.groupTitle, { color: theme.onSurface }]}
                    >
                      {group.name} ({groupFilters.length})
                      {(() => {
                        const filtersInGroup = getGroupFilters(group);
                        const modes = filtersInGroup.map(f => f.mode);
                        const allSameMode =
                          modes.length > 0 && modes.every(m => m === modes[0]);
                        if (!allSameMode && modes.length > 1) {
                          return (
                            <Text
                              style={[
                                styles.mixedModeIndicator,
                                { color: theme.onSurfaceVariant },
                              ]}
                            >
                              {' '}
                              (Mixed)
                            </Text>
                          );
                        }
                        return null;
                      })()}
                    </Text>

                    {/* Group Mode Controls */}
                    <View style={styles.groupModeContainer}>
                      {(() => {
                        const filtersInGroup = getGroupFilters(group);
                        const modes = filtersInGroup.map(f => f.mode);
                        const allSameMode =
                          modes.length > 0 && modes.every(m => m === modes[0]);
                        const currentGroupMode = allSameMode ? modes[0] : null;

                        return [
                          {
                            value: 'contains',
                            label: 'Include',
                            icon: '✓',
                            color: 'primary',
                          },
                          {
                            value: 'not_contains',
                            label: 'Exclude',
                            icon: '✗',
                            color: 'error',
                          },
                        ].map(option => (
                          <TouchableOpacity
                            key={option.value}
                            style={styles.groupModeOption}
                            onPress={() => {
                              storage.updateGroup(group.id, {
                                mode: option.value as
                                  | 'contains'
                                  | 'not_contains',
                              });

                              const groupFiltersToUpdate =
                                getGroupFilters(group);
                              groupFiltersToUpdate.forEach(filter => {
                                storage.updateFilter(filter.id, {
                                  mode: option.value as
                                    | 'contains'
                                    | 'not_contains',
                                });
                              });

                              storage.updateFilterState({
                                lastApplied: Date.now(),
                              });
                              loadData();
                            }}
                          >
                            <View
                              style={[
                                styles.groupModeButton,
                                { borderColor: theme.outline },
                                currentGroupMode === option.value && {
                                  backgroundColor:
                                    option.color === 'primary'
                                      ? theme.primary
                                      : theme.error,
                                  borderColor:
                                    option.color === 'primary'
                                      ? theme.primary
                                      : theme.error,
                                },
                              ]}
                            >
                              {currentGroupMode === option.value && (
                                <Text
                                  style={[
                                    styles.groupModeIcon,
                                    {
                                      color:
                                        option.color === 'primary'
                                          ? theme.onPrimary
                                          : theme.onError,
                                    },
                                  ]}
                                >
                                  {option.icon}
                                </Text>
                              )}
                            </View>
                            <Text
                              style={[
                                styles.groupModeLabel,
                                {
                                  color:
                                    currentGroupMode === option.value
                                      ? option.color === 'primary'
                                        ? theme.primary
                                        : theme.error
                                      : theme.onSurfaceVariant,
                                },
                              ]}
                            >
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        ));
                      })()}
                    </View>
                  </View>
                  <View style={styles.groupActions}>
                    <TouchableOpacity
                      style={styles.groupActionButton}
                      onPress={() => handleEditGroup(group)}
                    >
                      <MaterialCommunityIcons
                        name="pencil"
                        size={16}
                        color={theme.onSurfaceVariant}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.groupActionButton}
                      onPress={() => handleGroupDelete(group.id)}
                    >
                      <MaterialCommunityIcons
                        name="delete"
                        size={16}
                        color={theme.error}
                      />
                    </TouchableOpacity>
                    <Switch
                      value={group.enabled}
                      onValueChange={enabled =>
                        toggleGroupEnabled(group.id, enabled)
                      }
                      trackColor={{ false: theme.outline, true: theme.primary }}
                      thumbColor={
                        group.enabled ? theme.onPrimary : theme.onSurfaceVariant
                      }
                    />
                  </View>
                </TouchableOpacity>

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

                {isExpanded &&
                  groupFilters.map(filter => (
                    <FilterItem
                      key={filter.id}
                      filter={filter}
                      theme={theme}
                      isInGroup={true}
                      groupId={group.id}
                      onEdit={() => handleEditFilter(filter)}
                      onDelete={() => handleFilterDelete(filter.id)}
                      onToggle={enabled =>
                        toggleFilterEnabled(filter.id, enabled)
                      }
                      onRemoveFromGroup={handleRemoveFilterFromGroup}
                    />
                  ))}
              </View>
            );
          })}

          {/* Empty state */}
          {filters.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="filter-outline"
                size={64}
                color={theme.onSurfaceVariant}
              />
              <Text style={[styles.emptyTitle, { color: theme.onSurface }]}>
                No Filters Yet
              </Text>
              <Text
                style={[
                  styles.emptyDescription,
                  { color: theme.onSurfaceVariant },
                ]}
              >
                Create filters to hide or show novels based on titles, authors,
                genres, and more.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* FABs */}
        <FAB
          style={[
            styles.filterFab,
            {
              backgroundColor: theme.primary,
              bottom: insets.bottom + 16,
            },
          ]}
          icon="plus"
          label="Filter"
          onPress={() => {
            setShowFilterForm(true);
          }}
        />

        <FAB
          style={[
            styles.groupFab,
            {
              backgroundColor: theme.secondary,
              bottom: insets.bottom + 80,
            },
          ]}
          icon="folder-plus"
          label="Group"
          onPress={() => {
            setShowGroupForm(true);
          }}
        />
      </SafeAreaView>

      {/* Filter Form Modal */}
      {showFilterForm && (
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { backgroundColor: theme.surface }]}
          >
            <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
              {editingFilter ? 'Edit Filter' : 'Create Filter'}
            </Text>

            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.surface2, color: theme.onSurface },
              ]}
              placeholder="Enter text to filter (e.g., 'romance', 'completed')"
              placeholderTextColor={theme.onSurfaceVariant}
              value={filterPattern}
              onChangeText={setFilterPattern}
            />

            <View style={styles.optionRow}>
              <Text style={[styles.optionLabel, { color: theme.onSurface }]}>
                Filter Mode:
              </Text>
              <View style={styles.radioGroup}>
                {[
                  { value: 'contains', label: 'Include (Contains)' },
                  { value: 'not_contains', label: "Exclude (Doesn't Contain)" },
                ].map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.radioOption}
                    onPress={() =>
                      setFilterMode(option.value as 'contains' | 'not_contains')
                    }
                  >
                    <View
                      style={[
                        styles.radioButton,
                        { borderColor: theme.outline },
                        filterMode === option.value && {
                          backgroundColor: theme.primary,
                          borderColor: theme.primary,
                        },
                      ]}
                    >
                      {filterMode === option.value && (
                        <View
                          style={[
                            styles.radioInner,
                            { backgroundColor: theme.onPrimary },
                          ]}
                        />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.radioLabel,
                        {
                          color:
                            filterMode === option.value
                              ? theme.primary
                              : theme.onSurface,
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setFilterEnabled(!filterEnabled)}
            >
              <View
                style={[
                  styles.checkbox,
                  { borderColor: theme.outline },
                  filterEnabled && { backgroundColor: theme.primary },
                ]}
              >
                {filterEnabled && (
                  <MaterialCommunityIcons
                    name="check"
                    size={16}
                    color={theme.onPrimary}
                  />
                )}
              </View>
              <Text style={[styles.checkboxLabel, { color: theme.onSurface }]}>
                Enable filter (uncheck to disable temporarily)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setCaseSensitive(!caseSensitive)}
            >
              <View
                style={[
                  styles.checkbox,
                  { borderColor: theme.outline },
                  caseSensitive && { backgroundColor: theme.primary },
                ]}
              >
                {caseSensitive && (
                  <MaterialCommunityIcons
                    name="check"
                    size={16}
                    color={theme.onPrimary}
                  />
                )}
              </View>
              <Text style={[styles.checkboxLabel, { color: theme.onSurface }]}>
                Case sensitive
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <Button
                mode="outlined"
                onPress={() => {
                  setShowFilterForm(false);
                  setFilterPattern('');
                  setFilterMode('contains');
                  setCaseSensitive(false);
                  setFilterEnabled(true);
                  setEditingFilter(null);
                }}
                style={styles.modalButton}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={createFilter}
                style={styles.modalButton}
              >
                {editingFilter ? 'Update' : 'Create'}
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* Group Form Modal */}
      {showGroupForm && (
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { backgroundColor: theme.surface }]}
          >
            <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
              {editingGroup ? 'Edit Group' : 'Create Group'}
            </Text>

            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.surface2, color: theme.onSurface },
              ]}
              placeholder="Group name"
              placeholderTextColor={theme.onSurfaceVariant}
              value={groupName}
              onChangeText={setGroupName}
            />

            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.surface2, color: theme.onSurface },
              ]}
              placeholder="Description (optional)"
              placeholderTextColor={theme.onSurfaceVariant}
              value={groupDescription}
              onChangeText={setGroupDescription}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <Button
                mode="outlined"
                onPress={() => {
                  setShowGroupForm(false);
                  setGroupName('');
                  setGroupDescription('');
                }}
                style={styles.modalButton}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={createGroup}
                style={styles.modalButton}
              >
                {editingGroup ? 'Update' : 'Create'}
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* Group Management Modal */}
      {showGroupManager && managingFilter && (
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { backgroundColor: theme.surface }]}
          >
            <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
              Manage Groups for "{managingFilter.name}"
            </Text>

            <ScrollView style={styles.groupList}>
              {groups.map(group => {
                const isInGroup = group.filterIds.includes(managingFilter.id);
                return (
                  <TouchableOpacity
                    key={group.id}
                    style={[
                      styles.groupOption,
                      {
                        backgroundColor: isInGroup
                          ? theme.primaryContainer
                          : theme.surfaceVariant,
                      },
                    ]}
                    onPress={() => {
                      if (isInGroup) {
                        removeFilterFromGroup(managingFilter.id, group.id);
                      } else {
                        addFilterToGroup(managingFilter.id, group.id);
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.groupOptionText,
                        {
                          color: isInGroup
                            ? theme.onPrimaryContainer
                            : theme.onSurfaceVariant,
                        },
                      ]}
                    >
                      {group.name}
                    </Text>
                    <MaterialCommunityIcons
                      name={isInGroup ? 'check' : 'plus'}
                      size={20}
                      color={
                        isInGroup
                          ? theme.onPrimaryContainer
                          : theme.onSurfaceVariant
                      }
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                mode="outlined"
                onPress={() => {
                  setShowGroupManager(false);
                  setManagingFilter(null);
                }}
                style={styles.modalButton}
              >
                Done
              </Button>
            </View>
          </View>
        </View>
      )}
    </>
  );
};

interface FilterItemProps {
  filter: BrowseFilter;
  theme: any;
  isInGroup?: boolean;
  groupId?: string;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  onManageGroups?: () => void;
  onRemoveFromGroup?: (filterId: string, groupId: string) => void;
}

const FilterItem: React.FC<FilterItemProps> = ({
  filter,
  theme,
  isInGroup = false,
  groupId,
  onEdit,
  onDelete,
  onToggle,
  onManageGroups,
  onRemoveFromGroup,
}) => {
  const generateFilterName = (
    mode: 'contains' | 'not_contains',
    pattern: string,
  ) => {
    const operatorText = mode === 'contains' ? 'contains' : "doesn't contain";
    return `${operatorText} "${pattern}"`;
  };

  return (
    <View
      style={[
        styles.filterItem,
        { backgroundColor: theme.surfaceVariant },
        isInGroup && styles.groupedFilterItem,
      ]}
    >
      <View style={styles.filterHeader}>
        {/* Status indicator */}
        <View
          style={[
            styles.filterStatusIndicator,
            {
              backgroundColor: !filter.enabled
                ? theme.outline
                : filter.mode === 'contains'
                ? theme.primary
                : filter.mode === 'not_contains'
                ? theme.error
                : theme.outline,
            },
          ]}
        />
        <View style={styles.filterInfo}>
          <Text style={[styles.filterName, { color: theme.onSurface }]}>
            {filter.name}
          </Text>
          {filter.caseSensitive && (
            <Text
              style={[styles.filterPattern, { color: theme.onSurfaceVariant }]}
            >
              (Case Sensitive)
            </Text>
          )}
        </View>

        {/* On/Off Switch */}
        <View style={styles.filterToggleContainer}>
          <Text style={[styles.toggleLabel, { color: theme.onSurfaceVariant }]}>
            {filter.enabled ? 'On' : 'Off'}
          </Text>
          <Switch
            value={filter.enabled}
            onValueChange={enabled => {
              const storage = BrowseFilterStorage.getInstance();
              storage.updateFilter(filter.id, { enabled });
              storage.updateFilterState({ lastApplied: Date.now() });
              onToggle(enabled);
            }}
            trackColor={{ false: theme.outline, true: theme.primary }}
            thumbColor={
              filter.enabled ? theme.onPrimary : theme.onSurfaceVariant
            }
          />
        </View>
      </View>

      {/* Filter Mode Radio Buttons - only show if filter is enabled */}
      {filter.enabled && (
        <View style={styles.filterModeRow}>
          <Text style={[styles.modeLabel, { color: theme.onSurfaceVariant }]}>
            Mode:
          </Text>
          <View style={styles.modeRadioGroup}>
            {[
              {
                value: 'contains',
                label: 'Include',
                icon: '✓',
                color: 'primary',
              },
              {
                value: 'not_contains',
                label: 'Exclude',
                icon: '✗',
                color: 'error',
              },
            ].map(option => (
              <TouchableOpacity
                key={option.value}
                style={styles.modeRadioOption}
                onPress={() => {
                  const newMode = option.value as 'contains' | 'not_contains';

                  const storage = BrowseFilterStorage.getInstance();
                  storage.updateFilter(filter.id, {
                    mode: newMode,
                    name: generateFilterName(newMode, filter.pattern),
                  });
                  storage.updateFilterState({ lastApplied: Date.now() });

                  onToggle(filter.enabled);
                }}
              >
                <View
                  style={[
                    styles.radioButton,
                    { borderColor: theme.outline },
                    filter.mode === option.value && {
                      backgroundColor:
                        option.color === 'primary'
                          ? theme.primary
                          : theme.error,
                      borderColor:
                        option.color === 'primary'
                          ? theme.primary
                          : theme.error,
                    },
                  ]}
                >
                  {filter.mode === option.value && (
                    <Text
                      style={[
                        styles.radioIcon,
                        {
                          color:
                            option.color === 'primary'
                              ? theme.onPrimary
                              : theme.onError,
                        },
                      ]}
                    >
                      {option.icon}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.radioLabel,
                    {
                      color:
                        filter.mode === option.value
                          ? option.color === 'primary'
                            ? theme.primary
                            : theme.error
                          : theme.onSurfaceVariant,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={styles.filterActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: theme.primary }]}
          onPress={onEdit}
        >
          <MaterialCommunityIcons
            name="pencil"
            size={16}
            color={theme.onPrimary}
          />
        </TouchableOpacity>
        {!isInGroup && onManageGroups && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.secondary }]}
            onPress={onManageGroups}
          >
            <MaterialCommunityIcons
              name="folder-plus"
              size={16}
              color={theme.onSecondary}
            />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: theme.error }]}
          onPress={() => {
            if (isInGroup && groupId && onRemoveFromGroup) {
              onRemoveFromGroup(filter.id, groupId);
            } else {
              onDelete();
            }
          }}
        >
          <MaterialCommunityIcons
            name={isInGroup ? 'minus' : 'delete'}
            size={16}
            color={theme.onError}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  statsText: {
    fontSize: 14,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  groupHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  mixedModeIndicator: {
    fontSize: 12,
    fontStyle: 'italic',
    fontWeight: '400',
  },
  groupModeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
    gap: 8,
  },
  groupModeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupModeButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupModeIcon: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  groupModeLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  groupActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupActionButton: {
    padding: 4,
  },
  groupDescription: {
    fontSize: 14,
    marginLeft: 28,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  filterItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  groupedFilterItem: {
    marginLeft: 16,
    marginRight: 0,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  filterStatusIndicator: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: 12,
  },
  filterInfo: {
    flex: 1,
    marginRight: 12,
  },
  filterName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  filterPattern: {
    fontSize: 14,
  },
  filterActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  filterFab: {
    position: 'absolute',
    right: 16,
  },
  groupFab: {
    position: 'absolute',
    right: 16,
  },
  comingSoonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  comingSoonText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    margin: 20,
    padding: 20,
    borderRadius: 8,
    minWidth: 300,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  optionRow: {
    marginBottom: 16,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  modeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 4,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: {
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    minWidth: 80,
  },
  groupList: {
    maxHeight: 300,
    marginBottom: 16,
  },
  groupOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  groupOptionText: {
    fontSize: 16,
    flex: 1,
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  radioLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  radioIcon: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  filterModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 16,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 12,
  },
  modeRadioGroup: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-around',
  },
  modeRadioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  globalControls: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  globalControlsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  globalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  globalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  globalButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  explanationContainer: {
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  explanationTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  explanationText: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  boldText: {
    fontWeight: '600',
  },
});

export default LocalFiltersScreen;
