import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  mergeActiveNavigationLocation,
  normalizeActiveNavigationSession,
  serializeActiveNavigationSession,
  type ActiveNavigationSession,
} from "./activeNavigationSessionCore";
import {
  RELIABLE_LOCATION_FUTURE_TOLERANCE_MS,
  RELIABLE_LOCATION_MAX_WALL_AGE_MS,
  normalizeReliableLocationSample,
  type ReliableLocationSample,
} from "./locationSignal";

const ACTIVE_NAVIGATION_SESSION_KEY =
  "@saferoute/active-navigation-session-v1";
const BACKGROUND_NAVIGATION_LOCATION_KEY =
  "@saferoute/background-navigation-location-v1";
const BACKGROUND_NAVIGATION_LOCATION_VERSION = 1;
const BACKGROUND_LOCATION_MAX_AGE_MS = RELIABLE_LOCATION_MAX_WALL_AGE_MS;

interface BackgroundNavigationLocationEnvelope {
  routeId: string;
  sample: ReliableLocationSample;
  version: typeof BACKGROUND_NAVIGATION_LOCATION_VERSION;
}

export async function saveActiveNavigationSession(
  session: ActiveNavigationSession,
): Promise<boolean> {
  const serialized = serializeActiveNavigationSession(session);
  if (!serialized) {
    return false;
  }

  try {
    await AsyncStorage.setItem(ACTIVE_NAVIGATION_SESSION_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export async function loadActiveNavigationSession(
  nowMs = Date.now(),
): Promise<ActiveNavigationSession | null> {
  try {
    const serialized = await AsyncStorage.getItem(
      ACTIVE_NAVIGATION_SESSION_KEY,
    );
    const session = normalizeActiveNavigationSession(serialized, nowMs);
    if (!session) {
      if (serialized) {
        await clearActiveNavigationSession();
      }
      return null;
    }

    const backgroundLocation = await loadBackgroundNavigationLocation(
      session.routePlan.route.id,
      nowMs,
    );
    return mergeActiveNavigationLocation(session, backgroundLocation);
  } catch {
    return null;
  }
}

export async function clearActiveNavigationSession(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      ACTIVE_NAVIGATION_SESSION_KEY,
      BACKGROUND_NAVIGATION_LOCATION_KEY,
    ]);
  } catch {
    // Session cleanup is best effort; invalid records fail closed on the next load.
  }
}

export async function saveBackgroundNavigationLocation(
  routeId: string,
  sampleValue: ReliableLocationSample,
): Promise<boolean> {
  const normalizedRouteId = routeId.trim();
  const sample = normalizeReliableLocationSample(sampleValue);
  if (!normalizedRouteId || !sample) {
    return false;
  }

  const envelope: BackgroundNavigationLocationEnvelope = {
    routeId: normalizedRouteId,
    sample,
    version: BACKGROUND_NAVIGATION_LOCATION_VERSION,
  };

  try {
    await AsyncStorage.setItem(
      BACKGROUND_NAVIGATION_LOCATION_KEY,
      JSON.stringify(envelope),
    );
    return true;
  } catch {
    return false;
  }
}

export async function loadBackgroundNavigationLocation(
  routeId: string,
  nowMs = Date.now(),
): Promise<ReliableLocationSample | null> {
  try {
    const serialized = await AsyncStorage.getItem(
      BACKGROUND_NAVIGATION_LOCATION_KEY,
    );
    if (!serialized) {
      return null;
    }

    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    const sample = normalizeReliableLocationSample(parsed.sample);
    if (
      parsed.version !== BACKGROUND_NAVIGATION_LOCATION_VERSION ||
      parsed.routeId !== routeId ||
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

export async function getPersistedActiveRouteId(): Promise<string | null> {
  const session = await loadActiveNavigationSession();
  return session?.routePlan.route.id || null;
}
