import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONNECTIVITY_CONTRACT_REACHABILITY_PATH,
  createNetworkAvailabilityContractConfiguration,
} from "../src/features/api/networkAvailabilityContractCore";

describe("network availability contract", () => {
  it("configures real NetInfo reachability for exact local evidence only", async () => {
    const revision = "a".repeat(40);
    const configuration = createNetworkAvailabilityContractConfiguration({
      apiUrl: " http://127.0.0.1:18080/ ",
      enabled: true,
      sourceRevision: revision.toUpperCase(),
    });

    assert.ok(configuration);
    assert.equal(configuration.useNativeReachability, false);
    assert.equal(configuration.reachabilityMethod, "HEAD");
    assert.equal(configuration.reachabilityShortTimeout, 60_000);
    assert.equal(configuration.reachabilityLongTimeout, 60_000);
    assert.equal(configuration.reachabilityRequestTimeout, 120_000);
    assert.equal(
      configuration.reachabilityUrl,
      `http://127.0.0.1:18080${CONNECTIVITY_CONTRACT_REACHABILITY_PATH}` +
        `?source_revision=${revision}`,
    );
    assert.deepEqual(configuration.reachabilityHeaders, {
      "X-SafeRoute-Connectivity-Contract": "1",
      "X-SafeRoute-Source-Revision": revision,
    });
    assert.equal(
      await configuration.reachabilityTest({ status: 204 } as Response),
      true,
    );
    assert.equal(
      await configuration.reachabilityTest({ status: 503 } as Response),
      false,
    );
  });

  it("cannot configure non-loopback, missing-revision, or disabled runtimes", () => {
    const revision = "b".repeat(40);
    assert.equal(
      createNetworkAvailabilityContractConfiguration({
        apiUrl: "https://api.lunarchain.net",
        enabled: true,
        sourceRevision: revision,
      }),
      null,
    );
    assert.equal(
      createNetworkAvailabilityContractConfiguration({
        apiUrl: "http://127.attacker.example:18080",
        enabled: true,
        sourceRevision: revision,
      }),
      null,
    );
    assert.equal(
      createNetworkAvailabilityContractConfiguration({
        apiUrl: "http://127.0.0.1:18080",
        enabled: true,
        sourceRevision: "short",
      }),
      null,
    );
    assert.equal(
      createNetworkAvailabilityContractConfiguration({
        apiUrl: "http://127.0.0.1:18080",
        enabled: false,
        sourceRevision: revision,
      }),
      null,
    );
  });
});
