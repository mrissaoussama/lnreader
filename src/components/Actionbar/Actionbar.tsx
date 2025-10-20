import { useTheme } from '@hooks/persisted';
import React, { useState } from 'react';
import {
  Dimensions,
  Pressable,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { MaterialDesignIconName } from '@type/icon';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Menu } from 'react-native-paper';

type MenuItem = {
  icon: MaterialDesignIconName;
  title: string;
  onPress: () => void;
};

type Action = {
  icon: MaterialDesignIconName;
  onPress?: () => void;
  menuItems?: MenuItem[];
};

interface ActionbarProps {
  active: boolean;
  actions: Action[];
  viewStyle?: StyleProp<ViewStyle>;
}

export const Actionbar: React.FC<ActionbarProps> = ({
  active,
  actions,
  viewStyle,
}) => {
  const theme = useTheme();
  const { bottom } = useSafeAreaInsets();
  const [visibleMenuIndex, setVisibleMenuIndex] = useState<number | null>(null);

  if (!active) {
    return null;
  }

  return (
    <Animated.View
      entering={SlideInDown.duration(150)}
      exiting={SlideOutDown.duration(150)}
      style={[
        styles.actionbarContainer,
        {
          backgroundColor: theme.surface2,
          minHeight: 80 + bottom,
          paddingBottom: bottom,
        },
        viewStyle,
      ]}
    >
      {actions.map((action, id) => {
        if (action.menuItems && action.menuItems.length > 0) {
          // Render menu button
          return (
            <Menu
              key={id}
              visible={visibleMenuIndex === id}
              onDismiss={() => setVisibleMenuIndex(null)}
              anchor={
                <Pressable
                  android_ripple={{
                    radius: 50,
                    color: theme.rippleColor,
                    borderless: true,
                  }}
                  onPress={() => setVisibleMenuIndex(id)}
                >
                  <MaterialCommunityIcons
                    name={action.icon}
                    color={theme.onSurface}
                    size={24}
                  />
                </Pressable>
              }
              contentStyle={{ backgroundColor: theme.surface }}
            >
              {action.menuItems.map((item, idx) => (
                <Menu.Item
                  key={idx}
                  leadingIcon={item.icon}
                  onPress={() => {
                    setVisibleMenuIndex(null);
                    item.onPress();
                  }}
                  title={item.title}
                  titleStyle={{ color: theme.onSurface }}
                />
              ))}
            </Menu>
          );
        }

        // Render regular button
        return (
          <Pressable
            key={id}
            android_ripple={{
              radius: 50,
              color: theme.rippleColor,
              borderless: true,
            }}
            onPress={action.onPress}
          >
            <MaterialCommunityIcons
              name={action.icon}
              color={theme.onSurface}
              size={24}
            />
          </Pressable>
        );
      })}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  actionbarContainer: {
    alignItems: 'center',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    bottom: 0,
    elevation: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    position: 'absolute',
    width: Dimensions.get('window').width,
  },
});
