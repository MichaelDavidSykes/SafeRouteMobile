import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { recordOwnedRouteCacheReadback } from "../src/features/routes/ownedRouteCacheReadback";

describe("owned route cache readback", () => {
  it("does not record evidence for a request that is already stale", async () => {
    let recorded = false;

    const owned = await recordOwnedRouteCacheReadback(
      () => false,
      async () => {
        recorded = true;
      },
    );

    assert.equal(owned, false);
    assert.equal(recorded, false);
  });

  it("rejects a request that loses ownership while evidence is recording", async () => {
    let ownsRequest = true;
    let releaseRecord: (() => void) | undefined;
    const recording = new Promise<void>((resolve) => {
      releaseRecord = resolve;
    });

    const result = recordOwnedRouteCacheReadback(
      () => ownsRequest,
      () => recording,
    );
    ownsRequest = false;
    releaseRecord?.();

    assert.equal(await result, false);
  });

  it("accepts a request that still owns the result after recording", async () => {
    assert.equal(
      await recordOwnedRouteCacheReadback(
        () => true,
        async () => undefined,
      ),
      true,
    );
  });
});
