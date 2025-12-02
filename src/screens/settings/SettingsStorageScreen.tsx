import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Alert, ScrollView } from 'react-native';
import {
  List,
  Button,
  Text,
  ProgressBar,
  Card,
  Divider,
  Switch,
} from 'react-native-paper';
import { StorageManager, StorageInfo } from '@utils/StorageManager';
import { useTheme } from '@hooks/persisted';
import { ThemeColors } from '@theme/types';
import { showToast } from '@utils/showToast';
import { SafeAreaView } from '@components/index';
import { StackScreenProps } from '@react-navigation/stack';
import { Appbar } from '@components';
import { StorageNovelListModal } from './SettingsStorageScreen/StorageNovelListModal';

type StorageSettingsScreenProps = StackScreenProps<any, 'StorageSettings'>;

export const StorageSettingsScreen: React.FC<StorageSettingsScreenProps> = ({
  navigation,
}) => {
  const theme = useTheme();
  const [internalStorage, setInternalStorage] = useState<StorageInfo | null>(
    null,
  );
  const [customStorage, setCustomStorage] = useState<StorageInfo | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [moveProgress, setMoveProgress] = useState(0);
  const [showNovelListModal, setShowNovelListModal] = useState(false);
  const [selectedStorageType, setSelectedStorageType] = useState<
    'internal' | 'custom'
  >('internal');
  const [useCustomForDownloads, setUseCustomForDownloads] = useState(false);

  const loadStorageInfo = useCallback(async () => {
    const internal = await StorageManager.getInternalStorageInfo();
    const custom = await StorageManager.getCustomStorageInfo();
    setInternalStorage(internal);
    setCustomStorage(custom);

    // Check if custom storage is currently being used for downloads
    const isUsingCustom = StorageManager.isUsingCustomStorage();
    setUseCustomForDownloads(isUsingCustom);
  }, []);

  useEffect(() => {
    loadStorageInfo();
  }, [loadStorageInfo]);

  const handlePickCustomLocation = async () => {
    try {
      const uri = await StorageManager.pickStorageLocation();
      if (uri) {
        const success = await StorageManager.setCustomStorageLocation(uri);
        if (success) {
          showToast('SD Card folder selected successfully');
          loadStorageInfo();
        } else {
          showToast('Failed to set SD card folder. Please try again.');
        }
      }
    } catch (error) {
      showToast('Error selecting storage location. Please try again.');
    }
  };

  const handleMoveToCustomStorage = () => {
    if (!customStorage) {
      showToast('Please select a custom storage location first');
      return;
    }

    Alert.alert(
      'Move to SD Card',
      'This will move all novels and downloads to the SD card. This may take a while.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          onPress: async () => {
            setIsMoving(true);
            setMoveProgress(0);
            try {
              const result =
                await StorageManager.moveAllNovelsToCustomStorage();
              showToast(
                `Moved ${result.success} novels successfully. ${result.failed} failed.`,
              );
              loadStorageInfo();
            } catch (error) {
              showToast('Error moving novels to SD card');
            } finally {
              setIsMoving(false);
              setMoveProgress(0);
            }
          },
        },
      ],
    );
  };

  const handleMoveToInternalStorage = () => {
    Alert.alert(
      'Move to Internal Storage',
      'This will move all novels and downloads from SD card to internal storage. This may take a while.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          onPress: async () => {
            setIsMoving(true);
            setMoveProgress(0);
            try {
              const result =
                await StorageManager.moveAllNovelsToInternalStorage();
              showToast(
                `Moved ${result.success} novels successfully. ${result.failed} failed.`,
              );
              loadStorageInfo();
            } catch (error) {
              showToast('Error moving novels to internal storage');
            } finally {
              setIsMoving(false);
              setMoveProgress(0);
            }
          },
        },
      ],
    );
  };

  const handleResetToDefault = () => {
    Alert.alert(
      'Reset to Default Storage',
      'This will use the default internal storage location for new downloads. Novels on SD card will remain there.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: () => {
            StorageManager.resetToDefaultStorage();
            showToast('Reset to default storage location');
            setUseCustomForDownloads(false);
            loadStorageInfo();
          },
        },
      ],
    );
  };

  const handleRemoveSdCard = () => {
    Alert.alert(
      'Remove SD Card',
      'This will clear the SD card configuration from the app. Existing files on the SD card will not be deleted. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            StorageManager.removeCustomStorage();
            setUseCustomForDownloads(false);
            showToast('SD card configuration removed');
            loadStorageInfo();
          },
        },
      ],
    );
  };

  const handleStorageCardPress = (storageType: 'internal' | 'custom') => {
    setSelectedStorageType(storageType);
    setShowNovelListModal(true);
  };

  const handleToggleDownloadLocation = async () => {
    if (!customStorage && !useCustomForDownloads) {
      showToast('Please select a custom storage location first');
      return;
    }

    const newValue = !useCustomForDownloads;
    if (newValue) {
      // Switching to custom storage
      StorageManager.setUseCustomStorage(true);
      showToast('New downloads will be saved to SD Card');
    } else {
      // Switching to internal storage
      StorageManager.resetToDefaultStorage();
      showToast('New downloads will be saved to Internal Storage');
    }
    setUseCustomForDownloads(newValue);
  };

  const styles = createStyles(theme);

  const renderStorageCard = (
    storage: StorageInfo | null,
    type: 'internal' | 'custom',
  ) => {
    if (!storage && type === 'custom') {
      return (
        <Card style={[styles.card, { backgroundColor: theme.surfaceVariant }]}>
          <Card.Content>
            <View style={styles.storageRow}>
              <List.Icon icon="sd" color={theme.onSurfaceVariant} />
              <View style={styles.storageInfo}>
                <Text
                  style={[
                    styles.storageTitle,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  SD Card / External Storage
                </Text>
                <Text
                  style={[
                    styles.storagePath,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  Not configured
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      );
    }

    if (!storage) return null;

    const icon = type === 'internal' ? 'cellphone' : 'sd';
    const title =
      type === 'internal' ? 'Internal Storage' : 'SD Card / External Storage';
    const novelCount = storage.novelCount || 0;
    const usedSpace = storage.usedSpace || 0;

    // Calculate space display - show used out of remaining free space
    let spaceText = `${StorageManager.formatStorageSize(usedSpace)} used`;

    if (storage.freeSpace && storage.totalSpace) {
      const remainingFree = storage.freeSpace;
      const totalCapacity = storage.totalSpace;
      const percentUsed = ((usedSpace / totalCapacity) * 100).toFixed(1);
      spaceText = `${StorageManager.formatStorageSize(
        usedSpace,
      )} / ${StorageManager.formatStorageSize(
        totalCapacity,
      )} (${percentUsed}% used, ${StorageManager.formatStorageSize(
        remainingFree,
      )} free)`;
    } else if (storage.freeSpace) {
      spaceText += `, ${StorageManager.formatStorageSize(
        storage.freeSpace,
      )} free`;
    }

    return (
      <Card
        style={[styles.card, { backgroundColor: theme.surface }]}
        onPress={() => handleStorageCardPress(type)}
      >
        <Card.Content>
          <View style={styles.storageRow}>
            <List.Icon icon={icon} color={theme.primary} />
            <View style={styles.storageInfo}>
              <Text style={[styles.storageTitle, { color: theme.onSurface }]}>
                {title}
              </Text>
              <Text
                style={[styles.storagePath, { color: theme.onSurfaceVariant }]}
                numberOfLines={2}
              >
                {storage.path}
              </Text>
              <Text style={[styles.novelCount, { color: theme.primary }]}>
                {novelCount} novel{novelCount !== 1 ? 's' : ''}
              </Text>
              <Text
                style={[styles.storageSize, { color: theme.onSurfaceVariant }]}
              >
                {spaceText}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Appbar
        title="Storage Settings"
        handleGoBack={navigation.goBack}
        theme={theme}
      />

      <ScrollView style={styles.content}>
        <List.Section>
          <List.Subheader>Storage Usage (Tap to view novels)</List.Subheader>

          {renderStorageCard(internalStorage, 'internal')}
          {renderStorageCard(customStorage, 'custom')}
        </List.Section>

        {customStorage && (
          <List.Section>
            <List.Subheader>Download Location</List.Subheader>
            <Card style={[styles.card, { backgroundColor: theme.surface }]}>
              <Card.Content>
                <View style={styles.switchRow}>
                  <View style={styles.switchInfo}>
                    <Text
                      style={[styles.switchTitle, { color: theme.onSurface }]}
                    >
                      Use External Storage for Downloads
                    </Text>
                    <Text
                      style={[
                        styles.switchDescription,
                        { color: theme.onSurfaceVariant },
                      ]}
                    >
                      New downloads will be saved to{' '}
                      {useCustomForDownloads ? 'SD Card' : 'Internal Storage'}
                    </Text>
                  </View>
                  <Switch
                    value={useCustomForDownloads}
                    onValueChange={handleToggleDownloadLocation}
                    disabled={isMoving}
                  />
                </View>
              </Card.Content>
            </Card>
          </List.Section>
        )}

        {isMoving && (
          <View style={styles.progressContainer}>
            <Text style={{ color: theme.onSurface }}>Moving novels...</Text>
            <ProgressBar
              progress={moveProgress}
              style={styles.progressBar}
              color={theme.primary}
            />
          </View>
        )}

        <Divider style={styles.divider} />

        <List.Section>
          <List.Subheader>Actions</List.Subheader>

          <Button
            mode="outlined"
            onPress={handlePickCustomLocation}
            style={styles.button}
            disabled={isMoving}
            icon="folder"
          >
            {customStorage
              ? 'Change External Storage Folder'
              : 'Select External Storage Folder'}
          </Button>

          {customStorage && (
            <>
              <Button
                mode="outlined"
                onPress={handleMoveToCustomStorage}
                style={styles.button}
                disabled={isMoving}
                icon="arrow-right"
              >
                Move All to External Storage
              </Button>

              <Button
                mode="outlined"
                onPress={handleMoveToInternalStorage}
                style={styles.button}
                disabled={isMoving}
                icon="arrow-left"
              >
                Move All to Internal Storage
              </Button>

              <Button
                mode="contained"
                onPress={handleRemoveSdCard}
                style={styles.button}
                disabled={isMoving}
                icon="sd"
              >
                Remove SD Card
              </Button>
            </>
          )}

          {!customStorage && (
            <Button
              mode="outlined"
              onPress={handleResetToDefault}
              style={styles.button}
              disabled={isMoving}
              icon="backup-restore"
            >
              Reset to Default Storage
            </Button>
          )}
        </List.Section>

        <View style={styles.infoContainer}>
          <Text style={[styles.infoText, { color: theme.onSurfaceVariant }]}>
            Select a folder on your SD card or external storage to store novels
            there and free up internal storage.
            {'\n\n'}
            Tap on a storage card to view and manage novels in that location.
            {'\n\n'}
            Use the switch above to choose where new downloads are saved.
          </Text>
        </View>
      </ScrollView>

      <StorageNovelListModal
        visible={showNovelListModal}
        onDismiss={() => setShowNovelListModal(false)}
        isCustomStorage={selectedStorageType === 'custom'}
        onMoveComplete={loadStorageInfo}
      />
    </SafeAreaView>
  );
};

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      flex: 1,
    },
    card: {
      marginHorizontal: 16,
      marginVertical: 8,
      elevation: 2,
    },
    storageRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    storageInfo: {
      flex: 1,
      marginLeft: 8,
    },
    storageTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      marginBottom: 4,
    },
    storagePath: {
      fontSize: 11,
      marginBottom: 6,
      fontFamily: 'monospace',
    },
    novelCount: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
    },
    storageSize: {
      fontSize: 13,
    },
    button: {
      marginHorizontal: 16,
      marginVertical: 8,
    },
    progressContainer: {
      padding: 16,
      marginHorizontal: 16,
    },
    progressBar: {
      marginTop: 8,
      height: 8,
      borderRadius: 4,
    },
    divider: {
      marginVertical: 16,
    },
    infoContainer: {
      padding: 16,
      marginTop: 8,
      marginHorizontal: 16,
      backgroundColor: 'transparent',
    },
    infoText: {
      fontSize: 13,
      lineHeight: 20,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    switchInfo: {
      flex: 1,
      marginRight: 16,
    },
    switchTitle: {
      fontSize: 16,
      fontWeight: '500',
      marginBottom: 4,
    },
    switchDescription: {
      fontSize: 13,
      lineHeight: 18,
    },
  });
