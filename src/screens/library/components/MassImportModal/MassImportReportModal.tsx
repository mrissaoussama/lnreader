import React from 'react';
import { Text, View, ScrollView, StyleSheet } from 'react-native';
import { Portal, Dialog, Button, Divider } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';

import { showToast } from '@utils/showToast';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import {
  ImportResult,
  copyErroredWithErrors,
  copyErroredLinksOnly,
} from '@services/updates/massImport';
import { useTheme } from '@hooks/persisted';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export const MassImportReportModal: React.FC<Props> = ({
  visible,
  onDismiss,
}) => {
  const theme = useTheme();
  const styles = createStyles();
  const result = getMMKVObject<ImportResult>('LAST_MASS_IMPORT_RESULT');

  if (
    !result ||
    (!result.added.length && !result.skipped.length && !result.errored.length)
  ) {
    return (
      <Portal>
        <Dialog
          visible={visible}
          onDismiss={onDismiss}
          style={{ backgroundColor: theme.surface }}
        >
          <Dialog.Title style={{ color: theme.onSurface }}>
            No Report Available
          </Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: theme.onSurface }}>
              No import report available
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={onDismiss}
              theme={{ colors: { primary: theme.primary } }}
              labelStyle={{ color: theme.onSurface }}
            >
              OK
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    );
  }

  const copyAllLinks = () => {
    const allLinks = [
      ...result.added.map(item => item.url),
      ...result.skipped.map(item => item.url),
      ...result.errored.map(item => item.url),
    ].join('\n');
    Clipboard.setStringAsync(allLinks);
    showToast('Copied to clipboard');
  };

  const copyAdded = () => {
    if (result.added.length === 0) {
      showToast('Nothing to copy');
      return;
    }
    Clipboard.setStringAsync(result.added.map(item => item.url).join('\n'));
    showToast('Copied to clipboard');
  };

  const copySkipped = () => {
    if (result.skipped.length === 0) {
      showToast('Nothing to copy');
      return;
    }
    Clipboard.setStringAsync(result.skipped.map(item => item.url).join('\n'));
    showToast('Copied to clipboard');
    showToast('Copied to clipboard');
  };

  const copyErrored = () => {
    if (result.errored.length === 0) {
      showToast('Nothing to copy');
      return;
    }
    const erroredText = result.errored
      .map(item => `${item.url}\n${item.error}`)
      .join('\n\n');
    Clipboard.setStringAsync(erroredText);
    showToast('Copied to clipboard');
  };

  const copyFullReport = () => {
    const fullReport = [
      `=== Added Novels (${result.added.length}) ===`,
      ...result.added.map(item => `${item.name} - ${item.url}`),
      '',
      `=== Skipped Novels (${result.skipped.length}) ===`,
      ...result.skipped.map(item => `${item.name} - ${item.url}`),
      '',
      `=== Errored Novels (${result.errored.length}) ===`,
      ...result.errored.map(
        item => `${item.name} - ${item.url} - ${item.error}`,
      ),
    ].join('\n');
    Clipboard.setStringAsync(fullReport);
    showToast('Copied to clipboard');
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={{ backgroundColor: theme.surface }}
      >
        <Dialog.Title style={{ color: theme.onSurface }}>
          Import Report
        </Dialog.Title>
        <Dialog.Content>
          <ScrollView>
            <Text style={[styles.summaryText, { color: theme.onSurface }]}>
              Added: {result.added.length} | Skipped: {result.skipped.length} |{' '}
              Errored: {result.errored.length}
            </Text>

            <Text style={[styles.sectionHeader, { color: theme.onSurface }]}>
              Copy Actions
            </Text>

            <Button
              mode="outlined"
              onPress={copyAllLinks}
              style={styles.button}
              disabled={
                result.added.length === 0 &&
                result.skipped.length === 0 &&
                result.errored.length === 0
              }
              theme={{ colors: { primary: theme.primary } }}
              labelStyle={{ color: theme.onSurface }}
            >
              Copy All Links
            </Button>

            <Button
              mode="outlined"
              onPress={copyAdded}
              style={styles.button}
              disabled={result.added.length === 0}
              theme={{ colors: { primary: theme.primary } }}
              labelStyle={{ color: theme.onSurface }}
            >
              Copy Added ({result.added.length})
            </Button>

            <Button
              mode="outlined"
              onPress={copySkipped}
              style={styles.button}
              disabled={result.skipped.length === 0}
              theme={{ colors: { primary: theme.primary } }}
              labelStyle={{ color: theme.onSurface }}
            >
              Copy Skipped ({result.skipped.length})
            </Button>

            <Button
              mode="outlined"
              onPress={copyErrored}
              style={styles.button}
              disabled={result.errored.length === 0}
              theme={{ colors: { primary: theme.primary } }}
              labelStyle={{ color: theme.onSurface }}
            >
              Copy Errored ({result.errored.length})
            </Button>

            <Button
              mode="outlined"
              onPress={() => copyErroredWithErrors(result.errored)}
              style={styles.button}
              disabled={result.errored.length === 0}
              theme={{ colors: { primary: theme.primary } }}
              labelStyle={{ color: theme.onSurface }}
            >
              Copy Errored (with errors)
            </Button>

            <Button
              mode="outlined"
              onPress={() => copyErroredLinksOnly(result.errored)}
              style={styles.button}
              disabled={result.errored.length === 0}
              theme={{ colors: { primary: theme.primary } }}
              labelStyle={{ color: theme.onSurface }}
            >
              Copy Errored (links only)
            </Button>

            <Button
              mode="outlined"
              onPress={copyFullReport}
              style={styles.lastButton}
              theme={{ colors: { primary: theme.primary } }}
              labelStyle={{ color: theme.onSurface }}
            >
              Copy Full Report
            </Button>

            <Divider style={styles.divider} />

            {/* Detailed Lists */}
            {result.added.length > 0 && (
              <View style={styles.listContainer}>
                <Text style={[styles.listHeader, { color: theme.onSurface }]}>
                  Added Novels ({result.added.length})
                </Text>
                <ScrollView style={styles.scrollView} nestedScrollEnabled>
                  {result.added.slice(0, 10).map((item, index) => (
                    <View key={`added-${index}`} style={styles.listItem}>
                      <Text
                        style={[styles.itemTitle, { color: theme.onSurface }]}
                        onPress={() => {
                          Clipboard.setStringAsync(item.url);
                          showToast('Copied to clipboard');
                        }}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={[styles.itemUrl, { color: theme.onSurface }]}
                      >
                        {item.url}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
                {result.added.length > 10 && (
                  <Text style={[styles.moreText, { color: theme.onSurface }]}>
                    And {result.added.length - 10} more...
                  </Text>
                )}
              </View>
            )}

            {result.skipped.length > 0 && (
              <View style={styles.listContainer}>
                <Text style={[styles.listHeader, { color: theme.onSurface }]}>
                  Skipped Novels ({result.skipped.length})
                </Text>
                <ScrollView style={styles.scrollView} nestedScrollEnabled>
                  {result.skipped.slice(0, 10).map((item, index) => (
                    <View key={`skipped-${index}`} style={styles.listItem}>
                      <Text
                        style={[styles.itemTitle, { color: theme.onSurface }]}
                        onPress={() => {
                          Clipboard.setStringAsync(item.url);
                          showToast('Copied to clipboard');
                        }}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={[styles.itemUrl, { color: theme.onSurface }]}
                      >
                        {item.url}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
                {result.skipped.length > 10 && (
                  <Text style={[styles.moreText, { color: theme.onSurface }]}>
                    And {result.skipped.length - 10} more...
                  </Text>
                )}
              </View>
            )}

            {result.errored.length > 0 && (
              <View style={styles.listContainer}>
                <Text style={[styles.listHeader, { color: theme.onSurface }]}>
                  Errored ({result.errored.length})
                </Text>
                <ScrollView style={styles.scrollView} nestedScrollEnabled>
                  {result.errored.slice(0, 10).map((item, index) => (
                    <View key={`errored-${index}`} style={styles.listItem}>
                      <Text
                        style={[styles.itemTitle, { color: theme.onSurface }]}
                        onPress={() => {
                          Clipboard.setStringAsync(
                            `${item.url}\n${item.error}`,
                          );
                          showToast('Copied to clipboard');
                        }}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={[styles.itemUrl, { color: theme.onSurface }]}
                      >
                        {item.url}
                      </Text>
                      <Text
                        style={[styles.itemUrl, { color: theme.onSurface }]}
                      >
                        {item.error}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
                {result.errored.length > 10 && (
                  <Text style={[styles.moreText, { color: theme.onSurface }]}>
                    And {result.errored.length - 10} more...
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            onPress={onDismiss}
            theme={{ colors: { primary: theme.primary } }}
            labelStyle={{ color: theme.onSurface }}
          >
            Close
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const createStyles = () =>
  StyleSheet.create({
    summaryText: {
      marginBottom: 16,
    },
    sectionHeader: {
      fontSize: 16,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    button: {
      marginBottom: 8,
    },
    lastButton: {
      marginBottom: 16,
    },
    divider: {
      marginVertical: 16,
    },
    listContainer: {
      marginBottom: 16,
    },
    listHeader: {
      fontSize: 14,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    scrollView: {
      maxHeight: 120,
    },
    listItem: {
      padding: 4,
      marginBottom: 2,
    },
    itemTitle: {
      fontSize: 12,
      fontWeight: 'bold',
    },
    itemUrl: {
      fontSize: 10,
    },
    moreText: {
      fontSize: 12,
      fontStyle: 'italic',
      marginTop: 4,
    },
  });
