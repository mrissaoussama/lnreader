import NativeFile from '@specs/NativeFile';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

const STORAGE_LOCATION_KEY = 'CUSTOM_STORAGE_LOCATION';
const USE_CUSTOM_STORAGE_KEY = 'USE_CUSTOM_STORAGE';
const SAF_NOVELS_DIR_URI = 'SAF_NOVELS_DIR_URI';
const SAF_PLUGIN_DIR_URIS = 'SAF_PLUGIN_DIR_URIS';

export interface StorageInfo {
  path: string;
  isCustom: boolean;
  totalSpace?: number;
  freeSpace?: number;
  usedSpace?: number;
  novelCount?: number;
}

export interface NovelStorageInfo {
  novelId: number;
  pluginId: string;
  size: number;
  path: string;
  chapterCount: number;
}

export class StorageManager {
  private static defaultStoragePath =
    NativeFile.getConstants().ExternalDirectoryPath;

  /**
   * Get the root storage path (either default or custom)
   */
  static getRootStorage(): string {
    const useCustom = MMKVStorage.getBoolean(USE_CUSTOM_STORAGE_KEY);
    if (useCustom) {
      const customPath = MMKVStorage.getString(STORAGE_LOCATION_KEY);
      // For SAF URIs, NativeFile.exists cannot be used. Trust the persisted URI.
      if (customPath?.startsWith('content://')) {
        return customPath;
      }
      if (customPath && NativeFile.exists(customPath)) {
        return customPath;
      }
    }
    return this.defaultStoragePath;
  }

  /**
   * Get plugin storage path
   */
  static getPluginStorage(): string {
    return `${this.getRootStorage()}/Plugins`;
  }

  /**
   * Get novel storage path
   */
  static getNovelStorage(): string {
    return `${this.getRootStorage()}/Novels`;
  }

  /**
   * Get storage path for a specific novel
   */
  static getNovelPath(novelId: number, pluginId?: string): string {
    // If pluginId is provided, use it to construct the path
    if (pluginId) {
      // Check internal storage first
      const internalPath = `${this.defaultStoragePath}/Novels/${pluginId}/${novelId}`;
      if (NativeFile.exists(internalPath)) {
        return internalPath;
      }

      // Check custom storage
      const customPath = MMKVStorage.getString(STORAGE_LOCATION_KEY);
      if (customPath) {
        // For SAF URIs, we cannot use NativeFile.exists; rely on cached URIs if available
        if (customPath.startsWith('content://')) {
          const cachedUri = this.getSafNovelUri(pluginId, novelId);
          if (cachedUri) {
            return `${customPath}/Novels/${pluginId}/${novelId}`;
          }
        } else {
          const customNovelPath = `${customPath}/Novels/${pluginId}/${novelId}`;
          if (NativeFile.exists(customNovelPath)) {
            return customNovelPath;
          }
        }
      }

      // Return current root storage path for new novels
      return `${this.getRootStorage()}/Novels/${pluginId}/${novelId}`;
    }

    // Legacy support: search all plugins for the novel
    const rootPath = this.getRootStorage();
    const novelsPath = `${rootPath}/Novels`;

    if (NativeFile.exists(novelsPath)) {
      const pluginDirs = NativeFile.readDir(novelsPath);
      for (const pluginDir of pluginDirs) {
        if (pluginDir.isDirectory) {
          const novelPath = `${novelsPath}/${pluginDir.name}/${novelId}`;
          if (NativeFile.exists(novelPath)) {
            return novelPath;
          }
        }
      }
    }

    return `${rootPath}/Novels/${novelId}`;
  }

  /**
   * Get the directory path for a specific novel (used for storing cover and other novel files)
   */
  static getNovelDirectory(pluginId: string, novelId: number): string {
    try {
      // Try to get existing novel path
      const existingPath = this.getNovelPath(novelId, pluginId);
      // If it exists, return it
      if (NativeFile.exists(existingPath)) {
        return existingPath;
      }
    } catch (error) {
      // Novel doesn't exist yet, continue to create new path
    }

    // Return path based on current storage settings
    const rootStorage = this.getRootStorage();
    return `${rootStorage}/Novels/${pluginId}/${novelId}`;
  }

