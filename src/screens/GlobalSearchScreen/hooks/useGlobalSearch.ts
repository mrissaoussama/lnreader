import { useCallback, useEffect, useRef, useState } from 'react';

import { NovelItem, PluginItem } from '@plugins/types';
import { getPlugin } from '@plugins/pluginManager';
import { useBrowseSettings, usePlugins } from '@hooks/persisted';
import { useFocusEffect } from '@react-navigation/native';

interface Props {
  defaultSearchText?: string;
  pinnedOnly?: boolean;
}

export interface GlobalSearchResult {
  isLoading: boolean;
  plugin: PluginItem;
  novels: NovelItem[];
  error?: string | null;
}

export const useGlobalSearch = ({ defaultSearchText, pinnedOnly }: Props) => {
  const isMounted = useRef(true); //if user closes the search screen, cancel the search
  const isFocused = useRef(true); //if the user opens a sub-screen (e.g. novel screen), pause the search
  const lastSearch = useRef(''); //if the user changes search, cancel running searches
  useEffect(
    () => () => {
      isMounted.current = false;
    },
    [],
  );
  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;

      return () => (isFocused.current = false);
    }, []),
  );

  const { filteredInstalledPlugins, pinnedInstalledPlugins } = usePlugins();

  const [searchResults, setSearchResults] = useState<GlobalSearchResult[]>([]);
  const [progress, setProgress] = useState(0);

  const { globalSearchConcurrency = 1 } = useBrowseSettings();

  const globalSearch = useCallback(
    (searchText: string, pinnedOnlyArg?: boolean) => {
      const key = `${pinnedOnlyArg ? 'p' : 'a'}::${searchText}`;
      if (lastSearch.current === key) {
        return;
      }
      lastSearch.current = key;
      const pluginsToSearch = (
        pinnedOnlyArg ? pinnedInstalledPlugins : filteredInstalledPlugins
      ) as PluginItem[];
      const defaultResult: GlobalSearchResult[] = pluginsToSearch.map(
        plugin => ({
          isLoading: true,
          plugin,
          novels: [],
          error: null,
        }),
      );

      setSearchResults(defaultResult.sort(novelResultSorter));
      setProgress(0);

      let running = 0;

      async function searchInPlugin(_plugin: PluginItem) {
        try {
          const plugin = getPlugin(_plugin.id);
          if (!plugin) {
            throw new Error(`Unknown plugin: ${_plugin.id}`);
          }
          const res = await plugin.searchNovels(searchText, 1);
          if (lastSearch.current !== key) {
            return;
          }
          setSearchResults(prevState =>
            prevState
              .map(prevResult =>
                prevResult.plugin.id === plugin.id
                  ? { ...prevResult, novels: res, isLoading: false }
                  : { ...prevResult },
              )
              .sort(novelResultSorter),
          );
        } catch (error: any) {
          const errorMessage = error?.message || String(error);
          if (lastSearch.current !== key) {
            return;
          }
          setSearchResults(prevState =>
            prevState
              .map(prevResult =>
                prevResult.plugin.id === _plugin.id
                  ? {
                      ...prevResult,
                      novels: [],
                      isLoading: false,
                      error: errorMessage,
                    }
                  : { ...prevResult },
              )
              .sort(novelResultSorter),
          );
        }
      }

      //Sort so we load the plugins results in the same order as they show on the list
      const filteredSortedInstalledPlugins = [...pluginsToSearch].sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      (async () => {
        if (globalSearchConcurrency === 0) {
          const promises = filteredSortedInstalledPlugins.map(async _plugin => {
            if (!isMounted.current || lastSearch.current !== key) {
              return;
            }
            await searchInPlugin(_plugin);
            if (lastSearch.current === key) {
              setProgress(prevState => prevState + 1 / pluginsToSearch.length);
            }
          });
          await Promise.all(promises);
        } else if (globalSearchConcurrency > 1) {
          for (const _plugin of filteredSortedInstalledPlugins) {
            while (running >= globalSearchConcurrency || !isFocused.current) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (!isMounted.current || lastSearch.current !== key) {
              break;
            }
            running++;
            searchInPlugin(_plugin)
              .then(() => {
                running--;
                if (lastSearch.current === key) {
                  setProgress(
                    prevState => prevState + 1 / pluginsToSearch.length,
                  );
                }
              })
              .catch(() => {
                running--;
              });
          }
        } else {
          for (const _plugin of filteredSortedInstalledPlugins) {
            if (!isMounted.current || lastSearch.current !== key) {
              break;
            }
            while (!isFocused.current) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            await searchInPlugin(_plugin);
            if (lastSearch.current === key) {
              setProgress(prevState => prevState + 1 / pluginsToSearch.length);
            }
          }
        }
      })();
    },
    [filteredInstalledPlugins, pinnedInstalledPlugins, globalSearchConcurrency],
  );

  useEffect(() => {
    if (defaultSearchText) {
      globalSearch(defaultSearchText, pinnedOnly);
    }
  }, [defaultSearchText, pinnedOnly, globalSearch]);

  return { searchResults, globalSearch, progress };
};

function novelResultSorter(
  { novels: a, plugin: { name: aName } }: GlobalSearchResult,
  { novels: b, plugin: { name: bName } }: GlobalSearchResult,
) {
  if (!a.length && !b.length) {
    return aName.localeCompare(bName);
  }
  if (!a.length) {
    return 1;
  }
  if (!b.length) {
    return -1;
  }

  return aName.localeCompare(bName);
}
