export type SafeRouteRoutePreferences = {
  avoidFerries: boolean;
  avoidMotorways: boolean;
  avoidTolls: boolean;
  avoidUnpavedRoads: boolean;
};

export type SafeRouteRoutePreferencesApi = {
  avoid_ferries: boolean;
  avoid_motorways: boolean;
  avoid_tolls: boolean;
  avoid_unpaved_roads: boolean;
};

export const DEFAULT_SAFE_ROUTE_PREFERENCES: SafeRouteRoutePreferences = {
  avoidFerries: false,
  avoidMotorways: false,
  avoidTolls: false,
  avoidUnpavedRoads: false,
};

export const SAFE_ROUTE_PREFERENCE_OPTIONS = [
  { id: "avoidTolls", label: "Tolls" },
  { id: "avoidMotorways", label: "Motorways" },
  { id: "avoidFerries", label: "Ferries" },
  { id: "avoidUnpavedRoads", label: "Unpaved roads" },
] as const satisfies ReadonlyArray<{
  id: keyof SafeRouteRoutePreferences;
  label: string;
}>;

export function normalizeSafeRoutePreferences(
  value: unknown,
): SafeRouteRoutePreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SAFE_ROUTE_PREFERENCES };
  }
  const record = value as Record<string, unknown>;
  return {
    avoidFerries: record.avoidFerries === true,
    avoidMotorways: record.avoidMotorways === true,
    avoidTolls: record.avoidTolls === true,
    avoidUnpavedRoads: record.avoidUnpavedRoads === true,
  };
}

export function hasEnabledSafeRoutePreference(
  preferences: SafeRouteRoutePreferences,
): boolean {
  return Object.values(preferences).some(Boolean);
}

export function countEnabledSafeRoutePreferences(
  preferences: SafeRouteRoutePreferences,
): number {
  return Object.values(preferences).filter(Boolean).length;
}

export function toSafeRoutePreferencesApi(
  preferences: SafeRouteRoutePreferences,
): SafeRouteRoutePreferencesApi {
  return {
    avoid_ferries: preferences.avoidFerries,
    avoid_motorways: preferences.avoidMotorways,
    avoid_tolls: preferences.avoidTolls,
    avoid_unpaved_roads: preferences.avoidUnpavedRoads,
  };
}

export function safeRoutePreferencesMatchApiEvidence(
  preferences: SafeRouteRoutePreferences,
  value: unknown,
): boolean {
  if (!hasEnabledSafeRoutePreference(preferences)) {
    return true;
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  const requested = normalizeProviderPreferenceList(record.requested);
  const applied = normalizeProviderPreferenceList(record.applied);
  const expected = [
    preferences.avoidTolls ? "tollRoads" : null,
    preferences.avoidMotorways ? "motorways" : null,
    preferences.avoidFerries ? "ferries" : null,
    preferences.avoidUnpavedRoads ? "unpavedRoads" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    record.provider === "tomtom" &&
    requested.length === expected.length &&
    applied.length === expected.length &&
    expected.every(
      (item) => requested.includes(item) && applied.includes(item),
    )
  );
}

function normalizeProviderPreferenceList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      ),
    ),
  );
}
