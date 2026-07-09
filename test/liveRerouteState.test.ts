import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyLiveRerouteSample,
  createLiveRerouteState,
  evaluateOffRouteSample,
  extractRemainingCheckpoints,
  getManualRerouteRetryEligibility,
  requestImmediateLiveReroute,
  resolveLiveRerouteFailure,
  resolveLiveRerouteSuccess,
  retryFailedLiveReroute,
  startLiveRerouteMonitoring,
  stopLiveRerouteMonitoring,
  type LiveRerouteConfig,
  type LiveRerouteLocationSample,
  type LiveRerouteRequest,
  type LiveRerouteRequestRevision,
  type LiveRerouteState,
  type PendingLiveRerouteState,
} from "../src/features/live-map/liveRerouteState";

const TEST_CONFIG: Partial<LiveRerouteConfig> = {
  accuracyBufferMultiplier: 1,
  autoRerouteCooldownMs: 30_000,
  manualRetryDelayMs: 2_000,
  maxEvidenceGapMs: 1_500,
  maxUsableAccuracyMeters: 50,
  offRouteDurationMs: 2_000,
  offRouteSampleCount: 3,
  offRouteThresholdMeters: 75,
  recoveryDurationMs: 2_000,
  recoverySampleCount: 3,
  recoveryThresholdMeters: 40,
};

function locationSample(
  timestampMs: number,
  distanceFromRouteMeters = 90,
  horizontalAccuracyMeters: number | null = 5,
): LiveRerouteLocationSample {
  return {
    coordinate: {
      latitude: 51.5074,
      longitude: -0.1278,
    },
    distanceFromRouteMeters,
    horizontalAccuracyMeters,
    timestampMs,
  };
}

function monitoringState(
  routeId = "route-a",
  nowMs = 0,
  cooldownUntilMs?: number,
) {
  return startLiveRerouteMonitoring(createLiveRerouteState(), {
    cooldownUntilMs,
    nowMs,
    routeId,
  });
}

function automaticRequest(
  initialState: LiveRerouteState = monitoringState(),
): PendingLiveRerouteState {
  let state = initialState;
  for (const timestampMs of [1_000, 2_000, 3_000]) {
    state = applyLiveRerouteSample(
      state,
      locationSample(timestampMs),
      TEST_CONFIG,
    ).state;
  }

  return expectPending(state);
}

function requestRevision(
  request: LiveRerouteRequest,
): LiveRerouteRequestRevision {
  return {
    requestRevision: request.requestRevision,
    routeId: request.routeId,
    routeRevision: request.routeRevision,
  };
}

function expectPending(state: LiveRerouteState): PendingLiveRerouteState {
  if (state.status !== "pending") {
    assert.fail(`Expected pending reroute state, received ${state.status}.`);
  }

  return state;
}

describe("live reroute sample evaluation", () => {
  it("uses the full accuracy radius for deviation and recovery decisions", () => {
    const offRoute = evaluateOffRouteSample(
      locationSample(1_000, 100, 20),
      TEST_CONFIG,
    );
    const overlap = evaluateOffRouteSample(
      locationSample(2_000, 90, 20),
      TEST_CONFIG,
    );
    const onRoute = evaluateOffRouteSample(
      locationSample(3_000, 25, 10),
      TEST_CONFIG,
    );

    assert.deepEqual(offRoute, {
      classification: "off-route",
      maximumPossibleDistanceMeters: 120,
      minimumPossibleDistanceMeters: 80,
      reason: "confirmed-deviation",
    });
    assert.deepEqual(overlap, {
      classification: "uncertain",
      maximumPossibleDistanceMeters: 110,
      minimumPossibleDistanceMeters: 70,
      reason: "threshold-overlap",
    });
    assert.deepEqual(onRoute, {
      classification: "on-route",
      maximumPossibleDistanceMeters: 35,
      minimumPossibleDistanceMeters: 15,
      reason: "confirmed-recovery",
    });
  });

  it("does not treat missing or poor GPS accuracy as off-route evidence", () => {
    assert.equal(
      evaluateOffRouteSample(locationSample(1_000, 200, null), TEST_CONFIG)
        .reason,
      "accuracy-unavailable",
    );
    assert.deepEqual(
      evaluateOffRouteSample(locationSample(2_000, 200, 75), TEST_CONFIG),
      {
        classification: "uncertain",
        maximumPossibleDistanceMeters: 275,
        minimumPossibleDistanceMeters: 125,
        reason: "accuracy-too-low",
      },
    );
  });

  it("rejects malformed fixes without advancing monitoring timestamps", () => {
    const started = monitoringState();
    const invalid = applyLiveRerouteSample(
      started,
      {
        ...locationSample(1_000),
        coordinate: { latitude: 100, longitude: -0.1 },
      },
      TEST_CONFIG,
    );

    assert.equal(invalid.evaluation.classification, "invalid");
    assert.equal(invalid.evaluation.reason, "invalid-coordinate");
    assert.strictEqual(invalid.state, started);
    assert.equal(invalid.request, null);
  });
});

