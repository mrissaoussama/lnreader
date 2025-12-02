import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { Button, Dialog, Portal, TextInput } from 'react-native-paper';
import { useTheme, useCategories } from '@hooks/persisted';
import { getString } from '@strings/translations';
import ServiceManager from '@services/ServiceManager';
import { MassImportReportModal } from './MassImportReportModal';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import { ImportResult } from '@services/updates/massImport';
import { Checkbox } from '@components/Checkbox/Checkbox';

interface MassImportModalProps {
  visible: boolean;
  closeModal: () => void;
  initialText?: string;
}

const MassImportModal: React.FC<MassImportModalProps> = ({
  visible,
  closeModal,
  initialText = '',
}) => {
  const theme = useTheme();
  const { categories } = useCategories();
  const [text, setText] = useState(initialText);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (visible && initialText) {
      setText(initialText);
    }
    // Set default category (sort = 1) when modal opens
    if (visible && !selectedCategoryId) {
      const defaultCategory = categories.find(c => c.sort === 1);
      if (defaultCategory) {
        setSelectedCategoryId(defaultCategory.id);
      }
    }
  }, [visible, initialText, categories, selectedCategoryId]);

  const hasReportData = (): boolean => {
    const result = getMMKVObject<ImportResult>('LAST_MASS_IMPORT_RESULT');
    return result
      ? result.added?.length > 0 ||
          result.skipped?.length > 0 ||
          result.errored?.length > 0
      : false;
  };

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

    if (urls.length > 0) {
      ServiceManager.manager.addTask({
        name: 'MASS_IMPORT',
        data: { urls, categoryId: selectedCategoryId },
      });
    }

    closeModal();
    setText('');
    setSelectedCategoryId(null);
  };

  const handleCancel = () => {
    closeModal();
    setText('');
    setSelectedCategoryId(null);
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={handleCancel}
        style={[{ backgroundColor: theme.surface }, styles.dialog]}
      >
        <Dialog.Title style={{ color: theme.onSurface }}>
          {getString('libraryScreen.massImportModal.title')}
        </Dialog.Title>
        <Dialog.ScrollArea style={styles.scrollArea}>
          <View style={styles.scrollContent}>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              numberOfLines={8}
              placeholder={getString(
                'libraryScreen.massImportModal.placeholder',
              )}
              style={styles.textInput}
              contentStyle={styles.textInputContent}
              theme={{ colors: { ...theme } }}
              mode="outlined"
              outlineColor={theme.outline}
              activeOutlineColor={theme.primary}
            />
            <Text style={[styles.categoryLabel, { color: theme.onSurface }]}>
              Select Category:
            </Text>
            <ScrollView style={styles.categoryScrollView}>
              {categories
                .filter(c => c.id !== 2)
                .map(category => (
                  <Checkbox
                    key={category.id}
                    status={selectedCategoryId === category.id}
                    label={category.name}
                    onPress={() => setSelectedCategoryId(category.id)}
                    viewStyle={styles.categoryCheckbox}
                    theme={theme}
                  />
                ))}
            </ScrollView>
          </View>
        </Dialog.ScrollArea>
        <Dialog.Actions style={styles.actions}>
          {hasReportData() && (
            <Button
              onPress={() => setReportModalVisible(true)}
              theme={{ colors: { primary: theme.primary } }}
              labelStyle={{ color: theme.onSurface }}
            >
              View Report
            </Button>
          )}
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
      <MassImportReportModal
        visible={reportModalVisible}
        onDismiss={() => setReportModalVisible(false)}
      />
    </Portal>
  );
};

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '90%',
  },
  scrollArea: {
    paddingHorizontal: 0,
    maxHeight: 500,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  textInput: {
    minHeight: 200,
    marginBottom: 8,
  },
  textInputContent: {
    minHeight: 180,
    textAlignVertical: 'top',
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  categoryCheckbox: {
    marginBottom: 8,
  },
  actions: {
    flexWrap: 'wrap',
  },
  categoryScrollView: {
    maxHeight: 150,
  },
});

export default MassImportModal;
