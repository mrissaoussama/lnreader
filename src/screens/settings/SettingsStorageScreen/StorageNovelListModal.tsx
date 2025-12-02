import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StyleSheet, View, FlatList, Image } from 'react-native';
import {
  Modal,
  Portal,
  Text,
  Checkbox,
  Button,
  Appbar,
  Card,
} from 'react-native-paper';
import { StorageManager, NovelStorageInfo } from '@utils/StorageManager';
import { useTheme } from '@hooks/persisted';
import { ThemeColors } from '@theme/types';
import { showToast } from '@utils/showToast';
import { getNovelById } from '@database/queries/NovelQueries';
import { defaultCover } from '@plugins/helpers/constants';

interface StorageNovelListModalProps {
  visible: boolean;
  onDismiss: () => void;
  isCustomStorage: boolean;
  onMoveComplete: () => void;
}

interface NovelWithInfo extends NovelStorageInfo {
  name?: string;
  cover?: string;
}

export const StorageNovelListModal: React.FC<StorageNovelListModalProps> = ({
  visible,
  onDismiss,
  isCustomStorage,
  onMoveComplete,
}) => {
  const theme = useTheme();
  const [novels, setNovels] = useState<NovelWithInfo[]>([]);
  const [selectedNovels, setSelectedNovels] = useState<Set<string>>(new Set());
  const [isMoving, setIsMoving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      loadNovels();
      setSelectedNovels(new Set()); // Reset selection when modal opens
    }
  }, [visible, isCustomStorage, loadNovels]);

  const loadNovels = useCallback(async () => {
    setLoading(true);
    try {
      const storageNovels = await StorageManager.getNovelsInStorage(
        isCustomStorage,
      );

      // Fetch novel names and covers from database - ONLY for novels in library
      const novelsWithNames = await Promise.all(
        storageNovels.map(async novel => {
          try {
            const novelData = await getNovelById(novel.novelId);
            // Only include novels that are in the library
            if (!novelData || novelData.inLibrary !== 1) {
              return null;
            }
            return {
              ...novel,
              name: novelData?.name || `Novel ${novel.novelId}`,
              cover: novelData?.cover || defaultCover,
            };
          } catch (error) {
            return null;
          }
        }),
      );

      // Filter out null entries (novels not in library)
      setNovels(novelsWithNames.filter(n => n !== null) as NovelWithInfo[]);
    } catch (error) {
      showToast('Error loading novels');
    } finally {
      setLoading(false);
    }
  }, [isCustomStorage]);

  // Use unique key combining pluginId and novelId for selection
  const getNovelKey = (novel: NovelWithInfo) =>
    `${novel.pluginId}-${novel.novelId}`;

  const toggleNovel = (novelKey: string) => {
    const newSelected = new Set(selectedNovels);
    if (newSelected.has(novelKey)) {
      newSelected.delete(novelKey);
    } else {
      newSelected.add(novelKey);
    }
    setSelectedNovels(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedNovels.size === novels.length) {
      setSelectedNovels(new Set());
    } else {
      setSelectedNovels(new Set(novels.map(n => getNovelKey(n))));
    }
  };

  const totalSelectedSize = useMemo(() => {
    return novels
      .filter(n => selectedNovels.has(getNovelKey(n)))
      .reduce((sum, n) => sum + n.size, 0);
  }, [novels, selectedNovels]);

  const handleMoveNovels = async () => {
    if (selectedNovels.size === 0) {
      showToast('Please select at least one novel');
      return;
    }

    const targetLocation = isCustomStorage ? 'Internal Storage' : 'SD Card';
    const sizeText = StorageManager.formatStorageSize(totalSelectedSize);

    // Use showToast for confirmation instead of Alert to avoid Activity detachment issues
    showToast(
      `Moving ${selectedNovels.size} novel(s) (${sizeText}) to ${targetLocation}...`,
    );

    setIsMoving(true);
    let success = 0;
    let failed = 0;

    // Get selected novels
    const selectedNovelsToMove = novels.filter(n =>
      selectedNovels.has(getNovelKey(n)),
    );

    for (const novel of selectedNovelsToMove) {
      try {
        // Use StorageManager.moveNovel which handles both regular paths and SAF URIs
        const moved = await StorageManager.moveNovel(
          novel.novelId,
          !isCustomStorage, // toCustomStorage: if we're viewing custom storage, move to internal (false), otherwise move to custom (true)
          novel.pluginId,
        );

        if (moved) {
          success++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
      }
    }

    setIsMoving(false);
    showToast(
      `Moved ${success} novel(s). ${failed > 0 ? `${failed} failed.` : ''}`,
    );
    setSelectedNovels(new Set());
    await loadNovels(); // Refresh current list
    await onMoveComplete(); // Notify parent to refresh storage info
  };

  const styles = createStyles(theme);
  const storageType = isCustomStorage ? 'SD Card' : 'Internal Storage';

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
        <View style={styles.header}>
          <Appbar.Header style={{ backgroundColor: theme.surface }}>
            <Appbar.BackAction onPress={onDismiss} />
            <Appbar.Content title={`${storageType} Novels`} />
          </Appbar.Header>
        </View>

        <View style={styles.statsContainer}>
          <Text style={[styles.statsText, { color: theme.onSurface }]}>
            Total: {novels.length} novel(s)
          </Text>
          {selectedNovels.size > 0 && (
            <Text style={[styles.statsText, { color: theme.primary }]}>
              Selected: {selectedNovels.size} (
              {StorageManager.formatStorageSize(totalSelectedSize)})
            </Text>
          )}
        </View>

        <View style={styles.actionsContainer}>
          <Button
            mode="outlined"
            onPress={toggleSelectAll}
            style={styles.actionButton}
            disabled={isMoving || loading}
          >
            {selectedNovels.size === novels.length
              ? 'Deselect All'
              : 'Select All'}
          </Button>
          <Button
            mode="contained"
            onPress={handleMoveNovels}
            style={styles.actionButton}
            disabled={isMoving || selectedNovels.size === 0 || loading}
            loading={isMoving}
          >
            Move to {isCustomStorage ? 'Internal' : 'SD Card'}
          </Button>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={{ color: theme.onSurface }}>Loading novels...</Text>
          </View>
        ) : (
          <FlatList
            data={novels}
            keyExtractor={item => getNovelKey(item)}
            renderItem={({ item }) => {
              const novelKey = getNovelKey(item);
              return (
                <Card
                  style={[
                    styles.novelCard,
                    { backgroundColor: theme.surfaceVariant },
                  ]}
                  onPress={() => toggleNovel(novelKey)}
                >
                  <Card.Content style={styles.novelCardContent}>
                    <Checkbox
                      status={
                        selectedNovels.has(novelKey) ? 'checked' : 'unchecked'
                      }
                      onPress={() => toggleNovel(novelKey)}
                    />
                    <Image
                      source={{ uri: item.cover }}
                      style={styles.novelCover}
                    />
                    <View style={styles.novelInfo}>
                      <Text
                        style={[styles.novelName, { color: theme.onSurface }]}
                        numberOfLines={2}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={[
                          styles.novelDetails,
                          { color: theme.onSurfaceVariant },
                        ]}
                      >
                        {item.chapterCount} chapter
                        {item.chapterCount !== 1 ? 's' : ''} ·{' '}
                        {StorageManager.formatStorageSize(item.size)}
                      </Text>
                    </View>
                  </Card.Content>
                </Card>
              );
            }}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={{ color: theme.onSurfaceVariant }}>
                  No novels found in this storage location
                </Text>
              </View>
            }
          />
        )}
      </Modal>
    </Portal>
  );
};

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    modal: {
      margin: 20,
      borderRadius: 8,
      maxHeight: '80%',
    },
    header: {
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
    },
    statsContainer: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.outline,
    },
    statsText: {
      fontSize: 14,
      marginBottom: 4,
    },
    actionsContainer: {
      flexDirection: 'row',
      padding: 16,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.outline,
    },
    actionButton: {
      flex: 1,
    },
    listContent: {
      padding: 16,
    },
    novelCard: {
      marginBottom: 8,
    },
    novelCardContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    novelCover: {
      width: 40,
      height: 56,
      borderRadius: 4,
      marginLeft: 8,
    },
    novelInfo: {
      flex: 1,
      marginLeft: 12,
    },
    novelName: {
      fontSize: 16,
      fontWeight: '500',
      marginBottom: 4,
    },
    novelDetails: {
      fontSize: 13,
    },
    loadingContainer: {
      padding: 32,
      alignItems: 'center',
    },
    emptyContainer: {
      padding: 32,
      alignItems: 'center',
    },
  });
