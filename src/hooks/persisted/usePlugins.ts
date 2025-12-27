import { locale } from 'expo-localization';
import { languagesMapping } from '@utils/constants/languages';
import { orderBy } from 'lodash-es';
import { useMMKVObject } from 'react-native-mmkv';
import { PluginItem } from '@plugins/types';
import {
  fetchPlugins,
  installPlugin as _install,
  uninstallPlugin as _uninstall,
  updatePlugin as _update,
  registerNativePlugin,
} from '@plugins/pluginManager';
import { newer } from '@utils/compareVersion';
import { MMKVStorage, getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import { useCallback, useEffect, useMemo } from 'react';
import { getString } from '@strings/translations';

import { NativeModules } from 'react-native';
const { TaskModule } = NativeModules;

export const AVAILABLE_PLUGINS = 'AVAILABLE_PLUGINS';
export const INSTALLED_PLUGINS = 'INSTALL_PLUGINS';
export const LANGUAGES_FILTER = 'LANGUAGES_FILTER';
export const LAST_USED_PLUGIN = 'LAST_USED_PLUGIN';
export const FILTERED_AVAILABLE_PLUGINS = 'FILTERED_AVAILABLE_PLUGINS';
export const FILTERED_INSTALLED_PLUGINS = 'FILTERED_INSTALLED_PLUGINS';
export const PINNED_PLUGINS = 'PINNED_PLUGINS';

const defaultLang = languagesMapping[locale.split('-')[0]] || 'English';

export default function usePlugins() {
  const [lastUsedPlugin, setLastUsedPlugin] =
    useMMKVObject<PluginItem>(LAST_USED_PLUGIN);
  const [languagesFilter = [defaultLang], setLanguagesFilter] =
    useMMKVObject<string[]>(LANGUAGES_FILTER);
  const [filteredAvailablePlugins = [], setFilteredAvailablePlugins] =
    useMMKVObject<PluginItem[]>(FILTERED_AVAILABLE_PLUGINS);
  const [filteredInstalledPlugins = [], setFilteredInstalledPlugins] =
    useMMKVObject<PluginItem[]>(FILTERED_INSTALLED_PLUGINS);
  const [pinnedPluginIds = [], setPinnedPluginIds] =
    useMMKVObject<string[]>(PINNED_PLUGINS);

  // Register native plugins on mount
  useEffect(() => {
    const installedPlugins =
      getMMKVObject<PluginItem[]>(INSTALLED_PLUGINS) || [];
    installedPlugins.forEach(p => {
      if (p.isNative) {
        registerNativePlugin(p);
      }
    });
  }, []);

  /**
   * @param filter
   * We cant use the languagesFilter directly because it is updated only after component's lifecycle end.
   * And toggleLanguagFilter triggers filterPlugins before lifecycle end.
   */
  const filterPlugins = useCallback(
    (filter: string[]) => {
      const installedPlugins =
        getMMKVObject<PluginItem[]>(INSTALLED_PLUGINS) || [];
      const availablePlugins =
        getMMKVObject<PluginItem[]>(AVAILABLE_PLUGINS) || [];
      setFilteredInstalledPlugins(
        installedPlugins.filter(plg => filter.includes(plg.lang)),
      );
      setFilteredAvailablePlugins(
        orderBy(
          availablePlugins
            .filter(
              avalilablePlugin =>
                !installedPlugins.some(
                  installedPlugin => installedPlugin.id === avalilablePlugin.id,
                ),
            )
            .filter(plg => filter.includes(plg.lang)),
          'name',
        ),
      );
    },
    [setFilteredAvailablePlugins, setFilteredInstalledPlugins],
  );

  const refreshPlugins = useCallback(() => {
    let installedPlugins =
      getMMKVObject<PluginItem[]>(INSTALLED_PLUGINS) || [];
    return fetchPlugins().then(async fetchedPlugins => {
      try {
        const nativePlugins = await TaskModule.getPlugins();

        // Build set of native plugin IDs currently on the system
        const systemNativePluginIds = new Set<string>();
        if (nativePlugins && Array.isArray(nativePlugins)) {
          nativePlugins.forEach((np: any) => {
            if (np && np.id) {
              systemNativePluginIds.add(np.id);
            }
          });
        }

        // Remove native plugins that are no longer on the system
        const beforeRemoval = installedPlugins.length;
        installedPlugins = installedPlugins.filter(p => {
          // Keep non-native plugins
          if (!p.isNative) return true;
          // For native plugins, only keep if still on system
          const keepPlugin = systemNativePluginIds.has(p.id);
          if (!keepPlugin) {
            console.log('[usePlugins] Removing stale native plugin:', p.id, p.name);
          }
          return keepPlugin;
        });
        if (installedPlugins.length !== beforeRemoval) {
          console.log('[usePlugins] Removed', beforeRemoval - installedPlugins.length, 'stale native plugins');
        }

        // Add/update native plugins from the system
        if (nativePlugins && Array.isArray(nativePlugins)) {
          nativePlugins.forEach((np: any) => {
            if (!np || !np.id) return;

            const exists = installedPlugins.find(p => p.id === np.id);
            const lang = languagesMapping[np.language] || np.language || 'English';

            // Register native plugin in pluginManager
            registerNativePlugin({
              id: np.id,
              name: np.name,
              site: np.site,
              lang: lang,
              version: String(np.version),
              url: '',
              iconUrl: np.iconUrl || '',
              isNative: true,
              packageName: np.packageName,
            });

            if (!exists) {
              installedPlugins.push({
                id: np.id,
                name: np.name,
                site: np.site,
                lang: lang,
                version: String(np.version),
                url: '',
                iconUrl: np.iconUrl || '',
                isNative: true,
                packageName: np.packageName,
              });
              console.log('[usePlugins] Added new native plugin:', np.id, np.name);
            } else if (
              !exists.isNative ||
              exists.lang !== lang ||
              exists.packageName !== np.packageName ||
              exists.iconUrl !== np.iconUrl
            ) {
              exists.isNative = true;
              exists.lang = lang;
              exists.packageName = np.packageName;
              exists.name = np.name;
              exists.site = np.site;
              if (np.iconUrl) {
                exists.iconUrl = np.iconUrl;
              }
            }
          });
        }
      } catch (e) {
        console.error('[usePlugins] Error fetching native plugins:', e);
      }

      const availablePlugins = fetchedPlugins.filter(plg => {
        const finded = installedPlugins.find(v => v.id === plg.id);
        if (finded) {
          if (newer(plg.version, finded.version)) {
            finded.hasUpdate = true;
            finded.iconUrl = plg.iconUrl;
            finded.url = plg.url;
            if (finded.id === lastUsedPlugin?.id) {
              setLastUsedPlugin(finded);
            }
          }
          return false;
        }
        return true;
      });
      setMMKVObject(INSTALLED_PLUGINS, installedPlugins);
      setMMKVObject(AVAILABLE_PLUGINS, availablePlugins);
      filterPlugins(languagesFilter);
    });
  }, [filterPlugins, languagesFilter, lastUsedPlugin?.id, setLastUsedPlugin]);

  const toggleLanguageFilter = (lang: string) => {
    const newFilter = languagesFilter.includes(lang)
      ? languagesFilter.filter(l => l !== lang)
      : [lang, ...languagesFilter];
    setLanguagesFilter(newFilter);
    filterPlugins(newFilter);
  };

  /**
   * Variable scope naming
   * plugin: parameter
   * _plg: value returned by pluginManager functions
   * plg: parameter in JS class method callback (.map, .reducer, ...)
   */

  const installPlugin = (plugin: PluginItem) => {
    return _install(plugin).then(_plg => {
      if (_plg) {
        const installedPlugins =
          getMMKVObject<PluginItem[]>(INSTALLED_PLUGINS) || [];
        const actualPlugin: PluginItem = {
          ...plugin,
          version: _plg.version,
          hasSettings: !!_plg.pluginSettings,
        };
        // safe
        if (!installedPlugins.some(plg => plg.id === plugin.id)) {
          setMMKVObject(INSTALLED_PLUGINS, [...installedPlugins, actualPlugin]);
        }
        filterPlugins(languagesFilter);
      } else {
        throw new Error(
          getString('browseScreen.installFailed', { name: plugin.name }),
        );
      }
    });
  };

  const uninstallPlugin = (plugin: PluginItem) => {
    if (lastUsedPlugin?.id === plugin.id) {
      MMKVStorage.delete(LAST_USED_PLUGIN);
    }
    const installedPlugins =
      getMMKVObject<PluginItem[]>(INSTALLED_PLUGINS) || [];
    setMMKVObject(
      INSTALLED_PLUGINS,
      installedPlugins.filter(plg => plg.id !== plugin.id),
    );
    filterPlugins(languagesFilter);
    if (plugin.isNative && plugin.packageName) {
      return TaskModule.uninstallPlugin(plugin.packageName).then(() => {});
    }
    return _uninstall(plugin).then(() => {});
  };

  const updatePlugin = (plugin: PluginItem) => {
    return _update(plugin).then(_plg => {
      if (plugin.version === _plg?.version && !__DEV__) {
        throw new Error('No update found!');
      }
      if (_plg) {
        const installedPlugins =
          getMMKVObject<PluginItem[]>(INSTALLED_PLUGINS) || [];
        setMMKVObject<PluginItem[]>(
          INSTALLED_PLUGINS,
          installedPlugins.map(plg => {
            if (plugin.id !== plg.id) {
              return plg;
            }
            const newPlugin: PluginItem = {
              ...plugin,
              site: _plg.site,
              name: _plg.name,
              version: _plg.version,
              hasUpdate: false,
            };
            if (newPlugin.id === lastUsedPlugin?.id) {
              setLastUsedPlugin(newPlugin);
            }
            return newPlugin;
          }),
        );
        filterPlugins(languagesFilter);
        return _plg.version;
      } else {
        throw Error(getString('browseScreen.updateFailed'));
      }
    });
  };

  const isPinned = useCallback(
    (id: string) => pinnedPluginIds?.includes(id) ?? false,
    [pinnedPluginIds],
  );

  const togglePin = useCallback(
    (id: string) => {
      const current = pinnedPluginIds || [];
      const next = current.includes(id)
        ? current.filter(x => x !== id)
        : [id, ...current];
      setPinnedPluginIds(next);
    },
    [pinnedPluginIds, setPinnedPluginIds],
  );

  const pinnedInstalledPlugins = useMemo(
    () =>
      (filteredInstalledPlugins || []).filter(plg =>
        (pinnedPluginIds || []).includes(plg.id),
      ),
    [filteredInstalledPlugins, pinnedPluginIds],
  );

  return {
    filteredAvailablePlugins,
    filteredInstalledPlugins,
    lastUsedPlugin,
    languagesFilter,
    setLastUsedPlugin,
    refreshPlugins,
    toggleLanguageFilter,
    installPlugin,
    uninstallPlugin,
    updatePlugin,
    pinnedPluginIds: pinnedPluginIds || [],
    isPinned,
    togglePin,
    pinnedInstalledPlugins,
  };
}
