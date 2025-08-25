// Shared tracker-related constants
import { TRACKER_SOURCES } from '@services/Trackers';
import { TrackSource } from '../types';

// Unified ordering for rendering trackers in UI components
export const TRACKER_ORDER: TrackSource[] = [
  TRACKER_SOURCES.ANILIST,
  TRACKER_SOURCES.MYANIMELIST,
  TRACKER_SOURCES.NOVEL_UPDATES,
  TRACKER_SOURCES.NOVELLIST,
  TRACKER_SOURCES.MANGAUPDATES,
];
