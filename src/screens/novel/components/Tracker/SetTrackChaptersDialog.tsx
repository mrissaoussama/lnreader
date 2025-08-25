import React, { useMemo, useState } from 'react';
import {
  Dialog,
  Portal,
  TextInput,
  Button as PaperButton,
} from 'react-native-paper';
import { Text, StyleSheet, View } from 'react-native';
import { ThemeColors } from '@theme/types';
import { Track } from '@database/types/Track';
import { getString } from '@strings/translations';
import { TrackerLogo } from '@services/Trackers/common/TrackerLogo';
import { trackModalStyles } from './TrackModal.styles';
import ReadingListSelector from './shared/ReadingListSelector';
import ReadingListModal from './shared/ReadingListModal';

interface SetTrackChaptersDialogProps {
  track: Track;
  visible: boolean;
  hideDialog: () => void;
  onSubmit: (
    track: Track,
    newChapter: number,
    forceUpdate: boolean,
    newVolume?: number,
  ) => void;
  theme: ThemeColors;
  trackerName?: string;
  availableLists?: Array<{ id: string; name: string }>;
  selectedListId?: string | null;
  onChangeList?: (listId: string) => void;
  supportsVolumes?: boolean;
  onRefreshLists?: () => void;
  isRefreshingLists?: boolean;
}

const SetTrackChaptersDialog: React.FC<SetTrackChaptersDialogProps> = ({
  track,
  visible,
  hideDialog,
  onSubmit,
  theme,
  trackerName,
  availableLists,
  selectedListId,
  onChangeList,
  supportsVolumes,
  onRefreshLists,
  isRefreshingLists,
}) => {
  const [chapters, setChapters] = useState('0');
  const [forceUpdate, _setForceUpdate] = useState(true);
  const [volumes, setVolumes] = useState('');
  const [showReadingListModal, setShowReadingListModal] = useState(false);

  const volumeSuffix = useMemo(() => {
    try {
      const md = track?.metadata ? JSON.parse(track.metadata) : {};
      const cv =
        typeof md.currentVolume === 'number' ? md.currentVolume : undefined;
      const mv = typeof md.maxVolume === 'number' ? md.maxVolume : undefined;
      if (typeof cv === 'number') {
        return `V.${cv}${typeof mv === 'number' ? `/${mv}` : ''}`;
      }
    } catch {}
    return '';
  }, [track]);

  const handleDismiss = () => {
    hideDialog();
  };

  const handleSubmit = () => {
    const chapterNum = parseInt(chapters, 10);
    const volumeNum = volumes.trim() === '' ? undefined : parseInt(volumes, 10);
    if (!isNaN(chapterNum) && chapterNum >= 0 && track) {
      onSubmit(
        track,
        chapterNum,
        forceUpdate,
        !isNaN(Number(volumeNum)) ? volumeNum : undefined,
      );
      handleDismiss();
    }
  };

  React.useEffect(() => {
    if (visible && track && typeof track === 'object') {
      const lastChapterRead = track.lastChapterRead;
      const chaptersValue =
        typeof lastChapterRead === 'number' && !isNaN(lastChapterRead)
          ? lastChapterRead
          : 0;
      setChapters(chaptersValue.toString());

      try {
        const md = track?.metadata ? JSON.parse(track.metadata) : {};
        const cv =
          typeof md.currentVolume === 'number' ? md.currentVolume : undefined;
        if (typeof cv === 'number') {
          setVolumes(String(cv));
        } else {
          setVolumes('');
        }
      } catch {
        setVolumes('');
      }
    }
  }, [visible, track]);

  if (!track || typeof track !== 'object') {
    return null;
  }

  const trackTitle = track.title || 'Unknown Novel';
  const currentProgress =
    typeof track.lastChapterRead === 'number' ? track.lastChapterRead : 0;

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={handleDismiss}
        style={[
          trackModalStyles.sharedDialogContainer,
          { backgroundColor: theme.surface2 || theme.surface },
        ]}
      >
        <Dialog.Title>
          <View style={styles.titleRow}>
            {trackerName ? (
              <TrackerLogo source={trackerName as any} size={24} />
            ) : null}
            <Text style={[styles.titleText, { color: theme.onSurface }]}>
              {trackerName}: {trackTitle}
            </Text>
          </View>
        </Dialog.Title>
        <Dialog.Content>
          <ReadingListSelector
            theme={theme}
            label={getString('trackingDialog.list' as any)}
            availableLists={availableLists || []}
            selectedListId={selectedListId || null}
            onSelect={id => onChangeList?.(id)}
            onRefresh={onRefreshLists}
            refreshing={isRefreshingLists}
            compact
            onPressModal={() => setShowReadingListModal(true)}
          />
          <Text
            style={[styles.currentProgressText, { color: theme.onSurface }]}
          >
            {`Current: ${volumeSuffix} Ch.${currentProgress}`}
          </Text>
          {supportsVolumes && (
            <TextInput
              label="Volumes"
              value={volumes}
              onChangeText={setVolumes}
              keyboardType="numeric"
              mode="outlined"
              style={[styles.input, { backgroundColor: theme.surface }]}
              selectTextOnFocus={true}
            />
          )}
          <TextInput
            label="Chapters"
            value={chapters}
            onChangeText={setChapters}
            keyboardType="numeric"
            mode="outlined"
            style={[styles.input, { backgroundColor: theme.surface }]}
            selectTextOnFocus={true}
          />
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          <PaperButton
            onPress={handleDismiss}
            theme={{ colors: { primary: theme.onSurface } }}
          >
            {getString('common.cancel')}
          </PaperButton>
          <PaperButton onPress={handleSubmit} textColor={theme.primary}>
            {getString('common.ok')}
          </PaperButton>
        </Dialog.Actions>
      </Dialog>
      <ReadingListModal
        visible={showReadingListModal}
        onDismiss={() => setShowReadingListModal(false)}
        theme={theme}
        lists={availableLists || []}
        selectedList={
          availableLists?.find(l => l.id === selectedListId) || null
        }
        onSelectList={list => {
          onChangeList?.(list.id);
        }}
        title="Select a reading list"
      />
    </Portal>
  );
};

const styles = StyleSheet.create({
  actions: { justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  titleText: { fontSize: 18, fontWeight: 'bold' },
  currentProgressText: { marginTop: 12 },
  input: { marginTop: 16 },
});

export default SetTrackChaptersDialog;
