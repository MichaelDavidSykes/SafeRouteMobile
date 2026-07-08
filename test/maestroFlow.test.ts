import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const previewFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-route-live-map.yaml"),
    "utf8",
  );
const packageJson = () =>
  JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

describe("Maestro iOS preview smoke flow", () => {
  it("accepts the iOS Expo Go deep-link confirmation when it appears", () => {
    const flow = previewFlowSource();

    assert.doesNotMatch(flow, /-\s*clearState/);
    assert.match(flow, /openLink:\s*exp:\/\/localhost:8081/);
    assert.doesNotMatch(flow, /openLink:\s*exp:\/\/127\.0\.0\.1:8081/);
    assert.match(flow, /visible:\s*"Open"/);
    assert.match(flow, /tapOn:\s*"Open"/);
  });

  it("keeps the no-build simulator preview handoff on localhost only", () => {
    const flow = previewFlowSource();
    const scripts = packageJson().scripts;
    const localhostOpenCount = (flow.match(/openLink: exp:\/\/localhost:8081/g) ?? []).length;
    const loopbackOpenCount = (flow.match(/openLink: exp:\/\/127\.0\.0\.1:8081/g) ?? []).length;
    const firstLocalhostIndex = flow.indexOf("openLink: exp://localhost:8081");
    const lastLocalhostIndex = flow.lastIndexOf("openLink: exp://localhost:8081");
    const appRootWaitIndex = flow.indexOf('id: "saferoute-app-root"');

    assert.equal(localhostOpenCount, 2);
    assert.equal(loopbackOpenCount, 0);
    assert.match(flow, /expo start --localhost/);
    assert.match(flow, /localhost only/);
    assert.match(flow, /previous IPv4 loopback retry could time\s*\n?#?\s*out in iOS/);
    assert.equal(
      scripts["start:maestro:ios"],
      "NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081",
    );
    assert.equal(
      scripts["test:maestro:ios"],
      "maestro test maestro/ios-preview-route-live-map.yaml",
    );
    assert.ok(firstLocalhostIndex >= 0);
    assert.ok(lastLocalhostIndex > firstLocalhostIndex);
    assert.ok(appRootWaitIndex > lastLocalhostIndex);
  });

  it("plots a guest route before opening the live map", () => {
    const flow = previewFlowSource();
    const guestGateIndex = flow.indexOf('id: "guest-map-primary-action"');
    const destinationInputIndex = flow.indexOf('id: "guest-map-destination-input"');
    const plotActionIndex = flow.indexOf('id: "guest-map-plot-action"');
    const routePreviewIndex = flow.indexOf('id: "guest-map-route-preview"');
    const liveMapIndex = flow.indexOf('id: "safe-route-live-map"');
    const firstConditionalIndex = flow.indexOf("- runFlow:");

    assert.match(flow, /when:\s*\n\s+visible:\s*\n\s+id:\s*"guest-map-primary-action"/);
    assert.match(flow, /tapOn:\s*\n\s+id:\s*"guest-map-destination-input"/);
    assert.match(flow, /inputText:\s*"London City Airport"/);
    assert.match(flow, /tapOn:\s*"done"/);
    assert.doesNotMatch(flow, /hideKeyboard/);
    assert.match(flow, /tapOn:\s*\n\s+id:\s*"guest-map-plot-action"/);
    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"guest-map-route-preview"/);
    assert.match(flow, /when:\s*\n\s+visible:\s*\n\s+id:\s*"safe-route-picker"/);
    assert.match(flow, /extendedWaitUntil:\s*\n\s+visible:\s*\n\s+id:\s*"safe-route-live-map"/);
    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-demo-action"/);
    assert.doesNotMatch(flow, /guest-map-gate-planned-trips/);
    assert.doesNotMatch(flow, /point:\s*"77%,12%"/);
    assert.ok(firstConditionalIndex >= 0);
    assert.ok(guestGateIndex > firstConditionalIndex);
    assert.ok(destinationInputIndex > guestGateIndex);
    assert.ok(routePreviewIndex > destinationInputIndex);
    assert.ok(plotActionIndex > routePreviewIndex);
    assert.ok(liveMapIndex > plotActionIndex);
  });

  it("keeps the demo toggle assertion tied to the stable action id", () => {
    const flow = previewFlowSource();

    assert.match(flow, /when:\s*\n\s+visible:\s*"Turn route simulation on"/);
    assert.match(flow, /tapOn:\s*\n\s+id:\s*"safe-route-demo-action"/);
    assert.match(flow, /assertVisible:\s*"Turn route simulation off"/);
    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-demo-action"/);
    assert.doesNotMatch(flow, /text:\s*"Simulation"/);
  });

  it("avoids transient live risk detail assertions in the smoke flow", () => {
    const flow = previewFlowSource();

    assert.doesNotMatch(flow, /id:\s*"safe-route-risk-alert"/);
    assert.doesNotMatch(flow, /id:\s*"safe-route-risk-detail"/);
    assert.doesNotMatch(flow, /id:\s*"safe-route-risk-detail-dismiss"/);
    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-control-intelligence"/);
  });

  it("asserts active drive-along map controls through stable ids", () => {
    const flow = previewFlowSource();
    const primaryActionIndex = flow.indexOf('id: "safe-route-primary-action"');
    const fitControlIndex = flow.indexOf('id: "safe-route-control-fit"');
    const followControlIndex = flow.indexOf('id: "safe-route-control-follow"');
    const intelligenceControlIndex = flow.indexOf('id: "safe-route-control-intelligence"');
    const stopActionIndex = flow.indexOf('id: "safe-route-stop-action"');

    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-control-fit"/);
    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-control-follow"/);
    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-control-intelligence"/);
    assert.ok(primaryActionIndex >= 0);
    assert.ok(stopActionIndex > primaryActionIndex);
    assert.ok(fitControlIndex > primaryActionIndex);
    assert.ok(followControlIndex > fitControlIndex);
    assert.ok(intelligenceControlIndex > followControlIndex);
    assert.ok(stopActionIndex < fitControlIndex);
  });

  it("avoids live-map permission prompt polling until guidance starts", () => {
    const flow = previewFlowSource();
    const permissionHandlerCount = (
      flow.match(/visible:\s*"Allow While Using App"/g) ?? []
    ).length;
    const firstPermissionIndex = flow.indexOf('visible: "Allow While Using App"');
    const liveMapWaitIndex = flow.indexOf('id: "safe-route-live-map"');

    assert.equal(permissionHandlerCount, 1);
    assert.match(flow, /visible:\s*"Allow While Using App"/);
    assert.match(flow, /tapOn:\s*"Allow While Using App"/);
    assert.ok(firstPermissionIndex >= 0);
    assert.ok(liveMapWaitIndex > firstPermissionIndex);
    assert.doesNotMatch(
      flow,
      /guest-map-plot-action[\s\S]*visible:\s*"Allow While Using App"/
    );
  });

  it("limits action tap settling so map animations do not stall the smoke run", () => {
    const flow = previewFlowSource();

    assert.match(flow, /id:\s*"safe-route-demo-action"\s*\n\s+waitToSettleTimeoutMs:\s*1000/);
    assert.match(flow, /id:\s*"safe-route-primary-action"\s*\n\s+waitToSettleTimeoutMs:\s*1000/);
    assert.match(flow, /id:\s*"safe-route-stop-action"\s*\n\s+waitToSettleTimeoutMs:\s*1000/);
  });
});
