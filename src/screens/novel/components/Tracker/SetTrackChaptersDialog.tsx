import React, { useState } from 'react';
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
  onDismiss: () => void;
  onSubmit: (track: Track, newChapter: number, forceUpdate: boolean) => void;
  theme: ThemeColors;
}

const SetTrackChaptersDialog: React.FC<SetTrackChaptersDialogProps> = ({
  track,
  visible,
  onDismiss,
  onSubmit,
  theme,
}) => {
  const [chapters, setChapters] = useState('0');
  const [forceUpdate, setForceUpdate] = useState(true);

  const handleDismiss = () => {
    setChapters('0');
    setForceUpdate(true);
    onDismiss();
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
          Update Progress - {trackTitle}
        </Dialog.Title>
        <Dialog.Content>
          <Text style={{ color: theme.onSurface }}>
            Current Progress: {currentProgress}
          </Text>
          <TextInput
            label={'Chapters Read'}
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
    </Portal>
  );
};

const styles = StyleSheet.create({
  dialog: {
    zIndex: 2000, // Increased from 1000 to appear above bottom sheet
  },
  textInput: {
    marginTop: 16,
  },
});

export default SetTrackChaptersDialog;
