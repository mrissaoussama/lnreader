import {
  Tracker,
  SearchResult,
  UserListEntry,
  UserListStatus,
  TRACKER_SOURCES,
} from './types';
import * as cheerio from 'cheerio';

import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '../../plugins/helpers/fetch';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { getTracks } from '@database/queries/TrackQueries';
import { getTotalReadChaptersCount } from '@database/queries/ChapterQueries';
import { getLibraryNovelsFromDb } from '@database/queries/LibraryQueries';

const NOVEL_UPDATES_BASE_URL = 'https://www.novelupdates.com';

const cleanJsonResponse = (rawText: string): any => {
  try {
    const fixedText = rawText.trim().replace(/}[\s]*0+$/, '}');
    return JSON.parse(fixedText);
  } catch {
    return null;
  }
};

const parseChapterNumber = (chapterText: string): number => {
  const chapterMatch = chapterText.match(/c(\d+(\.\d+)?)/i);
  return chapterMatch ? parseFloat(chapterMatch[1]) : 0;
};

const cleanHtmlText = (htmlText: string): string => {
  return htmlText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\\"/g, '"')
    .trim();
};

export interface NovelUpdatesChapter {
  id: string;
  title: string;
  index: number;
  number?: number | null;
  isMarked?: boolean;
}

export interface NovelUpdatesSyncData {
  novelId: number;
  novelName: string;
  currentProgress: number;
  targetProgress: number;
  source: 'app' | 'tracker';
}

export const fetchNovelUpdatesChapters = async (
  novelUpdatesId: string,
  auth: any,
): Promise<NovelUpdatesChapter[]> => {
  const url = `${NOVEL_UPDATES_BASE_URL}/wp-admin/admin-ajax.php`;

  const formData = new URLSearchParams();
  formData.append('action', 'nd_getchapters');
  formData.append('mygrr', '0');
  formData.append('mypostid', novelUpdatesId);

  const response = await fetchApi(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': auth.accessToken,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
      'Referer': `${NOVEL_UPDATES_BASE_URL}/series/`,
    },
    body: formData.toString(),
  });

  const html = await response.text();

  const $ = cheerio.load(html);

  const chapters: NovelUpdatesChapter[] = [];

  $('li.sp_li_chp').each((index, element) => {
    const $element = $(element);
    const link = $element.find('a[data-id]');
    const id = link.attr('data-id');
    const titleSpan = link.find('span[title]');
    const title = titleSpan.attr('title') || titleSpan.text().trim();

    if (id && title) {
      chapters.push({
        id,
        title,
        index: chapters.length,
      });
    }
  });

  const reversedChapters = chapters.reverse();

  return reversedChapters;
};