  /**
   * Set custom storage location
   */
  static async setCustomStorageLocation(uri: string): Promise<boolean> {
    try {
      if (uri.startsWith('content://')) {
        MMKVStorage.set(STORAGE_LOCATION_KEY, uri);
        MMKVStorage.set(USE_CUSTOM_STORAGE_KEY, true);

        try {
          const novelsDirUri =
            await FileSystem.StorageAccessFramework.makeDirectoryAsync(
              uri,
              'Novels',
            );
          MMKVStorage.set(SAF_NOVELS_DIR_URI, novelsDirUri);
        } catch (e: any) {}

        // Initialize plugin URIs map if absent
        if (!MMKVStorage.getString(SAF_PLUGIN_DIR_URIS)) {
          MMKVStorage.set(SAF_PLUGIN_DIR_URIS, JSON.stringify({}));
        }

        return true;
      }

      // Regular file path - use NativeFile operations
      if (!NativeFile.exists(uri)) {
        await NativeFile.mkdir(uri);
      }

      // Test write permission
      const testFile = `${uri}/.test`;
      try {
        NativeFile.writeFile(testFile, 'test');
        NativeFile.unlink(testFile);
      } catch (error) {
        throw new Error('No write permission to the selected directory');
      }

      MMKVStorage.set(STORAGE_LOCATION_KEY, uri);
      MMKVStorage.set(USE_CUSTOM_STORAGE_KEY, true);

      // Create necessary directories with permission verification
      await this.initializeStorageDirectories(uri);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize storage directories
   */
  private static async initializeStorageDirectories(
    rootPath: string,
  ): Promise<void> {
    // Skip for SAF URIs - directories created on-demand
    if (rootPath.startsWith('content://')) {
      return;
    }

    const dirs = [
      `${rootPath}/Novels`,
      `${rootPath}/Plugins`,
      `${rootPath}/.dbqueue`,
    ];

    for (const dir of dirs) {
      if (!NativeFile.exists(dir)) {
        try {
          await NativeFile.mkdir(dir);

          // Verify directory was created
          if (!NativeFile.exists(dir)) {
            throw new Error(`Failed to create directory: ${dir}`);
          }
        } catch (error) {
          throw error;
        }
      }
    }
  }

  /**
   * Reset to default storage
   */
  static resetToDefaultStorage(): void {
    MMKVStorage.set(USE_CUSTOM_STORAGE_KEY, false);
  }

  /**
   * Remove SD Card / Custom storage configuration (does not delete files)
   */
  static removeCustomStorage(): void {
    try {
      // Disable using custom storage for new downloads
      MMKVStorage.set(USE_CUSTOM_STORAGE_KEY, false);

      // Clear configured custom path and SAF caches
      MMKVStorage.delete(STORAGE_LOCATION_KEY);
      MMKVStorage.delete(SAF_NOVELS_DIR_URI);
      MMKVStorage.delete(SAF_PLUGIN_DIR_URIS);

      // Purge cached SAF novel URIs
      try {
        const keys = (MMKVStorage as any).getAllKeys?.() as
          | string[]
          | undefined;
        if (Array.isArray(keys)) {
          keys
            .filter(k => k.startsWith('SAF_NOVEL_URI_'))
            .forEach(k => MMKVStorage.delete(k));
        }
      } catch (e) {
        // getAllKeys may not be available in some environments; ignore
      }
    } catch (e) {}
  }

  /**
   * Set whether to use custom storage for new downloads
   */
  static setUseCustomStorage(useCustom: boolean): void {
    MMKVStorage.set(USE_CUSTOM_STORAGE_KEY, useCustom);
  }

  /**
   * Check if custom storage is currently being used for downloads
   */
  static isUsingCustomStorage(): boolean {
    return MMKVStorage.getBoolean(USE_CUSTOM_STORAGE_KEY) || false;
  }

  /**
   * Get the custom storage path (if configured)
   */
  static getCustomStoragePath(): string | null {
    return MMKVStorage.getString(STORAGE_LOCATION_KEY) || null;
  }

  /**
   * Pick a custom storage location using Android SAF
   */
  static async pickStorageLocation(): Promise<string | null> {
    try {
      if (Platform.OS !== 'android') {
        return null;
      }

      // Use Storage Access Framework to pick a directory
      const permissions =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (!permissions.granted) {
        return null;
      }

      // Return the directory URI
      return permissions.directoryUri;
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate storage usage for internal storage
   */
  static async getInternalStorageInfo(): Promise<StorageInfo> {
    const path = this.defaultStoragePath;
    let usedSpace = 0;
    let novelCount = 0;

    try {
      // Calculate total used space including Novels, Plugins, and other folders
      usedSpace = this.calculateTotalUsedSpace(path);

      // Get novel count
      const novels = await this.getNovelsInStorage(false);
      novelCount = novels.length;
    } catch (error) {}

    // Try to get actual free/total space
    let totalSpace: number | undefined;
    let freeSpace: number | undefined;

    try {
      if (Platform.OS === 'android') {
        if (FileSystem.getFreeDiskStorageAsync) {
          freeSpace = await FileSystem.getFreeDiskStorageAsync();
        }
        if (FileSystem.getTotalDiskCapacityAsync) {
          totalSpace = await FileSystem.getTotalDiskCapacityAsync();
        }
      }
    } catch (error) {
      // Ignore errors, these methods might not be available
    }

    return {
      path,
      isCustom: false,
      usedSpace,
      novelCount,
      totalSpace,
      freeSpace,
    };
  }

  /**
   * Calculate storage usage for custom/SD card storage
   */
  static async getCustomStorageInfo(): Promise<StorageInfo | null> {
    const customPath = MMKVStorage.getString(STORAGE_LOCATION_KEY);
    if (!customPath) {
      return null;
    }

    let usedSpace = 0;
    let novelCount = 0;
    let totalSpace: number | undefined;
    let freeSpace: number | undefined;

    try {
      // Calculate total used space including Novels, Plugins, and other folders
      usedSpace = this.calculateTotalUsedSpace(customPath);

      // Get novel count
      const novels = await this.getNovelsInStorage(true);
      novelCount = novels.length;

      // Try to get SD card space info
      if (!customPath.startsWith('content://')) {
        // For regular file paths, try to get disk space
        try {
          if (Platform.OS === 'android' && FileSystem.getFreeDiskStorageAsync) {
            freeSpace = await FileSystem.getFreeDiskStorageAsync();
            if (FileSystem.getTotalDiskCapacityAsync) {
              totalSpace = await FileSystem.getTotalDiskCapacityAsync();
            }
          }
        } catch (error) {}
      }
    } catch (error) {}

    return {
      path: customPath,
      isCustom: true,
      usedSpace,
      novelCount,
      totalSpace,
      freeSpace,
    };
  }

  /**
   * Get list of novels in a storage location with their sizes
   * Shows only novels (not individual chapters) with chapter count and total size
   */
  static async getNovelsInStorage(
    isCustomStorage: boolean,
  ): NovelStorageInfo[] {
    const results: NovelStorageInfo[] = [];
    const seenNovels = new Map<string, NovelStorageInfo>(); // Track unique novels by pluginId-novelId

    try {
      const rootPath = isCustomStorage
        ? MMKVStorage.getString(STORAGE_LOCATION_KEY)
        : this.defaultStoragePath;

      if (!rootPath) return results;

      // For SAF URIs, we need to use the Storage Access Framework APIs
      if (rootPath.startsWith('content://')) {
        try {
          const novelsDirUri = MMKVStorage.getString(SAF_NOVELS_DIR_URI);
          if (!novelsDirUri) {
            return results;
          }

          // Read all plugin directories
          const pluginUris =
            await FileSystem.StorageAccessFramework.readDirectoryAsync(
              novelsDirUri,
            );
          const pluginMap = this.getSafPluginUris();

          for (const pluginUri of pluginUris) {
            // Try to determine plugin ID from URI or cached map
            let pluginId: string | undefined;

            // Find plugin ID from cached map
            for (const [id, uri] of Object.entries(pluginMap)) {
              if (uri === pluginUri) {
                pluginId = id;
                break;
              }
            }

            if (!pluginId) {
              // Try to extract from URI if possible
              const uriParts = decodeURIComponent(pluginUri).split('/');
              pluginId = uriParts[uriParts.length - 1];
              if (!pluginId) continue;
            }

            try {
              // Read novel directories for this plugin
              const novelUris =
                await FileSystem.StorageAccessFramework.readDirectoryAsync(
                  pluginUri,
                );

              for (const novelUri of novelUris) {
                try {
                  // Extract novel ID from URI
                  const uriParts = decodeURIComponent(novelUri).split('/');
                  const novelIdStr = uriParts[uriParts.length - 1];
                  const novelId = parseInt(novelIdStr, 10);

                  if (isNaN(novelId)) continue;

                  const novelKey = `${pluginId}-${novelId}`;

                  if (!seenNovels.has(novelKey)) {
                    // Count chapters (subdirectories in the novel folder)
                    let chapterCount = 0;
                    const size = 0; // Size calculation not available for SAF yet

                    try {
                      const chapterUris =
                        await FileSystem.StorageAccessFramework.readDirectoryAsync(
                          novelUri,
                        );
                      // Count directories (chapters) - filter out files like cover.png
                      for (const itemUri of chapterUris) {
                        const itemInfo = await FileSystem.getInfoAsync(itemUri);
                        if (itemInfo.exists && itemInfo.isDirectory) {
                          chapterCount++;
                        }
                      }
                    } catch (error) {}

                    seenNovels.set(novelKey, {
                      novelId,
                      pluginId,
                      size, // TODO: Calculate size for SAF
                      path: novelUri,
                      chapterCount,
                    });
                  }
                } catch (error) {}
              }
            } catch (error) {}
          }
        } catch (error) {}

        results.push(...Array.from(seenNovels.values()));
        return results;
      }

      // Regular file path handling (existing code)
      const novelsPath = `${rootPath}/Novels`;
      if (!NativeFile.exists(novelsPath)) {
        return results;
      }

      // Read plugin directories (structure is Novels/{pluginId}/{novelId}/{chapterId}/)
      const pluginDirs = NativeFile.readDir(novelsPath);

      for (const pluginDir of pluginDirs) {
        if (!pluginDir || !pluginDir.name) continue;
        if (!pluginDir.isDirectory) continue;

        const pluginPath = `${novelsPath}/${pluginDir.name}`;

        // Read novel directories inside each plugin folder
        try {
          const novelDirs = NativeFile.readDir(pluginPath);

          for (const novelDir of novelDirs) {
            if (!novelDir || !novelDir.name) continue;
            if (!novelDir.isDirectory) continue;

            const novelId = parseInt(novelDir.name, 10);
            if (isNaN(novelId)) continue;

            const novelPath = `${pluginPath}/${novelDir.name}`;
            const novelKey = `${pluginDir.name}-${novelId}`;

            // Check if we've already seen this novel
            if (!seenNovels.has(novelKey)) {
              // Count chapters (direct subdirectories of the novel folder)
              let chapterCount = 0;
              try {
                const chapterDirs = NativeFile.readDir(novelPath);
                chapterCount = chapterDirs.filter(
                  item => item.isDirectory,
                ).length;
              } catch (error) {}

              // Calculate total size recursively for the entire novel folder
              const size = this.calculateDirectorySize(novelPath);

              seenNovels.set(novelKey, {
                novelId,
                pluginId: pluginDir.name,
                size,
                path: novelPath,
                chapterCount,
              });
            }
          }
        } catch (error) {}
      }

      // Convert map to array
      results.push(...Array.from(seenNovels.values()));
    } catch (error) {}

    return results;
  }

  /**
   * Calculate total used space including Novels and Plugins folders
   */
  static calculateTotalUsedSpace(rootPath: string): number {
    let totalSize = 0;

    try {
      // Calculate Novels folder size
      const novelsPath = `${rootPath}/Novels`;
      if (NativeFile.exists(novelsPath)) {
        totalSize += this.calculateDirectorySize(novelsPath);
      }

      // Calculate Plugins folder size
      const pluginsPath = `${rootPath}/Plugins`;
      if (NativeFile.exists(pluginsPath)) {
        totalSize += this.calculateDirectorySize(pluginsPath);
      }

      // Include any other relevant folders (like .dbqueue)
      const dbqueuePath = `${rootPath}/.dbqueue`;
      if (NativeFile.exists(dbqueuePath)) {
        totalSize += this.calculateDirectorySize(dbqueuePath);
      }
    } catch (error) {}

    return totalSize;
  }

  /**
   * Get novel count per storage location
   */
  static async getNovelCount(isCustomStorage: boolean): Promise<number> {
    const novels = await this.getNovelsInStorage(isCustomStorage);
    return novels.length;
  }

  /**
   * Calculate total size of a directory recursively
   */
  private static calculateDirectorySize(dirPath: string): number {
    if (!dirPath || !NativeFile.exists(dirPath)) {
      return 0;
    }

    try {
      const items = NativeFile.readDir(dirPath);
      let totalSize = 0;

      for (const item of items) {
        if (!item || !item.name) continue;

        const itemPath = `${dirPath}/${item.name}`;

        if (item.isDirectory) {
          // Recursively calculate directory size
          totalSize += this.calculateDirectorySize(itemPath);
        } else {
          // Add file size
          totalSize += item.size || 0;
        }
      }

      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Move novel data from one location to another
   * Preserves the exact folder structure: pluginId/novelId
   */
  static async moveNovel(
    novelId: number,
    toCustomStorage: boolean,
    pluginId?: string,
  ): Promise<boolean> {
    try {
      const sourcePath = this.getNovelPath(novelId, pluginId);
      const targetRoot = toCustomStorage
        ? MMKVStorage.getString(STORAGE_LOCATION_KEY) || this.defaultStoragePath
        : this.defaultStoragePath;

      let actualPluginId = pluginId;
      if (!actualPluginId) {
        const parts = sourcePath.split('/');
        const idx = parts.indexOf('Novels');
        if (idx >= 0 && parts.length > idx + 1) actualPluginId = parts[idx + 1];
      }
      if (!actualPluginId) throw new Error('Missing pluginId');

      const targetPath = `${targetRoot}/Novels/${actualPluginId}/${novelId}`;

      // If source and target are the same, already at target location
      if (sourcePath === targetPath) {
        return true;
      }

      // If source doesn't exist, check if target already exists (already moved)
      if (!NativeFile.exists(sourcePath)) {
        if (targetRoot.startsWith('content://')) {
          // For SAF, we can't easily check if target exists, assume already moved

          return true;
        } else if (NativeFile.exists(targetPath)) {
          return true;
        }
        return false;
      }

      if (targetRoot.startsWith('content://')) {
        // SAF flow: ensure plugin dir and novel dir URIs
        const pluginDirUri = await this.ensureSafPluginDirUri(
          targetRoot,
          actualPluginId,
        );
        if (!pluginDirUri) {
          throw new Error('Could not obtain SAF plugin directory URI');
        }
        let novelDirUri: string;
        try {
          novelDirUri =
            await FileSystem.StorageAccessFramework.makeDirectoryAsync(
              pluginDirUri,
              String(novelId),
            );
        } catch (e: any) {
          // If exists, try to use the cached URI or skip if already exists
          const existingUri = this.getSafNovelUri(actualPluginId, novelId);
          if (existingUri) {
            // Try to delete source since target already exists
            try {
              await NativeFile.unlink(sourcePath);

              return true;
            } catch (deleteError) {
              return false;
            }
          }
          throw new Error(
            'Target novel folder already exists on SD card and cannot be resolved; delete it manually and retry',
          );
        }

        // Cache the novel URI
        this.setSafNovelUri(actualPluginId, novelId, novelDirUri);

        // Copy recursively into SAF novelDirUri
        await this.copyDirectory(sourcePath, novelDirUri);
        await NativeFile.unlink(sourcePath);
        return true;
      }

      // Non-SAF: ensure dirs and copy
      const targetNovelsPath = `${targetRoot}/Novels`;
      if (!NativeFile.exists(targetNovelsPath)) {
        await NativeFile.mkdir(targetNovelsPath);
      }
      const targetPluginPath = `${targetNovelsPath}/${actualPluginId}`;
      if (!NativeFile.exists(targetPluginPath)) {
        await NativeFile.mkdir(targetPluginPath);
      }

      // Check if target already exists
      if (NativeFile.exists(targetPath)) {
        // Target exists, just delete source
        await NativeFile.unlink(sourcePath);
        return true;
      }

      await NativeFile.mkdir(targetPath);

      await this.copyDirectory(sourcePath, targetPath);
      await NativeFile.unlink(sourcePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Helper: parse plugin URIs map
  private static getSafPluginUris(): Record<string, string> {
    try {
      return JSON.parse(MMKVStorage.getString(SAF_PLUGIN_DIR_URIS) || '{}');
    } catch {
      return {};
    }
  }
  private static setSafPluginUris(map: Record<string, string>) {
    MMKVStorage.set(SAF_PLUGIN_DIR_URIS, JSON.stringify(map));
  }

  // Helper: get/set novel URI cache for SAF
  private static getSafNovelUri(
    pluginId: string,
    novelId: number,
  ): string | null {
    try {
      const key = `SAF_NOVEL_URI_${pluginId}_${novelId}`;
      return MMKVStorage.getString(key) || null;
    } catch {
      return null;
    }
  }

  private static setSafNovelUri(
    pluginId: string,
    novelId: number,
    uri: string,
  ): void {
    try {
      const key = `SAF_NOVEL_URI_${pluginId}_${novelId}`;
      MMKVStorage.set(key, uri);
    } catch (error) {}
  }

  // Helper: ensure and return SAF plugin folder URI
  private static async ensureSafPluginDirUri(
    rootUri: string,
    pluginId: string,
  ): Promise<string | null> {
    let novelsDirUri = MMKVStorage.getString(SAF_NOVELS_DIR_URI) || null;
    if (!novelsDirUri) {
      try {
        novelsDirUri =
          await FileSystem.StorageAccessFramework.makeDirectoryAsync(
            rootUri,
            'Novels',
          );
        MMKVStorage.set(SAF_NOVELS_DIR_URI, novelsDirUri);
      } catch (e: any) {
        // Could not create or fetch novels dir; abort
        return null;
      }
    }

    const map = this.getSafPluginUris();
    if (map[pluginId]) {
      return map[pluginId];
    }

    try {
      const pluginDirUri =
        await FileSystem.StorageAccessFramework.makeDirectoryAsync(
          novelsDirUri,
          pluginId,
        );
      map[pluginId] = pluginDirUri;
      this.setSafPluginUris(map);
      return pluginDirUri;
    } catch (e: any) {
      return null;
    }
  }

  /**
   * Copy directory recursively with proper error handling
   */
  private static async copyDirectory(
    source: string,
    target: string,
  ): Promise<void> {
    try {
      const items = NativeFile.readDir(source);

      // If target is non-SAF path ensure it exists
      if (!target.startsWith('content://')) {
        if (!NativeFile.exists(target)) {
          await this.ensureDirectoryExists(target);
        }
      }

      for (const item of items) {
        const sourcePath = `${source}/${item.name}`;
        if (item.isDirectory) {
          if (target.startsWith('content://')) {
            // Create child dir and recurse with returned URI
            const childDirUri =
              await FileSystem.StorageAccessFramework.makeDirectoryAsync(
                target,
                item.name,
              );
            await this.copyDirectory(sourcePath, childDirUri);
          } else {
            const targetPath = `${target}/${item.name}`;
            await this.copyDirectory(sourcePath, targetPath);
          }
        } else {
          if (target.startsWith('content://')) {
            const base64 = NativeFile.readFileAsBase64(sourcePath);
            const fileUri =
              await FileSystem.StorageAccessFramework.createFileAsync(
                target,
                item.name,
                'application/octet-stream',
              );
            await FileSystem.writeAsStringAsync(fileUri, base64, {
              encoding: FileSystem.EncodingType.Base64,
            });
          } else {
            const content = NativeFile.readFile(sourcePath);
            const targetPath = `${target}/${item.name}`;
            NativeFile.writeFile(targetPath, content);
          }
        }
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Ensure directory exists with proper error handling, retries, and permission checks
   */
  private static async ensureDirectoryExists(dirPath: string): Promise<void> {
    if (NativeFile.exists(dirPath)) {
      return;
    }

    // Ensure all parent directories exist first
    const parts = dirPath.split('/').filter(p => p.length > 0);
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      currentPath += '/' + parts[i];

      if (!NativeFile.exists(currentPath)) {
        try {
          await NativeFile.mkdir(currentPath);

          // Wait a moment for filesystem to sync
          await new Promise(resolve => setTimeout(resolve, 50));

          // Verify it was created
          if (!NativeFile.exists(currentPath)) {
            throw new Error(`Parent directory not created: ${currentPath}`);
          }
        } catch (error) {
          // Retry once
          await new Promise(resolve => setTimeout(resolve, 100));

          if (!NativeFile.exists(currentPath)) {
            try {
              await NativeFile.mkdir(currentPath);
            } catch (retryError) {
              throw new Error(
                `Could not create parent directory: ${currentPath}. Error: ${retryError}`,
              );
            }
          }
        }
      }
    }

    // Final verification
    if (!NativeFile.exists(dirPath)) {
      throw new Error(`Directory was not created: ${dirPath}`);
    }
  }

  /**
   * Move all novels to custom storage
   */
  static async moveAllNovelsToCustomStorage(): Promise<{
    success: number;
    failed: number;
  }> {
    const internalNovelsPath = `${this.defaultStoragePath}/Novels`;
    if (!NativeFile.exists(internalNovelsPath)) {
      return { success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;

    // Read plugin directories (structure is Novels/{pluginId}/{novelId})
    const pluginDirs = NativeFile.readDir(internalNovelsPath);

    for (const pluginDir of pluginDirs) {
      if (!pluginDir.isDirectory) continue;

      const pluginPath = `${internalNovelsPath}/${pluginDir.name}`;

      try {
        const novelDirs = NativeFile.readDir(pluginPath);

        for (const novelDir of novelDirs) {
          if (!novelDir.isDirectory) continue;

          const novelId = parseInt(novelDir.name, 10);
          if (isNaN(novelId)) continue;

          const moved = await this.moveNovel(novelId, true, pluginDir.name);
          if (moved) {
            success++;
          } else {
            failed++;
          }
        }
      } catch (error) {}
    }

    return { success, failed };
  }

  /**
   * Move all novels to internal storage
   */
  static async moveAllNovelsToInternalStorage(): Promise<{
    success: number;
    failed: number;
  }> {
    const customPath = MMKVStorage.getString(STORAGE_LOCATION_KEY);
    if (!customPath) {
      return { success: 0, failed: 0 };
    }

    // Skip SAF URIs for now
    if (customPath.startsWith('content://')) {
      return { success: 0, failed: 0 };
    }

    const customNovelsPath = `${customPath}/Novels`;
    if (!NativeFile.exists(customNovelsPath)) {
      return { success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;

    // Read plugin directories (structure is Novels/{pluginId}/{novelId})
    const pluginDirs = NativeFile.readDir(customNovelsPath);

    for (const pluginDir of pluginDirs) {
      if (!pluginDir.isDirectory) continue;

      const pluginPath = `${customNovelsPath}/${pluginDir.name}`;

      try {
        const novelDirs = NativeFile.readDir(pluginPath);

        for (const novelDir of novelDirs) {
          if (!novelDir.isDirectory) continue;

          const novelId = parseInt(novelDir.name, 10);
          if (isNaN(novelId)) continue;

          const moved = await this.moveNovel(novelId, false, pluginDir.name);
          if (moved) {
            success++;
          } else {
            failed++;
          }
        }
      } catch (error) {}
    }

    return { success, failed };
  }

  /**
   * Format storage size in human-readable format
   */
  static formatStorageSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (!bytes || isNaN(bytes)) return 'N/A';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    if (i >= units.length) {
      return `${(bytes / Math.pow(k, units.length - 1)).toFixed(2)} ${
        units[units.length - 1]
      }`;
    }

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
  }
}
