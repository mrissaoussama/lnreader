import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import {
  Appbar,
  Button,
  Card,
  Chip,
  Switch,
  TextInput,
  Checkbox,
  Portal,
  Dialog,
} from 'react-native-paper';
import { ThemeColors } from '@theme/types';
import { useTheme, useTracker, useAppSettings } from '@hooks/persisted';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { trackers, TRACKER_SOURCES } from '@services/Trackers';
import { TrackSource } from '@database/types/Track';
import { showToast } from '@utils/showToast';
import { deleteTracksBySource } from '@database/queries/TrackQueries';
import { getString } from '@strings/translations';
import MangaUpdatesLoginDialog from './components/MangaUpdatesLoginDialog';
import { TrackerLogo } from '@services/Trackers/common/TrackerLogo';

const TrackerSettingsScreen = ({ navigation }: any) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { setTracker, removeTracker, isLoggedIn, getLoggedInTrackers } =
    useTracker();
  const { autoSyncTracker, autoSyncChapterThreshold, setAppSettings } =
    useAppSettings();

  const loggedInTrackers = getLoggedInTrackers();
  const [customThreshold, setCustomThreshold] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [selectedTrackerToLogout, setSelectedTrackerToLogout] =
    useState<TrackSource | null>(null);
  const [deleteLinkedNovels, setDeleteLinkedNovels] = useState(true);
  const [mangaUpdatesLoginVisible, setMangaUpdatesLoginVisible] =
    useState(false);
  const [nuAltTitles, setNuAltTitles] = useState(
    MMKVStorage.getBoolean('novelupdates_fetch_alternative_titles') ?? false,
  );
  const [nuNotesTracking, setNuNotesTracking] = useState(
    MMKVStorage.getBoolean('novelupdates_use_notes_tracking') ?? true,
  );
  const [muAltTitles, setMuAltTitles] = useState(
    MMKVStorage.getBoolean('mangaupdates_fetch_alternative_titles') ?? false,
  );
  const [nlAltTitles, setNlAltTitles] = useState(
    MMKVStorage.getBoolean('novellist_fetch_alternative_titles') ?? false,
  );
  const [nlPreserveNotes, setNlPreserveNotes] = useState(
    MMKVStorage.getBoolean('novellist_preserve_user_notes') ?? true,
  );
  const [nuMarkChapters, setNuMarkChapters] = useState(
    MMKVStorage.getBoolean('novelupdates_mark_chapters_enabled') ?? false,
  );

  const handleAutoSyncToggle = (value: boolean) => {
    setAppSettings({ autoSyncTracker: value });
  };

  const handleThresholdChange = (value: number) => {
    setAppSettings({ autoSyncChapterThreshold: value });
    setShowCustomInput(false);
  };

  const handleCustomThresholdSubmit = () => {
    const value = parseInt(customThreshold, 10);
    if (!isNaN(value) && value > 0) {
      setAppSettings({ autoSyncChapterThreshold: value });
      setCustomThreshold('');
      setShowCustomInput(false);
      showToast(`Custom threshold set to ${value} chapters`);
    } else {
      showToast('Please enter a valid number greater than 0');
    }
  };

  const handleMangaUpdatesLogin = async (
    username: string,
    password: string,
  ) => {
    try {
      const tracker = trackers[TRACKER_SOURCES.MANGAUPDATES];
      if (!tracker) {
        throw new Error('MangaUpdates tracker not available');
      }

      showToast('Logging in to MangaUpdates...');
      const authResult = await tracker.authenticate(username, password);
      setTracker(TRACKER_SOURCES.MANGAUPDATES, authResult);
      showToast('Successfully logged in to MangaUpdates');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      throw new Error(message);
    }
  };

  const handleLogin = async (source: TrackSource) => {
    try {
      const tracker = trackers[source];
      if (!tracker) {
        showToast(`${source} tracker not available`);
        return;
      }

      if (
        source === TRACKER_SOURCES.NOVEL_UPDATES ||
        source === TRACKER_SOURCES.NOVELLIST
      ) {
        showToast(`Opening ${source} login page...`);

        const loginUrl =
          source === TRACKER_SOURCES.NOVEL_UPDATES
            ? 'https://www.novelupdates.com/login/'
            : 'https://novellist.co/login';

        navigation.navigate('WebviewScreen', {
          name: `${source} Login`,
          url: loginUrl,
          pluginId: 'manual_auth',
          isNovel: false,
        });

        const authResult = await tracker.authenticate();
        setTracker(source, authResult);
        showToast(
          'Please complete login in the webview. You can close it when done.',
        );
        return;
      }

      if (source === TRACKER_SOURCES.MANGAUPDATES) {
        setMangaUpdatesLoginVisible(true);
        return;
      }

      showToast(`Opening ${source} authentication...`);
      const authResult = await tracker.authenticate();

      setTracker(source, authResult);
      showToast(`Successfully logged in to ${source}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Authentication failed';
      showToast(message);
    }
  };

  const handleRefreshAuth = async (source: TrackSource) => {
    try {
      const tracker = trackers[source];
      if (!tracker) {
        showToast(`${source} tracker not available`);
        return;
      }

      showToast(`Refreshing ${source} authentication...`);
      const authResult = await tracker.authenticate();
      setTracker(source, authResult);

      if (
        (authResult as any)?.meta?.message?.includes(
          'Successfully authenticated',
        )
      ) {
        showToast(`Successfully refreshed ${source} authentication`);
      } else {
        showToast('Please login through the webview first');
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Authentication refresh failed';
      showToast(message);
    }
  };

  const handleLogout = (item: TrackSource) => {
    setSelectedTrackerToLogout(item);
    setDeleteLinkedNovels(false);
    setLogoutDialogVisible(true);
  };

  const confirmLogout = async () => {
    if (!selectedTrackerToLogout) return;

    try {
      if (deleteLinkedNovels) {
        await deleteTracksBySource(selectedTrackerToLogout);
      }
      removeTracker(selectedTrackerToLogout);

      const message = deleteLinkedNovels
        ? `Logged out from ${selectedTrackerToLogout} and removed all linked novels`
        : `Logged out from ${selectedTrackerToLogout}`;
      showToast(message);
    } catch (error) {
      showToast(`Failed to logout from ${selectedTrackerToLogout}`);
    } finally {
      setLogoutDialogVisible(false);
      setSelectedTrackerToLogout(null);
    }
  };

  const cancelLogout = () => {
    setLogoutDialogVisible(false);
    setSelectedTrackerToLogout(null);
  };

  const getInstructions = (source: TrackSource) => {
    switch (source) {
      case TRACKER_SOURCES.ANILIST:
        return 'Login with your AniList account to sync your reading progress';
      case TRACKER_SOURCES.MYANIMELIST:
        return 'Login with your MyAnimeList account to sync your reading progress';
      case TRACKER_SOURCES.NOVEL_UPDATES:
        return 'Login through webview. Complete login (check Remember me) in browser, then close the webview.';
      case TRACKER_SOURCES.MANGAUPDATES:
        return 'Enter your MangaUpdates username and password to login.';
      case TRACKER_SOURCES.NOVELLIST:
        return 'Login through webview. Complete login (only OpenNovel) in browser, then close the webview and click refresh auth.';
      default:
        return 'Sync your reading progress with this tracker';
    }
  };

  const renderItem = ({ item }: { item: TrackSource }) => {
    const trackerImpl = trackers[item];
    const loggedIn = isLoggedIn(item);

    return (
      <Card style={styles.trackerCard}>
        <Card.Content>
          <View style={styles.trackerHeader}>
            <View style={styles.trackerTitleRow}>
              <TrackerLogo source={item} size={26} />
              <Text style={[styles.trackerTitle, { color: theme.onSurface }]}>
                {trackerImpl.name}
              </Text>
            </View>
            {loggedIn && (
              <Chip
                icon="check-circle"
                textStyle={{ color: theme.onPrimary }}
                style={{ backgroundColor: theme.primary }}
              >
                Connected
              </Chip>
            )}
          </View>

          <Text
            style={[styles.instructions, { color: theme.onSurfaceVariant }]}
          >
            {getInstructions(item)}
          </Text>

          {loggedIn ? (
            <View style={styles.loggedInContainer}>
              {item === TRACKER_SOURCES.NOVEL_UPDATES && (
                <>
                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text
                        style={[
                          styles.settingTitle,
                          { color: theme.onSurface },
                        ]}
                      >
                        {getString(
                          'novelUpdatesSettings.fetchAltTitlesTags' as any,
                        )}
                      </Text>
                      <Text
                        style={[
                          styles.settingSubtitle,
                          { color: theme.onSurfaceVariant },
                        ]}
                      >
                        {getString(
                          'novelUpdatesSettings.fetchAltTitlesTagsDesc' as any,
                        )}
                      </Text>
                    </View>
                    <Switch
                      value={nuAltTitles}
                      onValueChange={v => {
                        setNuAltTitles(v);
                        MMKVStorage.set(
                          'novelupdates_fetch_alternative_titles',
                          v,
                        );
                      }}
                    />
                  </View>
                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text
                        style={[
                          styles.settingTitle,
                          { color: theme.onSurface },
                        ]}
                      >
                        {getString(
                          'novelUpdatesSettings.useNotesTracking' as any,
                        )}
                      </Text>
                      <Text
                        style={[
                          styles.settingSubtitle,
                          { color: theme.onSurfaceVariant },
                        ]}
                      >
                        {getString(
                          'novelUpdatesSettings.useNotesTrackingDesc' as any,
                        )}
                      </Text>
                    </View>
                    <Switch
                      value={nuNotesTracking}
                      onValueChange={v => {
                        if (!v && !nuMarkChapters) {
                          showToast(
                            (getString(
                              'novelUpdatesSettings.enableEitherMethod' as any,
                            ) as string) ||
                              'Enable either notes tracking or mark chapters',
                          );
                          return;
                        }
                        setNuNotesTracking(v);
                        MMKVStorage.set('novelupdates_use_notes_tracking', v);
                      }}
                    />
                  </View>
                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text
                        style={[
                          styles.settingTitle,
                          { color: theme.onSurface },
                        ]}
                      >
                        {getString('trackingScreen.markChaptersAsRead' as any)}
                      </Text>
                      <Text
                        style={[
                          styles.settingSubtitle,
                          { color: theme.onSurfaceVariant },
                        ]}
                      >
                        {getString(
                          'trackingScreen.markChaptersAsReadDesc' as any,
                        )}
                      </Text>
                    </View>
                    <Switch
                      value={nuMarkChapters}
                      onValueChange={v => {
                        if (!v && !nuNotesTracking) {
                          showToast(
                            (getString(
                              'novelUpdatesSettings.enableEitherMethod' as any,
                            ) as string) ||
                              'Enable either notes tracking or mark chapters',
                          );
                          return;
                        }
                        setNuMarkChapters(v);
                        MMKVStorage.set(
                          'novelupdates_mark_chapters_enabled',
                          v,
                        );
                      }}
                    />
                  </View>
                </>
              )}
              {item === TRACKER_SOURCES.MANGAUPDATES && (
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text
                      style={[styles.settingTitle, { color: theme.onSurface }]}
                    >
                      Fetch Alternative Titles
                    </Text>
                    <Text
                      style={[
                        styles.settingSubtitle,
                        { color: theme.onSurfaceVariant },
                      ]}
                    >
                      Sends one extra request to MangaUpdates
                    </Text>
                  </View>
                  <Switch
                    value={muAltTitles}
                    onValueChange={v => {
                      setMuAltTitles(v);
                      MMKVStorage.set(
                        'mangaupdates_fetch_alternative_titles',
                        v,
                      );
                    }}
                  />
                </View>
              )}
              {item === TRACKER_SOURCES.NOVELLIST && (
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text
                      style={[styles.settingTitle, { color: theme.onSurface }]}
                    >
                      Fetch Alternative Titles
                    </Text>
                    <Text
                      style={[
                        styles.settingSubtitle,
                        { color: theme.onSurfaceVariant },
                      ]}
                    >
                      Attempts to include alternative titles (may add a request)
                    </Text>
                  </View>
                  <Switch
                    value={nlAltTitles}
                    onValueChange={v => {
                      setNlAltTitles(v);
                      MMKVStorage.set('novellist_fetch_alternative_titles', v);
                    }}
                  />
                </View>
              )}
              {item === TRACKER_SOURCES.NOVELLIST && (
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text
                      style={[styles.settingTitle, { color: theme.onSurface }]}
                    >
                      Preserve User Notes
                    </Text>
                    <Text
                      style={[
                        styles.settingSubtitle,
                        { color: theme.onSurfaceVariant },
                      ]}
                    >
                      Keep existing notes when updating volumes (recommended)
                    </Text>
                  </View>
                  <Switch
                    value={nlPreserveNotes}
                    onValueChange={v => {
                      setNlPreserveNotes(v);
                      MMKVStorage.set('novellist_preserve_user_notes', v);
                    }}
                  />
                </View>
              )}
              {item === TRACKER_SOURCES.NOVELLIST && (
                <Button
                  mode="text"
                  onPress={() => handleRefreshAuth(item)}
                  style={styles.button}
                  compact
                >
                  Refresh Auth
                </Button>
              )}
              <Button
                mode="outlined"
                onPress={() => handleLogout(item)}
                style={styles.logoutButton}
                textColor={theme.error}
              >
                Logout
              </Button>
            </View>
          ) : (
            <View style={styles.loginContainer}>
              <Button
                mode="contained"
                onPress={() => handleLogin(item)}
                style={styles.button}
              >
                Login with {item}
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.surface }}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content
          title="Trackers"
          titleStyle={{ color: theme.onSurface }}
        />
      </Appbar.Header>

      {loggedInTrackers.length > 0 && (
        <View style={styles.summaryContainer}>
          <Text style={[styles.summaryText, { color: theme.onSurface }]}>
            Connected to {loggedInTrackers.length} tracker
            {loggedInTrackers.length !== 1 ? 's' : ''}
          </Text>
          <View style={styles.chipContainer}>
            {loggedInTrackers.map(tracker => (
              <Chip
                key={tracker}
                style={styles.chip}
                textStyle={{ color: theme.onPrimaryContainer }}
                mode="outlined"
              >
                {tracker}
              </Chip>
            ))}
          </View>
        </View>
      )}

      {/* Auto-sync Settings */}
      <Card style={[styles.card, { backgroundColor: theme.surface }]}>
        <Card.Content>
          <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>
            Auto-sync Settings
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, { color: theme.onSurface }]}>
                Auto-sync Trackers
              </Text>
              <Text
                style={[
                  styles.settingSubtitle,
                  { color: theme.onSurfaceVariant },
                ]}
              >
                Automatically sync reading progress to trackers
              </Text>
            </View>
            <Switch
              value={autoSyncTracker}
              onValueChange={handleAutoSyncToggle}
            />
          </View>

          {autoSyncTracker && (
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingTitle, { color: theme.onSurface }]}>
                  Chapter Threshold: {autoSyncChapterThreshold}
                </Text>
                <Text
                  style={[
                    styles.settingSubtitle,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  Sync after reading this many chapters ahead of tracker
                </Text>
              </View>
            </View>
          )}

          {autoSyncTracker && (
            <View style={styles.thresholdButtons}>
              {[1, 2, 3, 5, 10].map(value => (
                <Button
                  key={value}
                  mode={
                    autoSyncChapterThreshold === value
                      ? 'contained'
                      : 'outlined'
                  }
                  onPress={() => handleThresholdChange(value)}
                  style={styles.thresholdButton}
                  compact
                >
                  {value}
                </Button>
              ))}
              <Button
                mode={showCustomInput ? 'contained' : 'outlined'}
                onPress={() => setShowCustomInput(!showCustomInput)}
                style={styles.thresholdButton}
                compact
              >
                Custom
              </Button>
            </View>
          )}

          {autoSyncTracker && showCustomInput && (
            <View style={styles.customInputContainer}>
              <TextInput
                label="Custom threshold"
                value={customThreshold}
                onChangeText={setCustomThreshold}
                keyboardType="numeric"
                mode="outlined"
                style={styles.customInput}
                placeholder="Enter number of chapters"
              />
              <Button
                mode="contained"
                onPress={handleCustomThresholdSubmit}
                style={styles.customSubmitButton}
                compact
              >
                Set
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>

      <FlatList
        data={Object.keys(trackers) as TrackSource[]}
        renderItem={renderItem}
        keyExtractor={item => item}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />

      {/* Custom Logout Dialog */}
      <Portal>
        <Dialog visible={logoutDialogVisible} onDismiss={cancelLogout}>
          <Dialog.Title>Logout</Dialog.Title>
          <Dialog.Content>
            <Text style={[styles.dialogContent, { color: theme.onSurface }]}>
              Are you sure you want to logout from {selectedTrackerToLogout}?
            </Text>

            <View style={styles.checkboxRow}>
              <Checkbox
                status={deleteLinkedNovels ? 'checked' : 'unchecked'}
                onPress={() => setDeleteLinkedNovels(!deleteLinkedNovels)}
              />
              <Text style={[styles.checkboxText, { color: theme.onSurface }]}>
                Also delete all linked novels and tracking data
              </Text>
            </View>

            {deleteLinkedNovels && (
              <Text style={[styles.warningText, { color: theme.error }]}>
                Warning: This will permanently remove all novels linked to this
                tracker.
              </Text>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={cancelLogout}>Cancel</Button>
            <Button onPress={confirmLogout} textColor={theme.error}>
              Logout
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <MangaUpdatesLoginDialog
        visible={mangaUpdatesLoginVisible}
        onDismiss={() => setMangaUpdatesLoginVisible(false)}
        onSubmit={handleMangaUpdatesLogin}
      />
    </View>
  );
};

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      padding: 16,
    },
    summaryContainer: {
      padding: 16,
      backgroundColor: theme.surfaceVariant,
    },
    summaryText: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 8,
    },
    chipContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      marginRight: 8,
    },
    trackerCard: {
      marginBottom: 16,
      elevation: 2,
    },
    card: {
      marginBottom: 16,
      elevation: 2,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 16,
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    settingInfo: {
      flex: 1,
      marginRight: 16,
    },
    settingTitle: {
      fontSize: 16,
      fontWeight: '500',
      marginBottom: 4,
    },
    settingSubtitle: {
      fontSize: 14,
      lineHeight: 18,
    },
    thresholdButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    thresholdButton: {
      minWidth: 50,
    },
    customInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      gap: 8,
    },
    customInput: {
      flex: 1,
    },
    customSubmitButton: {
      minWidth: 60,
    },
    trackerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    trackerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    trackerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionHeading: {
      marginBottom: 8,
    },
    instructions: {
      fontSize: 14,
      marginBottom: 16,
      lineHeight: 20,
    },
    loggedInContainer: {
      alignItems: 'flex-start',
    },
    loginContainer: {
      marginTop: 8,
    },
    button: {
      marginTop: 8,
      marginRight: 8,
    },
    logoutButton: {
      marginTop: 8,
    },
    footer: {
      padding: 16,
      alignItems: 'center',
    },
    footerText: {
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 16,
    },
    dialogContent: {
      marginBottom: 16,
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    checkboxText: {
      flex: 1,
      marginLeft: 8,
    },
    warningText: {
      fontSize: 12,
      marginLeft: 32,
    },
  });

export default TrackerSettingsScreen;
