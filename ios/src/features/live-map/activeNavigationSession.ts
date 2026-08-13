import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  mergeActiveNavigationLocation,
  mergeActiveNavigationSessionDelta,
  normalizeActiveNavigationSession,
  ensurePersistedNavigationRevocation,
  hasPersistedNavigationRevocation,
  persistAuthorizedNavigationSession,
  REVOKED_ACTIVE_NAVIGATION_SESSION,
  revokePersistedActiveNavigationSession,
  serializeActiveNavigationSession,
  serializeActiveNavigationSessionDelta,
  createActiveNavigationRouteRevision,
  type ActiveNavigationSession,
} from "./activeNavigationSessionCore";
import {
  RELIABLE_LOCATION_FUTURE_TOLERANCE_MS,
  RELIABLE_LOCATION_MAX_WALL_AGE_MS,
  normalizeReliableLocationSample,
  type ReliableLocationSample,
} from "./locationSignal";
import {
  backgroundNavigationScopesMatch,
  createBackgroundNavigationRuntimePermitStore,
  createBackgroundNavigationPermit,
  isBackgroundNavigationSampleCurrent,
  isBackgroundNavigationWriteAuthorized,
  normalizeBackgroundNavigationPermit,
  type BackgroundNavigationPermit,
} from "./backgroundNavigationPermitCore";
import { haversineDistanceMeters } from "./routeGeometry";

const ACTIVE_NAVIGATION_SESSION_KEY =
  "@saferoute/active-navigation-session-v1";
const ACTIVE_NAVIGATION_SESSION_DELTA_KEY =
  "@saferoute/active-navigation-session-delta-v1";
const BACKGROUND_NAVIGATION_LOCATION_KEY =
  "@saferoute/background-navigation-location-v1";
const BACKGROUND_NAVIGATION_PERMIT_KEY =
  "@saferoute/background-navigation-permit-v1";
const BACKGROUND_NAVIGATION_LOCATION_VERSION = 3;
const ACTIVE_NAVIGATION_REVOCATION_KEY =
  "saferoute.active-navigation-revocation.v1";
const ACTIVE_NAVIGATION_REVOKED_VALUE = "revoked";
const BACKGROUND_LOCATION_MAX_AGE_MS = RELIABLE_LOCATION_MAX_WALL_AGE_MS;
let navigationStorageMutationQueue: Promise<void> = Promise.resolve();
let persistedRouteRevision: string | null = null;
let persistedNavigationInstanceId: string | null = null;
let runtimeBackgroundNavigationIdentity: {
  navigationInstanceId: string;
  routeId: string;
} | null = null;
let cachedBackgroundAuthorization: {
  expiresAtMs: number;
  permit: BackgroundNavigationPermit;
  session: ActiveNavigationSession;
} | null = null;
const BACKGROUND_AUTHORIZATION_CACHE_MS = 15_000;
const BACKGROUND_LOCATION_MIN_WRITE_INTERVAL_MS = 5_000;
const BACKGROUND_LOCATION_MIN_WRITE_DISTANCE_METERS = 10;
const runtimeBackgroundNavigationPermit =
  createBackgroundNavigationRuntimePermitStore();

interface BackgroundNavigationLocationEnvelope {
  accessScope: ActiveNavigationSession["accessScope"];
  navigationInstanceId: string;
  routeId: string;
  sample: ReliableLocationSample;
  version: typeof BACKGROUND_NAVIGATION_LOCATION_VERSION;
}

export type BackgroundNavigationWriteResult =
  | "ignored"
  | "saved"
  | "unauthorized";

export type ActiveNavigationSessionReadback =
  | { session: ActiveNavigationSession; status: "present" }
  | { session: null; status: "absent" | "unknown" };

