import React from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet } from 'react-native';
import { TRACKER_SOURCES } from '@services/Trackers';

const sourceLogoMap: Record<string, any> = {
  [TRACKER_SOURCES.ANILIST]: require('../../../../assets/anilist.png'),
  [TRACKER_SOURCES.MYANIMELIST]: require('../../../../assets/mal.png'),
  [TRACKER_SOURCES.NOVEL_UPDATES]: require('../../../../assets/novelupdates.png'),
  [TRACKER_SOURCES.MANGAUPDATES]: require('../../../../assets/mangaupdates.png'),
  [TRACKER_SOURCES.NOVELLIST]: require('../../../../assets/novellist.png'),
};

export const TrackerLogo: React.FC<{
  source: string;
  size?: number;
  style?: StyleProp<ImageStyle>;
}> = ({ source, size = 28, style }) => {
  const src = sourceLogoMap[source];
  if (!src) return null;
  return (
    <Image
      source={src}
      style={[dynamicStyles(size).img, style]}
      resizeMode="contain"
    />
  );
};

export const getTrackerLogo = (source: string) => sourceLogoMap[source];

const dynamicStyles = (size: number) =>
  StyleSheet.create({
    img: { width: size, height: size, borderRadius: 6 },
  });
