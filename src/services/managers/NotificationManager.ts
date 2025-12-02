import BackgroundService from 'react-native-background-actions';

export class NotificationManager {
  private static instance?: NotificationManager;
  private lastNotifUpdate = 0;
  private lastProgress = 0;
  private currentPendingUpdate: NodeJS.Timeout | null = null;
  private readonly NOTIFICATION_THROTTLE_MS = 1000; // Default throttle
  private readonly SIGNIFICANT_PROGRESS_THRESHOLD = 0.05; // 5%
  private defaultActions: any[] = [];

  private constructor() {}

  static get manager() {
    if (!this.instance) {
      this.instance = new NotificationManager();
    }
    return this.instance;
  }

  setDefaultActions(actions: any[]) {
    this.defaultActions = actions;
  }

  /**
   * Updates the background service notification with throttling.
   * @param title Task title
   * @param desc Task description
   * @param progress Progress (0-1) or undefined for indeterminate
   * @param force Force update immediately (e.g. for completion)
   */
  async update(
    title: string,
    desc: string,
    progress?: number,
    force: boolean = false,
  ) {
    const now = Date.now();
    const elapsed = now - this.lastNotifUpdate;
    const currentProgress = progress || 0;
    const progressDiff = Math.abs(currentProgress - this.lastProgress);

    // Determine if we should update now
    // 1. Forced update
    // 2. First update (lastProgress === 0)
    // 3. Completion (progress === 1)
    // 4. Time elapsed > throttle AND (progress changed significantly OR it's been a while)
    const shouldUpdate =
      force ||
      this.lastProgress === 0 ||
      currentProgress === 1 ||
      (elapsed >= this.NOTIFICATION_THROTTLE_MS &&
        (progressDiff >= this.SIGNIFICANT_PROGRESS_THRESHOLD ||
          elapsed >= 2000));

    if (shouldUpdate) {
      this.executeNotificationUpdate(title, desc, progress);
    } else if (!this.currentPendingUpdate) {
      // Schedule a trailing update to ensure we don't miss the final state of a quick burst
      const delay = this.NOTIFICATION_THROTTLE_MS - elapsed;
      this.currentPendingUpdate = setTimeout(() => {
        this.executeNotificationUpdate(title, desc, progress);
        this.currentPendingUpdate = null;
      }, Math.max(0, delay));
    }
  }

  private executeNotificationUpdate(
    title: string,
    desc: string,
    progress?: number,
  ) {
    // Clear any pending update since we are updating now
    if (this.currentPendingUpdate) {
      clearTimeout(this.currentPendingUpdate);
      this.currentPendingUpdate = null;
    }

    this.lastNotifUpdate = Date.now();
    this.lastProgress = progress || 0;

    // Use setImmediate to avoid blocking the JS thread
    setImmediate(async () => {
      if (BackgroundService.isRunning()) {
        await BackgroundService.updateNotification({
          taskTitle: title,
          taskDesc: desc,
          progressBar: {
            indeterminate: progress === undefined,
            value: (progress || 0) * 100,
            max: 100,
          },
          actions: this.defaultActions,
        });
      }
    });
  }

  reset() {
    this.lastNotifUpdate = 0;
    this.lastProgress = 0;
    if (this.currentPendingUpdate) {
      clearTimeout(this.currentPendingUpdate);
      this.currentPendingUpdate = null;
    }
  }
}
