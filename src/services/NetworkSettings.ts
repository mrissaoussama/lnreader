import { MMKVStorage } from '@utils/mmkv/mmkv';

export const NetworkSettings = {
  get maxConcurrency() {
    return MMKVStorage.getNumber('DOWNLOAD_MAX_SIMULTANEOUS') || 3;
  },
  get maxPerPlugin() {
    return MMKVStorage.getNumber('DOWNLOAD_MAX_PER_PLUGIN') || 1;
  },
  get delaySamePlugin() {
    return MMKVStorage.getNumber('DOWNLOAD_DELAY_SAME_PLUGIN_MS') || 1000;
  },
  get downloadNewChapters() {
    const appSettings = MMKVStorage.getString('APP_SETTINGS');
    if (appSettings) {
      const parsed = JSON.parse(appSettings);
      return parsed.downloadNewChapters || false;
    }
    return false;
  },
  get refreshNovelMetadata() {
    const appSettings = MMKVStorage.getString('APP_SETTINGS');
    if (appSettings) {
      const parsed = JSON.parse(appSettings);
      return parsed.refreshNovelMetadata || false;
    }
    return false;
  },
  get resumeOnWifiOnly() {
    return MMKVStorage.getBoolean('RESUME_ON_WIFI_ONLY') || false;
  },
};
