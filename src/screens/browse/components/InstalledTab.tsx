import React, { useCallback, useMemo, useState, memo, useEffect } from 'react';
import {
  Pressable,
  Image,
  View,
  Text,
  StyleSheet,
  InteractionManager,
  ViewStyle,
  StyleProp,
  TextStyle,
} from 'react-native';
import { useBrowseSettings, usePlugins } from '@hooks/persisted';
import { PluginItem } from '@plugins/types';
import { coverPlaceholderColor } from '@theme/colors';
import { ThemeColors } from '@theme/types';
import { getString } from '@strings/translations';
import { BrowseScreenProps } from '@navigators/types';
import { Button, IconButtonV2 } from '@components';
import TrackerCard from '../discover/TrackerCard';
import { showToast } from '@utils/showToast';
import { Portal, Text as PaperText } from 'react-native-paper';
import SourceSettingsModal from './Modals/SourceSettings';
import { useBoolean, UseBooleanReturnType } from '@hooks';
import { getPlugin } from '@plugins/pluginManager';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { getLocaleLanguageName } from '@utils/constants/languages';

interface InstalledTabProps {
  navigation: BrowseScreenProps['navigation'];
  theme: ThemeColors;
  searchText: string;
}

const Item = memo(
  ({
    item,
    theme,
    navigation,
    settingsModal,
    navigateToSource,
    setSelectedPluginId,
  }: {
    item: PluginItem & { header?: boolean };
    theme: ThemeColors;
    navigation: BrowseScreenProps['navigation'];
    settingsModal: UseBooleanReturnType;
    navigateToSource: (plugin: PluginItem, showLatestNovels?: boolean) => void;
    setSelectedPluginId: React.Dispatch<React.SetStateAction<string>>;
  }) => {
    const { uninstallPlugin, updatePlugin, isPinned, togglePin } = usePlugins();

    // Memoized styles
    const leftActionStyle = useMemo(
      () => [styles.buttonGroup, { backgroundColor: theme.inverseSurface }],
      [theme.inverseSurface],
    );
    const rightActionStyle = useMemo(
      () => [styles.buttonGroup, { backgroundColor: theme.error }],
      [theme.error],
    );
    const containerStyle = useMemo(
      () => [styles.container, { backgroundColor: theme.surface }],
      [theme.surface],
    );
    const iconStyle = useMemo(
      () => [styles.icon, { backgroundColor: theme.surface }],
      [theme.surface],
    );
    const nameStyle = useMemo(
      () => [{ color: theme.onSurface }, styles.name],
      [theme.onSurface],
    );
    const additionStyle = useMemo(
      () => [{ color: theme.onSurfaceVariant }, styles.addition],
      [theme.onSurfaceVariant],
    );

    // Memoized handlers
    const handleWebviewPress = useCallback(
      (ref: any) => {
        ref.close();
        navigation.navigate('WebviewScreen', {
          name: item.name,
          url: item.site,
          pluginId: item.id,
        });
      },
      [navigation, item],
    );

    const handleDeletePress = useCallback(
      (ref: any) => {
        ref.close();
        uninstallPlugin(item).then(() =>
          showToast(
            getString('browseScreen.uninstalledPlugin', {
              name: item.name,
            }),
          ),
        );
      },
      [uninstallPlugin, item],
    );

    const handleSettingsPress = useCallback(() => {
      setSelectedPluginId(item.id);
      settingsModal.setTrue();
    }, [setSelectedPluginId, item.id, settingsModal]);

    const handleUpdatePress = useCallback(() => {
      updatePlugin(item)
        .then(version =>
          showToast(getString('browseScreen.updatedTo', { version })),
        )
        .catch((error: Error) => showToast(error.message));
    }, [updatePlugin, item]);

    const handleLatestPress = useCallback(() => {
      navigateToSource(item, true);
    }, [navigateToSource, item]);

    const handlePress = useCallback(() => {
      navigateToSource(item);
    }, [navigateToSource, item]);

    // Memoized render actions
    const renderLeftActions = useCallback(
      (_progress: any, _dragX: any, ref: any) => (
        <View style={leftActionStyle}>
          <IconButtonV2
            name="earth"
            size={22}
            color={theme.inverseOnSurface}
            onPress={() => handleWebviewPress(ref)}
            theme={theme}
          />
        </View>
      ),
      [leftActionStyle, theme, handleWebviewPress],
    );

    const renderRightActions = useCallback(
      (_progress: any, _dragX: any, ref: any) => (
        <View style={rightActionStyle}>
          <IconButtonV2
            name="delete"
            size={22}
            color={theme.onError}
            onPress={() => handleDeletePress(ref)}
            theme={theme}
          />
        </View>
      ),
      [rightActionStyle, theme, handleDeletePress],
    );
    return (
      <View>
        {item.header ? (
          <Text style={[styles.listHeader, { color: theme.onSurfaceVariant }]}>
            {getLocaleLanguageName(item.lang)}
          </Text>
        ) : null}
        <Swipeable
          dragOffsetFromLeftEdge={30}
          dragOffsetFromRightEdge={30}
          renderLeftActions={renderLeftActions}
          renderRightActions={renderRightActions}
        >
          <Pressable
            style={containerStyle}
            android_ripple={{ color: theme.rippleColor }}
            onPress={handlePress}
          >
            <View style={[styles.center, styles.row]}>
              <Image source={{ uri: item.iconUrl }} style={iconStyle} />
              <View style={styles.details}>
                <Text numberOfLines={1} style={nameStyle}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={additionStyle}>
                  {`${item.lang} - ${item.version}`}
                </Text>
              </View>
            </View>
            <View style={styles.flex} />
            <IconButtonV2
              name={isPinned(item.id) ? 'pin' : 'pin-outline'}
              size={22}
              color={theme.primary}
              onPress={() => togglePin(item.id)}
              theme={theme}
            />
            {item.hasSettings ? (
              <IconButtonV2
                name="cog-outline"
                size={22}
                color={theme.primary}
                onPress={handleSettingsPress}
                theme={theme}
              />
            ) : null}
            {item.hasUpdate || __DEV__ ? (
              <IconButtonV2
                name="download-outline"
                size={22}
                color={theme.primary}
                onPress={handleUpdatePress}
                theme={theme}
              />
            ) : null}
            <Button
              title={getString('browseScreen.latest')}
              textColor={theme.primary}
              onPress={handleLatestPress}
            />
          </Pressable>
        </Swipeable>
      </View>
    );
  },
);

