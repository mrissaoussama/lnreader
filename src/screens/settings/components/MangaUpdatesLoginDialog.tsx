import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Button,
  Dialog,
  Portal,
  TextInput,
  HelperText,
} from 'react-native-paper';
import { useTheme } from '@hooks/persisted';

interface MangaUpdatesLoginDialogProps {
  visible: boolean;
  onDismiss: () => void;
  onSubmit: (username: string, password: string) => Promise<void> | void;
}

const MangaUpdatesLoginDialog: React.FC<MangaUpdatesLoginDialogProps> = ({
  visible,
  onDismiss,
  onSubmit,
}) => {
  const theme = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!username || !password) {
      setError('Username and password cannot be empty.');
      return;
    }
    setError('');
    try {
      await Promise.resolve(onSubmit(username, password));
      setUsername('');
      setPassword('');
      onDismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    }
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={{ backgroundColor: theme.surface2 }}
      >
        <Dialog.Title style={{ color: theme.onSurface }}>
          MangaUpdates Login
        </Dialog.Title>
        <Dialog.Content>
          <View>
            <TextInput
              label="Username"
              value={username}
              onChangeText={setUsername}
              mode="outlined"
              style={styles.textInput}
              autoCapitalize="none"
              autoCorrect={false}
              theme={{ colors: { ...theme } }}
            />
            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              mode="outlined"
              style={styles.textInput}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              theme={{ colors: { ...theme } }}
            />
            {error ? <HelperText type="error">{error}</HelperText> : null}
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} textColor={theme.onSurface}>
            Cancel
          </Button>
          <Button onPress={handleSubmit} textColor={theme.primary}>
            Login
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  textInput: {
    marginBottom: 8,
  },
});

export default MangaUpdatesLoginDialog;
