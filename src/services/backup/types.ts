export enum ZipBackupName {
  DATA = 'data.zip',
  DOWNLOAD = 'download.zip',
}

export enum BackupEntryName {
  VERSION = 'Version.json',
  CATEGORY = 'Category.json',
  SETTING = 'Setting.json',
  NOVEL_AND_CHAPTERS = 'NovelAndChapters',
  // Optional folder where per-novel assets (covers/chapters) are stored
  NOVELS = 'novels',
  // Plugin code and custom assets
  PLUGINS = 'Plugins',
  // Font files
  FONTS = 'Fonts',
  // Repository list
  REPOSITORIES = 'Repositories.json',
  NOTES = 'Notes.json',
}
