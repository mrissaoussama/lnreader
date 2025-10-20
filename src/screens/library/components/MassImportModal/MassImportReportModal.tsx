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

  // Better null checking to prevent "Cannot convert null value to object" error
  if (!result) {
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

  // Additional safety checks for result properties
  const added = Array.isArray(result.added) ? result.added : [];
  const skipped = Array.isArray(result.skipped) ? result.skipped : [];
  const errored = Array.isArray(result.errored) ? result.errored : [];

  if (added.length === 0 && skipped.length === 0 && errored.length === 0) {
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
              No import results to display
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
      ...added.map(item => item?.url).filter(Boolean),
      ...skipped.map(item => item?.url).filter(Boolean),
      ...errored.map(item => item?.url).filter(Boolean),
    ].join('\n');
    Clipboard.setStringAsync(allLinks);
    showToast('Copied to clipboard');
  };

  const copyAdded = () => {
    if (added.length === 0) {
      showToast('Nothing to copy');
      return;
    }
    Clipboard.setStringAsync(
      added
        .map(item => item?.url)
        .filter(Boolean)
        .join('\n'),
    );
    showToast('Copied to clipboard');
  };

  const copySkipped = () => {
    if (skipped.length === 0) {
      showToast('Nothing to copy');
      return;
    }
    Clipboard.setStringAsync(
      skipped
        .map(item => item?.url)
        .filter(Boolean)
        .join('\n'),
    );
    showToast('Copied to clipboard');
  };

  const copyErrored = () => {
    if (errored.length === 0) {
      showToast('Nothing to copy');
      return;
    }
    const erroredText = errored
      .filter(item => item?.url)
      .map(item => `${item.url}\n${item.error || 'Unknown error'}`)
      .join('\n\n');
    Clipboard.setStringAsync(erroredText);
    showToast('Copied to clipboard');
  };

  const copyFullReport = () => {
    const fullReport = [
      `=== Added Novels (${added.length}) ===`,
      ...added
        .filter(item => item?.name && item?.url)
        .map(item => `${item.name} - ${item.url}`),
      '',
      `=== Skipped Novels (${skipped.length}) ===`,
      ...skipped
        .filter(item => item?.name && item?.url)
        .map(item => `${item.name} - ${item.url}`),
      '',
      `=== Errored Novels (${errored.length}) ===`,
      ...errored
        .filter(item => item?.name && item?.url)
        .map(
          item =>
            `${item.name} - ${item.url} - ${item.error || 'Unknown error'}`,
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
              Added: {added.length} | Skipped: {skipped.length} | Errored:{' '}
              {errored.length}
            </Text>

            <Text style={[styles.sectionHeader, { color: theme.onSurface }]}>
              Copy Actions
            </Text>

            <View style={styles.buttonRow}>
              <Button
                mode="outlined"
                onPress={copyAllLinks}
                style={styles.button}
                disabled={
                  added.length === 0 &&
                  skipped.length === 0 &&
                  errored.length === 0
                }
                theme={{ colors: { primary: theme.primary } }}
                labelStyle={{ color: theme.onSurface }}
                icon="content-copy"
              >
                Copy All Links
              </Button>
              <Button
                mode="outlined"
                onPress={copyAdded}
                style={styles.button}
                disabled={added.length === 0}
                theme={{ colors: { primary: theme.primary } }}
                labelStyle={{ color: theme.onSurface }}
                icon="content-copy"
              >
                Copy Added ({added.length})
              </Button>
            </View>

            <View style={styles.buttonRow}>
              <Button
                mode="outlined"
                onPress={copySkipped}
                style={styles.button}
                disabled={skipped.length === 0}
                theme={{ colors: { primary: theme.primary } }}
                labelStyle={{ color: theme.onSurface }}
                icon="content-copy"
              >
                Copy Skipped ({skipped.length})
              </Button>
              <Button
                mode="outlined"
                onPress={copyErrored}
                style={styles.button}
                disabled={errored.length === 0}
                theme={{ colors: { primary: theme.primary } }}
                labelStyle={{ color: theme.onSurface }}
                icon="alert-circle"
              >
                Copy Errored ({errored.length})
              </Button>
            </View>

            <View style={styles.buttonRow}>
              <Button
                mode="outlined"
                onPress={() => copyErroredWithErrors(errored)}
                style={styles.button}
                disabled={errored.length === 0}
                theme={{ colors: { primary: theme.primary } }}
                labelStyle={{ color: theme.onSurface }}
                icon="alert-circle"
              >
                Copy Errored (with errors)
              </Button>
              <Button
                mode="outlined"
                onPress={() => copyErroredLinksOnly(errored)}
                style={styles.button}
                disabled={errored.length === 0}
                theme={{ colors: { primary: theme.primary } }}
                labelStyle={{ color: theme.onSurface }}
                icon="link"
              >
                Copy Errored (links only)
              </Button>
            </View>

            <Button
              mode="outlined"
              onPress={copyFullReport}
              style={styles.lastButton}
              theme={{ colors: { primary: theme.primary } }}
              labelStyle={{ color: theme.onSurface }}
              icon="file-document"
            >
              Copy Full Report
            </Button>

            <Divider style={styles.divider} />

            {/* Detailed Lists */}
            {added.length > 0 && (
              <View style={styles.listContainer}>
                <Text style={[styles.listHeader, { color: theme.onSurface }]}>
                  Added Novels ({added.length})
                </Text>
                <ScrollView style={styles.scrollView} nestedScrollEnabled>
                  {added.slice(0, 10).map((item, index) =>
                    item && item.name && item.url ? (
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
                    ) : null,
                  )}
                </ScrollView>
                {added.length > 10 && (
                  <Text style={[styles.moreText, { color: theme.onSurface }]}>
                    And {added.length - 10} more...
                  </Text>
                )}
              </View>
            )}

            {skipped.length > 0 && (
              <View style={styles.listContainer}>
                <Text style={[styles.listHeader, { color: theme.onSurface }]}>
                  Skipped Novels ({skipped.length})
                </Text>
                <ScrollView style={styles.scrollView} nestedScrollEnabled>
                  {skipped.slice(0, 10).map((item, index) =>
                    item && item.name && item.url ? (
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
                    ) : null,
                  )}
                </ScrollView>
                {skipped.length > 10 && (
                  <Text style={[styles.moreText, { color: theme.onSurface }]}>
                    And {skipped.length - 10} more...
                  </Text>
                )}
              </View>
            )}

            {errored.length > 0 && (
              <View style={styles.listContainer}>
                <Text style={[styles.listHeader, { color: theme.onSurface }]}>
                  Errored ({errored.length})
                </Text>
                <ScrollView style={styles.scrollView} nestedScrollEnabled>
                  {errored.slice(0, 10).map((item, index) =>
                    item && item.name && item.url ? (
                      <View key={`errored-${index}`} style={styles.listItem}>
                        <Text
                          style={[styles.itemTitle, { color: theme.onSurface }]}
                          onPress={() => {
                            Clipboard.setStringAsync(
                              `${item.url}\n${item.error || 'Unknown error'}`,
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
                          {item.error || 'Unknown error'}
                        </Text>
                      </View>
                    ) : null,
                  )}
                </ScrollView>
                {errored.length > 10 && (
                  <Text style={[styles.moreText, { color: theme.onSurface }]}>
                    And {errored.length - 10} more...
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        </Dialog.Content>
        <View style={styles.actions}>
          <Button
            onPress={onDismiss}
            theme={{ colors: { primary: theme.primary } }}
            labelStyle={{ color: theme.onSurface }}
            icon="close"
          >
            Close
          </Button>
        </View>
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
      flex: 1,
      marginHorizontal: 4,
    },
    lastButton: {
      marginBottom: 16,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    actions: {
      padding: 16,
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
