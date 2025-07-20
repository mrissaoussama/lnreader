import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Modal, Portal, TextInput, Button, Text } from 'react-native-paper';
import { ThemeColors } from '@theme/types';
import { getString } from '@strings/translations';

interface SavePresetModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSave: (name: string) => void;
  theme: ThemeColors;
}

const SavePresetModal: React.FC<SavePresetModalProps> = ({
  visible,
  onDismiss,
  onSave,
  theme,
}) => {
  const [presetName, setPresetName] = useState('');

  const handleSave = () => {
    if (presetName.trim()) {
      onSave(presetName.trim());
      setPresetName('');
      onDismiss();
    }
  };

  const handleCancel = () => {
    setPresetName('');
    onDismiss();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleCancel}
        contentContainerStyle={[
          styles.container,
          { backgroundColor: theme.surface },
        ]}
      >
        <Text
          style={[styles.title, { color: theme.onSurface }]}
          variant="titleMedium"
        >
          {getString('browseScreen.filterPresets.savePreset')}
        </Text>

        <TextInput
          label={getString('browseScreen.filterPresets.presetName')}
          value={presetName}
          onChangeText={setPresetName}
          mode="outlined"
          style={styles.input}
          autoFocus
        />

        <View style={styles.buttonContainer}>
          <Button onPress={handleCancel} mode="text">
            {getString('common.cancel')}
          </Button>
          <Button
            onPress={handleSave}
            mode="contained"
            disabled={!presetName.trim()}
          >
            {getString('common.save')}
          </Button>
        </View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    margin: 20,
    borderRadius: 8,
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    marginBottom: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});

export default SavePresetModal;
