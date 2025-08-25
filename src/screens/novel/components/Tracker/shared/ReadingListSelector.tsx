import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { IconButton, ActivityIndicator } from 'react-native-paper';
import { ThemeColors } from '@theme/types';
import { getString } from '@strings/translations';

export interface ReadingListItem {
  id: string;
  name: string;
}

interface ReadingListSelectorProps {
  theme: ThemeColors;
  availableLists: ReadingListItem[];
  selectedListId: string | null;
  onSelect: (listId: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  label?: string;
  showIfEmpty?: boolean;
  compact?: boolean;
  onPressModal?: () => void;
}

/**
 * selector UI for choosing a reading list
 */
export const ReadingListSelector: React.FC<ReadingListSelectorProps> = ({
  theme,
  availableLists,
  selectedListId,
  onSelect,
  onRefresh,
  refreshing,
  label = 'List/Status',
  showIfEmpty = false,
  compact = false,
  onPressModal,
}) => {
  const selectedName = React.useMemo(
    () => availableLists.find(l => l.id === selectedListId)?.name,
    [availableLists, selectedListId],
  );

  if (!showIfEmpty && (!availableLists || availableLists.length === 0)) {
    return null;
  }

  return (
    <View style={[styles.container, compact && styles.compact]}>
      <View style={styles.left}>
        <Text style={[styles.label, { color: theme.onSurface }]}>{label}</Text>
        <Pressable
          onPress={() => {
            if (onPressModal) {
              onPressModal();
              return;
            }
            // cycle through lists when pressed if few lists present
            if (availableLists.length === 0) return;
            if (!selectedListId) {
              onSelect(availableLists[0].id);
              return;
            }
            const idx = availableLists.findIndex(l => l.id === selectedListId);
            const next = availableLists[(idx + 1) % availableLists.length];
            onSelect(next.id);
          }}
        >
          <Text style={[styles.value, { color: theme.primary }]}>
            {selectedName ||
              (availableLists.length === 0 && onRefresh
                ? 'Press refresh to load'
                : getString('common.select' as any))}
          </Text>
        </Pressable>
      </View>
      {onRefresh ? (
        refreshing ? (
          <ActivityIndicator
            size={20}
            color={theme.primary}
            style={styles.spinner}
          />
        ) : (
          <IconButton
            icon="reload"
            size={20}
            onPress={onRefresh}
            iconColor={theme.primary}
            style={styles.refreshButton}
          />
        )
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  compact: {
    marginTop: 4,
  },
  left: { flex: 1 },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  value: {
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  refreshButton: { margin: 0 },
  spinner: { marginRight: 4 },
});

export default ReadingListSelector;
