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

interface TrackerProgressData {
  source: string;
  progress: number;
  isLoading: boolean;
  error?: string;
  progressDisplay?: string; // Custom display string from tracker
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

  // Calculate the highest progress automatically
  const highestProgress = Math.max(
    appProgress,
    ...trackersData.map(t => t.progress),
  );

  // Use custom progress if provided, otherwise use highest
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

    // Fetch fresh progress in parallel
    const updatedData = await Promise.all(
      tracks.map(async (track): Promise<TrackerProgressData> => {
        try {
          const tracker = trackers[track.source];
          if (!tracker) {
            return {
              source: track.source,
              progress: track.lastChapterRead,
              isLoading: false,
              error: 'Error loading tracker',
            };
          }

          // Get authentication for this tracker
          const auth = getTrackerAuth(track.source);
          if (!auth || !auth.accessToken || !auth.expiresAt) {
            return {
              source: track.source,
              progress: track.lastChapterRead,
              isLoading: false,
              error: 'Not logged in',
            };
          }

          const userEntry = await tracker.getUserListEntry(
            track.sourceId,
            auth as any, // Cast to any since the auth system returns a generic object
          );

          // Add safety check for userEntry
          if (!userEntry || typeof userEntry !== 'object') {
            return {
              source: track.source,
              progress: track.lastChapterRead || 0,
              isLoading: false,
              error: 'Failed to get tracker progress',
            };
          }

          const progress = userEntry.progress || 0;

          return {
            source: track.source,
            progress,
            progressDisplay: (userEntry as any).progressDisplay,
            isLoading: false,
          };
        } catch (error: any) {
          return {
            source: track.source,
            progress: track.lastChapterRead,
            isLoading: false,
            error: error.message || 'Failed to fetch progress',
          };
        }
      }),
    );

    setTrackersData(updatedData);
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
      // Error will be handled by parent component
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
      zIndex: 2000, // Increased from 1000 to appear above bottom sheet
    },
    modal: {
      backgroundColor: theme.background,
      margin: 20,
      padding: 20,
      borderRadius: 8,
      maxHeight: '80%',
      zIndex: 2001, // Increased from 1001 to appear above bottom sheet
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
