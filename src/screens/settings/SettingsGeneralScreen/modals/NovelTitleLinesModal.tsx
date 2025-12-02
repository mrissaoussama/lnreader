import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Portal } from 'react-native-paper';
import { RadioButton } from '@components/RadioButton/RadioButton';
import { ThemeColors } from '@theme/types';
import { useLibrarySettings } from '@hooks/persisted';
import { Modal } from '@components';

interface NovelTitleLinesModalProps {
  novelTitleLines: number;
  visible: boolean;
  onDismiss: () => void;
  theme: ThemeColors;
}

const NovelTitleLinesModal: React.FC<NovelTitleLinesModalProps> = ({
  novelTitleLines,
  visible,
  onDismiss,
  theme,
}) => {
  const { setLibrarySettings } = useLibrarySettings();

  const options = [1, 2, 3, 4];

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss}>
        <Text style={[styles.modalHeader, { color: theme.onSurface }]}>
          Novel Title Lines
        </Text>
        {options.map(lines => (
          <RadioButton
            key={lines}
            status={lines === novelTitleLines}
            label={`${lines} line${lines > 1 ? 's' : ''}`}
            onPress={() => setLibrarySettings({ novelTitleLines: lines })}
            theme={theme}
          />
        ))}
      </Modal>
    </Portal>
  );
};

export default NovelTitleLinesModal;

const styles = StyleSheet.create({
  modalHeader: {
    fontSize: 24,
    marginBottom: 10,
  },
});
