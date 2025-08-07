import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
} from 'react-native';
import { Switch } from 'react-native-gesture-handler';
import { BrowseFilter } from '../../types/browseFilters';
import { getString } from '@strings/translations';
import { commonStyles } from './styles';

interface FilterFormProps {
  filter: BrowseFilter | null;
  theme: any;
  onSave: (filter: Partial<BrowseFilter>) => void;
  onCancel: () => void;
}

export const FilterForm: React.FC<FilterFormProps> = ({
  filter,
  theme,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(filter?.name || '');
  const [pattern, setPattern] = useState(filter?.pattern || '');
  const [mode, setMode] = useState<'contains' | 'not_contains'>(
    filter?.mode || 'contains',
  );
  const [enabled, setEnabled] = useState(filter?.enabled ?? true);
  const [caseSensitive, setCaseSensitive] = useState(
    filter?.caseSensitive ?? false,
  );

  useEffect(() => {
    if (filter) {
      setName(filter.name);
      setPattern(filter.pattern);
      setMode(filter.mode);
      setEnabled(filter.enabled);
      setCaseSensitive(filter.caseSensitive);
    }
  }, [filter]);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert(
        getString('common.error'),
        getString('browseFilters.filterNameRequired'),
      );
      return;
    }

    if (!pattern.trim()) {
      Alert.alert(
        getString('common.error'),
        getString('browseFilters.filterPatternRequired'),
      );
      return;
    }

    onSave({
      name: name.trim(),
      pattern: pattern.trim(),
      mode,
      enabled,
      caseSensitive,
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
            {filter
              ? getString('browseFilters.editFilter')
              : getString('browseFilters.newFilter')}
          </Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={[commonStyles.headerButton, { color: theme.primary }]}>
              {getString('browseFilters.save')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <View style={commonStyles.field}>
            <Text style={[commonStyles.label, { color: theme.onSurface }]}>
              {getString('browseFilters.filterName')}
            </Text>
            <TextInput
              style={[
                commonStyles.input,
                {
                  backgroundColor: theme.surfaceVariant,
                  color: theme.onSurface,
                  borderColor: theme.outline,
                },
              ]}
              value={name}
              onChangeText={setName}
              placeholder={getString('browseFilters.enterFilterName')}
              placeholderTextColor={theme.onSurfaceVariant}
              maxLength={50}
            />
          </View>

          <View style={commonStyles.field}>
            <Text style={[commonStyles.label, { color: theme.onSurface }]}>
              {getString('browseFilters.searchPattern')}
            </Text>
            <TextInput
              style={[
                commonStyles.input,
                {
                  backgroundColor: theme.surfaceVariant,
                  color: theme.onSurface,
                  borderColor: theme.outline,
                },
              ]}
              value={pattern}
              onChangeText={setPattern}
              placeholder={getString('browseFilters.enterSearchPattern')}
              placeholderTextColor={theme.onSurfaceVariant}
              maxLength={100}
            />
            <Text
              style={[
                commonStyles.fieldHint,
                { color: theme.onSurfaceVariant },
              ]}
            >
              {getString('browseFilters.filterWillSearchIn')}
            </Text>
          </View>

          <View style={commonStyles.field}>
            <Text style={[commonStyles.label, { color: theme.onSurface }]}>
              {getString('browseFilters.filterMode')}
            </Text>
            <View style={styles.modeContainer}>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  {
                    backgroundColor:
                      mode === 'contains'
                        ? theme.primary
                        : theme.surfaceVariant,
                    borderColor: theme.outline,
                  },
                ]}
                onPress={() => setMode('contains')}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    {
                      color:
                        mode === 'contains' ? theme.onPrimary : theme.onSurface,
                    },
                  ]}
                >
                  {getString('browseFilters.includeContains')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  {
                    backgroundColor:
                      mode === 'not_contains'
                        ? theme.primary
                        : theme.surfaceVariant,
                    borderColor: theme.outline,
                  },
                ]}
                onPress={() => setMode('not_contains')}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    {
                      color:
                        mode === 'not_contains'
                          ? theme.onPrimary
                          : theme.onSurface,
                    },
                  ]}
                >
                  {getString('browseFilters.excludeDoesntContain')}
                </Text>
              </TouchableOpacity>
            </View>
            <Text
              style={[
                commonStyles.fieldHint,
                { color: theme.onSurfaceVariant },
              ]}
            >
              {getString('browseFilters.includeVsExclude')}
            </Text>
          </View>

          <View style={[commonStyles.field, commonStyles.switchField]}>
            <View style={commonStyles.rowSpaceBetween}>
              <View>
                <Text style={[commonStyles.label, { color: theme.onSurface }]}>
                  {getString('browseFilters.caseSensitive')}
                </Text>
                <Text
                  style={[
                    commonStyles.fieldHint,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  {getString('browseFilters.caseSensitiveDesc')}
                </Text>
              </View>
              <Switch
                value={caseSensitive}
                onValueChange={setCaseSensitive}
                trackColor={{ false: theme.outline, true: theme.primary }}
                thumbColor={
                  caseSensitive ? theme.onPrimary : theme.onSurfaceVariant
                }
              />
            </View>
          </View>

          <View style={[commonStyles.field, commonStyles.switchField]}>
            <View style={commonStyles.rowSpaceBetween}>
              <View>
                <Text style={[commonStyles.label, { color: theme.onSurface }]}>
                  {getString('browseFilters.enableFilter')}
                </Text>
                <Text
                  style={[
                    commonStyles.fieldHint,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  {getString('browseFilters.filterActiveDesc')}
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
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  form: {
    flex: 1,
    padding: 16,
  },
  modeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
