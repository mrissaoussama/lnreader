import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { MMKVStorage } from '@utils/mmkv/mmkv';

import DisplayModeModal from './modals/DisplayModeModal';
import GridSizeModal from './modals/GridSizeModal';
import LibraryLoadLimitModal from './modals/LibraryLoadLimitModal';

import {
  useAppSettings,
  useLastUpdate,
  useLibrarySettings,
  useTheme,
} from '@hooks/persisted';
import DefaultChapterSortModal from '../components/DefaultChapterSortModal';
import {
  DisplayModes,
  displayModesList,
  LibrarySortOrder,
} from '@screens/library/constants/constants';
import { useBoolean } from '@hooks';
import { Appbar, List, SafeAreaView } from '@components';
import NovelSortModal from './modals/NovelSortModal';
import NovelBadgesModal from './modals/NovelBadgesModal';
import { NavigationState } from '@react-navigation/native';
import { getString } from '@strings/translations';
import SettingSwitch from '../components/SettingSwitch';
import LibraryMatchingRuleModal from '@screens/browse/settings/modals/LibraryMatchingRuleModal';
import NovelTitleLinesModal from './modals/NovelTitleLinesModal';

const SKIP_UPDATE_THRESHOLD_KEY = 'SKIP_UPDATE_THRESHOLD';

interface GenralSettingsProps {
  navigation: NavigationState;
}

