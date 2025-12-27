import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
} from 'react-native';
import {
  FAB,
  ProgressBar,
  Appbar as MaterialAppbar,
  Menu,
  overlay,
  IconButton,
} from 'react-native-paper';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import { useTheme } from '@hooks/persisted';

import { showToast } from '../../utils/showToast';
import { getString } from '@strings/translations';
import { Appbar, EmptyView, SafeAreaView } from '@components';
import { TaskQueueScreenProps } from '@navigators/types';
import ServiceManager, {
  QueuedBackgroundTask,
  DownloadChapterTask,
} from '@services/ServiceManager';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { groupBy } from 'lodash-es';
import { getPlugin } from '@plugins/pluginManager';
import { defaultCover } from '@plugins/helpers/constants';
import { getNovelById } from '@database/queries/NovelQueries';

// Pause helpers - use simple storage keys without hooks to avoid stack overflow
// Cache the paused sets to avoid repeated MMKV reads
let cachedPausedPlugins: Set<string> | null = null;
let cachedPausedNovels: Set<number> | null = null;
let lastPauseCacheTime = 0;
const PAUSE_CACHE_TTL = 500; // Cache for 500ms to reduce MMKV reads

const getPausedPlugins = (): Set<string> => {
  const now = Date.now();
  if (cachedPausedPlugins && now - lastPauseCacheTime < PAUSE_CACHE_TTL) {
    return new Set(cachedPausedPlugins);
  }
  try {
    cachedPausedPlugins = new Set<string>(
      JSON.parse(MMKVStorage.getString('DOWNLOAD_PAUSED_PLUGINS') || '[]'),
    );
    lastPauseCacheTime = now;
    return new Set(cachedPausedPlugins);
  } catch {
    cachedPausedPlugins = new Set();
    return new Set();
  }
};

const setPausedPlugins = (set: Set<string>) => {
  cachedPausedPlugins = new Set(set);
  lastPauseCacheTime = Date.now();
  MMKVStorage.set('DOWNLOAD_PAUSED_PLUGINS', JSON.stringify(Array.from(set)));
};

const getPausedNovels = (): Set<number> => {
  const now = Date.now();
  if (cachedPausedNovels && now - lastPauseCacheTime < PAUSE_CACHE_TTL) {
    return new Set(cachedPausedNovels);
  }
  try {
    cachedPausedNovels = new Set<number>(
      JSON.parse(MMKVStorage.getString('DOWNLOAD_PAUSED_NOVELS') || '[]'),
    );
    lastPauseCacheTime = now;
    return new Set(cachedPausedNovels);
  } catch {
    cachedPausedNovels = new Set();
    return new Set();
  }
};

const setPausedNovels = (set: Set<number>) => {
  cachedPausedNovels = new Set(set);
  lastPauseCacheTime = Date.now();
  MMKVStorage.set('DOWNLOAD_PAUSED_NOVELS', JSON.stringify(Array.from(set)));
};

// Collapsible chapter list with virtualization for performance
const ChapterList = React.memo(
  ({
    tasks,
    theme,
    onRemove,
  }: {
    tasks: QueuedBackgroundTask[];
    theme: any;
    onRemove: (chapterId: number) => void;
  }) => {
    // Only show chapters that are currently downloading (isRunning = true)
    const downloadingTasks = tasks.filter(t => t.meta.isRunning);

    if (downloadingTasks.length === 0) {
      return null;
    }

    return (
      <FlatList
        data={downloadingTasks}
        keyExtractor={t => t.id}
        scrollEnabled={false}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={3}
        removeClippedSubviews={true}
        renderItem={({ item: t }) => {
          const data = (t.task as DownloadChapterTask).data;
          const chapterProgress = t.meta.progress ?? 0;
          return (
            <View style={styles.chapterRow}>
              <View style={styles.flex1}>
                <Text
                  style={[
                    styles.chapterText,
                    { color: theme.onSurfaceVariant },
                  ]}
                  numberOfLines={1}
                >
                  {t.meta.progressText || data.chapterName}
                </Text>
                <ProgressBar
                  indeterminate={
                    t.meta.isRunning && t.meta.progress === undefined
                  }
                  progress={chapterProgress}
                  color={theme.primary}
                  style={[
                    { backgroundColor: theme.surface3 || theme.surface2 },
                    styles.progressBarSmall,
                  ]}
                />
              </View>
              <IconButton
                icon="close"
                size={16}
                onPress={() => onRemove(data.chapterId)}
              />
            </View>
          );
        }}
      />
    );
  },
);