const LatestButton = memo(({ textColor }: { textColor: string }) => {
  const viewStyle: StyleProp<ViewStyle> = useMemo(
    () => ({
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 64,
      paddingBottom: 1,
    }),
    [],
  );
  const textStyle: StyleProp<TextStyle> = useMemo(
    () => ({
      color: textColor,
    }),
    [textColor],
  );
  return (
    <View style={viewStyle}>
      <PaperText variant="labelLarge" style={[styles.buttonGroup, textStyle]}>
        {getString('browseScreen.latest')}
      </PaperText>
    </View>
  );
});

const SkeletonItem = memo(
  ({ item, theme }: { item: PluginItem; theme: ThemeColors }) => {
    const containerStyle = useMemo(
      () => [styles.container, { backgroundColor: theme.surface }],
      [theme.surface],
    );
    const iconStyle = useMemo(
      () => [styles.icon, { backgroundColor: theme.surface }],
      [theme.surface],
    );
    const nameStyle = useMemo(
      () => [{ color: theme.onSurface }, styles.name],
      [theme.onSurface],
    );
    const additionStyle = useMemo(
      () => [{ color: theme.onSurfaceVariant }, styles.addition],
      [theme.onSurfaceVariant],
    );

    const CogButton = useCallback(
      () => (
        <IconButtonV2
          name="cog-outline"
          size={22}
          color={theme.primary}
          theme={theme}
        />
      ),
      [theme],
    );
    const DownloadButton = useCallback(
      () => (
        <IconButtonV2
          name="download-outline"
          size={22}
          color={theme.primary}
          theme={theme}
        />
      ),
      [theme],
    );

    return (
      <Pressable
        style={containerStyle}
        android_ripple={{ color: theme.rippleColor }}
        //   onPress={handlePress}
      >
        <View style={[styles.center, styles.row]}>
          <Image source={{ uri: item.iconUrl }} style={iconStyle} />
          <View style={styles.details}>
            <Text numberOfLines={1} style={nameStyle}>
              {item.name}
            </Text>
            <Text numberOfLines={1} style={additionStyle}>
              {`${item.lang} - ${item.version}`}
            </Text>
          </View>
        </View>
        <View style={styles.flex} />
        {item.hasSettings ? <CogButton /> : null}
        {item.hasUpdate || __DEV__ ? <DownloadButton /> : null}
        <LatestButton textColor={theme.primary} />
      </Pressable>
    );
  },
);

const DeferredItem = ({
  ...props
}: {
  item: PluginItem & { header?: boolean };
  theme: ThemeColors;
  navigation: BrowseScreenProps['navigation'];
  settingsModal: UseBooleanReturnType;
  navigateToSource: (plugin: PluginItem, showLatestNovels?: boolean) => void;
  setSelectedPluginId: React.Dispatch<React.SetStateAction<string>>;
}) => {
  const [showReal, setShowReal] = useState(false);

  useEffect(() => {
    // Use InteractionManager to wait until interactions/animations are done
    const task = InteractionManager.runAfterInteractions(() =>
      setShowReal(true),
    );
    return () => task.cancel();
  }, []);

  return showReal ? (
    <Item {...props} />
  ) : (
    <SkeletonItem item={props.item} theme={props.theme} />
  );
};

