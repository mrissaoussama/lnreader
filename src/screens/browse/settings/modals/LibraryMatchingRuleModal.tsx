import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Portal } from 'react-native-paper';
import { RadioButton, Modal } from '@components';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import { useAppSettings } from '@hooks/persisted';
import { MatchingRule } from '@utils/libraryMatching';

interface LibraryMatchingRuleModalProps {
  visible: boolean;
  onDismiss: () => void;
  theme: ThemeColors;
}

const LibraryMatchingRuleModal: React.FC<LibraryMatchingRuleModalProps> = ({
  visible,
  onDismiss,
  theme,
}) => {
  const { novelMatching, setAppSettings } = useAppSettings();

  const handlePluginRuleChange = (rule: MatchingRule) => {
    setAppSettings({
      novelMatching: {
        ...(novelMatching ?? {}),
        pluginRule: rule,
      },
    });
  };

  const handleLibraryRuleChange = (rule: MatchingRule) => {
    setAppSettings({
      novelMatching: {
        ...(novelMatching ?? {}),
        libraryRule: rule,
      },
    });
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss}>
        <Text style={[styles.modalHeader, { color: theme.onSurface }]}>
          Plugin Browse Matching Rule
        </Text>
        <RadioButton
          label={getString('browseSettingsScreen.matchingRuleExact')}
          status={novelMatching?.pluginRule === 'exact'}
          onPress={() => handlePluginRuleChange('exact')}
          theme={theme}
        />
        <RadioButton
          label={getString('browseSettingsScreen.matchingRuleContains')}
          status={novelMatching?.pluginRule === 'contains'}
          onPress={() => handlePluginRuleChange('contains')}
          theme={theme}
        />
        <RadioButton
          label={getString('browseSettingsScreen.matchingRuleNormalizedExact')}
          status={novelMatching?.pluginRule === 'normalized-exact'}
          onPress={() => handlePluginRuleChange('normalized-exact')}
          theme={theme}
        />
        <RadioButton
          label={getString(
            'browseSettingsScreen.matchingRuleNormalizedContains',
          )}
          status={novelMatching?.pluginRule === 'normalized-contains'}
          onPress={() => handlePluginRuleChange('normalized-contains')}
          theme={theme}
        />

        <Text
          style={[
            styles.modalHeader,
            styles.modalSubHeader,
            { color: theme.onSurface },
          ]}
        >
          Library Screen Matching Rule
        </Text>
        <RadioButton
          label={getString('browseSettingsScreen.matchingRuleExact')}
          status={novelMatching?.libraryRule === 'exact'}
          onPress={() => handleLibraryRuleChange('exact')}
          theme={theme}
        />
        <RadioButton
          label={getString('browseSettingsScreen.matchingRuleContains')}
          status={novelMatching?.libraryRule === 'contains'}
          onPress={() => handleLibraryRuleChange('contains')}
          theme={theme}
        />
        <RadioButton
          label={getString('browseSettingsScreen.matchingRuleNormalizedExact')}
          status={novelMatching?.libraryRule === 'normalized-exact'}
          onPress={() => handleLibraryRuleChange('normalized-exact')}
          theme={theme}
        />
        <RadioButton
          label={getString(
            'browseSettingsScreen.matchingRuleNormalizedContains',
          )}
          status={novelMatching?.libraryRule === 'normalized-contains'}
          onPress={() => handleLibraryRuleChange('normalized-contains')}
          theme={theme}
        />
      </Modal>
    </Portal>
  );
};

export default LibraryMatchingRuleModal;

const styles = StyleSheet.create({
  modalHeader: {
    fontSize: 24,
    marginBottom: 16,
  },
  modalSubHeader: {
    marginTop: 24,
  },
});
