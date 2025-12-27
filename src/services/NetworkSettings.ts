import { MMKVStorage } from '@utils/mmkv/mmkv';
import { NetworkSettings as NetworkSettingsType, initialNetworkSettings } from '@hooks/persisted/useSettings';

const getNetworkSettings = (): NetworkSettingsType => {
  const settingsStr = MMKVStorage.getString('NETWORK_SETTINGS');
  if (settingsStr) {
    try {
      return { ...initialNetworkSettings, ...JSON.parse(settingsStr) };
    } catch {
      return initialNetworkSettings;
    }
  }
  return initialNetworkSettings;
};

export const NetworkSettings = {
  get maxConcurrency() {
    return getNetworkSettings().maxGlobalConcurrentTasks;
  },
  get maxPerPlugin() {
    return getNetworkSettings().maxConcurrentTasks;
  },
  get delaySamePlugin() {
    return getNetworkSettings().taskDelay;
  },
  get randomDelayRange() {
    return getNetworkSettings().randomDelayRange;
  },
  get pluginSettings() {
    return getNetworkSettings().pluginSettings;
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
