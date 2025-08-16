import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Modal,
  Portal,
  Text,
  Button,
  TextInput,
  ActivityIndicator,
} from 'react-native-paper';
import { useTheme, useTracker } from '@hooks/persisted';
import { ThemeColors } from '@theme/types';
import { Track } from '@database/types/Track';
import { trackers } from '@services/Trackers';
import { updateTrack } from '@database/queries/TrackQueries';

interface TrackerProgressData {
  source: string;
  progress: number;
  isLoading: boolean;
  error?: string;
  progressDisplay?: string;
}

interface UpdateAllTrackersDialogProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (targetProgress: number) => Promise<void>;
  tracks: Track[];
  appProgress: number;
}

const UpdateAllTrackersDialog: React.FC<UpdateAllTrackersDialogProps> = ({
  visible,
  onDismiss,
  onConfirm,
  tracks,
  appProgress,
}) => {
  const theme = useTheme();
  const { getTrackerAuth } = useTracker();
  const styles = createStyles(theme);

  const [trackersData, setTrackersData] = useState<TrackerProgressData[]>([]);
  const [customProgress, setCustomProgress] = useState('');
  const [_isUpdating, setIsUpdating] = useState(false);

  const highestProgress = Math.max(
    appProgress,
    ...trackersData.map(t => t.progress),
  );

  const targetProgress = customProgress
    ? parseInt(customProgress, 10) || highestProgress
    : highestProgress;

  const fetchAllTrackerProgress = React.useCallback(async () => {
    const initialData: TrackerProgressData[] = tracks.map(track => ({
      source: track.source,
      progress: track.lastChapterRead,
      isLoading: true,
    }));
    setTrackersData(initialData);

    const trackerPromises = tracks.map(async (track, index): Promise<void> => {
      try {
        const tracker = trackers[track.source];
        if (!tracker) {
          setTrackersData(prev =>
            prev.map((item, i) =>
              i === index
                ? {
                    ...item,
                    isLoading: false,
                    error: 'Error loading tracker',
                  }
                : item,
            ),
          );
          return;
        }

        const auth = getTrackerAuth(track.source);

        if (!auth || !auth.accessToken || !auth.expiresAt) {
          setTrackersData(prev =>
            prev.map((item, i) =>
              i === index
                ? {
                    ...item,
                    isLoading: false,
                    error: 'Not logged in',
                  }
                : item,
            ),
          );
          return;
        }

        const userEntry = await tracker.getUserListEntry(
          track.sourceId,
          auth as any,
        );

        if (!userEntry || typeof userEntry !== 'object') {
          setTrackersData(prev =>
            prev.map((item, i) =>
              i === index
                ? {
                    ...item,
                    isLoading: false,
                    error: 'Failed to get tracker progress',
                  }
                : item,
            ),
          );
          return;
        }

        const progress = userEntry.progress || 0;

        try {
          const directId = (userEntry as any).listId as string | undefined;
          const directName = (userEntry as any).listName as string | undefined;
          let resolved: { id: string; name: string } | undefined;

          if (directId || directName) {
            resolved = { id: directId!, name: directName || directId! };
          } else {
            const status: string | undefined = (userEntry as any).status;
            if (
              status &&
              typeof tracker.getAvailableReadingLists === 'function'
            ) {
              try {
                const lists = await tracker.getAvailableReadingLists(
                  'dummy',
                  auth as any,
                );
                const found = Array.isArray(lists)
                  ? lists.find(l => l && l.id === status)
                  : undefined;
                if (found) resolved = { id: found.id, name: found.name };
              } catch {}
            }
          }

          if (resolved) {
            let md: any = {};
            try {
              if (track.metadata) md = JSON.parse(track.metadata);
            } catch {}
            const prevId =
              typeof md.listId === 'string' ? md.listId : undefined;
            const prevName =
              typeof md.listName === 'string' ? md.listName : undefined;
            if (prevId !== resolved.id || prevName !== resolved.name) {
              const nextMetadata = JSON.stringify({
                ...md,
                listId: resolved.id,
                listName: resolved.name,
              });
              await updateTrack(track.id, { metadata: nextMetadata });
            }
          }
        } catch {}

        setTrackersData(prev =>
          prev.map((item, i) =>
            i === index
              ? {
                  ...item,
                  progress,
                  progressDisplay: (userEntry as any).progressDisplay,
                  isLoading: false,
                }
              : item,
          ),
        );
      } catch (error: any) {
        setTrackersData(prev =>
          prev.map((item, i) =>
            i === index
              ? {
                  ...item,
                  isLoading: false,
                  error: error.message || 'Failed to fetch progress',
                }
              : item,
          ),
        );
      }
    });

    await Promise.allSettled(trackerPromises);
  }, [tracks, getTrackerAuth]);

  useEffect(() => {
    if (visible) {
      fetchAllTrackerProgress();
    } else {
      setTrackersData([]);
      setCustomProgress('');
    }
  }, [visible, fetchAllTrackerProgress]);

  const handleConfirm = async () => {
    try {
      setIsUpdating(true);

      onConfirm(targetProgress).catch(_error => {});
      onDismiss();
    } catch (error) {
    } finally {
      setIsUpdating(false);
    }
  };

  const renderProgressItem = (data: TrackerProgressData) => (
    <View key={data.source} style={styles.progressItem}>
      <Text style={styles.trackerName}>{data.source}:</Text>
      <View style={styles.progressInfo}>
        {data.isLoading ? (
          <ActivityIndicator size="small" style={styles.loadingIcon} />
        ) : data.error ? (
          <Text style={styles.errorText}>{data.error}</Text>
        ) : data.progressDisplay ? (
          <Text style={styles.progressText}>{data.progressDisplay}</Text>
        ) : (
          <Text style={styles.progressText}>{data.progress}</Text>
        )}
      </View>
    </View>
  );

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}
        style={styles.modalWrapper}
      >
        <Text style={styles.title}>Update All Trackers</Text>

        <View style={styles.progressContainer}>
          <View style={styles.progressItem}>
            <Text style={styles.trackerName}>App:</Text>
            <View style={styles.progressInfo}>
              <Text style={styles.progressText}>{appProgress}</Text>
            </View>
          </View>

          {trackersData.map(renderProgressItem)}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Target Progress</Text>
          <View style={styles.progressRow}>
            <Text style={styles.autoProgressText}>
              Highest: {highestProgress} chapters
            </Text>
            <TextInput
              label="Set Progress"
              value={customProgress}
              onChangeText={setCustomProgress}
              keyboardType="numeric"
              placeholder={highestProgress.toString()}
              style={styles.customInput}
              dense
            />
          </View>
          <Text style={styles.helpText}>
            Leave empty to use the highest progress
          </Text>
        </View>

        <View style={styles.actions}>
          <Button mode="outlined" onPress={onDismiss} style={styles.button}>
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleConfirm}
            disabled={targetProgress < 0 || isNaN(targetProgress)}
            style={styles.button}
          >
            Update to {targetProgress}
          </Button>
        </View>
      </Modal>
    </Portal>
  );
};

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    modalWrapper: {
      zIndex: 6000,
    },
    modal: {
      backgroundColor: theme.background,
      margin: 20,
      padding: 20,
      borderRadius: 8,
      maxHeight: '80%',
      zIndex: 6001,
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.onBackground,
      marginBottom: 16,
      textAlign: 'center',
    },
    progressContainer: {
      marginBottom: 16,
    },
    progressItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: theme.outline,
    },
    trackerName: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.onBackground,
      minWidth: 120,
    },
    progressInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 8,
    },
    progressText: {
      fontSize: 14,
      color: theme.onBackground,
    },
    loadingIcon: {
      marginLeft: 8,
    },
    section: {
      marginTop: 16,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.onBackground,
      marginBottom: 8,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    autoProgressText: {
      flex: 1,
      color: theme.onBackground,
      fontSize: 14,
    },
    customInput: {
      width: 120,
    },
    helpText: {
      fontSize: 12,
      color: theme.onSurfaceVariant,
      marginTop: 4,
      fontStyle: 'italic',
    },
    errorText: {
      color: theme.error,
      fontSize: 12,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
      marginTop: 16,
    },
    button: {
      minWidth: 100,
    },
  });

export default UpdateAllTrackersDialog;
