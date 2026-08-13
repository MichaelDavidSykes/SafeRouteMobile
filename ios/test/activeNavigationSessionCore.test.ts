import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTIVE_NAVIGATION_SESSION_MAX_PAYLOAD_BYTES,
  ACTIVE_NAVIGATION_SESSION_MAX_AGE_MS,
  ensurePersistedNavigationRevocation,
  hasPersistedNavigationRevocation,
  persistAuthorizedNavigationSession,
  revokePersistedActiveNavigationSession,
  canResumeActiveNavigationSession,
  createActiveNavigationRouteRevision,
  createActiveNavigationInstanceId,
  createActiveNavigationSession,
  isNavigationSessionForRoutePreview,
  mergeActiveNavigationLocation,
  mergeActiveNavigationSessionDelta,
  normalizeActiveNavigationSession,
  serializeActiveNavigationSession,
  serializeActiveNavigationSessionDelta,
} from "../src/features/live-map/activeNavigationSessionCore";
import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";

const nowMs = 1_800_000_000_000;

function session(overrides: Record<string, unknown> = {}) {
  return {
    ...createActiveNavigationSession({
      backgroundTrackingEnabled: true,
      followModeEnabled: true,
      lastLocation: {
        accuracyMeters: 8,
        headingDegrees: 90,
        latitude: 51.5074,
        longitude: -0.1278,
        speedMetersPerSecond: 9,
        timestampMs: nowMs - 1_000,
      },
      navigationState: "navigating",
      progressFloorMeters: 250,
      routeContext: "guest",
      routePlan: SAVED_ROUTE_PLANS[0],
      savedAtMs: nowMs,
    }),
    ...overrides,
  };
}

