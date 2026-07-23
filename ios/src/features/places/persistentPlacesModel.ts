export const PERSISTENT_PLACES_SCHEMA_VERSION = 1;
export const PERSISTENT_PLACES_MAX_FAVOURITES = 40;
export const PERSISTENT_PLACES_MAX_RECENTS = 20;
export const PERSISTENT_PLACES_SCOPE_MAX_LENGTH = 256;
export const PERSISTENT_PLACE_LABEL_MAX_LENGTH = 80;
export const PERSISTENT_PLACE_DISPLAY_NAME_MAX_LENGTH = 240;

const PERSISTENT_PLACE_CATEGORY_MAX_LENGTH = 80;
const PERSISTENT_PLACE_SOURCE_ID_MAX_LENGTH = 160;
const PERSISTENT_PLACE_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const PERSISTENT_PLACE_COORDINATE_PRECISION = 6;
const PERSISTENT_PLACE_MATCH_TOLERANCE = 0.00001;

export type PersistentPlaceCoordinate = {
  latitude: number;
  longitude: number;
};

export type PersistentPlaceInput = {
  category?: string | null;
  coordinate: PersistentPlaceCoordinate;
  displayName?: string | null;
  label: string;
  sourceId?: string | null;
};

export type PersistentSavedPlace = {
  category: string | null;
  coordinate: PersistentPlaceCoordinate;
  createdAtMs: number;
  displayName: string;
  id: string;
  label: string;
  sourceId: string | null;
  updatedAtMs: number;
};

export type PersistentRecentDestination = {
  category: string | null;
  coordinate: PersistentPlaceCoordinate;
  displayName: string;
  id: string;
  label: string;
  lastUsedAtMs: number;
  sourceId: string | null;
  useCount: number;
};

export type PersistentPlacesRecord = {
  favourites: PersistentSavedPlace[];
  home: PersistentSavedPlace | null;
  recents: PersistentRecentDestination[];
  schema: typeof PERSISTENT_PLACES_SCHEMA_VERSION;
  scopeId: string;
  storedAtMs: number;
  work: PersistentSavedPlace | null;
};

export type PersistentPlaceSlot = "home" | "work";

type NormalizedPlace = {
  category: string | null;
  coordinate: PersistentPlaceCoordinate;
  displayName: string;
  id: string;
  label: string;
  sourceId: string | null;
};

export function normalizePersistentPlacesScopeId(value: string): string {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > PERSISTENT_PLACES_SCOPE_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return "";
  }
  return normalized;
}

export function createEmptyPersistentPlacesRecord(
  scopeIdValue: string,
  nowMs = Date.now(),
): PersistentPlacesRecord {
  const scopeId = normalizePersistentPlacesScopeId(scopeIdValue);
  if (!scopeId) {
    throw new Error("Persistent places scope is invalid");
  }
  return {
    favourites: [],
    home: null,
    recents: [],
    schema: PERSISTENT_PLACES_SCHEMA_VERSION,
    scopeId,
    storedAtMs: normalizeTimestamp(nowMs, nowMs) ?? Date.now(),
    work: null,
  };
}

export function setPersistentPlaceSlot(
  record: PersistentPlacesRecord,
  slot: PersistentPlaceSlot,
  input: PersistentPlaceInput,
  nowMs = Date.now(),
): PersistentPlacesRecord {
  const place = normalizePersistentPlaceInput(input);
  if (!place) {
    throw new Error(`Persistent ${slot} place is invalid`);
  }
  const timestamp = requireCurrentTimestamp(nowMs);
  const previous = record[slot];
  const savedPlace: PersistentSavedPlace = {
    ...place,
    createdAtMs:
      previous && persistentPlacesMatch(previous, place)
        ? previous.createdAtMs
        : timestamp,
    updatedAtMs: timestamp,
  };
  return {
    ...record,
    [slot]: savedPlace,
    storedAtMs: timestamp,
  };
}

export function clearPersistentPlaceSlot(
  record: PersistentPlacesRecord,
  slot: PersistentPlaceSlot,
  nowMs = Date.now(),
): PersistentPlacesRecord {
  if (!record[slot]) {
    return record;
  }
  return {
    ...record,
    [slot]: null,
    storedAtMs: requireCurrentTimestamp(nowMs),
  };
}

export function savePersistentFavourite(
  record: PersistentPlacesRecord,
  input: PersistentPlaceInput,
  nowMs = Date.now(),
): PersistentPlacesRecord {
  const place = normalizePersistentPlaceInput(input);
  if (!place) {
    throw new Error("Persistent favourite is invalid");
  }
  const timestamp = requireCurrentTimestamp(nowMs);
  const previous = record.favourites.find((candidate) =>
    persistentPlacesMatch(candidate, place),
  );
  const favourite: PersistentSavedPlace = {
    ...place,
    createdAtMs: previous?.createdAtMs ?? timestamp,
    updatedAtMs: timestamp,
  };
  return {
    ...record,
    favourites: [
      favourite,
      ...record.favourites.filter(
        (candidate) => !persistentPlacesMatch(candidate, place),
      ),
    ].slice(0, PERSISTENT_PLACES_MAX_FAVOURITES),
    storedAtMs: timestamp,
  };
}

