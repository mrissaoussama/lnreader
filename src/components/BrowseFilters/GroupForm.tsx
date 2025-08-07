import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { Switch } from 'react-native-gesture-handler';
import { BrowseFilter, BrowseFilterGroup } from '../../types/browseFilters';
import { BrowseFilterStorage } from '@services/browseFilterStorage';
import { getString } from '@strings/translations';
import { commonStyles } from './styles';

interface GroupFormProps {
  group: BrowseFilterGroup | null;
  filters: BrowseFilter[];
  theme: any;
  storage: BrowseFilterStorage;
  onSave: (group: Partial<BrowseFilterGroup>) => void;
  onCancel: () => void;
}

export const GroupForm: React.FC<GroupFormProps> = ({
  group,
  filters,
  theme,
  storage,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(group?.name || '');
  const [description, setDescription] = useState(group?.description || '');
  const [enabled, setEnabled] = useState(group?.enabled ?? true);
  const [selectedFilterIds, setSelectedFilterIds] = useState<string[]>(
    group?.filterIds || [],
  );

  useEffect(() => {
    if (group) {
      setName(group.name);
      setDescription(group.description || '');
      setEnabled(group.enabled);
      setSelectedFilterIds(group.filterIds);
    }
  }, [group]);

  // Get ungrouped filters (not in any group) plus filters in current group
  const availableFilters = React.useMemo(() => {
    const allGroups = storage.getGroups();
    const otherGroupFilterIds = new Set(
      allGroups.filter(g => g.id !== group?.id).flatMap(g => g.filterIds),
    );

    return filters.filter(
      f => !otherGroupFilterIds.has(f.id) || selectedFilterIds.includes(f.id),
    );
  }, [filters, storage, group, selectedFilterIds]);

  const handleFilterToggle = (filterId: string, selected: boolean) => {
    if (selected) {
      setSelectedFilterIds(prev => [...prev, filterId]);
    } else {
      setSelectedFilterIds(prev => prev.filter(id => id !== filterId));
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Error', getString('browseFilters.groupNameRequired'));
      return;
    }

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      enabled,
      filterIds: selectedFilterIds,
    });
  };

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View
        style={[commonStyles.container, { backgroundColor: theme.surface }]}
      >
        <View
          style={[commonStyles.header, { borderBottomColor: theme.outline }]}
        >
          <TouchableOpacity onPress={onCancel}>
            <Text style={[commonStyles.headerButton, { color: theme.primary }]}>
              {getString('browseFilters.cancel')}
            </Text>
          </TouchableOpacity>
          <Text style={[commonStyles.title, { color: theme.onSurface }]}>
            {group
              ? getString('browseFilters.editGroup')
              : getString('browseFilters.newGroup')}
          </Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={[commonStyles.headerButton, { color: theme.primary }]}>
              {getString('browseFilters.save')}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.onSurface }]}>
              Group Name
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.surfaceVariant,
                  color: theme.onSurface,
                  borderColor: theme.outline,
                },
              ]}
              value={name}
              onChangeText={setName}
              placeholder="Enter group name"
              placeholderTextColor={theme.onSurfaceVariant}
              maxLength={50}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.onSurface }]}>
              Description (Optional)
            </Text>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                {
                  backgroundColor: theme.surfaceVariant,
                  color: theme.onSurface,
                  borderColor: theme.outline,
                },
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe what this group is for"
              placeholderTextColor={theme.onSurfaceVariant}
              maxLength={200}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={[styles.field, styles.switchField]}>
            <View style={styles.switchRow}>
              <View>
                <Text style={[styles.label, { color: theme.onSurface }]}>
                  Enable Group
                </Text>
                <Text
                  style={[styles.fieldHint, { color: theme.onSurfaceVariant }]}
                >
                  All filters in this group will be enabled/disabled together
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: theme.outline, true: theme.primary }}
                thumbColor={enabled ? theme.onPrimary : theme.onSurfaceVariant}
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.onSurface }]}>
              Filters ({selectedFilterIds.length} selected)
            </Text>
            <Text style={[styles.fieldHint, { color: theme.onSurfaceVariant }]}>
              Select filters to include in this group
            </Text>

            {availableFilters.length === 0 ? (
              <View style={styles.noFilters}>
                <Text
                  style={[
                    styles.noFiltersText,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  No filters available. Create some filters first.
                </Text>
              </View>
            ) : (
              <View style={styles.filterList}>
                {availableFilters.map(filter => (
                  <FilterSelectionItem
                    key={filter.id}
                    filter={filter}
                    selected={selectedFilterIds.includes(filter.id)}
                    theme={theme}
                    onToggle={selected =>
                      handleFilterToggle(filter.id, selected)
                    }
                  />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

interface FilterSelectionItemProps {
  filter: BrowseFilter;
  selected: boolean;
  theme: any;
  onToggle: (selected: boolean) => void;
}

const FilterSelectionItem: React.FC<FilterSelectionItemProps> = ({
  filter,
  selected,
  theme,
  onToggle,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.filterItem,
        {
          backgroundColor: selected
            ? theme.primaryContainer
            : theme.surfaceVariant,
          borderColor: selected ? theme.primary : theme.outline,
        },
      ]}
      onPress={() => onToggle(!selected)}
    >
      <View style={styles.filterItemContent}>
        <Text
          style={[
            styles.filterName,
            {
              color: selected ? theme.onPrimaryContainer : theme.onSurface,
            },
          ]}
        >
          {filter.name}
        </Text>
        <Text
          style={[
            styles.filterPattern,
            {
              color: selected
                ? theme.onPrimaryContainer
                : theme.onSurfaceVariant,
            },
          ]}
        >
          {filter.mode === 'contains' ? 'Contains' : 'Excludes'}: "
          {filter.pattern}"{filter.caseSensitive && ' (Case Sensitive)'}
        </Text>
        <Text
          style={[
            styles.filterStatus,
            {
              color: filter.enabled
                ? selected
                  ? theme.onPrimaryContainer
                  : theme.primary
                : selected
                ? theme.onPrimaryContainer
                : theme.onSurfaceVariant,
            },
          ]}
        >
          {filter.enabled ? 'Enabled' : 'Disabled'}
        </Text>
      </View>
      <View
        style={[
          styles.checkmark,
          {
            backgroundColor: selected ? theme.primary : theme.surface,
            borderColor: selected ? theme.primary : theme.outline,
          },
        ]}
      >
        {selected && (
          <Text style={[styles.checkmarkText, { color: theme.onPrimary }]}>
            ✓
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  headerButton: {
    fontSize: 16,
    fontWeight: '500',
    minWidth: 60,
    textAlign: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  form: {
    flex: 1,
    padding: 16,
  },
  field: {
    marginBottom: 24,
  },
  switchField: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
  },
  fieldHint: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noFilters: {
    padding: 24,
    alignItems: 'center',
  },
  noFiltersText: {
    fontSize: 14,
    textAlign: 'center',
  },
  filterList: {
    marginTop: 8,
  },
  filterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  filterItemContent: {
    flex: 1,
  },
  filterName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  filterPattern: {
    fontSize: 14,
    marginBottom: 2,
  },
  filterStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  checkmarkText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
