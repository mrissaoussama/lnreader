import { LibraryFilter } from '@screens/library/constants/constants';
import { LibraryNovelInfo, NovelInfo } from '../types';
import {
  getAllAsync,
  getAllSync,
  getFirstAsync,
  getFirstSync,
  runAsync,
} from '../utils/helpers';
import { MatchingRule } from '@utils/libraryMatching';

// Normalize title for database comparison
const normalizeForDb = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim();
};

// Validate that a title has meaningful content (at least 2 characters after normalization)
const isValidTitle = (title: string): boolean => {
  if (!title || typeof title !== 'string') return false;
  const trimmed = title.trim();
  if (trimmed.length === 0) return false;
  // For normalized matching, check that there's actual content after removing special chars
  const normalized = normalizeForDb(trimmed);
  return normalized.length >= 2; // Require at least 2 characters to avoid false positives
};

/**
 * Finds matching novels of the passed titles using the rule provided, can exclude by plugin and path.
 * Handles both main titles and alternative titles with proper sanitization
 */
export const findLibraryMatchesAsync = async (
  searchTitle: string,
  searchTitleAlternatives: string[] = [],
  rule: MatchingRule = 'normalized-contains',
  excludePluginId?: string,
  excludePath?: string,
  excludeNovelId?: number,
): Promise<
  Array<{
    id: number;
    name: string;
    author?: string;
    pluginId: string;
    path: string;
    cover?: string;
    status?: string;
    chaptersDownloaded: number;
    chaptersUnread: number;
    totalChapters: number;
    alternativeTitles?: string[];
    matchType: 'title';
  }>
