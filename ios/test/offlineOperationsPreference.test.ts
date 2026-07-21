import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OFFLINE_OPERATIONS_PREFERENCE_MAX_BYTES,
  OFFLINE_OPERATIONS_PREFERENCE_MAX_SCOPES,
  completeOfflineOperationsPreferenceCleanup,
  createOfflineOperationsPreferenceScopeKey,
  disableOfflineOperationsPreferenceScope,
  enableOfflineOperationsPreferenceScope,
  isOfflineOperationsPreferenceScopeDisabled,
  parseOfflineOperationsPreferenceRecord,
} from "../src/features/operations/offlineOperationsPreferenceCore";

describe("offline Operations Calendar saving preference", () => {
  it("migrates an absent preference as enabled and scopes opt-outs exactly", () => {
    const empty = parseOfflineOperationsPreferenceRecord(null);
    assert.ok(empty);

    const disabled = disableOfflineOperationsPreferenceScope(
      empty,
      "principal-a",
      "workspace-a",
    );
    assert.ok(disabled);
    assert.equal(
      isOfflineOperationsPreferenceScopeDisabled(
        disabled,
        "principal-a",
        "workspace-a",
      ),
      true,
    );
    assert.equal(
      isOfflineOperationsPreferenceScopeDisabled(
        disabled,
        "principal-a",
        "workspace-b",
      ),
      false,
    );
    assert.equal(
      isOfflineOperationsPreferenceScopeDisabled(
        disabled,
        "principal-b",
        "workspace-a",
      ),
      false,
    );
    assert.equal(disabled.disabledScopes[0].cleanupPending, true);
    const cleaned = completeOfflineOperationsPreferenceCleanup(
      disabled,
      "principal-a",
      "workspace-a",
    );
    assert.ok(cleaned);
    assert.equal(cleaned?.disabledScopes[0].cleanupPending, false);
    assert.deepEqual(
      parseOfflineOperationsPreferenceRecord(JSON.stringify(cleaned)),
      cleaned,
    );

    const enabled = enableOfflineOperationsPreferenceScope(
      cleaned,
      "principal-a",
      "workspace-a",
    );
    assert.deepEqual(enabled?.disabledScopes, []);
  });

  it("strictly rejects malformed, duplicate, future, and oversized records", () => {
    assert.equal(parseOfflineOperationsPreferenceRecord("{}"), null);
    assert.equal(
      parseOfflineOperationsPreferenceRecord(
        JSON.stringify({ disabledScopes: [], schema: 2 }),
      ),
      null,
    );
    assert.equal(
      parseOfflineOperationsPreferenceRecord(
        JSON.stringify({
          disabledScopes: [
            { principalId: "principal", workspaceId: "workspace" },
            { principalId: "principal", workspaceId: "workspace" },
          ],
          schema: 1,
        }),
      ),
      null,
    );
    assert.equal(
      parseOfflineOperationsPreferenceRecord(
        JSON.stringify({
          disabledScopes: [],
          extra: true,
          schema: 1,
        }),
      ),
      null,
    );
    assert.equal(
      parseOfflineOperationsPreferenceRecord(
        " ".repeat(OFFLINE_OPERATIONS_PREFERENCE_MAX_BYTES + 1),
      ),
      null,
    );
  });

  it("never silently evicts a privacy preference at the scope bound", () => {
    let record = parseOfflineOperationsPreferenceRecord(null);
    assert.ok(record);
    for (
      let index = 0;
      index < OFFLINE_OPERATIONS_PREFERENCE_MAX_SCOPES;
      index += 1
    ) {
      record = disableOfflineOperationsPreferenceScope(
        record,
        "principal",
        `workspace-${index}`,
      );
      assert.ok(record);
    }
    assert.equal(
      disableOfflineOperationsPreferenceScope(
        record,
        "principal",
        "workspace-overflow",
      ),
      null,
    );
    assert.equal(record.disabledScopes.length, OFFLINE_OPERATIONS_PREFERENCE_MAX_SCOPES);
  });

  it("rejects invalid or delimiter-bearing scope identities before keying", () => {
    assert.equal(
      createOfflineOperationsPreferenceScopeKey(
        "principal\u0000workspace",
        "workspace",
      ),
      null,
    );
    assert.equal(
      createOfflineOperationsPreferenceScopeKey(
        "principal",
        "workspace\nother",
      ),
      null,
    );
    assert.equal(
      createOfflineOperationsPreferenceScopeKey(
        "p".repeat(257),
        "workspace",
      ),
      null,
    );
    assert.notEqual(
      createOfflineOperationsPreferenceScopeKey("a", "b-c"),
      createOfflineOperationsPreferenceScopeKey("a-b", "c"),
    );
  });
});
