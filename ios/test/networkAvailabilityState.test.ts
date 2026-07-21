import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createNetworkAvailabilityMachineState,
  reduceNetworkAvailabilityMachine,
  resolveNetworkAvailabilityStatus,
  resolveNetworkReconnectTransition,
} from "../src/features/api/networkAvailabilityState";

describe("network availability state", () => {
  it("fails closed while native connectivity is unknown or incomplete", () => {
    assert.equal(
      resolveNetworkAvailabilityStatus({
        isConnected: null,
        isInternetReachable: null,
      }),
      "checking",
    );
    assert.equal(
      resolveNetworkAvailabilityStatus({
        isConnected: true,
        isInternetReachable: null,
      }),
      "checking",
    );
    assert.equal(
      resolveNetworkAvailabilityStatus({
        isConnected: null,
        isInternetReachable: true,
      }),
      "checking",
    );
  });

  it("requires positive connection and reachability evidence before going online", () => {
    assert.equal(
      resolveNetworkAvailabilityStatus({
        isConnected: true,
        isInternetReachable: true,
      }),
      "online",
    );
  });

  it("treats either explicit native failure as offline", () => {
    assert.equal(
      resolveNetworkAvailabilityStatus({
        isConnected: false,
        isInternetReachable: true,
      }),
      "offline",
    );
    assert.equal(
      resolveNetworkAvailabilityStatus({
        isConnected: true,
        isInternetReachable: false,
      }),
      "offline",
    );
    assert.equal(
      resolveNetworkAvailabilityStatus({
        isConnected: false,
        isInternetReachable: null,
      }),
      "offline",
    );
  });

  it("keeps native snapshots checking while backgrounded and during foreground refresh", () => {
    let state = createNetworkAvailabilityMachineState(false);
    state = reduceNetworkAvailabilityMachine(state, {
      snapshot: { isConnected: true, isInternetReachable: true },
      type: "snapshot",
    });
    assert.equal(state.status, "checking");

    state = reduceNetworkAvailabilityMachine(state, {
      active: true,
      type: "app-state",
    });
    const generation = state.refreshGeneration;
    state = reduceNetworkAvailabilityMachine(state, {
      snapshot: { isConnected: true, isInternetReachable: true },
      type: "snapshot",
    });
    assert.equal(state.status, "checking");

    state = reduceNetworkAvailabilityMachine(state, {
      generation,
      snapshot: { isConnected: true, isInternetReachable: true },
      type: "refresh-settled",
    });
    assert.equal(state.status, "online");
  });

  it("reconciles a state change that occurred before the native subscription", () => {
    let state = createNetworkAvailabilityMachineState(true);
    state = reduceNetworkAvailabilityMachine(state, {
      active: false,
      type: "app-state",
    });
    state = reduceNetworkAvailabilityMachine(state, {
      snapshot: { isConnected: true, isInternetReachable: true },
      type: "snapshot",
    });

    assert.equal(state.active, false);
    assert.equal(state.status, "checking");
  });

  it("ignores stale foreground refreshes and fails closed on refresh rejection", () => {
    let state = createNetworkAvailabilityMachineState(true);
    state = reduceNetworkAvailabilityMachine(state, {
      active: false,
      type: "app-state",
    });
    const staleGeneration = state.refreshGeneration;
    state = reduceNetworkAvailabilityMachine(state, {
      active: true,
      type: "app-state",
    });
    state = reduceNetworkAvailabilityMachine(state, {
      generation: staleGeneration,
      snapshot: { isConnected: true, isInternetReachable: true },
      type: "refresh-settled",
    });
    assert.equal(state.status, "checking");
    assert.equal(state.refreshPending, true);

    state = reduceNetworkAvailabilityMachine(state, {
      generation: state.refreshGeneration,
      type: "refresh-settled",
    });
    assert.equal(state.status, "checking");
    assert.equal(state.refreshPending, false);
  });

  it("preserves one reconnect across offline-checking-online and consumes it once", () => {
    const offline = resolveNetworkReconnectTransition({
      current: "offline",
      offlineObserved: false,
      previous: "checking",
    });
    const checking = resolveNetworkReconnectTransition({
      current: "checking",
      offlineObserved: offline.offlineObserved,
      previous: "offline",
    });
    const online = resolveNetworkReconnectTransition({
      current: "online",
      offlineObserved: checking.offlineObserved,
      previous: "checking",
    });
    const duplicateOnline = resolveNetworkReconnectTransition({
      current: "online",
      offlineObserved: online.offlineObserved,
      previous: "online",
    });

    assert.deepEqual(offline, { offlineObserved: true, retry: false });
    assert.deepEqual(checking, { offlineObserved: true, retry: false });
    assert.deepEqual(online, { offlineObserved: false, retry: true });
    assert.deepEqual(duplicateOnline, {
      offlineObserved: false,
      retry: false,
    });
  });
});