> => {
  // If no alternatives provided, try to enrich from DB for the current (excluded) novel
  let enrichedAlts = searchTitleAlternatives || [];
  if (
    (!enrichedAlts || enrichedAlts.length === 0) &&
    (excludeNovelId != null || (excludePluginId && excludePath))
  ) {
    try {
      let novelIdToFetch = excludeNovelId;
      if (novelIdToFetch == null && excludePluginId && excludePath) {
        const row = await getFirstAsync<{ id: number }>([
          'SELECT id FROM Novel WHERE pluginId = ? AND path = ?',
          [excludePluginId, excludePath],
        ]);
        novelIdToFetch = row?.id;
      }
      if (novelIdToFetch != null) {
        const rows = await getAllAsync<{ title: string }>([
          'SELECT title FROM AlternativeTitle WHERE novelId = ?',
          [novelIdToFetch],
        ]);
        enrichedAlts = rows?.map(r => r.title).filter(Boolean) || [];
      }
    } catch {}
  }
  const allSearchTitles = [searchTitle, ...enrichedAlts];

  // Validate and filter titles - reject invalid titles early
  const validTitles = allSearchTitles.filter(isValidTitle);
  if (validTitles.length === 0) {
    return [];
  }

  const preparedTitles = validTitles
    .map(title => {
      const lowerTitle = (title ?? '').toLowerCase();
      if (rule.includes('normalized')) {
        return normalizeForDb(lowerTitle);
      }
      return lowerTitle.trim();
    })
    .filter(t => t.length >= 2); // Double-check after normalization

  if (preparedTitles.length === 0) {
    return [];
  }

  const getDbColumnExpr = (col: string) => {
    if (rule.includes('normalized')) {
      // Remove common special characters: space, hyphen, underscore, dot, comma, apostrophe, colon, exclamation, question
      return `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${col}), ' ', ''), '-', ''), '_', ''), '.', ''), ',', ''), '''', ''), ':', ''), '!', ''), '?', '')`;
    }
    return `LOWER(${col})`;
  };
  const dbNameCol = getDbColumnExpr('n.name');
  const dbAltTitleCol = getDbColumnExpr('at.title');

  // Add SQL-level validation to ensure we don't match empty or too-short titles
  const minLengthCheck = rule.includes('normalized')
    ? `LENGTH(${dbNameCol}) >= 2`
    : `LENGTH(TRIM(${dbNameCol})) >= 2`;

  const createConditions = (titlePlaceholder: string) => {
    switch (rule) {
      case 'exact':
      case 'normalized-exact':
        return {
          main: `${dbNameCol} = ${titlePlaceholder} AND ${minLengthCheck}`,
          alt: `EXISTS (SELECT 1 FROM AlternativeTitle at WHERE at.novelId = n.id AND ${dbAltTitleCol} = ${titlePlaceholder} AND LENGTH(${dbAltTitleCol}) >= 2)`,
        };
      case 'contains':
      case 'normalized-contains':
        // For contains, check if the library title contains the search term OR the search term contains the library title
        return {
          main: `((${dbNameCol} LIKE '%' || ${titlePlaceholder} || '%' OR ${titlePlaceholder} LIKE '%' || ${dbNameCol} || '%') AND ${minLengthCheck})`,
          alt: `EXISTS (SELECT 1 FROM AlternativeTitle at WHERE at.novelId = n.id AND (${dbAltTitleCol} LIKE '%' || ${titlePlaceholder} || '%' OR ${titlePlaceholder} LIKE '%' || ${dbAltTitleCol} || '%') AND LENGTH(${dbAltTitleCol}) >= 2)`,
        };
      default:
        return { main: '1=0', alt: '1=0' };
    }
  };

  const mainTitleConditions = preparedTitles
    .map(() => createConditions('?').main)
    .join(' OR ');
  const altTitleConditions = preparedTitles
    .map(() => createConditions('?').alt)
    .join(' OR ');
  const whereCondition = `((${mainTitleConditions}) OR (${altTitleConditions}))`;

  let where = `n.inLibrary = 1 AND ${whereCondition}`;
  const hasExcludeId = excludeNovelId != null;
  const hasExcludePair = !!(excludePluginId && excludePath);
  if (hasExcludeId) {
    where += ' AND n.id <> ?';
  }
  if (hasExcludePair) {
    where += ' AND NOT (n.pluginId = ? AND n.path = ?)';
  }

  const query = `
    SELECT n.id, n.name, n.author, n.pluginId, n.path, n.cover, n.status,
           COALESCE(downloaded.count, 0) as chaptersDownloaded,
           COALESCE(unread.count, 0) as chaptersUnread,
           COALESCE(total.count, 0) as totalChapters,
           GROUP_CONCAT(altAgg.title, '\u0001') AS altTitlesCsv
    FROM Novel n
    LEFT JOIN (
      SELECT novelId, COUNT(*) as count 
      FROM Chapter 
      WHERE isDownloaded = 1 
      GROUP BY novelId
    ) downloaded ON n.id = downloaded.novelId
    LEFT JOIN (
      SELECT novelId, COUNT(*) as count 
      FROM Chapter 
      WHERE unread = 1 
      GROUP BY novelId
    ) unread ON n.id = unread.novelId
    LEFT JOIN (
      SELECT novelId, COUNT(*) as count 
      FROM Chapter 
      GROUP BY novelId
    ) total ON n.id = total.novelId
    LEFT JOIN AlternativeTitle altAgg ON altAgg.novelId = n.id
    WHERE ${where}
    GROUP BY n.id`;

  const args: (string | number)[] = [];
  // For bidirectional LIKE, each title appears 4 times: 2 in main condition, 2 in alt condition
  // Main title conditions: (dbCol LIKE '%' || ? || '%' OR ? LIKE '%' || dbCol || '%')
  preparedTitles.forEach(title => {
    args.push(title); // for main title LIKE '%' || ? || '%'
    args.push(title); // for ? LIKE '%' || main title || '%'
  });
  // Alt title conditions: (dbCol LIKE '%' || ? || '%' OR ? LIKE '%' || dbCol || '%')
  preparedTitles.forEach(title => {
    args.push(title); // for alt title LIKE '%' || ? || '%'
    args.push(title); // for ? LIKE '%' || alt title || '%'
  });
  // then exclusion params in the same order we appended to WHERE
  if (hasExcludeId) {
    args.push(excludeNovelId as number);
  }
  if (hasExcludePair) {
    args.push(excludePluginId as string, excludePath as string);
  }

  const results = await getAllAsync<{
    id: number;
    name: string;
    author?: string;
    pluginId: string;
    path: string;
    cover?: string;
    status?: string;
    chaptersDownloaded: number;
    chaptersUnread: number;
    totalChapters: number;
    altTitlesCsv?: string;
  }>([query, args]);

  if (results.length === 0) {
    return [];
  }
  // Add aggregated alternative titles and matchType to results
  const sep = String.fromCharCode(1);
  return results.map(novel => {
    const alternativeTitles = novel.altTitlesCsv
      ? String(novel.altTitlesCsv).split(sep).filter(Boolean)
      : [];
    const mapped: any = { ...novel };
    delete mapped.altTitlesCsv;
    return { ...mapped, alternativeTitles, matchType: 'title' as const };
  });
};