describe("active navigation session", () => {
  it("persists changing guidance fields as a compact delta tied to an immutable route revision", () => {
    const original = session();
    const updated = session({
      followModeEnabled: false,
      navigationInstanceId: original.navigationInstanceId,
      navigationState: "paused",
      progressFloorMeters: 700,
      savedAtMs: nowMs + 2_000,
    });
    const full = serializeActiveNavigationSession(updated);
    const delta = serializeActiveNavigationSessionDelta(updated);
    assert.ok(full);
    assert.ok(delta);
    assert.ok(delta.length < full.length / 4);
    const merged = mergeActiveNavigationSessionDelta(original, delta, nowMs + 2_000);
    assert.equal(merged.navigationState, "paused");
    assert.equal(merged.followModeEnabled, false);
    assert.equal(merged.progressFloorMeters, 700);
    assert.equal(merged.routePlan.id, original.routePlan.id);
    assert.deepEqual(merged.routePlan.route.coordinates, original.routePlan.route.coordinates);
    assert.equal(
      createActiveNavigationRouteRevision(original.routePlan),
      createActiveNavigationRouteRevision(original.routePlan),
    );
    const otherGeometry = {
      ...original.routePlan,
      route: {
        ...original.routePlan.route,
        coordinates: original.routePlan.route.coordinates.map((coordinate, index) =>
          index === 1
            ? { ...coordinate, latitude: coordinate.latitude + 0.01 }
            : coordinate
        ),
      },
    };
    assert.equal(
      mergeActiveNavigationSessionDelta(
        { ...original, routePlan: otherGeometry },
        delta,
        nowMs + 2_000,
      ).navigationState,
      original.navigationState,
    );
  });
  it("round-trips a bounded active route session", () => {
    const original = session();
    const serialized = serializeActiveNavigationSession(original);
    const normalized = normalizeActiveNavigationSession(serialized, nowMs);

    assert.ok(serialized);
    assert.equal(normalized?.routePlan.id, SAVED_ROUTE_PLANS[0].id);
    assert.equal(normalized?.navigationState, "navigating");
    assert.equal(
      normalized?.navigationInstanceId,
      original.navigationInstanceId,
    );
    assert.equal(normalized?.navigationStartedAtMs, nowMs);
    assert.equal(normalized?.progressFloorMeters, 250);
  });

  it("fails closed for stale, terminal, malformed, or incomplete sessions", () => {
    assert.equal(
      normalizeActiveNavigationSession(
        session({ savedAtMs: nowMs - ACTIVE_NAVIGATION_SESSION_MAX_AGE_MS - 1 }),
        nowMs,
      ),
      null,
    );
    assert.equal(
      normalizeActiveNavigationSession(session({ navigationState: "arrived" }), nowMs),
      null,
    );
    assert.equal(normalizeActiveNavigationSession("not-json", nowMs), null);
    assert.equal(
      normalizeActiveNavigationSession(
        session({ navigationInstanceId: "", version: 4 }),
        nowMs,
      ),
      null,
    );
    assert.equal(
      normalizeActiveNavigationSession(
        session({
          routePlan: {
            ...SAVED_ROUTE_PLANS[0],
            route: { ...SAVED_ROUTE_PLANS[0].route, coordinates: [] },
          },
        }),
        nowMs,
      ),
      null,
    );
    assert.equal(
      normalizeActiveNavigationSession(
        session({
          routePlan: {
            ...SAVED_ROUTE_PLANS[0],
            route: {
              ...SAVED_ROUTE_PLANS[0].route,
              coordinates: [
                SAVED_ROUTE_PLANS[0].route.coordinates[0],
                SAVED_ROUTE_PLANS[0].route.coordinates[0],
              ],
            },
          },
        }),
        nowMs,
      ),
      null,
    );
  });

  it("resumes public guidance only while signed out and workspace guidance only for the active principal and client", () => {
    const publicGuest = normalizeActiveNavigationSession(session(), nowMs);
    const workspaceGuest = normalizeActiveNavigationSession(
      session({
        accessScope: { clientId: "workspace-a", kind: "workspace", principalId: "user-a" },
        routePlan: { ...SAVED_ROUTE_PLANS[0], clientId: "workspace-a" },
      }),
      nowMs,
    );
    const saved = normalizeActiveNavigationSession(
      session({
        accessScope: { clientId: "workspace-a", kind: "workspace", principalId: "user-a" },
        routeContext: "saved",
        routePlan: { ...SAVED_ROUTE_PLANS[0], clientId: " workspace-a " },
      }),
      nowMs,
    );

    assert.ok(publicGuest && canResumeActiveNavigationSession(publicGuest, false));
    assert.ok(publicGuest && !canResumeActiveNavigationSession(publicGuest, true));
    assert.ok(workspaceGuest && !canResumeActiveNavigationSession(workspaceGuest, false));
    assert.ok(workspaceGuest && !canResumeActiveNavigationSession(workspaceGuest, true));
    assert.ok(
      workspaceGuest &&
        !canResumeActiveNavigationSession(workspaceGuest, true, "workspace-b", "user-a"),
    );
    assert.ok(
      workspaceGuest &&
        canResumeActiveNavigationSession(workspaceGuest, true, " workspace-a ", " user-a "),
    );
    assert.ok(
      workspaceGuest &&
        !canResumeActiveNavigationSession(workspaceGuest, true, "workspace-a", "user-b"),
    );
    assert.ok(
      workspaceGuest &&
        !canResumeActiveNavigationSession(workspaceGuest, true, "workspace-a", ""),
    );
    assert.ok(saved && !canResumeActiveNavigationSession(saved, false));
    assert.ok(saved && canResumeActiveNavigationSession(saved, true, "workspace-a", "user-a"));
  });

  it("matches route previews by immutable plan identity, context, and access scope", () => {
    const publicGuest = session();
    const reroutedPublicPlan = {
      ...publicGuest.routePlan,
      route: {
        ...publicGuest.routePlan.route,
        id: `${publicGuest.routePlan.route.id}-reroute-2`,
      },
    };
    const workspaceGuest = createActiveNavigationSession({
      followModeEnabled: true,
      navigationState: "paused",
      principalId: "user-a",
      progressFloorMeters: 80,
      routeContext: "guest",
      routePlan: {
        ...SAVED_ROUTE_PLANS[0],
        clientId: "workspace-a",
      },
      savedAtMs: nowMs,
    });

    assert.equal(
      isNavigationSessionForRoutePreview({
        navigationSession: publicGuest,
        routeContext: "guest",
        routePlan: reroutedPublicPlan,
      }),
      true,
    );
    assert.equal(
      isNavigationSessionForRoutePreview({
        navigationSession: publicGuest,
        routeContext: "saved",
        routePlan: reroutedPublicPlan,
      }),
      false,
    );
    assert.equal(
      isNavigationSessionForRoutePreview({
        navigationSession: publicGuest,
        routeContext: "guest",
        routePlan: { ...reroutedPublicPlan, id: "another-plot" },
      }),
      false,
    );
    assert.equal(
      isNavigationSessionForRoutePreview({
        navigationSession: publicGuest,
        routeContext: "guest",
        routePlan: { ...reroutedPublicPlan, id: "   " },
      }),
      false,
    );
    assert.equal(
      isNavigationSessionForRoutePreview({
        navigationSession: workspaceGuest,
        principalId: " user-a ",
        routeContext: "guest",
        routePlan: {
          ...workspaceGuest.routePlan,
          clientId: " workspace-a ",
          route: {
            ...workspaceGuest.routePlan.route,
            id: `${workspaceGuest.routePlan.route.id}-reroute-3`,
          },
        },
      }),
      true,
    );
    assert.equal(
      isNavigationSessionForRoutePreview({
        navigationSession: workspaceGuest,
        principalId: "user-b",
        routeContext: "guest",
        routePlan: workspaceGuest.routePlan,
      }),
      false,
    );
    assert.equal(
      isNavigationSessionForRoutePreview({
        navigationSession: workspaceGuest,
        principalId: "user-a",
        routeContext: "guest",
        routePlan: { ...workspaceGuest.routePlan, clientId: "workspace-b" },
      }),
      false,
    );
  });

  it("rejects saved guidance without an authorized workspace identity", () => {
    assert.equal(
      normalizeActiveNavigationSession(session({ routeContext: "saved" }), nowMs),
      null,
    );
    assert.ok(
      normalizeActiveNavigationSession(
        session({
          accessScope: { clientId: "workspace-a", kind: "workspace", principalId: "user-a" },
          routeContext: "saved",
          routePlan: { ...SAVED_ROUTE_PLANS[0], clientId: "workspace-a" },
        }),
        nowMs,
      ),
    );
  });

  it("rejects legacy and contradictory access scopes", () => {
    assert.ok(normalizeActiveNavigationSession(session({ version: 2 }), nowMs));
    const migratedV3 = normalizeActiveNavigationSession(
      session({ version: 3 }),
      nowMs,
    );
    assert.match(migratedV3?.navigationInstanceId || "", /^legacy-/);
    assert.equal(
      normalizeActiveNavigationSession(session({ version: 1 }), nowMs),
      null,
    );
    assert.equal(
      normalizeActiveNavigationSession(
        session({
          accessScope: { kind: "public" },
          routePlan: { ...SAVED_ROUTE_PLANS[0], clientId: "workspace-a" },
        }),
        nowMs,
      ),
      null,
    );
    assert.equal(
      normalizeActiveNavigationSession(
        session({
          accessScope: { clientId: "workspace-b", kind: "workspace", principalId: "user-a" },
          routePlan: { ...SAVED_ROUTE_PLANS[0], clientId: "workspace-a" },
        }),
        nowMs,
      ),
      null,
    );
    assert.equal(
      normalizeActiveNavigationSession(
        session({
          accessScope: { clientId: "workspace-a", kind: "workspace" },
          routePlan: { ...SAVED_ROUTE_PLANS[0], clientId: "workspace-a" },
          version: 2,
        }),
        nowMs,
      ),
      null,
    );
  });

  it("creates a bounded unique journey identity", () => {
    assert.notEqual(
      createActiveNavigationInstanceId(nowMs, 0.1),
      createActiveNavigationInstanceId(nowMs, 0.2),
    );
    assert.match(createActiveNavigationInstanceId(nowMs, 0.1), /^nav-/);
  });

  it("merges only newer background locations", () => {
    const active = normalizeActiveNavigationSession(session(), nowMs);
    assert.ok(active);
    const newer = mergeActiveNavigationLocation(active, {
      ...(active.lastLocation as NonNullable<typeof active.lastLocation>),
      latitude: 51.508,
      timestampMs: nowMs + 1_000,
    });
    const stale = mergeActiveNavigationLocation(newer, {
      ...(newer.lastLocation as NonNullable<typeof newer.lastLocation>),
      latitude: 51.4,
      timestampMs: nowMs,
    });

    assert.equal(newer.lastLocation?.latitude, 51.508);
    assert.equal(stale, newer);
  });

  it("caps invalid progress floors at zero", () => {
    assert.equal(
      normalizeActiveNavigationSession(
        session({ progressFloorMeters: -200 }),
        nowMs,
      )?.progressFloorMeters,
      0,
    );
    const restored = normalizeActiveNavigationSession(
      session({ progressFloorMeters: 1_000_000_000 }),
      nowMs,
    );
    assert.ok(restored);
    assert.ok(restored.progressFloorMeters < 1_000_000_000);
  });

  it("measures payload bounds as UTF-8 bytes rather than JavaScript characters", () => {
    const oversizedUnicode = session({
      routePlan: {
        ...SAVED_ROUTE_PLANS[0],
        name: "🚗".repeat(
          Math.floor(ACTIVE_NAVIGATION_SESSION_MAX_PAYLOAD_BYTES / 4) + 1,
        ),
      },
    });

    assert.equal(
      serializeActiveNavigationSession(
        oversizedUnicode as ReturnType<typeof session>,
      ),
      null,
    );
    assert.equal(
      normalizeActiveNavigationSession(
        `"${"🚗".repeat(
          Math.floor(ACTIVE_NAVIGATION_SESSION_MAX_PAYLOAD_BYTES / 4) + 1,
        )}"`,
        nowMs,
      ),
      null,
    );
  });

  it("rejects malformed navigation-step metrics before they reach guidance", () => {
    const routePlan = SAVED_ROUTE_PLANS[0];
    assert.equal(
      normalizeActiveNavigationSession(
        session({
          routePlan: {
            ...routePlan,
            route: {
              ...routePlan.route,
              navigationSteps: [
                {
                  coordinate: routePlan.route.coordinates[0],
                  distanceAlongMeters: 0,
                  distanceMeters: -1,
                  durationSeconds: 10,
                  id: "bad-step",
                  instruction: "Continue",
                  maneuverType: "straight",
                },
              ],
            },
          },
        }),
        nowMs,
      ),
      null,
    );
  });

  it("rejects an unverified persisted backend guidance stamp", () => {
    const routePlan = SAVED_ROUTE_PLANS[0];
    assert.equal(
      normalizeActiveNavigationSession(
        session({
          routePlan: {
            ...routePlan,
            route: {
              ...routePlan.route,
              navigationStepSource: "backend",
              navigationSteps: [
                {
                  coordinate: routePlan.route.coordinates[0],
                  distanceAlongMeters: 0,
                  distanceMeters: 10,
                  durationSeconds: 2,
                  id: "backend-step",
                  instruction: "Continue",
                  maneuverType: "straight",
                },
              ],
            },
          },
        }),
        nowMs,
      ),
      null,
    );
  });

  it("restores route progress but not a stale last-known vehicle position", () => {
    const restored = normalizeActiveNavigationSession(
      session({
        lastLocation: {
          accuracyMeters: 8,
          headingDegrees: 90,
          latitude: 51.5074,
          longitude: -0.1278,
          speedMetersPerSecond: 9,
          timestampMs: nowMs - 3 * 60 * 1000,
        },
      }),
      nowMs,
    );

    assert.ok(restored);
    assert.equal(restored.lastLocation, null);
    assert.equal(restored.progressFloorMeters, 250);
  });

  it("uses an invalid revocation record when physical removal fails", async () => {
    const writes: string[] = [];
    const revoked = await revokePersistedActiveNavigationSession(
      async () => {
        writes.push("revoked");
      },
      async () => {
        throw new Error("remove failed");
      },
    );

    assert.equal(revoked, true);
    assert.deepEqual(writes, ["revoked"]);
  });

  it("reports revocation failure only when neither overwrite nor removal succeeds", async () => {
    const revoked = await revokePersistedActiveNavigationSession(
      async () => {
        throw new Error("write failed");
      },
      async () => {
        throw new Error("remove failed");
      },
    );

    assert.equal(revoked, false);
  });

  it("uses an independent fallback tombstone when primary navigation storage cannot clear", async () => {
    const calls: string[] = [];
    const revoked = await ensurePersistedNavigationRevocation(
      async () => false,
      async () => {
        calls.push("fallback-written");
      },
      async () => {
        calls.push("fallback-cleared");
      },
    );

    assert.equal(revoked, true);
    assert.deepEqual(calls, ["fallback-written"]);
  });

  it("fails revocation only when primary and fallback storage both fail", async () => {
    const revoked = await ensurePersistedNavigationRevocation(
      async () => false,
      async () => {
        throw new Error("fallback failed");
      },
      async () => undefined,
    );

    assert.equal(revoked, false);
  });

  it("clears a fallback tombstone before treating a new session save as durable", async () => {
    let storedSession = "old-session";
    let fallbackRevoked = true;

    const saved = await persistAuthorizedNavigationSession(
      async () => {
        storedSession = "new-session";
      },
      async () => {
        fallbackRevoked = false;
      },
    );

    assert.equal(saved, true);
    assert.equal(fallbackRevoked, false);
    assert.equal(storedSession, "new-session");
    assert.equal(await hasPersistedNavigationRevocation(
      async () => fallbackRevoked ? "revoked" : null,
      "revoked",
    ), false);
  });

  it("fails a new session save closed while its fallback tombstone cannot clear", async () => {
    const saved = await persistAuthorizedNavigationSession(
      async () => undefined,
      async () => {
        throw new Error("fallback clear failed");
      },
    );

    assert.equal(saved, false);
  });

  it("propagates fallback tombstone read errors so cold restore fails closed", async () => {
    await assert.rejects(
      hasPersistedNavigationRevocation(
        async () => {
          throw new Error("fallback read failed");
        },
        "revoked",
      ),
      /fallback read failed/,
    );
  });
});
