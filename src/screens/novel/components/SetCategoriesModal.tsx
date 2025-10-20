import React, { useEffect, useState, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Divider, Portal } from 'react-native-paper';
import { NavigationProp, useNavigation } from '@react-navigation/native';

import { Button, Modal } from '@components/index';

import { useTheme } from '@hooks/persisted';

import { getString } from '@strings/translations';
import { getCategoriesWithCount } from '@database/queries/CategoryQueries';
import { CCategory, Category } from '@database/types';
import { Checkbox } from '@components/Checkbox/Checkbox';
import { xor } from 'lodash-es';
import { RootStackParamList } from '@navigators/types';

interface SetCategoryModalProps {
  novelIds: number[];
  visible: boolean;
  onEditCategories?: () => void;
  closeModal: () => void;
  onSuccess?: () => void | Promise<void>;
}

const SetCategoryModal: React.FC<SetCategoryModalProps> = ({
  novelIds,
  closeModal,
  visible,
  onSuccess,
  onEditCategories,
}) => {
  const theme = useTheme();
  const { navigate } = useNavigation<NavigationProp<RootStackParamList>>();
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [categories = [], setCategories] = useState<CCategory[]>();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (visible && !loadedRef.current && novelIds.length > 0) {
      const res = getCategoriesWithCount(novelIds);
      setCategories(res);
      setSelectedCategories(res.filter(c => c.novelsCount));
      loadedRef.current = true;
    } else if (!visible) {
      // Reset when modal closes
      loadedRef.current = false;
    }
  }, [visible, novelIds]);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={() => {
          closeModal();
          setSelectedCategories([]);
        }}
      >
        <Text style={[styles.modalTitle, { color: theme.onSurface }]}>
          {getString('categories.setCategories')}
        </Text>
        <FlatList
          data={categories}
          renderItem={({ item }) => (
            <Checkbox
              status={
                selectedCategories.find(category => category.id === item.id) !==
                undefined
              }
              label={item.name}
              onPress={() =>
                setSelectedCategories(xor(selectedCategories, [item]))
              }
              viewStyle={styles.checkboxView}
              theme={theme}
            />
          )}
          ListEmptyComponent={
            <Text style={{ color: theme.onSurfaceVariant }}>
              {getString('categories.setModalEmptyMsg')}
            </Text>
          }
        />
        <Divider
          style={[
            {
              backgroundColor: theme.onSurfaceDisabled,
            },
            styles.divider,
          ]}
        />
        <View style={styles.btnContainer}>
          <Button
            title={getString('common.edit')}
            onPress={() => {
              navigate('MoreStack', {
                screen: 'Categories',
              });
              closeModal();
              onEditCategories?.();
            }}
          />
          <View style={styles.flex} />
          <Button
            title={getString('common.cancel')}
            onPress={() => {
              closeModal();
            }}
          />
          <Button
            title={getString('common.ok')}
            onPress={async () => {
              try {
                // First ensure novels are in library, then update categories
                const { db } = await import('@database/db');

                // Process in a single transaction for atomicity
                await db.withTransactionAsync(async () => {
                  for (const novelId of novelIds) {
                    // Update novel to be in library
                    await db.runAsync(
                      'UPDATE Novel SET inLibrary = 1 WHERE id = ?',
                      [novelId],
                    );

                    // Remove all existing categories for this novel
                    await db.runAsync(
                      'DELETE FROM NovelCategory WHERE novelId = ?',
                      [novelId],
                    );

                    // Add selected categories
                    for (const category of selectedCategories) {
                      await db.runAsync(
                        'INSERT INTO NovelCategory (novelId, categoryId) VALUES (?, ?)',
                        [novelId, category.id],
                      );
                    }

                    // If no categories selected, add to default category (sort = 1)
                    if (selectedCategories.length === 0) {
                      const defaultCategory = await db.getFirstAsync<{
                        id: number;
                      }>('SELECT id FROM Category WHERE sort = 1');
                      if (defaultCategory) {
                        await db.runAsync(
                          'INSERT INTO NovelCategory (novelId, categoryId) VALUES (?, ?)',
                          [novelId, defaultCategory.id],
                        );
                      }
                    }
                  }
                });

                closeModal();
                await onSuccess?.();
              } catch (error: any) {
                const { showToast } = await import('@utils/showToast');
                showToast(`Failed to add to library: ${error.message}`);
              }
            }}
          />
        </View>
      </Modal>
    </Portal>
  );
};

export default SetCategoryModal;

const styles = StyleSheet.create({
  divider: { height: 1, width: '90%', marginLeft: '5%' },
  btnContainer: {
    flexDirection: 'row',
    marginTop: 20,
  },
  checkboxView: {
    marginBottom: 5,
  },
  flex: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 24,
    marginBottom: 20,
  },
  modelOption: {
    fontSize: 15,
    marginVertical: 10,
  },
});
