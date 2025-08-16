import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
const ANILIST_CLIENT_ID = 28747;
const ANILIST_API_URL = 'https://graphql.anilist.co';
//const ANILIST_REDIRECT_URI = 'lnreader://auth/anilist';

const mapStatusToAniList = (status: string) => {
  const s = String(status || '').toUpperCase();
  switch (s) {
    case 'READING':
    case 'WATCHING':
      return 'CURRENT';
    case 'PLAN TO READ':
    case 'PLAN_TO_READ':
    case 'PLANNED':
      return 'PLANNING';
    case 'CURRENT':
      return 'CURRENT';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'PAUSED':
      return 'PAUSED';
    case 'DROPPED':
      return 'DROPPED';
    case 'PLANNING':
      return 'PLANNING';
    case 'REPEATING':
      return 'REPEATING';
    default:
      return 'CURRENT';
  }
};

const mapStatusFromAniList = status => {
  switch (status) {
    case 'CURRENT':
      return 'CURRENT';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'PAUSED':
      return 'PAUSED';
    case 'DROPPED':
      return 'DROPPED';
    case 'PLANNING':
      return 'PLANNING';
    case 'REPEATING':
      return 'REPEATING';
    default:
      return 'CURRENT';
  }
};
const getAniListListMeta = (normalizedStatus: string) => {
  const nameMap: Record<string, string> = {
    CURRENT: 'Reading',
    PLANNING: 'Planning',
    COMPLETED: 'Completed',
    PAUSED: 'Paused',
    DROPPED: 'Dropped',
    REPEATING: 'Repeating',
  };
  return {
    id: normalizedStatus,
    name: nameMap[normalizedStatus] || normalizedStatus,
  };
};
const getHeaders = auth => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  ...(auth && {
    Authorization: `Bearer ${auth}`,
  }),
});
const handleSearch = async (query, authentication, options) => {
  const page = options?.page || 1;
  const searchQuery = `
    query($page: Int = 1, $search: String, $format: [MediaFormat]) {
      Page(page: $page, perPage: 20) {
        pageInfo {
          total
          perPage
          currentPage
          lastPage
          hasNextPage
        }
        media(
          type: MANGA,
          format_in: $format,
          search: $search,
          sort: [POPULARITY_DESC, SCORE_DESC]
        ) {
          id
          title {
            english
            romaji
            native
            userPreferred
          }
          synonyms
          coverImage {
            medium
          }
          description(asHtml: false)
          type
          format
          status(version: 2)
          chapters
          volumes
          genres
          isAdult
          startDate {
            year
          }

        }
      }
    }
  `;
  const body = {
    query: searchQuery,
    variables: {
      page: page,
      search: query,
      format: ['NOVEL'],
    },
  };

  const headers = getHeaders(authentication?.accessToken);
  const requestBody = JSON.stringify(body);

  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers,
    body: requestBody,
  });

  const json = await response.json();

  if (json.errors) {
    throw new Error(json.errors[0].message);
  }
  const results = json.data.Page.media.map(item => ({
    id: item.id,
    title:
      item.title.userPreferred ||
      item.title.english ||
      item.title.romaji ||
      item.title.native,
    alternativeTitles: [
      ...(item.title.english ? [item.title.english] : []),
      ...(item.title.romaji ? [item.title.romaji] : []),
      ...(item.title.native ? [item.title.native] : []),
      ...(item.synonyms || []),
    ].filter(title => title && title.trim().length > 0),
    coverImage: item.coverImage?.large || item.coverImage?.medium,
    totalChapters: item.chapters,
    description: item.description,
    status: item.status,
    year: item.startDate?.year,
    genres: item.genres,
    author: item.staff?.edges?.find(edge => edge.role === 'Story')?.node?.name
      ?.full,
  }));
  return results;
};
const updateUserListEntry = async (id, payload, authentication) => {
  // If progress is not provided in payload, get existing progress to preserve it
  let finalProgress = payload.progress;
  if (finalProgress === undefined) {
    try {
      const existingEntry = await getUserListEntry(Number(id), authentication);
      if (existingEntry && typeof existingEntry.progress === 'number') {
        finalProgress = existingEntry.progress;
      }
    } catch (e) {}
  }

  const mutation = `
    mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus, $score: Float) {
      SaveMediaListEntry (mediaId: $mediaId, progress: $progress, status: $status, score: $score) {
        id
        status
        progress
        score
      }
    }
  `;
  const variables = {
    mediaId: Number(id),
    progress: finalProgress,
    status: payload.status ? mapStatusToAniList(payload.status) : undefined,
    score: payload.score,
  };

  const body = {
    query: mutation,
    variables,
  };

  const headers = getHeaders(authentication.accessToken);
  const requestBody = JSON.stringify(body);

  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers,
    body: requestBody,
  });

  const json = await response.json();

  if (json.errors) {
    throw new Error(json.errors[0].message);
  }
  const entry = json.data.SaveMediaListEntry;
  const normalized = mapStatusFromAniList(entry.status);
  const listMeta = getAniListListMeta(normalized);
  const result = {
    status: normalized,
    progress: entry.progress,
    score: entry.score,
    listId: listMeta.id,
    listName: listMeta.name,
  };

  return result;
};
const getUserListEntry = async (mediaId: number, authentication: any) => {
  const query = `
    query GetMediaListEntry($mediaId: Int, $userId: Int) {
      MediaList(mediaId: $mediaId, userId: $userId) {
        id
        mediaId
        progress
        status
        score
        notes
        startedAt {
          year
          month
          day
        }
        completedAt {
          year
          month
          day
        }
      }
    }
  `;
  const userQuery = `
    query {
      Viewer {
        id
      }
    }
  `;

  const userResponse = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: getHeaders(authentication.accessToken),
    body: JSON.stringify({
      query: userQuery,
    }),
  });

  const userJson = await userResponse.json();
  const userId = userJson.data?.Viewer?.id;

  if (!userId) {
    throw new Error('Could not get user ID from AniList');
  }

  const variables = {
    mediaId,
    userId,
  };

  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: getHeaders(authentication.accessToken),
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const result = await response.json();

  const entry = result.data?.MediaList || null;
  if (!entry) return null;

  const status = mapStatusFromAniList(entry.status);
  const listMeta = getAniListListMeta(status);

  const normalized = {
    status,
    progress: entry.progress,
    score: entry.score,
    notes: entry.notes,
    startDate: entry.startedAt,
    finishDate: entry.completedAt,
    listId: listMeta.id,
    listName: listMeta.name,
  };

  return normalized;
};
const authenticate = async () => {
  try {
    const redirectUri = Linking.createURL('auth/anilist');
    const authUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token`;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    if (result.type === 'success' && result.url) {
      const urlParts = result.url.split('#');
      if (urlParts.length > 1) {
        const params = new URLSearchParams(urlParts[1]);
        const accessToken = params.get('access_token');
        if (accessToken) {
          const tokenParts = accessToken.split('.');
          if (tokenParts.length === 3) {
            try {
              const payload = JSON.parse(atob(tokenParts[1]));
              const expiresAt = new Date(payload.exp * 1000);
              return {
                accessToken,
                expiresAt,
              };
            } catch (error) {
              return {
                accessToken,
                expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              };
            }
          }
        }
      }
    }
    throw new Error('Authentication failed or was cancelled');
  } catch (error) {
    throw new Error(
      `AniList authentication failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
  }
};
const getAvailableReadingLists = async (_id: any, _authentication: any) => {
  return [
    {
      id: 'CURRENT',
      name: 'Reading',
    },
    {
      id: 'PLANNING',
      name: 'Planning',
    },
    {
      id: 'COMPLETED',
      name: 'Completed',
    },
    {
      id: 'PAUSED',
      name: 'Paused',
    },
    {
      id: 'DROPPED',
      name: 'Dropped',
    },
    {
      id: 'REPEATING',
      name: 'Repeating',
    },
  ];
};
const addToReadingList = async (
  id: number | string,
  listId: string,
  authentication: any,
) => {
  const mediaId = Number(id);
  const progress = 0;
  const status = mapStatusToAniList(listId || 'CURRENT');
  const existingEntry = await getUserListEntry(mediaId, authentication);

  if (existingEntry && existingEntry.progress !== undefined) {
    const finalProgress = Math.max(progress, existingEntry.progress);
    return updateUserListEntry(
      mediaId,
      { progress: finalProgress, status },
      authentication,
    );
  } else {
    const mutation = `
      mutation SaveMediaListEntry($mediaId: Int, $progress: Int, $status: MediaListStatus) {
        SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
          id
          mediaId
          progress
          status
        }
      }
    `;

    const variables = {
      mediaId,
      progress,
      status,
    };

    const response = await fetch(ANILIST_API_URL, {
      method: 'POST',
      headers: getHeaders(authentication.accessToken),
      body: JSON.stringify({
        query: mutation,
        variables,
      }),
    });

    const result = await response.json();

    if (result.data?.SaveMediaListEntry) {
      return result.data.SaveMediaListEntry;
    }

    throw new Error('Failed to add to reading list');
  }
};
const getAllTrackedNovels = async (authentication: any) => {
  const query = `
    query ($userId: Int, $type: MediaType) {
      MediaListCollection(userId: $userId, type: $type) {
        lists {
          name
          entries {
            mediaId
            status
            progress
            media {
              id
              siteUrl
              format
            }
          }
        }
      }
    }
  `;
  const userQuery = `
    query {
      Viewer {
        id
      }
    }
  `;
  const userResponse = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: getHeaders(authentication.accessToken),
    body: JSON.stringify({
      query: userQuery,
    }),
  });
  const userJson = await userResponse.json();
  const userId = userJson.data?.Viewer?.id;
  if (!userId) {
    throw new Error('Could not get user ID from AniList');
  }
  const variables = {
    userId,
    type: 'MANGA',
  };
  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: getHeaders(authentication.accessToken),
    body: JSON.stringify({
      query,
      variables,
    }),
  });
  const json = await response.json();
  if (json.errors) {
    throw new Error(json.errors[0].message);
  }
  const novels = [];
  const lists = json.data?.MediaListCollection?.lists || [];
  for (const list of lists) {
    for (const entry of list.entries || []) {
      if (entry.media?.format === 'NOVEL') {
        novels.push({
          id: String(entry.mediaId),
          title:
            entry.media.title?.userPreferred ||
            entry.media.title?.romaji ||
            'Unknown',
          siteUrl: entry.media.siteUrl,
          status: mapStatusFromAniList(entry.status),
          progress: entry.progress || 0,
          totalChapters: entry.media.chapters,
          notes: entry.notes || '',
        });
      }
    }
  }
  return novels;
};
export const anilist = {
  name: 'AniList',
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
  handleSearch,
  updateUserListEntry,
  getUserListEntry,
  getAvailableReadingLists,
  addToReadingList,
  getAllTrackedNovels,
  getEntryUrl: (track: any) => {
    const id = String(track?.sourceId);
    return id ? `https://anilist.co/manga/${id}` : null;
  },
};
