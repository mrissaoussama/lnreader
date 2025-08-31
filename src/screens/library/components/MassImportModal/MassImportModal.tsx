import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Dialog, Portal, TextInput } from 'react-native-paper';
import { useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';
import ServiceManager from '@services/ServiceManager';

interface MassImportModalProps {
  visible: boolean;
  closeModal: () => void;
}

const MassImportModal: React.FC<MassImportModalProps> = ({
  visible,
  closeModal,
}) => {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [delay, setDelay] = useState('500');

  const preprocessUrls = (inputText: string): string[] => {
    const normalizedText = inputText.replace(
      /([^\s\n])(https?:\/\/)/g,
      '$1\n$2',
    );

    return normalizedText
      .split(/[\s\n]+/)
      .map(url => url.trim())
      .filter(url => url !== '');
  };

  const handleImport = () => {
    const urls = preprocessUrls(text);
    const delayMs = parseInt(delay, 10) || 500;

    if (urls.length > 0) {
      ServiceManager.manager.addTask({
        name: 'MASS_IMPORT',
        data: { urls, delay: delayMs },
      });
    }

    closeModal();
    setText('');
    setDelay('500');
  };

  const handleCancel = () => {
    closeModal();
    setText('');
    setDelay('500');
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={handleCancel}
        style={{ backgroundColor: theme.surface }}
      >
        <Dialog.Title style={{ color: theme.onSurface }}>
          {getString('libraryScreen.massImportModal.title')}
        </Dialog.Title>
        <Dialog.Content>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={8}
            placeholder={getString('libraryScreen.massImportModal.placeholder')}
            style={styles.textInput}
            contentStyle={styles.textInputContent}
            theme={{ colors: { ...theme } }}
          />
          <TextInput
            value={delay}
            onChangeText={setDelay}
            keyboardType="numeric"
            placeholder="500"
            label={getString('libraryScreen.massImportModal.delayLabel')}
            right={<TextInput.Affix text="ms" />}
            style={styles.delayInput}
            theme={{ colors: { ...theme } }}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            onPress={handleCancel}
            theme={{ colors: { primary: theme.primary } }}
            labelStyle={{ color: theme.onSurface }}
          >
            {getString('common.cancel')}
          </Button>
          <Button
            onPress={handleImport}
            theme={{ colors: { primary: theme.primary } }}
            labelStyle={{ color: theme.onSurface }}
          >
            {getString('common.import')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  textInput: {
    height: 200,
  },
  textInputContent: {
    height: 200,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  delayInput: {
    marginTop: 16,
  },
});

export default MassImportModal;
