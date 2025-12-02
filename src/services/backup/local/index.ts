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
import NativeFile from '@specs/NativeFile';
import NativeZipArchive from '@specs/NativeZipArchive';
import * as Clipboard from 'expo-clipboard';
import { getAllNovels, getNovelById } from '@database/queries/NovelQueries';
import { getDownloadedChapters } from '@database/queries/ChapterQueries';
import { NOVEL_STORAGE } from '@utils/Storages';
import { BackupNovel } from '@database/types';
import { runAsync } from '@database/utils/helpers';
import { BackupEntryName } from '../types';
import { detectCoverStorage } from '@utils/detectCoverStorage';
import { sleep } from '@utils/sleep';

export interface LocalRestoreResult {
  added: { name: string; reason: string }[];
  skipped: { name: string; reason: string }[];
  errored: { name: string; reason: string }[];
  overwritten: { name: string; reason: string }[];
  missingPlugins: string[];
}

interface BackupProgress {
  isRunning: boolean;
  progress?: number;
  progressText: string;
}

type MetaSetter = (transformer: (meta: any) => any) => void;

/**
 * Updates the progress metadata for backup/restore operations.
 */
const updateProgress = (
  setMeta: MetaSetter | undefined,
  updates: Partial<BackupProgress>,
): void => {
  if (setMeta) {
    setMeta(meta => ({ ...meta, ...updates }));
  }
};

/**
 * Validates storage permissions for backup operations.
 */
const validatePermissions = (permissions: any): void => {
  if (!permissions) {
    throw new Error('Permissions object is null');
  }

  if (!permissions.granted) {
    throw new Error('Storage permission not granted');
  }

  if (!permissions.directoryUri) {
    throw new Error('No directory URI in permissions');
  }

  if (typeof permissions.directoryUri !== 'string') {
    throw new Error(
      `Invalid directory URI type: ${typeof permissions.directoryUri}`,
    );
  }

  // Must be a SAF tree URI on Android, e.g., content://.../tree/Primary%3ADocuments
  const uri: string = permissions.directoryUri as string;
  if (!uri.startsWith('content://') || !uri.includes('/tree/')) {
    throw new Error('Invalid directory URI format for Android SAF');
  }
};

const isValidTreeUri = (uri?: string): boolean => {
  return !!uri && uri.startsWith('content://') && uri.includes('/tree/');
};

/**
 * Requests directory permissions for backup operations.
 */
const requestDirectoryPermissions = async (
  preselectedDirectoryUri?: string,
): Promise<{ granted: boolean; directoryUri: string }> => {
  if (isValidTreeUri(preselectedDirectoryUri)) {
    return {
      granted: true,
      directoryUri: preselectedDirectoryUri!,
    };
  }

  // Do not attempt to open SAF picker from background; instruct user to preselect
  throw new Error(
    'No backup folder selected. Please pick a backup folder first from the Backup screen.',
  );
};

/**
 * Creates a backup ZIP archive with optional downloaded files.
 */
