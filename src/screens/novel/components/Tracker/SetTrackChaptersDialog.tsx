import React, { useMemo, useState } from 'react';
import {
  Dialog,
  Portal,
  TextInput,
  Button as PaperButton,
} from 'react-native-paper';
import { Text, StyleSheet } from 'react-native';
import { ThemeColors } from '@theme/types';
import { Track } from '@database/types/Track';
import { getString } from '@strings/translations';

interface SetTrackChaptersDialogProps {
  track: Track;
  visible: boolean;
  hideDialog: () => void;
  onSubmit: (track: Track, newChapter: number, forceUpdate: boolean) => void;
  theme: ThemeColors;
  trackerName?: string;
  // New: optional reading list/status selector support
  allowListChange?: boolean;
  availableLists?: Array<{ id: string; name: string }>;
  selectedListId?: string | null;
  onChangeList?: (listId: string) => void;
}

const SetTrackChaptersDialog: React.FC<SetTrackChaptersDialogProps> = ({
  track,
  visible,
  hideDialog,
  onSubmit,
  theme,
  trackerName,
  allowListChange,
  availableLists,
  selectedListId,
  onChangeList,
}) => {
  const [chapters, setChapters] = useState('0');
  const [forceUpdate, setForceUpdate] = useState(true);
  const [showListPicker, setShowListPicker] = useState(false);

  const selectedListName = useMemo(() => {
    if (!availableLists || !selectedListId) return undefined;
    return availableLists.find(l => l.id === selectedListId)?.name;
  }, [availableLists, selectedListId]);

  const handleDismiss = () => {
    setChapters('0');
    setForceUpdate(true);
    hideDialog();
  };

  const handleSubmit = () => {
    const chapterNum = parseInt(chapters, 10);
    if (!isNaN(chapterNum) && chapterNum >= 0 && track) {
      onSubmit(track, chapterNum, forceUpdate);
      handleDismiss();
    }
  };

  // Reset chapters when track changes or dialog opens
  React.useEffect(() => {
    if (visible && track && typeof track === 'object') {
      // Add safety checks for track properties
      const lastChapterRead = track.lastChapterRead;
      const chaptersValue =
        typeof lastChapterRead === 'number' && !isNaN(lastChapterRead)
          ? lastChapterRead
          : 0;
      setChapters(chaptersValue.toString());
    }
  }, [visible, track]);

  // Don't render if track is not available or missing essential properties
  if (!track || typeof track !== 'object') {
    return null;
  }

  // Safely extract track properties with fallbacks
  const trackTitle = track.title || 'Unknown Novel';
  const currentProgress =
    typeof track.lastChapterRead === 'number' ? track.lastChapterRead : 0;

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={handleDismiss}
        style={[styles.dialog, { backgroundColor: theme.surface }]}
      >
        <Dialog.Title style={{ color: theme.onSurface }}>
          {`Update ${trackerName + ': ' + trackTitle}`}
        </Dialog.Title>
        <Dialog.Content>
          <Text style={{ color: theme.onSurface }}>
            {`Current: ${currentProgress}`}
          </Text>
          {allowListChange &&
          Array.isArray(availableLists) &&
          availableLists.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { color: theme.onSurface }]}>
                List/Status
              </Text>
              <Text
                onPress={() => setShowListPicker(true)}
                style={[styles.listPickerLink, { color: theme.primary }]}
              >
                {selectedListName || 'Select...'}
              </Text>
            </>
          ) : null}
          <TextInput
            label="Chapters"
            value={chapters}
            onChangeText={setChapters}
            keyboardType="numeric"
            mode="outlined"
            style={[styles.textInput, { backgroundColor: theme.surface }]}
            selectTextOnFocus={true}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <PaperButton onPress={handleDismiss} textColor={theme.onSurface}>
            {getString('common.cancel')}
          </PaperButton>
          <PaperButton onPress={handleSubmit} textColor={theme.primary}>
            {getString('common.ok')}
          </PaperButton>
        </Dialog.Actions>
      </Dialog>

      {/* Reading list picker inside dialog */}
      {allowListChange && showListPicker ? (
        <Dialog
          visible={showListPicker}
          onDismiss={() => setShowListPicker(false)}
          style={[styles.dialog, { backgroundColor: theme.surface }]}
        >
          <Dialog.Title style={{ color: theme.onSurface }}>
            Select List/Status
          </Dialog.Title>
          <Dialog.Content>
            {availableLists?.map(list => (
              <Text
                key={list.id}
                onPress={() => {
                  onChangeList?.(list.id);
                  setShowListPicker(false);
                }}
                style={[
                  styles.listItem,
                  {
                    color:
                      selectedListId === list.id
                        ? theme.primary
                        : theme.onSurface,
                  },
                ]}
              >
                {list.name}
              </Text>
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <PaperButton
              onPress={() => setShowListPicker(false)}
              textColor={theme.onSurface}
            >
              {getString('common.cancel')}
            </PaperButton>
          </Dialog.Actions>
        </Dialog>
      ) : null}
    </Portal>
  );
};

const styles = StyleSheet.create({
  dialog: {
    zIndex: 6000,
  },
  textInput: {
    marginTop: 16,
  },
  sectionLabel: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  listPickerLink: {
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  listItem: {
    paddingVertical: 8,
  },
});

export default SetTrackChaptersDialog;
