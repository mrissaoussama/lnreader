import { Tracker, SearchResult, UserListStatus } from './types';
import { fetchApi } from '../../plugins/helpers/fetch';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import CookieManager from '@react-native-cookies/cookies';

const NOVELLIST_BASE_URL =
  'https://novellist-be-960019704910.asia-east1.run.app';

const mapStatusFromNovellist = (status: string): UserListStatus => {
  switch (status) {
    case 'IN_PROGRESS':
      return 'CURRENT';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'PLANNED':
      return 'PLANNING';
    case 'DROPPED':
      return 'DROPPED';
    default:
      return 'CURRENT';
  }
};

const extractTokenFromCookie = async (): Promise<string | null> => {
  try {
    const cookies = await CookieManager.get('https://www.novellist.co');

    let cookieValue: string | null = null;

    if (cookies.novellist) {
      cookieValue = cookies.novellist.value;
    } else {
      const alternativeCookies = await CookieManager.get(NOVELLIST_BASE_URL);

      if (alternativeCookies.novellist) {
        cookieValue = alternativeCookies.novellist.value;
      } else {
        return null;
      }
    }

    if (cookieValue && cookieValue.startsWith('base64-')) {
      const base64Part = cookieValue.replace('base64-', '');

      try {
        const decodedString = atob(base64Part);

        const parsedData = JSON.parse(decodedString);

        if (parsedData.access_token) {
          return parsedData.access_token;
        } else {
          return null;
        }
      } catch (decodeError) {
        return null;
      }
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
};

const authenticate: Tracker['authenticate'] = async () => {
  try {
    const token = await extractTokenFromCookie();

    if (token) {
      return {
        accessToken: token,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        meta: {
          message:
            'Successfully authenticated with Novellist using browser cookies.',
        },
      };
    }
  } catch (error) {}

  return {
    accessToken: 'webview_auth_required',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    meta: {
      message: 'Please login to Novellist through your browser.',
      cookieExtraction: true,
      cookieName: 'novellist',
      cookieDomain: 'https://www.novellist.co',
    },
  };
};

const getNovellistListMeta = (normalizedStatus: UserListStatus) => {
  switch (normalizedStatus) {
    case 'CURRENT':
      return { id: 'IN_PROGRESS', name: 'Reading' };
    case 'PLANNING':
      return { id: 'PLANNED', name: 'Want to Read' };
    case 'COMPLETED':
      return { id: 'COMPLETED', name: 'Completed' };
    case 'DROPPED':
      return { id: 'DROPPED', name: 'Dropped' };
    case 'PAUSED':
      return { id: 'PLANNED', name: 'Want to Read' };
    default:
      return { id: 'IN_PROGRESS', name: 'Reading' };
  }
};

const getAuthHeaders = (authentication: any): Record<string, string> => {
  const baseHeaders = {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Origin': 'https://www.novellist.co',
    'Referer': 'https://www.novellist.co/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
  };

  if (
    authentication?.accessToken &&
    authentication.accessToken !== 'webview_auth_required'
  ) {
    return {
      ...baseHeaders,
      'Authorization': `Bearer ${authentication.accessToken}`,
    };
  }

  return baseHeaders;
};

const checkAuthentication = (authentication?: any): boolean => {
  return (
    authentication?.accessToken &&
    authentication.accessToken !== 'manual_auth' &&
    authentication.accessToken !== 'webview_auth_required' &&
    authentication.accessToken !== '' &&
    authentication.accessToken.length > 10
  );
};

const handleSearch: Tracker['handleSearch'] = async (
  searchParams,
  authentication,
  options,
) => {
  try {
    const page = options?.page || 1;
    const response = await fetchApi(`${NOVELLIST_BASE_URL}/api/novels/filter`, {
      method: 'POST',
      headers: getAuthHeaders(authentication),
      body: JSON.stringify({
        page: page,
        sort_order: 'MOST_TRENDING',
        title_search_query: searchParams,
        language: 'UNKNOWN',
        label_ids: [],
        excluded_label_ids: [],
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(`Novellist search failed: ${response.status}`);
    }

    let results: SearchResult[] = [];
    if (Array.isArray(responseData)) {
      results = responseData.map((item: any) => ({
        id: item.id,
        slug: item.slug,
        title: item.english_title || item.raw_title || item.title,
        coverImage: item.cover_image_link || item.image_url,
        description: item.description,
        author: item.publisher,
        genres: item.labels?.map((label: any) => label.name) || [],
        status: item.status,
        alternativeTitles: [
          ...(item.english_title &&
          item.english_title !== (item.raw_title || item.title)
            ? [item.english_title]
            : []),
          ...(item.raw_title && item.raw_title !== item.english_title
            ? [item.raw_title]
            : []),
          ...(item.title &&
          item.title !== item.english_title &&
          item.title !== item.raw_title
            ? [item.title]
            : []),
          ...(item.alternate_titles || []),
        ].filter((title, index, arr) => title && arr.indexOf(title) === index),
        __trackerMeta: {
          novellistSlug: item.slug,
        },
      }));
    }

    return results;
  } catch (error) {
    throw new Error(`Novellist search failed: ${error}`);
  }
};

const getUserListEntry: Tracker['getUserListEntry'] = async (
  id,
  authentication,
) => {
  if (!checkAuthentication(authentication)) {
    throw new Error(
      'Not logged in to Novellist. Please login through your browser and ensure the authentication token is properly set.',
    );
  }

  try {
    const response = await fetchApi(
      `${NOVELLIST_BASE_URL}/api/users/current/reading-list/${id}`,
      {
        method: 'GET',
        headers: getAuthHeaders(authentication),
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return {
          status: 'CURRENT',
          progress: 0,
        };
      }
      if (response.status === 401) {
        throw new Error(
          'Not logged in to Novellist. Please login through your browser first.',
        );
      }
      throw new Error(`Failed to get reading list entry: ${response.status}`);
    }

    const data = await response.json();

    let novelMetadata: any = null;
    try {
      const wantAlt = MMKVStorage.getBoolean(
        'novellist_fetch_alternative_titles',
      );
      if (wantAlt) {
        const metaRes = await fetchApi(
          `${NOVELLIST_BASE_URL}/api/novels/${id}`,
          {
            method: 'GET',
            headers: getAuthHeaders(authentication),
          },
        );
        if (metaRes.ok) {
          novelMetadata = await metaRes.json();
        }
      }
    } catch {}

    const normalized = mapStatusFromNovellist(data.status);

    let extractedVolume: number | undefined;
    try {
      const text = (data.note || '').toString().replace(/\r\n/g, '\n');
      const volMatch = text.match(/total\s+volumes\s+read:\s*(\d+)/i);
      if (volMatch && volMatch[1]) {
        extractedVolume = parseInt(volMatch[1], 10);
      }
    } catch {}
    const listMeta = getNovellistListMeta(normalized);

    const result: any = {
      status: normalized,
      progress: data.chapter_count || 0,
      score: data.rating || undefined,
      notes: data.note || undefined,
      listId: listMeta.id,
      listName: listMeta.name,
    };

    if (typeof extractedVolume === 'number' && !isNaN(extractedVolume)) {
      result.volume = extractedVolume;
      result.progressDisplay = `V.${extractedVolume} Ch.${result.progress}`;
    }

    if (novelMetadata) {
      const nm: any = novelMetadata as any;
      result.alternativeTitles = [
        ...(nm?.english_title && nm.english_title !== (nm.raw_title || nm.title)
          ? [nm.english_title]
          : []),
        ...(nm?.raw_title && nm.raw_title !== nm.english_title
          ? [nm.raw_title]
          : []),
        ...(nm?.title &&
        nm.title !== nm.english_title &&
        nm.title !== nm.raw_title
          ? [nm.title]
          : []),
      ].filter((title, index, arr) => title && arr.indexOf(title) === index);
    }

    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    return {
      status: 'CURRENT',
      progress: 0,
    };
  }
};

const mapStatusToNovellist = (status: UserListStatus): string => {
  switch (status) {
    case 'CURRENT':
      return 'IN_PROGRESS';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'PLANNING':
      return 'PLANNED';
    case 'DROPPED':
      return 'DROPPED';
    case 'PAUSED':
      return 'PLANNED';
    default:
      return 'IN_PROGRESS';
  }
};

const updateUserListEntry: Tracker['updateUserListEntry'] = async (
  id,
  payload,
  authentication,
) => {
  if (!checkAuthentication(authentication)) {
    throw new Error(
      'Not logged in to Novellist. Please login through your browser and ensure the authentication token is properly set.',
    );
  }

  try {
    let existingData = null;
    try {
      const currentResponse = await fetchApi(
        `${NOVELLIST_BASE_URL}/api/users/current/reading-list/${id}`,
        {
          method: 'GET',
          headers: getAuthHeaders(authentication),
        },
      );

      if (currentResponse.ok) {
        existingData = await currentResponse.json();
      }
    } catch (e) {}

    const requestBody: any = {};

    if (
      payload.progress !== undefined &&
      payload.progress !== (existingData?.chapter_count || 0)
    ) {
      requestBody.chapter_count = payload.progress;
    }

    if (
      payload.score !== undefined &&
      payload.score !== (existingData?.rating || undefined)
    ) {
      requestBody.rating = payload.score;
    }
    if (payload.status !== undefined) {
      const newMappedStatus = mapStatusToNovellist(payload.status);
      const currentMappedStatus = existingData?.status;

      if (newMappedStatus !== currentMappedStatus) {
        requestBody.status = newMappedStatus;
      }
    }

    const mergeVolumeIntoNotes = (
      baseNotes: string | undefined,
      vol?: number,
    ): string => {
      const raw = (baseNotes || '').toString().replace(/\r\n/g, '\n');
      if (typeof vol !== 'number' || isNaN(vol)) {
        return raw;
      }
      const lines = raw.split('\n');
      const pattern = /^\s*total\s+volumes\s+read:\s*\d+\s*$/i;
      let found = false;
      const updated = lines.map(line => {
        if (pattern.test(line)) {
          found = true;
          return `total volumes read: ${vol}`;
        }
        return line;
      });
      if (!found) updated.push(`total volumes read: ${vol}`);
      return updated.join('\n');
    };

    const desiredVolume =
      typeof (payload as any).volume === 'number'
        ? ((payload as any).volume as number)
        : undefined;

    let metaCurrentVolume: number | undefined;
    try {
      if (payload.metadata) {
        const md = JSON.parse(payload.metadata as string);
        if (typeof md?.currentVolume === 'number') {
          metaCurrentVolume = md.currentVolume;
        }
      }
    } catch {}

    let noteCurrentVolume: number | undefined;
    try {
      const txt = (existingData?.note || '').toString().replace(/\r\n/g, '\n');
      const m = txt.match(/total\s+volumes\s+read:\s*(\d+)/i);
      if (m && m[1]) {
        noteCurrentVolume = parseInt(m[1], 10);
      }
    } catch {}

    const volumeUnchanged =
      typeof desiredVolume === 'number' &&
      (desiredVolume === metaCurrentVolume ||
        desiredVolume === noteCurrentVolume);

    const preserveExistingNotes =
      MMKVStorage.getBoolean('novellist_preserve_user_notes') ?? true;

    if (payload.notes !== undefined) {
      const newNote = volumeUnchanged
        ? mergeVolumeIntoNotes(payload.notes)
        : mergeVolumeIntoNotes(payload.notes, desiredVolume);
      if (newNote !== (existingData?.note || '')) {
        requestBody.note = newNote;
      }
    } else if (typeof desiredVolume === 'number' && !volumeUnchanged) {
      if (preserveExistingNotes) {
        const newNote = mergeVolumeIntoNotes(
          existingData?.note || '',
          desiredVolume,
        );
        if (newNote !== (existingData?.note || '')) {
          requestBody.note = newNote;
        }
      } else {
        const volumeOnlyNote = `total volumes read: ${desiredVolume}`;
        if (volumeOnlyNote !== (existingData?.note || '')) {
          requestBody.note = volumeOnlyNote;
        }
      }
    }

    if (Object.keys(requestBody).length === 0) {
      return {
        status: existingData?.status
          ? mapStatusFromNovellist(existingData.status)
          : 'CURRENT',
        progress: existingData?.chapter_count || 0,
        score: existingData?.rating,
        notes: existingData?.note,
      };
    }
    try {
      await fetchApi(
        `${NOVELLIST_BASE_URL}/api/users/current/reading-list/${id}`,
        {
          method: 'OPTIONS',
          headers: {
            'Accept': '*/*',
            'Access-Control-Request-Method': 'PUT',
            'Access-Control-Request-Headers': 'authorization,content-type',
            'Origin': 'https://www.novellist.co',
            'Referer': 'https://www.novellist.co/',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
          },
        },
      );
    } catch (optionsError) {}

    const response = await fetchApi(
      `${NOVELLIST_BASE_URL}/api/users/current/reading-list/${id}`,
      {
        method: 'PUT',
        headers: getAuthHeaders(authentication),
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          'Not logged in to Novellist. Please login through your browser first.',
        );
      }
      throw new Error(
        `[NOVELLIST UPDATE] Update failed with status: ${response.status}, id: ${id}`,
      );
    }

    const novelMetadata: any = null;

    let normalizedStatus: UserListStatus = 'CURRENT';
    if (requestBody.status && typeof requestBody.status === 'string') {
      normalizedStatus = mapStatusFromNovellist(requestBody.status as string);
    } else if (existingData?.status) {
      normalizedStatus = mapStatusFromNovellist(existingData.status);
    } else if (payload.status) {
      normalizedStatus = payload.status;
    }

    const listMeta = getNovellistListMeta(normalizedStatus);

    const result: any = {
      status: normalizedStatus,
      progress:
        payload.progress !== undefined
          ? payload.progress
          : existingData?.chapter_count || 0,
      score: payload.score ?? existingData?.rating,
      notes:
        requestBody.note !== undefined ? requestBody.note : existingData?.note,
      listId: listMeta.id,
      listName: listMeta.name,
    };

    if (typeof (payload as any).volume === 'number') {
      result.volume = (payload as any).volume;
      result.progressDisplay = `V.${result.volume} Ch.${result.progress}`;
    } else {
      try {
        const text = (result.notes || '').toString().replace(/\r\n/g, '\n');
        const volMatch = text.match(/total\s+volumes\s+read:\s*(\d+)/i);
        if (volMatch && volMatch[1]) {
          result.volume = parseInt(volMatch[1], 10);
          result.progressDisplay = `V.${result.volume} Ch.${result.progress}`;
        }
      } catch {}
    }

    if (novelMetadata) {
      const nm: any = novelMetadata as any;
      result.alternativeTitles = [
        ...(nm?.english_title && nm.english_title !== (nm.raw_title || nm.title)
          ? [nm.english_title]
          : []),
        ...(nm?.raw_title && nm.raw_title !== nm.english_title
          ? [nm.raw_title]
          : []),
        ...(nm?.title &&
        nm.title !== nm.english_title &&
        nm.title !== nm.raw_title
          ? [nm.title]
          : []),
      ].filter((title, index, arr) => title && arr.indexOf(title) === index);
    }

    return result;
  } catch (error) {
    throw new Error(`Failed to update id: ${id}: ${error}`);
  }
};

const getAvailableReadingLists: Tracker['getAvailableReadingLists'] = async (
  _id,
  _authentication,
) => {
  return [
    { id: 'IN_PROGRESS', name: 'Reading' },
    { id: 'PLANNED', name: 'Want to Read' },
    { id: 'COMPLETED', name: 'Completed' },
    { id: 'DROPPED', name: 'Dropped' },
  ];
};
const addToReadingList: Tracker['addToReadingList'] = async (
  id,
  listId,
  authentication,
) => {
  if (!checkAuthentication(authentication)) {
    throw new Error(
      'Not logged in to Novellist. Please login through your browser and ensure the authentication token is properly set.',
    );
  }

  try {
    const headers = getAuthHeaders(authentication);

    let existingData = null;
    try {
      const currentResponse = await fetchApi(
        `${NOVELLIST_BASE_URL}/api/users/current/reading-list/${id}`,
        {
          method: 'GET',
          headers,
        },
      );

      if (currentResponse.ok) {
        existingData = await currentResponse.json();
      }
    } catch (e) {}
    const requestBody = existingData
      ? {
          status: listId,
          rating: existingData.rating || 0,
          chapter_count: existingData.chapter_count || 0,
          note: existingData.note || '',
        }
      : {
          status: listId,
        };

    const url = `${NOVELLIST_BASE_URL}/api/users/current/reading-list/${id}`;

    // Send OPTIONS request first (CORS preflight) like the browser does
    try {
      await fetchApi(url, {
        method: 'OPTIONS',
        headers: {
          'Accept': '*/*',
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'authorization,content-type',
          'Origin': 'https://www.novellist.co',
          'Referer': 'https://www.novellist.co/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site',
        },
      });
    } catch (optionsError) {}
    const response = await fetchApi(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          'Not logged in to Novellist. Please login through your browser first.',
        );
      }
      throw new Error(`Failed to add to reading list: ${response.status}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to add to Novellist reading list: ${error}`);
  }
};

// Helper function to decode JWT and extract username
const getUsernameFromToken = (token: string): string | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const paddedPayload = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decodedPayload = atob(
      paddedPayload.replace(/-/g, '+').replace(/_/g, '/'),
    );
    const parsedPayload = JSON.parse(decodedPayload);

    return parsedPayload.user_metadata?.fullName || null;
  } catch (error) {
    return null;
  }
};

const getAllTrackedNovels = async (
  authentication: any,
): Promise<
  Array<{
    id: string;
    title: string;
    siteUrl?: string;
    status: UserListStatus;
    progress: number;
    totalChapters?: number;
    notes?: string;
  }>
> => {
  if (!checkAuthentication(authentication)) {
    throw new Error('Not authenticated with Novellist');
  }

  const username = getUsernameFromToken(authentication.accessToken);
  if (!username) {
    throw new Error('Could not extract username from Novellist token');
  }

  const url = `https://www.novellist.co/users/${username}`;
  const response = await fetchApi(url, {
    method: 'GET',
    headers: getAuthHeaders(authentication),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user profile: ${response.status}`);
  }

  const html = await response.text();

  const scriptRegex =
    /self\.__next_f\.push\(\[1,\s*"[^"]*\\"listNovels\\":\[([^\]]+)\]/;
  const match = html.match(scriptRegex);

  if (!match) {
    throw new Error('Could not find novel list data in profile page');
  }

  let jsonStr = match[1];
  jsonStr = jsonStr
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\\n')
    .replace(/\\\\/g, '\\');

  let novels: any[];
  try {
    const fullJsonMatch = html.match(/"listNovels":\[([^\]]+)\]/);
    if (fullJsonMatch) {
      const cleanJson = fullJsonMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\\n')
        .replace(/\\\\/g, '\\');
      novels = JSON.parse(`[${cleanJson}]`);
    } else {
      novels = JSON.parse(`[${jsonStr}]`);
    }
  } catch (error) {
    throw new Error('Failed to parse novel list data');
  }

  const result: Array<{
    id: string;
    title: string;
    siteUrl?: string;
    status: UserListStatus;
    progress: number;
    totalChapters?: number;
    notes?: string;
  }> = [];

  for (const item of novels) {
    if (item.novel) {
      let status: UserListStatus = 'CURRENT';

      switch (item.status) {
        case 'IN_PROGRESS':
          status = 'CURRENT';
          break;
        case 'COMPLETED':
          status = 'COMPLETED';
          break;
        case 'DROPPED':
          status = 'DROPPED';
          break;
        case 'PLAN_TO_READ':
          status = 'PLANNING';
          break;
        case 'ON_HOLD':
          status = 'PAUSED';
          break;
        default:
          status = 'CURRENT';
      }

      result.push({
        id: item.novel.id,
        title: item.novel.english_title || item.novel.raw_title || 'Unknown',
        siteUrl: `https://www.novellist.co/novel/${item.novel.slug}`,
        status,
        progress: item.chapter_count || 0,
        totalChapters: item.novel.chapter_count || undefined,
        notes: item.note || '',
      });
    }
  }

  return result;
};

export const novellist: Tracker = {
  name: 'Novellist',
  capabilities: {
    hasDynamicLists: false,
    hasStaticLists: true,
    supportsPagination: true,
    requiresAuth: true,
    supportsMetadataCache: false,
    supportsBulkSync: true,
    hasAlternativeTitles: true,
    supportsVolumes: true,
  },
  authenticate,
  handleSearch,
  updateUserListEntry,
  getUserListEntry,
  getAvailableReadingLists,
  addToReadingList,
  getAllTrackedNovels,
  getEntryUrl: (track: any) => {
    try {
      const md = track?.metadata ? JSON.parse(track.metadata) : {};
      const slug = md?.slug ?? md?.novellistSlug;
      if (slug) return `https://www.novellist.co/novels/${slug}`;
      const id = track?.sourceId ? String(track.sourceId) : undefined;
      if (id) return `https://www.novellist.co/novels/${id}`;
    } catch {}
    return null;
  },
};
