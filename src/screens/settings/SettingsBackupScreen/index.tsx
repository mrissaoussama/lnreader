import React, { useState } from 'react';
import { useTheme } from '@hooks/persisted';
import { Appbar, List, SafeAreaView } from '@components';
import { useBoolean } from '@hooks';
import { BackupSettingsScreenProps } from '@navigators/types';
import GoogleDriveModal from './Components/GoogleDriveModal';
import SelfHostModal from './Components/SelfHostModal';
import BackupOptionsModal, {
  BackupOptions,
} from './Components/BackupOptionsModal';
import {
  createBackup as deprecatedCreateBackup,
  restoreBackup as deprecatedRestoreBackup,
} from '@services/backup/legacy';
import { ScrollView } from 'react-native-gesture-handler';
import { getString } from '@strings/translations';
import {
  StyleSheet,
  Platform,
  InteractionManager,
  AppState,
  AppStateStatus,
} from 'react-native';
import ServiceManager from '@services/ServiceManager';
import { showToast } from '@utils/showToast';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { ErrorLogModal } from '@components/ErrorLogModal/ErrorLogModal';

const BackupSettings = ({ navigation }: BackupSettingsScreenProps) => {
  const theme = useTheme();
  const [backupMode, setBackupMode] = useState<'backup' | 'restore' | null>(
    null,
  );
  const [errorLogVisible, setErrorLogVisible] = useState(false);

  const {
    value: googleDriveModalVisible,
    setFalse: closeGoogleDriveModal,
    setTrue: openGoogleDriveModal,
  } = useBoolean();

  const {
    value: selfHostModalVisible,
    setFalse: closeSelfHostModal,
    setTrue: openSelfHostModal,
  } = useBoolean();

  const handleCreateBackup = () => {
    setBackupMode('backup');
  };

  const handleRestoreBackup = () => {
    setBackupMode('restore');
  };

  // Inline helpers to ensure UI is settled and activity is available before opening native pickers
  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
  const isActivityUnavailable = (e: any) =>
    typeof e?.message === 'string' &&
    e.message.toLowerCase().includes('current activity is no longer available');

  const runAfterUISettles = async () => {
    await new Promise<void>(resolve =>
      InteractionManager.runAfterInteractions(() => resolve()),
    );
    if (AppState.currentState !== 'active') {
      await new Promise<void>(resolve => {
        const sub = AppState.addEventListener(
          'change',
          (state: AppStateStatus) => {
            if (state === 'active') {
              // @ts-ignore remove for both new/old RN
              sub?.remove?.();
              resolve();
            }
          },
        );
      });
    }
    await sleep(0);
  };

  const handleBackupOptionsConfirm = async (options: BackupOptions) => {
    const currentMode = backupMode;
    // We don't close the modal here anymore.
    // It will be closed inside the try/catch blocks after the native picker is handled.

    if (currentMode === 'backup') {
      try {
        if (Platform.OS !== 'android') {
          showToast(
            'Local backup to a user-selected folder is only supported on Android.',
          );
          return;
        }
        await runAfterUISettles();
        let permissions: any;
        try {
          permissions =
            await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        } catch (e: any) {
          if (isActivityUnavailable(e)) {
            await sleep(350);
            permissions =
              await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          } else {
            throw e;
          }
        }
        if (!permissions || !permissions.granted) {
          showToast(
            'Storage permission not granted. Please allow file access to create backups.',
          );
          setBackupMode(null);
          return;
        }
        if (!permissions.directoryUri) {
          showToast('No backup folder was selected.');
          setBackupMode(null);
          return;
        }
        setBackupMode(null);
        ServiceManager.manager.addTask({
          name: 'LOCAL_BACKUP',
          data: { ...options, directoryUri: permissions.directoryUri },
        });
        showToast('Backup job added to queue');
      } catch (error: any) {
        setBackupMode(null);
        showToast(`${error?.message || String(error)}`);
      }
    } else if (currentMode === 'restore') {
      try {
        await runAfterUISettles();
        let backup: any;
        try {
          backup = await DocumentPicker.getDocumentAsync({
            type: 'application/zip',
            copyToCacheDirectory: true,
          });
        } catch (e: any) {
          if (isActivityUnavailable(e)) {
            await sleep(350);
            backup = await DocumentPicker.getDocumentAsync({
              type: 'application/zip',
              copyToCacheDirectory: true,
            });
          } else {
            throw e;
          }
        }
        if (!backup || backup.canceled === true) {
          showToast('No backup file selected.');
          setBackupMode(null);
          return;
        }
        if (!backup.assets || backup.assets.length === 0) {
          showToast('No backup file selected.');
          setBackupMode(null);
          return;
        }
        setBackupMode(null);
        ServiceManager.manager.addTask({
          name: 'LOCAL_RESTORE',
          data: { ...options, backupFile: backup.assets[0] },
        });
        showToast('Restore job added to queue');
      } catch (error: any) {
        setBackupMode(null);
        showToast(`${error?.message || String(error)}`);
      }
    }
  };

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('common.backup')}
        handleGoBack={() => navigation.goBack()}
        theme={theme}
      />
      <ScrollView style={styles.paddingBottom}>
        <List.Section>
          <List.SubHeader theme={theme}>
            {getString('backupScreen.remoteBackup')}
          </List.SubHeader>
          <List.Item
            title={getString('backupScreen.selfHost')}
            description={getString('backupScreen.selfHostDesc')}
            theme={theme}
            onPress={openSelfHostModal}
          />

          <List.Item
            title={getString('backupScreen.googeDrive')}
            description={getString('backupScreen.googeDriveDesc')}
            theme={theme}
            onPress={openGoogleDriveModal}
          />
          <List.SubHeader theme={theme}>
            {getString('backupScreen.localBackup')}
          </List.SubHeader>

          <List.Item
            title={getString('backupScreen.createBackup')}
            description={getString('backupScreen.createBackupDesc')}
            onPress={handleCreateBackup}
            theme={theme}
          />

          <List.Item
            title={getString('backupScreen.restoreBackup')}
            description={getString('backupScreen.restoreBackupDesc')}
            onPress={handleRestoreBackup}
            theme={theme}
          />

          <List.Item
            title="View Restore Error Log"
            description="View detailed errors from backup restore operations"
            onPress={() => setErrorLogVisible(true)}
            theme={theme}
          />

          <List.SubHeader theme={theme}>
            {getString('backupScreen.legacyBackup')}
          </List.SubHeader>
          <List.Item
            title={`${getString('backupScreen.createBackup')} (${getString(
              'common.deprecated',
            )})`}
            description={getString('backupScreen.createBackupDesc')}
            onPress={deprecatedCreateBackup}
            theme={theme}
          />
          <List.Item
            title={`${getString('backupScreen.restoreBackup')} (${getString(
              'common.deprecated',
            )})`}
            description={getString('backupScreen.restoreBackupDesc')}
            onPress={() => deprecatedRestoreBackup()}
            theme={theme}
          />
          <List.InfoItem
            title={getString('backupScreen.restoreLargeBackupsWarning')}
            theme={theme}
          />
          <List.InfoItem
            title={getString('backupScreen.createBackupWarning')}
            theme={theme}
          />
        </List.Section>
      </ScrollView>
      <GoogleDriveModal
        visible={googleDriveModalVisible}
        theme={theme}
        closeModal={closeGoogleDriveModal}
      />
      <SelfHostModal
        theme={theme}
        visible={selfHostModalVisible}
        closeModal={closeSelfHostModal}
      />
      <BackupOptionsModal
        visible={backupMode !== null}
        theme={theme}
        title={
          backupMode === 'backup'
            ? getString('backupScreen.backupOptions')
            : getString('backupScreen.restoreOptions')
        }
        onDismiss={() => setBackupMode(null)}
        onConfirm={handleBackupOptionsConfirm}
        isRestore={backupMode === 'restore'}
      />
      <ErrorLogModal
        visible={errorLogVisible}
        onDismiss={() => setErrorLogVisible(false)}
        taskType="LOCAL_RESTORE"
        theme={theme}
      />
    </SafeAreaView>
  );
};

export default BackupSettings;

const styles = StyleSheet.create({
  paddingBottom: { paddingBottom: 40 },
});
