import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import BottomSheet from '@components/BottomSheet/BottomSheet';
import {
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';

import { useTheme } from '@hooks/persisted';
import {
  FilterTypes,
  FilterToValues,
  Filters,
} from '@plugins/types/filterTypes';
import { Button } from '@components/index';
import { Checkbox } from '@components/Checkbox/Checkbox';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useBoolean } from '@hooks';
import { Menu, TextInput, overlay } from 'react-native-paper';
import { getValueFor } from './filterUtils';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Switch from '@components/Switch/Switch';
import {
  getFilterPresets,
  saveFilterPreset,
  deleteFilterPreset,
  FilterPreset,
} from '@utils/filterPresets';
import SavePresetModal from './SavePresetModal';
import ManagePresetsModal from './ManagePresetsModal';

const insertOrRemoveIntoArray = (array: string[], val: string): string[] =>
  array.indexOf(val) > -1 ? array.filter(ele => ele !== val) : [...array, val];

type SelectedFilters = FilterToValues<Filters>;

interface FilterItemProps {
  theme: ThemeColors;
  filter: Filters[string];
  filterKey: keyof Filters;
  selectedFilters: SelectedFilters;
  setSelectedFilters: React.Dispatch<React.SetStateAction<SelectedFilters>>;
}

const FilterItem: React.FC<FilterItemProps> = ({
  theme,
  filter,
  filterKey,
  selectedFilters,
  setSelectedFilters,
}) => {
  const {
    value: isVisible,
    toggle: toggleCard,
    setFalse: closeCard,
  } = useBoolean();
  const { width: screenWidth } = useWindowDimensions();
  if (filter.type === FilterTypes.TextInput) {
    const value = getValueFor<(typeof filter)['type']>(
      filter,
      selectedFilters[filterKey],
    );
    return (
      <View style={styles.textContainer}>
        <TextInput
          style={[styles.flex, { width: screenWidth - 48 }]}
          mode="outlined"
          label={
            <Text
              style={[
                styles.label,
                {
                  color: theme.onSurface,
                  backgroundColor: overlay(2, theme.surface),
                },
              ]}
            >
              {` ${filter.label} `}
            </Text>
          }
          defaultValue={value}
          theme={{ colors: { background: 'transparent' } }}
          outlineColor={theme.onSurface}
          textColor={theme.onSurface}
          onChangeText={text =>
            setSelectedFilters(prevState => ({
              ...prevState,
              [filterKey]: { value: text, type: FilterTypes.TextInput },
            }))
          }
        />
      </View>
    );
  }
  if (filter.type === FilterTypes.Picker) {
    const value = getValueFor<(typeof filter)['type']>(
      filter,
      selectedFilters[filterKey],
    );
    const label =
      filter.options.find(option => option.value === value)?.label ||
      'whatever';
    return (
      <View style={styles.pickerContainer}>
        <Menu
          style={styles.flex}
          visible={isVisible}
          contentStyle={{ backgroundColor: theme.surfaceVariant }}
          anchor={
            <Pressable
              style={[styles.flex, { width: screenWidth - 48 }]}
              onPress={toggleCard}
            >
              <TextInput
                mode="outlined"
                label={
                  <Text
                    style={[
                      styles.label,
                      {
                        color: isVisible ? theme.primary : theme.onSurface,
                        backgroundColor: overlay(2, theme.surface),
                      },
                    ]}
                  >
                    {` ${filter.label} `}
                  </Text>
                }
                value={label}
                editable={false}
                theme={{ colors: { background: 'transparent' } }}
                outlineColor={isVisible ? theme.primary : theme.onSurface}
                textColor={isVisible ? theme.primary : theme.onSurface}
              />
            </Pressable>
          }
          onDismiss={closeCard}
        >
          {filter.options.map(val => {
            return (
              <Menu.Item
                key={val.label}
                title={val.label}
                titleStyle={{ color: theme.onSurfaceVariant }}
                onPress={() => {
                  closeCard();
                  setSelectedFilters(prevFilters => ({
                    ...prevFilters,
                    [filterKey]: { value: val.value, type: FilterTypes.Picker },
                  }));
                }}
              />
            );
          })}
        </Menu>
      </View>
    );
  }
  if (filter.type === FilterTypes.CheckboxGroup) {
    const value = getValueFor<(typeof filter)['type']>(
      filter,
      selectedFilters[filterKey],
    );
    return (
      <View>
        <Pressable
          style={styles.checkboxHeader}
          onPress={toggleCard}
          android_ripple={{ color: theme.rippleColor }}
        >
          <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
            {filter.label}
          </Text>
          <MaterialCommunityIcons
            name={isVisible ? 'chevron-up' : 'chevron-down'}
            color={theme.onSurface}
            size={24}
          />
        </Pressable>
        {isVisible
          ? filter.options.map(val => {
              return (
                <Checkbox
                  key={val.label}
                  label={val.label}
                  theme={theme}
                  status={value.includes(val.value)}
                  onPress={() =>
                    setSelectedFilters(prevFilters => ({
                      ...prevFilters,
                      [filterKey]: {
                        type: FilterTypes.CheckboxGroup,
                        value: insertOrRemoveIntoArray(value, val.value),
                      },
                    }))
                  }
                />
              );
            })
          : null}
      </View>
    );
  }
  if (filter.type === FilterTypes.Switch) {
    const value = getValueFor<(typeof filter)['type']>(
      filter,
      selectedFilters[filterKey],
    );
    return (
      <Pressable
        android_ripple={{ color: theme.rippleColor }}
        style={styles.container}
        onPress={() => {
          setSelectedFilters(prevState => ({
            ...prevState,
            [filterKey]: { value: !value, type: FilterTypes.Switch },
          }));
        }}
      >
        <View style={styles.switchContainer}>
          <View style={styles.switchLabelContainer}>
            <Text style={[{ color: theme.onSurface }, styles.switchLabel]}>
              {filter.label}
            </Text>
          </View>
          <Switch
            value={value}
            onValueChange={() => {
              setSelectedFilters(prevState => ({
                ...prevState,
                [filterKey]: { value: !value, type: FilterTypes.Switch },
              }));
            }}
          />
        </View>
      </Pressable>
    );
  }
  if (filter.type === FilterTypes.ExcludableCheckboxGroup) {
    const value = getValueFor<(typeof filter)['type']>(
      filter,
      selectedFilters[filterKey],
    );
    return (
      <View>
        <Pressable
          style={styles.checkboxHeader}
          onPress={toggleCard}
          android_ripple={{ color: theme.rippleColor }}
        >
          <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
            {filter.label}
          </Text>
          <MaterialCommunityIcons
            name={isVisible ? 'chevron-up' : 'chevron-down'}
            color={theme.onSurface}
            size={24}
          />
        </Pressable>
        {isVisible
          ? filter.options.map(val => {
              return (
                <Checkbox
                  key={val.label}
                  label={val.label}
                  theme={theme}
                  status={
                    value.include?.includes(val.value)
                      ? true
                      : value.exclude?.includes(val.value)
                      ? 'indeterminate'
                      : false
                  }
                  onPress={() => {
                    if (value.exclude?.includes(val.value)) {
                      setSelectedFilters(prev => {
                        return {
                          ...prev,
                          [filterKey]: {
                            type: FilterTypes.ExcludableCheckboxGroup,
                            value: {
                              include: [...(value.include || [])],
                              exclude: [
                                ...(value.exclude?.filter(
                                  f => f !== val.value,
                                ) || []),
                              ],
                            },
                          },
                        };
                      });
                    } else if (value.include?.includes(val.value)) {
                      setSelectedFilters(prev => {
                        return {
                          ...prev,
                          [filterKey]: {
                            type: FilterTypes.ExcludableCheckboxGroup,
                            value: {
                              include: [
                                ...(value.include?.filter(
                                  f => f !== val.value,
                                ) || []),
                              ],
                              exclude: [...(value.exclude || []), val.value],
                            },
                          },
                        };
                      });
                    } else {
                      setSelectedFilters(prev => {
                        return {
                          ...prev,
                          [filterKey]: {
                            type: FilterTypes.ExcludableCheckboxGroup,
                            value: {
                              include: [...(value.include || []), val.value],
                              exclude: value.exclude,
                            },
                          },
                        };
                      });
                    }
                  }}
                />
              );
            })
          : null}
      </View>
    );
  }
  return <></>;
};

