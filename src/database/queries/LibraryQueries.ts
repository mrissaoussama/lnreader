import { LibraryFilter } from '@screens/library/constants/constants';
import { LibraryNovelInfo, NovelInfo, DBNovelInfo } from '../types';
import { getAllSync } from '../utils/helpers';

export const getLibraryNovelsFromDb = (
  sortOrder?: string,
  filter?: string,
  searchText?: string,
  downloadedOnlyMode?: boolean,
): DBNovelInfo[] => {
  let query = `SELECT n.*, 
                      CASE WHEN nt.novelId IS NOT NULL THEN 1 ELSE 0 END as hasNote
               FROM Novel n
               LEFT JOIN Note nt ON n.id = nt.novelId
               WHERE n.inLibrary = 1`;

  if (filter) {
    query += ` AND ${filter} `;
  }
  if (downloadedOnlyMode) {
    query += ' ' + LibraryFilter.DownloadedOnly;
  }

  if (searchText) {
    query += ' AND n.name LIKE ? ';
  }

  if (sortOrder) {
    query += ` ORDER BY ${sortOrder} `;
  }
  return getAllSync<NovelInfo>([query, [searchText ?? '']]);
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
    // query += ` AND ${filter} `;
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
