import React from 'react';
import { Text, StyleSheet } from 'react-native';

import { Portal } from 'react-native-paper';

import { RadioButton } from '@components/RadioButton/RadioButton';

import { ThemeColors } from '@theme/types';
import { useLibrarySettings } from '@hooks/persisted';
import { Modal } from '@components';

interface LibraryLoadLimitModalProps {
  libraryLoadLimit: number;
  libraryLoadLimitModalVisible: boolean;
  hideLibraryLoadLimitModal: () => void;
  theme: ThemeColors;
}

const LibraryLoadLimitModal: React.FC<LibraryLoadLimitModalProps> = ({
  libraryLoadLimit,
  libraryLoadLimitModalVisible,
  hideLibraryLoadLimitModal,
  theme,
}) => {
  const { setLibrarySettings } = useLibrarySettings();

  const loadLimits = [25, 50, 100, 200, 500, 1000];

  return (
    <Portal>
      <Modal
        visible={libraryLoadLimitModalVisible}
        onDismiss={hideLibraryLoadLimitModal}
      >
        <Text style={[styles.modalHeader, { color: theme.onSurface }]}>
          Library Load Limit
        </Text>
        <Text
          style={[styles.modalDescription, { color: theme.onSurfaceVariant }]}
        >
          Number of novels to load at once in the library screen. Lower values
          improve performance but require scrolling to see more novels.
        </Text>
        {loadLimits.map(limit => {
          return (
            <RadioButton
              key={limit}
              label={`${limit} novels`}
              status={libraryLoadLimit === limit}
              onPress={() => {
                setLibrarySettings({ libraryLoadLimit: limit });
                hideLibraryLoadLimitModal();
              }}
              theme={theme}
            />
          );
        })}
      </Modal>
    </Portal>
  );
};

export default LibraryLoadLimitModal;

const styles = StyleSheet.create({
  modalHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    paddingBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    paddingBottom: 16,
    lineHeight: 20,
  },
});
