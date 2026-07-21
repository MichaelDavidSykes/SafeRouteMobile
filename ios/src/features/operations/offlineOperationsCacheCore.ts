import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import type {
  SafeRouteOperationsState,
  SafeRouteTripPlan,
  SafeRouteTripRouteAssignment,
} from "./operationsTypes";

export const OFFLINE_OPERATIONS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const OFFLINE_OPERATIONS_CACHE_MAX_BYTES = 1900;
export const OFFLINE_OPERATIONS_CACHE_MAX_ENTRIES = 8;
const OFFLINE_OPERATIONS_CACHE_SCHEMA = 1;
const MAX_ID_LENGTH = 96;
const MAX_SCOPE_IDENTITY_LENGTH = 256;
const MAX_LABEL_LENGTH = 120;
const OFFLINE_OPERATIONS_CURRENT_GRACE_MS = 24 * 60 * 60 * 1000;
const OFFLINE_OPERATIONS_FUTURE_HORIZON_MS = 180 * 24 * 60 * 60 * 1000;

export type OfflineOperationsCalendarEntry = {
  destination: string;
  durationMinutes: number | null;
  id: string;
  movementIso: string;
  origin: string;
  status: string;
  title: string;
};

export type OfflineOperationsCacheValue = {
  entries: OfflineOperationsCalendarEntry[];
  sourceUpdatedAt: string | null;
  truncated: boolean;
};

export type OfflineOperationsCacheRecord = {
  principalId: string;
  schema: number;
  storedAtMs: number;
  value: OfflineOperationsCacheValue;
  workspaceId: string;
};

export type OfflineOperationsRevocationRecord = {
  principalId: string;
  revoked: true;
  schema: number;
  workspaceId: string | null;
};

export interface OfflineOperationsSnapshot extends OfflineOperationsCacheValue {
  storedAtMs: number;
}

export function createOfflineOperationsCacheRecord(
  principalIdValue: string,
  workspaceIdValue: string,
  {
    operationsState,
    routes,
  }: {
    operationsState: SafeRouteOperationsState;
    routes: SavedSafeRoutePlan[];
  },
  nowMs = Date.now(),
): OfflineOperationsCacheRecord | null {
  const principalId = normalizeScopeIdentity(principalIdValue);
  const workspaceId = normalizeScopeIdentity(workspaceIdValue);
  if (
    !principalId ||
    !workspaceId ||
    operationsState.client_id.trim() !== workspaceId ||
    !Number.isFinite(nowMs)
  ) {
    return null;
  }

  const allEntries = createOfflineCalendarEntries(
    routes,
    operationsState,
    workspaceId,
    nowMs,
  );
  let entries: OfflineOperationsCalendarEntry[] = [];
  let truncated = allEntries.length > OFFLINE_OPERATIONS_CACHE_MAX_ENTRIES;
  const sourceUpdatedAt = normalizeOptionalText(
    operationsState.updated_at,
    MAX_LABEL_LENGTH,
  );

  for (const entry of allEntries.slice(0, OFFLINE_OPERATIONS_CACHE_MAX_ENTRIES)) {
    const candidateEntries = [...entries, entry];
    const candidate = createRecord({
      entries: candidateEntries,
      principalId,
      sourceUpdatedAt,
      storedAtMs: nowMs,
      truncated:
        truncated || candidateEntries.length < allEntries.length,
      workspaceId,
    });
    if (
      utf8ByteLength(JSON.stringify(candidate)) >
      OFFLINE_OPERATIONS_CACHE_MAX_BYTES
    ) {
      truncated = true;
      break;
    }
    entries = candidateEntries;
  }

  const record = createRecord({
    entries,
    principalId,
    sourceUpdatedAt,
    storedAtMs: nowMs,
    truncated: truncated || entries.length < allEntries.length,
    workspaceId,
  });
  return utf8ByteLength(JSON.stringify(record)) <=
    OFFLINE_OPERATIONS_CACHE_MAX_BYTES
    ? record
    : null;
}

export function createOfflineOperationsRevocationRecord(
  principalIdValue: string,
  workspaceIdValue?: string | null,
): OfflineOperationsRevocationRecord | null {
  const principalId = normalizeScopeIdentity(principalIdValue);
  const workspaceId =
    workspaceIdValue === null || workspaceIdValue === undefined
      ? null
      : normalizeScopeIdentity(workspaceIdValue);
  if (
    !principalId ||
    (workspaceIdValue !== null &&
      workspaceIdValue !== undefined &&
      !workspaceId)
  ) {
    return null;
  }
  return {
    principalId,
    revoked: true,
    schema: OFFLINE_OPERATIONS_CACHE_SCHEMA,
    workspaceId,
  };
}

