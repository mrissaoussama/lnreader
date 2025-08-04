import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { ANILIST_CLIENT_ID } from '@env';

const ANILIST_API_URL = 'https://graphql.anilist.co';
//const ANILIST_REDIRECT_URI = 'lnreader://auth/anilist';

const mapStatusToAniList = status => {
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
          coverImage {
            medium
            color
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

  // First, try to get existing entry to get the list ID
  /* let existingListId = null;
  try {
    const existingEntry = await getUserListEntry(id, authentication);
    // Check if entry has metadata with listId
    if (
      existingEntry &&
      'metadata' in existingEntry &&
      existingEntry.metadata
    ) {
      //try {
     //   const metadata = JSON.parse(existingEntry.metadata);
      //  existingListId = metadata.listId;
    //  } catch (e) {
     // }
    }
  } catch (e) {
  }
*/
  const variables = {
    mediaId: Number(id),
    progress: payload.progress,
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
  return {
    status: mapStatusFromAniList(entry.status),
    progress: entry.progress,
    score: entry.score,
  };
};
const getUserListEntry = async (id, authentication) => {
  const query = `
    query ($mediaId: Int) {
      Media(id: $mediaId) {
        id
        title {
          userPreferred
          english
          romaji
          native
        }
        mediaListEntry {
          id
          mediaId
          status
          score
          progress
        }
      }
    }
  `;
  const body = {
    query,
    variables: {
      mediaId: Number(id),
    },
  };

  const headers = getHeaders(authentication.accessToken);

  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const json = await response.json();

  if (json.errors) {
    throw new Error(json.errors[0].message);
  }

  const media = json.data.Media;

  if (!media || !media.mediaListEntry) {
    return {
      status: 'CURRENT',
      progress: 0,
      score: 0,
    };
  }

  const entry = media.mediaListEntry;

  const result = {
    status: mapStatusFromAniList(entry.status),
    progress: entry.progress || 0,
    score: entry.score || 0,
    metadata: JSON.stringify({ listId: entry.id }), // Include list ID in metadata
  };

  return result;
};
const authenticate = async () => {
  try {
    // Register the redirect URI
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
const getAvailableReadingLists = async (_id, _authentication) => {
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
const addToReadingList = async (id, listId, authentication) => {
  const mutation = `
    mutation ($mediaId: Int, $status: MediaListStatus) {
      SaveMediaListEntry (mediaId: $mediaId, status: $status, progress: 0) {
        id
        status
        progress
      }
    }
  `;
  const variables = {
    mediaId: Number(id),
    status: listId,
  };
  const body = {
    query: mutation,
    variables,
  };
  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: getHeaders(authentication.accessToken),
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (json.errors) {
    throw new Error(json.errors[0].message);
  }
};
const getAllTrackedNovels = async authentication => {
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
  },
  authenticate,
  handleSearch,
  updateUserListEntry,
  getUserListEntry,
  getAvailableReadingLists,
  addToReadingList,
  getAllTrackedNovels,
};
