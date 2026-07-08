import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const previewFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-route-live-map.yaml"),
    "utf8",
  );

describe("Maestro iOS preview smoke flow", () => {
  it("accepts the iOS Expo Go deep-link confirmation when it appears", () => {
    const flow = previewFlowSource();

    assert.doesNotMatch(flow, /-\s*clearState/);
    assert.match(flow, /visible:\s*"Open"/);
    assert.match(flow, /tapOn:\s*"Open"/);
  });

  it("continues when Expo Go restores directly into the live map", () => {
    const flow = previewFlowSource();
    const guestGateIndex = flow.indexOf('id: "guest-map-primary-action"');
    const supportGateIndex = flow.indexOf('id: "guest-map-gate-planned-trips"');
    const routePickerGateIndex = flow.indexOf('id: "safe-route-picker"');
    const firstConditionalIndex = flow.indexOf("- runFlow:");

    assert.match(flow, /when:\s*\n\s+visible:\s*\n\s+id:\s*"guest-map-primary-action"/);
    assert.match(flow, /tapOn:\s*\n\s+id:\s*"guest-map-gate-planned-trips"/);
    assert.match(flow, /when:\s*\n\s+visible:\s*\n\s+id:\s*"safe-route-picker"/);
    assert.match(flow, /extendedWaitUntil:\s*\n\s+visible:\s*\n\s+id:\s*"safe-route-live-map"/);
    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-demo-action"/);
    assert.doesNotMatch(flow, /point:\s*"77%,12%"/);
    assert.ok(firstConditionalIndex >= 0);
    assert.ok(guestGateIndex > firstConditionalIndex);
    assert.ok(supportGateIndex > guestGateIndex);
    assert.ok(routePickerGateIndex > firstConditionalIndex);
  });

  it("keeps the demo toggle assertion tied to the stable action id", () => {
    const flow = previewFlowSource();

    assert.match(flow, /tapOn:\s*\n\s+id:\s*"safe-route-demo-action"/);
    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-demo-action"/);
    assert.doesNotMatch(flow, /text:\s*"Simulation"/);
  });

  it("handles the iOS foreground-location prompt before live-map assertions", () => {
    const flow = previewFlowSource();
    const permissionHandlerCount = (
      flow.match(/visible:\s*"Allow While Using App"/g) ?? []
    ).length;
    const firstPermissionIndex = flow.indexOf('visible: "Allow While Using App"');
    const liveMapWaitIndex = flow.indexOf('id: "safe-route-live-map"');

    assert.equal(permissionHandlerCount, 2);
    assert.match(flow, /visible:\s*"Allow While Using App"/);
    assert.match(flow, /tapOn:\s*"Allow While Using App"/);
    assert.ok(firstPermissionIndex >= 0);
    assert.ok(liveMapWaitIndex > firstPermissionIndex);
  });

  it("limits action tap settling so map animations do not stall the smoke run", () => {
    const flow = previewFlowSource();

    assert.match(flow, /id:\s*"safe-route-demo-action"\s*\n\s+waitToSettleTimeoutMs:\s*1000/);
    assert.match(flow, /id:\s*"safe-route-primary-action"\s*\n\s+waitToSettleTimeoutMs:\s*1000/);
    assert.match(flow, /id:\s*"safe-route-stop-action"\s*\n\s+waitToSettleTimeoutMs:\s*1000/);
  });
});
