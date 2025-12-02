import React, { memo, useCallback, useMemo, useState } from 'react';
import { getString } from '@strings/translations';
import { Appbar, Menu as DefaultMenu } from 'react-native-paper';
import { ThemeColors } from '@theme/types';
import Animated, {
  FadeIn,
  FadeOut,
  SharedValue,
  SlideInUp,
  SlideOutUp,
  interpolateColor,
  useAnimatedStyle,
} from 'react-native-reanimated';
import EpubIconButton from './EpubIconButton';
import { ChapterInfo, NovelInfo } from '@database/types';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { MaterialDesignIconName } from '@type/icon';
import { showToast } from '@utils/showToast';

const Menu = React.memo(
  ({
    visible,
    onDismiss,
    anchor,
    items,
    theme,
  }: {
    visible: boolean;
    onDismiss: () => void;
    anchor: React.ReactNode;
    theme: ThemeColors;
    items: { label: string; onPress: () => void }[];
  }) => {
    return (
      <DefaultMenu
        visible={visible}
        onDismiss={onDismiss}
        anchor={anchor}
        anchorPosition="bottom"
        contentStyle={{ backgroundColor: theme.surface2 }}
      >
        {items.map((item, index) => (
          <DefaultMenu.Item
            key={index + item.label}
            title={item.label}
            style={{ backgroundColor: theme.surface2 }}
            titleStyle={{ color: theme.onSurface }}
            onPress={() => {
              onDismiss();
              item.onPress();
            }}
          />
        ))}
      </DefaultMenu>
    );
  },
);

