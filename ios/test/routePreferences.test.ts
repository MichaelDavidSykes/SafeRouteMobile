import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SAFE_ROUTE_PREFERENCES,
  countEnabledSafeRoutePreferences,
  hasEnabledSafeRoutePreference,
  normalizeSafeRoutePreferences,
  safeRoutePreferencesMatchApiEvidence,
  toSafeRoutePreferencesApi,
} from "../src/features/guest-map/routePreferences";
import { parseStoredRoutePreferences } from "../src/features/guest-map/routePreferencesStore";

describe("SafeRoute route preferences", () => {
  it("normalizes only exact booleans and maps the shared backend schema", () => {
    const preferences = normalizeSafeRoutePreferences({
      avoidFerries: true,
      avoidMotorways: "true",
      avoidTolls: true,
      avoidUnpavedRoads: false,
    });

    assert.deepEqual(preferences, {
      avoidFerries: true,
      avoidMotorways: false,
      avoidTolls: true,
      avoidUnpavedRoads: false,
    });
    assert.deepEqual(toSafeRoutePreferencesApi(preferences), {
      avoid_ferries: true,
      avoid_motorways: false,
      avoid_tolls: true,
      avoid_unpaved_roads: false,
    });
    assert.equal(hasEnabledSafeRoutePreference(preferences), true);
    assert.equal(countEnabledSafeRoutePreferences(preferences), 2);
  });

  it("requires exact provider evidence for every enabled preference", () => {
    const preferences = {
      ...DEFAULT_SAFE_ROUTE_PREFERENCES,
      avoidMotorways: true,
      avoidTolls: true,
    };
    const evidence = {
      requested: ["tollRoads", "motorways"],
      applied: ["motorways", "tollRoads"],
      provider: "tomtom",
    };

    assert.equal(
      safeRoutePreferencesMatchApiEvidence(preferences, evidence),
      true,
    );
    assert.equal(
      safeRoutePreferencesMatchApiEvidence(preferences, {
        ...evidence,
        applied: ["tollRoads"],
      }),
      false,
    );
    assert.equal(
      safeRoutePreferencesMatchApiEvidence(preferences, {
        ...evidence,
        provider: "osrm",
      }),
      false,
    );
    assert.equal(
      safeRoutePreferencesMatchApiEvidence(
        DEFAULT_SAFE_ROUTE_PREFERENCES,
        null,
      ),
      true,
    );
  });

  it("restores only a versioned record for the exact account scope", () => {
    const record = JSON.stringify({
      version: 1,
      scopeId: "member-1",
      updatedAtMs: 1000,
      preferences: {
        avoidFerries: false,
        avoidMotorways: true,
        avoidTolls: true,
        avoidUnpavedRoads: false,
      },
    });

    assert.deepEqual(parseStoredRoutePreferences(record, "member-1"), {
      avoidFerries: false,
      avoidMotorways: true,
      avoidTolls: true,
      avoidUnpavedRoads: false,
    });
    assert.deepEqual(
      parseStoredRoutePreferences(record, "member-2"),
      DEFAULT_SAFE_ROUTE_PREFERENCES,
    );
    assert.deepEqual(
      parseStoredRoutePreferences(
        JSON.stringify({
          version: 1,
          scopeId: "member-1",
          updatedAtMs: 1000,
          preferences: {
            avoidFerries: false,
            avoidMotorways: "true",
            avoidTolls: false,
            avoidUnpavedRoads: false,
          },
        }),
        "member-1",
      ),
      DEFAULT_SAFE_ROUTE_PREFERENCES,
    );
  });
});