// Novel group component
const NovelGroup = React.memo(
  ({
    novelId,
    tasks,
    pluginId,
    theme,
    pausedNovels,
    expandedNovels,
    onToggle,
    onPause,
    onRemove,
    onChapterRemove,
  }: {
    novelId: number;
    tasks: QueuedBackgroundTask[];
    pluginId: string;
    theme: any;
    pausedNovels: Set<number>;
    expandedNovels: Record<string, boolean>;
    onToggle: (key: string) => void;
    onPause: (novelId: number, pause: boolean) => void;
    onRemove: (novelId: number) => void;
    onChapterRemove: (chapterId: number) => void;
  }) => {
    const [novelCover, setNovelCover] = useState(defaultCover);

    useEffect(() => {
      if (tasks.length === 0) return;

      const data = (tasks[0].task as DownloadChapterTask).data;
      if (data.novelCover) {
        setNovelCover(data.novelCover);
      } else {
        getNovelById(novelId).then(novel => {
          if (novel?.cover) {
            setNovelCover(novel.cover);
          }
        });
      }
    }, [tasks, novelId]);

    if (tasks.length === 0) {
      return null;
    }

    const novelData = (tasks[0].task as DownloadChapterTask).data;
    const novelName = novelData.novelName;
    const isNPaused = pausedNovels.has(novelId);
    const key = pluginId + ':' + novelId;
    const isExpanded = expandedNovels[key];

    const completedInNovel = tasks.filter(
      t => t.meta.progress === 1 && !t.meta.isRunning,
    ).length;
    const totalInNovel = tasks.length;
    const novelProgress =
      totalInNovel > 0 ? completedInNovel / totalInNovel : 0;

    return (
      <View style={[styles.novelCtn, { backgroundColor: theme.surface2 }]}>
        <Pressable
          onPress={() => onToggle(key)}
          android_ripple={{ color: theme.rippleColor }}
          style={styles.groupHeader}
        >
          <View style={styles.contentRow}>
            <MaterialCommunityIcons
              name={isExpanded ? 'chevron-down' : 'chevron-right'}
              size={20}
              color={theme.onSurfaceVariant}
            />
            <Image source={{ uri: novelCover }} style={styles.novelCover} />
            <View style={styles.flex1}>
              <Text
                style={[styles.novelTitle, { color: theme.onSurface }]}
                numberOfLines={1}
              >
                {novelName}
              </Text>
              <Text
                style={[styles.smallText, { color: theme.onSurfaceVariant }]}
              >
                {totalInNovel} chapters
              </Text>
            </View>
            <View style={styles.iconRow}>
              <IconButton
                icon={isNPaused ? 'play' : 'pause'}
                size={18}
                onPress={e => {
                  e?.stopPropagation?.();
                  onPause(novelId, !isNPaused);
                }}
              />
              <IconButton
                icon="close"
                size={18}
                onPress={e => {
                  e?.stopPropagation?.();
                  onRemove(novelId);
                }}
              />
            </View>
          </View>
        </Pressable>
        <ProgressBar
          indeterminate={false}
          progress={novelProgress}
          color={theme.primary}
          style={styles.progressBar}
        />
        {isExpanded && (
          <ChapterList tasks={tasks} theme={theme} onRemove={onChapterRemove} />
        )}
      </View>
    );
  },
);

