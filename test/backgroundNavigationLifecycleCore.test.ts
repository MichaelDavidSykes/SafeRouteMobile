import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createBackgroundNavigationLifecycleCoordinator } from "../src/features/live-map/backgroundNavigationLifecycleCore";

type Authorization = { routeId: string };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("background navigation lifecycle coordinator", () => {
  it("serializes a stop behind an in-flight start and cleans the stale result", async () => {
    const coordinator = createBackgroundNavigationLifecycleCoordinator<Authorization>(
      (left, right) => left.routeId === right.routeId,
    );
    const startGate = deferred();
    const startEntered = deferred();
    let authorizedRoute: string | null = null;
    const events: string[] = [];

    const start = coordinator.requestStart(
      { routeId: "route-a" },
      async () => {
        events.push("start-a");
        startEntered.resolve();
        await startGate.promise;
        authorizedRoute = "route-a";
        events.push("grant-a");
        return "active";
      },
      async () => {
        authorizedRoute = null;
        events.push("stale-a-stopped");
        return "idle";
      },
    );
    await startEntered.promise;
    const stop = coordinator.requestStop(
      { routeId: "route-a" },
      async () => {
        authorizedRoute = null;
        events.push("stop-a");
      },
    );

    startGate.resolve();
    assert.equal(await start, "idle");
    assert.equal(await stop, true);
    assert.equal(authorizedRoute, null);
    assert.deepEqual(events, ["start-a", "grant-a", "stale-a-stopped", "stop-a"]);
  });

  it("lets a newer route replace a stale start without an old cleanup stopping it", async () => {
    const coordinator = createBackgroundNavigationLifecycleCoordinator<Authorization>(
      (left, right) => left.routeId === right.routeId,
    );
    const startGate = deferred();
    const startEntered = deferred();
    let authorizedRoute: string | null = null;

    const startA = coordinator.requestStart(
      { routeId: "route-a" },
      async () => {
        startEntered.resolve();
        await startGate.promise;
        authorizedRoute = "route-a";
        return "active-a";
      },
      async () => {
        authorizedRoute = null;
        return "stale-a";
      },
    );
    await startEntered.promise;
    const startB = coordinator.requestStart(
      { routeId: "route-b" },
      async () => {
        authorizedRoute = "route-b";
        return "active-b";
      },
      async () => "stale-b",
    );

    startGate.resolve();
    assert.equal(await startA, "stale-a");
    assert.equal(await startB, "active-b");
    assert.equal(authorizedRoute, "route-b");
    assert.equal(
      await coordinator.requestStop(
        { routeId: "route-a" },
        async () => {
          authorizedRoute = null;
        },
      ),
      false,
    );
    assert.equal(authorizedRoute, "route-b");
  });
});
