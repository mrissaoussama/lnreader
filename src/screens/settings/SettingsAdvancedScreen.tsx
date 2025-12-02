import React, { useState } from 'react';

import { Portal, Text, TextInput } from 'react-native-paper';

import { useTheme, useUserAgent } from '@hooks/persisted';
import { showToast } from '@utils/showToast';

import { deleteCachedNovels } from '@hooks/persisted/useNovel';
import { getString } from '@strings/translations';
import { useBoolean } from '@hooks';
import ConfirmationDialog from '@components/ConfirmationDialog/ConfirmationDialog';
import {
  deleteReadChaptersFromDb,
  clearUpdates,
  clearUnreadUndownloadedChapters,
} from '@database/queries/ChapterQueries';
import { deleteAllNotes } from '@database/queries/NotesQueries';
import { dbWriteQueue } from '@database/utils/DbWriteQueue';

import { Appbar, Button, List, Modal, SafeAreaView } from '@components';
import { AdvancedSettingsScreenProps } from '@navigators/types';
import { StyleSheet, View } from 'react-native';
import { getUserAgentSync } from 'react-native-device-info';
import CookieManager from '@react-native-cookies/cookies';
import { store } from '@plugins/helpers/storage';
import { recreateDBIndex } from '@database/db';

const AdvancedSettings = ({ navigation }: AdvancedSettingsScreenProps) => {
  const theme = useTheme();
  const clearCookies = () => {
    CookieManager.clearAll();
    store.clearAll();
    showToast(getString('webview.cookiesCleared'));
  };

  const { userAgent, setUserAgent } = useUserAgent();
  const [userAgentInput, setUserAgentInput] = useState(userAgent);
  const [pendingBatchesInfo, setPendingBatchesInfo] = useState<{
    [key: string]: number;
  }>({});
  /**
   * Confirm Clear Database Dialog
   */
  const [clearDatabaseDialog, setClearDatabaseDialog] = useState(false);
  const showClearDatabaseDialog = () => setClearDatabaseDialog(true);
  const hideClearDatabaseDialog = () => setClearDatabaseDialog(false);

  const [clearUpdatesDialog, setClearUpdatesDialog] = useState(false);
  const showClearUpdatesDialog = () => setClearUpdatesDialog(true);
  const hideClearUpdatesDialog = () => setClearUpdatesDialog(false);

  const {
    value: deleteReadChaptersDialog,
    setTrue: showDeleteReadChaptersDialog,
    setFalse: hideDeleteReadChaptersDialog,
  } = useBoolean();

  const {
    value: clearUnreadUndownloadedDialog,
    setTrue: showClearUnreadUndownloadedDialog,
    setFalse: hideClearUnreadUndownloadedDialog,
  } = useBoolean();

  const {
    value: userAgentModalVisible,
    setTrue: showUserAgentModal,
    setFalse: hideUserAgentModal,
  } = useBoolean();

  const {
    value: recreateDBIndexDialog,
    setTrue: showRecreateDBIndexDialog,
    setFalse: hideRecreateDBIndexDialog,
  } = useBoolean();

  const {
    value: clearNotesDialog,
    setTrue: showClearNotesDialog,
    setFalse: hideClearNotesDialog,
  } = useBoolean();

  const {
    value: clearPersistentQueueDialog,
    setTrue: showClearPersistentQueueDialog,
    setFalse: hideClearPersistentQueueDialog,
  } = useBoolean();

  const handleShowClearPersistentQueueDialog = () => {
    // Get pending batches info before showing dialog
    const batchesInfo = dbWriteQueue.getPendingBatchesInfo();
    setPendingBatchesInfo(batchesInfo);
    showClearPersistentQueueDialog();
  };

  const handleClearPersistentQueue = async () => {
    try {
      const count = await dbWriteQueue.clearPersistentQueue();
      if (count > 0) {
        showToast(
          getString(
            'advancedSettingsScreen.clearPersistentQueueMessage',
          ).replace('%{count}', count.toString()),
        );
      } else {
        showToast(getString('advancedSettingsScreen.clearPersistentQueueNone'));
      }
      hideClearPersistentQueueDialog();
      setPendingBatchesInfo({});
    } catch (error) {
      showToast('Failed to clear persistent queue');
      hideClearPersistentQueueDialog();
    }
  };

  const generateBatchesInfoMessage = () => {
    const fileCount = Object.keys(pendingBatchesInfo).length;
    if (fileCount === 0) {
      return getString('advancedSettingsScreen.clearPersistentQueueWarning');
    }

    let message = 'Pending batches in memory:\n';
    for (const [batchKey, count] of Object.entries(pendingBatchesInfo)) {
      const taskType = batchKey
        .replace('batch_', '')
        .replace(/_/g, ' ')
        .toLowerCase();
      message += `• ${taskType}: ${count} items\n`;
    }
    message +=
      '\n' + getString('advancedSettingsScreen.clearPersistentQueueWarning');
    return message;
  };

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('advancedSettings')}
        handleGoBack={() => navigation.goBack()}
        theme={theme}
      />
      <List.Section>
        <List.SubHeader theme={theme}>
          {getString('advancedSettingsScreen.dataManagement')}
        </List.SubHeader>
        <List.Item
          title={getString('advancedSettingsScreen.clearCachedNovels')}
          description={getString(
            'advancedSettingsScreen.clearCachedNovelsDesc',
          )}
          onPress={showClearDatabaseDialog}
          theme={theme}
        />
        <List.Item
          title={getString('advancedSettingsScreen.recreateDBIndexes')}
          description={getString(
            'advancedSettingsScreen.recreateDBIndexesDesc',
          )}
          onPress={showRecreateDBIndexDialog}
          theme={theme}
        />
        <List.Item
          title={getString('advancedSettingsScreen.clearUpdatesTab')}
          description={getString('advancedSettingsScreen.clearupdatesTabDesc')}
          onPress={showClearUpdatesDialog}
          theme={theme}
        />
        <List.Item
          title={getString('advancedSettingsScreen.deleteReadChapters')}
          onPress={showDeleteReadChaptersDialog}
          theme={theme}
        />
        <List.Item
          title="Clear unread and undownloaded chapters"
          description="Deletes chapters that are not read and not downloaded from the database."
          onPress={showClearUnreadUndownloadedDialog}
          theme={theme}
        />
        <List.Item
          title={getString('advancedSettingsScreen.clearAllNotes')}
          description={getString('advancedSettingsScreen.clearAllNotesDesc')}
          onPress={showClearNotesDialog}
          theme={theme}
        />
        <List.Item
          title={getString('advancedSettingsScreen.clearPersistentQueue')}
          description={getString(
            'advancedSettingsScreen.clearPersistentQueueDesc',
          )}
          onPress={handleShowClearPersistentQueueDialog}
          theme={theme}
        />
        <List.Item
          title={getString('webview.clearCookies')}
          onPress={clearCookies}
          theme={theme}
        />
        <List.Item
          title={getString('advancedSettingsScreen.userAgent')}
          description={userAgent}
          onPress={showUserAgentModal}
          theme={theme}
        />
      </List.Section>
      <Portal>
        <ConfirmationDialog
          message={getString(
            'advancedSettingsScreen.deleteReadChaptersDialogTitle',
          )}
          visible={deleteReadChaptersDialog}
          onSubmit={deleteReadChaptersFromDb}
          onDismiss={hideDeleteReadChaptersDialog}
          theme={theme}
        />
        <ConfirmationDialog
          message="Are you sure you want to delete all unread and undownloaded chapters?"
          visible={clearUnreadUndownloadedDialog}
          onSubmit={clearUnreadUndownloadedChapters}
          onDismiss={hideClearUnreadUndownloadedDialog}
          theme={theme}
        />
        <ConfirmationDialog
          message={getString(
            'advancedSettingsScreen.recreateDBIndexesDialogTitle',
          )}
          visible={recreateDBIndexDialog}
          onSubmit={() => {
            recreateDBIndex();
            showToast(
              getString('advancedSettingsScreen.recreateDBIndexesToast'),
            );
          }}
          onDismiss={hideRecreateDBIndexDialog}
          theme={theme}
        />
        <ConfirmationDialog
          message={getString('advancedSettingsScreen.clearDatabaseWarning')}
          visible={clearDatabaseDialog}
          onSubmit={deleteCachedNovels}
          onDismiss={hideClearDatabaseDialog}
          theme={theme}
        />
        <ConfirmationDialog
          message={getString('advancedSettingsScreen.clearUpdatesWarning')}
          visible={clearUpdatesDialog}
          onSubmit={() => {
            clearUpdates();
            showToast(getString('advancedSettingsScreen.clearUpdatesMessage'));
            hideClearUpdatesDialog();
          }}
          onDismiss={hideClearUpdatesDialog}
          theme={theme}
        />
        <ConfirmationDialog
          message={getString('advancedSettingsScreen.clearNotesWarning')}
          visible={clearNotesDialog}
          onSubmit={() => {
            deleteAllNotes();
            showToast(getString('advancedSettingsScreen.clearNotesMessage'));
            hideClearNotesDialog();
          }}
          onDismiss={hideClearNotesDialog}
          theme={theme}
        />
        <ConfirmationDialog
          message={generateBatchesInfoMessage()}
          visible={clearPersistentQueueDialog}
          onSubmit={handleClearPersistentQueue}
          onDismiss={hideClearPersistentQueueDialog}
          theme={theme}
        />

        <Modal visible={userAgentModalVisible} onDismiss={hideUserAgentModal}>
          <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
            {getString('advancedSettingsScreen.userAgent')}
          </Text>
          <Text style={{ color: theme.onSurfaceVariant }}>{userAgent}</Text>
          <TextInput
            multiline
            mode="outlined"
            defaultValue={userAgent}
            onChangeText={text => setUserAgentInput(text.trim())}
            placeholderTextColor={theme.onSurfaceDisabled}
            underlineColor={theme.outline}
            style={[{ color: theme.onSurface }, styles.textInput]}
            theme={{ colors: { ...theme } }}
          />
          <View style={styles.buttonGroup}>
            <Button
              onPress={() => {
                setUserAgent(userAgentInput);
                hideUserAgentModal();
              }}
              style={styles.button}
              title={getString('common.save')}
              mode="contained"
            />
            <Button
              style={styles.button}
              onPress={() => {
                setUserAgent(getUserAgentSync());
                hideUserAgentModal();
              }}
              title={getString('common.reset')}
            />
          </View>
        </Modal>
      </Portal>
    </SafeAreaView>
  );
};

export default AdvancedSettings;

const styles = StyleSheet.create({
  button: {
    flex: 1,
    marginHorizontal: 8,
    marginTop: 16,
  },
  buttonGroup: {
    flexDirection: 'row-reverse',
  },
  modalTitle: {
    fontSize: 24,
    marginBottom: 16,
  },
  textInput: {
    borderRadius: 14,
    fontSize: 12,
    height: 120,
    marginBottom: 8,
    marginTop: 16,
  },
});