export async function saveActiveNavigationSession(
  session: ActiveNavigationSession,
): Promise<boolean> {
  const delta = serializeActiveNavigationSessionDelta(session);
  const routeRevision = createActiveNavigationRouteRevision(session.routePlan);
  if (!delta) {
    return false;
  }

  return enqueueNavigationStorageMutation(async () => {
    const includeBase =
      persistedRouteRevision !== routeRevision ||
      persistedNavigationInstanceId !== session.navigationInstanceId;
    const serialized = includeBase
      ? serializeActiveNavigationSession(session)
      : null;
    if (includeBase && !serialized) {
      return false;
    }
    const persisted = await persistAuthorizedNavigationSession(
      () => includeBase
        ? AsyncStorage.multiSet([
            [ACTIVE_NAVIGATION_SESSION_KEY, serialized!],
            [ACTIVE_NAVIGATION_SESSION_DELTA_KEY, delta],
          ])
        : AsyncStorage.setItem(ACTIVE_NAVIGATION_SESSION_DELTA_KEY, delta),
      () => SecureStore.deleteItemAsync(ACTIVE_NAVIGATION_REVOCATION_KEY),
    );
    if (persisted) {
      persistedRouteRevision = routeRevision;
      persistedNavigationInstanceId = session.navigationInstanceId;
    }
    return persisted;
  });
}

export async function loadActiveNavigationSession(
  nowMs = Date.now(),
): Promise<ActiveNavigationSession | null> {
  return (await readActiveNavigationSession(nowMs)).session;
}

export async function readActiveNavigationSession(
  nowMs = Date.now(),
): Promise<ActiveNavigationSessionReadback> {
  try {
    await navigationStorageMutationQueue;
    const fallbackRevoked = await hasPersistedNavigationRevocation(
      () => SecureStore.getItemAsync(ACTIVE_NAVIGATION_REVOCATION_KEY),
      ACTIVE_NAVIGATION_REVOKED_VALUE,
    );
    if (fallbackRevoked) {
      await clearActiveNavigationSession();
      return { session: null, status: "absent" };
    }
    const values = await AsyncStorage.multiGet([
      ACTIVE_NAVIGATION_SESSION_KEY,
      ACTIVE_NAVIGATION_SESSION_DELTA_KEY,
    ]);
    const serialized = values[0]?.[1] || null;
    const delta = values[1]?.[1] || null;
    const baseSession = normalizeActiveNavigationSession(serialized, nowMs);
    const session = baseSession
      ? mergeActiveNavigationSessionDelta(baseSession, delta, nowMs)
      : null;
    if (!session) {
      if (serialized) {
        await clearActiveNavigationSession();
      }
      return { session: null, status: "absent" };
    }

    const backgroundLocation = await loadBackgroundNavigationLocation(
      session.routePlan.route.id,
      session.accessScope,
      session.navigationInstanceId,
      nowMs,
    );
    persistedRouteRevision = createActiveNavigationRouteRevision(session.routePlan);
    persistedNavigationInstanceId = session.navigationInstanceId;
    return {
      session: mergeActiveNavigationLocation(session, backgroundLocation),
      status: "present",
    };
  } catch {
    return { session: null, status: "unknown" };
  }
}

export async function clearActiveNavigationSession(): Promise<boolean> {
  runtimeBackgroundNavigationPermit.revoke();
  persistedRouteRevision = null;
  persistedNavigationInstanceId = null;
  runtimeBackgroundNavigationIdentity = null;
  cachedBackgroundAuthorization = null;
  return ensurePersistedNavigationRevocation(
    () => enqueueNavigationStorageMutation(() =>
      revokePersistedActiveNavigationSession(
        () => AsyncStorage.setItem(
          ACTIVE_NAVIGATION_SESSION_KEY,
          REVOKED_ACTIVE_NAVIGATION_SESSION,
        ),
        () => AsyncStorage.multiRemove([
          ACTIVE_NAVIGATION_SESSION_KEY,
          ACTIVE_NAVIGATION_SESSION_DELTA_KEY,
          BACKGROUND_NAVIGATION_LOCATION_KEY,
          BACKGROUND_NAVIGATION_PERMIT_KEY,
        ]),
      ),
    ),
    () => SecureStore.setItemAsync(
      ACTIVE_NAVIGATION_REVOCATION_KEY,
      ACTIVE_NAVIGATION_REVOKED_VALUE,
    ),
    () => SecureStore.deleteItemAsync(ACTIVE_NAVIGATION_REVOCATION_KEY),
  );
}

export async function revokeTerminalActiveNavigationStorage(): Promise<void> {
  const revoked = await clearActiveNavigationSession();
  if (!revoked) {
    throw new Error(
      "Active guidance storage could not be revoked at the terminal account boundary.",
    );
  }
}

