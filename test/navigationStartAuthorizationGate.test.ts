import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cancelNavigationStartAuthorization,
  createNavigationStartAuthorizationGate,
  runNavigationStartAuthorization,
} from "../src/features/live-map/navigationStartAuthorizationGate";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("navigation start authorization gate", () => {
  it("waits for authorization and deduplicates taps before committing once", async () => {
    const authorization = deferred<string | null>();
    const gate = createNavigationStartAuthorizationGate();
    let authorizationCalls = 0;
    let commits = 0;
    const authorize = () => {
      authorizationCalls += 1;
      return authorization.promise;
    };
    const commit = () => {
      commits += 1;
    };

    const first = runNavigationStartAuthorization({ authorize, commit, gate });
    const duplicate = await runNavigationStartAuthorization({ authorize, commit, gate });

    assert.equal(gate.pending, true);
    assert.equal(commits, 0);
    assert.equal(authorizationCalls, 1);
    assert.deepEqual(duplicate, { status: "duplicate" });

    authorization.resolve(null);
    assert.deepEqual(await first, { status: "authorized" });
    assert.equal(gate.pending, false);
    assert.equal(commits, 1);
  });

  it("keeps blocked and failed authorization from committing", async () => {
    for (const authorize of [
      async () => "This workspace is unavailable.",
      async () => {
        throw new Error("network unavailable");
      },
    ]) {
      const gate = createNavigationStartAuthorizationGate();
      let commits = 0;
      const result = await runNavigationStartAuthorization({
        authorize,
        commit: () => {
          commits += 1;
        },
        gate,
      });

      assert.equal(result.status, "blocked");
      assert.match(result.status === "blocked" ? result.message : "", /workspace|verified/i);
      assert.equal(commits, 0);
      assert.equal(gate.pending, false);
    }
  });

  it("invalidates a late authorization after route change or unmount", async () => {
    const authorization = deferred<string | null>();
    const gate = createNavigationStartAuthorizationGate();
    let commits = 0;
    const resultPromise = runNavigationStartAuthorization({
      authorize: () => authorization.promise,
      commit: () => {
        commits += 1;
      },
      gate,
    });

    cancelNavigationStartAuthorization(gate);
    authorization.resolve(null);

    assert.deepEqual(await resultPromise, { status: "stale" });
    assert.equal(gate.pending, false);
    assert.equal(commits, 0);
  });
});
