import { PRESET_AOIS, type Bbox } from "@/lib/aoi";

/**
 * The persisted area of interest, as an external store.
 *
 * Restoring from localStorage is a subscription to something outside React,
 * not derived state, so it belongs in useSyncExternalStore rather than in an
 * effect that calls setState on mount. That also gives the server render a
 * stable snapshot, so there is nothing to hydrate-mismatch.
 */

export interface StoredAoi {
  name: string;
  bbox: Bbox;
}

const STORAGE_KEY = "modulark.aoi";

const DEFAULT: StoredAoi = {
  name: PRESET_AOIS[0].name,
  bbox: PRESET_AOIS[0].bbox,
};

let snapshot: StoredAoi = DEFAULT;
let hydrated = false;
const listeners = new Set<() => void>();

function read(): StoredAoi | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAoi>;
    if (
      typeof parsed?.name !== "string" ||
      !Array.isArray(parsed.bbox) ||
      parsed.bbox.length !== 4 ||
      parsed.bbox.some((v) => typeof v !== "number" || !Number.isFinite(v))
    ) {
      return null;
    }
    return { name: parsed.name, bbox: parsed.bbox as Bbox };
  } catch {
    // Private browsing, blocked storage, or a corrupt entry. The default holds.
    return null;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  // First subscriber hydrates. React re-reads the snapshot immediately after
  // subscribing, so the restored value lands without an extra render pass.
  if (!hydrated) {
    hydrated = true;
    const restored = read();
    if (restored) snapshot = restored;
  }

  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    const next = read();
    snapshot = next ?? DEFAULT;
    emit();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Must return a referentially stable value between changes. */
export function getSnapshot(): StoredAoi {
  return snapshot;
}

export function getServerSnapshot(): StoredAoi {
  return DEFAULT;
}

export function setStoredAoi(next: StoredAoi): void {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The selection just will not survive a reload.
  }
  emit();
}