const NovelAppbar = ({
  novel,
  chapters,
  theme,
  isLocal,
  downloadChapters,
  deleteChapters,
  _deleteChaptersByCriteria,
  showEditInfoModal,
  downloadCustomChapterModal,
  setCustomNovelCover,
  goBack,
  shareNovel,
  showJumpToChapterModal,
  showNotesModal,
  showAlternativeTitlesModal,
  showLibraryMatchesModal,
  libraryMatchesCount,
  hasNote,
  headerOpacity,
  openDeleteRangeModal,
  clearAndRefreshChapters,
  deleteCover,
  deleteAllDownloadedChapters,
}: {
  novel: NovelInfo | undefined;
  chapters: ChapterInfo[];
  theme: ThemeColors;
  isLocal: boolean | undefined;
  downloadChapters: (amount: number | 'all' | 'unread') => void;
  deleteChapters: () => void;
  deleteChaptersByCriteria: (criteria: {
    downloaded?: boolean;
    notDownloaded?: boolean;
    read?: boolean;
    unread?: boolean;
  }) => void;
  showEditInfoModal: React.Dispatch<React.SetStateAction<boolean>>;
  downloadCustomChapterModal: () => void;
  setCustomNovelCover: () => Promise<void>;
  goBack: () => void;
  shareNovel: () => void;
  showJumpToChapterModal: (arg: boolean) => void;
  showNotesModal: () => void;
  showAlternativeTitlesModal: () => void;
  showLibraryMatchesModal: () => void;
  libraryMatchesCount: number;
  hasNote: boolean;
  headerOpacity: SharedValue<number>;
  openDeleteRangeModal: () => void;
  clearAndRefreshChapters: () => void;
  deleteCover: () => void;
  deleteAllDownloadedChapters: () => void;
}) => {
  const headerOpacityStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      headerOpacity.value,
      [0, 1],
      ['transparent', theme.surface2 || theme.surface],
    );
    return {
      backgroundColor,
    };
  });

  const [downloadMenu, showDownloadMenu] = useState(false);
  const [extraMenu, showExtraMenu] = useState(false);

  const AppbarAction = useCallback(
    (props: {
      icon: MaterialDesignIconName;
      onPress: () => void;
      style?: StyleProp<ViewStyle>;
      size?: number;
    }) => {
      const AA = Animated.createAnimatedComponent(Appbar.Action);
      return (
        <AA
          entering={FadeIn.duration(250)}
          // delay to prevent flickering on rerenders
          exiting={FadeOut.delay(50).duration(250)}
          theme={{ colors: theme }}
          size={24}
          {...props}
        />
      );
    },
    [theme],
  );
  const downloadMenuItems = useMemo(() => {
    return [
      {
        label: getString('novelScreen.download.next'),
        onPress: () => downloadChapters(1),
      },
      {
        label: getString('novelScreen.download.next5'),
        onPress: () => downloadChapters(5),
      },
      {
        label: getString('novelScreen.download.next10'),
        onPress: () => downloadChapters(10),
      },
      {
        label: getString('novelScreen.download.custom'),
        onPress: () => downloadCustomChapterModal(),
      },
      {
        label: getString('novelScreen.download.unread'),
        onPress: () => downloadChapters('unread'),
      },
      {
        label: getString('common.all'),
        onPress: () => downloadChapters('all'),
      },
      {
        label: getString('novelScreen.download.delete'),
        onPress: () => deleteChapters(),
      },
      {
        label: getString('novelScreen.deleteRange') || 'Delete range',
        onPress: openDeleteRangeModal,
      },
    ];
  }, [
    deleteChapters,
    downloadChapters,
    downloadCustomChapterModal,
    openDeleteRangeModal,
  ]);

  const openDlMenu = useCallback(() => showDownloadMenu(true), []);
  const closeDlMenu = useCallback(() => showDownloadMenu(false), []);

  return (
    <Animated.View
      entering={SlideInUp.duration(250)}
      exiting={SlideOutUp.duration(250)}
      style={headerOpacityStyle}
    >
      <Appbar.Header theme={{ colors: { ...theme, surface: 'transparent' } }}>
        <Appbar.BackAction onPress={goBack} />

        <View style={styles.row}>
          <EpubIconButton
            theme={theme}
            novel={novel}
            chapters={chapters}
            anchor={AppbarAction}
          />

          <AppbarAction icon="share-variant" onPress={shareNovel} />
          <AppbarAction
            icon="text-box-search-outline"
            onPress={() => {
              showJumpToChapterModal(true);
            }}
          />
          <AppbarAction
            icon={hasNote ? 'note-text' : 'note-text-outline'}
            onPress={showNotesModal}
          />
          <AppbarAction
            icon="library-outline"
            onPress={showLibraryMatchesModal}
            style={libraryMatchesCount > 0 ? styles.badge : undefined}
          />
          {!isLocal && (
            <Menu
              theme={theme}
              visible={downloadMenu}
              onDismiss={closeDlMenu}
              anchor={
                <Appbar.Action
                  theme={{ colors: theme }}
                  icon="download-outline"
                  onPress={openDlMenu}
                  size={26}
                />
              }
              items={downloadMenuItems}
            />
          )}
          <Menu
            visible={extraMenu}
            onDismiss={() => showExtraMenu(false)}
            anchor={
              <Appbar.Action
                theme={{ colors: theme }}
                icon="dots-vertical"
                onPress={() => showExtraMenu(true)}
                size={24}
              />
            }
            theme={theme}
            items={[
              {
                label: getString('novelScreen.edit.info'),
                onPress: () => {
                  showEditInfoModal(true);
                },
              },
              {
                label: getString('novelScreen.edit.cover'),
                onPress: () => {
                  setCustomNovelCover();
                },
              },
              {
                label: 'View Alternative Titles',
                onPress: () => {
                  showAlternativeTitlesModal();
                },
              },
              ...(novel?.cover
                ? [
                    {
                      label: 'Refresh Cover',
                      onPress: setCustomNovelCover,
                    },
                    {
                      label: 'Delete Cover',
                      onPress: deleteCover,
                    },
                  ]
                : [
                    {
                      label: 'Set Cover',
                      onPress: setCustomNovelCover,
                    },
                  ]),
              {
                label:
                  getString('common.clear') +
                  ' ' +
                  getString('common.chapters'),
                onPress: () => {
                  clearAndRefreshChapters();
                },
              },
              {
                label: 'Clear unread chapters',
                onPress: () => {
                  if (!novel) return;
                  const { Alert } = require('react-native');
                  Alert.alert(
                    'Clear unread chapters',
                    'Delete all unread chapter entries from database?',
                    [
                      {
                        text: getString('common.cancel'),
                        style: 'cancel',
                      },
                      {
                        text: getString('common.clear'),
                        style: 'destructive',
                        onPress: async () => {
                          const { deleteChaptersByCriteria } = await import(
                            '@database/queries/ChapterQueries'
                          );
                          await deleteChaptersByCriteria(
                            novel.pluginId,
                            novel.id,
                            { unread: true },
                          );
                          clearAndRefreshChapters();
                          showToast('Cleared unread chapters');
                        },
                      },
                    ],
                  );
                },
              },
              {
                label: 'Clear read chapters',
                onPress: () => {
                  if (!novel) return;
                  const { Alert } = require('react-native');
                  Alert.alert(
                    'Clear read chapters',
                    'Delete all read chapter entries from database?',
                    [
                      {
                        text: getString('common.cancel'),
                        style: 'cancel',
                      },
                      {
                        text: getString('common.clear'),
                        style: 'destructive',
                        onPress: async () => {
                          const { deleteChaptersByCriteria } = await import(
                            '@database/queries/ChapterQueries'
                          );
                          await deleteChaptersByCriteria(
                            novel.pluginId,
                            novel.id,
                            { read: true },
                          );
                          clearAndRefreshChapters();
                          showToast('Cleared read chapters');
                        },
                      },
                    ],
                  );
                },
              },
              {
                label: 'Clear not downloaded chapters',
                onPress: () => {
                  if (!novel) return;
                  const { Alert } = require('react-native');
                  Alert.alert(
                    'Clear not downloaded',
                    'Delete all non-downloaded chapter entries from database?',
                    [
                      {
                        text: getString('common.cancel'),
                        style: 'cancel',
                      },
                      {
                        text: getString('common.clear'),
                        style: 'destructive',
                        onPress: async () => {
                          const { deleteChaptersByCriteria } = await import(
                            '@database/queries/ChapterQueries'
                          );
                          await deleteChaptersByCriteria(
                            novel.pluginId,
                            novel.id,
                            { notDownloaded: true },
                          );
                          clearAndRefreshChapters();
                          showToast('Cleared not downloaded chapters');
                        },
                      },
                    ],
                  );
                },
              },
              {
                label: getString(
                  'novelScreen.bottomSheet.actions.deleteAllDownloads',
                ),
                onPress: () => {
                  deleteAllDownloadedChapters();
                },
              },
            ]}
          />
        </View>
      </Appbar.Header>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    position: 'absolute',
    right: 0,
  },
  badge: {
    backgroundColor: '#6B7280',
    borderRadius: 12,
  },
});

export default memo(NovelAppbar);
