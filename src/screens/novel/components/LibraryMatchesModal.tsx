import React from 'react';
import {
  FlatList,
  Pressable,
  Text,
  View,
  Image,
  StyleSheet,
} from 'react-native';
import { Modal, Appbar } from '@components';
import { ThemeColors } from '@theme/types';
import { LibraryMatch } from '@utils/libraryMatching';
import { getString } from '@strings/translations';
import { getPlugin } from '@plugins/pluginManager';
import { getUserAgent } from '@hooks/persisted/useUserAgent';
import { defaultCover } from '@plugins/helpers/constants';
import { coverPlaceholderColor } from '@theme/colors';

interface LibraryMatchesModalProps {
  visible: boolean;
  onClose: () => void;
  matches: LibraryMatch[];
  theme: ThemeColors;
  onSelectMatch: (match: LibraryMatch) => void;
}

const LibraryMatchesModal: React.FC<LibraryMatchesModalProps> = ({
  visible,
  onClose,
  matches,
  theme,
  onSelectMatch,
}) => {
  return (
    <Modal visible={visible} onDismiss={onClose}>
      <Appbar
        title={getString('libraryMatching.libraryMatches')}
        handleGoBack={onClose}
        theme={theme}
        mode="center-aligned"
      />
      <FlatList
        data={matches}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => {
          const plugin = getPlugin(item.pluginId);
          const pluginName = plugin?.name || item.pluginId;

          return (
            <Pressable
              android_ripple={{ color: theme.rippleColor }}
              style={[
                styles.container,
                {
                  borderBottomColor: theme.outline,
                  backgroundColor: theme.surface,
                },
              ]}
              onPress={() => onSelectMatch(item)}
            >
              {/* Novel Cover */}
              <Image
                source={{
                  uri: item.cover || defaultCover,
                  headers: { 'User-Agent': getUserAgent() },
                }}
                style={[
                  styles.cover,
                  { backgroundColor: coverPlaceholderColor },
                ]}
              />

              {/* Content */}
              <View style={styles.content}>
                <View style={styles.titleContainer}>
                  <Text
                    style={[styles.title, { color: theme.onSurface }]}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                </View>

                {item.author && (
                  <Text
                    style={[styles.author, { color: theme.onSurfaceVariant }]}
                    numberOfLines={1}
                  >
                    {item.author}
                  </Text>
                )}
                {item.status && (
                  <Text
                    style={[styles.status, { color: theme.onSurfaceVariant }]}
                    numberOfLines={1}
                  >
                    {item.status}
                  </Text>
                )}
                {item.alternativeTitles &&
                  item.alternativeTitles.length > 0 && (
                    <Text
                      style={[styles.alts, { color: theme.onSurfaceVariant }]}
                      numberOfLines={1}
                    >
                      Alts: {item.alternativeTitles.join(', ')}
                    </Text>
                  )}

                <Text
                  style={[styles.plugin, { color: theme.onSurfaceVariant }]}
                >
                  {pluginName}
                </Text>

                <View style={styles.footer}>
                  <Text
                    style={[styles.chapters, { color: theme.onSurfaceVariant }]}
                  >
                    {item.totalChapters || 0} chapters
                  </Text>
                  <Text
                    style={[styles.chapters, { color: theme.onSurfaceVariant }]}
                  >
                    {Math.max(
                      0,
                      (item.totalChapters || 0) - (item.chaptersUnread || 0),
                    )}{' '}
                    read
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
        style={{ backgroundColor: theme.surface }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
              {getString('libraryMatching.noMatchesFound')}
            </Text>
          </View>
        }
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  cover: {
    width: 48,
    height: 64,
    borderRadius: 4,
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  author: {
    fontSize: 13,
    marginBottom: 2,
  },
  alts: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 2,
  },
  plugin: {
    fontSize: 12,
    marginBottom: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chapters: {
    fontSize: 11,
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});

export default LibraryMatchesModal;
