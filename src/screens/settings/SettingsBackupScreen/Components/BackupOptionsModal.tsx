import React, { useState } from 'react';
import { Modal, Portal, Text, Checkbox } from 'react-native-paper';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { ThemeColors } from '@theme/types';
import { getString } from '@strings/translations';
import color from 'color';

export interface BackupOptions {
  includeCovers: boolean;
  includeChapters: boolean;
  includeDownloads: boolean;
  includeSettings: boolean;
  includeRepositories: boolean;
  includePlugins: boolean;
}

interface BackupOptionsModalProps {
  visible: boolean;
  theme: ThemeColors;
  title: string;
  onDismiss: () => void;
  onConfirm: (options: BackupOptions) => void;
  isRestore?: boolean;
}

const BackupOptionsModal: React.FC<BackupOptionsModalProps> = ({
  visible,
  theme,
  title,
  onDismiss,
  onConfirm,
  isRestore = false,
}) => {
  const [options, setOptions] = useState<BackupOptions>({
    includeCovers: true,
    includeChapters: true,
    includeDownloads: false,
    includeSettings: true,
    includeRepositories: true,
    includePlugins: true,
  });

  const toggleOption = (key: keyof BackupOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConfirm = () => {
    onConfirm(options);
    onDismiss();
  };

  const renderCheckbox = (
    label: string,
    description: string,
    key: keyof BackupOptions,
  ) => (
    <Pressable
      style={styles.optionRow}
      onPress={() => toggleOption(key)}
      android_ripple={{ color: theme.rippleColor }}
    >
      <View style={styles.optionTextContainer}>
        <Text style={[styles.optionLabel, { color: theme.onSurface }]}>
          {label}
        </Text>
        <Text
          style={[styles.optionDescription, { color: theme.onSurfaceVariant }]}
        >
          {description}
        </Text>
      </View>
      <Checkbox.Android
        status={options[key] ? 'checked' : 'unchecked'}
        onPress={() => toggleOption(key)}
        uncheckedColor={theme.onSurfaceDisabled}
        color={theme.primary}
      />
    </Pressable>
  );

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modalContainer,
          { backgroundColor: theme.surface },
        ]}
      >
        <Text style={[styles.title, { color: theme.onSurface }]}>{title}</Text>

        <ScrollView style={styles.scrollView}>
          {renderCheckbox(
            getString('backupScreen.includeCovers'),
            getString('backupScreen.includeCoversDesc'),
            'includeCovers',
          )}

          {renderCheckbox(
            getString('backupScreen.includeChapters'),
            getString('backupScreen.includeChaptersDesc'),
            'includeChapters',
          )}

          {renderCheckbox(
            getString('backupScreen.includeDownloadedChapters'),
            getString('backupScreen.includeDownloadedChaptersDesc'),
            'includeDownloads',
          )}

          {renderCheckbox(
            getString('backupScreen.includeSettings'),
            getString('backupScreen.includeSettingsDesc'),
            'includeSettings',
          )}

          {renderCheckbox(
            getString('backupScreen.includeRepositories'),
            getString('backupScreen.includeRepositoriesDesc'),
            'includeRepositories',
          )}
          {renderCheckbox(
            getString('backupScreen.includePlugins'),
            getString('backupScreen.includePluginsDesc'),
            'includePlugins',
          )}
        </ScrollView>

        <View style={styles.buttonContainer}>
          <Pressable
            style={[
              styles.button,
              { backgroundColor: color(theme.primary).alpha(0.12).string() },
            ]}
            onPress={onDismiss}
            android_ripple={{ color: theme.rippleColor }}
          >
            <Text style={[styles.buttonText, { color: theme.primary }]}>
              {getString('common.cancel')}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={handleConfirm}
            android_ripple={{
              color: color(theme.primary).darken(0.2).string(),
            }}
          >
            <Text style={[styles.buttonText, { color: theme.onPrimary }]}>
              {isRestore
                ? getString('backupScreen.restore')
                : getString('backupScreen.backup')}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    margin: 20,
    borderRadius: 8,
    padding: 20,
    maxHeight: '80%',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  scrollView: {
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  optionTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  optionLabel: {
    fontSize: 16,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 4,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});

export default BackupOptionsModal;
