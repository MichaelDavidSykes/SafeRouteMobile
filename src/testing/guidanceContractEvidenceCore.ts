export const GUIDANCE_CONTRACT_EVIDENCE_SCHEMA = 1;
export const GUIDANCE_CONTRACT_EVIDENCE_MAX_EVENTS = 64;

export const GUIDANCE_CONTRACT_EVIDENCE_TYPES = [
  "navigation.persisted",
  "restore.suspended",
  "restore.ready",
  "workspace.recovery.settled",
  "route.cache.readback",
  "navigation.cleanup.settled",
  "tracking.stop.settled",
  "navigation.absence.readback",
] as const;

export type GuidanceContractEvidenceType =
  (typeof GUIDANCE_CONTRACT_EVIDENCE_TYPES)[number];

export type GuidanceContractEvidenceDurability = {
  activeNavigation?: "absent" | "present" | "revoked" | "unknown";
  nativeTracking?: "active" | "not-started" | "stopped" | "unknown" | "unsupported";
  persistedPermit?: "present" | "revoked" | "unknown";
  routeCache?: "failed" | "present" | "purged" | "unknown";
  runtimePermit?: "active" | "none" | "pending" | "unknown";
  workspaceContext?: "failed" | "persisted" | "revoked" | "unknown";
};

export type GuidanceContractEvidenceAuthorization = {
  catalog?: "fresh-authorized" | "fresh-denied" | "not-checked" | "unavailable";
  principal?: "matching" | "mismatched" | "none" | "unknown";
};

export interface GuidanceContractEvidenceEvent {
  appLaunchId: string;
  authorization: GuidanceContractEvidenceAuthorization;
  cause: string;
  durability: GuidanceContractEvidenceDurability;
  eventId: string;
  navigationInstanceId: string | null;
  occurredAtMs: number;
  outcome: string;
  routeId: string | null;
  schema: typeof GUIDANCE_CONTRACT_EVIDENCE_SCHEMA;
  sourceRevision: string;
  type: GuidanceContractEvidenceType;
  unavailableWorkspaceIds: string[];
  workspaceId: string | null;
}

export type CreateGuidanceContractEvidenceInput = Omit<
  GuidanceContractEvidenceEvent,
  "authorization" | "durability" | "eventId" | "occurredAtMs" | "schema" |
    "sourceRevision" | "unavailableWorkspaceIds"
> & {
  authorization?: GuidanceContractEvidenceAuthorization;
  durability?: GuidanceContractEvidenceDurability;
  eventId?: string;
  occurredAtMs?: number;
  sourceRevision: string;
  unavailableWorkspaceIds?: string[];
};

const TYPE_SET = new Set<string>(GUIDANCE_CONTRACT_EVIDENCE_TYPES);
const EVENT_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;
const SAFE_VALUE_PATTERN = /^[A-Za-z0-9._:/ -]{0,160}$/;

export function createGuidanceContractEvidenceEvent(
  input: CreateGuidanceContractEvidenceInput,
  {
    createEventId = defaultEventId,
    now = () => Date.now(),
  }: {
    createEventId?: () => string;
    now?: () => number;
  } = {},
): GuidanceContractEvidenceEvent | null {
  return normalizeGuidanceContractEvidenceEvent({
    ...input,
    eventId: input.eventId || createEventId(),
    occurredAtMs: input.occurredAtMs ?? now(),
    schema: GUIDANCE_CONTRACT_EVIDENCE_SCHEMA,
  });
}

export function normalizeGuidanceContractEvidenceEvent(
  value: unknown,
): GuidanceContractEvidenceEvent | null {
  if (!isRecord(value) || value.schema !== GUIDANCE_CONTRACT_EVIDENCE_SCHEMA) {
    return null;
  }

  const eventId = safeString(value.eventId, 128);
  const appLaunchId = safeString(value.appLaunchId, 128);
  const sourceRevision = safeString(value.sourceRevision, 40).toLowerCase();
  const type = safeString(value.type, 64);
  const cause = safeString(value.cause, 96);
  const outcome = safeString(value.outcome, 96);
  const occurredAtMs = Number(value.occurredAtMs);
  if (
    !EVENT_ID_PATTERN.test(eventId) ||
    !EVENT_ID_PATTERN.test(appLaunchId) ||
    !REVISION_PATTERN.test(sourceRevision) ||
    !TYPE_SET.has(type) ||
    !cause ||
    !outcome ||
    !Number.isFinite(occurredAtMs) ||
    occurredAtMs <= 0
  ) {
    return null;
  }

  const navigationInstanceId = optionalSafeString(value.navigationInstanceId, 160);
  const routeId = optionalSafeString(value.routeId, 160);
  const workspaceId = optionalSafeString(value.workspaceId, 160);
  if (
    navigationInstanceId === undefined ||
    routeId === undefined ||
    workspaceId === undefined
  ) {
    return null;
  }

  const unavailableWorkspaceIds = Array.isArray(value.unavailableWorkspaceIds)
    ? Array.from(new Set(value.unavailableWorkspaceIds
        .map((workspace) => safeString(workspace, 160))
        .filter(Boolean)))
        .slice(0, 20)
    : [];

  return {
    appLaunchId,
    authorization: normalizeAuthorization(value.authorization),
    cause,
    durability: normalizeDurability(value.durability),
    eventId,
    navigationInstanceId,
    occurredAtMs,
    outcome,
    routeId,
    schema: GUIDANCE_CONTRACT_EVIDENCE_SCHEMA,
    sourceRevision,
    type: type as GuidanceContractEvidenceType,
    unavailableWorkspaceIds,
    workspaceId,
  };
}

