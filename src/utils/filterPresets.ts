import { MMKVStorage } from '@utils/mmkv/mmkv';
import { FilterToValues, Filters } from '@plugins/types/filterTypes';

const FILTER_PRESETS_PREFIX = 'filter_presets_';

export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterToValues<Filters>;
  createdAt: string;
}

const getPresetsKey = (pluginId: string): string => {
  return `${FILTER_PRESETS_PREFIX}${pluginId}`;
};

export const getFilterPresets = (pluginId: string): FilterPreset[] => {
  try {
    const presets = MMKVStorage.getString(getPresetsKey(pluginId));
    return presets ? JSON.parse(presets) : [];
  } catch (error) {
    return [];
  }
};

export const saveFilterPreset = (
  pluginId: string,
  name: string,
  filters: FilterToValues<Filters>,
): string => {
  try {
    const presets = getFilterPresets(pluginId);
    const id = Date.now().toString();
    const newPreset: FilterPreset = {
      id,
      name,
      filters,
      createdAt: new Date().toISOString(),
    };

    const updatedPresets = [...presets, newPreset];
    MMKVStorage.set(getPresetsKey(pluginId), JSON.stringify(updatedPresets));

    return id;
  } catch (error) {
    throw error;
  }
};

export const deleteFilterPreset = (
  pluginId: string,
  presetId: string,
): void => {
  try {
    const presets = getFilterPresets(pluginId);
    const updatedPresets = presets.filter(preset => preset.id !== presetId);
    MMKVStorage.set(getPresetsKey(pluginId), JSON.stringify(updatedPresets));
  } catch (error) {
    throw error;
  }
};

export const updateFilterPreset = (
  pluginId: string,
  presetId: string,
  name: string,
  filters: FilterToValues<Filters>,
): void => {
  try {
    const presets = getFilterPresets(pluginId);
    const updatedPresets = presets.map(preset =>
      preset.id === presetId ? { ...preset, name, filters } : preset,
    );
    MMKVStorage.set(getPresetsKey(pluginId), JSON.stringify(updatedPresets));
  } catch (error) {
    throw error;
  }
};

export const getFilterPreset = (
  pluginId: string,
  presetId: string,
): FilterPreset | null => {
  try {
    const presets = getFilterPresets(pluginId);
    return presets.find(preset => preset.id === presetId) || null;
  } catch (error) {
    return null;
  }
};
