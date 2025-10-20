import React, { memo, Suspense, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  EmptyView,
  ErrorScreenV2,
  SearchbarV2,
  SafeAreaView,
} from '@components';

import { useSearch } from '@hooks';
import { useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import UpdatesSkeletonLoading from './components/UpdatesSkeletonLoading';
import UpdateNovelCard from './components/UpdateNovelCard';
import { deleteChapter } from '@database/queries/ChapterQueries';
import { showToast } from '@utils/showToast';
import ServiceManager from '@services/ServiceManager';
import { UpdateScreenProps } from '@navigators/types';
import { UpdateOverview } from '@database/types';
import { useUpdateContext } from '@components/Context/UpdateContext';
import { Portal, Modal, Button, TextInput } from 'react-native-paper';
import { MMKVStorage } from '@utils/mmkv/mmkv';

// Settings Modal
const UpdateSettingsModal = ({
  visible,
  onDismiss,
  theme,
}: {
  visible: boolean;
  onDismiss: () => void;
  theme: any;
}) => {
  const [maxTotal, setMaxTotal] = useState<string>(
    String(MMKVStorage.getNumber('UPDATE_MAX_SIMULTANEOUS') ?? 0),
  );
  const [maxPerPlugin, setMaxPerPlugin] = useState<string>(
    String(MMKVStorage.getNumber('UPDATE_MAX_PER_PLUGIN') ?? 0),
  );
  const [delayMs, setDelayMs] = useState<string>(
    String(MMKVStorage.getNumber('UPDATE_DELAY_SAME_PLUGIN_MS') ?? 1000),
  );

  const save = () => {
    const total = Math.max(0, parseInt(maxTotal || '0', 10));
    const perPlugin = Math.max(0, parseInt(maxPerPlugin || '0', 10));
    const delay = Math.max(0, parseInt(delayMs || '1000', 10));
    MMKVStorage.set('UPDATE_MAX_SIMULTANEOUS', total);
    MMKVStorage.set('UPDATE_MAX_PER_PLUGIN', perPlugin);
    MMKVStorage.set('UPDATE_DELAY_SAME_PLUGIN_MS', delay);
    showToast('Update settings saved');
    onDismiss();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modal,
          { backgroundColor: theme.surface },
        ]}
      >
        <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
          Update Settings
        </Text>
        <View style={styles.rowBetween}>
          <Text style={[styles.flex1Text, { color: theme.onSurfaceVariant }]}>
            Max simultaneous updates (0 = unlimited)
          </Text>
          <TextInput
            value={maxTotal}
            onChangeText={setMaxTotal}
            keyboardType="numeric"
            style={[
              styles.input,
              { color: theme.onSurface, borderColor: theme.outline },
            ]}
          />
        </View>
        <View style={styles.rowBetween}>
          <Text style={[styles.flex1Text, { color: theme.onSurfaceVariant }]}>
            Max per plugin (0 = no limit)
          </Text>
          <TextInput
            value={maxPerPlugin}
            onChangeText={setMaxPerPlugin}
            keyboardType="numeric"
            style={[
              styles.input,
              { color: theme.onSurface, borderColor: theme.outline },
            ]}
          />
        </View>
        <View style={styles.rowBetween}>
          <Text style={[styles.flex1Text, { color: theme.onSurfaceVariant }]}>
            Delay between same plugin (ms)
          </Text>
          <TextInput
            value={delayMs}
            onChangeText={setDelayMs}
            keyboardType="numeric"
            style={[
              styles.input,
              { color: theme.onSurface, borderColor: theme.outline },
            ]}
          />
        </View>
        <Button mode="contained" onPress={save}>
          {getString('common.save')}
        </Button>
      </Modal>
    </Portal>
  );
};

