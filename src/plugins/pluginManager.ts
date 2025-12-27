import { reverse, uniqBy } from 'lodash-es';
import { newer } from '@utils/compareVersion';

// packages for plugins
import {
  store,
  Storage,
  LocalStorage,
  SessionStorage,
} from './helpers/storage';
import { load } from 'cheerio';
import dayjs from 'dayjs';
import { NovelStatus, Plugin, PluginItem } from './types';
import { FilterTypes } from './types/filterTypes';
import { isUrlAbsolute } from './helpers/isAbsoluteUrl';
import { downloadFile, fetchApi, fetchProto, fetchText } from './helpers/fetch';
import { defaultCover } from './helpers/constants';
import { encode, decode } from 'urlencode';
import { Parser } from 'htmlparser2';
import { getRepositoriesFromDb } from '@database/queries/RepositoryQueries';
import { showToast } from '@utils/showToast';
import { PLUGIN_STORAGE } from '@utils/Storages';
import NativeFile from '@specs/NativeFile';

const LOCAL_PLUGIN_ID = 'local';

const packages: Record<string, any> = {
  'htmlparser2': { Parser },
  'cheerio': { load },
  'dayjs': dayjs,
  'urlencode': { encode, decode },
  '@libs/novelStatus': { NovelStatus },
  '@libs/fetch': { fetchApi, fetchText, fetchProto },
  '@libs/isAbsoluteUrl': { isUrlAbsolute },
  '@libs/filterInputs': { FilterTypes },
  '@libs/defaultCover': { defaultCover },
};

const initPlugin = (pluginId: string, rawCode: string) => {
  try {
    const _require = (packageName: string) => {
      if (packageName === '@libs/storage') {
        return {
          storage: new Storage(pluginId),
          localStorage: new LocalStorage(pluginId),
          sessionStorage: new SessionStorage(pluginId),
        };
      }
      return packages[packageName];
    };
    /* eslint no-new-func: "off", curly: "error" */
    const plugin: Plugin = Function(
      'require',
      'module',
      `const exports = module.exports = {}; 
      ${rawCode}; 
      return exports.default`,
    )(_require, {});
    return plugin;
  } catch {
    return undefined;
  }
};

const plugins: Record<string, Plugin | undefined> = {};

class NativePlugin implements Plugin {
  id: string;
  name: string;
  site: string;
  lang: string;
  version: string;
  url: string;
  iconUrl: string;
  isNative: boolean;
  pluginSettings: any;

  constructor(pluginItem: PluginItem) {
    this.id = pluginItem.id;
    this.name = pluginItem.name;
    this.site = pluginItem.site;
    this.lang = pluginItem.lang;
    this.version = pluginItem.version;
    this.url = pluginItem.url;
    this.iconUrl = pluginItem.iconUrl;
    this.isNative = true;
    this.pluginSettings = {};
  }

  async popularNovels(pageNo: number, options?: Plugin.PopularNovelsOptions<any>) {
    return TaskModule.popularNovels(this.id, pageNo, JSON.stringify(options));
  }

  async searchNovels(searchTerm: string, pageNo: number) {
    return TaskModule.searchNovels(this.id, searchTerm, pageNo);
  }

  async parseNovel(novelPath: string) {
    return TaskModule.parseNovel(this.id, novelPath);
  }

  async parseChapter(chapterPath: string) {
    return TaskModule.parseChapter(this.id, chapterPath);
  }

  resolveUrl(path: string, isNovel?: boolean) {
    return this.site + (path.startsWith('/') ? path : '/' + path);
  }
}

const registerNativePlugin = (pluginItem: PluginItem) => {
  plugins[pluginItem.id] = new NativePlugin(pluginItem);
};

const installPlugin = async (
  _plugin: PluginItem,
): Promise<Plugin | undefined> => {
  const rawCode = await fetch(_plugin.url, {
    headers: { 'pragma': 'no-cache', 'cache-control': 'no-cache' },
  }).then(res => res.text());
  const plugin = initPlugin(_plugin.id, rawCode);
  if (!plugin) {
    return undefined;
  }
  let currentPlugin = plugins[plugin.id];
  if (!currentPlugin || newer(plugin.version, currentPlugin.version)) {
    plugins[plugin.id] = plugin;
    currentPlugin = plugin;

    // save plugin code;
    const pluginDir = `${PLUGIN_STORAGE}/${plugin.id}`;
    NativeFile.mkdir(pluginDir);
    const pluginPath = pluginDir + '/index.js';
    const customJSPath = pluginDir + '/custom.js';
    const customCSSPath = pluginDir + '/custom.css';
    if (_plugin.customJS) {
      await downloadFile(_plugin.customJS, customJSPath);
    } else if (NativeFile.exists(customJSPath)) {
      NativeFile.unlink(customJSPath);
    }
    if (_plugin.customCSS) {
      await downloadFile(_plugin.customCSS, customCSSPath);
    } else if (NativeFile.exists(customCSSPath)) {
      NativeFile.unlink(customCSSPath);
    }
    NativeFile.writeFile(pluginPath, rawCode);
  }
  return currentPlugin;
};