export const markNovelUpdatesChapterRead = async (
  chapterId: string,
  novelUpdatesId: string,
  auth: any,
): Promise<void> => {
  const url = `${NOVEL_UPDATES_BASE_URL}/readinglist_update.php`;

  const params = new URLSearchParams({
    rid: chapterId,
    sid: novelUpdatesId,
    checked: 'yes',
  });

  const fullUrl = `${url}?${params.toString()}`;

  const requestHeaders = {
    'Cookie': auth.accessToken,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
    'Referer': `${NOVEL_UPDATES_BASE_URL}/series/`,
    'Accept': '*/*',
  };

  try {
    const response = await fetchApi(fullUrl, {
      method: 'GET',
      headers: requestHeaders,
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Chapter marking failed: ${response.status} ${response.statusText} - ${responseText}`,
      );
    }
  } catch (error) {
    throw error;
  }
};

export const parseChapterNumber2 = (title: string): number | null => {
  if (!title) return null;

  const cleanTitle = title.toLowerCase().trim();

  const chapterPattern = /(?:^|[^a-z])c(\d+)(?:[^0-9]|$)/i;
  const match = cleanTitle.match(chapterPattern);

  if (match && match[1]) {
    return parseInt(match[1], 10);
  }

  return null;
};

export const getChaptersForMarking = async (
  novelUpdatesId: string,
  auth: any,
): Promise<NovelUpdatesChapter[]> => {
  const url = `${NOVEL_UPDATES_BASE_URL}/wp-admin/admin-ajax.php`;

  const formData = new URLSearchParams();
  formData.append('action', 'nd_getchapters');
  formData.append('mygrr', '0');
  formData.append('mypostid', novelUpdatesId);

  const response = await fetchApi(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': auth.accessToken,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
      'Referer': `${NOVEL_UPDATES_BASE_URL}/series/`,
    },
    body: formData.toString(),
  });

  const html = await response.text();

  const $ = cheerio.load(html);

  const chapters: NovelUpdatesChapter[] = [];

  $('li.sp_li_chp').each((index, element) => {
    const $element = $(element);
    const link = $element.find('a[data-id]');
    const id = link.attr('data-id');
    const titleSpan = link.find('span[title]');
    const title = titleSpan.attr('title') || titleSpan.text().trim();

    if (id && title) {
      const parsedNumber = parseChapterNumber(title);

      chapters.push({
        id,
        title,
        index: chapters.length,
        number: parsedNumber,
        isMarked: false,
      });
    }
  });

  const reversedChapters = chapters.reverse();

  try {
    const bookmarkData = await getMarkedChapterStatus(novelUpdatesId, auth);

    reversedChapters.forEach(chapter => {
      if (bookmarkData.has(chapter.id)) {
        chapter.isMarked = true;
      }
    });
  } catch (error) {}

  return reversedChapters;
};

const getMarkedChapterStatus = async (
  novelUpdatesId: string,
  auth: any,
): Promise<Set<string>> => {
  const url = `${NOVEL_UPDATES_BASE_URL}/wp-admin/admin-ajax.php`;

  const formData = new URLSearchParams();
  formData.append('action', 'nu_gotobk');
  formData.append('strSID', novelUpdatesId);

  const response = await fetchApi(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': auth.accessToken,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
      'Referer': `${NOVEL_UPDATES_BASE_URL}/series/`,
    },
    body: formData.toString(),
  });

  const responseText = await response.text();

  let cleanResponse = responseText.trim();
  if (cleanResponse.endsWith('0')) {
    cleanResponse = cleanResponse.slice(0, -1);
  }

  const markedChapterIds = new Set<string>();

  try {
    const parsedData = JSON.parse(cleanResponse);

    if (parsedData.data) {
      const $ = cheerio.load(parsedData.data);

      $('tr').each((_, row) => {
        const $element = $(row);
        const $checkbox = $element.find('input[type="checkbox"][checked]');

        if ($checkbox.length > 0) {
          const chapterId = $checkbox.attr('id')?.replace('chklist', '');
          if (chapterId) {
            markedChapterIds.add(chapterId);
          }
        }
      });
    }
  } catch (error) {}

  return markedChapterIds;
};

export const markChaptersUpToProgress = async (
  novelUpdatesId: string,
  targetProgress: number,
  auth: any,
): Promise<void> => {
  try {
    const markChaptersEnabled =
      MMKVStorage.getBoolean('novelupdates_mark_chapters_enabled') ?? false;

    if (!markChaptersEnabled) {
      return;
    }

    const chapters = await getChaptersForMarking(novelUpdatesId, auth);

    if (chapters.length === 0) {
      return;
    }

    let chapterToMark: NovelUpdatesChapter | undefined;

    const chaptersWithNumbers = chapters.filter(
      ch => ch.number !== null && ch.number !== undefined,
    );

    if (chaptersWithNumbers.length > 0) {
      chapterToMark = chaptersWithNumbers.find(
        ch => ch.number === targetProgress,
      );
    } else {
      chapterToMark = chapters[targetProgress - 1];
    }
    if (chapterToMark && !chapterToMark.isMarked) {
      await markNovelUpdatesChapterRead(chapterToMark.id, novelUpdatesId, auth);
    }
  } catch (error) {}
};

export const getNovelUpdatesId = (track: any): string | null => {
  if (track.metadata) {
    try {
      const metadata = JSON.parse(track.metadata);
      if (metadata.novelId) {
        return metadata.novelId;
      }
    } catch (error) {}
  }

  if (track.sourceId && typeof track.sourceId === 'string') {
    if (/^\d+$/.test(track.sourceId)) {
      return track.sourceId;
    }

    const match = track.sourceId.match(
      /novelupdates\.com\/series\/[^/]+\/.*?(\d+)/,
    );
    if (match) {
      return match[1];
    }
  }

  return null;
};

export const getSyncableNovels = async (): Promise<NovelUpdatesSyncData[]> => {
  const libraryNovels = getLibraryNovelsFromDb();
  const syncableNovels: NovelUpdatesSyncData[] = [];

  const updateEvenIfNotNovelUpdates = (() => {
    try {
      return (
        MMKVStorage.getBoolean('novelupdates_update_even_if_not_source') ??
        false
      );
    } catch {
      return false;
    }
  })();

  for (const novel of libraryNovels) {
    const tracks = await getTracks(novel.id);
    const novelUpdatesTrack = tracks.find(
      track => track.source === TRACKER_SOURCES.NOVEL_UPDATES,
    );

    if (novelUpdatesTrack) {
      const appProgress = await getTotalReadChaptersCount(novel.id);
      const trackerProgress = novelUpdatesTrack.lastChapterRead;

      if (appProgress !== trackerProgress) {
        syncableNovels.push({
          novelId: novel.id,
          novelName: novel.name,
          currentProgress: Math.min(appProgress, trackerProgress),
          targetProgress: Math.max(appProgress, trackerProgress),
          source: appProgress > trackerProgress ? 'app' : 'tracker',
        });
      }
    } else if (
      updateEvenIfNotNovelUpdates &&
      novel.pluginId === 'novelupdates'
    ) {
      const readChapters = await getTotalReadChaptersCount(novel.id);

      if (readChapters > 0) {
        syncableNovels.push({
          novelId: novel.id,
          novelName: novel.name,
          currentProgress: 0,
          targetProgress: readChapters.length,
          source: 'app',
        });
      }
    }
  }

  return syncableNovels;
};

const authenticate: Tracker['authenticate'] = async () => {
  return {
    accessToken: 'manually_authenticated',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  };
};

const statusMapping: Record<string, UserListStatus> = {
  '0': 'CURRENT',
  '1': 'COMPLETED',
  '2': 'PLANNING',
  '3': 'PAUSED',
  '4': 'DROPPED',
  '5': 'DROPPED',
};

const handleSearch: Tracker['handleSearch'] = async (
  query: string,
  _authentication?,
  _options?,
): Promise<SearchResult[]> => {
  try {
    const searchUrl = `${NOVEL_UPDATES_BASE_URL}/series-finder/?sf=1&sh=${encodeURIComponent(
      query,
    )}&sort=sdate&order=desc`;

    const response = await fetchApi(searchUrl);

    const html = await response.text();

    if (!response.ok) {
      throw new Error(`Search failed with status: ${response.status}`);
    }

    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $('.search_main_box_nu').each((index, element) => {
      const titleElement = $(element).find('.search_title a');
      const title = titleElement.text().trim();
      const link = titleElement.attr('href');
      const sidSpan = $(element).find('span[id^="sid"]');
      const sidId = sidSpan.attr('id');
      let numericId = '';

      if (sidId) {
        const sidMatch = sidId.match(/sid(\d+)/);
        if (sidMatch) {
          numericId = sidMatch[1];
        }
      }

      let slug = '';
      if (link) {
        const slugMatch = link.match(/series\/([^/]+)\/?/);
        slug = slugMatch ? slugMatch[1] : '';
      }

      const id = slug || numericId;

      const coverElement = $(element).find('.search_img_nu img');
      const coverImage = coverElement.attr('src');

      let descContainer = $(element).find('.search_body_nu');
      if (!descContainer.length) {
        descContainer = $(element).find('div[style*="padding-top:5px"]');
      }
      if (!descContainer.length) {
        descContainer = $(element).find('div[style*="font-size: 14px"]');
      }
      if (!descContainer.length) {
        descContainer = $(element).find('div:has(.testhide)');
      }
      if (!descContainer.length) {
        descContainer = $(element).find('div').last();
      }

      let description = '';

      if (descContainer.length) {
        const fullText = descContainer.text();

        const hiddenText = descContainer.find('.testhide').text();

        if (hiddenText) {
          const visibleText = fullText.replace(hiddenText, '').trim();

          description = (visibleText + ' ' + hiddenText)
            .replace(/\.\.\.\s*more>>/g, '')
            .replace(/<<less/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        } else {
          description = fullText.replace(/\.\.\.\s*more>>/g, '').trim();
        }
      }

      if (title && id) {
        results.push({
          id,
          title,
          coverImage: coverImage?.startsWith('http')
            ? coverImage
            : `${NOVEL_UPDATES_BASE_URL}${coverImage}`,
          description: description,
        });
      }
    });

    return results;
  } catch (error) {
    return [];
  }
};

const getNovelId = (loadedCheerio: CheerioAPI): string => {
  const shortlinkMeta = loadedCheerio('link[rel="shortlink"]').attr('href');
  if (shortlinkMeta) {
    const match = shortlinkMeta.match(/p=(\d+)/);
    if (match) {
      return match[1];
    }
  }

  const activityStatsLink = loadedCheerio('a[href*="activity-stats"]')
    .attr('href')
    ?.match(/seriesid=(\d+)/);
  if (activityStatsLink) {
    return activityStatsLink[1];
  }

  const postId = loadedCheerio('input#mypostid').attr('value');
  if (postId) {
    return postId;
  }

  throw new Error('Failed to get novel ID');
};

const getAlternativeTitles = (loadedCheerio: CheerioAPI): string[] => {
  const editAssociatedDiv = loadedCheerio('#editassociated');
  if (!editAssociatedDiv.length) {
    return [];
  }

  const htmlContent = editAssociatedDiv.html();
  if (!htmlContent) {
    return [];
  }

  const titles = htmlContent
    .split(/<br\s*\/?>/gi)
    .map(title => title.replace(/<[^>]*>/g, '').trim())
    .filter(title => title.length > 0);

  return titles;
};

const getTags = (loadedCheerio: CheerioAPI): string[] => {
  try {
    const tagsDiv = loadedCheerio('#showtags');
    if (!tagsDiv.length) return [];
    const tags: string[] = [];
    tagsDiv.find('a.genre').each((_, el) => {
      const txt = loadedCheerio(el).text().trim();
      if (txt) tags.push(txt);
    });
    return Array.from(new Set(tags));
  } catch {
    return [];
  }
};

const getReadingListStatus = (loadedCheerio: CheerioAPI): string | null => {
  const sticon = loadedCheerio('div.sticon');
  if (sticon.find('img[src*="addme.png"]').length) {
    return null;
  }

  const readingListLink = sticon.find('span.sttitle a');
  if (readingListLink.length) {
    const href = readingListLink.attr('href');
    const listIdMatch = href?.match(/list=(\d+)/);
    if (listIdMatch) {
      return listIdMatch[1];
    }
  }

  return null;
};

const getMarkedChapterProgress = async (
  novelId: string,
): Promise<{
  progress: number;
  lastMarkedChapterId?: string;
  lastMarkedChapterText?: string;
  lastMarkedChapterIndex?: number;
}> => {
  try {
    const requestBody = new URLSearchParams({
      action: 'nu_gotobk',
      strSID: novelId,
    }).toString();

    const response = await fetchApi(
      `${NOVEL_UPDATES_BASE_URL}/wp-admin/admin-ajax.php`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: requestBody,
      },
    );

    const rawText = await response.text();

    const responseData = cleanJsonResponse(rawText);

    if (!responseData?.data) {
      return { progress: 0 };
    }

    const $ = load(`<table>${responseData.data}</table>`);

    let progress = 0;
    let lastMarkedChapterId: string | undefined;
    let lastMarkedChapterText: string | undefined;
    let lastMarkedChapterIndex: number | undefined;

    const allChapters: Array<{
      id: string;
      text: string;
      number: number;
      index: number;
      isMarked: boolean;
    }> = [];

    $('tr').each((index, row) => {
      const rowElement = $(row);
      const checkbox = rowElement.find('input[type="checkbox"]');
      const chapterId = checkbox.attr('id')?.replace('chklist', '');
      const chapterLink = rowElement.find('a.chp-release');
      const chapterText =
        chapterLink.attr('title') || chapterLink.text().trim();
      const isMarked = checkbox.is('[checked]');

      if (chapterText && chapterId) {
        const chapterNumber = parseChapterNumber(chapterText);
        allChapters.push({
          id: chapterId,
          text: chapterText,
          number: chapterNumber,
          index: 0,
          isMarked,
        });
      }
    });

    allChapters.sort((a, b) => a.number - b.number);

    allChapters.forEach(chapter => {
      chapter.index = Math.round(chapter.number);
    });

    for (const chapter of allChapters) {
      if (chapter.isMarked && chapter.number > progress) {
        progress = chapter.number;
        lastMarkedChapterId = chapter.id;
        lastMarkedChapterText = chapter.text;
        lastMarkedChapterIndex = chapter.index;
      }
    }

    return {
      progress,
      lastMarkedChapterId,
      lastMarkedChapterText,
      lastMarkedChapterIndex,
    };
  } catch (error) {
    return { progress: 0 };
  }
};

const parseNotesProgress = (notesText: string): number => {
  const cleanText = cleanHtmlText(notesText);
  const chapterPattern = /total\s+chapters\s+read:\s*(\d+)/i;
  const match = cleanText.match(chapterPattern);
  return match && match[1] ? parseInt(match[1], 10) : 0;
};

const getNotesProgress = async (novelId: string): Promise<number> => {
  try {
    const response = await fetchApi(
      `${NOVEL_UPDATES_BASE_URL}/wp-admin/admin-ajax.php`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `action=wi_notestagsfic&strSID=${novelId}`,
      },
    );

    const rawText = await response.text();
    const notesData = cleanJsonResponse(rawText);

    if (notesData?.notes) {
      let actualNotes = notesData.notes;
      try {
        if (actualNotes.startsWith('{"') || actualNotes.startsWith('{')) {
          const parsed = JSON.parse(actualNotes);
          if (parsed.notes) {
            actualNotes = parsed.notes;
          }
        }
      } catch (e) {}

      return parseNotesProgress(actualNotes);
    }
  } catch (error) {}

  return 0;
};

const getDetailedProgress = async (
  novelId: string,
): Promise<{
  notesProgress: number;
  markedProgress: number;
  finalProgress: number;
  lastMarkedChapterId?: string;
  lastMarkedChapterText?: string;
  lastMarkedChapterIndex?: number;
  progressDisplay?: string;
}> => {
  const markChaptersEnabled =
    MMKVStorage.getBoolean('novelupdates_mark_chapters_enabled') ?? false;

  let notesProgress: number;
  let markedData: {
    progress: number;
    lastMarkedChapterId?: string;
    lastMarkedChapterText?: string;
    lastMarkedChapterIndex?: number;
  };

  if (markChaptersEnabled) {
    [notesProgress, markedData] = await Promise.all([
      getNotesProgress(novelId),
      getMarkedChapterProgress(novelId),
    ]);
  } else {
    notesProgress = await getNotesProgress(novelId);
    markedData = { progress: 0 };
  }

  const finalProgress = Math.max(notesProgress, markedData.progress);

  let progressDisplay = `notes:${notesProgress}`;

  if (markChaptersEnabled) {
    if (
      markedData.lastMarkedChapterText &&
      markedData.lastMarkedChapterIndex !== undefined
    ) {
      progressDisplay += `, marked:${markedData.lastMarkedChapterText} (index:${markedData.lastMarkedChapterIndex})`;
    } else if (markedData.progress > 0) {
      progressDisplay += `, marked:${markedData.progress}`;
    } else {
      progressDisplay += ', marked:0';
    }
  }

  return {
    notesProgress,
    markedProgress: markedData.progress,
    finalProgress,
    lastMarkedChapterId: markedData.lastMarkedChapterId,
    lastMarkedChapterText: markedData.lastMarkedChapterText,
    lastMarkedChapterIndex: markedData.lastMarkedChapterIndex,
    progressDisplay,
  };
};

const markChapterRead = async (
  novelId: string,
  chapterId: string,
  isRead: boolean = true,
): Promise<void> => {
  try {
    const markChaptersEnabled =
      MMKVStorage.getBoolean('novelupdates_mark_chapters_enabled') ?? false;

    if (!markChaptersEnabled) {
      return;
    }

    await fetchApi(`${NOVEL_UPDATES_BASE_URL}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'nu_bookmark',
        nid: chapterId,
        sid: novelId,
        checked: isRead ? '1' : '0',
      }).toString(),
    });
  } catch (error) {}
};