/**
 * check for any library match
 */
export const hasLibraryMatchAsync = async (
  searchTitle: string,
  searchTitleAlternatives: string[] = [],
  rule: MatchingRule = 'normalized-contains',
  excludePluginId?: string,
  excludePath?: string,
  excludeNovelId?: number,
): Promise<boolean> => {
  // Enrich alternatives from DB if not provided to guarantee bidirectional behavior
  let enrichedAlts = searchTitleAlternatives || [];
  if (
    (!enrichedAlts || enrichedAlts.length === 0) &&
    (excludeNovelId != null || (excludePluginId && excludePath))
  ) {
    try {
      let novelIdToFetch = excludeNovelId;
      if (novelIdToFetch == null && excludePluginId && excludePath) {
        const row = await getFirstAsync<{ id: number }>([
          'SELECT id FROM Novel WHERE pluginId = ? AND path = ?',
          [excludePluginId, excludePath],
        ]);
        novelIdToFetch = row?.id;
      }
      if (novelIdToFetch != null) {
        const rows = await getAllAsync<{ title: string }>([
          'SELECT title FROM AlternativeTitle WHERE novelId = ?',
          [novelIdToFetch],
        ]);
        enrichedAlts = rows?.map(r => r.title).filter(Boolean) || [];
      }
    } catch {}
  }

  // Validate all titles first
  const allTitles = [searchTitle, ...enrichedAlts];
  const validTitles = allTitles.filter(isValidTitle);
  if (validTitles.length === 0) {
    return false;
  }

  const all = validTitles
    .map(t => (t ?? '').toLowerCase())
    .map(t => (rule.includes('normalized') ? normalizeForDb(t) : t.trim()))
    .filter(t => t.length >= 2); // Require at least 2 chars after normalization

  if (all.length === 0) {
    return false;
  }

  const col = (c: string) =>
    rule.includes('normalized')
      ? `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(${c}), ' ', ''), '-', ''), '_', ''), '.', ''), ',', ''), '''', ''), ':', ''), '!', ''), '?', '')`
      : `LOWER(${c})`;
  const nameCol = col('n.name');
  const altCol = col('at.title');

  // Add SQL-level length validation
  const minLengthCheck = rule.includes('normalized')
    ? `LENGTH(${nameCol}) >= 2`
    : `LENGTH(TRIM(${nameCol})) >= 2`;

  const conds = (ph: string) => {
    return rule.includes('contains')
      ? {
          main: `(${nameCol} LIKE '%' || ${ph} || '%' OR ${ph} LIKE '%' || ${nameCol} || '%') AND ${minLengthCheck}`,
          alt: `EXISTS (SELECT 1 FROM AlternativeTitle at WHERE at.novelId = n.id AND (${altCol} LIKE '%' || ${ph} || '%' OR ${ph} LIKE '%' || ${altCol} || '%') AND LENGTH(${altCol}) >= 2)`,
        }
      : {
          main: `${nameCol} = ${ph} AND ${minLengthCheck}`,
          alt: `EXISTS (SELECT 1 FROM AlternativeTitle at WHERE at.novelId = n.id AND ${altCol} = ${ph} AND LENGTH(${altCol}) >= 2)`,
        };
  };

  const main = all.map(() => conds('?').main).join(' OR ');
  const alt = all.map(() => conds('?').alt).join(' OR ');
  let q = `SELECT 1 FROM Novel n WHERE n.inLibrary = 1 AND ((${main}) OR (${alt}))`;
  const args: (string | number)[] = [];

  if (rule.includes('contains')) {
    // Bidirectional: 2 args per title for main, 2 args per title for alt
    args.push(...all.flatMap(t => [t, t]));
    args.push(...all.flatMap(t => [t, t]));
  } else {
    // Exact: 1 arg per title for main, 1 arg per title for alt
    args.push(...all, ...all);
  }

  if (excludeNovelId != null) {
    q += ' AND n.id <> ?';
    args.push(excludeNovelId);
  }
  if (excludePluginId && excludePath) {
    q += ' AND NOT (n.pluginId = ? AND n.path = ?)';
    args.push(excludePluginId, excludePath);
  }
  q += ' LIMIT 1';
  const row = await getFirstAsync<{ any: number }>([q, args]);
  const has = !!row;

  return has;
};