export function parseOfflineOperationsCacheRecord(
  value: unknown,
  expectedPrincipalIdValue: string,
  expectedWorkspaceIdValue: string,
  nowMs = Date.now(),
): OfflineOperationsSnapshot | null {
  if (
    !isRecord(value) ||
    value.revoked === true ||
    !hasExactKeys(value, [
      "principalId",
      "schema",
      "storedAtMs",
      "value",
      "workspaceId",
    ])
  ) {
    return null;
  }
  const expectedPrincipalId = normalizeScopeIdentity(expectedPrincipalIdValue);
  const expectedWorkspaceId = normalizeScopeIdentity(expectedWorkspaceIdValue);
  if (
    !expectedPrincipalId ||
    !expectedWorkspaceId ||
    value.principalId !== expectedPrincipalId ||
    value.workspaceId !== expectedWorkspaceId ||
    value.schema !== OFFLINE_OPERATIONS_CACHE_SCHEMA ||
    !isFiniteNumber(value.storedAtMs) ||
    !Number.isFinite(nowMs)
  ) {
    return null;
  }
  const ageMs = nowMs - value.storedAtMs;
  if (ageMs < 0 || ageMs >= OFFLINE_OPERATIONS_CACHE_MAX_AGE_MS) {
    return null;
  }
  if (
    !isRecord(value.value) ||
    !hasExactKeys(value.value, ["entries", "sourceUpdatedAt", "truncated"]) ||
    !Array.isArray(value.value.entries) ||
    value.value.entries.length > OFFLINE_OPERATIONS_CACHE_MAX_ENTRIES ||
    typeof value.value.truncated !== "boolean" ||
    !(
      value.value.sourceUpdatedAt === null ||
      typeof value.value.sourceUpdatedAt === "string"
    ) ||
    utf8ByteLength(JSON.stringify(value)) > OFFLINE_OPERATIONS_CACHE_MAX_BYTES
  ) {
    return null;
  }

  const entries: OfflineOperationsCalendarEntry[] = [];
  const seen = new Set<string>();
  for (const candidate of value.value.entries) {
    const entry = parseCalendarEntry(candidate);
    if (!entry || seen.has(entry.id)) {
      return null;
    }
    seen.add(entry.id);
    entries.push(entry);
  }

  return {
    entries,
    sourceUpdatedAt: normalizeOptionalText(
      value.value.sourceUpdatedAt,
      MAX_LABEL_LENGTH,
    ),
    storedAtMs: value.storedAtMs,
    truncated: value.value.truncated,
  };
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) || 0;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return bytes;
}

function createOfflineCalendarEntries(
  routes: SavedSafeRoutePlan[],
  operationsState: SafeRouteOperationsState,
  workspaceId: string,
  nowMs: number,
): OfflineOperationsCalendarEntry[] {
  const routeLookup = new Map(
    routes
      .filter((route) => route.clientId === workspaceId)
      .map((route) => [route.id, route]),
  );

  return operationsState.trips
    .filter(
      (trip) =>
        trip.client_id === workspaceId &&
        trip.is_active !== false &&
        trip.status !== "archived" &&
        trip.status !== "completed",
    )
    .flatMap((trip, tripIndex) =>
      ensureTripAssignments(trip).map((assignment, index) => ({
        assignment,
        index,
        route: routeLookup.get(assignment.route_id) || null,
        trip,
        tripIndex,
      })),
    )
    .map(({ assignment, index, route, trip, tripIndex }) => {
      const movementIso = normalizeMovementIso(
        assignment.movement_date || trip.movement_date,
      );
      if (!movementIso) {
        return null;
      }
      const movementAtMs = new Date(movementIso).getTime();
      if (
        assignment.status === "archived" ||
        assignment.status === "completed" ||
        movementAtMs < nowMs - OFFLINE_OPERATIONS_CURRENT_GRACE_MS ||
        movementAtMs > nowMs + OFFLINE_OPERATIONS_FUTURE_HORIZON_MS
      ) {
        return null;
      }
      const duration = assignment.duration_minutes ?? trip.duration_minutes;
      const durationMinutes =
        Number.isFinite(duration) &&
        Number(duration) >= 1 &&
        Number(duration) <= 10080
          ? Math.round(Number(duration))
          : null;
      return {
        destination: normalizeRequiredText(
          route?.destination || trip.destination || "Destination pending",
          MAX_LABEL_LENGTH,
        ) || "Destination pending",
        durationMinutes,
        id: `movement-${tripIndex + 1}-${index + 1}`,
        movementIso,
        origin: normalizeRequiredText(
          route?.origin || trip.origin || "Origin pending",
          MAX_LABEL_LENGTH,
        ) || "Origin pending",
        status:
          normalizeRequiredText(
            assignment.status || trip.status || "ready",
            40,
          ) || "ready",
        title:
          normalizeRequiredText(
            route?.name || trip.name || "SafeRoute movement",
            MAX_LABEL_LENGTH,
          ) || "SafeRoute movement",
      };
    })
    .filter(
      (entry): entry is OfflineOperationsCalendarEntry => entry !== null,
    )
    .sort(
      (left, right) =>
        new Date(left.movementIso).getTime() -
          new Date(right.movementIso).getTime() ||
        left.title.localeCompare(right.title),
    );
}

