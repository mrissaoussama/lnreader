import { MMKVStorage } from '@utils/mmkv/mmkv';

const KEY = 'DOWNLOAD_CANCELLED_CHAPTER_IDS';

let mem: Set<number> | null = null;

function ensure() {
  if (mem) return mem;
  try {
    const raw = MMKVStorage.getString(KEY);
    if (raw) {
      mem = new Set<number>(JSON.parse(raw));
    } else {
      mem = new Set<number>();
    }
  } catch {
    mem = new Set<number>();
  }
  return mem!;
}

function persist() {
  if (!mem) return;
  try {
    MMKVStorage.set(KEY, JSON.stringify(Array.from(mem)));
  } catch {}
}

export function addCancelledChapter(id: number) {
  const s = ensure();
  s.add(id);
  persist();
}

export function addCancelledChapters(ids: number[]) {
  const s = ensure();
  ids.forEach(id => s.add(id));
  persist();
}

export function clearCancelledChapter(id: number) {
  const s = ensure();
  s.delete(id);
  persist();
}

export function isCancelledChapter(id: number): boolean {
  const s = ensure();
  return s.has(id);
}

export function clearAllCancelled() {
  mem = new Set<number>();
  persist();
}
