import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { NovelInfo } from '@database/types';
import { NovelItem } from '@plugins/types';
import { MatchType, hasLibraryMatch as hasMatch } from '@utils/libraryMatching';
import { useAppSettings } from '@hooks/persisted';
import { normalizePath } from '@utils/urlUtils';

type UseLibraryMatchingProps = {
  pluginId?: string;
  novel?: NovelInfo;
  novels?: NovelItem[] | NovelInfo[];
};

const isNovelInfo = (item: NovelInfo | NovelItem): item is NovelInfo => {
  return (item as NovelInfo).pluginId !== undefined;
};

// Get a consistent key for matching - use normalized path for NovelItem
const getMatchKey = (item: NovelInfo | NovelItem): string => {
  if (isNovelInfo(item)) {
    return String(item.id);
  }
  return normalizePath(item.path || '');
};

export const useLibraryMatching = ({
  pluginId,
  novel,
  novels,
}: UseLibraryMatchingProps) => {
  const [matches, setMatches] = useState<Record<string, MatchType | false>>({});
  const [match, setMatch] = useState<MatchType | false>(false);
  const [loading, setLoading] = useState(true);

  const { novelMatching } = useAppSettings();
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  // Track which items have been processed to avoid reprocessing
  const processedKeysRef = useRef<Set<string>>(new Set());

  // Create a stable key for the novels array to avoid unnecessary re-renders
  const novelsKey = useMemo(() => {
    if (!novels || novels.length === 0) return '';
    return novels.map(n => getMatchKey(n)).join(',');
  }, [novels]);

  const findMatchForSingleNovel = useCallback(async () => {
    if (!novel) return;

    setLoading(true);
    const libraryRule = novelMatching?.libraryRule || 'normalized-contains';
    const matchResult = await hasMatch(
      novel.name,
      libraryRule,
      novel.pluginId,
      novel.path,
      [],
      novel.id,
    );
    setMatch(matchResult);
    setLoading(false);
  }, [novel, novelMatching]);

  const findMatchesForNovelList = useCallback(
    (novelsToMatch: (NovelItem | NovelInfo)[], delay: number = 100) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(async () => {
        // Filter to only process items that haven't been processed yet
        const unprocessedNovels = novelsToMatch.filter(item => {
          const key = getMatchKey(item);
          return !processedKeysRef.current.has(key);
        });

        if (unprocessedNovels.length === 0) {
          setLoading(false);
          return;
        }

        setLoading(true);

        const batchSize = 10;
        for (let i = 0; i < unprocessedNovels.length; i += batchSize) {
          const batch = unprocessedNovels.slice(i, i + batchSize);
          const batchPromises = batch.map(async item => {
            const key = getMatchKey(item);

            if (isNovelInfo(item)) {
              const libraryRule =
                novelMatching?.libraryRule || 'normalized-contains';

              // Find matches with OTHER novels in the library
              const matchResult = await hasMatch(
                item.name,
                libraryRule,
                item.pluginId,
                item.path,
                [],
                item.id,
              );
              return { key, matchResult };
            } else {
              const pluginRule =
                novelMatching?.pluginRule || 'normalized-contains';

              // For NovelItem, check if it matches something in the library
              const matchResult = await hasMatch(
                item.name,
                pluginRule,
                pluginId,
                item.path,
                item.altNames,
              );
              return { key, matchResult };
            }
          });

          const batchResults = await Promise.all(batchPromises);

          // Accumulate matches and track processed keys
          setMatches(prev => {
            const updated = { ...prev };
            batchResults.forEach(({ key, matchResult }) => {
              updated[key] = matchResult;
              processedKeysRef.current.add(key);
            });
            return updated;
          });

          if (i + batchSize < unprocessedNovels.length) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }

        setLoading(false);
      }, delay);
    },
    [pluginId, novelMatching],
  );

  useEffect(() => {
    if (!novelMatching?.enabled) {
      setMatches({});
      setMatch(false);
      processedKeysRef.current.clear();
      setLoading(false);
      return;
    }

    if (novel) {
      findMatchForSingleNovel();
    } else if (novels && novels.length > 0) {
      findMatchesForNovelList(novels);
    } else {
      setLoading(false);
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
    // Use novelsKey for stable dependency instead of novels array reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    novel,
    novelsKey,
    findMatchForSingleNovel,
    findMatchesForNovelList,
    novelMatching?.enabled,
  ]);

  return { match, matches, loading };
};