export const createBackup = async (
  includeDownloads: boolean = false,
  setMeta?: MetaSetter,
  preselectedDirectoryUri?: string,
  options?: {
    includeCovers?: boolean;
    includeChapters?: boolean;
    includeSettings?: boolean;
    includeRepositories?: boolean;
    includePlugins?: boolean;
  },
): Promise<void> => {
  const datetime = dayjs().format('YYYY-MM-DD_HH_mm_ss');
  const fileName = `lnreader_backup_${datetime}.zip`;
  const uniqueCacheDir = `${CACHE_DIR_PATH}_backup_${datetime}`;
  const zipPath = `${uniqueCacheDir}.zip`;

  try {
    updateProgress(setMeta, {
      isRunning: true,
      progress: 0,
      progressText: getString('backupScreen.preparingData'),
    });

    // Request and validate permissions
    const permissions = await requestDirectoryPermissions(
      preselectedDirectoryUri,
    );

    try {
      validatePermissions(permissions);
    } catch (e: any) {
      showToast('Invalid backup folder. Please pick a different folder.');
      throw e;
    }

    if (await NativeFile.exists(uniqueCacheDir)) {
      await NativeFile.unlink(uniqueCacheDir);
    }

    updateProgress(setMeta, {
      progress: 0.2,
      progressText: getString('backupScreen.preparingData'),
    });

    // Prepare backup data with options
    await prepareBackupData(
      uniqueCacheDir,
      includeDownloads || options?.includeChapters !== false,
      options,
    );

    updateProgress(setMeta, {
      progress: 0.4,
      progressText: includeDownloads
        ? getString('backupScreen.downloadingDownloadedFiles')
        : getString('backupScreen.preparingData'),
    });

    // Include files based on options
    if (includeDownloads) {
      await includeDownloadedFiles(uniqueCacheDir);
    }

    // Always include local novel files regardless of includeDownloads
    await includeLocalNovelFiles(uniqueCacheDir);

    updateProgress(setMeta, {
      progress: 0.7,
      progressText: 'Creating backup archive...',
    });

    await zipDirectory(uniqueCacheDir, zipPath);

    updateProgress(setMeta, {
      progress: 0.9,
      progressText: 'Saving backup file...',
    });

    let fileUri: string;
    try {
      fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        fileName,
        'application/zip',
      );
    } catch (createErr: any) {
      throw new Error('Failed to create backup file in the selected folder.');
    }

    if (!(await NativeFile.exists(zipPath))) {
      throw new Error('Backup zip file was not created');
    }

    try {
      await NativeFile.copyFile(zipPath, fileUri);
    } catch (copyErr: unknown) {
      const copyErrMsg =
        copyErr instanceof Error ? copyErr.message : String(copyErr);
      throw new Error(`Failed to save backup file: ${copyErrMsg}`);
    }

    // Clean up temp files
    if (await NativeFile.exists(uniqueCacheDir)) {
      await NativeFile.unlink(uniqueCacheDir);
    }
    if (await NativeFile.exists(zipPath)) {
      await NativeFile.unlink(zipPath);
    }

    const backupTypeText = includeDownloads ? ' (with downloads)' : '';

    updateProgress(setMeta, {
      isRunning: false,
      progress: 1,
    });

    showToast(
      getString('backupScreen.backupCreated', { fileName }) + backupTypeText,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    updateProgress(setMeta, {
      isRunning: false,
      progress: undefined,
      progressText: `Backup failed: ${message}`,
    });

    showToast(`${message}`);
  }
};

/**
 * Copies downloaded chapter files to backup directory as novels/{pluginId}/{novelId}/{chapterId}/
 */
const includeDownloadedFiles = async (cacheDirPath: string): Promise<void> => {
  const novelsDirPath = `${cacheDirPath}/novels`;
  const downloadedChapters = await getDownloadedChapters();

  for (const chapter of downloadedChapters) {
    const sourceChapterPath = `${NOVEL_STORAGE}/${chapter.pluginId}/${chapter.novelId}/${chapter.id}`;
    const backupChapterPath = `${novelsDirPath}/${chapter.pluginId}/${chapter.novelId}/${chapter.id}`;

    if (await NativeFile.exists(sourceChapterPath)) {
      await copyChapterFiles(sourceChapterPath, backupChapterPath);
    }
  }
};

/**
 * Always include local novel chapter files in backup regardless of includeDownloads option.
 * Scans NOVEL_STORAGE/local/{novelId}/{chapterId}/ and copies HTML files.
 */
