import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useFocusEffect } from '@react-navigation/native';
import { SceneRendererProps, TabBar, TabView } from 'react-native-tab-view';
import Color from 'color';

import { SearchbarV2, Button, SafeAreaView } from '@components/index';
import { LibraryView } from './components/LibraryListView';
import LibraryBottomSheet from './components/LibraryBottomSheet/LibraryBottomSheet';
import { Banner } from './components/Banner';
import { Actionbar } from '@components/Actionbar/Actionbar';

import {
  useAppSettings,
  useHistory,
  useTheme,
  useLibrarySettings,
} from '@hooks/persisted';
import { useSearch, useBackHandler, useBoolean } from '@hooks';
import { getString } from '@strings/translations';
import { FAB, Portal } from 'react-native-paper';
import {
  markAllChaptersRead,
  markAllChaptersUnread,
} from '@database/queries/ChapterQueries';
import { removeNovelsFromLibrary } from '@database/queries/NovelQueries';
import { getCategoryNovelCounts } from '@database/queries/LibraryQueries';
import SetCategoryModal from '@screens/novel/components/SetCategoriesModal';
import MassImportModal from './components/MassImportModal/MassImportModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SourceScreenSkeletonLoading from '@screens/browse/loadingAnimation/SourceScreenSkeletonLoading';
import { Row } from '@components/Common';
import { LibraryScreenProps } from '@navigators/types';
import { NovelInfo } from '@database/types';
import * as DocumentPicker from 'expo-document-picker';
import ServiceManager from '@services/ServiceManager';
import useImport from '@hooks/persisted/useImport';
import { ThemeColors } from '@theme/types';
import { useLibraryContext } from '@components/Context/LibraryContext';
import * as Clipboard from 'expo-clipboard';
import TrackerSyncDialog from './components/TrackerSyncDialog';
import { showToast } from '@utils/showToast';
import { ImportResult } from '@services/updates/massImport';
const LibraryScreen = ({ navigation }: LibraryScreenProps) => {
  const { searchText, setSearchText, clearSearchbar } = useSearch();
  const theme = useTheme();
  const styles = createStyles(theme);
  const { left: leftInset, right: rightInset } = useSafeAreaInsets();
  const {
    library,
    categories,
    refetchLibrary,
    isLoading,
    settings: { showNumberOfNovels, downloadedOnlyMode, incognitoMode },
  } = useLibraryContext();

  const { filter } = useLibrarySettings();

  const { importNovel } = useImport();
  const { useLibraryFAB = false } = useAppSettings();

  const { isLoading: isHistoryLoading, history, error } = useHistory();

  const layout = useWindowDimensions();

  const bottomSheetRef = useRef<BottomSheetModal | null>(null);

  const [index, setIndex] = useState(0);

  const {
    value: setCategoryModalVisible,
    setTrue: showSetCategoryModal,
    setFalse: closeSetCategoryModal,
  } = useBoolean();

  const {
    value: massImportModalVisible,
    setTrue: showMassImportModal,
    setFalse: closeMassImportModal,
  } = useBoolean();
  const [trackerSyncDialogVisible, setTrackerSyncDialogVisible] =
    useState(false);
  const [trackerSyncType, setTrackerSyncType] = useState('from');
  const handleClearSearchbar = () => {
    clearSearchbar();
  };

  const [selectedNovelIds, setSelectedNovelIds] = useState<number[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<number, number>>(
    {},
  );
  const [libraryChangeKey, setLibraryChangeKey] = useState(0);

  const currentNovels = useMemo(() => {
    if (!categories.length) return [];

    const ids = categories[index].novelIds;
    return library.filter(l => ids.includes(l.id));
  }, [categories, index, library]);

  useBackHandler(() => {
    if (selectedNovelIds.length) {
      setSelectedNovelIds([]);
      return true;
    }

    return false;
  });

  useFocusEffect(
    useCallback(() => {
      refetchLibrary();
    }, [refetchLibrary]),
  );

  useEffect(() => {
    const updateCategoryCounts = async () => {
      if (!categories.length) return;

      const categoryNovelIds = categories.map(category => category.novelIds);
      const counts = getCategoryNovelCounts(
        categoryNovelIds,
        filter,
        searchText,
        downloadedOnlyMode,
      );

      const countsMap: Record<number, number> = {};
      categories.forEach((category, idx) => {
        countsMap[category.id] = counts[idx];
      });

      setCategoryCounts(countsMap);
    };

    updateCategoryCounts();
  }, [categories, searchText, downloadedOnlyMode, filter]);

  useEffect(() => {
    const getSummaryText = (results: ImportResult) => {
      const timestamp = new Date().toLocaleString();
      let summary = 'Mass Import Report\n';
      summary += `Generated: ${timestamp}\n\n`;

      summary += 'SUMMARY:\n';
      summary += `Total URLs processed: ${
        results.added.length + results.skipped.length + results.errored.length
      }\n`;
      summary += `Successfully added: ${results.added.length}\n`;
      summary += `Already in library (skipped): ${results.skipped.length}\n`;
      summary += `Failed with errors: ${results.errored.length}\n\n`;

      if (results.added.length > 0) {
        summary += `SUCCESSFULLY ADDED (${results.added.length}):\n`;
        results.added.forEach(
          item => (summary += `✅ ${item.name}\n   URL: ${item.url}\n\n`),
        );
      }

      if (results.skipped.length > 0) {
        summary += `ALREADY IN LIBRARY (${results.skipped.length}):\n`;
        results.skipped.forEach(
          item => (summary += `⏭️ ${item.name}\n   URL: ${item.url}\n\n`),
        );
      }

      if (results.errored.length > 0) {
        summary += `FAILED WITH ERRORS (${results.errored.length}):\n`;
        results.errored.forEach(
          item =>
            (summary += `❌ ${item.name}\n   URL: ${item.url}\n   Error: ${item.error}\n\n`),
        );
      }

      return summary;
    };

    const unsubscribe = ServiceManager.manager.observe('MASS_IMPORT', task => {
      if (task && !task.meta.isRunning && task.meta.result) {
        const summary = getSummaryText(task.meta.result);
        Clipboard.setStringAsync(summary);
        const results = task.meta.result;
        showToast(
          `Import: ✅${results.added.length} ⏭️${results.skipped.length} ❌${results.errored.length} | Report copied`,
        );
        refetchLibrary();
      }
    });
    const generateSyncReport = (results, type) => {
      const timestamp = new Date().toLocaleString();
      let report = `Tracker Sync Report (${type.toUpperCase()})\n`;
      report += `Generated: ${timestamp}\n\n`;

      const stats = {
        total: results.novels?.length || 0,
        errors: 0,
        appUpdated: 0,
        trackersUpdated: 0,
        skipped: 0,
        trackerChanges: 0,
        trackerErrors: 0,
      };

      results.novels?.forEach(result => {
        if (result.error) {
          stats.errors++;
        } else {
          if (
            result.appChange &&
            result.appChange.oldProgress !== result.appChange.newProgress
          ) {
            stats.appUpdated++;
          }

          let hasTrackerChanges = false;
          let hasTrackerErrors = false;

          result.trackerChanges?.forEach(change => {
            if (change.error) {
              hasTrackerErrors = true;
              stats.trackerErrors++;
            } else if (change.oldProgress !== change.newProgress) {
              hasTrackerChanges = true;
              stats.trackerChanges++;
            }
          });

          if (hasTrackerChanges) {
            stats.trackersUpdated++;
          }

          if (hasTrackerErrors) {
            stats.errors++;
          }

          if (
            (!result.appChange ||
              result.appChange.oldProgress === result.appChange.newProgress) &&
            (!result.trackerChanges ||
              result.trackerChanges.length === 0 ||
              result.trackerChanges.every(
                c => c.oldProgress === c.newProgress && !c.error,
              ))
          ) {
            stats.skipped++;
          }
        }
      });

      report += 'SUMMARY:\n';
      report += `Total novels processed: ${stats.total}\n`;
      report += `App progress updated: ${stats.appUpdated}\n`;
      report += `Novels with tracker updates: ${stats.trackersUpdated}\n`;
      report += `Total tracker changes: ${stats.trackerChanges}\n`;
      report += `Tracker errors: ${stats.trackerErrors}\n`;
      if (stats.skipped > 0) {
        report += `Skipped (no changes): ${stats.skipped}\n`;
      }
      report += `Novel errors: ${stats.errors}\n\n`;

      report += 'DETAILS:\n';
      results.novels?.forEach((result, resultIndex) => {
        let hasActualChanges = false;

        if (
          result.appChange &&
          result.appChange.oldProgress !== result.appChange.newProgress
        ) {
          hasActualChanges = true;
        }

        if (
          result.trackerChanges?.some(
            change => change.error || change.oldProgress !== change.newProgress,
          )
        ) {
          hasActualChanges = true;
        }

        if (result.error) {
          hasActualChanges = true;
        }

        if (!hasActualChanges) {
          return;
        }

        report += `${resultIndex + 1}. ${result.novelName}\n`;
        if (result.error) {
          report += `   ❌ Novel Error: ${result.error}\n`;
        } else {
          if (result.appChange) {
            const appIcon =
              result.appChange.oldProgress === result.appChange.newProgress
                ? '✅'
                : '🔄';
            report += `   📱 App: ${result.appChange.oldProgress} → ${result.appChange.newProgress} ${appIcon}\n`;
          }

          result.trackerChanges?.forEach(change => {
            if (change.error) {
              report += `   ❌ ${change.tracker}: Error - ${change.error}\n`;
            } else if (change.oldProgress !== change.newProgress) {
              report += `   🔄 ${change.tracker}: ${change.oldProgress} → ${change.newProgress}\n`;
            }
          });
        }
        report += '\n';
      });

      return report;
    };
    const syncObservers = [
      ServiceManager.manager.observe('SYNC_FROM_TRACKERS', task => {
        if (task && !task.meta.isRunning && task.meta.result) {
          const report = generateSyncReport(task.meta.result, 'from');
          Clipboard.setStringAsync(report);
          const novels = task.meta.result.novels || [];
          const appUpdated = novels.filter(
            n =>
              n.appChange &&
              n.appChange.oldProgress !== n.appChange.newProgress,
          ).length;
          const totalErrors = novels.filter(
            n => n.error || n.trackerChanges?.some(c => c.error),
          ).length;
          showToast(
            `📥 Sync: 📱${appUpdated} ❌${totalErrors} | Report copied`,
          );
          refetchLibrary();
        }
      }),
      ServiceManager.manager.observe('SYNC_TO_TRACKERS', task => {
        if (task && !task.meta.isRunning && task.meta.result) {
          const report = generateSyncReport(task.meta.result, 'to');
          Clipboard.setStringAsync(report);
          const novels = task.meta.result.novels || [];
          const trackersUpdated = novels.filter(
            n =>
              n.trackerChanges &&
              n.trackerChanges.some(c => c.oldProgress !== c.newProgress),
          ).length;
          const totalTrackerChanges = novels.reduce(
            (count, n) =>
              count +
              (n.trackerChanges?.filter(c => c.oldProgress !== c.newProgress)
                .length || 0),
            0,
          );
          const totalErrors = novels.filter(
            n => n.error || n.trackerChanges?.some(c => c.error),
          ).length;
          showToast(
            `📤 Sync: 📚${trackersUpdated} (${totalTrackerChanges}) ❌${totalErrors} | Report copied`,
          );
          refetchLibrary();
        }
      }),
      ServiceManager.manager.observe('SYNC_ALL_TRACKERS', task => {
        if (task && !task.meta.isRunning && task.meta.result) {
          const report = generateSyncReport(task.meta.result, 'all');
          Clipboard.setStringAsync(report);
          const novels = task.meta.result.novels || [];
          const appUpdated = novels.filter(
            n =>
              n.appChange &&
              n.appChange.oldProgress !== n.appChange.newProgress,
          ).length;
          const trackersUpdated = novels.filter(
            n =>
              n.trackerChanges &&
              n.trackerChanges.some(c => c.oldProgress !== c.newProgress),
          ).length;
          const totalTrackerChanges = novels.reduce(
            (count, n) =>
              count +
              (n.trackerChanges?.filter(c => c.oldProgress !== c.newProgress)
                .length || 0),
            0,
          );
          const totalErrors = novels.filter(
            n => n.error || n.trackerChanges?.some(c => c.error),
          ).length;
          showToast(
            `🔄 Sync: 📱${appUpdated} 📚${trackersUpdated} (${totalTrackerChanges}) ❌${totalErrors} | Report copied`,
          );
          refetchLibrary();
        }
      }),
    ];
    return () => {
      unsubscribe();
      syncObservers.forEach(unsub => unsub());
    };
  }, [refetchLibrary]);

  useEffect(
    () =>
      navigation.addListener('tabPress', e => {
        if (navigation.isFocused()) {
          e.preventDefault();

          bottomSheetRef.current?.present?.();
        }
      }),
    [navigation],
  );

  const searchbarPlaceholder =
    selectedNovelIds.length === 0
      ? getString('libraryScreen.searchbar')
      : `${selectedNovelIds.length} selected`;

  function openRandom() {
    const novels = currentNovels;
    const randomNovel = novels[Math.floor(Math.random() * novels.length)];
    if (randomNovel) {
      navigation.navigate('ReaderStack', {
        screen: 'Novel',
        params: randomNovel,
      });
    }
  }
  const showTrackerSyncConfirmation = syncType => {
    setTrackerSyncType(syncType);
    setTrackerSyncDialogVisible(true);
  };
  const pickAndImport = useCallback(() => {
    DocumentPicker.getDocumentAsync({
      type: 'application/epub+zip',
      copyToCacheDirectory: true,
      multiple: true,
    }).then(importNovel);
  }, [importNovel]);

  const renderTabBar = useCallback(
    (props: SceneRendererProps & { navigationState: State }) => {
      return categories.length ? (
        <TabBar
          {...props}
          scrollEnabled
          indicatorStyle={styles.tabBarIndicator}
          style={[
            {
              backgroundColor: theme.surface,
              borderBottomColor: Color(theme.isDark ? '#FFFFFF' : '#000000')
                .alpha(0.12)
                .string(),
            },
            styles.tabBar,
          ]}
          tabStyle={styles.tabStyle}
          gap={8}
          inactiveColor={theme.secondary}
          activeColor={theme.primary}
          android_ripple={{ color: theme.rippleColor }}
        />
      ) : null;
    },
    [
      categories.length,
      styles.tabBar,
      styles.tabBarIndicator,
      styles.tabStyle,
      theme.isDark,
      theme.primary,
      theme.rippleColor,
      theme.secondary,
      theme.surface,
    ],
  );
  const renderScene = useCallback(
    ({
      route,
    }: {
      route: {
        id: number;
        name: string;
        sort: number;
        novelIds: number[];
        key: string;
        title: string;
      };
    }) => {
      const isFocused = categories[index]?.id === route.id;

      return isLoading ? (
        <SourceScreenSkeletonLoading theme={theme} />
      ) : (
        <>
          {searchText ? (
            <Button
              title={`${getString(
                'common.searchFor',
              )} "${searchText}" ${getString('common.globally')}`}
              style={styles.globalSearchBtn}
              onPress={() =>
                navigation.navigate('GlobalSearchScreen', {
                  searchText,
                })
              }
            />
          ) : null}
          <LibraryView
            categoryId={route.id}
            categoryName={route.name}
            categoryNovelIds={route.novelIds}
            searchText={searchText}
            selectedNovelIds={selectedNovelIds}
            setSelectedNovelIds={setSelectedNovelIds}
            pickAndImport={pickAndImport}
            navigation={navigation}
            isFocused={isFocused}
            libraryChangeKey={libraryChangeKey}
          />
        </>
      );
    },
    [
      categories,
      index,
      isLoading,
      navigation,
      pickAndImport,
      searchText,
      selectedNovelIds,
      styles.globalSearchBtn,
      theme,
      libraryChangeKey,
    ],
  );

  const renderLabel = useCallback(
    ({ route, color }: TabViewLabelProps) => {
      const count = categoryCounts[route.id] ?? route?.novelIds.length ?? 0;

      return (
        <Row>
          <Text style={[{ color }, styles.fontWeight600]}>{route.title}</Text>
          {showNumberOfNovels ? (
            <View
              style={[
                styles.badgeCtn,
                { backgroundColor: theme.surfaceVariant },
              ]}
            >
              <Text
                style={[styles.badgetText, { color: theme.onSurfaceVariant }]}
              >
                {count}
              </Text>
            </View>
          ) : null}
        </Row>
      );
    },
    [
      categoryCounts,
      showNumberOfNovels,
      styles.badgeCtn,
      styles.badgetText,
      styles.fontWeight600,
      theme.onSurfaceVariant,
      theme.surfaceVariant,
    ],
  );

  const navigationState = useMemo(
    () => ({
      index,
      routes: categories.map(category => ({
        key: String(category.id),
        title: category.name,
        ...category,
      })),
    }),
    [categories, index],
  );

  return (
    <SafeAreaView excludeBottom>
      <SearchbarV2
        searchText={searchText}
        clearSearchbar={handleClearSearchbar}
        placeholder={searchbarPlaceholder}
        onLeftIconPress={() => {
          if (selectedNovelIds.length > 0) {
            setSelectedNovelIds([]);
          }
        }}
        onChangeText={setSearchText}
        leftIcon={selectedNovelIds.length ? 'close' : 'magnify'}
        rightIcons={
          selectedNovelIds.length
            ? [
                {
                  iconName: 'select-all',
                  onPress: () =>
                    setSelectedNovelIds(currentNovels.map(novel => novel.id)),
                },
              ]
            : [
                {
                  iconName: 'filter-variant',
                  onPress: () => bottomSheetRef.current?.present(),
                },
              ]
        }
        menuButtons={[
          {
            title: getString('libraryScreen.extraMenu.updateLibrary'),
            onPress: () =>
              ServiceManager.manager.addTask({
                name: 'UPDATE_LIBRARY',
              }),
          },
          {
            title: getString('libraryScreen.extraMenu.updateCategory'),
            onPress: () =>
              //2 = local category
              library[index].id !== 2 &&
              ServiceManager.manager.addTask({
                name: 'UPDATE_LIBRARY',
                data: {
                  categoryId: library[index].id,
                  categoryName: library[index].name,
                },
              }),
          },
          {
            title: getString('libraryScreen.extraMenu.importEpub'),
            onPress: pickAndImport,
          },
          {
            title: getString('libraryScreen.extraMenu.massImport'),
            onPress: showMassImportModal,
          },
          {
            title: getString('libraryScreen.extraMenu.openRandom'),
            onPress: openRandom,
          },
          {
            title: 'Sync from Trackers',
            onPress: () => showTrackerSyncConfirmation('from'),
          },
          {
            title: 'Sync to Trackers',
            onPress: () => showTrackerSyncConfirmation('to'),
          },
          {
            title: 'Sync All Trackers',
            onPress: () => showTrackerSyncConfirmation('all'),
          },
        ]}
        theme={theme}
      />
      {downloadedOnlyMode ? (
        <Banner
          icon="cloud-off-outline"
          label={getString('moreScreen.downloadOnly')}
          theme={theme}
        />
      ) : null}
      {incognitoMode ? (
        <Banner
          icon="incognito"
          label={getString('moreScreen.incognitoMode')}
          theme={theme}
          backgroundColor={theme.tertiary}
          textColor={theme.onTertiary}
        />
      ) : null}

      <TabView
        commonOptions={{
          label: renderLabel,
        }}
        lazy
        navigationState={navigationState}
        renderTabBar={renderTabBar}
        renderScene={renderScene}
        onIndexChange={setIndex}
        initialLayout={{ width: layout.width }}
      />

      {useLibraryFAB &&
      !isHistoryLoading &&
      history &&
      history.length !== 0 &&
      !error ? (
        <FAB
          style={[
            styles.fab,
            { backgroundColor: theme.primary, marginRight: rightInset + 16 },
          ]}
          color={theme.onPrimary}
          uppercase={false}
          label={getString('common.resume')}
          icon="play"
          onPress={() => {
            navigation.navigate('ReaderStack', {
              screen: 'Chapter',
              params: {
                novel: {
                  path: history[0].novelPath,
                  pluginId: history[0].pluginId,
                  name: history[0].novelName,
                } as NovelInfo,
                chapter: history[0],
              },
            });
          }}
        />
      ) : null}
      <SetCategoryModal
        novelIds={selectedNovelIds}
        closeModal={closeSetCategoryModal}
        onEditCategories={() => setSelectedNovelIds([])}
        visible={setCategoryModalVisible}
        onSuccess={() => {
          setSelectedNovelIds([]);
          setLibraryChangeKey(prev => prev + 1); // Trigger library view reload
          refetchLibrary();
        }}
      />
      <MassImportModal
        visible={massImportModalVisible}
        closeModal={closeMassImportModal}
      />
      <TrackerSyncDialog
        visible={trackerSyncDialogVisible}
        onDismiss={() => setTrackerSyncDialogVisible(false)}
        syncType={trackerSyncType}
      />
      <LibraryBottomSheet
        bottomSheetRef={bottomSheetRef}
        style={{ marginLeft: leftInset, marginRight: rightInset }}
      />
      <Portal>
        <Actionbar
          viewStyle={{ paddingLeft: leftInset, paddingRight: rightInset }}
          active={selectedNovelIds.length > 0}
          actions={[
            {
              icon: 'label-outline',
              onPress: showSetCategoryModal,
            },
            {
              icon: 'check',
              onPress: async () => {
                const promises: Promise<any>[] = [];
                selectedNovelIds.map(id =>
                  promises.push(markAllChaptersRead(id)),
                );
                await Promise.all(promises);
                setSelectedNovelIds([]);
                refetchLibrary();
              },
            },
            {
              icon: 'check-outline',
              onPress: async () => {
                const promises: Promise<any>[] = [];
                selectedNovelIds.map(id =>
                  promises.push(markAllChaptersUnread(id)),
                );
                await Promise.all(promises);
                setSelectedNovelIds([]);
                refetchLibrary();
              },
            },
            {
              icon: 'delete-outline',
              onPress: () => {
                removeNovelsFromLibrary(selectedNovelIds);
                setSelectedNovelIds([]);
                setLibraryChangeKey(prev => prev + 1); // Trigger library view reload
                refetchLibrary();
              },
            },
          ]}
        />
      </Portal>
    </SafeAreaView>
  );
};

export default React.memo(LibraryScreen);

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    badgeCtn: {
      borderRadius: 50,
      marginLeft: 2,
      paddingHorizontal: 6,
      paddingVertical: 2,
      position: 'relative',
    },
    badgetText: {
      fontSize: 12,
    },
    fab: {
      bottom: 0,
      margin: 16,
      position: 'absolute',
      right: 0,
    },
    fontWeight600: {
      fontWeight: '600',
    },
    globalSearchBtn: {
      margin: 16,
    },
    tabBar: {
      borderBottomWidth: 1,
      elevation: 0,
    },
    tabBarIndicator: {
      backgroundColor: theme.primary,
      height: 3,
    },
    tabStyle: {
      minWidth: 100,
      width: 'auto',
    },
  });
}