const getAvailableReadingLists = (
  loadedCheerio: CheerioAPI,
): Array<{ id: string; name: string }> => {
  const menuLists: Array<{ id: string; name: string }> = [];
  const menu = loadedCheerio('div#cssmenu');
  if (menu.length) {
    menu.find('li a').each((_, link) => {
      const $link = loadedCheerio(link);
      const href = $link.attr('href');
      const text = $link.text().trim();

      if (href && href.includes('reading-list/?list=')) {
        const match = href.match(/list=(\d+)/);
        if (match && text && text !== 'Edit Lists') {
          menuLists.push({
            id: match[1],
            name: text,
          });
        }
      }
    });

    if (menuLists.length > 0) {
      return menuLists;
    }
  }

  const sticon = loadedCheerio('div.sticon');
  const select = sticon.find('select.stmove');
  const selectLists: Array<{ id: string; name: string }> = [];

  if (select.length) {
    select.find('option').each((_, option) => {
      const $option = loadedCheerio(option);
      const value = $option.attr('value');
      const text = $option.text().trim();

      if (value && value !== '---' && value !== 'Select...' && text) {
        selectLists.push({
          id: value,
          name: text,
        });
      }
    });
  }
  return selectLists;
};

const addToReadingList = async (
  id: string,
  listId: string,
  auth: any,
): Promise<void> => {
  if (!auth) {
    throw new Error('Not authenticated');
  }

  const url = `${NOVEL_UPDATES_BASE_URL}/series/${id}`;
  const result = await fetchApi(url);
  const body = await result.text();
  const loadedCheerio = load(body);
  const novelId = getNovelId(loadedCheerio);

  const updateUrl = `${NOVEL_UPDATES_BASE_URL}/updatelist.php?sid=${novelId}&lid=${listId}&act=move`;
  await fetchApi(updateUrl);
};

