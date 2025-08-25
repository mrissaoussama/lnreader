import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Image,
} from 'react-native';
import { IconButton } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import SearchbarV2 from '@components/SearchbarV2/SearchbarV2';
import { getString } from '@strings/translations';
import { trackModalStyles as styles } from './TrackModal.styles';

interface SearchSectionProps {
  theme: any;
  searchText: string;
  setSearchText: (s: string) => void;
  handleSearch: (page?: number, isNew?: boolean) => void;
  availableTitles: string[];
  setTitlePickerVisible: (v: boolean) => void;
  selectedTracker: string;
  allTrackers: Record<string, any>;
  selectedReadingList: { name: string } | null | undefined;
  setShowListModal: (v: boolean) => void;
  refreshReadingLists: () => void;
  refreshingLists: boolean;
  loading: boolean;
  searchResults: any[];
  loadingMore: boolean;
  bottomInset: number;
  handleLoadMore: () => void;
  handleLink: (item: any) => void;
  onBack: () => void;
  expandedSearchItem: any | null;
  setExpandedSearchItem: (item: any | null) => void;
}

export const SearchSection: React.FC<SearchSectionProps> = ({
  theme,
  searchText,
  setSearchText,
  handleSearch,
  availableTitles,
  setTitlePickerVisible,
  selectedTracker,
  allTrackers,
  selectedReadingList,
  setShowListModal,
  refreshReadingLists,
  refreshingLists,
  loading,
  searchResults,
  loadingMore,
  bottomInset,
  handleLoadMore,
  handleLink,
  onBack,
  expandedSearchItem,
  setExpandedSearchItem,
}) => {
  const navigation = useNavigation();

  const renderSearchItemIcon = useCallback(
    (item: any) =>
      item.coverImage ? (
        <Image source={{ uri: item.coverImage }} style={styles.coverImage} />
      ) : (
        <IconButton icon="book" />
      ),
    [],
  );

  const renderSearchItem = ({ item }: { item: any }) => {
    const isExpanded = expandedSearchItem?.id === item.id;
    let description = '';
    if (item.totalChapters) {
      description += `${item.totalChapters} chapters`;
    }

    if (item.description) {
      if (description) {
        description += ' • ';
      }
      description += item.description;
    }

    if (isExpanded && item.genres?.length > 0) {
      if (description) {
        description += '\n\n';
      }
      description += `Genres: ${item.genres.join(', ')}`;
    }

    const handleWebViewPress = () => {
      let url = item.url;
      if (!url && selectedTracker) {
        const trackerImpl = allTrackers[selectedTracker];
        if (trackerImpl && typeof trackerImpl.getEntryUrl === 'function') {
          const trackData = {
            sourceId: item.id,
            metadata: item.__trackerMeta
              ? JSON.stringify(item.__trackerMeta)
              : undefined,
          };
          url = trackerImpl.getEntryUrl(trackData);
        }
      }

      if (url) {
        (navigation as any).navigate('WebviewScreen', {
          url: url,
          name: item.title,
        });
      }
    };

    return (
      <TouchableOpacity
        style={[styles.searchResultItem, { borderBottomColor: theme.outline }]}
        onPress={() => handleLink(item)}
        onLongPress={() => setExpandedSearchItem(isExpanded ? null : item)}
      >
        <View style={styles.searchResultContent}>
          <View style={styles.searchResultIcon}>
            {renderSearchItemIcon(item)}
          </View>
          <View style={styles.searchResultText}>
            <Text
              style={[styles.searchResultTitle, { color: theme.onSurface }]}
              numberOfLines={2}
            >
              {item.title}
            </Text>

            {isExpanded &&
              (() => {
                const trackerImpl = selectedTracker
                  ? allTrackers[selectedTracker]
                  : null;
                const hasUrl =
                  item.url ||
                  (trackerImpl &&
                    typeof trackerImpl.getEntryUrl === 'function');
                return hasUrl;
              })() && (
                <TouchableOpacity
                  style={styles.webIconRow}
                  onPress={handleWebViewPress}
                >
                  <IconButton
                    icon="web"
                    iconColor={theme.primary}
                    size={20}
                    style={styles.webIcon}
                  />
                  <Text style={[styles.webText, { color: theme.primary }]}>
                    View on web
                  </Text>
                </TouchableOpacity>
              )}

            <Text
              style={[
                styles.searchResultDescription,
                { color: theme.onSurfaceVariant },
              ]}
              numberOfLines={isExpanded ? undefined : 3}
            >
              {description}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <View style={[styles.appbarHeader, { backgroundColor: theme.surface2 }]}>
        <IconButton
          icon="arrow-left"
          onPress={onBack}
          iconColor={theme.onSurface}
        />
        <Text style={[styles.appbarTitle, { color: theme.onSurface }]}>
          {getString('trackingDialog.searchTracker' as any, {
            tracker: selectedTracker,
          })}
        </Text>
        <IconButton icon="close" onPress={onBack} iconColor={theme.onSurface} />
      </View>
      <View
        style={[styles.searchContainer, { backgroundColor: theme.surface2 }]}
      >
        <SearchbarV2
          searchText={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={() => handleSearch(1, true)}
          theme={theme}
          placeholder={`${getString(
            'common.search' as any,
          )} ${selectedTracker}...`}
          leftIcon="magnify"
          clearSearchbar={() => setSearchText('')}
          rightIcons={[
            { iconName: 'magnify', onPress: () => handleSearch(1, true) },
          ]}
        />
        {availableTitles.length > 1 && (
          <TouchableOpacity
            style={[
              styles.titlePickerButton,
              { backgroundColor: theme.surface, borderColor: theme.outline },
            ]}
            onPress={() => setTitlePickerVisible(true)}
          >
            <Text style={[styles.titlePickerText, { color: theme.onSurface }]}>
              Use alternative title ({availableTitles.length} available)
            </Text>
            <IconButton icon="chevron-down" size={16} />
          </TouchableOpacity>
        )}
        {selectedTracker && allTrackers[selectedTracker] && (
          <View
            style={[
              styles.readingListContainer,
              { backgroundColor: theme.surface },
            ]}
          >
            <Text style={[styles.readingListLabel, { color: theme.onSurface }]}>
              {allTrackers[selectedTracker].capabilities.hasStaticLists
                ? `${getString('common.status' as any)}:`
                : `${getString('common.readingList' as any)}:`}
            </Text>
            <View style={styles.readingListSelector}>
              <Text
                onPress={() => {
                  setShowListModal(true);
                }}
                style={[styles.readingListLink, { color: theme.primary }]}
              >
                {selectedReadingList?.name ||
                  getString('common.select' as any) ||
                  'Select...'}
              </Text>
              {allTrackers[selectedTracker]?.capabilities.hasDynamicLists && (
                <IconButton
                  icon="refresh"
                  size={20}
                  onPress={refreshReadingLists}
                  disabled={refreshingLists}
                  style={styles.refreshButton}
                />
              )}
            </View>
          </View>
        )}
      </View>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={[styles.loadingText, { color: theme.onSurface }]}>
            {getString('trackingDialog.searchingFor' as any, {
              query: searchText,
            })}
          </Text>
        </View>
      ) : (
        <FlatList
          data={searchResults}
          renderItem={renderSearchItem}
          keyExtractor={(item, index) => `${String(item.id)}-${index}`}
          contentContainerStyle={{
            backgroundColor: theme.surface2,
            paddingBottom: bottomInset,
          }}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator color={theme.primary} size="small" />
                <Text
                  style={[
                    styles.loadingMoreText,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  {getString('trackingDialog.loadingMore' as any)}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text
                style={[styles.emptyText, { color: theme.onSurfaceVariant }]}
              >
                {searchText
                  ? getString('trackingDialog.noResults' as any)
                  : getString('common.searchFor' as any)}
              </Text>
            </View>
          }
        />
      )}
    </>
  );
};