describe("live reroute hysteresis and cooldown", () => {
  it("requires both the configured sample count and elapsed time", () => {
    let state: LiveRerouteState = monitoringState();

    for (const timestampMs of [0, 500, 1_000]) {
      state = applyLiveRerouteSample(
        state,
        locationSample(timestampMs),
        TEST_CONFIG,
      ).state;
    }

    assert.equal(state.status, "monitoring");
    if (state.status !== "monitoring") {
      assert.fail("Expected monitoring state before time hysteresis elapsed.");
    }
    assert.equal(state.deviationEvidence.count, 3);
    assert.equal(state.isOffRoute, false);

    const triggered = applyLiveRerouteSample(
      state,
      locationSample(2_500),
      TEST_CONFIG,
    );
    const pending = expectPending(triggered.state);

    assert.equal(triggered.request?.trigger, "automatic");
    assert.equal(pending.isOffRoute, true);
    assert.equal(pending.request.requestRevision, 1);
    assert.equal(pending.request.routeRevision, 1);
  });

  it("resets consecutive evidence after an uncertain fix or a long sample gap", () => {
    let state: LiveRerouteState = monitoringState();
    state = applyLiveRerouteSample(
      state,
      locationSample(0),
      TEST_CONFIG,
    ).state;
    state = applyLiveRerouteSample(
      state,
      locationSample(1_000, 55, 10),
      TEST_CONFIG,
    ).state;
    state = applyLiveRerouteSample(
      state,
      locationSample(2_000),
      TEST_CONFIG,
    ).state;

    assert.equal(state.status, "monitoring");
    if (state.status !== "monitoring") {
      assert.fail("Expected monitoring after uncertain evidence reset.");
    }
    assert.equal(state.deviationEvidence.count, 1);

    state = applyLiveRerouteSample(
      state,
      locationSample(4_000),
      TEST_CONFIG,
    ).state;
    assert.equal(state.status, "monitoring");
    if (state.status !== "monitoring") {
      assert.fail("Expected monitoring after evidence gap reset.");
    }
    assert.equal(state.deviationEvidence.count, 1);

    state = applyLiveRerouteSample(
      state,
      locationSample(5_000),
      TEST_CONFIG,
    ).state;
    const triggered = applyLiveRerouteSample(
      state,
      locationSample(6_000),
      TEST_CONFIG,
    );
    assert.equal(triggered.state.status, "pending");
  });

  it("ignores duplicate and out-of-order samples", () => {
    const first = applyLiveRerouteSample(
      monitoringState(),
      locationSample(1_000),
      TEST_CONFIG,
    ).state;
    const duplicate = applyLiveRerouteSample(
      first,
      locationSample(1_000),
      TEST_CONFIG,
    );
    const older = applyLiveRerouteSample(
      first,
      locationSample(999),
      TEST_CONFIG,
    );

    assert.strictEqual(duplicate.state, first);
    assert.equal(duplicate.ignoredReason, "out-of-order");
    assert.strictEqual(older.state, first);
    assert.equal(older.ignoredReason, "out-of-order");
  });

  it("confirms off-route state during cooldown but waits to issue the request", () => {
    let state: LiveRerouteState = monitoringState("route-a", 0, 10_000);

    for (const timestampMs of [1_000, 2_000, 3_000]) {
      const transition = applyLiveRerouteSample(
        state,
        locationSample(timestampMs),
        TEST_CONFIG,
      );
      assert.equal(transition.request, null);
      state = transition.state;
    }

    assert.equal(state.status, "monitoring");
    if (state.status !== "monitoring") {
      assert.fail("Expected cooldown-suppressed monitoring state.");
    }
    assert.equal(state.isOffRoute, true);

    const beforeCooldown = applyLiveRerouteSample(
      state,
      locationSample(9_999),
      TEST_CONFIG,
    );
    assert.equal(beforeCooldown.request, null);

    const atCooldown = applyLiveRerouteSample(
      beforeCooldown.state,
      locationSample(10_000),
      TEST_CONFIG,
    );
    assert.equal(atCooldown.state.status, "pending");
    assert.equal(atCooldown.request?.requestedAtMs, 10_000);
  });

  it("uses recovery hysteresis and invalidates a pending request after recovery", () => {
    const pending = automaticRequest();
    const originalRevision = requestRevision(pending.request);
    let state: LiveRerouteState = pending;

    for (const timestampMs of [4_000, 5_000]) {
      state = applyLiveRerouteSample(
        state,
        locationSample(timestampMs, 20, 5),
        TEST_CONFIG,
      ).state;
      assert.equal(state.status, "pending");
    }

    state = applyLiveRerouteSample(
      state,
      locationSample(6_000, 20, 5),
      TEST_CONFIG,
    ).state;
    assert.equal(state.status, "monitoring");
    if (state.status !== "monitoring") {
      assert.fail("Expected monitoring after recovery hysteresis.");
    }
    assert.equal(state.isOffRoute, false);
    assert.equal(state.routeRevision, originalRevision.routeRevision + 1);

    const lateResponse = resolveLiveRerouteSuccess(state, {
      ...originalRevision,
      receivedAtMs: 6_500,
    });
    assert.equal(lateResponse.accepted, false);
    assert.equal(lateResponse.reason, "stale-response");
    assert.strictEqual(lateResponse.state, state);
  });
});