const updateTrackingInNotes = (
  notes: string,
  totalChaptersRead?: number,
  totalVolumesRead?: number,
): string => {
  let cleanText = '';

  if (notes) {
    let actualNotes = notes;
    try {
      if (notes.startsWith('{"') || notes.startsWith('{')) {
        const parsed = JSON.parse(notes);
        if (parsed.notes) {
          actualNotes = parsed.notes;
        }
      }
    } catch (e) {
      actualNotes = notes;
    }

    cleanText = actualNotes
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/g, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\\"/g, '"')
      .trim();
  }

  let updatedText = cleanText.trim();

  if (typeof totalChaptersRead === 'number' && !isNaN(totalChaptersRead)) {
    const chapterPattern = /total\s+chapters\s+read:\s*\d+/i;
    const replacement = `total chapters read: ${totalChaptersRead}`;
    if (chapterPattern.test(updatedText)) {
      updatedText = updatedText.replace(chapterPattern, replacement);
    } else {
      updatedText = updatedText
        ? `${updatedText}\n${replacement}`
        : replacement;
    }
  }

  if (typeof totalVolumesRead === 'number' && !isNaN(totalVolumesRead)) {
    const volumePattern = /total\s+volumes\s+read:\s*\d+/i;
    const volReplacement = `total volumes read: ${totalVolumesRead}`;
    if (volumePattern.test(updatedText)) {
      updatedText = updatedText.replace(volumePattern, volReplacement);
    } else {
      updatedText = updatedText
        ? `${updatedText}\n${volReplacement}`
        : volReplacement;
    }
  }

  const htmlNotes = updatedText
    .split('\n')
    .filter(line => line.trim())
    .map(line => `<p>${line.trim()}</p>`)
    .join('');

  return htmlNotes;
};

