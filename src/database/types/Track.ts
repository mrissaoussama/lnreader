export type TrackSource =
  | 'AniList'
  | 'MyAnimeList'
  | 'Novel-Updates'
  | 'Novellist';

export enum TrackStatus {
  Reading = 'Reading',
  Completed = 'Completed',
  OnHold = 'On-Hold',
  Dropped = 'Dropped',
  PlanToRead = 'Plan to Read',
  Repeating = 'Repeating',
}

export interface Track {
  id: number;
  novelId: number;
  source: TrackSource;
  sourceId: string;
  title: string;
  lastChapterRead: number;
  totalChapters?: number;
  status: TrackStatus;
  score?: number;
  startDate?: string;
  finishDate?: string;
  notes?: string;
  metadata?: string;
  lastSyncAt: string;
  createdAt: string;
  updatedAt: string;
}
