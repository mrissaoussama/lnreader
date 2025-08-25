import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Modal, Button } from 'react-native-paper';
import SetTrackChaptersDialog from './SetTrackChaptersDialog';
import UpdateAllTrackersDialog from './UpdateAllTrackersDialog';
import { getString } from '@strings/translations';
import { trackModalStyles as styles } from './TrackModal.styles';

interface TrackDialogsProps {
  theme: any;
  selectedTrack: any | null;
  chaptersDialog: boolean;
  hideChaptersDialog: () => void;
  handleUpdate: (
    track: any,
    newChapter: number,
    forceUpdate?: boolean,
    newVolume?: number,
  ) => void;
  availableLists: Array<{ id: string; name: string }>;
  dialogSelectedListId: string | null;
  setDialogSelectedListId: (id: string | null) => void;
  setSelectedReadingList: (list: any) => void;
  refreshReadingLists: () => void;
  refreshingLists: boolean;
  tracks: any[];
  updateAllDialogVisible: boolean;
  setUpdateAllDialogVisible: (v: boolean) => void;
  handleUpdateAllConfirm: (progress: number) => void;
  appProgress: number;
  loadTracks: () => void;
  titlePickerVisible: boolean;
  setTitlePickerVisible: (v: boolean) => void;
  availableTitles: string[];
  handleTitleSelect: (title: string) => void;
  showListModal: boolean;
  setShowListModal: (v: boolean) => void;
  linkingLists?: Array<{ id: string; name: string }>;
  selectedReadingList: any | null | undefined;
  linking: boolean;
  setLinking: (v: boolean) => void;
  linkingCancelledRef: React.MutableRefObject<boolean>;
  unlinkDialogVisible: boolean;
  setUnlinkDialogVisible: (v: boolean) => void;
  trackPendingUnlink: any | null;
  confirmUnlink: () => void;
  trackersCapabilities: Record<string, any>;
}

