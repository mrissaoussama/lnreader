import { StyleSheet, Text, View } from 'react-native';
import React from 'react';

import { useChapterGeneralSettings, useTheme } from '@hooks/persisted';
import { ToggleButton } from '@components/Common/ToggleButton';
import { getString } from '@strings/translations';

const ProgressBarPositionSelector: React.FC = () => {
  const theme = useTheme();
  const { progressBarPosition, setChapterGeneralSettings } =
    useChapterGeneralSettings();

  const positions = [
    { value: 'left', icon: 'dock-left' },
    { value: 'top', icon: 'dock-top' },
    { value: 'bottom', icon: 'dock-bottom' },
    { value: 'right', icon: 'dock-right' },
  ];

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
        {getString('readerSettings.progressBarPosition')}
      </Text>
      <View style={styles.buttonContainer}>
        {positions.map(item => (
          <ToggleButton
            key={item.value}
            selected={item.value === progressBarPosition}
            icon={item.icon}
            theme={theme}
            onPress={() =>
              setChapterGeneralSettings({
                progressBarPosition: item.value as any,
              })
            }
          />
        ))}
      </View>
    </View>
  );
};

export default ProgressBarPositionSelector;

const styles = StyleSheet.create({
  buttonContainer: {
    flexDirection: 'row',
  },
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 6,
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 16,
  },
});
