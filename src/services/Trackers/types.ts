export type TrackerName =
  | 'AniList'
  | 'MyAnimeList'
  | 'Novel-Updates'
  | 'Novellist';

export const TRACKER_SOURCES = {
  ANILIST: 'AniList' as const,
  MYANIMELIST: 'MyAnimeList' as const,
  NOVEL_UPDATES: 'Novel-Updates' as const,
  NOVELLIST: 'Novellist' as const,
} as const;

export type TrackerCapabilities = {
  /** Whether this tracker supports dynamic reading lists that can be refreshed */
  hasDynamicLists: boolean;
  /** Whether this tracker has static status lists */
  hasStaticLists: boolean;
  /** Whether this tracker supports pagination in search results */
  supportsPagination: boolean;
  /** Whether this tracker requires authentication for basic operations */
  requiresAuth: boolean;
  /** Whether this tracker can check metadata to avoid refetching tracker-specific IDs */
  supportsMetadataCache: boolean;
  /** Whether this tracker supports bulk sync operations (to avoid ip bans) */
  supportsBulkSync: boolean;
};

/**
 * Normalized list status values.
 * Not all trackers will use all of these.
 * Trackers should remap them when getting/sending them to the server
 */
export type UserListStatus =
  | 'CURRENT'
  | 'PLANNING'
  | 'COMPLETED'
  | 'DROPPED'
  | 'PAUSED'
  | 'REPEATING';

export type AuthenticationResult<Meta = Record<string, any>> = {
  /** The token used to authenticate with the tracker's API */
  accessToken: string;
  /** A token used to refresh the access token. Not supported by all trackers */
  refreshToken?: string;
  /** The time at which the access token expires and must be refreshed if possible */
  expiresAt: Date;
  /** Used to store any needed additional metadata */
  meta?: Meta;
};

export type SearchResult = {
  /** The tracker's unique ID of this entry */
  id: string | number;
  /** The tracker's title of this entry */
  title: string;
  /** A link to the tracker's largest available image for this entry */
  coverImage?: string;
  /** The total number of chapters for this entry which may not be available */
  totalChapters?: number;
  /** Description or synopsis of the entry */
  description?: string;
  /** Publication status */
  status?: string;
  /** Author information */
  author?: string;
  /** Publication year */
  year?: number;
  /** Genres */
  genres?: string[];
};

export type UserListEntry = {
  /** The user's current reading status */
  status: UserListStatus;
  /** The user's current chapter progress */
  progress: number;
  /** The user's current score */
  score?: number;
  /** Start date */
  startDate?: string;
  /** Finish date */
  finishDate?: string;
  /** User notes */
  notes?: string;
  /** Tracker-specific metadata stored as JSON string */
  metadata?: string;
  /** Novel plugin ID for tracking notes (used internally) */
  novelPluginId?: string;
  /** Novel path for tracking notes (used internally) */
  novelPath?: string;
  /** Chapter name for tracking notes (used internally) */
  chapterName?: string;
  /** Chapter path for tracking notes (used internally) */
  chapterPath?: string;
  /** Custom progress display string for special trackers like Novel Updates */
  progressDisplay?: string;
};

export type Tracker<AuthMeta = any> = {
  name: string;

  /** Capabilities that define what features this tracker supports */
  capabilities: TrackerCapabilities;

  /**
   * Handles the full flow of logging the user in.
   * @returns User authentication credentials
   */
  authenticate: () => Promise<AuthenticationResult<AuthMeta>>;

  /**
   * Automated re-authentication for trackers that support it. If the tracker doesn't support it, the
   * authentication data will be removed, effectively logging the user out.
   * @param auth The current authentication credentials.
   * @returns Refreshed authentication credentials.
   */
  revalidate?: (
    auth: AuthenticationResult<AuthMeta>,
  ) => Promise<AuthenticationResult<AuthMeta>>;

  /**
   * Searches the tracker and returns the results in a normalized format.
   * @param search The search query
   * @param authentication The user's authentication credentials
   * @param options Optional search options including pagination
   * @returns A normalized array of results from the tracker.
   */
  handleSearch: (
    search: string,
    authentication?: AuthenticationResult<AuthMeta>,
    options?: { page?: number; limit?: number },
  ) => Promise<SearchResult[]>;

  /**
   * Gets available reading lists for the tracker (optional, used by some trackers like NovelUpdates)
   * @param id The tracker's unique ID
   * @param authentication The user's authentication credentials
   * @returns Available reading lists
   */
  getAvailableReadingLists?: (
    id: number | string,
    authentication: AuthenticationResult<AuthMeta>,
  ) => Promise<Array<{ id: string; name: string }>>;

  /**
   * Adds a novel to a specific reading list (optional, used by some trackers like NovelUpdates)
   * @param id The tracker's unique ID
   * @param listId The reading list ID to add to
   * @param authentication The user's authentication credentials
   */
  addToReadingList?: (
    id: number | string,
    listId: string,
    authentication: AuthenticationResult<AuthMeta>,
  ) => Promise<void>;

  /**
   * Gets all novels tracked by the user from the tracker service (for bulk sync operations)
   * @param authentication The user's authentication credentials
   * @returns Array of tracked novels with their progress information
   */
  getAllTrackedNovels?: (
    authentication: AuthenticationResult<AuthMeta>,
  ) => Promise<
    Array<{
      id: string;
      title: string;
      siteUrl?: string;
      status: UserListStatus;
      progress: number;
      totalChapters?: number;
      notes?: string;
    }>
  >;

  /**
   * Gets the user's list entry from the tracker service. If no list entry is found, it should
   * be created with relevant default values and those should be returned instead.
   * @param id The tracker's unique ID
   * @param authentication The user's authentication credentials
   * @returns The user's list entry information
   */
  getUserListEntry: (
    id: number | string,
    authentication: AuthenticationResult<AuthMeta>,
  ) => Promise<UserListEntry>;

  /**
   * Converts the normalized list entry to the tracker's necessary format and submits it to the
   * tracker.
   * @param id The tracker's unique ID
   * @param payload The list entry updates to send to the tracker
   * @param authentication The user's authentication credentials
   * @returns The updated list entry as determined by the tracker
   */
  updateUserListEntry: (
    id: number | string,
    payload: Partial<UserListEntry>,
    authentication: AuthenticationResult<AuthMeta>,
  ) => Promise<UserListEntry>;
};