describe("live reroute request revisions and responses", () => {
  it("accepts only the current pending revision and starts a success cooldown", () => {
    const pending = automaticRequest();
    const revision = requestRevision(pending.request);
    const staleRevision = {
      ...revision,
      requestRevision: revision.requestRevision + 1,
    };

    const stale = resolveLiveRerouteSuccess(pending, {
      ...staleRevision,
      receivedAtMs: 4_000,
    });
    assert.equal(stale.accepted, false);
    assert.strictEqual(stale.state, pending);

    const success = resolveLiveRerouteSuccess(
      pending,
      {
        ...revision,
        nextRouteId: "route-a-rerouted",
        receivedAtMs: 4_000,
      },
      TEST_CONFIG,
    );

    assert.equal(success.accepted, true);
    assert.equal(success.state.status, "monitoring");
    if (success.state.status !== "monitoring") {
      assert.fail("Expected monitoring after accepted reroute.");
    }
    assert.equal(success.state.routeId, "route-a-rerouted");
    assert.equal(success.state.routeRevision, revision.routeRevision + 1);
    assert.equal(success.state.requestRevision, revision.requestRevision);
    assert.equal(success.state.cooldownUntilMs, 34_000);
    assert.equal(success.state.isOffRoute, false);
  });

  it("rejects a response delivered after navigation stops", () => {
    const pending = automaticRequest();
    const revision = requestRevision(pending.request);
    const idle = stopLiveRerouteMonitoring(pending, 3_500);
    const response = resolveLiveRerouteSuccess(idle, {
      ...revision,
      receivedAtMs: 4_000,
    });

    assert.equal(idle.status, "idle");
    assert.equal(idle.routeRevision, revision.routeRevision + 1);
    assert.equal(response.accepted, false);
    assert.strictEqual(response.state, idle);
  });

  it("rejects a response after an external route change", () => {
    const pending = automaticRequest();
    const revision = requestRevision(pending.request);
    const replacement = startLiveRerouteMonitoring(pending, {
      nowMs: 3_500,
      routeId: "route-b",
    });

    const response = resolveLiveRerouteFailure(replacement, {
      ...revision,
      failedAtMs: 4_000,
      message: "late failure",
    });

    assert.equal(replacement.routeRevision, revision.routeRevision + 1);
    assert.equal(response.accepted, false);
    assert.strictEqual(response.state, replacement);
  });

  it("keeps request revisions monotonic across stop and route generations", () => {
    const firstPending = automaticRequest();
    const idle = stopLiveRerouteMonitoring(firstPending, 3_500);
    let state: LiveRerouteState = startLiveRerouteMonitoring(idle, {
      nowMs: 4_000,
      routeId: "route-b",
    });

    for (const timestampMs of [5_000, 6_000, 7_000]) {
      state = applyLiveRerouteSample(
        state,
        locationSample(timestampMs),
        TEST_CONFIG,
      ).state;
    }

    const secondPending = expectPending(state);
    assert.equal(firstPending.request.requestRevision, 1);
    assert.equal(secondPending.request.requestRevision, 2);
    assert.ok(
      secondPending.request.routeRevision > firstPending.request.routeRevision,
    );
  });
});