// Plugin group component
const PluginGroup = React.memo(
  ({
    pluginId,
    pluginTasks,
    theme,
    pausedPlugins,
    pausedNovels,
    expandedPlugins,
    expandedNovels,
    onTogglePlugin,
    onToggleNovel,
    onPausePlugin,
    onPauseNovel,
    onRemovePlugin,
    onRemoveNovel,
    onRemoveChapter,
  }: any) => {
    const [pluginIcon, setPluginIcon] = useState<string | null>(null);
    const [pluginName, setPluginName] = useState<string>(pluginId);

    // Load plugin data
    useEffect(() => {
      const plugin = getPlugin(pluginId);
      if (plugin) {
        setPluginIcon(plugin.iconUrl || null);
        setPluginName(plugin.name || pluginId);
      }
    }, [pluginId]);

    const byNovel = useMemo(
      () =>
        groupBy(
          pluginTasks,
          (t: QueuedBackgroundTask) =>
            (t.task as DownloadChapterTask).data.novelId,
        ),
      [pluginTasks],
    );

    // Count only active (not completed) chapters for progress
    const activeChapters = pluginTasks.filter(
      (t: QueuedBackgroundTask) =>
        // A chapter is active if it hasn't completed yet OR if it's still running
        t.meta.progress !== 1 || t.meta.isRunning,
    );

    const completedInActive = pluginTasks.filter(
      (t: QueuedBackgroundTask) =>
        // A chapter is completed if progress is 1 AND not running
        t.meta.progress === 1 && !t.meta.isRunning,
    ).length;

    const totalActiveChapters = activeChapters.length; // Total active chapters in queue

    // Filter out completed novels from display
    const activeNovelIds = Object.keys(byNovel).filter(novelIdStr => {
      const tasks = byNovel[novelIdStr];
      return !tasks.every(t => t.meta.progress === 1 && !t.meta.isRunning);
    });

    const isPaused = pausedPlugins.has(pluginId);
    const isExpanded = expandedPlugins[pluginId];

    const totalNovels = Object.keys(byNovel).length;
    const pluginProgress =
      totalActiveChapters > 0 ? completedInActive / totalActiveChapters : 0;

    return (
      <View style={[styles.groupCtn, { backgroundColor: theme.surface }]}>
        <Pressable
          onPress={() => onTogglePlugin(pluginId)}
          android_ripple={{ color: theme.rippleColor }}
          style={styles.groupHeader}
        >
          <View style={styles.contentRow}>
            <MaterialCommunityIcons
              name={isExpanded ? 'chevron-down' : 'chevron-right'}
              size={20}
              color={theme.onSurfaceVariant}
            />
            {pluginIcon ? (
              <Image source={{ uri: pluginIcon }} style={styles.pluginIcon} />
            ) : null}
            <View style={styles.flex1}>
              <Text
                style={[styles.pluginTitle, { color: theme.onSurface }]}
                numberOfLines={1}
              >
                {pluginName}
              </Text>
              <Text
                style={[styles.smallText, { color: theme.onSurfaceVariant }]}
              >
                {totalNovels} {totalNovels === 1 ? 'novel' : 'novels'} •{' '}
                {totalActiveChapters} chapters
              </Text>
            </View>
            <View style={styles.iconRow}>
              <IconButton
                icon={isPaused ? 'play' : 'pause'}
                size={18}
                onPress={e => {
                  e?.stopPropagation?.();
                  onPausePlugin(pluginId, !isPaused);
                }}
              />
              <IconButton
                icon="close"
                size={18}
                onPress={e => {
                  e?.stopPropagation?.();
                  onRemovePlugin(pluginId);
                }}
              />
            </View>
          </View>
        </Pressable>
        <ProgressBar
          progress={pluginProgress}
          color={theme.primary}
          style={[{ backgroundColor: theme.surface2 }, styles.progressBarThick]}
        />
        {isExpanded && (
          <View style={styles.nestedContainer}>
            {activeNovelIds.map(novelIdStr => {
              const novelId = Number(novelIdStr);
              const tasks = byNovel[novelIdStr];
              return (
                <NovelGroup
                  key={novelIdStr}
                  novelId={novelId}
                  tasks={tasks}
                  pluginId={pluginId}
                  theme={theme}
                  pausedNovels={pausedNovels}
                  expandedNovels={expandedNovels}
                  onToggle={onToggleNovel}
                  onPause={onPauseNovel}
                  onRemove={onRemoveNovel}
                  onChapterRemove={onRemoveChapter}
                />
              );
            })}
          </View>
        )}
      </View>
    );
  },
);

