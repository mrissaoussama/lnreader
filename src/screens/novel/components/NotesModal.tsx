import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Dialog, Portal, TextInput } from 'react-native-paper';
import { ThemeColors } from '@theme/types';
import {
  getNovelNote,
  saveNovelNote,
  deleteNovelNote,
} from '@database/queries/NotesQueries';
import { showToast } from '@utils/showToast';
interface NotesModalProps {
  visible: boolean;
  onDismiss: () => void;
  novelId: number;
  novelName: string;
  theme: ThemeColors;
  onNoteChanged?: (hasNote: boolean) => void;
}

const NotesModal: React.FC<NotesModalProps> = ({
  visible,
  onDismiss,
  novelId,
  novelName,
  theme,
  onNoteChanged,
}) => {
  const [noteContent, setNoteContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalContent, setOriginalContent] = useState('');

  useEffect(() => {
    if (visible) {
      const fetchNote = async () => {
        try {
          setLoading(true);
          const note = await getNovelNote(novelId);
          const content = note?.content || '';
          setNoteContent(content);
          setOriginalContent(content);
          setHasChanges(false);
        } catch (error) {
          showToast('Failed to load note');
        } finally {
          setLoading(false);
        }
      };
      fetchNote();
    }
  }, [visible, novelId]);

  const handleContentChange = (text: string) => {
    setNoteContent(text);
    setHasChanges(text !== originalContent);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      await saveNovelNote(novelId, noteContent);
      setOriginalContent(noteContent);
      setHasChanges(false);
      onNoteChanged?.(noteContent.trim() !== '');
      showToast('Note saved');
      onDismiss();
    } catch (error) {
      showToast('Failed to save note');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setLoading(true);
      await deleteNovelNote(novelId);
      setNoteContent('');
      setOriginalContent('');
      setHasChanges(false);
      onNoteChanged?.(false);
      showToast('Note deleted');
      onDismiss();
    } catch (error) {
      showToast('Failed to delete note');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges) {
      setNoteContent(originalContent);
      setHasChanges(false);
    }
    onDismiss();
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={handleCancel}
        style={{ backgroundColor: theme.surface }}
      >
        <Dialog.Title style={{ color: theme.onSurface }}>
          Notes for {novelName}
        </Dialog.Title>
        <Dialog.Content>
          <TextInput
            value={noteContent}
            onChangeText={handleContentChange}
            multiline
            numberOfLines={10}
            placeholder="Write your notes about this novel..."
            style={styles.textInput}
            contentStyle={styles.textInputContent}
            theme={{ colors: { ...theme } }}
            disabled={loading}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <View style={styles.buttonRow}>
            <View style={styles.leftButtons}>
              {originalContent.trim() !== '' && (
                <Button
                  onPress={handleDelete}
                  disabled={loading}
                  textColor={theme.error}
                >
                  Delete
                </Button>
              )}
            </View>
            <View style={styles.rightButtons}>
              <Button
                onPress={handleCancel}
                disabled={loading}
                textColor={theme.onSurface}
              >
                Cancel
              </Button>
              <Button
                onPress={handleSave}
                disabled={loading || !hasChanges}
                mode="contained"
                buttonColor={theme.primary}
              >
                Save
              </Button>
            </View>
          </View>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  textInput: {
    height: 200,
    marginBottom: 8,
  },
  textInputContent: {
    height: 200,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  leftButtons: {
    flexDirection: 'row',
  },
  rightButtons: {
    flexDirection: 'row',
  },
});

export default NotesModal;