const GenralSettings: React.FC<GenralSettingsProps> = ({ navigation }) => {
  const theme = useTheme();

  const [skipUpdateThreshold, setSkipUpdateThreshold] = React.useState<string>(
    MMKVStorage.getString(SKIP_UPDATE_THRESHOLD_KEY) || 'off',
  );
  const [updateOnPullRefresh, setUpdateOnPullRefresh] = React.useState<boolean>(
    MMKVStorage.getBoolean('UPDATE_ON_PULL_REFRESH_ENABLED') ?? true,
  );
  const [resumeDownloadAfter, setResumeDownloadAfter] = React.useState<number>(
    MMKVStorage.getNumber('RESUME_DOWNLOAD_AFTER') || 60,
  );

  const handleSkipThresholdChange = (value: string) => {
    setSkipUpdateThreshold(value);
    MMKVStorage.set(SKIP_UPDATE_THRESHOLD_KEY, value);
  };

  const handleResumeDownloadAfterChange = () => {
    const options = [0, 5, 10, 30, 60];
    const nextIndex =
      (options.indexOf(resumeDownloadAfter) + 1) % options.length;
    const newValue = options[nextIndex];
    setResumeDownloadAfter(newValue);
    MMKVStorage.set('RESUME_DOWNLOAD_AFTER', newValue);
  };

  const getSkipThresholdLabel = () => {
    switch (skipUpdateThreshold) {
      case '1h':
        return '1 hour';
      case '12h':
        return '12 hours';
      case '1d':
        return '1 day';
      case '1w':
        return '1 week';
      case 'off':
      default:
        return 'off';
    }
  };

  const {
    displayMode = DisplayModes.Comfortable,
    novelsPerRow = 3,
    showDownloadBadges = true,
    showNumberOfNovels = false,
    showUnreadBadges = true,
    sortOrder = LibrarySortOrder.DateAdded_DESC,
    libraryLoadLimit = 50,
    novelTitleLines = 2,
  } = useLibrarySettings();

  const sortOrderDisplay: string[] = sortOrder.split(' ');
  const sortOrderNameMap = new Map<string, string>([
    ['name', 'libraryScreen.bottomSheet.sortOrders.alphabetically'],
    ['chaptersDownloaded', 'libraryScreen.bottomSheet.sortOrders.download'],
    ['chaptersUnread', 'libraryScreen.bottomSheet.sortOrders.totalChapters'],
    ['id', 'libraryScreen.bottomSheet.sortOrders.dateAdded'],
    ['lastReadAt', 'libraryScreen.bottomSheet.sortOrders.lastRead'],
    ['lastUpdatedAt', 'libraryScreen.bottomSheet.sortOrders.lastUpdated'],
  ]);
  const {
    disableLoadingAnimations,
    updateLibraryOnLaunch,
    downloadNewChapters,
    onlyUpdateOngoingNovels,
    defaultChapterSort,
    refreshNovelMetadata,
    disableHapticFeedback,
    useLibraryFAB,
    novelMatching,
    setAppSettings,
  } = useAppSettings();

  const { showLastUpdateTime, setShowLastUpdateTime } = useLastUpdate();

  const generateNovelBadgesDescription = () => {
    const res = [];
    if (showDownloadBadges) {
      res.push(getString('libraryScreen.bottomSheet.display.download'));
    }
    if (showUnreadBadges) {
      res.push(getString('libraryScreen.bottomSheet.display.unread'));
    }
    if (showNumberOfNovels) {
      res.push(getString('libraryScreen.bottomSheet.display.numberOfItems'));
    }
    return res.join(', ');
  };

  /**
   * Display Mode Modal
   */
  const displayModalRef = useBoolean();

  /**
   * Grid Size Modal
   */
  const gridSizeModalRef = useBoolean();

  /**
   * Novel Title Lines Modal
   */
  const novelTitleLinesModalRef = useBoolean();

  /**
   * Library Load Limit Modal
   */
  const libraryLoadLimitModalRef = useBoolean();

  /**
   * Novel Badges Modal
   */
  const novelBadgesModalRef = useBoolean();
  const novelBadgesDescription = generateNovelBadgesDescription();
  /**
   * Novel Sort Modal
   */
  const novelSortModalRef = useBoolean();
  /**
   * Chapter Sort Modal
   */
  const defaultChapterSortModal = useBoolean();

  /**
   * Library Matching Rule Modal
   */
  const libraryMatchingRuleModal = useBoolean();

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('generalSettings')}
        // @ts-ignore
        handleGoBack={navigation.goBack}
        theme={theme}
      />
      <ScrollView contentContainerStyle={styles.paddingBottom}>
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('common.display')}
          </List.SubHeader>
          <List.Item
            title={getString('generalSettingsScreen.displayMode')}
            description={displayModesList[displayMode].label}
            onPress={displayModalRef.setTrue}
            theme={theme}
          />
          <List.Item
            title={getString('generalSettingsScreen.itemsPerRowLibrary')}
            description={
              novelsPerRow +
              ' ' +
              getString('generalSettingsScreen.itemsPerRow')
            }
            onPress={gridSizeModalRef.setTrue}
            theme={theme}
          />
          <List.Item
            title="Novel Title Lines"
            description={`${novelTitleLines} line${
              novelTitleLines > 1 ? 's' : ''
            }`}
            onPress={novelTitleLinesModalRef.setTrue}
            theme={theme}
          />
          <List.Item
            title={getString('generalSettingsScreen.novelBadges')}
            // @ts-ignore
            description={novelBadgesDescription}
            onPress={novelBadgesModalRef.setTrue}
            theme={theme}
          />
          <List.Item
            title={getString('generalSettingsScreen.novelSort')}
            description={
              // @ts-ignore
              getString(sortOrderNameMap.get(sortOrderDisplay[0])) +
              ' ' +
              sortOrderDisplay[1]
            }
            onPress={novelSortModalRef.setTrue}
            theme={theme}
          />
          <List.Divider theme={theme} />
          <List.SubHeader theme={theme}>{getString('library')}</List.SubHeader>
          <List.Item
            title="Library Load Limit"
            description={`Load ${libraryLoadLimit} novels at once`}
            onPress={libraryLoadLimitModalRef.setTrue}
            theme={theme}
          />
          <SettingSwitch
            label={getString('generalSettingsScreen.updateLibrary')}
            description={getString('generalSettingsScreen.updateLibraryDesc')}
            value={updateLibraryOnLaunch}
            onPress={() =>
              setAppSettings({ updateLibraryOnLaunch: !updateLibraryOnLaunch })
            }
            theme={theme}
          />
          <SettingSwitch
            label={getString('generalSettingsScreen.useFAB')}
            value={useLibraryFAB}
            onPress={() => setAppSettings({ useLibraryFAB: !useLibraryFAB })}
            theme={theme}
          />
          <SettingSwitch
            label="Update library on pull to refresh"
            description="Trigger library update when pulling down in library screen"
            value={updateOnPullRefresh}
            onPress={() => {
              const currentValue = updateOnPullRefresh;
              setUpdateOnPullRefresh(!currentValue);
              MMKVStorage.set('UPDATE_ON_PULL_REFRESH_ENABLED', !currentValue);
            }}
            theme={theme}
          />
          <List.Divider theme={theme} />
          <List.SubHeader theme={theme}>Library Matching</List.SubHeader>
          <SettingSwitch
            label="Enable Library Matching"
            description="Find duplicate novels in library"
            value={novelMatching?.enabled ?? false}
            onPress={() =>
              setAppSettings({
                novelMatching: {
                  ...novelMatching,
                  enabled: !novelMatching?.enabled,
                },
              })
            }
            theme={theme}
          />
          {novelMatching?.enabled && (
            <>
              <SettingSwitch
                label="Show Match Badges"
                description="Display badges on matching novels"
                value={novelMatching?.showBadges !== false}
                onPress={() =>
                  setAppSettings({
                    novelMatching: {
                      ...novelMatching,
                      showBadges: !novelMatching?.showBadges,
                    },
                  })
                }
                theme={theme}
              />
              <List.Item
                title="Matching Rules"
                description={`Plugin: ${
                  novelMatching?.pluginRule || 'normalized-contains'
                }, Library: ${
                  novelMatching?.libraryRule || 'normalized-contains'
                }`}
                onPress={libraryMatchingRuleModal.setTrue}
                theme={theme}
              />
            </>
          )}
          <List.Divider theme={theme} />
          <List.SubHeader theme={theme}>
            {getString('generalSettingsScreen.novel')}
          </List.SubHeader>
          <List.Item
            title={getString('generalSettingsScreen.chapterSort')}
            description={`${getString('generalSettingsScreen.bySource')} ${
              defaultChapterSort === 'ORDER BY position ASC'
                ? getString('generalSettingsScreen.asc')
                : getString('generalSettingsScreen.desc')
            }`}
            onPress={defaultChapterSortModal.setTrue}
            theme={theme}
          />
          <List.Divider theme={theme} />
          <List.SubHeader theme={theme}>
            {getString('generalSettingsScreen.globalUpdate')}
          </List.SubHeader>
          <List.Item
            title="Skip updating recently updated novels"
            description={`Skip novels updated within: ${getSkipThresholdLabel()}`}
            onPress={() => {
              const options = [
                { label: 'Off', value: 'off' },
                { label: '1 hour', value: '1h' },
                { label: '12 hours', value: '12h' },
                { label: '1 day', value: '1d' },
                { label: '1 week', value: '1w' },
              ];
              const currentIndex = options.findIndex(
                o => o.value === skipUpdateThreshold,
              );
              const nextIndex = (currentIndex + 1) % options.length;
              handleSkipThresholdChange(options[nextIndex].value);
            }}
            theme={theme}
          />
          <SettingSwitch
            label={getString('generalSettingsScreen.updateOngoing')}
            value={onlyUpdateOngoingNovels}
            onPress={() =>
              setAppSettings({
                onlyUpdateOngoingNovels: !onlyUpdateOngoingNovels,
              })
            }
            theme={theme}
          />
          <SettingSwitch
            label={getString('generalSettingsScreen.refreshMetadata')}
            description={getString(
              'generalSettingsScreen.refreshMetadataDescription',
            )}
            value={refreshNovelMetadata}
            onPress={() =>
              setAppSettings({ refreshNovelMetadata: !refreshNovelMetadata })
            }
            theme={theme}
          />
          <SettingSwitch
            label={getString('generalSettingsScreen.updateTime')}
            value={showLastUpdateTime}
            onPress={() => setShowLastUpdateTime(!showLastUpdateTime)}
            theme={theme}
          />
          <List.Divider theme={theme} />
          <List.SubHeader theme={theme}>
            {getString('generalSettingsScreen.autoDownload')}
          </List.SubHeader>
          <SettingSwitch
            label={getString('generalSettingsScreen.downloadNewChapters')}
            value={downloadNewChapters}
            onPress={() =>
              setAppSettings({ downloadNewChapters: !downloadNewChapters })
            }
            theme={theme}
          />
          <List.Item
            title={getString('generalSettingsScreen.resumeDownloadAfter')}
            description={
              resumeDownloadAfter === 0
                ? getString('common.off')
                : resumeDownloadAfter + 's'
            }
            onPress={handleResumeDownloadAfterChange}
            theme={theme}
          />
          <List.Divider theme={theme} />
          <List.SubHeader theme={theme}>
            {getString('generalSettings')}
          </List.SubHeader>
          <SettingSwitch
            label={getString('generalSettingsScreen.disableHapticFeedback')}
            description={getString(
              'generalSettingsScreen.disableHapticFeedbackDescription',
            )}
            value={disableHapticFeedback}
            onPress={() =>
              setAppSettings({ disableHapticFeedback: !disableHapticFeedback })
            }
            theme={theme}
          />
          <SettingSwitch
            label={getString('generalSettingsScreen.disableLoadingAnimations')}
            description={getString(
              'generalSettingsScreen.disableLoadingAnimationsDesc',
            )}
            value={disableLoadingAnimations}
            onPress={() =>
              setAppSettings({
                disableLoadingAnimations: !disableLoadingAnimations,
              })
            }
            theme={theme}
          />
        </List.Section>
      </ScrollView>
      <DisplayModeModal
        displayMode={displayMode}
        displayModalVisible={displayModalRef.value}
        hideDisplayModal={displayModalRef.setFalse}
        theme={theme}
      />
      <DefaultChapterSortModal
        defaultChapterSort={defaultChapterSort}
        displayModalVisible={defaultChapterSortModal.value}
        hideDisplayModal={defaultChapterSortModal.setFalse}
        setAppSettings={setAppSettings}
        theme={theme}
      />
      <GridSizeModal
        novelsPerRow={novelsPerRow}
        gridSizeModalVisible={gridSizeModalRef.value}
        hideGridSizeModal={gridSizeModalRef.setFalse}
        theme={theme}
      />
      <NovelTitleLinesModal
        novelTitleLines={novelTitleLines}
        visible={novelTitleLinesModalRef.value}
        onDismiss={novelTitleLinesModalRef.setFalse}
        theme={theme}
      />
      <LibraryLoadLimitModal
        libraryLoadLimit={libraryLoadLimit}
        libraryLoadLimitModalVisible={libraryLoadLimitModalRef.value}
        hideLibraryLoadLimitModal={libraryLoadLimitModalRef.setFalse}
        theme={theme}
      />
      <NovelBadgesModal
        novelBadgesModalVisible={novelBadgesModalRef.value}
        hideNovelBadgesModal={novelBadgesModalRef.setFalse}
        theme={theme}
      />
      <NovelSortModal
        novelSortModalVisible={novelSortModalRef.value}
        hideNovelSortModal={novelSortModalRef.setFalse}
        theme={theme}
      />
      <LibraryMatchingRuleModal
        visible={libraryMatchingRuleModal.value}
        onDismiss={libraryMatchingRuleModal.setFalse}
        theme={theme}
      />
    </SafeAreaView>
  );
};

export default GenralSettings;

const styles = StyleSheet.create({
  paddingBottom: { paddingBottom: 32 },
});
