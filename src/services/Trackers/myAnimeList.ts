import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

const MAL_API_URL = 'https://api.myanimelist.net/v2';
const MAL_CLIENT_ID = '6e1bab746c4167008a34b2c432d57111';
const BASE_OAUTH_URL = 'https://myanimelist.net/v1/oauth2';
let codeVerifier = '';

/**
 * Map app status to MyAnimeList status format
 */
const mapStatusToMAL = status => {
  switch (status) {
    case 'CURRENT':
      return 'reading';
    case 'COMPLETED':
      return 'completed';
    case 'PAUSED':
      return 'on_hold';
    case 'DROPPED':
      return 'dropped';
    case 'PLANNING':
      return 'plan_to_read';
    case 'REPEATING':
      return 'reading';
    default:
      return 'reading';
  }
};
const mapStatusFromMAL = status => {
  switch (status) {
    case 'reading':
      return 'CURRENT';
    case 'completed':
      return 'COMPLETED';
    case 'on_hold':
      return 'PAUSED';
    case 'dropped':
      return 'DROPPED';
    case 'plan_to_read':
      return 'PLANNING';
    default:
      return 'CURRENT';
  }
};
const getHeaders = auth => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'X-MAL-CLIENT-ID': MAL_CLIENT_ID,
  Authorization: `Bearer ${auth}`,
});
const handleSearch = async (query, authentication, _options) => {
  if (!authentication?.accessToken) {
    throw new Error('Authentication required for MyAnimeList search');
  }

  const searchUrl = `${MAL_API_URL}/manga?q=${encodeURIComponent(
    query,
  )}&limit=50&fields=id,title,alternative_titles,main_picture,num_chapters,synopsis,status,start_date,genres,authors,media_type`;
  const headers = getHeaders(authentication.accessToken);

  const response = await fetch(searchUrl, {
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MAL API error: ${response.status} - ${errorText}`);
  }
  const json = await response.json();
  const filteredData = json.data.filter(item => {
    const mediaType = item.node.media_type;
    return mediaType === 'novel' || mediaType === 'light_novel';
  });
  const seenIds = new Set();
  const uniqueData = filteredData.filter(item => {
    const id = item.node.id;
    if (seenIds.has(id)) {
      return false;
    }
    seenIds.add(id);
    return true;
  });
  return uniqueData.map(item => ({
    id: item.node.id,
    title: item.node.title,
    coverImage: item.node.main_picture?.large || item.node.main_picture?.medium,
    totalChapters: item.node.num_chapters,
    description: item.node.synopsis,
    status: item.node.status,
    year: item.node.start_date
      ? new Date(item.node.start_date).getFullYear()
      : undefined,
    genres: item.node.genres?.map(g => g.name),
    author:
      item.node.authors?.[0]?.node?.first_name &&
      item.node.authors?.[0]?.node?.last_name
        ? `${item.node.authors[0].node.first_name} ${item.node.authors[0].node.last_name}`
        : undefined,
    alternativeTitles: [
      ...(item.node.alternative_titles?.en
        ? [item.node.alternative_titles.en]
        : []),
      ...(item.node.alternative_titles?.ja
        ? [item.node.alternative_titles.ja]
        : []),
      ...(item.node.alternative_titles?.synonyms || []),
    ].filter(
      (title, index, arr) =>
        title && title !== item.node.title && arr.indexOf(title) === index,
    ),
  }));
};
const updateUserListEntry = async (id, payload, authentication) => {
  const body = {};
  if (payload.status) {
    body.status = mapStatusToMAL(payload.status);
  }
  if (payload.progress !== undefined) {
    body.num_chapters_read = payload.progress;
  }
  if (payload.score !== undefined) {
    body.score = payload.score;
  }
  if (payload.notes !== undefined) {
    body.comments = payload.notes;
  }
  if (payload.status === 'REPEATING') {
    body.is_rereading = true;
  }

  const headers = {
    ...getHeaders(authentication.accessToken),
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const bodyString = new URLSearchParams(body).toString();

  const response = await fetch(`${MAL_API_URL}/manga/${id}/my_list_status`, {
    method: 'PUT',
    headers,
    body: bodyString,
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(`MAL API error: ${response.status} - ${errorText}`);
  }

  const json = await response.json();

  return {
    status: mapStatusFromMAL(json.status),
    progress: json.num_chapters_read || 0,
    score: json.score,
    notes: json.comments,
    startDate: json.start_date,
    finishDate: json.finish_date,
  };
};
const getUserListEntry = async (id, authentication) => {
  const headers = getHeaders(authentication.accessToken);
  const url = `${MAL_API_URL}/manga/${id}?fields=my_list_status`;

  const response = await fetch(url, {
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(`MAL API error: ${errorText}`);
  }

  const json = await response.json();

  if (!json.my_list_status) {
    return {
      status: 'CURRENT',
      progress: 0,
    };
  }
  const entry = json.my_list_status;

  const result = {
    status: mapStatusFromMAL(entry.status),
    progress: entry.num_chapters_read || 0,
    score: entry.score,
    notes: entry.comments,
    startDate: entry.start_date,
    finishDate: entry.finish_date,
  };

  return result;
};
const generateCodeVerifier = () => {
  const array = new Uint8Array(32);
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  const result = btoa(String.fromCharCode.apply(null, Array.from(array)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const equalsRegex = new RegExp('=+$');
  return result.replace(equalsRegex, '');
};
const getPkceChallengeCode = () => {
  codeVerifier = generateCodeVerifier();
  return codeVerifier; // Plain method, challenge = verifier
};

// Build auth URL similar to Aniyomi
const buildAuthUrl = () => {
  const authParams = new URLSearchParams({
    client_id: MAL_CLIENT_ID,
    code_challenge: getPkceChallengeCode(),
    response_type: 'code',
  });
  return `${BASE_OAUTH_URL}/authorize?${authParams.toString()}`;
};
const authenticate = async () => {
  try {
    const authUrl = buildAuthUrl();
    const redirectUri = Linking.createURL('auth/mal');
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    if (result.type === 'success' && result.url) {
      const url = new URL(result.url);
      const authCode = url.searchParams.get('code');
      if (!authCode) {
        throw new Error('No authorization code received');
      }
      const formData = new URLSearchParams({
        client_id: MAL_CLIENT_ID,
        code: authCode,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
      });
      const tokenResponse = await fetch(`${BASE_OAUTH_URL}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });
      if (!tokenResponse.ok) {
        const errorBody = await tokenResponse.text();
        throw new Error(
          `Token exchange failed: ${tokenResponse.status} - ${errorBody}`,
        );
      }
      const tokenData = await tokenResponse.json();
      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      };
    }
    throw new Error('Authentication was cancelled or failed');
  } catch (error) {
    throw new Error(
      `MyAnimeList authentication failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
  }
};
const revalidate = async auth => {
  try {
    if (!auth.refreshToken) {
      throw new Error('No refresh token available');
    }
    const formData = new URLSearchParams({
      client_id: MAL_CLIENT_ID,
      refresh_token: auth.refreshToken,
      grant_type: 'refresh_token',
    });
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${auth.accessToken}`,
    };
    const tokenResponse = await fetch(`${BASE_OAUTH_URL}/token`, {
      method: 'POST',
      headers,
      body: formData.toString(),
    });
    if (tokenResponse.status === 401) {
      throw new Error('Refresh token expired - please login again');
    }
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(
        `Token refresh failed: ${tokenResponse.status} ${errorText}`,
      );
    }
    const tokenData = await tokenResponse.json();
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || auth.refreshToken,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
    };
  } catch (error) {
    throw new Error(
      `MyAnimeList revalidation failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
  }
};
const getAvailableReadingLists = async (_id, _authentication) => {
  return [
    {
      id: 'reading',
      name: 'Reading',
    },
    {
      id: 'plan_to_read',
      name: 'Plan to Read',
    },
    {
      id: 'completed',
      name: 'Completed',
    },
    {
      id: 'on_hold',
      name: 'On Hold',
    },
    {
      id: 'dropped',
      name: 'Dropped',
    },
  ];
};
const addToReadingList = async (id, listId, authentication) => {
  const body = {
    status: listId,
  };
  const response = await fetch(`${MAL_API_URL}/manga/${id}/my_list_status`, {
    method: 'PUT',
    headers: {
      ...getHeaders(authentication.accessToken),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MAL API error: ${response.status} - ${errorText}`);
  }
};
const getAllTrackedNovels = async authentication => {
  const novels = [];
  let offset = 0;
  const limit = 1000;
  let hasMore = true;
  while (hasMore) {
    const response = await fetch(
      `${MAL_API_URL}/users/@me/mangalist?fields=list_status&limit=${limit}&offset=${offset}`,
      {
        method: 'GET',
        headers: getHeaders(authentication.accessToken),
      },
    );
    if (!response.ok) {
      throw new Error(`MAL API error: ${response.status}`);
    }
    const json = await response.json();
    const data = json.data || [];
    for (const item of data) {
      if (item.node?.media_type === 'light_novel' && item.list_status) {
        novels.push({
          id: String(item.node.id),
          title: item.node.title || 'Unknown',
          siteUrl: `https://myanimelist.net/manga/${item.node.id}`,
          status: mapStatusFromMAL(item.list_status.status),
          progress: item.list_status.num_chapters_read || 0,
          totalChapters: item.node.num_chapters,
          notes: item.list_status.comments || '',
        });
      }
    }

    // Check if there are more results
    hasMore = data.length === limit;
    offset += limit;
  }
  return novels;
};
export const myAnimeList = {
  name: 'MyAnimeList',
  capabilities: {
    hasDynamicLists: false,
    hasStaticLists: true,
    supportsPagination: true,
    requiresAuth: true,
    supportsMetadataCache: false,
    supportsBulkSync: true,
    hasAlternativeTitles: true,
  },
  authenticate,
  revalidate,
  handleSearch,
  updateUserListEntry,
  getUserListEntry,
  getAvailableReadingLists,
  addToReadingList,
  getAllTrackedNovels,
};
