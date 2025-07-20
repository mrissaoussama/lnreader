import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import {
  Modal,
  Portal,
  Button,
  Text,
  IconButton,
  List,
} from 'react-native-paper';
import { ThemeColors } from '@theme/types';
import { getString } from '@strings/translations';
import { FilterPreset } from '@utils/filterPresets';

interface ManagePresetsModalProps {
  visible: boolean;
  onDismiss: () => void;
  presets: FilterPreset[];
  onLoadPreset: (preset: FilterPreset) => void;
  onDeletePreset: (presetId: string) => void;
  theme: ThemeColors;
}

const PresetIcon = (props: any) => (
  <List.Icon {...props} icon="filter-variant" />
);

const ManagePresetsModal: React.FC<ManagePresetsModalProps> = ({
  visible,
  onDismiss,
  presets,
  onLoadPreset,
  onDeletePreset,
  theme,
}) => {
  const renderRightActions = (item: FilterPreset) => (
    <View style={styles.rightActions}>
      <IconButton
        icon="download"
        size={20}
        onPress={() => {
          onLoadPreset(item);
          onDismiss();
        }}
      />
      <IconButton
        icon="delete"
        size={20}
        onPress={() => onDeletePreset(item.id)}
      />
    </View>
  );

  const renderPresetItem = ({ item }: { item: FilterPreset }) => (
    <List.Item
      title={item.name}
      description={new Date(item.createdAt).toLocaleDateString()}
      left={PresetIcon}
      right={() => renderRightActions(item)}
      onPress={() => {
        onLoadPreset(item);
        onDismiss();
      }}
    />
  );

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.container,
          { backgroundColor: theme.surface },
        ]}
      >
        <Text
          style={[styles.title, { color: theme.onSurface }]}
          variant="titleMedium"
        >
          {getString('browseScreen.filterPresets.managePresets')}
        </Text>

        {presets.length === 0 ? (
          <Text
            style={[styles.emptyText, { color: theme.onSurfaceVariant }]}
            variant="bodyMedium"
          >
            {getString('browseScreen.filterPresets.noPresets')}
          </Text>
        ) : (
          <FlatList
            data={presets}
            renderItem={renderPresetItem}
            keyExtractor={item => item.id}
            style={styles.list}
          />
        )}

        <View style={styles.buttonContainer}>
          <Button onPress={onDismiss} mode="text">
            {getString('common.cancel')}
          </Button>
        </View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 20,
    borderRadius: 8,
    maxHeight: '80%',
  },
  title: {
    margin: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    margin: 20,
  },
  list: {
    maxHeight: 400,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 20,
    paddingTop: 10,
  },
});

export default ManagePresetsModal;
