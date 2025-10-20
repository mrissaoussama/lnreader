import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Portal } from 'react-native-paper';
import { ThemeColors } from '@theme/types';
import { Modal } from '@components';
import { getString } from '@strings/translations';
import { showToast } from '@utils/showToast';

interface DeleteRangeModalProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (start: number, end: number) => void;
  theme: ThemeColors;
}

const DeleteRangeModal = ({
  visible,
  onDismiss,
  onConfirm,
  theme,
}: DeleteRangeModalProps) => {
  const [start, setStart] = useState<string>('');
  const [end, setEnd] = useState<string>('');

  const submit = () => {
    const s = parseInt(start, 10);
    const e = parseInt(end, 10);
    if (!isNaN(s) && !isNaN(e) && s > 0 && e > 0 && s <= e) {
      onConfirm(s, e);
      setStart('');
      setEnd('');
      onDismiss();
      showToast(`Deleting chapters ${s} to ${e}`);
    } else {
      showToast('Invalid range');
    }
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss}>
        <Text style={[styles.title, { color: theme.onSurface }]}>
          {getString('novelScreen.deleteRange') || 'Delete chapter range'}
        </Text>
        <View style={styles.row}>
          <View style={styles.inputCtn}>
            <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
              {getString('common.from') || 'From'}
            </Text>
            <TextInput
              value={start}
              onChangeText={setStart}
              keyboardType="numeric"
              style={[
                styles.input,
                { color: theme.onSurface, borderColor: theme.outline },
              ]}
              placeholder="1"
              placeholderTextColor={theme.onSurfaceDisabled}
            />
          </View>
          <View style={styles.inputCtn}>
            <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
              {getString('common.to') || 'To'}
            </Text>
            <TextInput
              value={end}
              onChangeText={setEnd}
              keyboardType="numeric"
              style={[
                styles.input,
                { color: theme.onSurface, borderColor: theme.outline },
              ]}
              placeholder="100"
              placeholderTextColor={theme.onSurfaceDisabled}
            />
          </View>
        </View>
        <Button
          onPress={submit}
          textColor={theme.onPrimary}
          buttonColor={theme.primary}
        >
          {getString('common.delete')}
        </Button>
      </Modal>
    </Portal>
  );
};

export default DeleteRangeModal;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputCtn: { flex: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  label: { marginBottom: 6 },
  title: { fontSize: 16, marginBottom: 12, fontWeight: '600' },
});
