import { Tracker, SearchResult, UserListEntry } from './types';
import { addAlternativeTitle } from '@database/queries/NovelQueries';
const MANGA_UPDATES_API_URL = 'https://api.mangaupdates.com/v1';
const MANGA_UPDATES_URL = 'https://www.mangaupdates.com';
import { MMKVStorage, getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';

const MANGA_UPDATES_ACCESS_TOKEN_KEY = 'mangaupdates_access_token';
const MANGA_UPDATES_USER_KEY = 'mangaupdates_user';

class MangaUpdates implements Tracker<any> {
  public name = 'MangaUpdates';
  public icon = 'https://www.mangaupdates.com/favicon.ico';

  public capabilities = {
    hasDynamicLists: true,
    hasStaticLists: false,
    supportsPagination: true,
    requiresAuth: true,
    supportsMetadataCache: false,
    supportsBulkSync: false,
    hasAlternativeTitles: true,
  } as const;

  private async getAccessToken(): Promise<string | undefined> {
    return MMKVStorage.getString(MANGA_UPDATES_ACCESS_TOKEN_KEY);
  }

  private async getStoredUser(): Promise<any | undefined> {
    return getMMKVObject<any>(MANGA_UPDATES_USER_KEY);
  }

  public async authenticate(username?: string, password?: string) {
    if (username && password) {
      try {
        const response = await fetch(`${MANGA_UPDATES_API_URL}/account/login`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username,
            password,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Login failed');
        }

        const data = await response.json();
        const accessToken = data.context?.session_token || data.session_token;

        if (!accessToken) {
          throw new Error('No session token received');
        }

        MMKVStorage.set(MANGA_UPDATES_ACCESS_TOKEN_KEY, accessToken);

        const user = await this.fetchUserProfile(accessToken);
        if (user) {
          setMMKVObject(MANGA_UPDATES_USER_KEY, user);
        }

        return {
          accessToken,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
          meta: { message: 'Successfully authenticated with MangaUpdates.' },
        };
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : 'Authentication failed',
        );
      }
    }

    const token = await this.getAccessToken();
    const user = await this.getStoredUser();
    if (token && user) {
      return {
        accessToken: token,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        meta: {
          message: 'Successfully authenticated with stored credentials.',
        },
      };
    }

    return {
      accessToken: '',
      expiresAt: new Date(0),
      meta: { message: 'Please provide username and password to login.' },
    };
  }

  public async getUser(): Promise<any | undefined> {
    const user = await this.getStoredUser();
    if (user) {
      return user;
    }

    const token = await this.getAccessToken();
    if (token) {
      return await this.fetchUserProfile(token);
    }

    return undefined;
  }

  private async fetchUserProfile(
    accessToken: string,
  ): Promise<any | undefined> {
    try {
      const response = await fetch(`${MANGA_UPDATES_API_URL}/account/profile`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }

      const data = await response.json();
      const user = {
        id: data.user_id || data.id,
        name: data.username || data.name,
        ...data,
      };

      setMMKVObject(MANGA_UPDATES_USER_KEY, user);
      return user;
    } catch (error) {
      return undefined;
    }
  }

  public async handleSearch(
    query: string,
    _authentication?: any,
    options?: { page?: number; limit?: number },
  ): Promise<SearchResult[]> {
    try {
      const page = options?.page ?? 1;
      const perpage = Math.min(Math.max(options?.limit ?? 20, 1), 50);
      const response = await fetch(`${MANGA_UPDATES_API_URL}/series/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search: query,
          perpage,
          page,
          type: ['Novel'],
        }),
      });
      const data = await response.json();

      if (data.results) {
        return data.results
          .filter(
            (item: any) =>
              item.record.type &&
              (Array.isArray(item.record.type)
                ? item.record.type.includes('Novel')
                : item.record.type === 'Novel'),
          )
          .map((item: any) => {
            return {
              id: item.record.series_id,
              title: item.record.title,
              alternativeTitles: [
                item.hit_title,
                ...(item.record.associated
                  ? item.record.associated.map((assoc: any) => assoc.title)
                  : []),
              ].filter(Boolean),
              coverImage: item.record.image?.url?.original,
              totalChapters: item.record.last_chapter || undefined,
              description: item.record.description || undefined,
              status: item.record.status || undefined,
              year: item.record.year || undefined,
              genres: item.record.genres
                ? item.record.genres
                    .map((genre: any) => genre.genre || genre.name || genre)
                    .filter(Boolean)
                : undefined,
              author: item.record.authors?.[0]?.name || undefined,
            };
          });
      }
      return [];
    } catch (error) {
      showToast(`Error searching MangaUpdates: ${error}`);
      return [];
    }
  }

  public async getUserListEntry(
    id: number | string,
    _authentication: any,
    novel: { id: number },
  ): Promise<UserListEntry> {
    try {
      const token = await this.getAccessToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const seriesResponse = await fetch(
        `${MANGA_UPDATES_API_URL}/series/${id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (seriesResponse.ok) {
        const seriesData = await seriesResponse.json();
        if (seriesData.associated) {
          const alternativeTitles = seriesData.associated.map(
            (item: { title: string }) => item.title,
          );
          for (const title of alternativeTitles) {
            await addAlternativeTitle(novel.id, title);
          }
        }
      }

      const response = await fetch(
        `${MANGA_UPDATES_API_URL}/lists/series/${id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.ok) {
        const data = await response.json();
        const status = data.status || {};
        const listId = data.list_id ? String(data.list_id) : undefined;
        const listName = data.list_type || undefined;
        const progress =
          typeof status.chapter === 'number' ? status.chapter : 0;
        return {
          status: 'CURRENT',
          progress,
          listId,
          listName,
        };
      }
    } catch (error) {
      showToast(`Error getting MangaUpdates list entry: ${error}`);
    }
    return { status: 'CURRENT', progress: 0 };
  }

  public async updateUserListEntry(
    id: number | string,
    payload: Partial<UserListEntry>,
    _authentication: any,
  ): Promise<UserListEntry> {
    const existing = await this.getUserListEntry(id, _authentication);
    const nextProgress =
      typeof payload.progress === 'number'
        ? payload.progress
        : existing.progress || 0;

    try {
      const token = await this.getAccessToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      let listId = existing.listId ? Number(existing.listId) : null;

      if (!listId) {
        const lists = await this.getAvailableReadingLists();
        const readingList = lists.find(
          l =>
            l.name.toLowerCase().includes('reading') ||
            l.name.toLowerCase().includes('current') ||
            l.id === '1',
        );
        if (readingList) {
          listId = Number(readingList.id);
        } else if (lists.length > 0) {
          listId = Number(lists[0].id);
        } else {
          listId = 1;
        }
      }

      const updateBody = [
        {
          series: { id: Number(id) },
          list_id: listId,
          status: { chapter: nextProgress },
        },
      ];

      let response = await fetch(
        `${MANGA_UPDATES_API_URL}/lists/series/update`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updateBody),
        },
      );

      if (!response.ok) {
        const addResponse = await fetch(
          `${MANGA_UPDATES_API_URL}/lists/series`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(updateBody),
          },
        );

        if (addResponse.ok) {
          response = await fetch(
            `${MANGA_UPDATES_API_URL}/lists/series/update`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(updateBody),
            },
          );
        }
      }

      return {
        ...existing,
        progress: nextProgress,
        listId: String(listId),
        listName: existing.listName || 'Reading',
      };
    } catch (error) {
      showToast(`Error updating MangaUpdates: ${error}`);
      return { ...existing, progress: nextProgress };
    }
  }

  public async getAvailableReadingLists(): Promise<
    Array<{ id: string; name: string }>
  > {
    try {
      const token = await this.getAccessToken();
      if (!token) return [];
      const resp = await fetch(`${MANGA_UPDATES_API_URL}/lists`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return [];
      const lists = await resp.json();
      if (!Array.isArray(lists)) return [];
      return lists.map((l: any) => ({
        id: String(l.list_id),
        name: l.title || l.type,
      }));
    } catch (_) {
      return [];
    }
  }

  public getEntryUrl(track: { sourceId: string | number }): string | null {
    const id = String(track?.sourceId || '').trim();
    if (!id) return null;
    return `${MANGA_UPDATES_URL}/series.html?id=${id}`;
  }
}

export default new MangaUpdates();