const TaskQueue = ({ navigation }: TaskQueueScreenProps) => {
  const theme = useTheme();
  const { bottom, right } = useSafeAreaInsets();

  const [taskQueue, setTaskQueue] = useState(
    ServiceManager.manager.getTaskList(),
  );
  const [isRunning, setIsRunning] = useState(ServiceManager.manager.isRunning);
  const [isPaused, setIsPaused] = useState(false);
  const [visible, setVisible] = useState(false);

  const [expandedPlugins, setExpandedPlugins] = useState<
    Record<string, boolean>
  >({});
  const [expandedNovels, setExpandedNovels] = useState<Record<string, boolean>>(
    {},
  );
  const [pausedPlugins, setPausedPluginsState] = useState(getPausedPlugins());
  const [pausedNovels, setPausedNovelsState] = useState(getPausedNovels());

  useEffect(() => {
    const onQueueChange = (newQueue: QueuedBackgroundTask[]) => {
      setTaskQueue(newQueue);
      // Always sync isRunning state from ServiceManager
      // Consider service running if isRunning OR isStarting (to avoid flicker)
      const running = ServiceManager.manager.isRunning || ServiceManager.manager.isStartingState;
      setIsRunning(running);
      // Check if paused via public getter
      setIsPaused(ServiceManager.manager.isPausedState || false);
    };

    const unsubscribe = ServiceManager.manager.observeQueue(onQueueChange);

    // Initial state sync
    onQueueChange(ServiceManager.manager.getTaskList());

    // Poll for pause state changes (for when pause is triggered from notification)
    const pollInterval = setInterval(() => {
      // Consider service running if isRunning OR isStarting (to avoid flicker)
      const running = ServiceManager.manager.isRunning || ServiceManager.manager.isStartingState;
      const paused = ServiceManager.manager.isPausedState || false;
      setIsRunning(running);
      setIsPaused(paused);
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, []);

  const downloadTasks = useMemo(
    () => taskQueue.filter(t => t.task.name === 'DOWNLOAD_CHAPTER'),
    [taskQueue],
  );

  const otherTasks = useMemo(
    () =>
      taskQueue.filter(
        t =>
          t.task.name !== 'DOWNLOAD_CHAPTER' &&
          t.task.name !== 'DOWNLOAD_NOVEL',
      ),
    [taskQueue],
  );

  // DOWNLOAD_NOVEL tasks shown separately in "Other" section with better labeling
  const downloadNovelTasks = useMemo(
    () => taskQueue.filter(t => t.task.name === 'DOWNLOAD_NOVEL'),
    [taskQueue],
  );

  const byPlugin = useMemo(
    () =>
      groupBy(
        downloadTasks,
        q => (q.task as DownloadChapterTask).data.pluginId,
      ),
    [downloadTasks],
  );

  const togglePlugin = useCallback((pluginId: string) => {
    setExpandedPlugins(s => ({ ...s, [pluginId]: !s[pluginId] }));
  }, []);

  const toggleNovel = useCallback((key: string) => {
    setExpandedNovels(s => ({ ...s, [key]: !s[key] }));
  }, []);

  const pausePlugin = useCallback(
    (pluginId: string, pause: boolean) => {
      // Offload to next frame to avoid UI freeze
      requestAnimationFrame(() => {
        const pluginSet = getPausedPlugins();
        const novelSet = getPausedNovels();

        if (pause) {
          pluginSet.add(pluginId);
          // Batch collect novel IDs without looping through tasks multiple times
          const novelIds = new Set<number>();
          downloadTasks.forEach(task => {
            const data = (task.task as DownloadChapterTask).data;
            if (data.pluginId === pluginId) {
              novelIds.add(data.novelId);
            }
          });
          novelIds.forEach(id => novelSet.add(id));
        } else {
          pluginSet.delete(pluginId);
          // Batch collect novel IDs
          const novelIds = new Set<number>();
          downloadTasks.forEach(task => {
            const data = (task.task as DownloadChapterTask).data;
            if (data.pluginId === pluginId) {
              novelIds.add(data.novelId);
            }
          });
          novelIds.forEach(id => novelSet.delete(id));

          // Resume the service if it's not running
          if (!ServiceManager.manager.isRunning) {
            ServiceManager.manager.resume();
          }
        }

        // Single batch write to MMKV
        setPausedPlugins(pluginSet);
        setPausedNovels(novelSet);
        setPausedPluginsState(new Set(pluginSet));
        setPausedNovelsState(new Set(novelSet));
      });
    },
    [downloadTasks],
  );

  const pauseNovel = useCallback((novelId: number, pause: boolean) => {
    // Offload to next frame to avoid UI freeze
    requestAnimationFrame(() => {
      const set = getPausedNovels();
      if (pause) {
        set.add(novelId);
      } else {
        set.delete(novelId);
        // Resume the service if it's not running
        if (!ServiceManager.manager.isRunning) {
          ServiceManager.manager.resume();
        }
      }
      setPausedNovels(set);
      setPausedNovelsState(new Set(set));
    });
  }, []);

  const removeChapter = useCallback((chapterId: number) => {
    requestAnimationFrame(() => {
      try {
        ServiceManager.manager.removeDownloadTaskByChapterId(chapterId);
      } catch {}
    });
  }, []);

  const removeNovel = useCallback((novelId: number) => {
    requestAnimationFrame(() => {
      try {
        ServiceManager.manager.removeDownloads(
          t => (t.task as DownloadChapterTask).data?.novelId === novelId,
        );
      } catch {}
    });
  }, []);

  const removePlugin = useCallback((pluginId: string) => {
    requestAnimationFrame(() => {
      try {
        ServiceManager.manager.removeDownloads(
          t => (t.task as DownloadChapterTask).data?.pluginId === pluginId,
        );
      } catch {}
    });
  }, []);

  const openMenu = () => setVisible(true);
  const closeMenu = () => setVisible(false);

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={'Task Queue'}
        handleGoBack={navigation.goBack}
        theme={theme}
      >
        <Menu
          visible={visible}
          onDismiss={closeMenu}
          anchor={
            taskQueue?.length ? (
              <MaterialAppbar.Action
                icon="dots-vertical"
                iconColor={theme.onSurface}
                onPress={openMenu}
              />
            ) : null
          }
          contentStyle={{ backgroundColor: overlay(2, theme.surface) }}
        >
          <Menu.Item
            onPress={() => {
              try {
                // Close menu first to avoid UI freeze
                closeMenu();
                setTimeout(() => {
                  ServiceManager.manager.removeDownloads(
                    t => t.task.name === 'DOWNLOAD_CHAPTER',
                  );
                  showToast('All downloads removed');
                }, 0);
              } catch {}
            }}
            title="Remove Downloads"
            titleStyle={{ color: theme.onSurface }}
          />
          <Menu.Item
            onPress={() => {
              try {
                // Close menu first to avoid UI freeze
                closeMenu();
                setTimeout(() => {
                  const queue = ServiceManager.manager.getTaskList();
                  const otherTaskNames = [
                    ...new Set(
                      queue
                        .filter(t => t.task.name !== 'DOWNLOAD_CHAPTER')
                        .map(t => t.task.name),
                    ),
                  ];
                  otherTaskNames.forEach(name => {
                    ServiceManager.manager.removeTasksByName(name);
                  });
                  showToast('All other tasks removed');
                }, 0);
              } catch {}
            }}
            title="Remove Other Tasks"
            titleStyle={{ color: theme.onSurface }}
          />
          <Menu.Item
            onPress={() => {
              try {
                // Close menu first to avoid UI freeze
                closeMenu();
                setTimeout(() => {
                  // Clear all tasks first
                  ServiceManager.manager.clearTaskList();
                  // Then stop the service
                  ServiceManager.manager.stop();
                  setIsRunning(false); // Immediately update UI
                  showToast(getString('downloadScreen.cancelled'));
                }, 100);
              } catch {}
            }}
            title="Cancel All"
            titleStyle={{ color: theme.onSurface }}
          />
        </Menu>
      </Appbar>

      <FlatList
        contentContainerStyle={styles.paddingBottom}
        ListHeaderComponent={
          <>
            {downloadTasks.length > 0 && (
              <View>
                <Text
                  style={[
                    styles.sectionHeader,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  Download Queue ({downloadTasks.length})
                </Text>
                <View style={styles.queueGroupContainer}>
                  {Object.keys(byPlugin).map(pluginId => (
                    <PluginGroup
                      key={pluginId}
                      pluginId={pluginId}
                      pluginTasks={byPlugin[pluginId]}
                      theme={theme}
                      pausedPlugins={pausedPlugins}
                      pausedNovels={pausedNovels}
                      expandedPlugins={expandedPlugins}
                      expandedNovels={expandedNovels}
                      onTogglePlugin={togglePlugin}
                      onToggleNovel={toggleNovel}
                      onPausePlugin={pausePlugin}
                      onPauseNovel={pauseNovel}
                      onRemovePlugin={removePlugin}
                      onRemoveNovel={removeNovel}
                      onRemoveChapter={removeChapter}
                    />
                  ))}
                </View>
              </View>
            )}

            {(downloadNovelTasks.length > 0 || otherTasks.length > 0) && (
              <View>
                <Text
                  style={[
                    styles.sectionHeader,
                    { color: theme.onSurfaceVariant },
                  ]}
                >
                  {downloadNovelTasks.length > 0 && otherTasks.length > 0
                    ? `Bulk Downloads & Other Tasks (${
                        downloadNovelTasks.length + otherTasks.length
                      })`
                    : downloadNovelTasks.length > 0
                    ? `Bulk Downloads (${downloadNovelTasks.length})`
                    : `Other Tasks (${otherTasks.length})`}
                </Text>
              </View>
            )}
          </>
        }
        keyExtractor={(item, index) => 'task_' + index}
        data={[...downloadNovelTasks, ...otherTasks]}
        renderItem={({ item }) => (
          <View
            style={[styles.otherTaskCard, { backgroundColor: theme.surface }]}
          >
            <View style={styles.taskHeader}>
              <View style={styles.flex1}>
                <Text style={[styles.taskName, { color: theme.onSurface }]}>
                  {item.meta.name}
                </Text>
                {item.meta.progressText ? (
                  <Text
                    style={[
                      styles.smallText,
                      { color: theme.onSurfaceVariant },
                    ]}
                  >
                    {item.meta.progressText}
                  </Text>
                ) : null}
              </View>
              <View style={styles.iconRow}>
                {/* Prioritize button - move task to front */}
                <IconButton
                  icon="arrow-up-bold"
                  size={18}
                  iconColor={theme.onSurfaceVariant}
                  onPress={() => {
                    try {
                      ServiceManager.manager.prioritizeTask(item.id);
                      showToast('Task moved to front');
                    } catch (e) {}
                  }}
                  disabled={item.meta.isRunning}
                />
                {/* Remove button */}
                <IconButton
                  icon="close"
                  size={18}
                  iconColor={theme.onSurfaceVariant}
                  onPress={() => {
                    try {
                      ServiceManager.manager.removeTaskById(item.id);
                      showToast('Task removed');
                    } catch (e) {}
                  }}
                />
              </View>
            </View>
            <ProgressBar
              indeterminate={
                item.meta.isRunning && item.meta.progress === undefined
              }
              progress={item.meta.progress ?? 0}
              color={theme.primary}
              style={[{ backgroundColor: theme.surface2 }, styles.marginTop]}
            />
          </View>
        )}
        ListEmptyComponent={
          downloadTasks.length === 0 ? (
            <EmptyView
              icon="(･o･;)"
              description={'No running tasks'}
              theme={theme}
            />
          ) : null
        }
      />
      {taskQueue && taskQueue.length > 0 ? (
        <FAB
          style={[
            styles.fab,
            { backgroundColor: theme.primary, bottom, right },
          ]}
          color={theme.onPrimary}
          label={
            // Show Resume if paused OR not running, otherwise show Pause
            (isPaused || !isRunning) ? getString('common.resume') : getString('common.pause')
          }
          uppercase={false}
          icon={(isPaused || !isRunning) ? 'play' : 'pause'}
          onPress={() => {
            if (isRunning && !isPaused) {
              console.log('[TaskQueue] Pausing...');
              ServiceManager.manager.pause();
              setIsPaused(true);
            } else {
              console.log('[TaskQueue] Resuming... isRunning:', isRunning, 'isPaused:', isPaused);
              // Clear all paused plugins and novels before resuming
              MMKVStorage.set('DOWNLOAD_PAUSED_PLUGINS', '[]');
              MMKVStorage.set('DOWNLOAD_PAUSED_NOVELS', '[]');
              // Also clear the cache
              cachedPausedPlugins = new Set();
              cachedPausedNovels = new Set();
              lastPauseCacheTime = 0;
              setPausedPluginsState(new Set());
              setPausedNovelsState(new Set());

              // Resume the service
              ServiceManager.manager.resume();
              setIsPaused(false);
              setIsRunning(true); // Optimistically set running to true

              // Poll for running state since BackgroundService.isRunning() may not update immediately
              const checkRunning = () => {
                const running = ServiceManager.manager.isRunning || ServiceManager.manager.isStartingState;
                const paused = ServiceManager.manager.isPausedState || false;
                console.log('[TaskQueue] checkRunning poll: running=', running, 'paused=', paused, 'isStarting=', ServiceManager.manager.isStartingState);
                setIsRunning(running);
                setIsPaused(paused);
                if (!running && ServiceManager.manager.getTaskCount() > 0) {
                  // Service not running yet but tasks exist, check again
                  setTimeout(checkRunning, 300);
                }
              };
              setTimeout(checkRunning, 200);
            }
          }}
        />
      ) : null}
    </SafeAreaView>
  );
};

export default TaskQueue;

const styles = StyleSheet.create({
  fab: {
    bottom: 16,
    margin: 16,
    position: 'absolute',
    right: 0,
  },
  marginTop: { marginTop: 8 },
  paddingBottom: { paddingBottom: 100, flexGrow: 1 },
  padding: { padding: 16 },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  queueGroupContainer: {
    marginTop: 8,
  },
  groupCtn: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  groupHeader: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  pluginTitle: {
    fontWeight: '600',
  },
  smallText: {
    fontSize: 12,
  },
  novelTitle: {
    fontWeight: '500',
  },
  progressBar: {
    backgroundColor: 'transparent',
    height: 2,
  },
  progressBarSmall: {
    height: 2,
    marginTop: 4,
  },
  progressBarThick: {
    height: 3,
  },
  nestedContainer: {
    paddingLeft: 8,
  },
  novelCtn: { marginHorizontal: 8, marginBottom: 6, borderRadius: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  chapterText: {
    flex: 1,
  },
  pluginIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  novelCover: {
    width: 40,
    height: 56,
    borderRadius: 4,
  },
  flex1: {
    flex: 1,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  otherTaskCard: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    paddingBottom: 0,
  },
  taskName: {
    fontWeight: '500',
  },
});