const getAvailableReadingListsForNovel: Tracker['getAvailableReadingLists'] =
  async (id, auth): Promise<Array<{ id: string; name: string }>> => {
    if (!auth) {
      throw new Error('Not authenticated');
    }

    const url = `${NOVEL_UPDATES_BASE_URL}/reading-list/`;
    const result = await fetchApi(url);
    const body = await result.text();
    const loadedCheerio = load(body);

    const lists = getAvailableReadingLists(loadedCheerio);

    return lists;
  };

const addToReadingListForNovel: Tracker['addToReadingList'] = async (
  id,
  listId,
  auth,
): Promise<void> => {
  await addToReadingList(id.toString(), listId, auth);
};

const getUserListEntry: Tracker['getUserListEntry'] = async (
  id,
  auth,
): Promise<UserListEntry> => {
  if (!auth) {
    return {
      status: 'CURRENT',
      progress: 1,
      score: 0,
      notes: '',
      alternativeTitles: [],
      metadata: '',
    };
  }
  let alternativeTitles: string[] = [];
  let tags: string[] = [];
  let novelId: string = '';
  const slug = id;
  const url = `${NOVEL_UPDATES_BASE_URL}/series/${slug}`;

  const result = await fetchApi(url);
  const body = await result.text();
  const loadedCheerio = load(body);

  try {
    novelId = getNovelId(loadedCheerio);
    try {
      const fetchAlt = MMKVStorage.getBoolean(
        'novelupdates_fetch_alternative_titles',
      );
      if (fetchAlt) {
        alternativeTitles = getAlternativeTitles(loadedCheerio);
        tags = getTags(loadedCheerio);
      } else {
        alternativeTitles = [];
        tags = [];
      }
    } catch (_) {
      alternativeTitles = [];
      tags = [];
    }
    const listValue = getReadingListStatus(loadedCheerio);

    if (!listValue) {
      return {
        status: 'CURRENT',
        progress: 1,
        score: 0,
        notes: '',
        alternativeTitles,
        metadata: JSON.stringify({ novelId, alternativeTitles, slug }),
      };
    }
    const notesTrackingEnabled =
      MMKVStorage.getBoolean('novelupdates_use_notes_tracking') ?? true;
    const notesUrl = `${NOVEL_UPDATES_BASE_URL}/wp-admin/admin-ajax.php`;
    const notesBody = `action=wi_notestagsfic&strSID=${novelId}`;

    const notesResponse = await fetchApi(notesUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: notesBody,
    });
    const rawText = await notesResponse.text();

    const fixedText = rawText.trim().replace(/}[\s]*0+$/, '}');

    let notesData;
    try {
      notesData = JSON.parse(fixedText);
    } catch (err) {}

    let notesProgress = 0;
    let notesVolumes = 0;
    if (notesTrackingEnabled && notesData && notesData.notes) {
      let actualNotes = notesData.notes;
      try {
        if (actualNotes.startsWith('{"') || actualNotes.startsWith('{')) {
          const parsed = JSON.parse(actualNotes);
          if (parsed.notes) {
            actualNotes = parsed.notes;
          }
        }
      } catch (e) {}

      const cleanText = actualNotes
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/g, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\r\n/g, '\n')
        .replace(/\\"/g, '"')
        .trim();

      const chapterPattern = /total\s+chapters\s+read:\s*(\d+)/i;
      const match = cleanText.match(chapterPattern);
      if (match && match[1]) {
        notesProgress = parseInt(match[1], 10);
      }
      const volumePattern = /total\s+volumes\s+read:\s*(\d+)/i;
      const matchVol = cleanText.match(volumePattern);
      if (matchVol && matchVol[1]) {
        notesVolumes = parseInt(matchVol[1], 10);
      }
    }

    let markedProgress = 0;
    let lastMarkedChapterId: string | undefined;
    const markingEnabled =
      MMKVStorage.getBoolean('novelupdates_mark_chapters_enabled') ?? false;
    let finalProgress = notesProgress;
    let detailedProgress: any = {
      notesProgress,
      markedProgress: 0,
      progressDisplay: `${notesProgress}`,
    };
    if (markingEnabled) {
      try {
        const dp = await getDetailedProgress(novelId);
        markedProgress = dp.markedProgress;
        lastMarkedChapterId = dp.lastMarkedChapterId;
        finalProgress = dp.finalProgress;
        detailedProgress = dp;
      } catch (e) {}
    }

    const metadata = {
      novelId,
      alternativeTitles,
      slug,
      lastMarkedChapterId: lastMarkedChapterId || undefined,
      notesProgress: notesProgress,
      markedProgress: markedProgress,
      finalProgress: finalProgress,
      ...(notesVolumes ? { currentVolume: notesVolumes } : {}),
      ...(tags.length ? { tags } : {}),
    };

    return {
      status: statusMapping[listValue] || 'CURRENT',
      progress: Math.max(finalProgress, 0),
      ...(notesVolumes ? { volume: notesVolumes } : {}),
      score: 0,
      notes: notesTrackingEnabled && notesData.notes ? notesData.notes : '',
      alternativeTitles,
      ...(tags.length ? { genres: tags } : {}),
      metadata: JSON.stringify(metadata),
      progressDisplay:
        (notesVolumes ? `V.${notesVolumes} ` : '') +
        detailedProgress.progressDisplay,
    };
  } catch (error) {
    return {
      status: 'CURRENT',
      progress: 1,
      score: 0,
      notes: '',
      alternativeTitles: [],
      metadata: '',
    };
  }
};