const includeLocalNovelFiles = async (cacheDirPath: string): Promise<void> => {
  const novelsDirPath = `${cacheDirPath}/${BackupEntryName.NOVELS}`;
  const novels = await getAllNovels();
  const localNovels = novels.filter(n => n.isLocal && n.inLibrary === 1);

  for (const novel of localNovels) {
    const pluginId = novel.pluginId; // expected 'local'
    const sourceNovelDir = `${NOVEL_STORAGE}/${pluginId}/${novel.id}`;
    const destNovelDir = `${novelsDirPath}/${pluginId}/${novel.id}`;

    if (!(await NativeFile.exists(sourceNovelDir))) {
      continue;
    }

    if (!(await NativeFile.exists(destNovelDir))) {
      await NativeFile.mkdir(destNovelDir);
    }

    const entries = await NativeFile.readDir(sourceNovelDir);
    for (const entry of entries) {
      // Chapters are stored as subdirectories named by chapterId
      if (!entry.isDirectory) continue;
      if (!/^\d+$/.test(entry.name)) continue;

      const chapterSource = `${sourceNovelDir}/${entry.name}`;
      const chapterDest = `${destNovelDir}/${entry.name}`;

      // Only copy if index.html exists to avoid copying stray folders
      if (await NativeFile.exists(`${chapterSource}/index.html`)) {
        await copyDirectoryRecursive(chapterSource, chapterDest);
      }
    }
  }
};

/**
 * Copies HTML chapter files from source to destination with mkdir and error handling.
 */
const copyChapterFiles = async (
  sourcePath: string,
  destPath: string,
): Promise<void> => {
  if (!(await NativeFile.exists(sourcePath))) {
    return;
  }

  if (!(await NativeFile.exists(destPath))) {
    await NativeFile.mkdir(destPath);
  }

  const items = await NativeFile.readDir(sourcePath);

  for (const item of items) {
    const isHtmlFile =
      item.name.endsWith('.html') || item.name.endsWith('.htm');
    const isNomediaFile = item.name.startsWith('.nomedia');

    if (!item.isDirectory && !isNomediaFile && isHtmlFile) {
      const sourceItemPath = `${sourcePath}/${item.name}`;
      const destItemPath = `${destPath}/${item.name}`;

      try {
        await NativeFile.copyFile(sourceItemPath, destItemPath);
      } catch {}
    }
  }
};

/**
 * Creates a ZIP archive from a directory.
 */
const zipDirectory = async (
  sourceDirPath: string,
  zipFilePath: string,
): Promise<void> => {
  await NativeZipArchive.zip(sourceDirPath, zipFilePath);
};

/**
 * Validates backup file selection from document picker.
 */
const validateBackupFile = (backup: any): void => {
  if (!backup) {
    throw new Error('Document picker returned null');
  }

  if (backup.canceled === true) {
    throw new Error('Restore cancelled');
  }

  if (
    !backup.assets ||
    !Array.isArray(backup.assets) ||
    backup.assets.length === 0
  ) {
    throw new Error('No backup file selected');
  }

  const backupFile = backup.assets[0];

  if (!backupFile) {
    throw new Error('Backup file is null or undefined');
  }

  if (!backupFile.uri || typeof backupFile.uri !== 'string') {
    throw new Error('Invalid backup file - no valid URI');
  }
};

/**
 * Extracts backup ZIP file to specified directory.
 */
const extractBackupFile = async (
  backupUri: string,
  extractPath: string,
): Promise<void> => {
  if (await NativeFile.exists(extractPath)) {
    await NativeFile.unlink(extractPath);
  }

  await NativeFile.mkdir(extractPath);

  const sourceFilePath = backupUri.startsWith('file://')
    ? backupUri.replace('file://', '')
    : backupUri;

  try {
    await NativeZipArchive.unzip(sourceFilePath, extractPath);
  } catch (directError: unknown) {
    const tempZipPath = `${extractPath}_temp.zip`;

    try {
      if (await NativeFile.exists(tempZipPath)) {
        await NativeFile.unlink(tempZipPath);
      }

      await NativeFile.copyFile(backupUri, tempZipPath);

      if (!(await NativeFile.exists(tempZipPath))) {
        throw new Error('Failed to create temporary backup file');
      }

      await NativeZipArchive.unzip(tempZipPath, extractPath);

      if (await NativeFile.exists(tempZipPath)) {
        await NativeFile.unlink(tempZipPath);
      }
    } catch (copyError: unknown) {
      const message =
        copyError instanceof Error ? copyError.message : 'Unknown error';
      throw new Error(`Failed to extract backup: ${message}`);
    }
  }
};

