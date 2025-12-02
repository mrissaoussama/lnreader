import React, { RefObject, useCallback, useMemo, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { TabBar, TabDescriptor, TabView } from 'react-native-tab-view';
import color from 'color';

import {
  useLibrarySettings,
  useTheme,
  usePlugins,
  useAppSettings,
} from '@hooks/persisted';
import { getString } from '@strings/translations';
import { Checkbox, SortItem } from '@components/Checkbox/Checkbox';
import {
  DisplayModes,
  displayModesList,
  LibraryFilter,
  libraryFilterList,
  LibrarySortOrder,
  librarySortOrderList,
} from '@screens/library/constants/constants';
import { RadioButton } from '@components/RadioButton/RadioButton';
import { overlay } from 'react-native-paper';
import { BottomSheetView, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import BottomSheet from '@components/BottomSheet/BottomSheet';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { FlashList } from '@shopify/flash-list';
import { Button } from '@components';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMMKVString } from 'react-native-mmkv';

interface LibraryBottomSheetProps {
  bottomSheetRef: RefObject<BottomSheetModalMethods | null>;
  style?: StyleProp<ViewStyle>;
  categoryId?: number;
}

const FirstRoute = () => {
  const theme = useTheme();
  const {
    filter,
    setLibrarySettings,
    downloadedOnlyMode = false,
  } = useLibrarySettings();

  return (
    <View style={styles.flex}>
      <FlashList
        estimatedItemSize={4}
        extraData={[filter]}
        data={libraryFilterList}
        renderItem={({ item }) => (
          <Checkbox
            label={item.label}
            theme={theme}
            status={filter === item.filter}
            onPress={() =>
              setLibrarySettings({
                filter: filter === item.filter ? undefined : item.filter,
              })
            }
            disabled={
              item.filter === LibraryFilter.Downloaded && downloadedOnlyMode
            }
          />
        )}
      />
    </View>
  );
};

const SecondRoute = ({ categoryId }: { categoryId?: number }) => {
  const theme = useTheme();
  const { sortOrder: globalSortOrder, setLibrarySettings } =
    useLibrarySettings();

  const [categorySortOrder, setCategorySortOrder] = useMMKVString(
    categoryId ? `CATEGORY_SORT_${categoryId}` : undefined,
  );

  const sortOrder = (categorySortOrder as LibrarySortOrder) || globalSortOrder;

  return (
    <View style={styles.flex}>
      <FlashList
        data={librarySortOrderList}
        extraData={[sortOrder]}
        estimatedItemSize={5}
        renderItem={({ item }) => (
          <SortItem
            label={item.label}
            theme={theme}
            status={
              sortOrder === item.ASC
                ? 'asc'
                : sortOrder === item.DESC
                ? 'desc'
                : undefined
            }
            onPress={() => {
              const newSort = sortOrder === item.ASC ? item.DESC : item.ASC;
              if (categoryId) {
                setCategorySortOrder(newSort);
              } else {
                setLibrarySettings({
                  sortOrder: newSort,
                });
              }
            }}
          />
        )}
      />
    </View>
  );
};

const ThirdRoute = () => {
  const theme = useTheme();
  const {
    showDownloadBadges = true,
    showNumberOfNovels = false,
    showUnreadBadges = true,
    showNotesBadges = true,
    showCovers = true,
    displayMode = DisplayModes.Comfortable,
    setLibrarySettings,
  } = useLibrarySettings();

  const { novelMatching, setAppSettings } = useAppSettings();
  const showMatchingBadges = novelMatching?.showBadges !== false;

  return (
    <View style={styles.flex}>
      <FlashList
        estimatedItemSize={7}
        data={[
          { type: 'header', key: 'badges-header' },
          {
            type: 'checkbox',
            key: 'downloadBadges',
            label: getString(
              'libraryScreen.bottomSheet.display.downloadBadges',
            ),
            value: showDownloadBadges,
          },
          {
            type: 'checkbox',
            key: 'unreadBadges',
            label: getString('libraryScreen.bottomSheet.display.unreadBadges'),
            value: showUnreadBadges,
          },
          {
            type: 'checkbox',
            key: 'notesBadges',
            label: getString('libraryScreen.bottomSheet.display.notesBadges'),
            value: showNotesBadges,
          },
          {
            type: 'checkbox',
            key: 'matchingBadges',
            label: 'Show Matching Badges',
            value: showMatchingBadges,
          },
          {
            type: 'checkbox',
            key: 'showNumberOfNovels',
            label: getString('libraryScreen.bottomSheet.display.showNoOfItems'),
            value: showNumberOfNovels,
          },
          {
            type: 'checkbox',
            key: 'showCovers',
            label: 'Show covers',
            value: showCovers,
          },
          { type: 'header', key: 'display-header' },
          ...displayModesList.map(item => ({
            type: 'radio',
            key: item.value,
            ...item,
          })),
        ]}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <Text
                style={[
                  styles.sectionHeader,
                  { color: theme.onSurfaceVariant },
                ]}
              >
                {item.key === 'badges-header'
                  ? getString('libraryScreen.bottomSheet.display.badges')
                  : getString('libraryScreen.bottomSheet.display.displayMode')}
              </Text>
            );
          }
          if (item.type === 'checkbox') {
            return (
              <Checkbox
                label={item.label}
                status={item.value}
                onPress={() => {
                  if (item.key === 'downloadBadges') {
                    setLibrarySettings({
                      showDownloadBadges: !showDownloadBadges,
                    });
                  } else if (item.key === 'unreadBadges') {
                    setLibrarySettings({
                      showUnreadBadges: !showUnreadBadges,
                    });
                  } else if (item.key === 'notesBadges') {
                    setLibrarySettings({
                      showNotesBadges: !showNotesBadges,
                    });
                  } else if (item.key === 'matchingBadges') {
                    setAppSettings({
                      novelMatching: {
                        ...novelMatching,
                        showBadges: !showMatchingBadges,
                      },
                    });
                  } else if (item.key === 'showNumberOfNovels') {
                    setLibrarySettings({
                      showNumberOfNovels: !showNumberOfNovels,
                    });
                  } else if (item.key === 'showCovers') {
                    setLibrarySettings({
                      showCovers: !showCovers,
                    });
                  }
                }}
                theme={theme}
              />
            );
          }
          return (
            <RadioButton
              label={item.label}
              status={displayMode === item.value}
              onPress={() => setLibrarySettings({ displayMode: item.value })}
              theme={theme}
            />
          );
        }}
      />
    </View>
  );
};