export function hasRuntimeBackgroundNavigationPermit(): boolean {
  return runtimeBackgroundNavigationPermit.hasActivePermit();
}

export function getRuntimeBackgroundNavigationPermitStatus():
  | "active"
  | "none"
  | "pending" {
  return runtimeBackgroundNavigationPermit.status();
}

export async function prepareBackgroundNavigationPermit(
  routeId: string,
  accessScope: ActiveNavigationSession["accessScope"],
  navigationInstanceId: string,
): Promise<boolean> {
  const permit = createBackgroundNavigationPermit(
    routeId,
    accessScope,
    navigationInstanceId,
  );
  if (!permit) {
    return false;
  }
  const grantRevision = runtimeBackgroundNavigationPermit.beginGrant();
  return enqueueNavigationStorageMutation(async () => {
    try {
      await AsyncStorage.setItem(
        BACKGROUND_NAVIGATION_PERMIT_KEY,
        JSON.stringify(permit),
      );
      return runtimeBackgroundNavigationPermit.commitGrant(
        grantRevision,
        permit,
      );
    } catch {
      return false;
    }
  });
}

export async function activateBackgroundNavigationPermit(
  routeIdValue: string,
  accessScope: ActiveNavigationSession["accessScope"],
  navigationInstanceIdValue: string,
): Promise<boolean> {
  const routeId = routeIdValue.trim();
  const navigationInstanceId = navigationInstanceIdValue.trim();
  return enqueueNavigationStorageMutation(async () => {
    try {
      const permit = normalizeBackgroundNavigationPermit(
        await AsyncStorage.getItem(BACKGROUND_NAVIGATION_PERMIT_KEY),
      );
      if (
        !permit ||
        permit.routeId !== routeId ||
        permit.navigationInstanceId !== navigationInstanceId ||
        !backgroundNavigationScopesMatch(permit.accessScope, accessScope)
      ) {
        return false;
      }
      const activated = runtimeBackgroundNavigationPermit.activate(permit);
      if (activated) {
        runtimeBackgroundNavigationIdentity = {
          navigationInstanceId: permit.navigationInstanceId,
          routeId: permit.routeId,
        };
      }
      return activated;
    } catch {
      return false;
    }
  });
}

export async function revokeBackgroundNavigationPermit(): Promise<void> {
  runtimeBackgroundNavigationPermit.revoke();
  runtimeBackgroundNavigationIdentity = null;
  cachedBackgroundAuthorization = null;
  await enqueueNavigationStorageMutation(async () => {
    try {
      await AsyncStorage.removeItem(BACKGROUND_NAVIGATION_PERMIT_KEY);
    } catch {
      // Native stop remains best effort, so the task also rejects missing permits.
    }
  });
}