export const updateNovelHasMatch = async (novelId: number) => {
  const novel = await getFirstAsync<NovelInfo>([
    'SELECT * FROM Novel WHERE id = ?',
    [novelId],
  ]);
  if (novel) {
    const altTitles =
      (
        await getAllAsync<{ title: string }>([
          'SELECT title FROM AlternativeTitle WHERE novelId = ?',
          [novelId],
        ])
      )?.map(t => t.title) || [];
    const hasMatch = await hasLibraryMatchAsync(
      novel.name,
      altTitles,
      'normalized-contains',
      novel.pluginId,
      novel.path,
      novel.id,
    );
    await runAsync([
      [
        'UPDATE Novel SET hasMatch = ? WHERE id = ?',
        [hasMatch ? 1 : 0, novel.id],
      ],
    ]);
  }
};

export const recalculateAllNovelHasMatch = async () => {
  const novels = await getAllAsync<NovelInfo>(['SELECT * FROM Novel']);
  for (const novel of novels) {
    await updateNovelHasMatch(novel.id);
  }
};

export const getLibraryNovelsFromDb = (
  sortOrder?: string,
  filter?: string,
  searchText?: string,
  downloadedOnlyMode?: boolean,
  limit?: number,
  offset?: number,
  categoryId?: number,
  categoryNovelIds?: number[],
  hiddenPlugins?: string[], // Add plugin filter parameter
): NovelInfo[] => {
  let query = `SELECT n.*, 
                      CASE WHEN nt.novelId IS NOT NULL THEN 1 ELSE 0 END as hasNote
               FROM Novel n
               LEFT JOIN Note nt ON n.id = nt.novelId
               LEFT JOIN AlternativeTitle alt ON n.id = alt.novelId`;

  const params: (string | number)[] = [];

  if (categoryId != null) {
    query +=
      ' INNER JOIN NovelCategory nc ON n.id = nc.novelId AND nc.categoryId = ?';
    params.push(categoryId);
  }

  query += ' WHERE n.inLibrary = 1';

  // Add plugin filter - exclude hidden plugins but always show local novels
  if (hiddenPlugins && hiddenPlugins.length > 0) {
    const placeholders = hiddenPlugins.map(() => '?').join(',');
    query += ` AND (n.pluginId NOT IN (${placeholders}) OR n.pluginId = 'local' OR n.isLocal = 1)`;
    params.push(...hiddenPlugins);
  }

  if (filter) {
    query += ` AND ${filter} `;
  }
  if (downloadedOnlyMode) {
    query += ' ' + LibraryFilter.DownloadedOnly;
  }
  if (searchText) {
    query +=
      ' AND (n.name LIKE ? OR alt.title LIKE ? OR n.author LIKE ? OR n.genres LIKE ? OR n.summary LIKE ? OR nt.content LIKE ? OR n.pluginId LIKE ?)';
    params.push(
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
    );
  }
  if (categoryNovelIds && categoryNovelIds.length > 0) {
    const placeholders = categoryNovelIds.map(() => '?').join(',');
    query += ` AND n.id IN (${placeholders})`;
    params.push(...categoryNovelIds);
  }
  query += ' GROUP BY n.id';

  if (sortOrder) {
    if (searchText) {
      query += ` ORDER BY
                   CASE
                     WHEN n.name LIKE ? THEN 1
                     WHEN alt.title LIKE ? THEN 2
                     WHEN n.author LIKE ? THEN 3
                     WHEN n.genres LIKE ? THEN 4
                     WHEN n.summary LIKE ? THEN 5
                     WHEN nt.content LIKE ? THEN 6
                     WHEN n.pluginId LIKE ? THEN 7
                     ELSE 8
                   END,
                   ${sortOrder} `;
      params.push(
        `%${searchText}%`,
        `%${searchText}%`,
        `%${searchText}%`,
        `%${searchText}%`,
        `%${searchText}%`,
        `%${searchText}%`,
        `%${searchText}%`,
      );
    } else {
      query += ` ORDER BY ${sortOrder} `;
    }
  } else if (searchText) {
    query += ` ORDER BY
                 CASE
                   WHEN n.name LIKE ? THEN 1
                   WHEN alt.title LIKE ? THEN 2
                   WHEN n.author LIKE ? THEN 3
                   WHEN n.genres LIKE ? THEN 4
                   WHEN n.summary LIKE ? THEN 5
                   WHEN nt.content LIKE ? THEN 6
                   WHEN n.pluginId LIKE ? THEN 7
                   ELSE 8
                 END,
                 n.name ASC `;
    params.push(
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
    );
  }

  if (limit !== undefined) {
    query += ' LIMIT ?';
    params.push(limit);

    if (offset !== undefined) {
      query += ' OFFSET ?';
      params.push(offset);
    }
  }

  return getAllSync<NovelInfo>([query, params]);
};

