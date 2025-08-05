import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  Modal,
  Portal,
  Text,
  Button,
  TextInput,
  List,
  Divider,
  IconButton,
  Appbar,
} from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@utils/showToast';
import { getString } from '@strings/translations';
import {
  getAlternativeTitles,
  addAlternativeTitle,
  removeAlternativeTitle,
  clearAlternativeTitles,
  updateAlternativeTitles,
} from '@database/queries/NovelQueries';
import { ThemeColors } from '@theme/types';

interface TitleActionsProps {
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  theme: ThemeColors;
}

const TitleActions: React.FC<TitleActionsProps> = ({
  onEdit,
  onCopy,
  onDelete,
  theme,
}) => (
  <View style={actionsStyle}>
    <IconButton icon="pencil" iconColor={theme.primary} onPress={onEdit} />
    <IconButton
      icon="content-copy"
      iconColor={theme.onSurfaceVariant}
      onPress={onCopy}
    />
    <IconButton icon="delete" iconColor={theme.error} onPress={onDelete} />
  </View>
);

const actionsStyle = { flexDirection: 'row' as const };

interface AlternativeTitlesModalProps {
  visible: boolean;
  onDismiss: () => void;
  novelId: number;
  novelName: string;
  theme: ThemeColors;
}

const AlternativeTitlesModal: React.FC<AlternativeTitlesModalProps> = ({
  visible,
  onDismiss,
  novelId,
  novelName,
  theme,
}) => {
  const [titles, setTitles] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  const loadTitles = useCallback(async () => {
    try {
      const alternativeTitles = await getAlternativeTitles(novelId);
      setTitles(alternativeTitles);
    } catch (error) {
      showToast(
        `${getString('novelScreen.alternativeTitles.failedToLoad')}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, [novelId]);

  useEffect(() => {
    if (visible) {
      loadTitles();
    }
  }, [visible, novelId, loadTitles]);

  const handleAddTitle = async () => {
    if (!newTitle.trim()) {
      showToast(getString('novelScreen.alternativeTitles.enterTitle'));
      return;
    }

    try {
      await addAlternativeTitle(novelId, newTitle);
      setNewTitle('');
      await loadTitles();
      showToast(getString('novelScreen.alternativeTitles.titleAdded'));
    } catch (error) {
      showToast(
        `${getString('novelScreen.alternativeTitles.failedToAdd')}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  const handleDeleteTitle = useCallback(
    (title: string) => {
      Alert.alert(
        getString('novelScreen.alternativeTitles.deleteTitle'),
        getString('novelScreen.alternativeTitles.deleteConfirm', { title }),
        [
          { text: getString('common.cancel'), style: 'cancel' },
          {
            text: getString('common.delete'),
            style: 'destructive',
            onPress: async () => {
              try {
                await removeAlternativeTitle(novelId, title);
                await loadTitles();
                showToast(
                  getString('novelScreen.alternativeTitles.titleDeleted'),
                );
              } catch (error) {
                showToast(
                  getString('novelScreen.alternativeTitles.failedToDelete'),
                );
              }
            },
          },
        ],
      );
    },
    [novelId, loadTitles],
  );

  const handleEditTitle = useCallback(
    (index: number) => {
      setEditingIndex(index);
      setEditingText(titles[index]);
    },
    [titles],
  );

  const handleSaveEdit = async () => {
    if (editingIndex === null) return;

    const trimmedText = editingText.trim();
    if (!trimmedText) {
      showToast(getString('novelScreen.alternativeTitles.titleEmpty'));
      return;
    }

    try {
      const updatedTitles = [...titles];
      updatedTitles[editingIndex] = trimmedText;
      await updateAlternativeTitles(novelId, updatedTitles);
      setEditingIndex(null);
      setEditingText('');
      await loadTitles();
      showToast(getString('novelScreen.alternativeTitles.titleUpdated'));
    } catch (error) {
      showToast(getString('novelScreen.alternativeTitles.failedToUpdate'));
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingText('');
  };

  const handleCopyTitle = useCallback(async (title: string) => {
    try {
      await Clipboard.setStringAsync(title);
      showToast(getString('novelScreen.alternativeTitles.titleCopied'));
    } catch (error) {
      showToast(getString('novelScreen.alternativeTitles.failedToCopy'));
    }
  }, []);

  const handleClearAll = () => {
    Alert.alert(
      getString('novelScreen.alternativeTitles.clearAll'),
      getString('novelScreen.alternativeTitles.clearAllConfirm'),
      [
        { text: getString('common.cancel'), style: 'cancel' },
        {
          text: getString('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAlternativeTitles(novelId);
              await loadTitles();
              showToast(
                getString('novelScreen.alternativeTitles.allTitlesCleared'),
              );
            } catch (error) {
              showToast(
                getString('novelScreen.alternativeTitles.failedToClear'),
              );
            }
          },
        },
      ],
    );
  };

  const renderTitleActions = useCallback(
    (index: number, title: string) => (
      <TitleActions
        onEdit={() => handleEditTitle(index)}
        onCopy={() => handleCopyTitle(title)}
        onDelete={() => handleDeleteTitle(title)}
        theme={theme}
      />
    ),
    [theme, handleEditTitle, handleCopyTitle, handleDeleteTitle],
  );

  const styles = createStyles(theme);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.container}
      >
        <View style={styles.content}>
          <Appbar.Header style={styles.header}>
            <Appbar.Action icon="close" onPress={onDismiss} />
            <Appbar.Content
              title={getString('novelScreen.alternativeTitles.title')}
            />
            {titles.length > 0 && (
              <Appbar.Action icon="delete-sweep" onPress={handleClearAll} />
            )}
          </Appbar.Header>

          <Text style={[styles.novelName, { color: theme.onSurface }]}>
            {novelName}
          </Text>

          <View style={styles.addSection}>
            <TextInput
              label={getString('novelScreen.alternativeTitles.addNewTitle')}
              value={newTitle}
              onChangeText={setNewTitle}
              mode="outlined"
              style={styles.textInput}
              onSubmitEditing={handleAddTitle}
            />
            <Button
              mode="contained"
              onPress={handleAddTitle}
              disabled={!newTitle.trim()}
              style={styles.addButton}
            >
              {getString('novelScreen.alternativeTitles.add')}
            </Button>
          </View>

          <Divider style={styles.divider} />

          <ScrollView style={styles.scrollView}>
            {titles.length === 0 ? (
              <Text
                style={[styles.emptyText, { color: theme.onSurfaceVariant }]}
              >
                {getString('novelScreen.alternativeTitles.noTitlesYet')}
              </Text>
            ) : (
              titles.map((title, index) => (
                <View key={index} style={styles.titleItem}>
                  {editingIndex === index ? (
                    <View style={styles.editContainer}>
                      <TextInput
                        value={editingText}
                        onChangeText={setEditingText}
                        mode="outlined"
                        style={styles.editInput}
                        onSubmitEditing={handleSaveEdit}
                      />
                      <View style={styles.editActions}>
                        <IconButton
                          icon="check"
                          iconColor={theme.primary}
                          onPress={handleSaveEdit}
                        />
                        <IconButton
                          icon="close"
                          iconColor={theme.error}
                          onPress={handleCancelEdit}
                        />
                      </View>
                    </View>
                  ) : (
                    <List.Item
                      title={title}
                      titleStyle={{ color: theme.onSurface }}
                      right={() => renderTitleActions(index, title)}
                    />
                  )}
                  {index < titles.length - 1 && <Divider />}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </Portal>
  );
};

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.surface,
      margin: 20,
      borderRadius: 8,
    },
    content: {
      flex: 1,
    },
    header: {
      backgroundColor: theme.surface,
      elevation: 0,
    },
    novelName: {
      fontSize: 16,
      fontWeight: 'bold',
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    addSection: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      alignItems: 'flex-end',
      gap: 8,
    },
    textInput: {
      flex: 1,
    },
    addButton: {
      marginBottom: 8,
    },
    divider: {
      marginVertical: 16,
    },
    scrollView: {
      flex: 1,
      paddingHorizontal: 16,
    },
    emptyText: {
      textAlign: 'center',
      marginTop: 32,
      fontSize: 16,
    },
    titleItem: {
      marginBottom: 8,
    },
    editContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
    },
    editInput: {
      flex: 1,
      marginRight: 8,
    },
    editActions: {
      flexDirection: 'row',
    },
    actions: {
      flexDirection: 'row',
    },
  });

export default AlternativeTitlesModal;