const uninstallPlugin = async (_plugin: PluginItem) => {
  plugins[_plugin.id] = undefined;
  store.getAllKeys().forEach(key => {
    if (key.startsWith(_plugin.id)) {
      store.delete(key);
    }
  });
  const pluginFilePath = `${PLUGIN_STORAGE}/${_plugin.id}/index.js`;
  if (NativeFile.exists(pluginFilePath)) {
    NativeFile.unlink(pluginFilePath);
  }
};

const updatePlugin = async (plugin: PluginItem) => {
  return installPlugin(plugin);
};

const fetchPlugins = async (): Promise<PluginItem[]> => {
  const allPlugins: PluginItem[] = [];
  const allRepositories = getRepositoriesFromDb();

  const repoPluginsRes = await Promise.allSettled(
    allRepositories.map(({ url }) => fetch(url).then(res => res.json())),
  );

  repoPluginsRes.forEach(repoPlugins => {
    if (repoPlugins.status === 'fulfilled') {
      allPlugins.push(...repoPlugins.value);
    } else {
      showToast(repoPlugins.reason.toString());
    }
  });

  return uniqBy(reverse(allPlugins), 'id');
};

const getPlugin = (pluginId: string) => {
  if (pluginId === LOCAL_PLUGIN_ID) {
    return undefined;
  }

  if (!plugins[pluginId]) {
    const filePath = `${PLUGIN_STORAGE}/${pluginId}/index.js`;
    try {
      const code = NativeFile.readFile(filePath);
      const plugin = initPlugin(pluginId, code);
      plugins[pluginId] = plugin;
    } catch {
      // file doesnt exist
      return undefined;
    }
  }
  return plugins[pluginId];
};

import { NativeModules } from 'react-native';

const { TaskModule } = NativeModules;

const popularNovels = async (
  pluginId: string,
  pageNo: number,
  options: Plugin.PopularNovelsOptions<any>,
) => {
  const plugin = getPlugin(pluginId);
  if (plugin) {
    return plugin.popularNovels(pageNo, options);
  }
  // Check if native
  try {
    const nativePlugins = await TaskModule.getPlugins();
    const nativePlugin = nativePlugins.find((p: any) => p.id === pluginId);
    if (nativePlugin) {
      const novels = await TaskModule.popularNovels(pluginId, pageNo, JSON.stringify(options));
      return novels;
    }
  } catch (e) {
    console.error('Native popularNovels error', e);
  }
  return [];
};

const searchNovels = async (
  pluginId: string,
  searchTerm: string,
  pageNo: number,
) => {
  const plugin = getPlugin(pluginId);
  if (plugin) {
    return plugin.searchNovels(searchTerm, pageNo);
  }
  // Check if native
  try {
    const nativePlugins = await TaskModule.getPlugins();
    const nativePlugin = nativePlugins.find((p: any) => p.id === pluginId);
    if (nativePlugin) {
      const novels = await TaskModule.searchNovels(pluginId, searchTerm, pageNo);
      return novels;
    }
  } catch (e) {
    console.error('Native searchNovels error', e);
  }
  return [];
};

const parseNovel = async (pluginId: string, novelPath: string) => {
  const plugin = getPlugin(pluginId);
  if (plugin) {
    return plugin.parseNovel(novelPath);
  }
  // Check if native
  try {
    const nativePlugins = await TaskModule.getPlugins();
    const nativePlugin = nativePlugins.find((p: any) => p.id === pluginId);
    if (nativePlugin) {
      const novel = await TaskModule.parseNovel(pluginId, novelPath);
      return novel;
    }
  } catch (e) {
    console.error('Native parseNovel error', e);
  }
  throw new Error('Plugin not found');
};

const parseChapter = async (pluginId: string, chapterPath: string) => {
  const plugin = getPlugin(pluginId);
  if (plugin) {
    return plugin.parseChapter(chapterPath);
  }
  // Check if native
  try {
    const nativePlugins = await TaskModule.getPlugins();
    const nativePlugin = nativePlugins.find((p: any) => p.id === pluginId);
    if (nativePlugin) {
      const content = await TaskModule.parseChapter(pluginId, chapterPath);
      return content;
    }
  } catch (e) {
    console.error('Native parseChapter error', e);
  }
  throw new Error('Plugin not found');
};

const fetchImage = async (pluginId: string, url: string) => {
  const plugin = getPlugin(pluginId);
  if (plugin) {
    return plugin.fetchImage ? plugin.fetchImage(url) : undefined;
  }
  return undefined;
};

const resolveUrl = (pluginId: string, path: string, isNovel?: boolean) => {
  const plugin = getPlugin(pluginId);
  if (plugin && plugin.resolveUrl) {
    return plugin.resolveUrl(path, isNovel);
  }
  return undefined;
};

export {
  getPlugin,
  installPlugin,
  uninstallPlugin,
  updatePlugin,
  fetchPlugins,
  popularNovels,
  searchNovels,
  parseNovel,
  parseChapter,
  fetchImage,
  resolveUrl,
  registerNativePlugin,
  LOCAL_PLUGIN_ID,
  plugins,
};