export async function saveBackgroundNavigationLocation(
  routeId: string,
  navigationInstanceIdValue: string,
  sampleValue: ReliableLocationSample,
): Promise<BackgroundNavigationWriteResult> {
  const normalizedRouteId = routeId.trim();
  const navigationInstanceId = navigationInstanceIdValue.trim();
  const sample = normalizeReliableLocationSample(sampleValue);
  if (!normalizedRouteId || !navigationInstanceId || !sample) {
    return "unauthorized";
  }

  return enqueueNavigationStorageMutation(async () => {
    try {
      const locationValue = await AsyncStorage.getItem(BACKGROUND_NAVIGATION_LOCATION_KEY);
      const cached = cachedBackgroundAuthorization;
      let permit = cached?.expiresAtMs && cached.expiresAtMs > Date.now() &&
        cached.permit.routeId === normalizedRouteId &&
        cached.permit.navigationInstanceId === navigationInstanceId &&
        runtimeBackgroundNavigationPermit.matches(cached.permit)
          ? cached.permit
          : null;
      let session = permit && cached ? cached.session : null;
      if (!permit || !session) {
        const [permitValue, sessionValue] = await Promise.all([
          AsyncStorage.getItem(BACKGROUND_NAVIGATION_PERMIT_KEY),
          AsyncStorage.getItem(ACTIVE_NAVIGATION_SESSION_KEY),
        ]);
        permit = normalizeBackgroundNavigationPermit(permitValue);
        session = normalizeActiveNavigationSession(sessionValue);
      }
      if (
        !permit ||
        !session ||
        !runtimeBackgroundNavigationPermit.matches(permit)
      ) {
        return "unauthorized";
      }
      cachedBackgroundAuthorization = {
        expiresAtMs: Date.now() + BACKGROUND_AUTHORIZATION_CACHE_MS,
        permit,
        session,
      };
      if (!isBackgroundNavigationWriteAuthorized({
          permitValue: permit,
          navigationInstanceIdValue: permit.navigationInstanceId,
          routeIdValue: permit.routeId,
          sessionAccessScope: session.accessScope,
          sessionNavigationInstanceIdValue: session.navigationInstanceId,
          sessionRouteIdValue: session.routePlan.route.id,
        })) {
        return "unauthorized";
      }
      if (!isBackgroundNavigationWriteAuthorized({
        permitValue: permit,
        navigationInstanceIdValue: navigationInstanceId,
        routeIdValue: normalizedRouteId,
        sessionAccessScope: session.accessScope,
        sessionNavigationInstanceIdValue: session.navigationInstanceId,
        sessionRouteIdValue: session.routePlan.route.id,
      })) {
        return "ignored";
      }
      if (
        sample.timestampMs < session.navigationStartedAtMs ||
        !isBackgroundNavigationSampleCurrent(permit, sample.timestampMs)
      ) {
        return "ignored";
      }
      const currentLocation = normalizeBackgroundNavigationLocationEnvelope(
        locationValue,
      );
      if (
        currentLocation &&
        currentLocation.routeId === normalizedRouteId &&
        currentLocation.navigationInstanceId === navigationInstanceId &&
        backgroundNavigationScopesMatch(
          currentLocation.accessScope,
          session.accessScope,
        ) &&
        currentLocation.sample.timestampMs >= sample.timestampMs
      ) {
        return "ignored";
      }
      if (
        currentLocation &&
        currentLocation.routeId === normalizedRouteId &&
        currentLocation.navigationInstanceId === navigationInstanceId &&
        sample.timestampMs - currentLocation.sample.timestampMs <
          BACKGROUND_LOCATION_MIN_WRITE_INTERVAL_MS &&
        haversineDistanceMeters(currentLocation.sample, sample) <
          BACKGROUND_LOCATION_MIN_WRITE_DISTANCE_METERS
      ) {
        return "ignored";
      }
      const envelope: BackgroundNavigationLocationEnvelope = {
        accessScope: session.accessScope,
        navigationInstanceId,
        routeId: normalizedRouteId,
        sample,
        version: BACKGROUND_NAVIGATION_LOCATION_VERSION,
      };
      await AsyncStorage.setItem(
        BACKGROUND_NAVIGATION_LOCATION_KEY,
        JSON.stringify(envelope),
      );
      return "saved";
    } catch {
      return "unauthorized";
    }
  });
}

export async function hasCurrentBackgroundNavigationAuthorization(): Promise<boolean> {
  try {
    await navigationStorageMutationQueue;
    const [permitValue, sessionValue] = await Promise.all([
      AsyncStorage.getItem(BACKGROUND_NAVIGATION_PERMIT_KEY),
      AsyncStorage.getItem(ACTIVE_NAVIGATION_SESSION_KEY),
    ]);
    const permit = normalizeBackgroundNavigationPermit(permitValue);
    const session = normalizeActiveNavigationSession(sessionValue);
    return Boolean(
      permit &&
        session &&
        runtimeBackgroundNavigationPermit.matches(permit) &&
        isBackgroundNavigationWriteAuthorized({
          navigationInstanceIdValue: permit.navigationInstanceId,
          permitValue: permit,
          routeIdValue: permit.routeId,
          sessionAccessScope: session.accessScope,
          sessionNavigationInstanceIdValue: session.navigationInstanceId,
          sessionRouteIdValue: session.routePlan.route.id,
        }),
    );
  } catch {
    return false;
  }
}

