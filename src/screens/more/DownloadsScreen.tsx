import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View, Text } from 'react-native';

import {
  Appbar as MaterialAppbar,
  Portal,
  Modal,
  Button,
  TextInput,
} from 'react-native-paper';

import EmptyView from '@components/EmptyView';
import { Appbar, List, SafeAreaView } from '@components';
import {
  deleteChapter,
  deleteDownloads,
  getDownloadedChapters,
} from '@database/queries/ChapterQueries';

import { useTheme } from '@hooks/persisted';

import RemoveDownloadsDialog from './components/RemoveDownloadsDialog';
import UpdatesSkeletonLoading from '@screens/updates/components/UpdatesSkeletonLoading';
import UpdateNovelCard from '@screens/updates/components/UpdateNovelCard';
import { getString } from '@strings/translations';
import { DownloadsScreenProps } from '@navigators/types';
import { DownloadedChapter } from '@database/types';
import { showToast } from '@utils/showToast';
import dayjs from 'dayjs';
import { parseChapterNumber } from '@utils/parseChapterNumber';
import { MMKVStorage } from '@utils/mmkv/mmkv';

// Settings Modal
const SettingsModal = ({
  visible,
  onDismiss,
  theme,
}: {
  visible: boolean;
  onDismiss: () => void;
  theme: any;
}) => {
  const [maxAll, setMaxAll] = useState<string>(
    String(MMKVStorage.getNumber('DOWNLOAD_MAX_SIMULTANEOUS') ?? 3),
  );
  const [maxPerPlugin, setMaxPerPlugin] = useState<string>(
    String(MMKVStorage.getNumber('DOWNLOAD_MAX_PER_PLUGIN') ?? 1),
  );
  const [delayMs, setDelayMs] = useState<string>(
    String(MMKVStorage.getNumber('DOWNLOAD_DELAY_SAME_PLUGIN_MS') ?? 1000),
  );

  const save = () => {
    const a = Math.max(0, parseInt(maxAll || '0', 10));
    const p = Math.max(0, parseInt(maxPerPlugin || '0', 10));
    const d = Math.max(0, parseInt(delayMs || '0', 10));
    MMKVStorage.set('DOWNLOAD_MAX_SIMULTANEOUS', a);
    MMKVStorage.set('DOWNLOAD_MAX_PER_PLUGIN', p);
    MMKVStorage.set('DOWNLOAD_DELAY_SAME_PLUGIN_MS', d);
    showToast('Download settings saved');
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
          {getString('downloadScreen.settings') || 'Download settings'}
        </Text>
        <View style={styles.rowBetween}>
          <Text style={{ color: theme.onSurfaceVariant }}>
            {'Max downloads (all)'}
          </Text>
          <TextInput
            value={maxAll}
            onChangeText={setMaxAll}
            keyboardType="numeric"
            style={[
              styles.input,
              { color: theme.onSurface, borderColor: theme.outline },
            ]}
          />
        </View>
        <View style={styles.rowBetween}>
          <Text style={{ color: theme.onSurfaceVariant }}>
            {'Max per plugin'}
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
          <Text style={{ color: theme.onSurfaceVariant }}>
            {'Delay between downloads (ms)'}
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

type DownloadGroup = Record<number, DownloadedChapter[]>;

const Downloads = ({ navigation }: DownloadsScreenProps) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [chapters, setChapters] = useState<DownloadedChapter[]>([]);
  const [settingsVisible, setSettingsVisible] = useState(false);

  const groupUpdatesByDate = (
    localChapters: DownloadedChapter[],
  ): DownloadedChapter[][] => {
    const dateGroups = localChapters.reduce((groups, item) => {
      const novelId = item.novelId;
      if (!groups[novelId]) {
        groups[novelId] = [];
      }

      groups[novelId].push(item);

      return groups;
    }, {} as DownloadGroup);
    return Object.values(dateGroups);
  };

  /**
   * Confirm Clear downloads Dialog
   */
  const [visible, setVisible] = useState(false);
  const showDialog = () => setVisible(true);
  const hideDialog = () => setVisible(false);

  const getChapters = async () => {
    const res = await getDownloadedChapters();
    setChapters(
      res.map(download => {
        const parsedTime = dayjs(download.releaseTime);
        return {
          ...download,
          releaseTime: parsedTime.isValid()
            ? parsedTime.format('LL')
            : download.releaseTime,
          chapterNumber: download.chapterNumber
            ? download.chapterNumber
            : parseChapterNumber(download.novelName, download.name),
        };
      }),
    );
  };

  const ListEmptyComponent = useCallback(
    () =>
      !loading ? (
        <EmptyView
          icon="(˘･_･˘)"
          description={getString('downloadScreen.noDownloads')}
        />
      ) : null,
    [loading],
  );

  useEffect(() => {
    getChapters().finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('common.downloads')}
        handleGoBack={navigation.goBack}
        theme={theme}
      >
        <MaterialAppbar.Action
          icon="cog"
          iconColor={theme.onSurface}
          onPress={() => setSettingsVisible(true)}
        />
        {chapters.length > 0 ? (
          <MaterialAppbar.Action
            icon="delete-sweep"
            iconColor={theme.onSurface}
            onPress={showDialog}
          />
        ) : null}
      </Appbar>

      <List.InfoItem title={getString('downloadScreen.dbInfo')} theme={theme} />
      {loading ? (
        <UpdatesSkeletonLoading theme={theme} />
      ) : (
        <FlatList
          contentContainerStyle={styles.flatList}
          data={groupUpdatesByDate(chapters)}
          keyExtractor={(item, index) => 'downloadGroup' + index}
          renderItem={({ item }) => {
            return (
              <UpdateNovelCard
                onlyDownloadedChapters
                chapterList={item}
                descriptionText={getString('downloadScreen.downloadsLower')}
                deleteChapter={chapter => {
                  deleteChapter(
                    chapter.pluginId,
                    chapter.novelId,
                    chapter.id,
                  ).then(() => {
                    showToast(`${getString('common.delete')} ${chapter.name}`);
                    getChapters();
                  });
                }}
              />
            );
          }}
          ListEmptyComponent={<ListEmptyComponent />}
        />
      )}
      <RemoveDownloadsDialog
        dialogVisible={visible}
        hideDialog={hideDialog}
        onSubmit={() => {
          if (chapters.length > 0) {
            deleteDownloads(chapters);
            setChapters([]);
          }
          hideDialog();
        }}
        theme={theme}
        chapterCount={chapters.length}
      />
      <SettingsModal
        visible={settingsVisible}
        onDismiss={() => setSettingsVisible(false)}
        theme={theme}
      />
    </SafeAreaView>
  );
};

export default Downloads;

const styles = StyleSheet.create({
  container: { flex: 1 },
  flatList: { flexGrow: 1, paddingVertical: 8 },
  modal: { margin: 20, padding: 16, borderRadius: 8 },
  modalTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
    gap: 8,
  },
  input: {
    minWidth: 80,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
});