const UpdatesScreen = ({ navigation }: UpdateScreenProps) => {
  const theme = useTheme();
  const {
    updatesOverview,
    getUpdates,
    lastUpdateTime,
    showLastUpdateTime,
    error,
  } = useUpdateContext();
  const { searchText, setSearchText, clearSearchbar } = useSearch();
  const [settingsVisible, setSettingsVisible] = useState(false);

  const onChangeText = (text: string) => {
    setSearchText(text);
  };

  useEffect(
    () =>
      navigation.addListener('tabPress', e => {
        if (navigation.isFocused()) {
          e.preventDefault();

          navigation.navigate('MoreStack', {
            screen: 'TaskQueue',
          });
        }
      }),
    [navigation],
  );

  return (
    <SafeAreaView excludeBottom>
      <SearchbarV2
        searchText={searchText}
        clearSearchbar={clearSearchbar}
        placeholder={getString('updatesScreen.searchbar')}
        onChangeText={onChangeText}
        leftIcon="magnify"
        theme={theme}
        rightIcons={[
          {
            iconName: 'cog-outline',
            onPress: () => setSettingsVisible(true),
          },
          {
            iconName: 'reload',
            onPress: () =>
              ServiceManager.manager.addTask({ name: 'UPDATE_LIBRARY' }),
          },
        ]}
      />
      {error ? (
        <ErrorScreenV2 error={error} />
      ) : (
        <SectionList
          extraData={[updatesOverview.length]}
          ListHeaderComponent={
            showLastUpdateTime && lastUpdateTime ? (
              <LastUpdateTime lastUpdateTime={lastUpdateTime} theme={theme} />
            ) : null
          }
          contentContainerStyle={styles.listContainer}
          renderSectionHeader={({ section: { date } }) => (
            <Text style={[styles.dateHeader, { color: theme.onSurface }]}>
              {dayjs(date).calendar()}
            </Text>
          )}
          sections={updatesOverview
            .filter(v =>
              searchText
                ? v.novelName.toLowerCase().includes(searchText.toLowerCase())
                : true,
            )
            .reduce(
              (
                acc: { data: UpdateOverview[]; date: string }[],
                cur: UpdateOverview,
              ) => {
                if (acc.length === 0 || acc.at(-1)?.date !== cur.updateDate) {
                  acc.push({ data: [cur], date: cur.updateDate });
                  return acc;
                }
                acc.at(-1)?.data.push(cur);
                return acc;
              },
              [],
            )}
          keyExtractor={item => 'updatedGroup' + item.novelId}
          renderItem={({ item }) => (
            <Suspense fallback={<UpdatesSkeletonLoading theme={theme} />}>
              <UpdateNovelCard
                deleteChapter={chapter => {
                  deleteChapter(
                    chapter.pluginId,
                    chapter.novelId,
                    chapter.id,
                  ).then(() => {
                    showToast(
                      getString('common.deleted', {
                        name: chapter.name,
                      }),
                    );
                    getUpdates();
                  });
                }}
                chapterListInfo={item}
                descriptionText={getString('updatesScreen.updatesLower')}
              />
            </Suspense>
          )}
          ListEmptyComponent={
            <EmptyView
              icon="(˘･_･˘)"
              description={getString('updatesScreen.emptyView')}
              theme={theme}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() =>
                ServiceManager.manager.addTask({ name: 'UPDATE_LIBRARY' })
              }
              colors={[theme.onPrimary]}
              progressBackgroundColor={theme.primary}
            />
          }
        />
      )}
      <UpdateSettingsModal
        visible={settingsVisible}
        onDismiss={() => setSettingsVisible(false)}
        theme={theme}
      />
    </SafeAreaView>
  );
};

export default memo(UpdatesScreen);

const LastUpdateTime: React.FC<{
  lastUpdateTime: Date | number | string;
  theme: ThemeColors;
}> = ({ lastUpdateTime, theme }) => (
  <Text style={[styles.lastUpdateTime, { color: theme.onSurface }]}>
    {`${getString('updatesScreen.lastUpdatedAt')} ${dayjs(
      lastUpdateTime,
    ).fromNow()}`}
  </Text>
);

const styles = StyleSheet.create({
  dateHeader: {
    paddingBottom: 2,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  lastUpdateTime: {
    fontSize: 12,
    fontStyle: 'italic',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  listContainer: {
    flexGrow: 1,
  },
  modal: {
    padding: 24,
    margin: 32,
    borderRadius: 8,
    elevation: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  flex1Text: {
    flex: 1,
  },
  input: {
    flex: 1,
    marginLeft: 8,
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
  },
});