describe("failed reroute and manual retry", () => {
  it("exposes failed state and respects local and provider retry delays", () => {
    const pending = automaticRequest();
    const revision = requestRevision(pending.request);
    const failed = resolveLiveRerouteFailure(
      pending,
      {
        ...revision,
        code: "  provider_busy  ",
        failedAtMs: 4_000,
        message: "  Provider   is busy.  ",
        retryEligibleAtMs: 8_000,
      },
      TEST_CONFIG,
    );

    assert.equal(failed.accepted, true);
    assert.equal(failed.state.status, "failed");
    if (failed.state.status !== "failed") {
      assert.fail("Expected failed reroute state.");
    }
    assert.deepEqual(failed.state.failure, {
      code: "provider_busy",
      failedAtMs: 4_000,
      message: "Provider is busy.",
      retryEligibleAtMs: 8_000,
    });
    assert.deepEqual(getManualRerouteRetryEligibility(failed.state, 7_999), {
      eligible: false,
      eligibleAtMs: 8_000,
      reason: "retry-delay",
    });
    assert.deepEqual(getManualRerouteRetryEligibility(failed.state, 8_000), {
      eligible: true,
      eligibleAtMs: 8_000,
      reason: null,
    });
  });

  it("does not automatically retry a failed request and allows a manual retry", () => {
    const pending = automaticRequest();
    const firstRevision = requestRevision(pending.request);
    const failedResult = resolveLiveRerouteFailure(
      pending,
      {
        ...firstRevision,
        failedAtMs: 4_000,
      },
      TEST_CONFIG,
    );
    if (failedResult.state.status !== "failed") {
      assert.fail("Expected failed reroute state.");
    }

    const laterOffRoute = applyLiveRerouteSample(
      failedResult.state,
      locationSample(40_000, 100, 5),
      TEST_CONFIG,
    );
    assert.equal(laterOffRoute.state.status, "failed");
    assert.equal(laterOffRoute.request, null);

    const retried = retryFailedLiveReroute(
      laterOffRoute.state,
      40_000,
      TEST_CONFIG,
    );
    const retryPending = expectPending(retried.state);
    assert.equal(retried.eligibility.eligible, true);
    assert.equal(retried.request?.trigger, "manual");
    assert.equal(
      retryPending.request.requestRevision,
      firstRevision.requestRevision + 1,
    );
    assert.equal(retryPending.request.routeRevision, firstRevision.routeRevision);
    assert.equal(retryPending.request.sample.timestampMs, 40_000);

    const oldResponse = resolveLiveRerouteSuccess(retryPending, {
      ...firstRevision,
      receivedAtMs: 40_500,
    });
    assert.equal(oldResponse.accepted, false);
  });

  it("clears a failure only after recovery hysteresis completes", () => {
    const pending = automaticRequest();
    const failedResult = resolveLiveRerouteFailure(
      pending,
      {
        ...requestRevision(pending.request),
        failedAtMs: 3_500,
      },
      TEST_CONFIG,
    );
    let state = failedResult.state;

    for (const timestampMs of [4_000, 5_000]) {
      state = applyLiveRerouteSample(
        state,
        locationSample(timestampMs, 20, 5),
        TEST_CONFIG,
      ).state;
      assert.equal(state.status, "failed");
    }

    state = applyLiveRerouteSample(
      state,
      locationSample(6_000, 20, 5),
      TEST_CONFIG,
    ).state;
    assert.equal(state.status, "monitoring");
    assert.deepEqual(getManualRerouteRetryEligibility(state, 10_000), {
      eligible: false,
      eligibleAtMs: null,
      reason: "not-failed",
    });
  });
});

