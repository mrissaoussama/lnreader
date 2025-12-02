import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

export async function askForPostNotificationsPermission(): Promise<boolean> {
  // iOS handled by expo-notifications; Android < 13 doesn't need runtime permission
  if (Platform.OS !== 'android' || Platform.Version < 33) return true;

  try {
    const settings = await Notifications.getPermissionsAsync();
    if ((settings as any)?.granted || settings.status === 'granted') {
      return true;
    }

    // Only try to request if the app is in the foreground (Activity attached)
    if (AppState.currentState !== 'active') {
      return false; // defer until UI becomes active
    }

    const req = await Notifications.requestPermissionsAsync();
    return (req as any)?.granted || req.status === 'granted';
  } catch {
    // Be safe: don’t crash if permission APIs are unavailable in headless mode
    return false;
  }
}
