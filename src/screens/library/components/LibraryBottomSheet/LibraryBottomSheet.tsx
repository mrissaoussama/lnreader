import React, { RefObject, useCallback, useMemo, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import {
  SceneMap,
  TabBar,
  TabDescriptor,
  TabView,
} from 'react-native-tab-view';
import color from 'color';

import { useLibrarySettings, useTheme } from '@hooks/persisted';
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
import { BottomSheetView } from '@gorhom/bottom-sheet';
import BottomSheet from '@components/BottomSheet/BottomSheet';
import { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { FlashList } from '@shopify/flash-list';

interface LibraryBottomSheetProps {
  bottomSheetRef: RefObject<BottomSheetModalMethods | null>;
  style?: StyleProp<ViewStyle>;
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

const SecondRoute = () => {
  const theme = useTheme();
  const { sortOrder = LibrarySortOrder.DateAdded_DESC, setLibrarySettings } =
    useLibrarySettings();

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
            onPress={() =>
              setLibrarySettings({
                sortOrder: sortOrder === item.ASC ? item.DESC : item.ASC,
              })
            }
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
    displayMode = DisplayModes.Comfortable,
    setLibrarySettings,
  } = useLibrarySettings();

  return (
    <View style={styles.flex}>
      <Text style={[styles.sectionHeader, { color: theme.onSurfaceVariant }]}>
        {getString('libraryScreen.bottomSheet.display.badges')}
      </Text>
      <Checkbox
        label={getString('libraryScreen.bottomSheet.display.downloadBadges')}
        status={showDownloadBadges}
        onPress={() =>
          setLibrarySettings({
            showDownloadBadges: !showDownloadBadges,
          })
        }
        theme={theme}
      />
      <Checkbox
        label={getString('libraryScreen.bottomSheet.display.unreadBadges')}
        status={showUnreadBadges}
        onPress={() =>
          setLibrarySettings({
            showUnreadBadges: !showUnreadBadges,
          })
        }
        theme={theme}
      />
      <Checkbox
        label={getString('libraryScreen.bottomSheet.display.notesBadges')}
        status={showNotesBadges}
        onPress={() =>
          setLibrarySettings({
            showNotesBadges: !showNotesBadges,
          })
        }
        theme={theme}
      />
      <Checkbox
        label={getString('libraryScreen.bottomSheet.display.showNoOfItems')}
        status={showNumberOfNovels}
        onPress={() =>
          setLibrarySettings({
            showNumberOfNovels: !showNumberOfNovels,
          })
        }
        theme={theme}
      />
      <Text style={[styles.sectionHeader, { color: theme.onSurfaceVariant }]}>
        {getString('libraryScreen.bottomSheet.display.displayMode')}
      </Text>
      <FlashList
        estimatedItemSize={4}
        data={displayModesList}
        extraData={[displayMode]}
        renderItem={({ item }) => (
          <RadioButton
            label={item.label}
            status={displayMode === item.value}
            onPress={() => setLibrarySettings({ displayMode: item.value })}
            theme={theme}
          />
        )}
      />
    </View>
  );
};

const LibraryBottomSheet: React.FC<LibraryBottomSheetProps> = ({
  bottomSheetRef,
  style,
}) => {
  const theme = useTheme();

  const layout = useWindowDimensions();

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
    />
  );

  const [index, setIndex] = useState(0);
  const routes = useMemo(
    () => [
      { key: 'first', title: getString('common.filter') },
      { key: 'second', title: getString('common.sort') },
      { key: 'third', title: getString('common.display') },
    ],
    [],
  );

  const renderScene = SceneMap({
    first: FirstRoute,
    second: SecondRoute,
    third: ThirdRoute,
  });

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
    <BottomSheet bottomSheetRef={bottomSheetRef} snapPoints={[520]}>
      <BottomSheetView
        style={[
          styles.bottomSheetCtn,
          { backgroundColor: overlay(2, theme.surface) },
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
  tabView: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  flex: { flex: 1 },
});
