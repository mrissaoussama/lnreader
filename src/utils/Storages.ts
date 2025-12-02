import NativeFile from '@specs/NativeFile';
import { StorageManager } from './StorageManager';
import { MMKVStorage } from './mmkv/mmkv';

// Legacy exports - now use StorageManager for dynamic paths
export const ROOT_STORAGE = NativeFile.getConstants().ExternalDirectoryPath;

// Dynamic storage paths that respect user settings via functions
export const getPluginStorage = (): string => StorageManager.getPluginStorage();
export const getNovelStorage = (): string => StorageManager.getNovelStorage();
export const getNovelPath = (novelId: number, pluginId?: string): string =>
  StorageManager.getNovelPath(novelId, pluginId);

// Live bindings that update when storage config changes
export let PLUGIN_STORAGE = getPluginStorage();
export let NOVEL_STORAGE = getNovelStorage();

// Allow manual refresh if needed
export const refreshStorages = () => {
  PLUGIN_STORAGE = getPluginStorage();
  NOVEL_STORAGE = getNovelStorage();
};

// Update storages when MMKV keys change
const STORAGE_LOCATION_KEY = 'CUSTOM_STORAGE_LOCATION';
const USE_CUSTOM_STORAGE_KEY = 'USE_CUSTOM_STORAGE';
MMKVStorage.addOnValueChangedListener(key => {
  if (key === STORAGE_LOCATION_KEY || key === USE_CUSTOM_STORAGE_KEY) {
    refreshStorages();
  }
});

// Helper function to get the current novel storage path (respects settings)
export const getCurrentNovelStorage = (): string =>
  StorageManager.getNovelStorage();