export async function isCurrentBackgroundNavigationAuthorization(
  routeIdValue: string,
  accessScope: ActiveNavigationSession["accessScope"],
  navigationInstanceIdValue: string,
): Promise<boolean> {
  const routeId = routeIdValue.trim();
  const navigationInstanceId = navigationInstanceIdValue.trim();
  try {
    await navigationStorageMutationQueue;
    const [permitValue, sessionValue] = await Promise.all([
      AsyncStorage.getItem(BACKGROUND_NAVIGATION_PERMIT_KEY),
      AsyncStorage.getItem(ACTIVE_NAVIGATION_SESSION_KEY),
    ]);
    const permit = normalizeBackgroundNavigationPermit(permitValue);
    const session = normalizeActiveNavigationSession(sessionValue);
    return Boolean(
      permit &&
        session &&
        runtimeBackgroundNavigationPermit.matches(permit) &&
        backgroundNavigationScopesMatch(permit.accessScope, accessScope) &&
        isBackgroundNavigationWriteAuthorized({
          navigationInstanceIdValue: navigationInstanceId,
          permitValue: permit,
          routeIdValue: routeId,
          sessionAccessScope: session.accessScope,
          sessionNavigationInstanceIdValue: session.navigationInstanceId,
          sessionRouteIdValue: session.routePlan.route.id,
        }),
    );
  } catch {
    return false;
  }
}

export async function loadBackgroundNavigationLocation(
  routeId: string,
  accessScope: ActiveNavigationSession["accessScope"],
  navigationInstanceIdValue: string,
  nowMs = Date.now(),
): Promise<ReliableLocationSample | null> {
  try {
    await navigationStorageMutationQueue;
    const serialized = await AsyncStorage.getItem(
      BACKGROUND_NAVIGATION_LOCATION_KEY,
    );
    if (!serialized) {
      return null;
    }

    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    const sample = normalizeReliableLocationSample(parsed.sample);
    const navigationInstanceId = navigationInstanceIdValue.trim();
    if (
      parsed.version !== BACKGROUND_NAVIGATION_LOCATION_VERSION ||
      parsed.routeId !== routeId ||
      parsed.navigationInstanceId !== navigationInstanceId ||
      !backgroundNavigationScopesMatch(parsed.accessScope, accessScope) ||
      !sample ||
      sample.timestampMs > nowMs + RELIABLE_LOCATION_FUTURE_TOLERANCE_MS ||
      nowMs - sample.timestampMs > BACKGROUND_LOCATION_MAX_AGE_MS
    ) {
      return null;
    }

    return sample;
  } catch {
    return null;
  }
}

function normalizeBackgroundNavigationLocationEnvelope(
  value: unknown,
): BackgroundNavigationLocationEnvelope | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const sample = normalizeReliableLocationSample(record.sample);
    const routeId = typeof record.routeId === "string" ? record.routeId.trim() : "";
    const navigationInstanceId =
      typeof record.navigationInstanceId === "string"
        ? record.navigationInstanceId.trim()
        : "";
    if (
      record.version !== BACKGROUND_NAVIGATION_LOCATION_VERSION ||
      !routeId ||
      !navigationInstanceId ||
      !sample
    ) {
      return null;
    }
    return {
      accessScope: record.accessScope as ActiveNavigationSession["accessScope"],
      navigationInstanceId,
      routeId,
      sample,
      version: BACKGROUND_NAVIGATION_LOCATION_VERSION,
    };
  } catch {
    return null;
  }
}

export async function getPersistedActiveNavigationAuthorization(): Promise<{
  navigationInstanceId: string;
  routeId: string;
} | null> {
  const runtimeAuthorization = getRuntimeBackgroundNavigationAuthorization();
  if (runtimeAuthorization) {
    return runtimeAuthorization;
  }
  const session = await loadActiveNavigationSession();
  return session
    ? {
        navigationInstanceId: session.navigationInstanceId,
        routeId: session.routePlan.route.id,
      }
    : null;
}

export function getRuntimeBackgroundNavigationAuthorization(): {
  navigationInstanceId: string;
  routeId: string;
} | null {
  return runtimeBackgroundNavigationPermit.hasActivePermit() && runtimeBackgroundNavigationIdentity
    ? { ...runtimeBackgroundNavigationIdentity }
    : null;
}

function enqueueNavigationStorageMutation<T>(
  mutation: () => Promise<T>,
): Promise<T> {
  const result = navigationStorageMutationQueue.then(mutation, mutation);
  navigationStorageMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
