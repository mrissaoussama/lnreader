import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Text,
  Button,
  TextInput,
  ActivityIndicator,
  Portal,
  Modal,
} from 'react-native-paper';
import { trackModalStyles } from './TrackModal.styles';
import { useTracker } from '@hooks/persisted';
import { ThemeColors } from '@theme/types';
import { Track } from '@database/types/Track';
import { TRACKER_ORDER } from '@services/Trackers/common/constants';
import { TrackerLogo } from '@services/Trackers/common/TrackerLogo';
import { useTrackerProgress } from './hooks/useTrackerProgress';

interface Props {
  tracks: Track[];
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (params: {
    targetChapters?: number;
    targetVolume?: number;
  }) => Promise<void> | void;
  appProgress: number;
  theme: ThemeColors;
}

const UpdateAllTrackersDialog: React.FC<Props> = ({
  tracks,
  visible,
  onDismiss,
  onConfirm,
  appProgress,
  theme,
}) => {
  const { getTrackerAuth } = useTracker();
  const styles = createStyles(theme);
  const [customChapters, setCustomChapters] = useState('');
  const [customVolume, setCustomVolume] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const { data: trackersData, highest: highestProgress } = useTrackerProgress({
    tracks,
    appProgress,
    getTrackerAuth,
    visible,
  });

  const parsedChapters =
    customChapters.trim() === '' ? undefined : parseInt(customChapters, 10);
  const targetChapters = isNaN(parsedChapters as any)
    ? undefined
    : parsedChapters;
  const parsedVolume =
    customVolume.trim() === '' ? undefined : parseInt(customVolume, 10);
  const targetVolume = isNaN(parsedVolume as any) ? undefined : parsedVolume;

  const handleConfirm = async () => {
    try {
      setIsUpdating(true);
      await Promise.resolve(onConfirm({ targetChapters, targetVolume }));
      onDismiss();
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          trackModalStyles.sharedDialogContainer,
          styles.modal,
          {
            backgroundColor:
              theme.surface2 || theme.surface || theme.background,
          },
        ]}
      >
        <Text style={styles.title}>Update All Trackers</Text>
        <View style={styles.progressContainer}>
          <View style={styles.progressItem}>
            <Text style={styles.trackerName}>App:</Text>
            <View style={styles.progressInfo}>
              <Text style={styles.progressText}>{appProgress}</Text>
            </View>
          </View>

          {trackersData
            .sort((a, b) => {
              const aIndex = TRACKER_ORDER.indexOf(a.source as any);
              const bIndex = TRACKER_ORDER.indexOf(b.source as any);
              return aIndex - bIndex;
            })
            .map(item => {
              try {
                return (
                  <View
                    key={item.source || Math.random()}
                    style={styles.progressItem}
                  >
                    {item.source ? (
                      <TrackerLogo source={item.source as any} size={20} />
                    ) : null}
                    <Text style={styles.trackerName}>
                      {item.source || 'unknown'}:
                    </Text>
                    <View style={styles.progressInfo}>
                      {item.isLoading ? (
                        <ActivityIndicator
                          size="small"
                          style={styles.loadingIcon}
                        />
                      ) : item.error ? (
                        <Text style={styles.errorText}>{item.error}</Text>
                      ) : item.progressDisplay ? (
                        <Text style={styles.progressText}>
                          {item.progressDisplay}
                        </Text>
                      ) : (
                        <Text style={styles.progressText}>{item.progress}</Text>
                      )}
                    </View>
                  </View>
                );
              } catch (err) {
                return null;
              }
            })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Target Chapters / Volume</Text>
          <View style={styles.progressRow}>
            <View style={styles.progressLeftColumn}>
              <Text style={styles.autoProgressText}>
                Highest (chapters): {highestProgress}
              </Text>
              <TextInput
                label="Chapters"
                value={customChapters}
                onChangeText={setCustomChapters}
                keyboardType="numeric"
                placeholder={highestProgress.toString()}
                style={styles.customInput}
                dense
              />
            </View>
            <View style={styles.volumeColumn}>
              <TextInput
                label="Volume"
                value={customVolume}
                onChangeText={setCustomVolume}
                keyboardType="numeric"
                placeholder="Leave"
                style={styles.customInput}
                dense
              />
            </View>
          </View>
          <Text style={styles.helpText}>
            Leave fields empty to skip updating them.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button mode="outlined" onPress={onDismiss} style={styles.button}>
            Cancel
          </Button>
          <Button
            mode="contained"
            onPress={handleConfirm}
            disabled={isUpdating}
            style={styles.button}
            loading={isUpdating}
          >
            Update
          </Button>
        </View>
      </Modal>
    </Portal>
  );
};

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    modal: { padding: 20 },
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
      gap: 8,
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
      marginTop: 8,
      marginBottom: 8,
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
    progressLeftColumn: { flex: 1 },
    volumeColumn: { width: 140 },
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
      color: '#B00020',
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
