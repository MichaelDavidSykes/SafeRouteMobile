import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const previewFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-route-live-map.yaml"),
    "utf8",
  );
const navigationResumeFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-navigation-resume.yaml"),
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
const emptyRoutesFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-routes-empty.yaml"),
    "utf8",
  );
const activeWorkspaceFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-active-workspace.yaml"),
    "utf8",
  );
const workspaceChoiceFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-workspace-choice.yaml"),
    "utf8",
  );
const suspendedGuidanceFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-guidance-suspended.yaml"),
    "utf8",
  );
const riskAreasFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-preview-risk-areas.yaml"),
    "utf8",
  );
const authFlowSource = () =>
  readFileSync(join(process.cwd(), "maestro/ios-auth-ui.yaml"), "utf8");
const authCodeFlowSource = () =>
  readFileSync(join(process.cwd(), "maestro/ios-auth-code-ui.yaml"), "utf8");
const authSessionExpiredFlowSource = () =>
  readFileSync(
    join(process.cwd(), "maestro/ios-auth-session-expired-ui.yaml"),
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

  it("dismisses the SDK-specific Expo Go first-launch developer explanation", () => {
    const flow = savedRoutesFlowSource();

    assert.match(flow, /visible:\s*"Continue"[\s\S]*tapOn:\s*"Continue"/);
    assert.match(flow, /text:\s*"Close"[\s\S]*optional:\s*true/);
  });

  it("opens, starts, verifies, and stops saved-route guidance", () => {
    const flow = savedRoutesFlowSource();
    const previewIndex = flow.indexOf('id: "safe-route-live-map"');
    const detailsIndex = flow.indexOf('id: "safe-route-saved-details"');
    const startIndex = flow.indexOf('id: "safe-route-primary-action"', detailsIndex);
    const remainingIndex = flow.indexOf('id: "safe-route-remaining-metrics"');
    const centerIndex = flow.indexOf('id: "safe-route-control-center"');
    const stopIndex = flow.lastIndexOf('id: "safe-route-stop-action"');

    assert.ok(previewIndex >= 0);
    assert.ok(detailsIndex > previewIndex);
    assert.ok(startIndex > detailsIndex);
    assert.ok(remainingIndex > startIndex);
    assert.ok(centerIndex > remainingIndex);
    assert.ok(stopIndex > centerIndex);
    assert.match(flow, /assertNotVisible:\s*\n\s+id:\s*"safe-route-control-reroute"/);
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

  it("keeps one selected workspace across Map, Saved, and Operations", () => {
    const flow = activeWorkspaceFlowSource();
    const scripts = packageJson().scripts;
    const mapSelectorIndex = flow.indexOf('id: "guest-map-workspace-selector"');
    const centralOptionIndex = flow.indexOf('id: "guest-map-workspace-preview-routes"');
    const westOptionIndex = flow.indexOf('id: "guest-map-workspace-preview-west"');
    const routePickerIndex = flow.indexOf('id: "safe-route-picker"', westOptionIndex);
    const savedSelectorIndex = flow.indexOf('id: "safe-route-workspace-selector"');
    const westRouteIndex = flow.indexOf('id: "safe-route-card-sr-westbound-heathrow"');
    const operationsIndex = flow.indexOf('id: "safe-route-operations"', westRouteIndex);
    const operationsSelectorIndex = flow.indexOf(
      'id: "safe-route-operations-workspace-selector"',
      operationsIndex,
    );
    const westOperationsRouteIndex = flow.indexOf(
      'id: "safe-route-operations-route-trip-westbound-standby-sr-westbound-heathrow-0"',
      operationsSelectorIndex,
    );
    const centralOperationsOptionIndex = flow.indexOf(
      'id: "safe-route-operations-workspace-preview-routes"',
      westOperationsRouteIndex,
    );
    const centralOperationsRouteIndex = flow.indexOf(
      'id: "safe-route-operations-route-trip-airport-transfer-sr-city-airport-alpha-0"',
      centralOperationsOptionIndex,
    );

    assert.equal(
      scripts["start:maestro:ios:preview:active-workspace"],
      "SAFEROUTE_ENABLE_PREVIEW_MODE=true SAFEROUTE_PREVIEW_INITIAL_SCREEN=guest-map NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081",
    );
    assert.equal(
      scripts["test:maestro:ios:active-workspace"],
      "node scripts/run-maestro.mjs test maestro/ios-preview-active-workspace.yaml",
    );
    assert.ok(mapSelectorIndex >= 0);
    assert.ok(centralOptionIndex > mapSelectorIndex);
    assert.ok(westOptionIndex > centralOptionIndex);
    assert.ok(routePickerIndex > westOptionIndex);
    assert.ok(savedSelectorIndex > routePickerIndex);
    assert.ok(westRouteIndex > savedSelectorIndex);
    assert.ok(operationsIndex > westRouteIndex);
    assert.ok(operationsSelectorIndex > operationsIndex);
    assert.ok(westOperationsRouteIndex > operationsSelectorIndex);
    assert.ok(centralOperationsOptionIndex > westOperationsRouteIndex);
    assert.ok(centralOperationsRouteIndex > centralOperationsOptionIndex);
    assert.match(flow, /assertNotVisible:\s*\n\s+id: "safe-route-card-sr-city-airport-alpha"/);
    assert.match(flow, /assertNotVisible:\s*\n\s+id: "safe-route-operations-route-trip-airport-transfer-sr-city-airport-alpha-0"/);
    assert.match(flow, /assertNotVisible:\s*\n\s+id: "safe-route-operations-route-trip-westbound-standby-sr-westbound-heathrow-0"/);
  });

  it("requires an explicit first workspace choice before cross-surface access", () => {
    const flow = workspaceChoiceFlowSource();
    const scripts = packageJson().scripts;
    const choiceIndex = flow.indexOf('visible: "Workspace, Choose workspace"');
    const centralIndex = flow.indexOf('id: "guest-map-workspace-preview-routes"');
    const westIndex = flow.indexOf('id: "guest-map-workspace-preview-west"');
    const savedIndex = flow.indexOf('id: "safe-route-picker"', westIndex);
    const operationsIndex = flow.indexOf('id: "safe-route-operations"', savedIndex);

    assert.equal(
      scripts["start:maestro:ios:preview:workspace-choice"],
      "SAFEROUTE_ENABLE_PREVIEW_MODE=true SAFEROUTE_PREVIEW_INITIAL_SCREEN=workspace-choice NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081",
    );
    assert.equal(
      scripts["test:maestro:ios:workspace-choice"],
      "node scripts/run-maestro.mjs test maestro/ios-preview-workspace-choice.yaml",
    );
    assert.ok(choiceIndex >= 0);
    assert.ok(centralIndex > choiceIndex);
    assert.ok(westIndex > centralIndex);
    assert.ok(savedIndex > westIndex);
    assert.ok(operationsIndex > savedIndex);
    assert.match(flow, /assertVisible: "Workspace, West Corridor"/);
    assert.match(flow, /assertNotVisible:\s*\n\s+id: "safe-route-card-sr-city-airport-alpha"/);
  });

  it("cancels then confirms the guarded paused-guidance workspace handoff", () => {
    const flow = suspendedGuidanceFlowSource();
    const scripts = packageJson().scripts;
    const noticeIndex = flow.indexOf('id: "safe-route-suspended-navigation"');
    const retryIndex = flow.indexOf('id: "safe-route-suspended-navigation-retry"');
    const selectorIndex = flow.indexOf('id: "guest-map-workspace-selector"');
    const cancelIndex = flow.indexOf('tapOn: "Keep route"');
    const confirmIndex = flow.indexOf(
      'tapOn: "End route and change workspace"',
    );

    assert.equal(
      scripts["start:maestro:ios:preview:guidance-suspended"],
      "SAFEROUTE_ENABLE_PREVIEW_MODE=true SAFEROUTE_PREVIEW_INITIAL_SCREEN=guidance-suspended NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081",
    );
    assert.equal(
      scripts["test:maestro:ios:guidance-suspended"],
      "node scripts/run-maestro.mjs test maestro/ios-preview-guidance-suspended.yaml",
    );
    assert.ok(noticeIndex >= 0);
    assert.ok(retryIndex > noticeIndex);
    assert.ok(selectorIndex > retryIndex);
    assert.ok(cancelIndex > selectorIndex);
    assert.ok(confirmIndex > cancelIndex);
    assert.match(flow, /assertNotVisible:[\s\S]*safe-route-live-map/);
    assert.match(flow, /tapOn:[\s\S]*safe-route-suspended-navigation-retry/);
    assert.match(flow, /End route and change workspace\?/);
    assert.match(flow, /assertVisible: "Workspace, Central Operations"/);
    assert.match(flow, /assertVisible: "Workspace, West Corridor"/);
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

  it("leaves, resumes, and explicitly ends real foreground guidance", () => {
    const flow = navigationResumeFlowSource();
    const scripts = packageJson().scripts;
    const startIndex = flow.indexOf('id: "safe-route-primary-action"');
    const returnIndex = flow.indexOf('id: "safe-route-return"', startIndex);
    const resumeIndex = flow.indexOf('id: "safe-route-resume-action"');
    const endIndex = flow.indexOf('id: "safe-route-stop-action"', resumeIndex);
    const finalNoResumeIndex = flow.lastIndexOf('id: "safe-route-resume-action"');

    assert.equal(
      scripts["prestart:maestro:ios:preview:navigation-resume"],
      "node scripts/maestro-ios-preflight.mjs",
    );
    assert.equal(
      scripts["start:maestro:ios:preview:navigation-resume"],
      "SAFEROUTE_ENABLE_PREVIEW_MODE=true SAFEROUTE_ENABLE_DEMO_DRIVE=false SAFEROUTE_PREVIEW_INITIAL_SCREEN=guest-map NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081",
    );
    assert.equal(
      scripts["test:maestro:ios:navigation-resume"],
      "node scripts/run-maestro.mjs test maestro/ios-preview-navigation-resume.yaml",
    );
    assert.match(flow, /setLocation:[\s\S]*latitude:\s*51\.5074[\s\S]*longitude:\s*-0\.1278/);
    assert.match(flow, /id:\s*"safe-route-remaining-metrics"/);
    assert.match(flow, /assertNotVisible:\s*\n\s+id:\s*"safe-route-resume-action"/);
    assert.ok(startIndex >= 0);
    assert.ok(returnIndex > startIndex);
    assert.ok(resumeIndex > returnIndex);
    assert.ok(endIndex > resumeIndex);
    assert.ok(finalNoResumeIndex > endIndex);
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
    assert.equal(
      scripts["prestart:maestro:ios:preview:risk-areas"],
      "node scripts/maestro-ios-preflight.mjs",
    );
    assert.equal(
      scripts["start:maestro:ios:preview:risk-areas"],
      "SAFEROUTE_ENABLE_PREVIEW_MODE=true SAFEROUTE_PREVIEW_INITIAL_SCREEN=guest-map NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081",
    );
    assert.match(flow, /text:\s*"Close"[\s\S]*optional:\s*true/);
    assert.match(flow, /visible:\s*"Try again"[\s\S]*tapOn:\s*"Try again"/);
    assert.doesNotMatch(flow, /point:\s*"50%,92%"/);
    assert.doesNotMatch(flow, /point:\s*"91%,49%"/);
    assert.match(flow, /latitude:\s*-34\.033/);
    assert.match(flow, /longitude:\s*18\.585/);
    assert.match(flow, /safe-route-risk-zone-generated-area-risk-safe-route-area-risk-philippi-east-33b347150ca4712272/);
    assert.match(flow, /id:\s*"safe-route-risk-detail"/);
    assert.match(flow, /Philippi East/);
    assert.match(flow, /id:\s*"safe-route-risk-detail-dismiss"/);
    assert.match(flow, /point:\s*"69%,19%"/);
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

  it("opens an authenticated no-saved-routes preview without route cards", () => {
    const appSource = readFileSync(join(process.cwd(), "App.tsx"), "utf8");
    const routeApiSource = readFileSync(
      join(process.cwd(), "src/features/routes/routeApi.ts"),
      "utf8",
    );
    const flow = emptyRoutesFlowSource();
    const scripts = packageJson().scripts;
    const appRootIndex = flow.indexOf('id: "saferoute-app-root"');
    const routePickerIndex = flow.indexOf('id: "safe-route-picker"');
    const emptyStateIndex = flow.indexOf('id: "safe-route-empty-state"');
    const mapReturnIndex = flow.indexOf('id: "route-list-map-return"');
    const guestMapIndex = flow.lastIndexOf('id: "guest-map-primary-action"');

    assert.equal(
      scripts["prestart:maestro:ios:preview:routes-empty"],
      "node scripts/maestro-ios-preflight.mjs",
    );
    assert.equal(
      scripts["start:maestro:ios:preview:routes-empty"],
      "SAFEROUTE_ENABLE_PREVIEW_MODE=true SAFEROUTE_PREVIEW_INITIAL_SCREEN=routes-empty NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081",
    );
    assert.equal(
      scripts["test:maestro:ios:routes-empty"],
      "node scripts/run-maestro.mjs test maestro/ios-preview-routes-empty.yaml",
    );
    assert.match(flow, /SAFEROUTE_PREVIEW_INITIAL_SCREEN=routes-empty/);
    assert.match(flow, /local preview route\s*\n?#?\s*API returns an authenticated workspace with no saved route cards/);
    assert.doesNotMatch(flow, /-\s*clearState/);
    assert.match(flow, /text:\s*"Close"[\s\S]*optional:\s*true/);
    assert.match(flow, /visible:\s*"Try again"[\s\S]*tapOn:\s*"Try again"/);
    assert.match(flow, /setLocation:\s*\n\s+latitude:\s*51\.5074\s*\n\s+longitude:\s*-0\.1278/);
    assert.match(flow, /id:\s*"safe-route-empty-state"/);
    assert.match(flow, /id:\s*"safe-route-empty-state"[\s\S]*timeout:\s*30000/);
    assert.match(
      flow,
      /No saved routes are available for Central Operations\. Switch workspaces or refresh after saving a plan\./,
    );
    assert.match(flow, /assertNotVisible:[\s\S]*safe-route-card-sr-city-airport-alpha/);
    assert.match(flow, /assertNotVisible:[\s\S]*safe-route-card-sr-docklands-low-profile/);
    assert.match(flow, /id:\s*"route-list-map-return"/);
    assert.match(flow, /id:\s*"guest-map-primary-action"/);
    assert.match(appSource, /previewInitialScreen === 'routes-empty'/);
    assert.match(appSource, /screenForAuthenticatedPreview\(previewInitialScreen\)/);
    assert.match(routeApiSource, /SAFEROUTE_PREVIEW_INITIAL_SCREEN === 'routes-empty'/);
    assert.doesNotMatch(flow, /guest-map-destination-input/);
    assert.doesNotMatch(flow, /safe-route-card-sr-city-airport-alpha"\s*\n\s+waitToSettleTimeoutMs/);
    assert.ok(appRootIndex >= 0);
    assert.ok(routePickerIndex > appRootIndex);
    assert.ok(emptyStateIndex > routePickerIndex);
    assert.ok(mapReturnIndex > emptyStateIndex);
    assert.ok(guestMapIndex > mapReturnIndex);
  });

  it("keeps restored preview sessions on the requested preview initial screen", () => {
    const appSource = readFileSync(join(process.cwd(), "App.tsx"), "utf8");

    assert.match(appSource, /SAFEROUTE_PREVIEW_MODE_ENABLED && isPreviewAccessToken\(storedSession\.accessToken\)/);
    assert.match(appSource, /const previewInitialScreen = SAFEROUTE_PREVIEW_INITIAL_SCREEN/);
    assert.match(appSource, /screenForAuthenticatedPreview\(previewInitialScreen\)/);
  });

  it("verifies the branded mobile sign-in surface without a Turnstile dependency", () => {
    const flow = authFlowSource();
    const scripts = packageJson().scripts;

    assert.equal(
      scripts["start:maestro:ios:preview:auth"],
      "SAFEROUTE_ENABLE_PREVIEW_MODE=true SAFEROUTE_PREVIEW_INITIAL_SCREEN=login NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081",
    );
    assert.equal(
      scripts["test:maestro:ios:auth"],
      "node scripts/run-maestro.mjs test maestro/ios-auth-ui.yaml",
    );
    assert.doesNotMatch(flow, /longPressOn:/);
    assert.doesNotMatch(flow, /guest-map-long-press-add-risk/);
    assert.match(flow, /SAFEROUTE_PREVIEW_INITIAL_SCREEN=login/);
    assert.match(flow, /Try again/);
    assert.match(flow, /id:\s*"safe-route-login"/);
    assert.match(flow, /SafeRoute Mobile/);
    assert.match(flow, /id:\s*"safe-route-login-email"/);
    assert.match(flow, /id:\s*"safe-route-login-password"/);
    assert.match(flow, /assertNotVisible:\s*"Cloudflare"/);
    assert.match(flow, /assertNotVisible:\s*"Turnstile"/);
    assert.match(flow, /id:\s*"safe-route-login-map-return"/);
  });

  it("opens the login-code preview directly on the two-factor surface", () => {
    const appSource = readFileSync(join(process.cwd(), "App.tsx"), "utf8");
    const flow = authCodeFlowSource();
    const scripts = packageJson().scripts;
    const appRootIndex = flow.indexOf('id: "saferoute-app-root"');
    const loginIndex = flow.indexOf('id: "safe-route-login"');
    const codeInputIndex = flow.indexOf('id: "safe-route-login-code"');
    const secondaryActionIndex = flow.indexOf('id: "safe-route-login-secondary-action"');
    const emailInputIndex = flow.lastIndexOf('id: "safe-route-login-email"');
    const mapReturnIndex = flow.indexOf('id: "safe-route-login-map-return"');
    const guestMapIndex = flow.indexOf('id: "guest-map-primary-action"');

    assert.equal(
      scripts["prestart:maestro:ios:preview:auth-code"],
      "node scripts/maestro-ios-preflight.mjs",
    );
    assert.equal(
      scripts["start:maestro:ios:preview:auth-code"],
      "SAFEROUTE_ENABLE_PREVIEW_MODE=true SAFEROUTE_PREVIEW_INITIAL_SCREEN=login-code NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081",
    );
    assert.equal(
      scripts["test:maestro:ios:auth-code"],
      "node scripts/run-maestro.mjs test maestro/ios-auth-code-ui.yaml",
    );
    assert.match(flow, /SAFEROUTE_PREVIEW_INITIAL_SCREEN=login-code/);
    assert.match(flow, /without real credentials or OTP/);
    assert.match(flow, /visible:\s*"Try again"[\s\S]*tapOn:\s*"Try again"/);
    assert.match(flow, /assertVisible:\s*"Enter LunarChain login code"/);
    assert.match(flow, /assertVisible:\s*"Enter the 6-digit code sent by email\."/);
    assert.match(flow, /id:\s*"safe-route-login-code"/);
    assert.match(flow, /assertVisible:\s*"Use the most recent code\."/);
    assert.match(flow, /id:\s*"safe-route-login-primary-action"/);
    assert.match(flow, /id:\s*"safe-route-login-secondary-action"/);
    assert.match(flow, /id:\s*"safe-route-login-map-return"/);
    assert.match(flow, /id:\s*"guest-map-primary-action"/);
    assert.match(appSource, /SAFEROUTE_PREVIEW_INITIAL_SCREEN === 'login-code'/);
    assert.match(appSource, /initialChallenge=\{[\s\S]*createPreviewLoginCodeChallenge\(\)/);
    assert.doesNotMatch(flow, /inputText:/);
    assert.doesNotMatch(flow, /longPressOn:/);
    assert.match(flow, /assertNotVisible:\s*"Cloudflare"/);
    assert.match(flow, /assertNotVisible:\s*"Turnstile"/);
    assert.ok(appRootIndex >= 0);
    assert.ok(loginIndex > appRootIndex);
    assert.ok(codeInputIndex > loginIndex);
    assert.ok(secondaryActionIndex > codeInputIndex);
    assert.ok(emailInputIndex > secondaryActionIndex);
    assert.ok(mapReturnIndex > emailInputIndex);
    assert.ok(guestMapIndex > mapReturnIndex);
  });

  it("opens the session-expired preview directly on sign-in recovery copy", () => {
    const appSource = readFileSync(join(process.cwd(), "App.tsx"), "utf8");
    const previewSessionSource = readFileSync(
      join(process.cwd(), "src/features/auth/previewSession.ts"),
      "utf8",
    );
    const flow = authSessionExpiredFlowSource();
    const scripts = packageJson().scripts;
    const appRootIndex = flow.indexOf('id: "saferoute-app-root"');
    const loginIndex = flow.indexOf('id: "safe-route-login"');
    const noticeIndex = flow.indexOf("Your LunarChain session expired. Sign in again.");
    const emailInputIndex = flow.indexOf('id: "safe-route-login-email"');
    const passwordInputIndex = flow.indexOf('id: "safe-route-login-password"');
    const mapReturnIndex = flow.indexOf('id: "safe-route-login-map-return"');
    const guestMapIndex = flow.indexOf('id: "guest-map-primary-action"');

    assert.equal(
      scripts["prestart:maestro:ios:preview:session-expired"],
      "node scripts/maestro-ios-preflight.mjs",
    );
    assert.equal(
      scripts["start:maestro:ios:preview:session-expired"],
      "SAFEROUTE_ENABLE_PREVIEW_MODE=true SAFEROUTE_PREVIEW_INITIAL_SCREEN=session-expired NODE_OPTIONS=--dns-result-order=ipv4first expo start --localhost --port 8081",
    );
    assert.equal(
      scripts["test:maestro:ios:session-expired"],
      "node scripts/run-maestro.mjs test maestro/ios-auth-session-expired-ui.yaml",
    );
    assert.match(flow, /SAFEROUTE_PREVIEW_INITIAL_SCREEN=session-expired/);
    assert.match(flow, /without real credentials or tokens/);
    assert.match(flow, /visible:\s*"Try again"[\s\S]*tapOn:\s*"Try again"/);
    assert.match(flow, /assertVisible:\s*"Your LunarChain session expired\. Sign in again\."/);
    assert.match(flow, /id:\s*"safe-route-login-email"/);
    assert.match(flow, /id:\s*"safe-route-login-password"/);
    assert.match(flow, /id:\s*"safe-route-login-primary-action"/);
    assert.match(flow, /assertNotVisible:[\s\S]*id:\s*"safe-route-login-code"/);
    assert.match(flow, /assertNotVisible:\s*"Cloudflare"/);
    assert.match(flow, /assertNotVisible:\s*"Turnstile"/);
    assert.match(flow, /id:\s*"safe-route-login-map-return"/);
    assert.match(flow, /id:\s*"guest-map-primary-action"/);
    assert.match(appSource, /previewInitialScreen === 'session-expired'/);
    assert.match(appSource, /PREVIEW_EXPIRED_SESSION_NOTICE/);
    assert.match(previewSessionSource, /PREVIEW_EXPIRED_SESSION_NOTICE/);
    assert.doesNotMatch(flow, /inputText:/);
    assert.doesNotMatch(flow, /longPressOn:/);
    assert.ok(appRootIndex >= 0);
    assert.ok(loginIndex > appRootIndex);
    assert.ok(noticeIndex > loginIndex);
    assert.ok(emailInputIndex > noticeIndex);
    assert.ok(passwordInputIndex > emailInputIndex);
    assert.ok(mapReturnIndex > passwordInputIndex);
    assert.ok(guestMapIndex > mapReturnIndex);
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
    assert.doesNotMatch(flow, /guest-map-search-coordinate-51-505300-0-055300/);
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
    const centerControlIndex = flow.indexOf('id: "safe-route-control-center"');
    const stopActionIndex = flow.indexOf('id: "safe-route-stop-action"');

    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-remaining-metrics"/);
    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-control-fit"/);
    assert.match(flow, /assertVisible:\s*\n\s+id:\s*"safe-route-control-center"/);
    assert.match(flow, /assertNotVisible:\s*\n\s+id:\s*"safe-route-control-reroute"/);
    assert.match(flow, /assertNotVisible:\s*\n\s+id:\s*"safe-route-background-navigation-action"/);
    assert.match(flow, /assertVisible:\s*"Resume route guidance"/);
    assert.match(flow, /assertVisible:\s*"Pause route guidance"/);
    assert.ok(primaryActionIndex >= 0);
    assert.ok(stopActionIndex > primaryActionIndex);
    assert.ok(remainingMetricsIndex > stopActionIndex);
    assert.ok(fitControlIndex > remainingMetricsIndex);
    assert.ok(centerControlIndex > fitControlIndex);
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