export const getLibraryNovelsCount = (
  filter?: string,
  searchText?: string,
  downloadedOnlyMode?: boolean,
): number => {
  let query = `SELECT COUNT(DISTINCT n.id) as count
               FROM Novel n
               LEFT JOIN Note nt ON n.id = nt.novelId
               LEFT JOIN AlternativeTitle alt ON n.id = alt.novelId
               WHERE n.inLibrary = 1`;

  const params: (string | number)[] = [];

  if (filter) {
    query += ` AND ${filter} `;
  }
  if (downloadedOnlyMode) {
    query += ' ' + LibraryFilter.DownloadedOnly;
  }
  if (searchText) {
    query +=
      ' AND (n.name LIKE ? OR alt.title LIKE ? OR n.author LIKE ? OR n.genres LIKE ? OR n.summary LIKE ? OR nt.content LIKE ? OR n.pluginId LIKE ?)';
    params.push(
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
      `%${searchText}%`,
    );
  }

  const result = getFirstSync<{ count: number }>([query, params]);
  return result?.count || 0;
};

export const getCategoryNovelCounts = (
  categoryNovelIds: number[][],
  filter?: string,
  searchText?: string,
  downloadedOnlyMode?: boolean,
  hiddenPlugins?: string[],
): number[] => {
  return categoryNovelIds.map(novelIds => {
    if (novelIds.length === 0) return 0;

    let query = `SELECT COUNT(DISTINCT n.id) as count
                 FROM Novel n
                 LEFT JOIN Note nt ON n.id = nt.novelId
                 LEFT JOIN AlternativeTitle alt ON n.id = alt.novelId
                 WHERE n.inLibrary = 1 AND n.id IN (${novelIds
                   .map(() => '?')
                   .join(',')})`;

    const params: (string | number)[] = [...novelIds];

    // Filter out hidden plugins
    if (hiddenPlugins && hiddenPlugins.length > 0) {
      query += ` AND n.pluginId NOT IN (${hiddenPlugins
        .map(() => '?')
        .join(',')})`;
      params.push(...hiddenPlugins);
    }

    if (searchText?.trim()) {
      query += ` AND (
        n.name LIKE ? OR
        alt.title LIKE ? OR
        n.author LIKE ? OR
        n.genres LIKE ? OR
        n.summary LIKE ? OR
        nt.content LIKE ? OR
        n.pluginId LIKE ?
      )`;
      const searchParam = `%${searchText}%`;
      params.push(
        searchParam,
        searchParam,
        searchParam,
        searchParam,
        searchParam,
        searchParam,
        searchParam,
      );
    }

    if (filter) {
      query += ` AND ${filter}`;
    }
    if (downloadedOnlyMode) {
      query += ' ' + LibraryFilter.DownloadedOnly;
    }

    const result = getFirstSync<{ count: number }>([query, params]);
    return result?.count || 0;
  });
};
const getLibraryWithCategoryQuery = `SELECT n.*,
                                                  CASE WHEN nt.novelId IS NOT NULL THEN 1 ELSE 0 END as hasNote
                                           FROM Novel n
                                           LEFT JOIN Note nt ON n.id = nt.novelId
                                           WHERE n.inLibrary = 1`;
