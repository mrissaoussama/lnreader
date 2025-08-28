import React, { useCallback } from 'react';
import { View, Text, FlatList } from 'react-native';
import { List, IconButton } from 'react-native-paper';
import { getString } from '@strings/translations';
import { trackModalStyles as styles } from './TrackModal.styles';

interface TrackerListSectionProps {
  theme: any;
  trackersOrder: string[];
  allTrackers: Record<string, any>;
  trackMap: Record<string, any>;
  getTrackerAuth: (s: string) => any;
  handleTrackerPress: (s: string) => void;
  tracks: any[];
  isUpdating: boolean;
  handleUpdateAll: () => void;
  onDismiss: () => void;
  onUnlink: (track: any) => void;
  onOpenWeb: (track: any) => void;
}

export const TrackerListSection: React.FC<TrackerListSectionProps> = ({
  theme,
  trackersOrder,
  allTrackers,
  trackMap,
  getTrackerAuth,
  handleTrackerPress,
  tracks,
  isUpdating,
  handleUpdateAll,
  onDismiss,
  onUnlink,
  onOpenWeb,
}) => {
  const renderAccountOffIcon = useCallback(
    () => <List.Icon icon="account-off" />,
    [],
  );
  const renderSyncIcon = useCallback(() => <List.Icon icon="sync" />, []);
  const renderCheckCircleIcon = useCallback(
    () => <List.Icon icon="check-circle" color={theme.primary} />,
    [theme.primary],
  );

  const renderLinkButton = useCallback(
    (item: string) => (
      <IconButton
        icon="link"
        size={20}
        onPress={() => handleTrackerPress(item)}
        accessibilityLabel={getString('trackingDialog.link' as any)}
        iconColor={theme.primary}
      />
    ),
    [theme.primary, handleTrackerPress],
  );

  const renderTrackActions = useCallback(
    (track: any) => (
      <View style={styles.trackActions}>
        <IconButton
          icon="link-off"
          size={20}
          onPress={() => onUnlink(track)}
          accessibilityLabel="Unlink tracker"
        />
        <IconButton
          icon="earth"
          size={20}
          onPress={() => onOpenWeb(track)}
          accessibilityLabel="Open tracker page"
          style={styles.actionIconSpacing}
        />
      </View>
    ),
    [onUnlink, onOpenWeb],
  );

  const renderItem = ({ item }: { item: string }) => {
    const sourceKey = item;
    const track = trackMap[sourceKey];
    const isLoggedIn = getTrackerAuth(sourceKey);

    if (!isLoggedIn) {
      const description =
        (isLoggedIn as any)?.accessToken === 'webview_auth_required'
          ? 'Please login in tracking settings'
          : getString('trackingDialog.notLoggedIn');
      return (
        <List.Item
          title={sourceKey}
          description={description}
          left={renderAccountOffIcon}
          onPress={() => handleTrackerPress(sourceKey)}
          titleStyle={{ color: theme.onSurfaceVariant }}
          descriptionStyle={{ color: theme.onSurfaceVariant }}
        />
      );
    }
    if (track) {
      let listSuffix = '';
      try {
        if (track.metadata) {
          const md = JSON.parse(track.metadata);
          if (md.listName) listSuffix = ` • ${md.listName}`;
        }
      } catch {}
      let volumePrefix = '';
      try {
        const md = track.metadata ? JSON.parse(track.metadata) : {};
        if (typeof md.currentVolume === 'number') {
          const maxV =
            typeof md.maxVolume === 'number' ? md.maxVolume : undefined;
          volumePrefix = `V.${md.currentVolume}${maxV ? `/${maxV}` : ''} • `;
        }
      } catch {}
      return (
        <List.Item
          title={sourceKey}
          titleNumberOfLines={20}
          description={`${volumePrefix}Ch.${track.lastChapterRead || 0}/${
            track.totalChapters || '?'
          }${listSuffix}\n${track.title}`}
          descriptionNumberOfLines={20}
          left={renderCheckCircleIcon}
          right={() => renderTrackActions(track)}
          onPress={() => handleTrackerPress(sourceKey)}
        />
      );
    }
    return (
      <List.Item
        title={sourceKey}
        description={getString('trackingDialog.notTracked' as any)}
        left={renderSyncIcon}
        right={() => renderLinkButton(sourceKey)}
        onPress={() => handleTrackerPress(sourceKey)}
      />
    );
  };

  return (
    <>
      <View style={[styles.appbarHeader, { backgroundColor: theme.surface2 }]}>
        <Text style={[styles.appbarTitle, { color: theme.onSurface }]}>
          {getString('trackingDialog.trackNovel' as any)}
        </Text>
        {tracks.length > 0 && (
          <IconButton
            icon={isUpdating ? 'loading' : 'update'}
            onPress={isUpdating ? undefined : handleUpdateAll}
            iconColor={isUpdating ? theme.onSurfaceVariant : theme.primary}
            disabled={isUpdating}
          />
        )}
        <IconButton
          icon="close"
          onPress={onDismiss}
          iconColor={theme.onSurface}
        />
      </View>
      <FlatList
        data={trackersOrder.filter(t => allTrackers[t])}
        renderItem={renderItem}
        keyExtractor={i => i}
        contentContainerStyle={{ backgroundColor: theme.surface2 }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
              {getString('trackingDialog.noTrackersAvailable' as any)}
            </Text>
          </View>
        }
      />
    </>
  );
};
