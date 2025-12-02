import React, { useState, useEffect } from 'react';
import { Modal, Portal, Button, Text } from 'react-native-paper';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ErrorLogger, ErrorLogEntry } from '@utils/ErrorLogger';
import { ThemeColors } from '@theme/types';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@utils/showToast';

interface ErrorLogModalProps {
  visible: boolean;
  onDismiss: () => void;
  taskType: ErrorLogEntry['taskType'];
  theme: ThemeColors;
}

export const ErrorLogModal: React.FC<ErrorLogModalProps> = ({
  visible,
  onDismiss,
  taskType,
  theme,
}) => {
  const [errorText, setErrorText] = useState('');
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    if (visible) {
      const formatted = ErrorLogger.getFormattedErrors(taskType);
      setErrorText(formatted);
      setErrorCount(ErrorLogger.getErrorCount(taskType));
    }
  }, [visible, taskType]);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(errorText);
    showToast('Errors copied to clipboard');
  };

  const handleClear = () => {
    ErrorLogger.clearErrors(taskType);
    // Force refresh the display by re-reading from storage
    const formatted = ErrorLogger.getFormattedErrors(taskType);
    setErrorText(formatted);
    setErrorCount(ErrorLogger.getErrorCount(taskType));
    showToast('Error log cleared');
  };

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
          <Text style={[styles.title, { color: theme.onSurface }]}>
            Error Log ({errorCount})
          </Text>
        </View>

        <ScrollView style={styles.scrollView}>
          <Text
            style={[styles.errorText, { color: theme.onSurfaceVariant }]}
            selectable
          >
            {errorText}
          </Text>
        </ScrollView>

        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={handleCopy}
            style={styles.button}
            disabled={errorCount === 0}
          >
            Copy
          </Button>
          <Button
            mode="outlined"
            onPress={handleClear}
            style={styles.button}
            disabled={errorCount === 0}
          >
            Clear
          </Button>
          <Button mode="contained" onPress={onDismiss} style={styles.button}>
            Close
          </Button>
        </View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modal: {
    margin: 20,
    padding: 20,
    borderRadius: 8,
    maxHeight: '80%',
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  scrollView: {
    maxHeight: 400,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  button: {
    marginLeft: 8,
  },
});
