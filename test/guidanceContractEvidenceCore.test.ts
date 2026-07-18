import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendGuidanceContractEvidenceEvents,
  createGuidanceContractEvidenceEvent,
  isGuidanceContractEvidenceAcknowledged,
  parseGuidanceContractEvidenceSpool,
} from "../src/testing/guidanceContractEvidenceCore";

const revision = "a".repeat(40);

function evidence(eventId: string, occurredAtMs: number) {
  const event = createGuidanceContractEvidenceEvent({
    appLaunchId: "launch-evidence-1",
    authorization: { catalog: "fresh-authorized", principal: "matching" },
    cause: "navigation-state-persist",
    durability: { activeNavigation: "present" },
    eventId,
    navigationInstanceId: "navigation-1",
    occurredAtMs,
    outcome: "persisted",
    routeId: "route-1",
    sourceRevision: revision,
    type: "navigation.persisted",
    unavailableWorkspaceIds: [],
    workspaceId: "workspace-1",
  });
  assert.ok(event);
  return event;
}

describe("guidance contract device evidence", () => {
  it("normalizes bounded revision-bound events and rejects unsafe values", () => {
    const event = evidence("evidence-event-1", 100);
    assert.equal(parseGuidanceContractEvidenceSpool(JSON.stringify([event])).length, 1);
    assert.deepEqual(event.authorization, {
      catalog: "fresh-authorized",
      principal: "matching",
    });
    assert.equal(createGuidanceContractEvidenceEvent({
      ...event,
      eventId: "short",
      sourceRevision: revision,
    }), null);
    assert.equal(createGuidanceContractEvidenceEvent({
      ...event,
      cause: "unsafe\nvalue",
      sourceRevision: revision,
    }), null);
    assert.equal(createGuidanceContractEvidenceEvent({
      ...event,
      appLaunchId: "bad launch id",
      sourceRevision: revision,
    }), null);
    const absence = createGuidanceContractEvidenceEvent({
      appLaunchId: "launch-evidence-2",
      authorization: { catalog: "not-checked", principal: "unknown" },
      cause: "cold-start-readback",
      durability: {
        activeNavigation: "absent",
        nativeTracking: "unsupported",
        runtimePermit: "none",
      },
      eventId: "evidence-absence-1",
      navigationInstanceId: null,
      outcome: "absent",
      routeId: null,
      sourceRevision: revision,
      type: "navigation.absence.readback",
      unavailableWorkspaceIds: [],
      workspaceId: null,
    });
    assert.ok(absence);
    assert.deepEqual(absence.durability, {
      activeNavigation: "absent",
      nativeTracking: "unsupported",
      runtimePermit: "none",
    });
    const prestart = createGuidanceContractEvidenceEvent({
      appLaunchId: "launch-evidence-2",
      authorization: { catalog: "fresh-authorized", principal: "matching" },
      cause: "loaded-route-prestart-readback",
      durability: {
        activeNavigation: "absent",
        nativeTracking: "stopped",
        runtimePermit: "none",
      },
      eventId: "evidence-prestart-1",
      navigationInstanceId: null,
      outcome: "ready",
      routeId: "route-1",
      sourceRevision: revision,
      type: "navigation.prestart.readback",
      unavailableWorkspaceIds: [],
      workspaceId: "workspace-1",
    });
    assert.ok(prestart);
    assert.equal(prestart.navigationInstanceId, null);
    assert.equal(prestart.type, "navigation.prestart.readback");
    const calendarCleanup = createGuidanceContractEvidenceEvent({
      appLaunchId: "launch-evidence-3",
      authorization: { catalog: "not-checked", principal: "matching" },
      cause: "inactive-account",
      durability: {
        authSession: "present",
        offlineCalendarCleanup: "durable",
        offlineCalendarPayload: "present",
        offlineCalendarPreference: "enabled",
        offlineCalendarSlot: "payload",
      },
      eventId: "evidence-calendar-1",
      navigationInstanceId: null,
      outcome: "retry-required",
      routeId: null,
      sourceRevision: revision,
      type: "offline.calendar.cleanup",
      unavailableWorkspaceIds: [],
      workspaceId: null,
    });
    assert.ok(calendarCleanup);
    assert.deepEqual(calendarCleanup.durability, {
      authSession: "present",
      offlineCalendarCleanup: "durable",
      offlineCalendarPayload: "present",
      offlineCalendarPreference: "enabled",
      offlineCalendarSlot: "payload",
    });
    assert.equal(calendarCleanup.workspaceId, null);
    assert.equal(calendarCleanup.routeId, null);
    assert.equal(calendarCleanup.navigationInstanceId, null);
    const workspaceRevocation = createGuidanceContractEvidenceEvent({
      appLaunchId: "launch-evidence-4",
      authorization: { catalog: "fresh-denied", principal: "matching" },
      cause: "workspace-denial",
      durability: {
        authSession: "present",
        offlineCalendarCleanup: "absent",
        offlineCalendarPayload: "absent",
        offlineCalendarPreference: "disabled",
        offlineCalendarSlot: "workspace-revoked",
        workspaceContext: "persisted",
      },
      eventId: "evidence-calendar-workspace-1",
      navigationInstanceId: null,
      outcome: "clean",
      routeId: null,
      sourceRevision: revision,
      type: "offline.calendar.workspace-lifecycle",
      unavailableWorkspaceIds: ["workspace-1"],
      workspaceId: "workspace-1",
    });
    assert.ok(workspaceRevocation);
    assert.equal(
      workspaceRevocation.type,
      "offline.calendar.workspace-lifecycle",
    );
    assert.equal(
      workspaceRevocation.durability.offlineCalendarPreference,
      "disabled",
    );
    const principalChange = createGuidanceContractEvidenceEvent({
      appLaunchId: "launch-evidence-5",
      authorization: { catalog: "not-checked", principal: "mismatched" },
      cause: "principal-change",
      durability: {
        authSession: "signed-out",
        offlineCalendarCleanup: "absent",
        offlineCalendarPayload: "absent",
        offlineCalendarPreference: "disabled",
        offlineCalendarSlot: "principal-revoked",
      },
      eventId: "evidence-calendar-principal-1",
      navigationInstanceId: null,
      outcome: "clean",
      routeId: null,
      sourceRevision: revision,
      type: "offline.calendar.principal-lifecycle",
      unavailableWorkspaceIds: [],
      workspaceId: "workspace-1",
    });
    assert.ok(principalChange);
    assert.equal(
      principalChange.type,
      "offline.calendar.principal-lifecycle",
    );
    assert.equal(
      principalChange.authorization.principal,
      "mismatched",
    );
    assert.deepEqual(parseGuidanceContractEvidenceSpool("not-json"), []);
  });

  it("deduplicates by event ID and never evicts older unacknowledged evidence", () => {
    const first = evidence("evidence-event-1", 100);
    const second = evidence("evidence-event-2", 200);
    const replacement = { ...first, occurredAtMs: 300 };
    assert.deepEqual(
      appendGuidanceContractEvidenceEvents([second, first], [replacement], 2),
      [second, first],
    );
    assert.deepEqual(
      appendGuidanceContractEvidenceEvents([first, second], [
        evidence("evidence-event-3", 300),
      ], 2),
      [first, second],
    );
  });

  it("removes spooled events only for an exact server acknowledgement", () => {
    assert.equal(isGuidanceContractEvidenceAcknowledged({
      data: { event_id: "evidence-event-1", result: "recorded" },
      status: "success",
    }, "evidence-event-1"), true);
    assert.equal(isGuidanceContractEvidenceAcknowledged({
      data: { event_id: "evidence-event-1", result: "duplicate" },
      status: "success",
    }, "evidence-event-1"), true);
    assert.equal(isGuidanceContractEvidenceAcknowledged({
      data: { event_id: "different-event", result: "recorded" },
      status: "success",
    }, "evidence-event-1"), false);
    assert.equal(isGuidanceContractEvidenceAcknowledged({
      data: { event_id: "evidence-event-1", result: "conflict" },
      status: "success",
    }, "evidence-event-1"), false);
  });
});
