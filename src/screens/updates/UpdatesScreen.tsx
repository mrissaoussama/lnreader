import React, { memo, Suspense, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { RefreshControl, SectionList, StyleSheet, Text } from 'react-native';

import {
  EmptyView,
  ErrorScreenV2,
  SearchbarV2,
  SafeAreaView,
} from '@components';

import { useSearch } from '@hooks';
import { useTheme } from '@hooks/persisted';
import { getString } from '@strings/translations';
import { ThemeColors } from '@theme/types';
import UpdatesSkeletonLoading from './components/UpdatesSkeletonLoading';
import UpdateNovelCard from './components/UpdateNovelCard';
import { deleteChapter } from '@database/queries/ChapterQueries';
import { showToast } from '@utils/showToast';
import ServiceManager from '@services/ServiceManager';
import { UpdateScreenProps } from '@navigators/types';
import { UpdateOverview } from '@database/types';
import { useUpdateContext } from '@components/Context/UpdateContext';
import { ErrorLogModal } from '@components/ErrorLogModal/ErrorLogModal';
import { ErrorLogger } from '@utils/ErrorLogger';

const UpdatesScreen = ({ navigation }: UpdateScreenProps) => {
  const theme = useTheme();
  const {
    updatesOverview,
    getUpdates,
    lastUpdateTime,
    showLastUpdateTime,
    error,
  } = useUpdateContext();
  const { searchText, setSearchText, clearSearchbar } = useSearch();
  const [errorLogVisible, setErrorLogVisible] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onChangeText = (text: string) => {
    setSearchText(text);
  };

  // Track UPDATE_LIBRARY task state
  useEffect(() => {
    const unsubscribe = ServiceManager.manager.observe(
      'UPDATE_LIBRARY',
      task => {
        setIsRefreshing(!!task && task.meta.isRunning);
      },
    );
    return unsubscribe;
  }, []);

  // Update error count periodically
  useEffect(() => {
    const updateErrorCount = () => {
      const count = ErrorLogger.getErrorCount('UPDATE_LIBRARY');
      setErrorCount(count);
    };

    updateErrorCount();
    const interval = setInterval(updateErrorCount, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // Refresh error count when modal is dismissed
  useEffect(() => {
    if (!errorLogVisible) {
      const count = ErrorLogger.getErrorCount('UPDATE_LIBRARY');
      setErrorCount(count);
    }
  }, [errorLogVisible]);

  useEffect(
    () =>
      navigation.addListener('tabPress', e => {
        if (navigation.isFocused()) {
          e.preventDefault();

          navigation.navigate('MoreStack', {
            screen: 'TaskQueue',
          });
        }
      }),
    [navigation],
  );

  return (
    <SafeAreaView excludeBottom>
      <SearchbarV2
        searchText={searchText}
        clearSearchbar={clearSearchbar}
        placeholder={getString('updatesScreen.searchbar')}
        onChangeText={onChangeText}
        leftIcon="magnify"
        theme={theme}
        rightIcons={[
          {
            iconName: 'alert-circle-outline',
            onPress: () => setErrorLogVisible(true),
            badge: errorCount > 0 ? errorCount : undefined,
          },
          {
            iconName: 'cog-outline',
            onPress: () =>
              navigation.navigate('MoreStack', {
                screen: 'SettingsStack',
                params: { screen: 'NetworkSettings' },
              }),
          },
          {
            iconName: 'reload',
            onPress: () =>
              ServiceManager.manager.addTask({ name: 'UPDATE_LIBRARY' }),
          },
        ]}
      />
      {error ? (
        <ErrorScreenV2 error={error} />
      ) : (
        <SectionList
          extraData={[updatesOverview.length]}
          ListHeaderComponent={
            showLastUpdateTime && lastUpdateTime ? (
              <LastUpdateTime lastUpdateTime={lastUpdateTime} theme={theme} />
            ) : null
          }
          contentContainerStyle={styles.listContainer}
          renderSectionHeader={({ section: { date } }) => (
            <Text style={[styles.dateHeader, { color: theme.onSurface }]}>
              {dayjs(date).calendar()}
            </Text>
          )}
          sections={updatesOverview
            .filter(v =>
              searchText
                ? v.novelName.toLowerCase().includes(searchText.toLowerCase())
                : true,
            )
            .reduce(
              (
                acc: { data: UpdateOverview[]; date: string }[],
                cur: UpdateOverview,
              ) => {
                if (acc.length === 0 || acc.at(-1)?.date !== cur.updateDate) {
                  acc.push({ data: [cur], date: cur.updateDate });
                  return acc;
                }
                acc.at(-1)?.data.push(cur);
                return acc;
              },
              [],
            )}
          keyExtractor={item => 'updatedGroup' + item.novelId}
          renderItem={({ item }) => (
            <Suspense fallback={<UpdatesSkeletonLoading theme={theme} />}>
              <UpdateNovelCard
                deleteChapter={chapter => {
                  deleteChapter(
                    chapter.pluginId,
                    chapter.novelId,
                    chapter.id,
                  ).then(() => {
                    showToast(
                      getString('common.deleted', {
                        name: chapter.name,
                      }),
                    );
                    getUpdates();
                  });
                }}
                chapterListInfo={item}
                descriptionText={getString('updatesScreen.updatesLower')}
              />
            </Suspense>
          )}
          ListEmptyComponent={
            <EmptyView
              icon="(˘･_･˘)"
              description={getString('updatesScreen.emptyView')}
              theme={theme}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() =>
                ServiceManager.manager.addTask({ name: 'UPDATE_LIBRARY' })
              }
              colors={[theme.onPrimary]}
              progressBackgroundColor={theme.primary}
            />
          }
        />
      )}
      <ErrorLogModal
        visible={errorLogVisible}
        onDismiss={() => setErrorLogVisible(false)}
        taskType="UPDATE_LIBRARY"
        theme={theme}
      />
    </SafeAreaView>
  );
};

export default memo(UpdatesScreen);

const LastUpdateTime: React.FC<{
  lastUpdateTime: Date | number | string;
  theme: ThemeColors;
}> = ({ lastUpdateTime, theme }) => (
  <Text style={[styles.lastUpdateTime, { color: theme.onSurface }]}>
    {`${getString('updatesScreen.lastUpdatedAt')} ${dayjs(
      lastUpdateTime,
    ).fromNow()}`}
  </Text>
);

const styles = StyleSheet.create({
  dateHeader: {
    paddingBottom: 2,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  lastUpdateTime: {
    fontSize: 12,
    fontStyle: 'italic',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  listContainer: {
    flexGrow: 1,
  },
  modal: {
    padding: 24,
    margin: 32,
    borderRadius: 8,
    elevation: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  flex1Text: {
    flex: 1,
  },
  input: {
    flex: 1,
    marginLeft: 8,
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
  },
});