export const TrackDialogs: React.FC<TrackDialogsProps> = props => {
  const {
    theme,
    selectedTrack,
    chaptersDialog,
    hideChaptersDialog,
    handleUpdate,
    availableLists,
    dialogSelectedListId,
    setDialogSelectedListId,
    setSelectedReadingList,
    refreshReadingLists,
    refreshingLists,
    tracks,
    updateAllDialogVisible,
    setUpdateAllDialogVisible,
    handleUpdateAllConfirm,
    appProgress,
    loadTracks,
    titlePickerVisible,
    setTitlePickerVisible,
    availableTitles,
    handleTitleSelect,
    showListModal,
    setShowListModal,
    linkingLists,
    linking,
    setLinking,
    linkingCancelledRef,
    unlinkDialogVisible,
    setUnlinkDialogVisible,
    trackPendingUnlink,
    confirmUnlink,
    trackersCapabilities,
  } = props;

  return (
    <>
      <SetTrackChaptersDialog
        track={selectedTrack as any}
        visible={chaptersDialog}
        hideDialog={hideChaptersDialog}
        onSubmit={handleUpdate}
        theme={theme}
        trackerName={selectedTrack?.source as any}
        availableLists={availableLists}
        selectedListId={dialogSelectedListId}
        onChangeList={listId => {
          setDialogSelectedListId(listId);
          const selectedList = availableLists.find(l => l.id === listId);
          if (selectedList) {
            setSelectedReadingList(selectedList);
          }
        }}
        supportsVolumes={
          trackersCapabilities[selectedTrack?.source as any]?.supportsVolumes
        }
        onRefreshLists={refreshReadingLists}
        isRefreshingLists={refreshingLists}
      />
      <UpdateAllTrackersDialog
        tracks={tracks}
        visible={updateAllDialogVisible}
        onDismiss={() => {
          setUpdateAllDialogVisible(false);
          loadTracks();
        }}
        onConfirm={({ targetChapters }) =>
          handleUpdateAllConfirm(targetChapters ?? appProgress)
        }
        appProgress={appProgress}
        theme={theme}
      />
      <Modal
        visible={titlePickerVisible}
        onDismiss={() => setTitlePickerVisible(false)}
        contentContainerStyle={[
          styles.pickerModalContainer,
          { backgroundColor: theme.surface },
        ]}
      >
        <View style={styles.pickerModalContent}>
          <Text style={[styles.pickerTitle, { color: theme.onSurface }]}>
            Select an alternative title
          </Text>
          <FlatList
            data={availableTitles}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.titleOption}
                onPress={() => handleTitleSelect(item)}
              >
                <Text
                  style={[styles.pickerItemText, { color: theme.onSurface }]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            )}
            keyExtractor={(item, index) => `${item}-${index}`}
          />
          <TouchableOpacity
            style={[
              styles.modalCancelButton,
              { backgroundColor: theme.primary },
            ]}
            onPress={() => setTitlePickerVisible(false)}
          >
            <Text style={[styles.modalCancelText, { color: theme.onPrimary }]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
      <Modal
        visible={showListModal}
        onDismiss={() => setShowListModal(false)}
        contentContainerStyle={[
          styles.pickerModalContainer,
          { backgroundColor: theme.surface },
        ]}
      >
        <View style={styles.pickerModalContent}>
          <Text style={[styles.pickerTitle, { color: theme.onSurface }]}>
            Select a reading list
          </Text>
          <FlatList
            data={selectedTrack ? availableLists : linkingLists || []}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.listOption}
                onPress={() => {
                  setSelectedReadingList(item);
                  if (selectedTrack) {
                    setDialogSelectedListId(item.id);
                  }
                  setShowListModal(false);
                }}
              >
                <Text
                  style={[styles.pickerItemText, { color: theme.onSurface }]}
                >
                  {item.name}
                </Text>
                {(selectedTrack
                  ? dialogSelectedListId === item.id
                  : (linkingLists || []).some(
                      l =>
                        l.id === item.id &&
                        l.id ===
                          linkingLists?.find(ll => ll.id === item.id)?.id,
                    )) && <Text style={{ color: theme.primary }}>✓</Text>}
              </TouchableOpacity>
            )}
            keyExtractor={(item, index) => `${item.id}-${index}`}
          />
          <TouchableOpacity
            style={[
              styles.modalCancelButton,
              { backgroundColor: theme.primary },
            ]}
            onPress={() => setShowListModal(false)}
          >
            <Text style={[styles.modalCancelText, { color: theme.onPrimary }]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
      <Modal
        visible={linking}
        onDismiss={() => {
          linkingCancelledRef.current = true;
          setLinking(false);
        }}
        contentContainerStyle={[
          styles.linkingModalContainer,
          { backgroundColor: theme.surface },
        ]}
      >
        <ActivityIndicator color={theme.primary} size="large" />
        <Text style={[styles.loadingText, { color: theme.onSurface }]}>
          Linking...
        </Text>
        <TouchableOpacity
          style={[styles.modalCancelButton, { backgroundColor: theme.primary }]}
          onPress={() => {
            linkingCancelledRef.current = true;
            setLinking(false);
          }}
        >
          <Text style={[styles.modalCancelText, { color: theme.onPrimary }]}>
            Cancel
          </Text>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={unlinkDialogVisible}
        onDismiss={() => setUnlinkDialogVisible(false)}
        contentContainerStyle={[
          styles.pickerModalContainer,
          { backgroundColor: theme.surface },
        ]}
      >
        <View style={styles.pickerModalContent}>
          <Text style={[styles.pickerTitle, { color: theme.onSurface }]}>
            {getString('common.areYouSure' as any)}
          </Text>
          <Text
            style={[styles.pickerItemText, { color: theme.onSurfaceVariant }]}
          >
            {getString('trackingDialog.unlink' as any)}{' '}
            {trackPendingUnlink?.source}: {trackPendingUnlink?.title}?
          </Text>
          <View style={styles.rowEndWithGap}>
            <Button mode="text" onPress={() => setUnlinkDialogVisible(false)}>
              {getString('common.cancel')}
            </Button>
            <Button
              mode="contained"
              onPress={confirmUnlink}
              buttonColor={theme.error}
              textColor={theme.onError}
            >
              {getString('common.confirm' as any)}
            </Button>
          </View>
        </View>
      </Modal>
    </>
  );
};
