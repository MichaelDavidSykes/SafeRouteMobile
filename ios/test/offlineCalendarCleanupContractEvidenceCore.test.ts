import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyOfflineCalendarContractStorage } from "../src/testing/offlineCalendarCleanupContractEvidenceCore";

const principalId = "principal-1";
const calendarWorkspaceId = "workspace-guidance";
const preferenceWorkspaceId = "workspace-support";
const nowMs = 1_000;

const calendarRaw = JSON.stringify({
  principalId,
  schema: 1,
  storedAtMs: nowMs,
  value: {
    entries: [],
    sourceUpdatedAt: null,
    truncated: false,
  },
  workspaceId: calendarWorkspaceId,
});
const preferenceRaw = (cleanupPending = false) => JSON.stringify({
  disabledScopes: [{
    cleanupPending,
    principalId,
    workspaceId: preferenceWorkspaceId,
  }],
  schema: 1,
});

function classify(
  calendar: string | null | undefined,
  preference: string | null | undefined = preferenceRaw(),
) {
  return classifyOfflineCalendarContractStorage({
    calendarRaw: calendar,
    calendarWorkspaceId,
    nowMs: nowMs + 1,
    preferenceRaw: preference,
    preferenceWorkspaceId,
    principalId,
  });
}

describe("offline Calendar cleanup contract readback", () => {
  it("classifies a scoped payload and durable disabled consent without raw values", () => {
    assert.deepEqual(classify(calendarRaw), {
      payload: "present",
      preference: "disabled",
      slot: "payload",
    });
    assert.deepEqual(classify(null), {
      payload: "absent",
      preference: "disabled",
      slot: "empty",
    });
  });

  it("distinguishes revocation, malformed, and foreign Calendar values", () => {
    assert.deepEqual(
      classify(JSON.stringify({
        principalId,
        revoked: true,
        schema: 1,
        workspaceId: calendarWorkspaceId,
      })),
      {
        payload: "absent",
        preference: "disabled",
        slot: "workspace-revoked",
      },
    );
    assert.deepEqual(
      classify(JSON.stringify({
        principalId,
        revoked: true,
        schema: 1,
        workspaceId: null,
      })),
      {
        payload: "absent",
        preference: "disabled",
        slot: "principal-revoked",
      },
    );
    assert.deepEqual(classify("{bad-json"), {
      payload: "unknown",
      preference: "disabled",
      slot: "unreadable",
    });
    assert.deepEqual(
      classify(calendarRaw.replace(calendarWorkspaceId, "workspace-foreign")),
      {
        payload: "unknown",
        preference: "disabled",
        slot: "unreadable",
      },
    );
    for (const revocation of [
      {
        principalId: "foreign-principal",
        revoked: true,
        schema: 1,
        workspaceId: calendarWorkspaceId,
      },
      {
        principalId,
        revoked: true,
        schema: 1,
        workspaceId: "foreign-workspace",
      },
      {
        principalId,
        revoked: true,
        schema: 2,
        workspaceId: calendarWorkspaceId,
      },
      {
        extra: "unsafe",
        principalId,
        revoked: true,
        schema: 1,
        workspaceId: calendarWorkspaceId,
      },
    ]) {
      assert.deepEqual(classify(JSON.stringify(revocation)), {
        payload: "unknown",
        preference: "disabled",
        slot: "unreadable",
      });
    }
  });

  it("proves disabled consent is durable rather than default-enabled", () => {
    assert.equal(classify(calendarRaw, preferenceRaw(true)).preference, "cleanup-pending");
    assert.equal(classify(calendarRaw, null).preference, "enabled");
    assert.equal(
      classifyOfflineCalendarContractStorage({
        calendarRaw,
        calendarWorkspaceId,
        nowMs: nowMs + 1,
        preferenceRaw: undefined,
        preferenceWorkspaceId,
        principalId,
      }).preference,
      "unavailable",
    );
    assert.equal(classify(undefined).slot, "unknown");
  });
});