export function parseGuidanceContractEvidenceSpool(
  value: unknown,
): GuidanceContractEvidenceEvent[] {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const events = parsed
    .map(normalizeGuidanceContractEvidenceEvent)
    .filter((event): event is GuidanceContractEvidenceEvent => Boolean(event));
  return appendGuidanceContractEvidenceEvents([], events);
}

export function appendGuidanceContractEvidenceEvents(
  current: GuidanceContractEvidenceEvent[],
  next: GuidanceContractEvidenceEvent[],
  maxEvents = GUIDANCE_CONTRACT_EVIDENCE_MAX_EVENTS,
): GuidanceContractEvidenceEvent[] {
  const safeLimit = Number.isInteger(maxEvents) && maxEvents > 0
    ? maxEvents
    : GUIDANCE_CONTRACT_EVIDENCE_MAX_EVENTS;
  const byId = new Map<string, GuidanceContractEvidenceEvent>();
  [...current, ...next].forEach((event) => {
    if (!byId.has(event.eventId)) {
      byId.set(event.eventId, event);
    }
  });
  return Array.from(byId.values())
    .slice(0, safeLimit);
}

export function isGuidanceContractEvidenceAcknowledged(
  value: unknown,
  expectedEventId: string,
): boolean {
  if (!isRecord(value) || value.status !== "success" || !isRecord(value.data)) {
    return false;
  }
  return (
    value.data.event_id === expectedEventId &&
    (value.data.result === "recorded" || value.data.result === "duplicate")
  );
}

function normalizeAuthorization(value: unknown): GuidanceContractEvidenceAuthorization {
  if (!isRecord(value)) {
    return {};
  }
  const principal = oneOf(value.principal, ["matching", "mismatched", "none", "unknown"]);
  const catalog = oneOf(value.catalog, [
    "fresh-authorized",
    "fresh-denied",
    "not-checked",
    "unavailable",
  ]);
  return {
    ...(catalog ? { catalog } : {}),
    ...(principal ? { principal } : {}),
  } as GuidanceContractEvidenceAuthorization;
}

function normalizeDurability(value: unknown): GuidanceContractEvidenceDurability {
  if (!isRecord(value)) {
    return {};
  }
  const activeNavigation = oneOf(value.activeNavigation, ["absent", "present", "revoked", "unknown"]);
  const nativeTracking = oneOf(value.nativeTracking, ["active", "not-started", "stopped", "unknown", "unsupported"]);
  const persistedPermit = oneOf(value.persistedPermit, ["present", "revoked", "unknown"]);
  const routeCache = oneOf(value.routeCache, ["failed", "present", "purged", "unknown"]);
  const runtimePermit = oneOf(value.runtimePermit, ["active", "none", "pending", "unknown"]);
  const workspaceContext = oneOf(value.workspaceContext, ["failed", "persisted", "revoked", "unknown"]);
  return {
    ...(activeNavigation ? { activeNavigation } : {}),
    ...(nativeTracking ? { nativeTracking } : {}),
    ...(persistedPermit ? { persistedPermit } : {}),
    ...(routeCache ? { routeCache } : {}),
    ...(runtimePermit ? { runtimePermit } : {}),
    ...(workspaceContext ? { workspaceContext } : {}),
  } as GuidanceContractEvidenceDurability;
}

function optionalSafeString(value: unknown, maxLength: number): string | null | undefined {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const normalized = safeString(value, maxLength);
  return normalized ? normalized : undefined;
}

function safeString(value: unknown, maxLength: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length <= maxLength && SAFE_VALUE_PATTERN.test(normalized)
    ? normalized
    : "";
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return typeof value === "string" && options.includes(value as T)
    ? value as T
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function defaultEventId(): string {
  return `evidence-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}
