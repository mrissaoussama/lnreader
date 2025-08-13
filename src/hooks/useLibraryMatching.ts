import { useState, useEffect, useRef, useCallback } from 'react';
import { NovelInfo } from '@database/types';
import { NovelItem } from '@plugins/types';
import { MatchType, hasLibraryMatch as hasMatch } from '@utils/libraryMatching';
import { useBrowseSettings } from '@hooks/persisted';

type UseLibraryMatchingProps = {
  pluginId?: string;
  novel?: NovelInfo;
  novels?: NovelItem[] | NovelInfo[];
};

const isNovelInfo = (item: NovelInfo | NovelItem): item is NovelInfo => {
  return (item as NovelInfo).pluginId !== undefined;
};

export const useLibraryMatching = ({
  pluginId,
  novel,
  novels,
}: UseLibraryMatchingProps) => {
  const [matches, setMatches] = useState<Record<string, MatchType | false>>({});
  const [match, setMatch] = useState<MatchType | false>(false);
  const [loading, setLoading] = useState(true);

  const { novelMatching } = useBrowseSettings();
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();

  const findMatchForSingleNovel = useCallback(async () => {
    if (!novel) return;

    setLoading(true);
    const libraryRule = novelMatching?.libraryRule || 'normalized-contains';
    const matchResult = await hasMatch(
      novel.name,
      libraryRule,
      novel.pluginId,
      novel.path,
    );
    setMatch(matchResult);
    setLoading(false);
  }, [novel, novelMatching]);

  const findMatchesForNovelList = useCallback(
    (novelsToMatch: (NovelItem | NovelInfo)[], delay: number = 300) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(async () => {
        setLoading(true);
        const newMatches: Record<string, MatchType | false> = {};

        const batchSize = 10;
        for (let i = 0; i < novelsToMatch.length; i += batchSize) {
          const batch = novelsToMatch.slice(i, i + batchSize);
          const batchPromises = batch.map(async item => {
            if (isNovelInfo(item)) {
              const key = item.id;
              const libraryRule =
                novelMatching?.libraryRule || 'normalized-contains';
              const matchResult = await hasMatch(
                item.name,
                libraryRule,
                item.pluginId,
                item.path,
              );
              return { key, matchResult };
            } else {
              const key = item.path;
              const pluginRule =
                novelMatching?.pluginRule || 'normalized-contains';
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
          batchResults.forEach(({ key, matchResult }) => {
            newMatches[String(key)] = matchResult;
          });

          if (i + batchSize < novelsToMatch.length) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }

        setMatches(newMatches);
        setLoading(false);
      }, delay);
    },
    [pluginId, novelMatching],
  );

  useEffect(() => {
    if (novel) {
      findMatchForSingleNovel();
    } else if (novels && novels.length > 0) {
      findMatchesForNovelList(novels);
    } else {
      setMatches({});
      setMatch(false);
      setLoading(false);
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [novel, novels, findMatchForSingleNovel, findMatchesForNovelList]);

  return { match, matches, loading };
};
