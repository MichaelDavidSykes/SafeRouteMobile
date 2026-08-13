import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createWorkspaceRiskRequestCache } from "../src/features/live-map/workspaceRiskRequestCacheCore";

describe("shared workspace risk request cache", () => {
  it("coalesces in-flight readers and suppresses fresh repeat network loads", async () => {
    const cache = createWorkspaceRiskRequestCache<number[]>({
      clone: (value) => [...value],
      ttlMs: 1_000,
    });
    let calls = 0;
    let resolveLoad: ((value: number[]) => void) | null = null;
    const load = () => {
      calls += 1;
      return new Promise<number[]>((resolve) => {
        resolveLoad = resolve;
      });
    };
    const first = cache.read({ identity: "token", key: "workspace", load, nowMs: 100 });
    const second = cache.read({ identity: "token", key: "workspace", load, nowMs: 100 });
    assert.equal(calls, 1);
    resolveLoad?.([1, 2]);
    assert.deepEqual(await first, [1, 2]);
    assert.deepEqual(await second, [1, 2]);
    assert.deepEqual(await cache.read({
      identity: "token",
      key: "workspace",
      load,
      nowMs: 500,
    }), [1, 2]);
    assert.equal(calls, 1);
  });

  it("revalidates stale data and invalidates on authorization boundaries", async () => {
    const cache = createWorkspaceRiskRequestCache<number[]>({
      clone: (value) => [...value],
      ttlMs: 100,
    });
    let calls = 0;
    const load = async () => [++calls];
    assert.deepEqual(await cache.read({ identity: "a", key: "workspace", load, nowMs: 0 }), [1]);
    assert.deepEqual(await cache.read({ identity: "a", key: "workspace", load, nowMs: 101 }), [2]);
    cache.invalidate("workspace");
    assert.equal(cache.peek({ identity: "a", key: "workspace", nowMs: 102 }), null);
  });

  it("does not let an invalidated or slower request repopulate stale cache data", async () => {
    const cache = createWorkspaceRiskRequestCache<number[]>({
      clone: (value) => [...value],
      ttlMs: 1_000,
    });
    let resolveSlow: ((value: number[]) => void) | null = null;
    const slow = cache.read({
      identity: "token",
      key: "workspace",
      load: () => new Promise<number[]>((resolve) => { resolveSlow = resolve; }),
      nowMs: 100,
    });
    cache.invalidate("workspace");
    assert.deepEqual(await cache.read({
      identity: "token",
      key: "workspace",
      load: async () => [2],
      nowMs: 110,
    }), [2]);
    resolveSlow?.([1]);
    assert.deepEqual(await slow, [1]);
    assert.deepEqual(
      cache.peek({ identity: "token", key: "workspace", nowMs: 120 })?.value,
      [2],
    );
  });
});