/**
 * Generates summary text for restore results.
 */
const generateRestoreSummary = (
  results: LocalRestoreResult,
  backupFileName: string,
): string => {
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

  summary += `\nBackup File: ${backupFileName}`;
  return summary;
};

/**
 * Restores a backup archive to the local database and storage.
 */
export const restoreBackup = async (
  includeDownloads: boolean = false,
  setMeta?: MetaSetter,
  preselectedBackup?: any,
  options?: {
    includeCovers?: boolean;
    includeChapters?: boolean;
    includeSettings?: boolean;
    includeRepositories?: boolean;
    includePlugins?: boolean;
  },
): Promise<void> => {
  const result: LocalRestoreResult = {
    added: [],
    skipped: [],
    errored: [],
    overwritten: [],
    missingPlugins: [],
  };

  try {
    updateProgress(setMeta, {
      isRunning: true,
      progress: 0,
      progressText: 'Selecting backup file...',
    });

    const datetime = dayjs().format('YYYY-MM-DD_HH_mm_ss_SSS');
    const uniqueRestoreDir = `${CACHE_DIR_PATH}_restore_${datetime}`;

    const backup = preselectedBackup
      ? { canceled: false, assets: [preselectedBackup] }
      : await DocumentPicker.getDocumentAsync({
          type: 'application/zip',
          copyToCacheDirectory: true,
        });

    validateBackupFile(backup);

    const backupFile = backup.assets[0];

    updateProgress(setMeta, {
      progress: 0.1,
      progressText: 'Extracting backup...',
    });

    await extractBackupFile(backupFile.uri, uniqueRestoreDir);

    updateProgress(setMeta, {
      progress: 0.3,
      progressText: getString('backupScreen.restoringData'),
    });

    await restoreDataMerge(uniqueRestoreDir, result, setMeta, {
      includePlugins: options?.includePlugins,
    });

    if (options?.includeCovers !== false) {
      updateProgress(setMeta, {
        progress: 0.6,
        progressText: includeDownloads
          ? 'Restoring downloaded files...'
          : 'Restoring covers...',
      });

      await restoreNovelFiles(uniqueRestoreDir, result, includeDownloads);
    }

    if (await NativeFile.exists(uniqueRestoreDir)) {
      await NativeFile.unlink(uniqueRestoreDir);
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    updateProgress(setMeta, {
      progress: 0.95,
      progressText: 'Preparing summary...',
    });

    const summaryText = generateRestoreSummary(result, backupFile.name);
    await Clipboard.setStringAsync(summaryText);

    const successMessage = buildSuccessMessage(result);

    updateProgress(setMeta, {
      isRunning: false,
      progress: 1,
      progressText: successMessage,
    });

    showToast(successMessage);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (!result.errored.find(e => e.name === 'Restore Process')) {
      result.errored.push({
        name: 'Restore Process',
        reason: message,
      });
    }

    const errorSummary = `LOCAL BACKUP RESTORE FAILED:\nError: ${message}\nPartial Results:\nAdded: ${result.added.length}, Overwritten: ${result.overwritten.length}, Skipped: ${result.skipped.length}, Errored: ${result.errored.length}`;
    await Clipboard.setStringAsync(errorSummary);

    updateProgress(setMeta, {
      isRunning: false,
      progress: undefined,
      progressText: `Restore failed: ${message}`,
    });

    showToast(getString('backupScreen.failed'));
  }
};

/**
 * Builds success message from restore results.
 */
const buildSuccessMessage = (result: LocalRestoreResult): string => {
  const parts = [
    `${result.added.length} added`,
    `${result.overwritten.length} overwritten`,
    `${result.skipped.length} skipped`,
  ];

  if (result.errored.length > 0) {
    parts.push(`${result.errored.length} errored`);
  }

  if (result.missingPlugins.length > 0) {
    parts.push(`${result.missingPlugins.length} missing plugins`);
  }

  return `Restore completed: ${parts.join(', ')}. ${getString(
    'common.copiedToClipboard',
    {
      name: 'Details',
    },
  )}`;
};

/**
 * Restores novel files and downloads from backup using per-novel folders.
 * Assumes DB merge of novels/chapters is already done by restoreDataMerge.
 */
const restoreNovelFiles = async (
  extractPath: string,
  result: LocalRestoreResult,
  restoreDownloads: boolean,
): Promise<void> => {
  const backupNovelsPath = `${extractPath}/novels`;
  if (!(await NativeFile.exists(backupNovelsPath))) {
    return;
  }

  const currentNovels = await getAllNovels();
  const mapByPath = new Map(
    currentNovels
      .filter(n => !n.isLocal)
      .map(n => [`${n.pluginId}:${n.path}`, n]),
  );
  const mapByName = new Map(
    currentNovels
      .filter(n => n.isLocal)
      .map(n => [`${n.pluginId}:${n.name}`, n]),
  );

  // Build a map of novelId from result for efficient lookup
  const resultNovelMap = new Map<string, number>();

  // Add all novels from results (added, overwritten, and skipped)
  for (const item of [
    ...(result.added || []),
    ...(result.overwritten || []),
    ...(result.skipped || []),
  ]) {
    if ((item as any).novelId) {
      resultNovelMap.set(item.name, (item as any).novelId);
    }
  }

  const pluginDirs = await NativeFile.readDir(backupNovelsPath);
  for (const pluginDir of pluginDirs) {
    if (!pluginDir.isDirectory) continue;
    const pluginId = pluginDir.name;
    const novelDirs = await NativeFile.readDir(
      `${backupNovelsPath}/${pluginId}`,
    );

    for (const novelDir of novelDirs) {
      await sleep(10);
      if (!novelDir.isDirectory) continue;
      const perNovelPath = `${backupNovelsPath}/${pluginId}/${novelDir.name}`;
      const novelJsonPath = `${perNovelPath}/novel.json`;
      if (!(await NativeFile.exists(novelJsonPath))) continue;

      try {
        const jsonString = await NativeFile.readFile(novelJsonPath);
        const jsonContent = JSON.parse(jsonString) as BackupNovel;
        const key = jsonContent.isLocal
          ? `${pluginId}:${jsonContent.name}`
          : `${pluginId}:${jsonContent.path}`;
        const currentNovel = (jsonContent.isLocal ? mapByName : mapByPath).get(
          key,
        );
        if (!currentNovel) {
          result.skipped.push({
            name: jsonContent.name || novelDir.name,
            reason: 'Novel not present after DB restore',
          });
          continue;
        }

        // Restore cover for ALL novels (added, overwritten, and skipped)
        await restoreNovelCover(
          perNovelPath,
          currentNovel.id,
          pluginId,
          currentNovel.cover,
        );

        // Determine if we should restore chapter files
        const shouldRestoreFiles = jsonContent.isLocal || restoreDownloads;

        // Restore chapter files
        if (shouldRestoreFiles && jsonContent.chapters) {
          for (const chapter of jsonContent.chapters) {
            const chapterId = chapter.id as number;
            const backupChapterPath = `${perNovelPath}/${chapterId}`;
            const localChapterPath = `${NOVEL_STORAGE}/${pluginId}/${currentNovel.id}/${chapterId}`;

            const backupIndexFile = `${backupChapterPath}/index.html`;
            const localIndexFile = `${localChapterPath}/index.html`;
            if (await NativeFile.exists(backupIndexFile)) {
              if (!(await NativeFile.exists(localIndexFile))) {
                if (!(await NativeFile.exists(localChapterPath))) {
                  await NativeFile.mkdir(localChapterPath);
                }
                await copyDirectoryRecursive(
                  backupChapterPath,
                  localChapterPath,
                );
                await runAsync([
                  [
                    'UPDATE Chapter SET isDownloaded = 1 WHERE id = ?',
                    [chapterId],
                  ],
                ]);
              } else {
                result.skipped.push({
                  name: `${currentNovel.name} - ${chapter.name}`,
                  reason: 'Chapter already exists',
                });
              }
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errored.push({
          name: novelDir.name,
          reason: `Failed to restore novel files: ${msg}`,
        });
        // Log error to ErrorLogger for user viewing
        ErrorLogger.log({
          timestamp: new Date().toISOString(),
          pluginId: pluginId,
          novelName: novelDir.name,
          error: msg,
          taskType: 'LOCAL_RESTORE',
        });
      }
    }
  }
};

/**
 * Restores novel cover from backup novels/{novelId}/cover.png.
 * If DB stores covers as BLOB, writes base64 into DB.
 * If DB stores covers as PATH, replaces the file on disk and updates DB path if missing.
 */
const restoreNovelCover = async (
  backupNovelPath: string,
  novelId: number,
  pluginId?: string,
  existingCover?: string | null,
): Promise<void> => {
  const backupCoverPath = `${backupNovelPath}/cover.png`;
  if (!(await NativeFile.exists(backupCoverPath))) return;

  const { mode, column } = await detectCoverStorage();

  if (mode === 'blob') {
    try {
      const base64Data = await NativeFile.readFileAsBase64(backupCoverPath);
      if (base64Data) {
        // For blob mode, store the base64 data directly
        const updateQuery =
          column === 'coverPath'
            ? 'UPDATE Novel SET coverPath = ? WHERE id = ?'
            : 'UPDATE Novel SET cover = ? WHERE id = ?';
        await runAsync([[updateQuery, [base64Data, novelId]]]);
      }
    } catch {}
    return;
  }

  // Path mode: replace the image file
  let targetFilePath: string | null = null;
  try {
    // Prefer existing cover path from DB if available
    const current = await getNovelById(novelId);
    let coverPathStr: string | null = null;
    if (current) {
      coverPathStr =
        (column === 'coverPath' ? (current as any).coverPath : current.cover) ||
        null;
    } else {
      coverPathStr = existingCover || null;
    }

    // Check if coverPathStr is actually a path (not base64 data)
    if (
      coverPathStr &&
      !coverPathStr.startsWith('data:') &&
      coverPathStr.length < 500
    ) {
      const noScheme = coverPathStr.startsWith('file://')
        ? coverPathStr.replace('file://', '')
        : coverPathStr;
      // Strip query string if present (e.g., cover.png?1717862123181)
      const withoutQuery = noScheme.split('?')[0];
      targetFilePath = withoutQuery;
    }
  } catch {}

  if (!targetFilePath) {
    // Default to NOVEL_STORAGE/<pluginId>/<novelId>/cover.png
    if (!pluginId) return; // cannot determine path
    const novelDir = `${NOVEL_STORAGE}/${pluginId}/${novelId}`;
    if (!(await NativeFile.exists(novelDir))) {
      await NativeFile.mkdir(novelDir);
    }
    targetFilePath = `${novelDir}/cover.png`;
    const uri = `file://${targetFilePath}`;
    try {
      const updateQuery =
        column === 'coverPath'
          ? 'UPDATE Novel SET coverPath = ? WHERE id = ?'
          : 'UPDATE Novel SET cover = ? WHERE id = ?';
      await runAsync([[updateQuery, [uri, novelId]]]);
    } catch {}
  }

  try {
    if (targetFilePath) {
      await NativeFile.copyFile(backupCoverPath, targetFilePath);
    }
  } catch {}
};
