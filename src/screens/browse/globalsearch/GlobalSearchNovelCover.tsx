import React from 'react';
import { StyleSheet, View, Text, Image, Pressable } from 'react-native';
import { coverPlaceholderColor } from '@theme/colors';
import { ThemeColors } from '@theme/types';
import { NovelItem } from '@plugins/types';
import { MatchType, shouldShowBadges } from '@utils/libraryMatching';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

interface GlobalSearchNovelCoverProps {
  novel: NovelItem;
  theme: ThemeColors;
  onPress: () => void;
  inLibrary: boolean;
  onLongPress: () => void;
  match?: MatchType | false;
}

const GlobalSearchNovelCover = ({
  novel,
  theme,
  onPress,
  inLibrary,
  onLongPress,
  match,
}: GlobalSearchNovelCoverProps) => {
  const { name, cover } = novel;

  const uri = cover;

  const opacity = inLibrary ? 0.5 : 1;

  const showBadge = match && shouldShowBadges(match);

  return (
    <View style={styles.container}>
      <Pressable
        android_ripple={{ color: theme.rippleColor }}
        style={styles.pressable}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        <View style={styles.coverContainer}>
          <Image
            source={{ uri }}
            style={[styles.novelCover, { opacity }]}
            progressiveRenderingEnabled={true}
          />
          {inLibrary && (
            <View style={[styles.badge, { backgroundColor: theme.primary }]}>
              <MaterialCommunityIcons
                name="check"
                size={14}
                color={theme.onPrimary}
              />
            </View>
          )}
          {showBadge && !inLibrary && (
            <View style={[styles.badge, { backgroundColor: theme.tertiary }]}>
              <MaterialCommunityIcons
                name="link-variant"
                size={14}
                color={theme.onTertiary}
              />
            </View>
          )}
        </View>
        <Text
          numberOfLines={2}
          style={[styles.title, { color: theme.onSurface }]}
        >
          {name}
        </Text>
      </Pressable>
    </View>
  );
};

export default GlobalSearchNovelCover;

const styles = StyleSheet.create({
  container: {
    borderRadius: 6,
    flex: 1,
    overflow: 'hidden',
  },
  coverContainer: {
    position: 'relative',
  },
  novelCover: {
    backgroundColor: coverPlaceholderColor,
    borderRadius: 4,
    height: 150,
    width: 115,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
    borderRadius: 4,
    flex: 1,
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  title: {
    flexWrap: 'wrap',
    fontFamily: 'pt-sans-bold',
    fontSize: 14,
    padding: 4,
    width: 115,
  },
});
