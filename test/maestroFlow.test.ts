import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const previewFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-route-live-map.yaml"),
    "utf8",
  );
const mapInteractionsFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-map-interactions.yaml"),
    "utf8",
  );
const operationsFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-operations.yaml"),
    "utf8",
  );
const savedRoutesFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-saved-routes.yaml"),
    "utf8",
  );
const riskAreasFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-risk-areas.yaml"),
    "utf8",
  );
const authFlowSource = () =>
  readFileSync(join(process.cwd(), "maestro/ios-auth-ui.yaml"), "utf8");
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
      scripts["start:maestro:ios:preview"],
      "SAFEROUTE_ENABLE_PREVIEW_MODE=true NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081",
    );
    assert.equal(
      scripts["test:maestro:ios"],
      "node scripts/run-maestro.mjs test maestro/ios-preview-route-live-map.yaml",
    );
    assert.ok(firstLocalhostIndex >= 0);
    assert.ok(lastLocalhostIndex > firstLocalhostIndex);
    assert.ok(appRootWaitIndex > lastLocalhostIndex);
  });

  it("opens operations preview sessions directly on the supporting Operations surface", () => {
    const flow = operationsFlowSource();
    const scripts = packageJson().scripts;
    const appRootIndex = flow.indexOf('id: "saferoute-app-root"');
    const operationsIndex = flow.indexOf('id: "safe-route-operations"');
    const firstMapReturnIndex = flow.indexOf('id: "safe-route-operations-map-return"');
    const firstGuestGateIndex = flow.indexOf('id: "guest-map-gate-calendar"');

    assert.equal(
      scripts["prestart:maestro:ios:preview:operations"],
      "node scripts/maestro-ios-preflight.mjs",
    );
    assert.equal(
      scripts["start:maestro:ios:preview:operations"],
      "SAFEROUTE_ENABLE_PREVIEW_MODE=true SAFEROUTE_PREVIEW_INITIAL_SCREEN=operations NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081",
    );
    assert.match(flow, /SAFEROUTE_ENABLE_PREVIEW_MODE=true/);
    assert.match(flow, /SAFEROUTE_PREVIEW_INITIAL_SCREEN=operations/);
    assert.match(flow, /text:\s*"Close"[\s\S]*optional:\s*true/);
    assert.match(flow, /visible:\s*"Try again"[\s\S]*tapOn:\s*"Try again"/);
    assert.doesNotMatch(flow, /point:\s*"50%,92%"/);
    assert.doesNotMatch(flow, /point:\s*"91%,49%"/);
    assert.match(flow, /extendedWaitUntil:\s*\n\s+visible:\s*\n\s+id:\s*"safe-route-operations"/);
    assert.ok(appRootIndex >= 0);
    assert.ok(operationsIndex > appRootIndex);
    assert.ok(firstMapReturnIndex > operationsIndex);
    assert.ok(firstGuestGateIndex > firstMapReturnIndex);
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
    assert.match(flow, /inputText:\s*"51\.5053, 0\.0553"/);
    assert.match(flow, /id:\s*"guest-map-search-coordinate-51-505300-0-055300"/);
    assert.doesNotMatch(flow, /hideKeyboard/);
    assert.match(flow, /tapOn:\s*\n\s+id:\s*"guest-map-plot-action"/);
    assert.match(flow, /extendedWaitUntil:\s*\n\s+visible:\s*\n\s+id:\s*"guest-map-route-preview"\s*\n\s+timeout:\s*30000/);
    assert.match(flow, /when:\s*\n\s+visible:\s*\n\s+id:\s*"safe-route-picker"/);
    assert.match(flow, /extendedWaitUntil:\s*\n\s+visible:\s*\n\s+id:\s*"safe-route-live-map"/);
    assert.doesNotMatch(flow, /safe-route-demo-action|route simulation|Simulate/);
    assert.doesNotMatch(flow, /guest-map-gate-planned-trips/);
    assert.doesNotMatch(flow, /point:\s*"77%,12%"/);
    assert.ok(firstConditionalIndex >= 0);
    assert.ok(guestGateIndex > firstConditionalIndex);
    assert.ok(destinationInputIndex > guestGateIndex);
    assert.ok(plotActionIndex > destinationInputIndex);
    assert.ok(routePreviewIndex > plotActionIndex);
    assert.ok(liveMapIndex > routePreviewIndex);
  });

  it("uses a deterministic London location in every iOS preview flow", () => {
    for (const flow of [
      previewFlowSource(),
      mapInteractionsFlowSource(),
      operationsFlowSource(),
    ]) {
      assert.match(flow, /setLocation:\s*\n\s+latitude:\s*51\.5074\s*\n\s+longitude:\s*-0\.1278/);
    }
  });

  it("loads and opens real Cape Town risk-area details", () => {
    const flow = riskAreasFlowSource();
    const scripts = packageJson().scripts;

    assert.equal(
      scripts["test:maestro:ios:risk-areas"],
      "node scripts/run-maestro.mjs test maestro/ios-preview-risk-areas.yaml",
    );
    assert.match(flow, /latitude:\s*-34\.033/);
    assert.match(flow, /longitude:\s*18\.585/);
    assert.match(flow, /safe-route-risk-zone-generated-area-risk-safe-route-area-risk-philippi-east-33b347150ca4712272/);
    assert.match(flow, /id:\s*"safe-route-risk-detail"/);
    assert.match(flow, /Philippi East \(Cape Flats\)/);
    assert.match(flow, /id:\s*"safe-route-risk-detail-dismiss"/);
  });

  it("opens saved preview routes without drafting a guest route", () => {
    const flow = savedRoutesFlowSource();
    const scripts = packageJson().scripts;
    const appRootIndex = flow.indexOf('id: "saferoute-app-root"');
    const routePickerIndex = flow.indexOf('id: "safe-route-picker"');
    const firstRouteCardIndex = flow.indexOf('id: "safe-route-card-sr-city-airport-alpha"');
    const secondRouteCardIndex = flow.indexOf('id: "safe-route-card-sr-docklands-low-profile"');
    const liveMapIndex = flow.indexOf('id: "safe-route-live-map"');
    const returnButtonIndex = flow.lastIndexOf('id: "safe-route-return"');
    const finalRoutePickerIndex = flow.lastIndexOf('id: "safe-route-picker"');

    assert.equal(
      scripts["test:maestro:ios:saved-routes"],
      "node scripts/run-maestro.mjs test maestro/ios-preview-saved-routes.yaml",
    );
    assert.equal(
      scripts["prestart:maestro:ios:preview:saved-routes"],
      "node scripts/maestro-ios-preflight.mjs",
    );
    assert.equal(
      scripts["start:maestro:ios:preview:saved-routes"],
      "SAFEROUTE_ENABLE_PREVIEW_MODE=true SAFEROUTE_PREVIEW_INITIAL_SCREEN=routes NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081",
    );
    assert.match(flow, /SAFEROUTE_ENABLE_PREVIEW_MODE=true/);
    assert.match(flow, /SAFEROUTE_PREVIEW_INITIAL_SCREEN=routes/);
    assert.doesNotMatch(flow, /-\s*clearState/);
    assert.match(flow, /text:\s*"Close"[\s\S]*optional:\s*true/);
    assert.doesNotMatch(flow, /point:\s*"91%,47%"/);
    assert.doesNotMatch(flow, /point:\s*"91%,49%"/);
    assert.match(flow, /setLocation:\s*\n\s+latitude:\s*51\.5074\s*\n\s+longitude:\s*-0\.1278/);
    assert.match(flow, /id:\s*"safe-route-picker"/);
    assert.match(flow, /id:\s*"safe-route-return"/);
    assert.match(flow, /when:\s*\n\s+visible:\s*\n\s+id:\s*"safe-route-return"[\s\S]*tapOn:\s*\n\s+id:\s*"safe-route-return"/);
    assert.match(flow, /when:\s*\n\s+visible:\s*\n\s+id:\s*"guest-map-primary-action"[\s\S]*tapOn:\s*\n\s+id:\s*"guest-map-primary-action"/);
    assert.match(flow, /Choose route/);
    assert.match(flow, /id:\s*"safe-route-card-sr-city-airport-alpha"/);
    assert.match(flow, /id:\s*"safe-route-card-sr-docklands-low-profile"/);
    assert.match(flow, /id:\s*"safe-route-summary-sheet"/);
    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-return"/);
    assert.match(flow, /id:\s*"guest-map-primary-action"/);
    assert.doesNotMatch(flow, /guest-map-destination-input/);
    assert.doesNotMatch(flow, /guest-map-plot-action/);
    assert.doesNotMatch(flow, /guest-map-route-preview/);
    assert.ok(appRootIndex >= 0);
    assert.ok(routePickerIndex > appRootIndex);
    assert.ok(firstRouteCardIndex > routePickerIndex);
    assert.ok(secondRouteCardIndex > firstRouteCardIndex);
    assert.ok(liveMapIndex > firstRouteCardIndex);
    assert.ok(returnButtonIndex > liveMapIndex);
    assert.ok(finalRoutePickerIndex > returnButtonIndex);
  });

  it("keeps restored preview sessions on the requested preview initial screen", () => {
    const appSource = readFileSync(join(process.cwd(), "App.tsx"), "utf8");

    assert.match(appSource, /SAFEROUTE_PREVIEW_MODE_ENABLED && isPreviewAccessToken\(storedSession\.accessToken\)/);
    assert.match(appSource, /setScreen\(SAFEROUTE_PREVIEW_INITIAL_SCREEN\)/);
  });

  it("verifies the branded mobile sign-in surface without a Turnstile dependency", () => {
    const flow = authFlowSource();
    const scripts = packageJson().scripts;

    assert.equal(
      scripts["test:maestro:ios:auth"],
      "node scripts/run-maestro.mjs test maestro/ios-auth-ui.yaml",
    );
    assert.match(flow, /id:\s*"guest-map-long-press-add-risk"/);
    assert.match(flow, /id:\s*"safe-route-login"/);
    assert.match(flow, /SafeRoute Mobile/);
    assert.match(flow, /id:\s*"safe-route-login-email"/);
    assert.match(flow, /id:\s*"safe-route-login-password"/);
    assert.match(flow, /assertNotVisible:\s*"Cloudflare"/);
    assert.match(flow, /assertNotVisible:\s*"Turnstile"/);
    assert.match(flow, /id:\s*"safe-route-login-map-return"/);
  });

  it("covers multi-stop editing, sheet collapse, and map long-press actions", () => {
    const flow = mapInteractionsFlowSource();
    const scripts = packageJson().scripts;

    assert.equal(
      scripts["test:maestro:ios:map-interactions"],
      "node scripts/run-maestro.mjs test maestro/ios-preview-map-interactions.yaml",
    );
    assert.match(flow, /id:\s*"guest-map-add-waypoint"/);
    assert.match(flow, /id:\s*"guest-map-waypoint-guest-waypoint-1"/);
    assert.match(flow, /id:\s*"guest-map-collapsed-sheet"/);
    assert.match(flow, /longPressOn:/);
    assert.match(flow, /id:\s*"guest-map-long-press-menu"/);
    assert.match(flow, /id:\s*"guest-map-long-press-add-waypoint"/);
    assert.match(flow, /id:\s*"guest-map-long-press-add-risk"/);
    assert.match(flow, /id:\s*"guest-map-waypoint-guest-waypoint-2"/);
    assert.match(flow, /id:\s*"guest-map-plot-action"/);
    assert.match(flow, /id:\s*"guest-map-route-preview"/);
  });

  it("keeps preview movement automatic and out of customer-facing route controls", () => {
    const flow = previewFlowSource();

    assert.doesNotMatch(flow, /safe-route-demo-action|route simulation|Simulate/);
    assert.match(flow, /tapOn:\s*\n\s+id:\s*"safe-route-primary-action"/);
  });

  it("avoids transient live risk detail assertions in the smoke flow", () => {
    const flow = previewFlowSource();

    assert.doesNotMatch(flow, /id:\s*"safe-route-risk-alert"/);
    assert.doesNotMatch(flow, /id:\s*"safe-route-risk-detail"/);
    assert.doesNotMatch(flow, /id:\s*"safe-route-risk-detail-dismiss"/);
    assert.doesNotMatch(flow, /id:\s*"safe-route-control-intelligence"/);
  });

  it("asserts active drive-along map controls through stable ids", () => {
    const flow = previewFlowSource();
    const primaryActionIndex = flow.indexOf('id: "safe-route-primary-action"');
    const remainingMetricsIndex = flow.indexOf('id: "safe-route-remaining-metrics"');
    const fitControlIndex = flow.indexOf('id: "safe-route-control-fit"');
    const followControlIndex = flow.indexOf('id: "safe-route-control-follow"');
    const stopActionIndex = flow.indexOf('id: "safe-route-stop-action"');

    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-remaining-metrics"/);
    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-control-fit"/);
    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-control-follow"/);
    assert.ok(primaryActionIndex >= 0);
    assert.ok(stopActionIndex > primaryActionIndex);
    assert.ok(remainingMetricsIndex > stopActionIndex);
    assert.ok(fitControlIndex > remainingMetricsIndex);
    assert.ok(followControlIndex > fitControlIndex);
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

    assert.match(flow, /id:\s*"safe-route-primary-action"\s*\n\s+waitToSettleTimeoutMs:\s*1000/);
    assert.match(flow, /id:\s*"safe-route-stop-action"\s*\n\s+waitToSettleTimeoutMs:\s*1000/);
  });
});
