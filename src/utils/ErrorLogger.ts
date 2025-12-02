import { MMKVStorage, getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';

export interface ErrorLogEntry {
  timestamp: string;
  pluginId: string;
  novelName?: string;
  novelId?: number;
  error: string;
  taskType:
    | 'UPDATE_LIBRARY'
    | 'LOCAL_RESTORE'
    | 'DRIVE_RESTORE'
    | 'SELF_HOST_RESTORE';
}

interface GroupedErrors {
  [pluginId: string]: {
    [novelName: string]: ErrorLogEntry[];
  };
}

const MAX_ERRORS = 1000;
const ERROR_LOG_KEY = 'ERROR_LOG_';

export class ErrorLogger {
  private static getKey(taskType: ErrorLogEntry['taskType']): string {
    return `${ERROR_LOG_KEY}${taskType}`;
  }

  static log(entry: ErrorLogEntry): void {
    const key = this.getKey(entry.taskType);
    let errors = getMMKVObject<ErrorLogEntry[]>(key) || [];

    // Add timestamp if not provided
    if (!entry.timestamp) {
      entry.timestamp = new Date().toISOString();
    }

    errors.push(entry);

    // Keep only last MAX_ERRORS entries
    if (errors.length > MAX_ERRORS) {
      errors = errors.slice(-MAX_ERRORS);
    }

    setMMKVObject(key, errors);
  }

  static getErrors(taskType: ErrorLogEntry['taskType']): ErrorLogEntry[] {
    const key = this.getKey(taskType);
    return getMMKVObject<ErrorLogEntry[]>(key) || [];
  }

  static getGroupedErrors(taskType: ErrorLogEntry['taskType']): GroupedErrors {
    const errors = this.getErrors(taskType);
    const grouped: GroupedErrors = {};

    errors.forEach(error => {
      if (!grouped[error.pluginId]) {
        grouped[error.pluginId] = {};
      }

      const novelName = error.novelName || 'Unknown Novel';
      if (!grouped[error.pluginId][novelName]) {
        grouped[error.pluginId][novelName] = [];
      }

      grouped[error.pluginId][novelName].push(error);
    });

    return grouped;
  }

  static getFormattedErrors(taskType: ErrorLogEntry['taskType']): string {
    const grouped = this.getGroupedErrors(taskType);
    let result = '';

    Object.keys(grouped)
      .sort()
      .forEach(pluginId => {
        result += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        result += `Plugin: ${pluginId}\n`;
        result += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

        Object.keys(grouped[pluginId])
          .sort()
          .forEach(novelName => {
            const novelErrors = grouped[pluginId][novelName];
            result += `\n  Novel: ${novelName}\n`;
            result += '  ─────────────────────────────\n';

            novelErrors.forEach((error, index) => {
              const timestamp = new Date(error.timestamp).toLocaleString();
              result += `  ${index + 1}. [${timestamp}]\n`;
              result += `     ${error.error}\n`;
            });
          });
      });

    if (result === '') {
      return 'No errors logged.';
    }

    return result.trim();
  }

  static clearErrors(taskType: ErrorLogEntry['taskType']): void {
    const key = this.getKey(taskType);
    MMKVStorage.delete(key);
  }

  static getErrorCount(taskType: ErrorLogEntry['taskType']): number {
    return this.getErrors(taskType).length;
  }
}
