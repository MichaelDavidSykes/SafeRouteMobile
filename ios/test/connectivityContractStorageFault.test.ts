import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createConnectivityContractStorageFaultRequest,
  isInjectedConnectivityContractStorageFaultStatus,
} from "../src/testing/connectivityContractStorageFaultCore";

const revision = "abcdef0123456789abcdef0123456789abcdef01";

describe("connectivity contract storage fault request", () => {
  it("creates exact loopback, source-bound requests for supported faults", () => {
    assert.deepEqual(
      createConnectivityContractStorageFaultRequest(
        "http://127.0.0.1:18080/",
        "auth-session-tombstone-set",
        revision.toUpperCase(),
      ),
      {
        headers: {
          "X-SafeRoute-Connectivity-Contract": "1",
          "X-SafeRoute-Source-Revision": revision,
        },
        method: "POST",
        url:
          "http://127.0.0.1:18080/__connectivity_contract__/storage-fault/" +
          `auth-session-tombstone-set?source_revision=${revision}`,
      },
    );
    assert.equal(
      createConnectivityContractStorageFaultRequest(
        "http://localhost:18080",
        "workspace-handoff-navigation-cleanup-set",
        revision,
      )?.url,
      "http://localhost:18080/__connectivity_contract__/storage-fault/" +
        `workspace-handoff-navigation-cleanup-set?source_revision=${revision}`,
    );
    assert.equal(
      createConnectivityContractStorageFaultRequest(
        "http://localhost:18080",
        "workspace-handoff-target-selection-set",
        revision,
      )?.url,
      "http://localhost:18080/__connectivity_contract__/storage-fault/" +
        `workspace-handoff-target-selection-set?source_revision=${revision}`,
    );
  });

  it("fails closed for production, malformed, stale, or unsupported inputs", () => {
    assert.equal(
      createConnectivityContractStorageFaultRequest(
        "https://api.lunarchain.net",
        "auth-session-tombstone-set",
        revision,
      ),
      null,
    );
    assert.equal(
      createConnectivityContractStorageFaultRequest(
        "http://127.attacker.example:18080",
        "auth-session-tombstone-set",
        revision,
      ),
      null,
    );
    assert.equal(
      createConnectivityContractStorageFaultRequest(
        "http://127.0.0.1:18080",
        "auth-session-read",
        revision,
      ),
      null,
    );
    assert.equal(
      createConnectivityContractStorageFaultRequest(
        "http://127.0.0.1:18080",
        "auth-session-tombstone-set",
        revision.slice(0, 12),
      ),
      null,
    );
    assert.equal(isInjectedConnectivityContractStorageFaultStatus(503), true);
    assert.equal(isInjectedConnectivityContractStorageFaultStatus(204), false);
    assert.equal(isInjectedConnectivityContractStorageFaultStatus(500), false);
  });
});
