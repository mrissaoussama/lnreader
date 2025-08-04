import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { Portal, Text, Button, Provider, Checkbox } from 'react-native-paper';
import { useTheme, useTracker } from '@hooks/persisted';
import { Appbar, List, Modal, SafeAreaView } from '@components';
import { getString } from '@strings/translations';
import { showToast } from '@utils/showToast';
import { trackers, TRACKER_SOURCES } from '@services/Trackers';

const TrackerScreen = ({ navigation }) => {
  const theme = useTheme();
  const { removeTracker, setTracker, isLoggedIn } = useTracker();
  const [visible, setVisible] = useState(false);
  const [selectedTracker, setSelectedTracker] = useState(null);
  const [nuLoggedIn, setNuLoggedIn] = useState(false);

  // Memoized icon components to avoid recreating on each render
  const renderCheckIcon = useCallback(
    key => (isLoggedIn(key) ? <List.Icon icon="check" /> : null),
    [isLoggedIn],
  );

  const showModal = trackerName => {
    setSelectedTracker(trackerName);
    setVisible(true);
  };
  const hideModal = () => {
    setVisible(false);
    setSelectedTracker(null);
  };
  const handleLogout = () => {
    if (selectedTracker) {
      removeTracker(selectedTracker);
      showToast(`Logged out from ${selectedTracker}`);
      if (selectedTracker === TRACKER_SOURCES.NOVEL_UPDATES) {
        setNuLoggedIn(false);
      }
    }
    hideModal();
  };
  const handleLogin = async trackerName => {
    try {
      if (trackerName === TRACKER_SOURCES.NOVEL_UPDATES) {
        if (nuLoggedIn) {
          const auth = await trackers[trackerName].authenticate();
          if (auth) {
            setTracker(trackerName, auth);
            showToast(`Logged in to ${trackerName}`);
          }
        } else {
          showToast('Please log in to Novel-Updates in a browser first.');
          Linking.openURL('https://www.novelupdates.com/login/');
        }
        return;
      }
      const auth = await trackers[trackerName].authenticate();
      if (auth) {
        setTracker(trackerName, auth);
        showToast(`Logged in to ${trackerName}`);
      }
    } catch (error) {
      showToast(error.message);
    }
  };
  const renderTrackerItem = key => {
    if (key === TRACKER_SOURCES.NOVEL_UPDATES) {
      return (
        <>
          <List.Item
            key={key}
            title={key}
            onPress={() => {
              if (isLoggedIn(key)) {
                showModal(key);
              } else {
                handleLogin(key);
              }
            }}
            right={() => renderCheckIcon(key)}
            theme={theme}
          />
          {!isLoggedIn(key) && (
            <Checkbox.Item
              label="I have logged in to Novel-Updates in a browser"
              status={nuLoggedIn ? 'checked' : 'unchecked'}
              onPress={() => setNuLoggedIn(!nuLoggedIn)}
              theme={theme}
            />
          )}
        </>
      );
    }
    return (
      <List.Item
        key={key}
        title={key}
        onPress={() => {
          if (isLoggedIn(key)) {
            showModal(key);
          } else {
            handleLogin(key);
          }
        }}
        right={() => renderCheckIcon(key)}
        theme={theme}
      />
    );
  };
  return (
    <SafeAreaView excludeTop>
      <Provider>
        <Appbar
          title={getString('tracking')}
          handleGoBack={() => navigation.goBack()}
          theme={theme}
        />
        <View
          style={[
            {
              backgroundColor: theme.background,
            },
            styles.flex1,
            styles.screenPadding,
          ]}
        >
          <List.Section>
            <List.SubHeader theme={theme}>
              {getString('trackingScreen.services')}
            </List.SubHeader>
            {Object.keys(trackers).map(key => renderTrackerItem(key))}
          </List.Section>

          <Portal>
            <Modal visible={visible} onDismiss={hideModal}>
              <Text
                style={[
                  {
                    color: theme.onSurface,
                  },
                  styles.modalText,
                ]}
              >
                {getString('trackingScreen.logOutMessage', {
                  name: selectedTracker,
                })}
              </Text>
              <View style={styles.modalButtonRow}>
                <Button
                  style={styles.modalButton}
                  labelStyle={[
                    {
                      color: theme.primary,
                    },
                    styles.modalButtonLabel,
                  ]}
                  onPress={hideModal}
                >
                  {getString('common.cancel')}
                </Button>
                <Button
                  style={styles.modalButton}
                  labelStyle={[
                    {
                      color: theme.primary,
                    },
                    styles.modalButtonLabel,
                  ]}
                  onPress={handleLogout}
                >
                  {getString('common.logout')}
                </Button>
              </View>
            </Modal>
          </Portal>
        </View>
      </Provider>
    </SafeAreaView>
  );
};
export default TrackerScreen;
const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  screenPadding: {
    paddingVertical: 8,
  },
  modalText: {
    fontSize: 18,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    marginTop: 30,
  },
  modalButtonLabel: {
    letterSpacing: 0,
    textTransform: 'none',
  },
});
