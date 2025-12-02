import * as DocumentPicker from 'expo-document-picker';
import * as Notifications from 'expo-notifications';
import BackgroundService from 'react-native-background-actions';
import { InteractionManager, AppState, AppStateStatus } from 'react-native';

import { getPlugin } from '@plugins/pluginManager';
import { restoreLibrary } from '@database/queries/NovelQueries';
import { getLibraryNovelsFromDb } from '@database/queries/LibraryQueries';
import { showToast } from '@utils/showToast';
import dayjs from 'dayjs';
import { NovelInfo } from '@database/types';
import { getString } from '@strings/translations';
import * as FileSystem from 'expo-file-system';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
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
            // @ts-ignore support both RN APIs
            sub?.remove?.();
            resolve();
          }
        },
      );
    });
  }
  await delay(0);
};

export const createBackup = async () => {
  try {
    await runAfterUISettles();
    const novels = getLibraryNovelsFromDb();

    const datetime = dayjs().format('YYYY-MM-DD_HH_mm');
    const fileName = 'lnreader_backup_' + datetime + '.json';
    const fileContent = JSON.stringify(novels);
    let permissions;
    try {
      permissions =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    } catch (e: any) {
      if (isActivityUnavailable(e)) {
        await delay(350);
        permissions =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      } else {
        throw e;
      }
    }

    if (!permissions.granted) {
      showToast(getString('backupScreen.failed'));
      return;
    }
    const directoryUri = permissions.directoryUri;
    await FileSystem.StorageAccessFramework.createFileAsync(
      directoryUri,
      fileName,
      'application/json',
    )
      .then(async uri => {
        await FileSystem.writeAsStringAsync(uri, fileContent, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        showToast(getString('backupScreen.legacy.backupCreated', { fileName }));
      })
      .catch(error => {
        showToast(
          getString('backupScreen.failed', {
            message: error.message,
          }),
        );
      });
  } catch (error: any) {
    showToast(error.message);
  } finally {
    BackgroundService.stop();
  }
};

interface TaskData {
  delay: number;
}

export const restoreBackup = async () => {
  try {
    await runAfterUISettles();
    const backup = await (async () => {
      try {
        return await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
        });
      } catch (e: any) {
        if (isActivityUnavailable(e)) {
          await delay(350);
          return await DocumentPicker.getDocumentAsync({
            copyToCacheDirectory: true,
          });
        }
        throw e;
      }
    })();
    let novelsString = '';

    if (backup.assets && backup.assets[0]) {
      novelsString = await FileSystem.StorageAccessFramework.readAsStringAsync(
        backup.assets[0].uri,
      );
    }
    const novels: NovelInfo[] = await JSON.parse(novelsString);
    if (novels.length === 0) {
      showToast(getString('backupScreen.legacy.noAvailableBackup'));
      return;
    }
    const notificationOptions = {
      taskName: 'Backup Restore',
      taskTitle: getString('backupScreen.restorinBackup'),
      taskDesc: '(0/' + novels.length + ')',
      taskIcon: { name: 'notification_icon', type: 'drawable' },
      color: '#00adb5',
      parameters: { delay: 1000 },
      linkingURI: 'lnreader://updates',
      progressBar: { max: novels.length, value: 0 },
    };

    const restoreBackupBackgroundAction = async (taskData?: TaskData) => {
      let errorString = '';
      let restoredNovelsCount = 0;
      for (let i = 0; BackgroundService.isRunning() && i < novels.length; i++) {
        try {
          if (BackgroundService.isRunning()) {
            const plugin = getPlugin(novels[i].pluginId);
            if (!plugin) {
              throw new Error(`No plugin found with id ${novels[i].pluginId}`);
            }
            BackgroundService.updateNotification({
              taskTitle: novels[i].name,
              taskDesc: '(' + (i + 1) + '/' + novels.length + ')',
              progressBar: { max: novels.length, value: i + 1 },
            });
            await restoreLibrary(novels[i]);
            restoredNovelsCount += 1;
            const nextNovelIndex = i + 1;

            if (
              nextNovelIndex in novels &&
              novels[nextNovelIndex].pluginId === novels[i].pluginId
            ) {
              await delay(taskData?.delay || 0);
            }
          }
        } catch (e) {
          errorString += e + '\n';
        }
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: getString('backupScreen.legacy.libraryRestored'),
          body:
            getString('backupScreen.legacy.novelsRestored', {
              num: restoredNovelsCount,
            }) +
            '\n' +
            errorString,
        },
        trigger: null,
      });
      BackgroundService.stop();
    };

    if (novels.length > 0) {
      await BackgroundService.start<TaskData>(
        restoreBackupBackgroundAction,
        notificationOptions,
      );
    }
  } catch (error: any) {
    showToast(error.message);
  } finally {
    BackgroundService.stop();
  }
};