function ensureTripAssignments(
  trip: SafeRouteTripPlan,
): SafeRouteTripRouteAssignment[] {
  if (trip.route_assignments.length > 0) {
    return trip.route_assignments;
  }
  return trip.route_ids.map((routeId) => ({
    duration_minutes: trip.duration_minutes,
    movement_date: trip.movement_date,
    notes: null,
    person_ids: [],
    route_id: routeId,
    status: trip.status,
    vehicle_ids: [],
  }));
}

function createRecord({
  entries,
  principalId,
  sourceUpdatedAt,
  storedAtMs,
  truncated,
  workspaceId,
}: {
  entries: OfflineOperationsCalendarEntry[];
  principalId: string;
  sourceUpdatedAt: string | null;
  storedAtMs: number;
  truncated: boolean;
  workspaceId: string;
}): OfflineOperationsCacheRecord {
  return {
    principalId,
    schema: OFFLINE_OPERATIONS_CACHE_SCHEMA,
    storedAtMs,
    value: {
      entries,
      sourceUpdatedAt,
      truncated,
    },
    workspaceId,
  };
}

function parseCalendarEntry(
  value: unknown,
): OfflineOperationsCalendarEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const allowedKeys = new Set([
    "destination",
    "durationMinutes",
    "id",
    "movementIso",
    "origin",
    "status",
    "title",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    return null;
  }
  const id = normalizeRequiredText(value.id, MAX_ID_LENGTH);
  const title = normalizeRequiredText(value.title, MAX_LABEL_LENGTH);
  const origin = normalizeRequiredText(value.origin, MAX_LABEL_LENGTH);
  const destination = normalizeRequiredText(
    value.destination,
    MAX_LABEL_LENGTH,
  );
  const movementIso = normalizeMovementIso(value.movementIso);
  const status = normalizeRequiredText(value.status, 40);
  const durationMinutes =
    value.durationMinutes === null
      ? null
      : isFiniteNumber(value.durationMinutes) &&
          value.durationMinutes >= 1 &&
          value.durationMinutes <= 10080
        ? Math.round(value.durationMinutes)
        : undefined;
  if (
    !id ||
    !title ||
    !origin ||
    !destination ||
    !movementIso ||
    !status ||
    durationMinutes === undefined
  ) {
    return null;
  }
  return {
    destination,
    durationMinutes,
    id,
    movementIso,
    origin,
    status,
    title,
  };
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    keys.every((key) => expectedKeys.includes(key))
  );
}

function normalizeMovementIso(value: unknown): string | null {
  const timestamp = new Date(String(value || "")).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeOptionalText(
  value: unknown,
  maxLength: number,
): string | null {
  return normalizeRequiredText(value, maxLength) || null;
}

function normalizeScopeIdentity(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized &&
    normalized.length <= MAX_SCOPE_IDENTITY_LENGTH
    ? normalized
    : "";
}

function normalizeRequiredText(value: unknown, maxLength: number): string {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized.length <= maxLength
    ? normalized
    : normalized.slice(0, maxLength).trimEnd();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