export function removePersistentFavourite(
  record: PersistentPlacesRecord,
  favouriteId: string,
  nowMs = Date.now(),
): PersistentPlacesRecord {
  const id = normalizeStoredText(
    favouriteId,
    PERSISTENT_PLACE_SOURCE_ID_MAX_LENGTH + 20,
  );
  const favourites = id
    ? record.favourites.filter((candidate) => candidate.id !== id)
    : record.favourites;
  if (favourites.length === record.favourites.length) {
    return record;
  }
  return {
    ...record,
    favourites,
    storedAtMs: requireCurrentTimestamp(nowMs),
  };
}

export function recordPersistentRecentDestination(
  record: PersistentPlacesRecord,
  input: PersistentPlaceInput,
  nowMs = Date.now(),
): PersistentPlacesRecord {
  const place = normalizePersistentPlaceInput(input);
  if (!place) {
    throw new Error("Persistent recent destination is invalid");
  }
  const timestamp = requireCurrentTimestamp(nowMs);
  const previous = record.recents.find((candidate) =>
    persistentPlacesMatch(candidate, place),
  );
  const recent: PersistentRecentDestination = {
    ...place,
    lastUsedAtMs: timestamp,
    useCount: Math.min(Number.MAX_SAFE_INTEGER, (previous?.useCount ?? 0) + 1),
  };
  return {
    ...record,
    recents: [
      recent,
      ...record.recents.filter(
        (candidate) => !persistentPlacesMatch(candidate, place),
      ),
    ].slice(0, PERSISTENT_PLACES_MAX_RECENTS),
    storedAtMs: timestamp,
  };
}

export function removePersistentRecentDestination(
  record: PersistentPlacesRecord,
  recentId: string,
  nowMs = Date.now(),
): PersistentPlacesRecord {
  const id = normalizeStoredText(
    recentId,
    PERSISTENT_PLACE_SOURCE_ID_MAX_LENGTH + 20,
  );
  const recents = id
    ? record.recents.filter((candidate) => candidate.id !== id)
    : record.recents;
  if (recents.length === record.recents.length) {
    return record;
  }
  return {
    ...record,
    recents,
    storedAtMs: requireCurrentTimestamp(nowMs),
  };
}

export function clearPersistentRecentDestinations(
  record: PersistentPlacesRecord,
  nowMs = Date.now(),
): PersistentPlacesRecord {
  if (!record.recents.length) {
    return record;
  }
  return {
    ...record,
    recents: [],
    storedAtMs: requireCurrentTimestamp(nowMs),
  };
}

export function parsePersistentPlacesRecord(
  value: unknown,
  expectedScopeIdValue: string,
  nowMs = Date.now(),
): PersistentPlacesRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const expectedScopeId = normalizePersistentPlacesScopeId(
    expectedScopeIdValue,
  );
  const candidate = value as Partial<PersistentPlacesRecord>;
  const scopeId = normalizePersistentPlacesScopeId(
    typeof candidate.scopeId === "string" ? candidate.scopeId : "",
  );
  const storedAtMs = normalizeTimestamp(candidate.storedAtMs, nowMs);
  if (
    !expectedScopeId ||
    scopeId !== expectedScopeId ||
    candidate.schema !== PERSISTENT_PLACES_SCHEMA_VERSION ||
    storedAtMs === null ||
    !Array.isArray(candidate.favourites) ||
    !Array.isArray(candidate.recents)
  ) {
    return null;
  }

  const home = parsePersistentSavedPlace(candidate.home, nowMs);
  const work = parsePersistentSavedPlace(candidate.work, nowMs);
  if (
    (candidate.home !== null && candidate.home !== undefined && !home) ||
    (candidate.work !== null && candidate.work !== undefined && !work)
  ) {
    return null;
  }

  const favourites = deduplicatePlaces(
    candidate.favourites
      .map((place) => parsePersistentSavedPlace(place, nowMs))
      .filter((place): place is PersistentSavedPlace => Boolean(place))
      .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
  ).slice(0, PERSISTENT_PLACES_MAX_FAVOURITES);
  const recents = deduplicatePlaces(
    candidate.recents
      .map((place) => parsePersistentRecentDestination(place, nowMs))
      .filter((place): place is PersistentRecentDestination => Boolean(place))
      .sort((left, right) => right.lastUsedAtMs - left.lastUsedAtMs),
  ).slice(0, PERSISTENT_PLACES_MAX_RECENTS);

  return {
    favourites,
    home,
    recents,
    schema: PERSISTENT_PLACES_SCHEMA_VERSION,
    scopeId,
    storedAtMs,
    work,
  };
}