interface BottomSheetProps {
  filterSheetRef: React.RefObject<BottomSheetModal | null>;
  filters: Filters;
  setFilters: (filters?: SelectedFilters) => void;
  clearFilters: (filters: Filters) => void;
  pluginId: string;
}

const FilterBottomSheet: React.FC<BottomSheetProps> = ({
  filters,
  filterSheetRef,
  clearFilters,
  setFilters,
  pluginId,
}) => {
  const theme = useTheme();
  const { bottom } = useSafeAreaInsets();
  const [selectedFilters, setSelectedFilters] =
    useState<SelectedFilters>(filters);

  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);

  React.useEffect(() => {
    const loadedPresets = getFilterPresets(pluginId);
    setPresets(loadedPresets);
  }, [pluginId]);

  const handleSavePreset = (name: string) => {
    try {
      saveFilterPreset(pluginId, name, selectedFilters);
      const updatedPresets = getFilterPresets(pluginId);
      setPresets(updatedPresets);
    } catch (error) {}
  };

  const handleLoadPreset = (preset: FilterPreset) => {
    setSelectedFilters(preset.filters);
  };

  const handleDeletePreset = (presetId: string) => {
    try {
      deleteFilterPreset(pluginId, presetId);
      const updatedPresets = getFilterPresets(pluginId);
      setPresets(updatedPresets);
    } catch (error) {}
  };

  return (
    <>
      <BottomSheet
        bottomSheetRef={filterSheetRef}
        snapPoints={[400, 600]}
        bottomInset={bottom}
        backgroundStyle={styles.transparent}
        style={[
          styles.container,
          { backgroundColor: overlay(2, theme.surface) },
        ]}
      >
        <BottomSheetView
          style={[styles.buttonContainer, { borderBottomColor: theme.outline }]}
        >
          <View style={styles.presetButtonsContainer}>
            <Button
              icon="content-save"
              mode="outlined"
              compact
              onPress={() => setShowSaveModal(true)}
            >
              {getString('common.save')}
            </Button>
            <Button
              icon="folder-open"
              mode="outlined"
              compact
              onPress={() => setShowManageModal(true)}
            >
              Load
            </Button>
          </View>
          <View style={styles.actionButtonsContainer}>
            <Button
              title={getString('common.reset')}
              onPress={() => {
                setSelectedFilters(filters);
                clearFilters(filters);
              }}
            />
            <Button
              title={getString('common.filter')}
              textColor={theme.onPrimary}
              onPress={() => {
                setFilters(selectedFilters);
                filterSheetRef?.current?.close();
              }}
              mode="contained"
            />
          </View>
        </BottomSheetView>
        <BottomSheetFlatList
          data={filters && Object.entries(filters)}
          keyExtractor={item => 'filter' + item[0]}
          renderItem={({ item }) => (
            <FilterItem
              theme={theme}
              filter={item[1]}
              filterKey={item[0]}
              selectedFilters={selectedFilters}
              setSelectedFilters={setSelectedFilters}
            />
          )}
        />
      </BottomSheet>

      <SavePresetModal
        visible={showSaveModal}
        onDismiss={() => setShowSaveModal(false)}
        onSave={handleSavePreset}
        theme={theme}
      />

      <ManagePresetsModal
        visible={showManageModal}
        onDismiss={() => setShowManageModal(false)}
        presets={presets}
        onLoadPreset={handleLoadPreset}
        onDeletePreset={handleDeletePreset}
        theme={theme}
      />
    </>
  );
};

export default FilterBottomSheet;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  transparent: {
    backgroundColor: 'transparent',
  },
  buttonContainer: {
    borderBottomWidth: 1,
    paddingBottom: 8,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  presetButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
    gap: 8,
  },
  actionButtonsContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  checkboxHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  container: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  picker: {
    paddingHorizontal: 24,
    width: 200,
  },
  pickerContainer: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
    paddingHorizontal: 24,
  },
  switchContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
    paddingHorizontal: 24,
  },
  switchLabel: {
    fontSize: 16,
  },
  switchLabelContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
    paddingHorizontal: 24,
  },
});