describe("remaining reroute checkpoints", () => {
  const checkpoints = [
    { id: "origin", kind: "origin" as const, caption: "Start" },
    { id: "alpha", kind: "waypoint" as const, caption: "Alpha" },
    { id: "bravo", kind: "waypoint" as const, caption: "Bravo" },
    { id: "destination", kind: "destination" as const, caption: "Finish" },
  ];

  it("uses the live position as the new origin and keeps future stops in order", () => {
    const remaining = extractRemainingCheckpoints(checkpoints);

    assert.deepEqual(
      remaining.map((checkpoint) => checkpoint.id),
      ["alpha", "bravo", "destination"],
    );
    assert.strictEqual(remaining[0], checkpoints[1]);
  });

  it("removes completed checkpoints and everything before the furthest completion", () => {
    assert.deepEqual(
      extractRemainingCheckpoints(checkpoints, {
        completedCheckpointIds: new Set([" origin ", " alpha "]),
      }).map((checkpoint) => checkpoint.id),
      ["bravo", "destination"],
    );
    assert.deepEqual(
      extractRemainingCheckpoints(checkpoints, {
        completedCheckpointIds: ["destination"],
      }),
      [],
    );
  });

  it("supports an explicit next checkpoint ID or absolute checkpoint index", () => {
    assert.deepEqual(
      extractRemainingCheckpoints(checkpoints, {
        nextCheckpointId: "bravo",
        nextCheckpointIndex: 1,
      }).map((checkpoint) => checkpoint.id),
      ["bravo", "destination"],
    );
    assert.deepEqual(
      extractRemainingCheckpoints(checkpoints, {
        nextCheckpointIndex: 3,
      }).map((checkpoint) => checkpoint.id),
      ["destination"],
    );
  });
});

describe("explicit live reroute states", () => {
  it("starts a proactive safety reroute without waiting for off-route evidence", () => {
    const monitoring = monitoringState("route-a", 1_000);
    const transition = requestImmediateLiveReroute(
      monitoring,
      locationSample(2_000, 0, 8),
      2_000,
      TEST_CONFIG,
    );

    assert.equal(transition.reason, "accepted");
    assert.equal(transition.request?.trigger, "safety");
    assert.equal(transition.state.status, "pending");
  });

  it("does not duplicate proactive safety reroutes while pending or cooling down", () => {
    const cooling = monitoringState("route-a", 1_000, 5_000);
    const cooldown = requestImmediateLiveReroute(
      cooling,
      locationSample(2_000, 0, 8),
      2_000,
      TEST_CONFIG,
    );
    assert.equal(cooldown.reason, "cooldown");
    const pending = requestImmediateLiveReroute(
      automaticRequest(),
      locationSample(4_000, 0, 8),
      4_000,
      TEST_CONFIG,
    );
    assert.equal(pending.reason, "not-monitoring");
  });

  it("moves from idle to monitoring and back to idle without resetting counters", () => {
    const idle = createLiveRerouteState();
    const inactiveSample = applyLiveRerouteSample(
      idle,
      locationSample(1_000),
      TEST_CONFIG,
    );
    assert.deepEqual(idle, {
      requestRevision: 0,
      routeId: null,
      routeRevision: 0,
      status: "idle",
      stoppedAtMs: null,
    });
    assert.equal(inactiveSample.ignoredReason, "inactive");
    assert.strictEqual(inactiveSample.state, idle);

    const monitoring = startLiveRerouteMonitoring(idle, {
      nowMs: 1_500,
      routeId: "  route-a  ",
    });
    assert.equal(monitoring.status, "monitoring");
    assert.equal(monitoring.routeId, "route-a");
    assert.equal(monitoring.routeRevision, 1);

    const stopped = stopLiveRerouteMonitoring(monitoring, 2_000);
    assert.deepEqual(stopped, {
      requestRevision: 0,
      routeId: null,
      routeRevision: 2,
      status: "idle",
      stoppedAtMs: 2_000,
    });
  });
});