const FourthRoute = () => {
  const theme = useTheme();
  const { pinnedPluginIds, filteredInstalledPlugins } = usePlugins();
  const [hiddenPlugins, setHiddenPlugins] = useState<Set<string>>(() => {
    try {
      return new Set(
        JSON.parse(MMKVStorage.getString('LIBRARY_HIDDEN_PLUGINS') || '[]'),
      );
    } catch {
      return new Set();
    }
  });

  // Separate pinned and non-pinned plugins
  const pinnedPlugins = useMemo(() => {
    return filteredInstalledPlugins
      .filter(plg => (pinnedPluginIds || []).includes(plg.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredInstalledPlugins, pinnedPluginIds]);

  const nonPinnedPlugins = useMemo(() => {
    return filteredInstalledPlugins
      .filter(plg => !(pinnedPluginIds || []).includes(plg.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredInstalledPlugins, pinnedPluginIds]);

  const togglePlugin = useCallback((pluginId: string) => {
    setHiddenPlugins(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pluginId)) {
        newSet.delete(pluginId);
      } else {
        newSet.add(pluginId);
      }
      MMKVStorage.set(
        'LIBRARY_HIDDEN_PLUGINS',
        JSON.stringify(Array.from(newSet)),
      );

      // Trigger library refresh by incrementing a change key
      const currentKey =
        MMKVStorage.getNumber('LIBRARY_PLUGIN_FILTER_KEY') || 0;
      MMKVStorage.set('LIBRARY_PLUGIN_FILTER_KEY', currentKey + 1);

      return newSet;
    });
  }, []);

  const checkAll = useCallback(() => {
    setHiddenPlugins(new Set());
    MMKVStorage.set('LIBRARY_HIDDEN_PLUGINS', '[]');

    // Trigger library refresh
    const currentKey = MMKVStorage.getNumber('LIBRARY_PLUGIN_FILTER_KEY') || 0;
    MMKVStorage.set('LIBRARY_PLUGIN_FILTER_KEY', currentKey + 1);
  }, []);

  const uncheckAll = useCallback(() => {
    const allIds = new Set([
      ...pinnedPlugins.map(p => p.id),
      ...nonPinnedPlugins.map(p => p.id),
    ]);
    setHiddenPlugins(allIds);
    MMKVStorage.set(
      'LIBRARY_HIDDEN_PLUGINS',
      JSON.stringify(Array.from(allIds)),
    );

    // Trigger library refresh
    const currentKey = MMKVStorage.getNumber('LIBRARY_PLUGIN_FILTER_KEY') || 0;
    MMKVStorage.set('LIBRARY_PLUGIN_FILTER_KEY', currentKey + 1);
  }, [pinnedPlugins, nonPinnedPlugins]);

  return (
    <View style={styles.flex}>
      <View style={styles.pluginFilterHeader}>
        <Button
          title="Check All"
          onPress={checkAll}
          style={styles.pluginButton}
        />
        <Button
          title="Uncheck All"
          onPress={uncheckAll}
          style={styles.pluginButton}
        />
      </View>
      <BottomSheetScrollView
        contentContainerStyle={styles.pluginScrollContent}
        showsVerticalScrollIndicator={true}
      >
        {pinnedPlugins.length > 0 && (
          <>
            <Text
              style={[
                styles.pluginSectionHeader,
                { color: theme.onSurfaceVariant },
              ]}
            >
              Pinned
            </Text>
            {pinnedPlugins.map(item => (
              <Checkbox
                key={item.id}
                label={item.name}
                theme={theme}
                status={!hiddenPlugins.has(item.id)}
                onPress={() => togglePlugin(item.id)}
              />
            ))}
          </>
        )}
        {nonPinnedPlugins.length > 0 && (
          <>
            {pinnedPlugins.length > 0 && (
              <Text
                style={[
                  styles.pluginSectionHeader,
                  { color: theme.onSurfaceVariant },
                ]}
              >
                Installed
              </Text>
            )}
            {nonPinnedPlugins.map(item => (
              <Checkbox
                key={item.id}
                label={item.name}
                theme={theme}
                status={!hiddenPlugins.has(item.id)}
                onPress={() => togglePlugin(item.id)}
              />
            ))}
          </>
        )}
      </BottomSheetScrollView>
    </View>
  );
};

const LibraryBottomSheet: React.FC<LibraryBottomSheetProps> = ({
  bottomSheetRef,
  style,
  categoryId,
}) => {
  const theme = useTheme();
  const layout = useWindowDimensions();
  const { bottom: bottomInset } = useSafeAreaInsets();

  // Calculate snap points based on screen height to allow more drag space
  const snapPoints = useMemo(() => {
    const maxHeight = layout.height * 0.85; // 85% of screen height
    return [Math.min(620 + bottomInset, maxHeight)];
  }, [layout.height, bottomInset]);

  const renderTabBar = (props: any) => (
    <TabBar
      {...props}
      indicatorStyle={{ backgroundColor: theme.primary }}
      style={[
        {
          backgroundColor: overlay(2, theme.surface),
          borderBottomColor: color(theme.isDark ? '#FFFFFF' : '#000000')
            .alpha(0.12)
            .string(),
        },
        styles.tabBar,
        style,
      ]}
      inactiveColor={theme.onSurfaceVariant}
      activeColor={theme.primary}
      pressColor={color(theme.primary).alpha(0.12).string()}
      scrollEnabled
      tabStyle={styles.tabStyle}
    />
  );

  const [index, setIndex] = useState(0);
  const routes = useMemo(
    () => [
      { key: 'first', title: getString('common.filter') },
      { key: 'second', title: getString('common.sort') },
      { key: 'third', title: getString('common.display') },
      { key: 'fourth', title: 'Plugins' },
    ],
    [],
  );

  const renderScene = useCallback(
    ({ route }: { route: { key: string } }) => {
      switch (route.key) {
        case 'first':
          return <FirstRoute />;
        case 'second':
          return <SecondRoute categoryId={categoryId} />;
        case 'third':
          return <ThirdRoute />;
        case 'fourth':
          return <FourthRoute />;
        default:
          return null;
      }
    },
    [categoryId],
  );

  const renderCommonOptions = useCallback(
    ({ route, color: col }: { route: any; color: string }) => (
      <Text style={{ color: col }}>{route.title}</Text>
    ),
    [],
  );

  const commonOptions: TabDescriptor<{
    key: string;
    title: string;
  }> = useMemo(() => {
    return {
      label: renderCommonOptions,
    };
  }, [renderCommonOptions]);

  return (
    <BottomSheet bottomSheetRef={bottomSheetRef} snapPoints={snapPoints}>
      <BottomSheetView
        style={[
          styles.bottomSheetCtn,
          {
            backgroundColor: overlay(2, theme.surface),
            paddingBottom: bottomInset,
          },
        ]}
      >
        <TabView
          commonOptions={commonOptions}
          navigationState={{ index, routes }}
          renderTabBar={renderTabBar}
          renderScene={renderScene}
          onIndexChange={setIndex}
          initialLayout={{ width: layout.width }}
          style={styles.tabView}
        />
      </BottomSheetView>
    </BottomSheet>
  );
};

export default LibraryBottomSheet;

const styles = StyleSheet.create({
  bottomSheetCtn: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    flex: 1,
  },
  sectionHeader: {
    padding: 16,
    paddingBottom: 8,
  },
  tabBar: {
    borderBottomWidth: 1,
    elevation: 0,
  },
  tabStyle: {
    width: 'auto',
    minWidth: 80,
  },
  tabView: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  flex: { flex: 1 },
  pluginFilterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 8,
    gap: 8,
  },
  pluginButton: {
    flex: 1,
  },
  pluginScrollContent: {
    paddingBottom: 20,
  },
  pluginSectionHeader: {
    padding: 16,
    paddingBottom: 8,
    fontWeight: 'bold',
  },
});