function parsePersistentSavedPlace(
  value: unknown,
  nowMs: number,
): PersistentSavedPlace | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<PersistentSavedPlace>;
  const place = normalizePersistentPlaceInput(candidate);
  const createdAtMs = normalizeTimestamp(candidate.createdAtMs, nowMs);
  const updatedAtMs = normalizeTimestamp(candidate.updatedAtMs, nowMs);
  if (
    !place ||
    createdAtMs === null ||
    updatedAtMs === null ||
    updatedAtMs < createdAtMs
  ) {
    return null;
  }
  return {
    ...place,
    createdAtMs,
    updatedAtMs,
  };
}

function parsePersistentRecentDestination(
  value: unknown,
  nowMs: number,
): PersistentRecentDestination | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<PersistentRecentDestination>;
  const place = normalizePersistentPlaceInput(candidate);
  const lastUsedAtMs = normalizeTimestamp(candidate.lastUsedAtMs, nowMs);
  const useCount = Number(candidate.useCount);
  if (
    !place ||
    lastUsedAtMs === null ||
    !Number.isSafeInteger(useCount) ||
    useCount < 1
  ) {
    return null;
  }
  return {
    ...place,
    lastUsedAtMs,
    useCount,
  };
}

function normalizePersistentPlaceInput(
  input: Partial<PersistentPlaceInput>,
): NormalizedPlace | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const coordinate = normalizeCoordinate(input.coordinate);
  const label = normalizeStoredText(
    input.label,
    PERSISTENT_PLACE_LABEL_MAX_LENGTH,
  );
  if (!coordinate || !label) {
    return null;
  }
  const displayName =
    normalizeStoredText(
      input.displayName,
      PERSISTENT_PLACE_DISPLAY_NAME_MAX_LENGTH,
    ) || label;
  const sourceId =
    normalizeStoredText(
      input.sourceId,
      PERSISTENT_PLACE_SOURCE_ID_MAX_LENGTH,
    ) || null;
  const category =
    normalizeStoredText(
      input.category,
      PERSISTENT_PLACE_CATEGORY_MAX_LENGTH,
    ) || null;
  return {
    category,
    coordinate,
    displayName,
    id: sourceId
      ? `source:${sourceId}`
      : `coordinate:${coordinate.latitude.toFixed(
          PERSISTENT_PLACE_COORDINATE_PRECISION,
        )},${coordinate.longitude.toFixed(
          PERSISTENT_PLACE_COORDINATE_PRECISION,
        )}`,
    label,
    sourceId,
  };
}

function normalizeCoordinate(
  value: unknown,
): PersistentPlaceCoordinate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const coordinate = value as Partial<PersistentPlaceCoordinate>;
  const latitude = Number(coordinate.latitude);
  const longitude = Number(coordinate.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return {
    latitude: Number(
      latitude.toFixed(PERSISTENT_PLACE_COORDINATE_PRECISION),
    ),
    longitude: Number(
      longitude.toFixed(PERSISTENT_PLACE_COORDINATE_PRECISION),
    ),
  };
}

function persistentPlacesMatch(
  left: Pick<PersistentSavedPlace, "coordinate" | "sourceId">,
  right: Pick<PersistentSavedPlace, "coordinate" | "sourceId">,
): boolean {
  return Boolean(
    (left.sourceId &&
      right.sourceId &&
      left.sourceId === right.sourceId) ||
      (Math.abs(left.coordinate.latitude - right.coordinate.latitude) <=
        PERSISTENT_PLACE_MATCH_TOLERANCE &&
        Math.abs(left.coordinate.longitude - right.coordinate.longitude) <=
          PERSISTENT_PLACE_MATCH_TOLERANCE),
  );
}

function deduplicatePlaces<
  Place extends Pick<PersistentSavedPlace, "coordinate" | "sourceId">,
>(places: Place[]): Place[] {
  return places.filter(
    (place, index) =>
      !places
        .slice(0, index)
        .some((candidate) => persistentPlacesMatch(candidate, place)),
  );
}

function normalizeStoredText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength)
    .trim();
}

function normalizeTimestamp(value: unknown, nowMs: number): number | null {
  const timestamp = Number(value);
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > nowMs + PERSISTENT_PLACE_MAX_CLOCK_SKEW_MS
  ) {
    return null;
  }
  return timestamp;
}

function requireCurrentTimestamp(nowMs: number): number {
  const timestamp = normalizeTimestamp(nowMs, nowMs);
  if (timestamp === null) {
    throw new Error("Persistent places timestamp is invalid");
  }
  return timestamp;
}