export const InstalledTab = memo(
  ({ navigation, theme, searchText }: InstalledTabProps) => {
    const {
      filteredInstalledPlugins,
      pinnedInstalledPlugins,
      pinnedPluginIds,
      lastUsedPlugin,
      setLastUsedPlugin,
    } = usePlugins();
    const { showMyAnimeList, showAniList } = useBrowseSettings();
    const settingsModal = useBoolean();
    const [selectedPluginId, setSelectedPluginId] = useState<string>('');

    const pluginSettings = selectedPluginId
      ? getPlugin(selectedPluginId)?.pluginSettings
      : undefined;

    const navigateToSource = useCallback(
      (plugin: PluginItem, showLatestNovels?: boolean) => {
        navigation.navigate('SourceScreen', {
          pluginId: plugin.id,
          pluginName: plugin.name,
          site: plugin.site,
          showLatestNovels,
        });
        setLastUsedPlugin(plugin);
      },
      [navigation, setLastUsedPlugin],
    );

    const searchedPlugins = useMemo(() => {
      const nonPinnedInstalled = filteredInstalledPlugins.filter(
        plg => !(pinnedPluginIds || []).includes(plg.id),
      );
      const sortedInstalledPlugins = nonPinnedInstalled.sort(
        (plgFirst, plgSecond) => {
          const langDiff = plgFirst.lang.localeCompare(plgSecond.lang);
          if (langDiff !== 0) {
            return langDiff;
          }
          return plgFirst.name.localeCompare(plgSecond.name);
        },
      );
      let res = sortedInstalledPlugins;
      if (searchText) {
        const lowerCaseSearchText = searchText.toLocaleLowerCase();
        res = sortedInstalledPlugins.filter(
          plg =>
            plg.name.toLocaleLowerCase().includes(lowerCaseSearchText) ||
            plg.id.includes(lowerCaseSearchText),
        );
      }

      return res.map((plg, i) => ({
        ...plg,
        header: i === 0 ? true : plg.lang !== res[i - 1].lang,
      }));
    }, [searchText, filteredInstalledPlugins, pinnedPluginIds]);

    const renderItem: ListRenderItem<PluginItem> = useCallback(
      ({ item }) => {
        return (
          <DeferredItem
            item={item}
            theme={theme}
            navigation={navigation}
            settingsModal={settingsModal}
            navigateToSource={navigateToSource}
            setSelectedPluginId={setSelectedPluginId}
          />
        );
      },
      [theme, navigation, navigateToSource, settingsModal],
    );

    return (
      <FlashList
        estimatedItemSize={64}
        data={searchedPlugins}
        renderItem={renderItem}
        removeClippedSubviews={true}
        showsVerticalScrollIndicator={false}
        keyExtractor={item => item.id + '_installed'}
        drawDistance={100}
        ListHeaderComponent={
          <>
            {pinnedInstalledPlugins?.length ? (
              <>
                <Text
                  style={[styles.listHeader, { color: theme.onSurfaceVariant }]}
                >
                  Pinned
                </Text>
                {pinnedInstalledPlugins
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(plg => (
                    <DeferredItem
                      key={plg.id + '_pinned'}
                      item={plg}
                      theme={theme}
                      navigation={navigation}
                      settingsModal={settingsModal}
                      navigateToSource={navigateToSource}
                      setSelectedPluginId={setSelectedPluginId}
                    />
                  ))}
              </>
            ) : null}
            {showMyAnimeList || showAniList ? (
              <>
                <Text
                  style={[styles.listHeader, { color: theme.onSurfaceVariant }]}
                >
                  {getString('browseScreen.discover')}
                </Text>
                {showAniList ? (
                  <TrackerCard
                    theme={theme}
                    icon={require('../../../../assets/anilist.png')}
                    trackerName="Anilist"
                    onPress={() => navigation.navigate('BrowseAL')}
                  />
                ) : null}
                {showMyAnimeList ? (
                  <TrackerCard
                    theme={theme}
                    icon={require('../../../../assets/mal.png')}
                    trackerName="MyAnimeList"
                    onPress={() => navigation.navigate('BrowseMal')}
                  />
                ) : null}
              </>
            ) : null}
            {lastUsedPlugin ? (
              <>
                <Text
                  style={[styles.listHeader, { color: theme.onSurfaceVariant }]}
                >
                  {getString('browseScreen.lastUsed')}
                </Text>
                {renderItem({
                  item: lastUsedPlugin,
                  index: 0,
                  target: 'Cell',
                  extraData: [theme],
                })}
              </>
            ) : null}
            <Text
              style={[styles.listHeader, { color: theme.onSurfaceVariant }]}
            >
              {getString('browseScreen.installedPlugins')}
            </Text>

            <Portal>
              <SourceSettingsModal
                visible={settingsModal.value}
                onDismiss={settingsModal.setFalse}
                title={getString('browseScreen.settings.title')}
                description={getString('browseScreen.settings.description')}
                pluginId={selectedPluginId}
                pluginSettings={pluginSettings}
              />
            </Portal>
          </>
        }
      />
    );
  },
);

const styles = StyleSheet.create({
  margintTop100: { marginTop: 100 },
  addition: {
    fontSize: 12,
    lineHeight: 20,
  },
  buttonGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  details: {
    marginLeft: 16,
  },
  icon: {
    backgroundColor: coverPlaceholderColor,
    borderRadius: 4,
    height: 40,
    width: 40,
  },
  listHeader: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  name: {
    fontWeight: 'bold',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
  },
  center: { alignItems: 'center' },
  flex: { flex: 1 },
});
