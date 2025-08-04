import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, FlatList } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ErrorView } from '@components/ErrorView/ErrorView';
import { SafeAreaView, SearchbarV2 } from '@components';
import { showToast } from '@utils/showToast';
import TrackerNovelCard from './TrackerNovelCard';
import { useTheme, useTracker } from '@hooks/persisted';
import TrackerLoading from '../loadingAnimation/TrackerLoading';
import localeData from 'dayjs/plugin/localeData';
import dayjs from 'dayjs';
import { queryAniList } from '@services/Trackers/graphql';
dayjs.extend(localeData);
function formatDate(date) {
  if (date.year && date.month) {
    return `${dayjs.monthsShort()[date.month - 1]} ${date.year}`;
  }
  return '';
}
function datesEqual(date1, date2) {
  return date1.year === date2.year && date1.month === date2.month;
}
const anilistSearchQuery = `query($search: String, $page: Int) {
    Page(page: $page) {
      pageInfo {
        hasNextPage
      }
      media(search: $search, type: MANGA, format: NOVEL, sort: POPULARITY_DESC) {
        id
        volumes
        title {
          userPreferred
        }
        coverImage {
          extraLarge
        }
        averageScore
        format
        startDate {
          month
          year
        }
        endDate {
          month
          year
        }
      }
    }
  }`;
const anilistUrl =
  'https://anilist.co/search/manga?format=NOVEL&sort=POPULARITY_DESC';
const BrowseALScreen = ({ navigation }) => {
  const theme = useTheme();
  const { getTrackerAuth } = useTracker();
  const [loading, setLoading] = useState(true);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [novels, setNovels] = useState([]);
  const [error, setError] = useState();
  const [limit, setLimit] = useState(50);
  const [searchText, setSearchText] = useState('');
  const searchAniList = useCallback(
    async (onlyTop, page = 1) => {
      try {
        const tracker = getTrackerAuth('AniList');
        if (!tracker?.accessToken) {
          setLoading(false);
          setError('Please login to AniList in settings!');
          return;
        }
        const { data } = await queryAniList(
          anilistSearchQuery,
          {
            search: onlyTop ? undefined : searchText,
            page,
          },
          tracker.accessToken,
        );
        const results = data.Page.media.map(m => {
          return {
            id: m.id,
            novelName: m.title.userPreferred,
            novelCover: m.coverImage.extraLarge,
            score: `${m.averageScore}%`,
            info: [
              '',
              // MAL returns an item we don't care about first, so the component ignores the first element
              `Light Novel (${m.volumes || '?'} Vols)`,
              `${formatDate(m.startDate)}${
                datesEqual(m.startDate, m.endDate)
                  ? ''
                  : `- ${formatDate(m.endDate)}`
              }`,
            ],
          };
        });
        setHasNextPage(data.Page.pageInfo.hasNextPage);
        setNovels(onlyTop ? before => before.concat(results) : results);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setNovels([]);
        setLoading(false);
        showToast(err.message);
      }
    },
    [searchText, getTrackerAuth],
  );
  const clearSearchbar = () => {
    setNovels([]);
    setHasNextPage(true);
    searchAniList(true, 1);
    setLoading(true);
    setSearchText('');
  };
  useEffect(() => {
    searchAniList(true);
  }, [searchAniList]);
  const renderItem = ({ item }) => (
    <TrackerNovelCard
      novel={item}
      theme={theme}
      onPress={() =>
        navigation.navigate('GlobalSearchScreen', {
          searchText: item.novelName,
        })
      }
    />
  );
  const ListEmptyComponent = useCallback(
    () => (
      <ErrorView
        errorName={error || 'No results found'}
        actions={[
          {
            name: 'Retry',
            onPress: () => {
              setLoading(true);
              setError(undefined);
              searchAniList(true);
            },
            icon: 'reload',
          },
        ]}
        theme={theme}
      />
    ),
    [error, searchAniList, theme],
  );
  return (
    <SafeAreaView>
      <SearchbarV2
        theme={theme}
        placeholder="Search AniList"
        leftIcon="arrow-left"
        handleBackAction={() => navigation.goBack()}
        searchText={searchText}
        onChangeText={text => setSearchText(text)}
        onSubmitEditing={() => searchAniList(false, 1)}
        clearSearchbar={clearSearchbar}
        rightIcons={[
          {
            iconName: 'earth',
            onPress: () => WebBrowser.openBrowserAsync(anilistUrl),
          },
        ]}
      />
      {loading ? (
        <TrackerLoading theme={theme} />
      ) : (
        <FlatList
          contentContainerStyle={styles.novelsContainer}
          data={novels}
          keyExtractor={item => item.id + '_' + item.novelName}
          renderItem={renderItem}
          ListEmptyComponent={ListEmptyComponent}
          onEndReachedThreshold={0.3}
          onEndReached={() => {
            if (hasNextPage && !searchText) {
              searchAniList(true, Math.ceil((limit + 50) / 50));
              setLimit(before => before + 50);
            }
          }}
          ListFooterComponent={
            !searchText ? (
              <View style={styles.paddingVertical}>
                <ActivityIndicator color={theme.primary} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
};
export default BrowseALScreen;
const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
  },
  novelsContainer: {
    flexGrow: 1,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  paddingVertical: {
    paddingVertical: 16,
  },
});
