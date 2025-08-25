import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Modal, Portal } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '@theme/types';

interface ModalWrapperProps {
  visible: boolean;
  onDismiss: () => void;
  theme: ThemeColors;
  maxHeightPercent?: number;
  children: React.ReactNode;
  testID?: string;
  style?: any;
}

const ModalWrapper: React.FC<ModalWrapperProps> = ({
  visible,
  onDismiss,
  theme,
  maxHeightPercent = 0.9,
  children,
  testID,
  style,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.container,
          {
            backgroundColor: theme.surface,
            marginTop: insets.top + 20,
            marginBottom: insets.bottom + 20,
            maxHeight: `${Math.floor(maxHeightPercent * 100)}%`,
          },
          style,
        ]}
        testID={testID}
      >
        <View style={styles.inner}>{children}</View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  inner: {
    flexShrink: 1,
  },
});

export default ModalWrapper;
