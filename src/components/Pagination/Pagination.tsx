import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  IconButton,
  Portal,
  Dialog,
  TextInput,
  Button,
} from 'react-native-paper';
import { useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';

interface PaginationProps {
  page: number;
  onPageChange: (page: number) => void;
  isFirstPage: boolean;
  isLastPage: boolean;
}

const Pagination: React.FC<PaginationProps> = ({
  page,
  onPageChange,
  isFirstPage,
  isLastPage,
}) => {
  const theme = useTheme();
  const [showJumpModal, setShowJumpModal] = useState(false);
  const [jumpPage, setJumpPage] = useState('');

  const handleJump = () => {
    const pageNum = parseInt(jumpPage, 10);
    if (!isNaN(pageNum) && pageNum > 0) {
      onPageChange(pageNum);
    }
    setShowJumpModal(false);
    setJumpPage('');
  };

  return (
    <>
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        <IconButton
          icon="chevron-left"
          disabled={isFirstPage}
          onPress={() => onPageChange(page - 1)}
          iconColor={theme.onSurface}
        />
        <Pressable onPress={() => setShowJumpModal(true)}>
          <Text style={[styles.text, { color: theme.onSurface }]}>
            {getString('common.page')} {page}
          </Text>
        </Pressable>
        <IconButton
          icon="chevron-right"
          disabled={isLastPage}
          onPress={() => onPageChange(page + 1)}
          iconColor={theme.onSurface}
        />
      </View>

      <Portal>
        <Dialog
          visible={showJumpModal}
          onDismiss={() => setShowJumpModal(false)}
          style={{ backgroundColor: theme.surface }}
        >
          <Dialog.Title style={{ color: theme.onSurface }}>
            {getString('common.jumpToPage')}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              value={jumpPage}
              onChangeText={setJumpPage}
              keyboardType="number-pad"
              mode="outlined"
              textColor={theme.onSurface}
              theme={{
                colors: { primary: theme.primary, background: theme.surface },
              }}
              placeholder={String(page)}
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => setShowJumpModal(false)}
              textColor={theme.primary}
            >
              {getString('common.cancel')}
            </Button>
            <Button onPress={handleJump} textColor={theme.primary}>
              {getString('common.ok')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    elevation: 4,
  },
  text: {
    fontSize: 16,
    marginHorizontal: 16,
  },
});

export default Pagination;
