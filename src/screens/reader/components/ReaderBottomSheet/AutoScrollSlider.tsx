import { StyleSheet, Text, View } from 'react-native';
import React from 'react';

import { useChapterGeneralSettings, useTheme } from '@hooks/persisted';
import Slider from '@react-native-community/slider';
import { getString } from '@strings/translations';

const TRACK_TINT_COLOR = '#000000';

const AutoScrollSlider: React.FC = () => {
  const theme = useTheme();

  const { autoScrollInterval, setChapterGeneralSettings } =
    useChapterGeneralSettings();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
        {getString('readerSettings.autoScrollInterval')}
      </Text>
      <Slider
        style={styles.slider}
        value={autoScrollInterval}
        minimumValue={5}
        maximumValue={50}
        step={1}
        minimumTrackTintColor={theme.primary}
        maximumTrackTintColor={TRACK_TINT_COLOR}
        thumbTintColor={theme.primary}
        onSlidingComplete={value =>
          setChapterGeneralSettings({ autoScrollInterval: value })
        }
      />
    </View>
  );
};

export default AutoScrollSlider;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  label: {
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  slider: {
    flex: 1,
    height: 40,
  },
});