// `
//   SELECT *
//   FROM
//   (
//     SELECT NIL.*, chaptersUnread, chaptersDownloaded, lastReadAt, lastUpdatedAt
//     FROM
//     (
//       SELECT
//         Novel.*,
//         category,
//         categoryId
//       FROM
//       Novel LEFT JOIN (
//         SELECT NovelId, name as category, categoryId FROM (NovelCategory JOIN Category ON NovelCategory.categoryId = Category.id)
//       ) as NC ON Novel.id = NC.novelId
//       WHERE inLibrary = 1
//     ) as NIL
//     LEFT JOIN
//     (
//       SELECT
//         SUM(unread) as chaptersUnread, SUM(isDownloaded) as chaptersDownloaded,
//         novelId, MAX(readTime) as lastReadAt, MAX(updatedTime) as lastUpdatedAt
//       FROM Chapter
//       GROUP BY novelId
//     ) as C ON NIL.id = C.novelId
//   ) WHERE 1 = 1
// `;

export const getLibraryWithCategory = ({
  filter,
  searchText,
  sortOrder,
  downloadedOnlyMode,
}: {
  sortOrder?: string;
  filter?: string;
  searchText?: string;
  downloadedOnlyMode?: boolean;
}): LibraryNovelInfo[] => {
  let query = getLibraryWithCategoryQuery;
  const preparedArgument: (string | number | null)[] = [];

  if (filter) {
    query += ` AND n.id IN (SELECT novelId FROM NovelCategory WHERE ${filter}) `;
  }
  if (downloadedOnlyMode) {
    query += ' ' + LibraryFilter.DownloadedOnly;
  }

  if (searchText) {
    query += ' AND n.name LIKE ? ';
    preparedArgument.push(`%${searchText}%`);
  }

  if (sortOrder) {
    query += ` ORDER BY ${sortOrder} `;
  }

  const res = getAllSync<LibraryNovelInfo>([query, preparedArgument]);

  return res;
};
export const searchNovels = searchText => {
  if (!searchText?.trim()) {
    return [];
  }
  const query = `
    SELECT DISTINCT novels.*,
           COUNT(chapters.id) as totalChapters,
           COUNT(CASE WHEN chapters.isDownloaded = 1 THEN 1 END) as chaptersDownloaded,
           COUNT(CASE WHEN chapters.isUnread = 1 THEN 1 END) as chaptersUnread,
           MAX(chapters.dateRead) as lastReadAt,
           GROUP_CONCAT(categories.name) as categoryNames
    FROM novels
    LEFT JOIN chapters ON novels.id = chapters.novelId
    LEFT JOIN novelCategory ON novels.id = novelCategory.novelId
    LEFT JOIN categories ON novelCategory.categoryId = categories.id
    WHERE novels.name LIKE '%' || ? || '%'
    GROUP BY novels.id
    ORDER BY novels.name ASC
  `;
  return getAllSync([query, [searchText ?? '']]);
};
