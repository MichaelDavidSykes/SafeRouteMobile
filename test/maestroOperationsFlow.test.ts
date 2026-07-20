import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const operationsFlowSource = () =>
  readFileSync(join(process.cwd(), "maestro/ios-preview-operations.yaml"), "utf8");
const packageJson = () =>
  JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

describe("Maestro iOS preview operations flow", () => {
  it("documents and scripts the no-build preview-mode operations smoke path", () => {
    const flow = operationsFlowSource();
    const scripts = packageJson().scripts;

    assert.equal(
      scripts["start:maestro:ios:preview:operations"],
      "SAFEROUTE_ENABLE_PREVIEW_MODE=true SAFEROUTE_PREVIEW_INITIAL_SCREEN=operations NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081"
    );
    assert.equal(
      scripts["prestart:maestro:ios:preview:operations"],
      "node scripts/maestro-ios-preflight.mjs"
    );
    assert.equal(
      scripts["test:maestro:ios:operations"],
      "node scripts/run-maestro.mjs test maestro/ios-preview-operations.yaml"
    );
    assert.match(flow, /SAFEROUTE_ENABLE_PREVIEW_MODE=true/);
    assert.match(flow, /SAFEROUTE_PREVIEW_INITIAL_SCREEN=operations/);
    assert.match(flow, /openLink: exp:\/\/localhost:8081/);
    assert.doesNotMatch(flow, /openLink: exp:\/\/127\.0\.0\.1:8081/);
    assert.match(flow, /visible:\s*"Try again"[\s\S]*tapOn:\s*"Try again"/);
    assert.doesNotMatch(flow, /point: "50%,92%"/);
    assert.doesNotMatch(flow, /point: "91%,49%"/);
  });

  it("covers planned, calendar, and convoy read-only drill-downs", () => {
    const flow = operationsFlowSource();
    const plannedGateIndex = flow.indexOf('id: "guest-map-gate-planned-trips"');
    const operationsIndex = flow.indexOf('id: "safe-route-operations"');
    const calendarTabIndex = flow.indexOf('id: "safe-route-operations-tab-calendar"');
    const convoyTabIndex = flow.indexOf('id: "safe-route-operations-tab-convoy-management"');
    const mapReturnIndex = flow.indexOf('id: "safe-route-operations-map-return"');
    const calendarGateIndex = flow.indexOf('id: "guest-map-gate-calendar"');

    assert.match(flow, /id: "guest-map-gate-planned-trips"/);
    assert.match(flow, /id: "guest-map-gate-calendar"/);
    assert.match(flow, /id: "guest-map-gate-convoy-management"/);
    assert.match(flow, /assertVisible: "Planned routes"/);
    assert.match(flow, /assertVisible: "Calendar"/);
    assert.match(flow, /assertVisible: "Convoys"/);
    assert.match(flow, /id: "safe-route-operations-route-trip-airport-transfer-sr-city-airport-alpha-0"/);
    assert.match(flow, /id: "safe-route-operations-route-trip-docklands-low-profile-sr-docklands-low-profile-0"/);
    assert.match(flow, /id: "safe-route-operations-convoy-trip-airport-transfer"/);
    assert.match(flow, /id: "safe-route-operations-convoy-trip-docklands-low-profile"/);
    assert.match(flow, /id: "safe-route-operations-convoy-detail"/);
    assert.match(flow, /id: "safe-route-operations-convoy-route-sr-city-airport-alpha-0"/);
    assert.match(flow, /id: "safe-route-live-map"/);
    assert.match(flow, /id: "safe-route-map-view"/);
    assert.match(flow, /id: "safe-route-return"/);
    assert.match(flow, /assertNotVisible:\s+id: "safe-route-login"/);
    assert.doesNotMatch(flow, /Edit|Save schedule|Create convoy|Delete/);
    assert.ok(plannedGateIndex >= 0);
    assert.ok(operationsIndex >= 0);
    assert.ok(calendarTabIndex > operationsIndex);
    assert.ok(convoyTabIndex > calendarTabIndex);
    assert.ok(mapReturnIndex > convoyTabIndex);
    assert.ok(calendarGateIndex > mapReturnIndex);
  });
});