const updateUserListEntry: Tracker['updateUserListEntry'] = async (
  id,
  payload,
  auth,
) => {
  if (!auth) {
    throw new Error('Not authenticated');
  }

  let novelId: string | undefined;
  let alternativeTitles: string[] = [];
  let tags: string[] = [];
  let slug = id;

  if (payload.metadata) {
    try {
      const metadata = JSON.parse(payload.metadata);
      if (metadata.novelId) {
        novelId = metadata.novelId;
      }
      if (metadata.alternativeTitles) {
        alternativeTitles = metadata.alternativeTitles;
      }
      if (metadata.slug) {
        slug = metadata.slug;
      }
    } catch (error) {}
  }

  if (!novelId) {
    const url = `${NOVEL_UPDATES_BASE_URL}/series/${slug}`;
    const result = await fetchApi(url);
    const body = await result.text();
    const loadedCheerio = load(body);
    novelId = getNovelId(loadedCheerio);
    try {
      const fetchAlt = MMKVStorage.getBoolean(
        'novelupdates_fetch_alternative_titles',
      );
      if (fetchAlt) {
        alternativeTitles = getAlternativeTitles(loadedCheerio);
        tags = getTags(loadedCheerio);
      }
    } catch {}
  }

  const listId =
    Object.entries(statusMapping).find(
      ([_, status]) => status === payload.status,
    )?.[0] || '0';

  if (payload.status !== undefined) {
    const updateUrl = `${NOVEL_UPDATES_BASE_URL}/updatelist.php?sid=${novelId}&lid=${listId}&act=move`;
    await fetchApi(updateUrl);
  }

  const notesTrackingEnabled =
    MMKVStorage.getBoolean('novelupdates_use_notes_tracking') ?? true;
  const markChaptersEnabled =
    MMKVStorage.getBoolean('novelupdates_mark_chapters_enabled') ?? false;
  if (!notesTrackingEnabled && !markChaptersEnabled) {
    MMKVStorage.set('novelupdates_use_notes_tracking', true);
  }

  if (
    notesTrackingEnabled &&
    (payload.progress !== undefined || payload.volume !== undefined)
  ) {
    const preserveUserNotes =
      MMKVStorage.getBoolean('novelupdates_preserve_user_notes') ?? true;

    let existingTags = '';
    let existingNotes = '';

    if (preserveUserNotes) {
      const getNotesUrl = `${NOVEL_UPDATES_BASE_URL}/wp-admin/admin-ajax.php`;
      const getNotesBody = `action=wi_notestagsfic&strSID=${novelId}`;

      const getNotesResponse = await fetchApi(getNotesUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: getNotesBody,
      });
      try {
        const responseText = await getNotesResponse.text();

        if (
          responseText.includes('<html>') ||
          responseText.includes('<body>') ||
          responseText.includes('<!DOCTYPE')
        ) {
          existingTags = '';
          existingNotes = '';
        } else {
          let cleanResponse = responseText.trim();
          const jsonMatch = cleanResponse.match(/^(\{.*\})/);
          if (jsonMatch) {
            cleanResponse = jsonMatch[1];
          }

          try {
            const notesData = JSON.parse(cleanResponse);
            existingTags = notesData.tags || '';
            existingNotes = notesData.notes || '';
          } catch (jsonError) {
            existingTags = '';
            existingNotes = responseText.trim();
          }
        }
      } catch (error) {
        existingTags = '';
        existingNotes = '';
      }
    }

    const totalChaptersRead =
      typeof payload.progress === 'number' ? payload.progress : undefined;
    const totalVolumesRead =
      typeof (payload as any).volume === 'number'
        ? ((payload as any).volume as number)
        : undefined;

    let baseNotes: string;
    if (preserveUserNotes) {
      baseNotes = existingNotes;
    } else {
      baseNotes = typeof payload.notes === 'string' ? payload.notes : '';
    }

    const updatedNotes = updateTrackingInNotes(
      baseNotes,
      totalChaptersRead,
      totalVolumesRead,
    );

    const updateNotesUrl = `${NOVEL_UPDATES_BASE_URL}/wp-admin/admin-ajax.php`;

    const formBody = new URLSearchParams({
      action: 'wi_rlnotes',
      strSID: novelId,
      strNotes: updatedNotes,
      strTags: existingTags,
    });

    await fetchApi(updateNotesUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    });
  }

  if (
    markChaptersEnabled &&
    payload.progress !== undefined &&
    payload.progress > 0
  ) {
    try {
      markChaptersUpToProgress(novelId, payload.progress, auth).catch(() => {});
    } catch (error) {}
  }

  const result: any = {
    status: payload.status || 'CURRENT',
    progress: payload.progress || 1,
    score: payload.score,
    notes: payload.notes,
    alternativeTitles,
    ...(tags.length ? { genres: tags } : {}),
    metadata: JSON.stringify({
      novelId,
      alternativeTitles,
      slug,
      ...(tags.length ? { tags } : {}),
    }),
    novelPluginId: (payload as any).novelPluginId,
    novelPath: (payload as any).novelPath,
    chapterName: (payload as any).chapterName,
    chapterPath: (payload as any).chapterPath,
  };

  if (typeof (payload as any).volume === 'number') {
    try {
      const md = result.metadata ? JSON.parse(result.metadata) : {};
      md.currentVolume = (payload as any).volume;
      result.metadata = JSON.stringify(md);
    } catch {}
    result.volume = (payload as any).volume;
  }

  return result;
};

export const novelUpdates: Tracker = {
  name: 'Novel-Updates',
  capabilities: {
    hasDynamicLists: true,
    hasStaticLists: false,
    supportsPagination: true,
    requiresAuth: true,
    supportsMetadataCache: true,
    supportsBulkSync: true,
    hasAlternativeTitles: true,
    supportsVolumes: true,
  },
  authenticate,
  handleSearch,
  getUserListEntry,
  updateUserListEntry,
  getAvailableReadingLists: getAvailableReadingListsForNovel,
  addToReadingList: addToReadingListForNovel,
  getEntryUrl: (track: any) => {
    try {
      const md = track?.metadata ? JSON.parse(track.metadata) : {};
      const sourceId = track?.sourceId ? String(track.sourceId) : undefined;
      const slug = /^\d+$/.test(sourceId || '')
        ? (md?.slug as string | undefined)
        : sourceId;
      if (slug) return `https://www.novelupdates.com/series/${slug}/`;
      const novelId = md?.novelId ? String(md.novelId) : undefined;
      if (novelId) return `https://www.novelupdates.com/?p=${novelId}`;
    } catch {}
    return null;
  },
};

export { getDetailedProgress, markChapterRead };
