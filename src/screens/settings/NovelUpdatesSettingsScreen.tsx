import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar, List } from 'react-native-paper';
import { useTheme } from '@hooks/persisted';
import { ThemeColors } from '@theme/types';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import SettingSwitch from './components/SettingSwitch';

interface NovelUpdatesSettingsScreenProps {
  navigation: any;
}

const NovelUpdatesSettingsScreen: React.FC<NovelUpdatesSettingsScreenProps> = ({
  navigation,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  const [markChaptersEnabled, setMarkChaptersEnabled] = useState(
    MMKVStorage.getBoolean('novelupdates_mark_chapters_enabled') ?? false,
  );

  const handleGoBack = () => navigation.goBack();

  const handleToggleMarkChapters = () => {
    const newValue = !markChaptersEnabled;
    setMarkChaptersEnabled(newValue);
    MMKVStorage.set('novelupdates_mark_chapters_enabled', newValue);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Appbar.Header
        style={{ backgroundColor: theme.primary }}
        statusBarHeight={0}
      >
        <Appbar.BackAction iconColor={theme.onPrimary} onPress={handleGoBack} />
        <Appbar.Content
          title="Novel Updates Settings"
          titleStyle={{ color: theme.onPrimary }}
        />
      </Appbar.Header>

      <View style={styles.content}>
        <List.Section>
          <List.Subheader style={{ color: theme.onSurface }}>
            Novel Updates Settings
          </List.Subheader>

          <SettingSwitch
            value={markChaptersEnabled}
            label="Mark Chapters as Read"
            description="Automatically mark chapters on Novel Updates when updating progress. Enabling this may slow down syncing. Marking may or may not work depending on the novel."
            onPress={handleToggleMarkChapters}
            theme={theme}
          />
        </List.Section>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      flex: 1,
    },
    listItem: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    disabledItem: {
      opacity: 0.6,
    },
  });

export default NovelUpdatesSettingsScreen;
