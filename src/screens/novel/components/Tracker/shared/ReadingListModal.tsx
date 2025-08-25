import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Modal, Portal } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '@theme/types';
import { trackModalStyles } from '../TrackModal.styles';
import { ReadingListItem } from './ReadingListSelector';

interface ReadingListModalProps {
  visible: boolean;
  onDismiss: () => void;
  theme: ThemeColors;
  lists: ReadingListItem[];
  selectedList: ReadingListItem | null;
  onSelectList: (list: ReadingListItem) => void;
  title?: string;
}

const ReadingListModal: React.FC<ReadingListModalProps> = ({
  visible,
  onDismiss,
  theme,
  lists,
  selectedList,
  onSelectList,
  title = 'Select a reading list',
}) => {
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();

  const renderItem = ({ item }: { item: ReadingListItem }) => (
    <TouchableOpacity
      style={styles.listOption}
      onPress={() => {
        onSelectList(item);
        onDismiss();
      }}
    >
      <Text style={[styles.pickerItemText, { color: theme.onSurface }]}>
        {item.name}
      </Text>
      {selectedList?.id === item.id && (
        <Text style={{ color: theme.primary }}>✓</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          trackModalStyles.sharedDialogContainer,
          styles.modalContainer,
          {
            backgroundColor: theme.surface2 || theme.surface,
            marginTop: topInset + 20,
            marginBottom: bottomInset + 20,
          },
        ]}
      >
        <View style={styles.modalContent}>
          <Text style={[styles.pickerTitle, { color: theme.onSurface }]}>
            {title}
          </Text>
          <FlatList
            data={lists}
            renderItem={renderItem}
            keyExtractor={item => item.id}
          />
          <TouchableOpacity
            style={[
              styles.modalCancelButton,
              { backgroundColor: theme.primary },
            ]}
            onPress={onDismiss}
          >
            <Text style={[styles.modalCancelText, { color: theme.onPrimary }]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalContainer: { padding: 20 },
  modalContent: {
    maxHeight: '70%',
    minHeight: 300,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  listOption: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: '#333',
    minHeight: 40,
  },
  pickerItemText: {
    fontSize: 14,
    flex: 1,
  },
  modalCancelButton: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default ReadingListModal;
