import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Modal, Portal, Button, Checkbox } from 'react-native-paper';
import { useTheme } from '@hooks/persisted';
import { ThemeColors } from '@theme/types';
import ServiceManager from '@services/ServiceManager';

interface TrackerSyncDialogProps {
  visible: boolean;
  onDismiss: () => void;
  syncType: 'from' | 'to' | 'all';
}

const TrackerSyncDialog: React.FC<TrackerSyncDialogProps> = ({
  visible,
  onDismiss,
  syncType,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [forceUpdate, setForceUpdate] = useState(false);

  const getSyncDescription = () => {
    switch (syncType) {
      case 'from':
        return 'Sync reading progress from all connected trackers of every novel. Chapters read will be updated to match the highest progress.';
      case 'to':
        return 'Sync reading progress from this app to all connected trackers. Tracker progress will be updated to match local progress.';
      case 'all':
        return 'Bidirectional sync between novels and all trackers. Progress will be synchronized to the highest value across all sources.';
      default:
        return '';
    }
  };

  const startSync = () => {
    const taskNames = {
      from: 'SYNC_FROM_TRACKERS' as const,
      to: 'SYNC_TO_TRACKERS' as const,
      all: 'SYNC_ALL_TRACKERS' as const,
    };

    ServiceManager.manager.addTask({
      name: taskNames[syncType],
      data: { forceUpdate },
    });

    onDismiss();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modal,
          { backgroundColor: theme.surface },
        ]}
      >
        <Text style={[styles.title, { color: theme.onSurface }]}>
          Tracker Sync - {syncType.charAt(0).toUpperCase() + syncType.slice(1)}
        </Text>

        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          {getSyncDescription()}
        </Text>

        {syncType !== 'all' && (
          <View style={styles.checkboxContainer}>
            <Checkbox
              status={forceUpdate ? 'checked' : 'unchecked'}
              onPress={() => setForceUpdate(!forceUpdate)}
            />
            <Text
              style={[styles.checkboxLabel, { color: theme.onSurface }]}
              onPress={() => setForceUpdate(!forceUpdate)}
            >
              Force update even if progress would decrease
            </Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <Button mode="outlined" onPress={onDismiss} style={styles.button}>
            Cancel
          </Button>
          <Button mode="contained" onPress={startSync} style={styles.button}>
            Start Sync
          </Button>
        </View>
      </Modal>
    </Portal>
  );
};

const createStyles = (_theme: ThemeColors) =>
  StyleSheet.create({
    modal: {
      margin: 20,
      borderRadius: 8,
      padding: 20,
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 16,
    },
    description: {
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 24,
    },
    checkboxContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    checkboxLabel: {
      fontSize: 14,
      marginLeft: 8,
      flex: 1,
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    button: {
      flex: 1,
    },
  });

export default TrackerSyncDialog;
