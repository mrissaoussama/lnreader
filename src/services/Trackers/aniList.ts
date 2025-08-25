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

const mapStatusFromAniList = (status: string) => {
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
const getHeaders = (auth?: string) => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  ...(auth && {
    Authorization: `Bearer ${auth}`,
  }),
});
const handleSearch = async (
  query: string,
  authentication: any,
  options?: { page?: number },
) => {
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
  const results = json.data.Page.media.map((item: any) => ({
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
    totalVolumes: item.volumes,
    description: item.description,
    status: item.status,
    year: item.startDate?.year,
    genres: item.genres,
    author: item.staff?.edges?.find((edge: any) => edge.role === 'Story')?.node
      ?.name?.full,
  }));
  return results;
};
const updateUserListEntry = async (
  id: number | string,
  payload: any,
  authentication: any,
) => {
  let finalProgress = payload.progress;
  let finalVolume = (payload as any).volume as number | undefined;
  if (finalProgress === undefined || finalVolume === undefined) {
    try {
      const existingEntry = await getUserListEntry(Number(id), authentication);
      if (
        finalProgress === undefined &&
        existingEntry &&
        typeof existingEntry.progress === 'number'
      ) {
        finalProgress = existingEntry.progress;
      }
      if (
        finalVolume === undefined &&
        existingEntry &&
        typeof (existingEntry as any).volume === 'number'
      ) {
        finalVolume = (existingEntry as any).volume;
      }
    } catch (e) {}
  }
  const mutation = `
    mutation ($mediaId: Int, $progress: Int, $progressVolumes: Int, $status: MediaListStatus, $score: Float) {
      SaveMediaListEntry (mediaId: $mediaId, progress: $progress, progressVolumes: $progressVolumes, status: $status, score: $score) {
        id
        status
        progress
        progressVolumes
        score
      }
    }
  `;
  const variables = {
    mediaId: Number(id),
    progress: finalProgress,
    progressVolumes:
      typeof finalVolume === 'number' && !isNaN(finalVolume)
        ? finalVolume
        : undefined,
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
    volume:
      typeof entry.progressVolumes === 'number'
        ? entry.progressVolumes
        : undefined,
    score: entry.score,
    listId: listMeta.id,
    listName: listMeta.name,
  };
  return result;
};
const getUserListEntry = async (mediaId: number, authentication: any) => {
  const query = `
    query GetMediaListEntry($mediaId: Int) {
      Media(id: $mediaId, type: MANGA) {
        chapters
        volumes
        mediaListEntry {
          id
          progress
          progressVolumes
          status
          score
          notes
          startedAt { year month day }
          completedAt { year month day }
        }
      }
    }
  `;

  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: getHeaders(authentication.accessToken),
    body: JSON.stringify({
      query,
      variables: { mediaId },
    }),
  });

  const result = await response.json();
  const media = result.data?.Media || null;
  const entry = media?.mediaListEntry || null;
  if (!entry) return null;

  const status = mapStatusFromAniList(entry.status);
  const listMeta = getAniListListMeta(status);

  const normalized = {
    status,
    progress: entry.progress,
    volume: entry.progressVolumes ?? undefined,
    totalVolumes: media?.volumes ?? undefined,
    score: entry.score,
    notes: entry.notes,
    startDate: entry.startedAt,
    finishDate: entry.completedAt,
    listId: listMeta.id,
    listName: listMeta.name,
    progressDisplay:
      typeof entry.progressVolumes === 'number' && entry.progressVolumes > 0
        ? `V.${entry.progressVolumes} Ch.${entry.progress ?? 0}`
        : undefined,
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
    const finalVolume = (existingEntry as any).volume || undefined;
    return updateUserListEntry(
      mediaId,
      { progress: finalProgress, status, volume: finalVolume },
      authentication,
    );
  } else {
    const mutation = `
      mutation SaveMediaListEntry($mediaId: Int, $progress: Int, $progressVolumes: Int, $status: MediaListStatus) {
        SaveMediaListEntry(mediaId: $mediaId, progress: $progress, progressVolumes: $progressVolumes, status: $status) {
          id
          mediaId
          progress
          progressVolumes
          status
        }
      }
    `;

    const variables = {
      mediaId,
      progress,
      progressVolumes: undefined,
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
    query {
      Viewer { id }
      MediaListCollection(type: MANGA) {
        lists {
          name
          entries {
            mediaId
            status
            progress
            media { id siteUrl format chapters title { userPreferred romaji } }
            notes
          }
        }
      }
    }
  `;
  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers: getHeaders(authentication.accessToken),
    body: JSON.stringify({ query }),
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
    const id = String(track?.sourceId);
    return id ? `https://anilist.co/manga/${id}` : null;
  },
};
