import { FlatList, StyleSheet } from 'react-native';
import React from 'react';
import { Appbar, List, SwitchItem } from '@components';

import {
  useBrowseSettings,
  usePlugins,
  useTheme,
  useAppSettings,
} from '@hooks/persisted/index';
import { getString } from '@strings/translations';
import { getLocaleLanguageName, languages } from '@utils/constants/languages';
import { BrowseSettingsScreenProp } from '@navigators/types/index';
import { useBoolean } from '@hooks';
import ConcurrentSearchesModal from '@screens/browse/settings/modals/ConcurrentSearchesModal';
import LibraryMatchingRuleModal from '@screens/browse/settings/modals/LibraryMatchingRuleModal';

const BrowseSettings = ({ navigation }: BrowseSettingsScreenProp) => {
  const theme = useTheme();
  const { goBack } = navigation;

  const { languagesFilter, toggleLanguageFilter } = usePlugins();
  const {
    showMyAnimeList,
    showAniList,
    hideInLibraryItems,
    enableAdvancedFilters,
    globalSearchConcurrency,
    setBrowseSettings,
    confirmPluginLeave,
  } = useBrowseSettings();

  const { novelMatching, setAppSettings } = useAppSettings();

  const globalSearchConcurrencyModal = useBoolean();
  const libraryMatchingRuleModal = useBoolean();

  return (
    <>
      <Appbar
        title={getString('browseSettings')}
        handleGoBack={goBack}
        theme={theme}
      />
      <ConcurrentSearchesModal
        globalSearchConcurrency={globalSearchConcurrency ?? 1}
        modalVisible={globalSearchConcurrencyModal.value}
        hideModal={globalSearchConcurrencyModal.setFalse}
        theme={theme}
      />
      <LibraryMatchingRuleModal
        visible={libraryMatchingRuleModal.value}
        onDismiss={libraryMatchingRuleModal.setFalse}
        theme={theme}
      />
      <FlatList
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <>
            <List.SubHeader theme={theme}>
              {getString('browseScreen.globalSearch')}
            </List.SubHeader>
            <List.Item
              title={getString('browseSettingsScreen.concurrentSearches')}
              description={(globalSearchConcurrency ?? 1).toString()}
              onPress={globalSearchConcurrencyModal.setTrue}
              theme={theme}
            />
            <List.Divider theme={theme} />
            <List.SubHeader theme={theme}>
              {getString('browseScreen.discover')}
            </List.SubHeader>
            <SwitchItem
              label={`${getString('common.show')} AniList`}
              value={showAniList}
              onPress={() => setBrowseSettings({ showAniList: !showAniList })}
              theme={theme}
              style={styles.item}
            />
            <SwitchItem
              label={`${getString('common.show')} MyAnimeList`}
              value={showMyAnimeList}
              onPress={() =>
                setBrowseSettings({ showMyAnimeList: !showMyAnimeList })
              }
              theme={theme}
              style={styles.item}
            />
            <SwitchItem
              label={getString('browseSettingsScreen.enableAdvancedFilters')}
              description={getString(
                'browseSettingsScreen.enableAdvancedFiltersDesc',
              )}
              value={enableAdvancedFilters ?? true}
              onPress={() =>
                setBrowseSettings({
                  enableAdvancedFilters: !enableAdvancedFilters,
                })
              }
              theme={theme}
              style={styles.item}
            />
            <SwitchItem
              label={getString('browseScreen.hideInLibraryItems')}
              value={hideInLibraryItems ?? false}
              onPress={() =>
                setBrowseSettings({ hideInLibraryItems: !hideInLibraryItems })
              }
              theme={theme}
              style={styles.item}
            />
            <SwitchItem
              label="Confirm before leaving plugin"
              value={confirmPluginLeave ?? false}
              onPress={() =>
                setBrowseSettings({ confirmPluginLeave: !confirmPluginLeave })
              }
              theme={theme}
              style={styles.item}
            />
            <List.Divider theme={theme} />
            <List.SubHeader theme={theme}>Library Matching</List.SubHeader>
            <SwitchItem
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
              style={styles.item}
            />
            {novelMatching?.enabled && (
              <>
                <SwitchItem
                  label="Show Match Badges"
                  description="Display badges on matching novels"
                  value={novelMatching?.showBadges ?? true}
                  onPress={() =>
                    setAppSettings({
                      novelMatching: {
                        ...novelMatching,
                        showBadges: !novelMatching?.showBadges,
                      },
                    })
                  }
                  theme={theme}
                  style={styles.item}
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
              {getString('browseSettingsScreen.languages')}
            </List.SubHeader>
          </>
        }
        keyExtractor={item => item}
        data={languages}
        renderItem={({ item }) => (
          <SwitchItem
            label={getLocaleLanguageName(item)}
            value={languagesFilter.includes(item)}
            onPress={() => toggleLanguageFilter(item)}
            theme={theme}
            style={styles.item}
          />
        )}
      />
    </>
  );
};

export default BrowseSettings;

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  item: {
    paddingHorizontal: 16,
  },
});
