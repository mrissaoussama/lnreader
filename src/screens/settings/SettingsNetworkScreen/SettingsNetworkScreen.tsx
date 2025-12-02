import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Appbar, List, SafeAreaView, IconButtonV2 } from '@components';
import { useTheme, useNetworkSettings, usePlugins } from '@hooks/persisted';
import { NavigationState } from '@react-navigation/native';
import { Portal, Modal, TextInput, Button } from 'react-native-paper';
import { showToast } from '@utils/showToast';
import { getString } from '@strings/translations';

interface SettingsNetworkScreenProps {
  navigation: NavigationState;
}

type SettingType =
  | 'GLOBAL_MAX_SIMULTANEOUS'
  | 'GLOBAL_MAX_PER_PLUGIN'
  | 'GLOBAL_DELAY'
  | 'GLOBAL_RANDOM_DELAY';

const SettingsNetworkScreen: React.FC<SettingsNetworkScreenProps> = ({
  navigation,
}) => {
  const theme = useTheme();
  const {
    maxConcurrentTasks,
    maxGlobalConcurrentTasks,
    taskDelay,
    randomDelayRange,
    pluginSettings,
    setNetworkSettings,
  } = useNetworkSettings();

  const { filteredInstalledPlugins } = usePlugins();

  const [visible, setVisible] = useState(false);
  const [pluginSelectorVisible, setPluginSelectorVisible] = useState(false);
  const [editingType, setEditingType] = useState<SettingType | string | null>(
    null,
  );

  // Temp state for modal
  const [tempValue, setTempValue] = useState('');
  const [tempMinValue, setTempMinValue] = useState('');
  const [tempMaxValue, setTempMaxValue] = useState('');
  const [tempPluginRandomMax, setTempPluginRandomMax] = useState('');

  const openModal = (type: SettingType | string) => {
    setEditingType(type);
    let current = '';

    switch (type) {
      case 'GLOBAL_MAX_SIMULTANEOUS':
        current = (maxGlobalConcurrentTasks ?? 3).toString();
        break;
      case 'GLOBAL_MAX_PER_PLUGIN':
        current = (maxConcurrentTasks ?? 1).toString();
        break;
      case 'GLOBAL_DELAY':
        current = (taskDelay ?? 1000).toString();
        break;
      case 'GLOBAL_RANDOM_DELAY':
        setTempMinValue((randomDelayRange?.min ?? 0).toString());
        setTempMaxValue((randomDelayRange?.max ?? 0).toString());
        break;
      default:
        // Plugin-specific settings - handled in modal
        if (type.startsWith('plugin:')) {
          current = ''; // Will handle multiple fields in modal
        }
    }

    setTempValue(current);
    setVisible(true);
  };

  const saveSettings = () => {
    const value = parseInt(tempValue, 10) || 0;

    switch (editingType) {
      case 'GLOBAL_MAX_SIMULTANEOUS':
        setNetworkSettings({ maxGlobalConcurrentTasks: value });
        showToast('Global max simultaneous set to ' + value);
        break;
      case 'GLOBAL_MAX_PER_PLUGIN':
        setNetworkSettings({ maxConcurrentTasks: value });
        showToast('Global max per plugin set to ' + value);
        break;
      case 'GLOBAL_DELAY':
        setNetworkSettings({ taskDelay: value });
        showToast('Global delay set to ' + value + ' ms');
        break;
      case 'GLOBAL_RANDOM_DELAY':
        const min = parseInt(tempMinValue, 10) || 0;
        const max = parseInt(tempMaxValue, 10) || 0;
        if (min > max) {
          showToast('Min value cannot be greater than max value');
          return;
        }
        setNetworkSettings({ randomDelayRange: { min, max } });
        showToast(`Random delay range set to ${min}-${max} ms`);
        break;
      default:
        // Plugin-specific settings
        if (editingType?.toString().startsWith('plugin:')) {
          const pluginId = editingType.toString().split(':')[1];
          const newPluginSettings = { ...pluginSettings };

          const maxTasks = tempValue.trim()
            ? parseInt(tempValue, 10)
            : undefined;
          const delay = tempMinValue.trim()
            ? parseInt(tempMinValue, 10)
            : undefined;
          const randMin = tempMaxValue.trim()
            ? parseInt(tempMaxValue, 10)
            : undefined;
          const randMax = tempPluginRandomMax.trim()
            ? parseInt(tempPluginRandomMax, 10)
            : undefined;

          newPluginSettings[pluginId] = {
            maxConcurrentTasks: maxTasks,
            taskDelay: delay,
            randomDelayRange:
              randMin !== undefined || randMax !== undefined
                ? { min: randMin ?? 0, max: randMax ?? 0 }
                : undefined,
          };
          setNetworkSettings({ pluginSettings: newPluginSettings });
          showToast('Plugin settings saved');
        }
    }
    setVisible(false);
  };

  const resetPluginSettings = (pluginId: string) => {
    const newSettings = { ...pluginSettings };
    delete newSettings[pluginId];
    setNetworkSettings({ pluginSettings: newSettings });
  };

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title="Network Settings"
        // @ts-ignore
        handleGoBack={navigation.goBack}
        theme={theme}
      />
      <ScrollView contentContainerStyle={styles.paddingBottom}>
        <List.Section>
          <List.SubHeader theme={theme}>Global Settings</List.SubHeader>
          <List.InfoItem
            title="These settings apply to all operations (download, update, import)"
            theme={theme}
          />
          <List.Item
            title="Max simultaneous operations"
            description={`${maxGlobalConcurrentTasks ?? 3}`}
            onPress={() => openModal('GLOBAL_MAX_SIMULTANEOUS')}
            theme={theme}
          />
          <List.Item
            title="Max operations per plugin"
            description={`${maxConcurrentTasks ?? 1}`}
            onPress={() => openModal('GLOBAL_MAX_PER_PLUGIN')}
            theme={theme}
          />
          <List.Item
            title="Delay between operations (ms)"
            description={`${taskDelay ?? 1000} ms`}
            onPress={() => openModal('GLOBAL_DELAY')}
            theme={theme}
          />
          <List.Item
            title="Random delay range (ms)"
            description={`${randomDelayRange?.min ?? 0} - ${
              randomDelayRange?.max ?? 0
            } ms`}
            onPress={() => openModal('GLOBAL_RANDOM_DELAY')}
            theme={theme}
          />

          <List.Divider theme={theme} />
          <List.SubHeader theme={theme}>
            Plugin-Specific Overrides
          </List.SubHeader>
          <List.InfoItem
            title="Configure custom settings for each plugin. Click on a plugin to override global settings."
            theme={theme}
          />
          {filteredInstalledPlugins.map(plugin => {
            const settings = pluginSettings[plugin.id];
            const hasOverride = !!settings;

            return (
              <View
                key={plugin.id}
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <View style={{ flex: 1 }}>
                  <List.Item
                    title={plugin.name}
                    description={
                      hasOverride
                        ? `Max: ${
                            settings.maxConcurrentTasks ?? 'Default'
                          }, Delay: ${
                            settings.taskDelay ?? 'Default'
                          }ms, Random: ${settings.randomDelayRange?.min ?? 0}-${
                            settings.randomDelayRange?.max ?? 0
                          }ms`
                        : 'Using global settings'
                    }
                    onPress={() => {
                      setEditingType(`plugin:${plugin.id}`);
                      const current = settings || {};
                      setTempValue(
                        (current.maxConcurrentTasks ?? '').toString(),
                      );
                      setTempMinValue((current.taskDelay ?? '').toString());
                      setTempMaxValue(
                        (current.randomDelayRange?.min ?? '').toString(),
                      );
                      setTempPluginRandomMax(
                        (current.randomDelayRange?.max ?? '').toString(),
                      );
                      setVisible(true);
                    }}
                    theme={theme}
                  />
                </View>
                {hasOverride && (
                  <IconButtonV2
                    name="refresh"
                    onPress={() => resetPluginSettings(plugin.id)}
                    theme={theme}
                  />
                )}
              </View>
            );
          })}
        </List.Section>
      </ScrollView>

      <Portal>
        <Modal
          visible={visible}
          onDismiss={() => setVisible(false)}
          contentContainerStyle={[
            styles.modal,
            { backgroundColor: theme.surface },
          ]}
        >
          <Text
            style={{
              color: theme.onSurface,
              marginBottom: 16,
              fontSize: 18,
              fontWeight: '600',
            }}
          >
            {editingType === 'GLOBAL_MAX_SIMULTANEOUS'
              ? 'Max Simultaneous Operations'
              : editingType === 'GLOBAL_MAX_PER_PLUGIN'
              ? 'Max Operations Per Plugin'
              : editingType === 'GLOBAL_DELAY'
              ? 'Delay Between Operations'
              : editingType === 'GLOBAL_RANDOM_DELAY'
              ? 'Random Delay Range'
              : 'Edit Settings'}
          </Text>
          {editingType === 'GLOBAL_RANDOM_DELAY' ? (
            <>
              <TextInput
                label="Min Delay (ms)"
                value={tempMinValue}
                onChangeText={setTempMinValue}
                keyboardType="numeric"
                style={styles.input}
              />
              <TextInput
                label="Max Delay (ms)"
                value={tempMaxValue}
                onChangeText={setTempMaxValue}
                keyboardType="numeric"
                style={styles.input}
              />
              <Text
                style={{
                  color: theme.onSurfaceVariant,
                  fontSize: 12,
                  marginBottom: 8,
                }}
              >
                A random delay between min and max will be added to prevent rate
                limiting
              </Text>
            </>
          ) : editingType?.toString().startsWith('plugin:') ? (
            <>
              <TextInput
                label="Max Concurrent Tasks (leave empty for default)"
                value={tempValue}
                onChangeText={setTempValue}
                keyboardType="numeric"
                placeholder={`Default: ${maxConcurrentTasks ?? 1}`}
                style={styles.input}
              />
              <TextInput
                label="Delay Between Tasks (ms, leave empty for default)"
                value={tempMinValue}
                onChangeText={setTempMinValue}
                keyboardType="numeric"
                placeholder={`Default: ${taskDelay ?? 1000}`}
                style={styles.input}
              />
              <TextInput
                label="Random Delay Min (ms, leave empty for default)"
                value={tempMaxValue}
                onChangeText={setTempMaxValue}
                keyboardType="numeric"
                placeholder={`Default: ${randomDelayRange?.min ?? 0}`}
                style={styles.input}
              />
              <TextInput
                label="Random Delay Max (ms, leave empty for default)"
                value={tempPluginRandomMax}
                onChangeText={setTempPluginRandomMax}
                keyboardType="numeric"
                placeholder={`Default: ${randomDelayRange?.max ?? 0}`}
                style={styles.input}
              />
              <Text
                style={{
                  color: theme.onSurfaceVariant,
                  fontSize: 12,
                  marginBottom: 8,
                }}
              >
                Leave fields empty to use global settings
              </Text>
            </>
          ) : (
            <>
              <TextInput
                label={
                  editingType?.toString().includes('MAX_SIMULTANEOUS')
                    ? 'Max Simultaneous'
                    : editingType?.toString().includes('MAX_PER_PLUGIN')
                    ? 'Max Per Plugin'
                    : 'Delay (ms)'
                }
                value={tempValue}
                onChangeText={setTempValue}
                keyboardType="numeric"
                style={styles.input}
              />
              <Text
                style={{
                  color: theme.onSurfaceVariant,
                  fontSize: 12,
                  marginBottom: 8,
                }}
              >
                {editingType === 'GLOBAL_MAX_SIMULTANEOUS'
                  ? 'Maximum operations running at the same time across all plugins'
                  : editingType === 'GLOBAL_MAX_PER_PLUGIN'
                  ? 'Maximum operations per plugin (0 = no limit)'
                  : editingType === 'GLOBAL_DELAY'
                  ? 'Delay in milliseconds between operations for the same plugin'
                  : ''}
              </Text>
            </>
          )}
          <Button
            mode="contained"
            onPress={saveSettings}
            style={{ marginTop: 16 }}
          >
            {getString('common.save') || 'Save'}
          </Button>
        </Modal>

        <Modal
          visible={pluginSelectorVisible}
          onDismiss={() => setPluginSelectorVisible(false)}
          contentContainerStyle={[
            styles.modal,
            { backgroundColor: theme.surface, maxHeight: '80%' },
          ]}
        >
          <Text
            style={{
              color: theme.onSurface,
              marginBottom: 16,
              fontSize: 18,
              fontWeight: '600',
            }}
          >
            Select Plugin to Configure
          </Text>
          <ScrollView style={{ maxHeight: 400 }}>
            {filteredInstalledPlugins.map(plugin => (
              <List.Item
                key={plugin.id}
                title={plugin.name}
                description={plugin.lang}
                onPress={() => {
                  setEditingType(`plugin:${plugin.id}`);
                  setPluginSelectorVisible(false);
                  setTempValue('');
                  setVisible(true);
                }}
                theme={theme}
              />
            ))}
          </ScrollView>
          <Button
            mode="outlined"
            onPress={() => setPluginSelectorVisible(false)}
            style={{ marginTop: 16 }}
          >
            Cancel
          </Button>
        </Modal>
      </Portal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  paddingBottom: { paddingBottom: 32 },
  modal: { padding: 20, margin: 20, borderRadius: 8 },
  input: { marginBottom: 12 },
});

export default SettingsNetworkScreen;
