import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import dayjs from 'dayjs';
import { showToast } from '@utils/showToast';
import { getString } from '@strings/translations';
import {
  CACHE_DIR_PATH,
  prepareBackupData,
  restoreDataMerge,
  copyDirectoryRecursive,
} from '../utils';
import { BackupEntryName } from '../types';
import NativeFile from '@specs/NativeFile';
import NativeZipArchive from '@specs/NativeZipArchive';
import * as Clipboard from 'expo-clipboard';
import { getAllNovels } from '@database/queries/NovelQueries';
import { NOVEL_STORAGE } from '@utils/Storages';
import { BackupNovel } from '@database/types';
import { getFirstAsync, runAsync } from '@database/utils/helpers';

export interface LocalRestoreResult {
  added: { name: string; reason: string }[];
  skipped: { name: string; reason: string }[];
  errored: { name: string; reason: string }[];
  overwritten: { name: string; reason: string }[];
  missingPlugins: string[];
}

export const createBackup = async (
  includeDownloads: boolean = false,
  setMeta?: (transformer: (meta: any) => any) => void,
  preselectedDirectoryUri?: string,
) => {
  try {
    if (setMeta) {
      setMeta(meta => ({
        ...meta,
        isRunning: true,
        progress: 0,
        progressText: getString('backupScreen.preparingData'),
      }));
    }

    const datetime = dayjs().format('YYYY-MM-DD_HH_mm_ss');
    const fileName = `lnreader_backup_${datetime}.zip`;

    const uniqueCacheDir = `${CACHE_DIR_PATH}_backup_${datetime}`;

    let permissions;

    if (preselectedDirectoryUri) {
      permissions = {
        granted: true,
        directoryUri: preselectedDirectoryUri,
      };
    } else {
      try {
        permissions =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      } catch (permissionError: any) {
        showToast(`Permission request failed: ${permissionError.message}`);
        throw new Error(
          `Permission request failed: ${permissionError.message}`,
        );
      }
    }

    try {
      if (!permissions) {
        throw new Error('Permissions object is null');
      }

      if (!permissions.granted) {
        showToast('Storage permission not granted');
        if (setMeta) {
          setMeta(meta => ({
            ...meta,
            isRunning: false,
            progress: undefined,
            progressText: getString('backupScreen.failed'),
          }));
        }
        return;
      }

      if (!permissions.directoryUri) {
        showToast('No directory URI in permissions');
        throw new Error('No directory URI in permissions');
      }

      if (typeof permissions.directoryUri !== 'string') {
        showToast(
          `Directory URI is not a string: ${typeof permissions.directoryUri}`,
        );
        throw new Error(
          `Invalid directory URI type: ${typeof permissions.directoryUri}`,
        );
      }
    } catch (validationError: any) {
      showToast(`Permission validation failed: ${validationError.message}`);
      throw validationError;
    }

    if (setMeta) {
      setMeta(meta => ({
        ...meta,
        progress: 0.2,
        progressText: getString('backupScreen.preparingData'),
      }));
    }

    try {
      if (await NativeFile.exists(uniqueCacheDir)) {
        await NativeFile.unlink(uniqueCacheDir);
      }
    } catch (cleanupError: any) {}

    try {
      await prepareBackupData(uniqueCacheDir, includeDownloads);
    } catch (prepareError: any) {
      showToast(`Failed to prepare backup data: ${prepareError.message}`);
      throw new Error(`Failed to prepare backup data: ${prepareError.message}`);
    }

    if (setMeta) {
      setMeta(meta => ({
        ...meta,
        progress: 0.4,
        progressText: includeDownloads
          ? getString('backupScreen.downloadingDownloadedFiles')
          : getString('backupScreen.preparingData'),
      }));
    }

    try {
      if (includeDownloads) {
        await includeDownloadedFiles(uniqueCacheDir);
      } else {
        await includeCoversOnly(uniqueCacheDir);
      }
    } catch (filesError: any) {
      showToast(`Failed to include files: ${filesError.message}`);
      throw new Error(`Failed to include files: ${filesError.message}`);
    }

    if (setMeta) {
      setMeta(meta => ({
        ...meta,
        progress: 0.7,
        progressText: 'Creating backup archive...',
      }));
    }

    const zipPath = uniqueCacheDir + '.zip';

    try {
      await zipDirectory(uniqueCacheDir, zipPath);
    } catch (zipError: any) {
      showToast(`Failed to create ZIP archive: ${zipError.message}`);
      throw new Error(`Failed to create ZIP archive: ${zipError.message}`);
    }

    if (setMeta) {
      setMeta(meta => ({
        ...meta,
        progress: 0.9,
        progressText: 'Saving backup file...',
      }));
    }

    let fileUri;
    try {
      fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        fileName,
        'application/zip',
      );
    } catch (createFileError: any) {
      showToast(`Failed to create backup file: ${createFileError.message}`);
      throw new Error(
        `Failed to create backup file: ${createFileError.message}`,
      );
    }

    const zipFileUri = 'file://' + zipPath;

    try {
      if (!(await NativeFile.exists(zipPath))) {
        throw new Error('Backup zip file was not created');
      }

      const zipData = await FileSystem.readAsStringAsync(zipFileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await FileSystem.writeAsStringAsync(fileUri, zipData, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const backupTypeText = includeDownloads ? ' (with downloads)' : '';

      if (setMeta) {
        setMeta(meta => ({
          ...meta,
          isRunning: false,
          progress: 1,
          progressText: `Backup created: ${fileName}`,
        }));
      }

      showToast(
        getString('backupScreen.backupCreated', { fileName }) + backupTypeText,
      );
    } catch (copyError: any) {
      showToast(`Failed to save backup file: ${copyError.message}`);
      throw new Error(`Failed to save backup file: ${copyError.message}`);
    }
  } catch (error: any) {
    if (setMeta) {
      setMeta(meta => ({
        ...meta,
        isRunning: false,
        progress: undefined,
        progressText: `Backup failed: ${error.message}`,
      }));
    }
    showToast(`Backup failed: ${error.message}`);
  }
};

const includeCoversOnly = async (cacheDirPath: string) => {
  const novelsDirPath = cacheDirPath + '/novels';
  const allNovels = await getAllNovels();

  for (const novel of allNovels) {
    if (novel.cover && novel.cover.startsWith('file://')) {
      const coverPath = novel.cover.replace('file://', '').split('?')[0];
      if (await NativeFile.exists(coverPath)) {
        const backupNovelPath = `${novelsDirPath}/${novel.pluginId}/${novel.id}`;
        if (!(await NativeFile.exists(backupNovelPath))) {
          await NativeFile.mkdir(backupNovelPath);
        }
        const backupCoverPath = `${backupNovelPath}/cover.png`;
        await NativeFile.copyFile(coverPath, backupCoverPath);
      }
    }
  }
};

const includeDownloadedFiles = async (cacheDirPath: string) => {
  const novelsDirPath = cacheDirPath + '/novels';

  const { getDownloadedChapters } = await import(
    '@database/queries/ChapterQueries'
  );
  const downloadedChapters = await getDownloadedChapters();

  for (const chapter of downloadedChapters) {
    const sourceChapterPath = `${NOVEL_STORAGE}/${chapter.pluginId}/${chapter.novelId}/${chapter.id}`;
    const backupChapterPath = `${novelsDirPath}/${chapter.pluginId}/${chapter.novelId}/${chapter.id}`;

    if (await NativeFile.exists(sourceChapterPath)) {
      await copyChapterFiles(sourceChapterPath, backupChapterPath);
    }
  }

  await includeCoversOnly(cacheDirPath);
};

const copyChapterFiles = async (sourcePath: string, destPath: string) => {
  if (!(await NativeFile.exists(sourcePath))) {
    return;
  }

  if (!(await NativeFile.exists(destPath))) {
    await NativeFile.mkdir(destPath);
  }

  const items = await NativeFile.readDir(sourcePath);

  for (const item of items) {
    if (!item.isDirectory && !item.name.startsWith('.nomedia')) {
      const sourceItemPath = sourcePath + '/' + item.name;
      const destItemPath = destPath + '/' + item.name;

      if (item.name.endsWith('.html') || item.name.endsWith('.htm')) {
        await NativeFile.copyFile(sourceItemPath, destItemPath);
      }
    }
  }
};

const zipDirectory = async (sourceDirPath: string, zipFilePath: string) => {
  await NativeZipArchive.zip(sourceDirPath, zipFilePath);
};

const restoreNovelDownloads = async (
  backupNovelPath: string,
  localNovelPath: string,
  novel: any,
  backupNovelData: any,
) => {
  try {
    if (!(await NativeFile.exists(backupNovelPath))) {
      return;
    }

    const backupChapterDirs = await NativeFile.readDir(backupNovelPath);

    for (const chapterDir of backupChapterDirs) {
      if (!chapterDir.isDirectory || chapterDir.name === 'cover.png') {
        continue;
      }

      const backupChapter = backupNovelData.chapters?.find(
        (ch: any) => ch.id === parseInt(chapterDir.name, 10),
      );

      if (!backupChapter) {
        continue;
      }

      const currentChapter = await getFirstAsync<{ id: number }>([
        'SELECT * FROM Chapter WHERE novelId = ? AND path = ?',
        [novel.id, backupChapter.path],
      ]);

      if (!currentChapter) {
        continue;
      }

      const backupChapterPath = backupNovelPath + '/' + chapterDir.name;
      const localChapterPath = localNovelPath + '/' + currentChapter.id;

      const chapterIndexFile = localChapterPath + '/index.html';
      const backupIndexFile = backupChapterPath + '/index.html';

      if (await NativeFile.exists(backupIndexFile)) {
        if (!(await NativeFile.exists(chapterIndexFile))) {
          if (!(await NativeFile.exists(localChapterPath))) {
            await NativeFile.mkdir(localChapterPath);
          }

          await copyDirectoryRecursive(backupChapterPath, localChapterPath);

          await runAsync([
            [
              'UPDATE Chapter SET isDownloaded = 1 WHERE id = ?',
              [currentChapter.id],
            ],
          ]);
        }
      }
    }
  } catch (error: any) {}
};

export const restoreBackup = async (
  includeDownloads: boolean = false,
  setMeta?: (transformer: (meta: any) => any) => void,
  preselectedBackupFile?: any,
) => {
  const result: LocalRestoreResult = {
    added: [],
    skipped: [],
    errored: [],
    overwritten: [],
    missingPlugins: [],
  };

  try {
    if (setMeta) {
      setMeta(meta => ({
        ...meta,
        isRunning: true,
        progress: 0,
        progressText: 'Selecting backup file...',
      }));
    }

    const datetime = dayjs().format('YYYY-MM-DD_HH_mm_ss_SSS');
    const uniqueRestoreDir = `${CACHE_DIR_PATH}_restore_${datetime}`;

    let backup;

    if (preselectedBackupFile) {
      backup = {
        canceled: false,
        assets: [preselectedBackupFile],
      };
    } else {
      try {
        backup = await DocumentPicker.getDocumentAsync({
          type: 'application/zip',
          copyToCacheDirectory: true,
        });
      } catch (pickerError: any) {
        showToast(`Document picker failed: ${pickerError.message}`);
        throw new Error(`Document picker failed: ${pickerError.message}`);
      }
    }

    try {
      if (!backup) {
        throw new Error('Document picker returned null');
      }

      if (backup.canceled === true) {
        if (setMeta) {
          setMeta(meta => ({
            ...meta,
            isRunning: false,
            progress: undefined,
            progressText: 'Restore cancelled',
          }));
        }
        return;
      }

      if (!backup.assets) {
        showToast('No assets found in document picker result');
        throw new Error('No assets found in document picker result');
      }

      if (!Array.isArray(backup.assets) || backup.assets.length === 0) {
        showToast('No backup file selected');
        throw new Error('No backup file selected');
      }

      const backupFile = backup.assets[0];

      if (!backupFile) {
        showToast('Backup file is null or undefined');
        throw new Error('Backup file is null or undefined');
      }

      if (!backupFile.uri) {
        showToast('Backup file has no URI');
        throw new Error('Invalid backup file - no URI');
      }

      if (typeof backupFile.uri !== 'string') {
        showToast(`Backup file URI is not a string: ${typeof backupFile.uri}`);
        throw new Error(
          `Invalid backup file URI type: ${typeof backupFile.uri}`,
        );
      }
    } catch (validationError: any) {
      showToast(`Backup validation failed: ${validationError.message}`);
      throw validationError;
    }

    const backupFile = backup.assets[0];

    if (setMeta) {
      setMeta(meta => ({
        ...meta,
        progress: 0.1,
        progressText: 'Extracting backup...',
      }));
    }

    const extractPath = uniqueRestoreDir;

    try {
      if (await NativeFile.exists(extractPath)) {
        await NativeFile.unlink(extractPath);
      }

      await NativeFile.mkdir(extractPath);
    } catch (pathError: any) {
      showToast(`Failed to prepare extraction path: ${pathError.message}`);
      throw new Error(
        `Failed to prepare extraction path: ${pathError.message}`,
      );
    }

    let sourceFilePath = backupFile.uri;
    if (sourceFilePath.startsWith('file://')) {
      sourceFilePath = sourceFilePath.replace('file://', '');
    }

    try {
      await NativeZipArchive.unzip(sourceFilePath, extractPath);
    } catch (directError: any) {
      showToast('Direct unzip failed, trying alternative method...');

      const tempZipPath = uniqueRestoreDir + '_temp.zip';
      try {
        if (await NativeFile.exists(tempZipPath)) {
          await NativeFile.unlink(tempZipPath);
        }

        const zipData = await FileSystem.readAsStringAsync(backupFile.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        await NativeFile.writeFile(tempZipPath, zipData);

        if (!(await NativeFile.exists(tempZipPath))) {
          throw new Error('Failed to create temporary backup file');
        }

        await NativeZipArchive.unzip(tempZipPath, extractPath);

        if (await NativeFile.exists(tempZipPath)) {
          await NativeFile.unlink(tempZipPath);
        }
      } catch (copyError: any) {
        showToast(`Failed to extract backup: ${copyError.message}`);
        result.errored.push({
          name: 'Backup File',
          reason: `Failed to extract backup: ${copyError.message}`,
        });
        throw new Error(`Failed to extract backup: ${copyError.message}`);
      }
    }

    if (setMeta) {
      setMeta(meta => ({
        ...meta,
        progress: 0.3,
        progressText: getString('backupScreen.restoringData'),
      }));
    }

    try {
      await restoreDataMerge(extractPath, result, setMeta);
    } catch (restoreError: any) {
      throw new Error(`Database restore failed: ${restoreError.message}`);
    }

    if (setMeta) {
      setMeta(meta => ({
        ...meta,
        progress: 0.6,
        progressText: includeDownloads
          ? 'Restoring downloaded files...'
          : 'Restoring covers...',
      }));
    }

    await restoreNovelFiles(extractPath, result, includeDownloads);

    if (setMeta) {
      setMeta(meta => ({
        ...meta,
        progress: 0.95,
        progressText: 'Preparing summary...',
      }));
    }

    const getSummaryText = (results: LocalRestoreResult) => {
      let summary = 'LOCAL BACKUP RESTORE COMPLETED:\n\n';

      summary += `ADDED (${results.added.length}):\n`;
      results.added.forEach(item => {
        summary += `- ${item.name}: ${item.reason}\n`;
      });

      summary += `\nOVERWRITTEN (${results.overwritten.length}):\n`;
      results.overwritten.forEach(item => {
        summary += `- ${item.name}: ${item.reason}\n`;
      });

      summary += `\nSKIPPED (${results.skipped.length}):\n`;
      results.skipped.forEach(item => {
        summary += `- ${item.name}: ${item.reason}\n`;
      });

      summary += `\nERRORED (${results.errored.length}):\n`;
      results.errored.forEach(item => {
        summary += `- ${item.name}: ${item.reason}\n`;
      });

      if (results.missingPlugins.length > 0) {
        summary += `\nMISSING PLUGINS (${results.missingPlugins.length}):\n`;
        results.missingPlugins.forEach(plugin => {
          summary += `- ${plugin}: Plugin not installed locally\n`;
        });
      }

      summary += `\nBackup File: ${backupFile.name}`;
      return summary;
    };

    const summaryText = getSummaryText(result);
    await Clipboard.setStringAsync(summaryText);

    let successMessage = `Restore completed: ${result.added.length} added, ${result.overwritten.length} overwritten, ${result.skipped.length} skipped`;

    if (result.errored.length > 0) {
      successMessage += `, ${result.errored.length} errored`;
    }

    if (result.missingPlugins.length > 0) {
      successMessage += `, ${result.missingPlugins.length} missing plugins`;
    }

    successMessage += `. ${getString('common.copiedToClipboard', {
      name: 'Details',
    })}`;

    if (setMeta) {
      setMeta(meta => ({
        ...meta,
        isRunning: false,
        progress: 1,
        progressText: successMessage,
        result: result,
      }));
    }

    showToast(successMessage);
  } catch (error: any) {
    if (!result.errored.find(e => e.name === 'Restore Process')) {
      result.errored.push({
        name: 'Restore Process',
        reason: error.message,
      });
    }

    const errorSummary = `LOCAL BACKUP RESTORE FAILED:\nError: ${error.message}\nPartial Results:\nAdded: ${result.added.length}, Overwritten: ${result.overwritten.length}, Skipped: ${result.skipped.length}, Errored: ${result.errored.length}`;
    await Clipboard.setStringAsync(errorSummary);

    if (setMeta) {
      setMeta(meta => ({
        ...meta,
        isRunning: false,
        progress: undefined,
        progressText: `Restore failed: ${error.message}`,
      }));
    }

    showToast(getString('backupScreen.failed'));
  }
};

const restoreNovelFiles = async (
  extractPath: string,
  result: LocalRestoreResult,
  restoreDownloads: boolean,
) => {
  const backupNovelsPath = extractPath + '/novels';

  if (!(await NativeFile.exists(backupNovelsPath))) {
    return;
  }

  const { getPlugin } = await import('@plugins/pluginManager');
  const allNovels = await getAllNovels();
  const pluginDirs = await NativeFile.readDir(backupNovelsPath);

  for (const pluginDir of pluginDirs) {
    if (!pluginDir.isDirectory) continue;

    const pluginId = pluginDir.name;
    const plugin = getPlugin(pluginId);

    if (!plugin) {
      if (!result.missingPlugins.includes(pluginId)) {
        result.missingPlugins.push(pluginId);
      }
      continue;
    }

    const backupPluginPath = backupNovelsPath + '/' + pluginId;
    const localPluginPath = NOVEL_STORAGE + '/' + pluginId;

    if (!(await NativeFile.exists(localPluginPath))) {
      await NativeFile.mkdir(localPluginPath);
    }

    const novelDirs = await NativeFile.readDir(backupPluginPath);

    for (const novelDir of novelDirs) {
      if (!novelDir.isDirectory) continue;

      const backupNovelPath = backupPluginPath + '/' + novelDir.name;
      let matchingNovel = null;
      let backupNovelData: BackupNovel | null = null;

      const backupDataPath =
        extractPath + '/' + BackupEntryName.NOVEL_AND_CHAPTERS;
      if (await NativeFile.exists(backupDataPath)) {
        const backupNovelFile = backupDataPath + '/' + novelDir.name + '.json';
        if (await NativeFile.exists(backupNovelFile)) {
          backupNovelData = JSON.parse(
            await NativeFile.readFile(backupNovelFile),
          ) as BackupNovel;
          matchingNovel = allNovels.find(
            n => n.pluginId === pluginId && n.path === backupNovelData?.path,
          );
        }
      }

      const restoreNovelAndDownloads = async (
        novelToRestore: any,
        isNew: boolean,
        backupNovelDataForRestore: BackupNovel | null,
      ) => {
        const localNovelPath = localPluginPath + '/' + novelToRestore.id;
        const backupCoverPath = backupNovelPath + '/cover.png';

        if (await NativeFile.exists(backupCoverPath)) {
          if (!(await NativeFile.exists(localNovelPath))) {
            await NativeFile.mkdir(localNovelPath);
          }
          const localCoverPath = localNovelPath + '/cover.png';
          await NativeFile.copyFile(backupCoverPath, localCoverPath);
          const novelCoverUri = 'file://' + localCoverPath + '?' + Date.now();
          await runAsync([
            [
              'UPDATE Novel SET cover = ? WHERE id = ?',
              [novelCoverUri, novelToRestore.id],
            ],
          ]);
        }

        if (restoreDownloads && backupNovelDataForRestore) {
          await restoreNovelDownloads(
            backupNovelPath,
            localNovelPath,
            novelToRestore,
            backupNovelDataForRestore,
          );
        }

        if (isNew) {
          result.added.push({
            name: novelToRestore.name,
            reason: `Novel added from backup ${
              restoreDownloads ? 'with downloads' : 'with cover'
            }`,
          });
        }
      };

      if (matchingNovel) {
        await restoreNovelAndDownloads(matchingNovel, false, backupNovelData);
      } else if (backupNovelData) {
        try {
          const { insertNovelAndChapters } = await import(
            '@database/queries/NovelQueries'
          );
          const sourceNovel = {
            id: undefined,
            path: backupNovelData.path,
            name: backupNovelData.name,
            cover: backupNovelData.cover,
            summary: backupNovelData.summary,
            author: backupNovelData.author,
            artist: backupNovelData.artist,
            status: backupNovelData.status as any,
            genres: backupNovelData.genres,
            totalPages: backupNovelData.totalPages,
            chapters: backupNovelData.chapters || [],
          };

          const novelId = await insertNovelAndChapters(
            pluginId,
            sourceNovel,
            true,
          );

          if (novelId) {
            const novelChapters = backupNovelData.chapters || [];

            for (const chapter of novelChapters) {
              if (chapter.id == null) {
                continue;
              }

              const chapterPath = `${backupPluginPath}/${novelDir.name}/${chapter.id}`;

              if (await NativeFile.exists(chapterPath)) {
                const localChapterPath = `${localPluginPath}/${novelId}`;

                if (!(await NativeFile.exists(localChapterPath))) {
                  await NativeFile.mkdir(localChapterPath);
                }

                await NativeFile.copyFile(
                  chapterPath + '/index.html',
                  localChapterPath + '/index.html',
                );

                await runAsync([
                  [
                    'UPDATE Chapter SET isDownloaded = 1 WHERE id = ?',
                    [novelId],
                  ],
                ]);
              }
            }

            result.added.push({
              name: sourceNovel.name,
              reason: 'Novel and chapters added from backup',
            });
          }
        } catch (insertError: any) {
          result.errored.push({
            name: `Novel: ${novelDir.name}`,
            reason: `Failed to restore novel: ${insertError.message}`,
          });
          showToast(`Failed to restore novel: ${insertError.message}`);
        }
      }
    }
  }

  for (const pluginDir of pluginDirs) {
    if (!pluginDir.isDirectory) continue;

    const pluginId = pluginDir.name;
    const plugin = getPlugin(pluginId);

    if (!plugin) {
      continue;
    }

    const backupPluginPath = backupNovelsPath + '/' + pluginId;
    const localPluginPath = NOVEL_STORAGE + '/' + pluginId;

    const novelDirs = await NativeFile.readDir(backupPluginPath);

    for (const novelDir of novelDirs) {
      if (!novelDir.isDirectory) continue;

      const backupNovelPath = backupPluginPath + '/' + novelDir.name;
      let matchingNovel = null;
      let backupNovelData: BackupNovel | null = null;

      const backupDataPath =
        extractPath + '/' + BackupEntryName.NOVEL_AND_CHAPTERS;
      if (await NativeFile.exists(backupDataPath)) {
        const backupNovelFile = backupDataPath + '/' + novelDir.name + '.json';
        if (await NativeFile.exists(backupNovelFile)) {
          backupNovelData = JSON.parse(
            await NativeFile.readFile(backupNovelFile),
          ) as BackupNovel;
          matchingNovel = allNovels.find(
            n => n.pluginId === pluginId && n.path === backupNovelData?.path,
          );
        }
      }

      if (matchingNovel && backupNovelData) {
        await restoreNovelDownloads(
          backupNovelPath,
          localPluginPath,
          matchingNovel,
          backupNovelData,
        );
      }
    }
  }
};
