import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const styledSourceFiles = [
  "src/features/auth/LoginScreen.styles.ts",
  "src/features/guest-map/GuestMapScreen.styles.ts",
  "src/features/routes/RouteCard.styles.ts",
  "src/features/routes/RouteListScreen.styles.ts",
  "src/features/live-map/LiveMapGuidanceCard.styles.ts",
  "src/features/live-map/LiveMapMarkers.tsx",
  "src/features/live-map/LiveMapOverlay.styles.ts",
  "src/features/live-map/LiveMapRiskCard.styles.ts",
  "src/features/live-map/LiveMapRouteHeader.styles.ts",
  "src/features/live-map/LiveMapRouteSummarySheet.styles.ts",
];

function collectProductionSourceFiles(relativeDir: string): string[] {
  return readdirSync(join(process.cwd(), relativeDir), { withFileTypes: true }).flatMap(
    (entry) => {
      const childPath = join(relativeDir, entry.name);

      if (entry.isDirectory()) {
        return collectProductionSourceFiles(childPath);
      }

      return /\.(ts|tsx)$/.test(entry.name) ? [childPath] : [];
    },
  );
}

describe("rounded visual language", () => {
  it("keeps shared corner radius tokens generous for the modern iOS UI", () => {
    const themeSource = readFileSync(join(process.cwd(), "src/theme.ts"), "utf8");
    const radiusBlock = /export const radius = \{([\s\S]*?)\};/.exec(themeSource)?.[1] || "";

    const minimumRadii = {
      sm: 12,
      md: 18,
      lg: 24,
      xl: 34,
      pill: 999,
    };

    for (const [token, minimum] of Object.entries(minimumRadii)) {
      const match = new RegExp(`${token}:\\s*(\\d+)`).exec(radiusBlock);
      assert.ok(match, `Expected radius.${token} to be defined`);
      assert.ok(
        Number(match[1]) >= minimum,
        `Expected radius.${token} to be at least ${minimum}`,
      );
    }
  });

  it("keeps the shared theme focused on glass surfaces instead of raised tokens", () => {
    const themeSource = readFileSync(join(process.cwd(), "src/theme.ts"), "utf8");

    assert.doesNotMatch(themeSource, /surfaceElevated/);
    assert.doesNotMatch(themeSource, /export const shadow/);
    assert.doesNotMatch(themeSource, /shadowOpacity|shadowRadius|shadowOffset/);
    assert.doesNotMatch(themeSource, /\belevation:/);
  });

  it("keeps primary component corners at usable iOS sizes", () => {
    const violations = styledSourceFiles.filter((file) => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      return /\b(?:button|card|sheet)\w*:\s*\{[^}]*borderRadius:\s*[0-7]\b/is.test(source);
    });

    assert.deepEqual(violations, []);
  });

  it("keeps an Apple Maps-inspired route and glass-control design token set", () => {
    const themeSource = readFileSync(join(process.cwd(), "src/theme.ts"), "utf8");

    for (const token of [
      "appleBlue",
      "appleBlueSoft",
      "routePrimary",
      "routeRemaining",
      "surfaceGlass",
      "glassBorder",
    ]) {
      assert.match(themeSource, new RegExp(`${token}:`), `Expected ${token} to be defined`);
    }
  });

  it("uses safe-area-context for modern runtime-safe screen chrome", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const packageLock = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf8")) as {
      packages?: Record<string, { dependencies?: Record<string, string> }>;
    };
    const appSource = readFileSync(join(process.cwd(), "App.tsx"), "utf8");
    const sourceFiles = ["App.tsx", ...collectProductionSourceFiles("src")];
    const reactNativeSafeAreaImport = /import\s*\{[^}]*\bSafeAreaView\b[^}]*\}\s*from\s*["']react-native["']/;
    const violations = sourceFiles.filter((file) => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      return reactNativeSafeAreaImport.test(source);
    });

    assert.equal(packageJson.dependencies?.["react-native-safe-area-context"], "~5.6.0");
    assert.equal(packageLock.packages?.[""]?.dependencies?.["react-native-safe-area-context"], "~5.6.0");
    assert.match(appSource, /import\s*\{[^}]*\bSafeAreaProvider\b[^}]*\binitialWindowMetrics\b[^}]*\}\s*from\s*["']react-native-safe-area-context["']/);
    assert.match(appSource, /<SafeAreaProvider initialMetrics=\{initialWindowMetrics\} style=\{styles\.root\}>/);
    assert.deepEqual(violations, []);
  });

  it("keeps production screens free of shared raised-surface tokens", () => {
    const sourceFiles = collectProductionSourceFiles("src");
    const violations: string[] = [];

    assert.ok(sourceFiles.length > 10, "Expected production source files to be scanned");

    for (const file of sourceFiles) {
      if (file === "src/theme.ts") {
        continue;
      }

      const source = readFileSync(join(process.cwd(), file), "utf8");

      if (/\bshadow\.(?:panel|sheet)\b/.test(source)) {
        violations.push(`${file} uses a shared raised shadow token`);
      }

      if (/import\s*\{[^}]*\bshadow\b[^}]*\}\s*from\s*['"][^'"]*theme['"]/.test(source)) {
        violations.push(`${file} imports the shared raised shadow token`);
      }

      if (/\bsurfaceElevated\b/.test(source)) {
        violations.push(`${file} uses the elevated surface token`);
      }
    }

    assert.deepEqual(violations, []);
  });

  it("keeps text-led production chrome free of icon-library dependencies", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const packageLock = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf8")) as {
      packages?: Record<string, { dependencies?: Record<string, string> }>;
    };
    const sourceFiles = collectProductionSourceFiles("src");
    const iconImportViolations = sourceFiles.filter((file) => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      return /@expo\/vector-icons|Ionicons|MaterialIcons|FontAwesome|Feather|Octicons/.test(
        source,
      );
    });

    assert.deepEqual(iconImportViolations, []);
    assert.equal(packageJson.dependencies?.["@expo/vector-icons"], undefined);
    assert.equal(packageLock.packages?.[""]?.dependencies?.["@expo/vector-icons"], undefined);
    assert.equal(packageLock.packages?.["node_modules/@expo/vector-icons"], undefined);
  });

  it("uses the shared route-primary treatment on map route lines", () => {
    const liveMapCanvasSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapCanvas.tsx"),
      "utf8",
    );
    const routeLinePresentationSource = readFileSync(
      join(process.cwd(), "src/features/live-map/routeLinePresentation.ts"),
      "utf8",
    );
    const guestMapSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );

    assert.match(liveMapCanvasSource, /resolveRouteLinePresentation/);

    for (const source of [routeLinePresentationSource, guestMapSource]) {
      assert.match(source, /colors\.routePrimary/);
    }
  });

  it("keeps live guidance on light glass with readable Apple-blue route context", () => {
    const guidanceCardSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapGuidanceCard.tsx"),
      "utf8",
    );
    const guidanceStylesSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapGuidanceCard.styles.ts"),
      "utf8",
    );
    const guidanceCardBlock =
      /guidanceCard:\s*\{([\s\S]*?)\n  \},\n  guidanceCardCompact:/.exec(
        guidanceStylesSource,
      )?.[1] || "";
    const guidanceWarningBlock =
      /guidanceCardWarning:\s*\{([\s\S]*?)\n  \},\n  guidanceCopy:/.exec(
        guidanceStylesSource,
      )?.[1] || "";
    const guidanceTitleBlock =
      /guidanceTitle:\s*\{([\s\S]*?)\n  \},\n  guidanceTitleCompact:/.exec(
        guidanceStylesSource,
      )?.[1] || "";
    const guidanceDangerTextBlock =
      /guidanceDangerText:\s*\{([\s\S]*?)\n  \},\n  guidanceMeta:/.exec(
        guidanceStylesSource,
      )?.[1] || "";
    const guidanceMetaBlock =
      /guidanceMeta:\s*\{([\s\S]*?)\n  \},\n  guidanceRiskMeta:/.exec(
        guidanceStylesSource,
      )?.[1] || "";
    const guidanceDistanceBlock =
      /guidanceDistance:\s*\{([\s\S]*?)\n  \},\n  guidanceDistanceCompact:/.exec(
        guidanceStylesSource,
      )?.[1] || "";

    assert.match(guidanceCardSource, /const warningActive = state === "off-route"/);
    assert.equal(
      (guidanceCardSource.match(/warningActive \? styles\.guidanceDangerText : null/g) ?? [])
        .length,
      3,
    );
    assert.match(guidanceCardSource, /return styles\.guidanceDangerText;/);
    assert.doesNotMatch(
      guidanceCardSource,
      /guidanceTitleWarning|guidanceMetaWarning|guidanceDistanceWarning|guidanceRiskMetaDanger/,
    );
    assert.match(guidanceCardBlock, /backgroundColor:\s*colors\.surfaceTranslucent/);
    assert.match(guidanceCardBlock, /borderColor:\s*colors\.glassBorder/);
    assert.match(guidanceCardBlock, /borderRadius:\s*radius\.xl/);
    assert.match(guidanceWarningBlock, /backgroundColor:\s*colors\.dangerSoft/);
    assert.match(guidanceWarningBlock, /borderColor:\s*"rgba\(216, 74, 63, 0\.28\)"/);
    assert.match(guidanceTitleBlock, /color:\s*colors\.ink/);
    assert.match(guidanceMetaBlock, /color:\s*colors\.muted/);
    assert.match(guidanceDistanceBlock, /color:\s*colors\.appleBlue/);
    assert.match(guidanceDangerTextBlock, /color:\s*colors\.dangerText/);
    assert.doesNotMatch(guidanceStylesSource, /guidanceTitleWarning:/);
    assert.doesNotMatch(guidanceStylesSource, /guidanceMetaWarning:/);
    assert.doesNotMatch(guidanceStylesSource, /guidanceDistanceWarning:/);
    assert.doesNotMatch(guidanceStylesSource, /guidanceRiskMetaDanger:/);
    assert.match(guidanceStylesSource, /guidanceRiskMetaWarning:[\s\S]*color:\s*colors\.amberText/);
    assert.match(guidanceStylesSource, /guidanceRiskMetaInfo:[\s\S]*color:\s*colors\.infoText/);
    assert.doesNotMatch(guidanceStylesSource, /rgba\(17,\s*17,\s*19/);
    assert.doesNotMatch(guidanceStylesSource, /rgba\(150,\s*49,\s*38/);
  });

  it("keeps floating live-map controls icon-sized and accessible", () => {
    const liveMapControlsSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapControls.tsx"),
      "utf8",
    );
    const liveMapOverlayStylesSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapOverlay.styles.ts"),
      "utf8",
    );
    const controlButtonBlock =
      /controlButton:\s*\{([\s\S]*?)\n  \},\n  controlButtonCompact:/.exec(
        liveMapOverlayStylesSource,
      )?.[1] || "";
    const controlButtonCompactBlock =
      /controlButtonCompact:\s*\{([\s\S]*?)\n  \},\n  controlButtonActive:/.exec(
        liveMapOverlayStylesSource,
      )?.[1] || "";
    assert.match(liveMapControlsSource, /AlertTriangle, Crosshair, Maximize2/);
    assert.doesNotMatch(liveMapControlsSource, /<Text/);
    assert.match(liveMapControlsSource, /const MAP_CONTROL_HIT_SLOP = 8/);
    assert.match(liveMapControlsSource, /hitSlop=\{MAP_CONTROL_HIT_SLOP\}/);
    assert.match(controlButtonBlock, /width:\s*46/);
    assert.match(controlButtonBlock, /maxWidth:\s*46/);
    assert.match(controlButtonBlock, /minWidth:\s*46/);
    assert.match(controlButtonBlock, /minHeight:\s*46/);
    assert.match(controlButtonBlock, /borderRadius:\s*radius\.pill/);
    assert.match(controlButtonBlock, /backgroundColor:\s*colors\.surface/);
    assert.match(controlButtonBlock, /shadowOpacity:\s*0\.14/);
    assert.match(controlButtonBlock, /elevation:\s*4/);
    assert.match(controlButtonCompactBlock, /width:\s*46/);
    assert.match(controlButtonCompactBlock, /minHeight:\s*46/);
  });

  it("uses the four handoff tabs instead of map-sheet support links", () => {
    const guestMapSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );
    const tabBarSource = readFileSync(
      join(process.cwd(), "src/components/AppTabBar.tsx"),
      "utf8",
    );

    assert.doesNotMatch(guestMapSource, /<SupportButton/);
    for (const label of ["Map", "Routes", "Convoys", "Calendar"]) {
      assert.match(tabBarSource, new RegExp(`label: "${label}"`));
    }
    assert.match(tabBarSource, /useSafeAreaInsets\(\)/);
    assert.match(tabBarSource, /height: layout\.height/);
    assert.match(tabBarSource, /accessibilityRole="tab"/);
  });

  it("uses the full-height Where to sheet from the handoff", () => {
    const guestMapSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );
    const guestMapStylesSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.styles.ts"),
      "utf8",
    );
    const guestPlannerSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/guestRoutePlanner.ts"),
      "utf8",
    );
    const sheetBlock =
      /sheet:\s*\{([\s\S]*?)\n  \},\n  sheetHeaderRow:/.exec(
        guestMapStylesSource,
      )?.[1] || "";

    assert.match(guestPlannerSource, /sheetTitle:\s*'Where to\?'/);
    assert.match(guestMapSource, />Cancel</);
    assert.match(guestMapSource, /styles\.sheetGrabber/);
    assert.match(guestMapSource, /onPlannerVisibilityChange/);
    assert.match(guestMapStylesSource, /sheetScrim:[\s\S]*rgba\(0, 0, 0, 0\.12\)/);
    assert.match(sheetBlock, /backgroundColor:\s*colors\.sheet/);
    assert.match(sheetBlock, /borderTopLeftRadius:\s*radius\.sheet/);
    assert.match(sheetBlock, /shadowOpacity:\s*0\.2/);
    assert.match(sheetBlock, /elevation:\s*18/);
  });

  it("uses the handoff risk summary, login pill, and map-layer control", () => {
    const guestMapSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );
    const guestMapStylesSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.styles.ts"),
      "utf8",
    );
    const topBarBlock =
      /topBar:\s*\{([\s\S]*?)\n  \},\n  signInButton:/.exec(guestMapStylesSource)?.[1] || "";
    const signInButtonBlock =
      /signInButton:\s*\{([\s\S]*?)\n  \},\n  signInButtonAuthenticated:/.exec(
        guestMapStylesSource,
      )?.[1] || "";
    assert.doesNotMatch(guestMapSource, /SafeRouteLogo/);
    assert.match(guestMapSource, /testID=\{uiTestIds\.guestMapPrimaryAction\}/);
    assert.match(guestMapSource, /styles\.riskSummary/);
    assert.match(guestMapSource, /riskSummary\.riskAreaLabel/);
    assert.match(guestMapSource, /riskSummary\.routeAlertLabel/);
    assert.match(guestMapSource, /uiTestIds\.guestMapLayerToggle/);
    assert.match(guestMapSource, /mapLayer === 'dark'/);
    assert.match(topBarBlock, /justifyContent:\s*["']space-between["']/);
    assert.match(signInButtonBlock, /maxWidth:\s*144/);
    assert.match(signInButtonBlock, /backgroundColor:\s*colors\.surface/);
    assert.match(signInButtonBlock, /borderRadius:\s*radius\.pill/);
    assert.match(signInButtonBlock, /shadowOpacity:\s*0\.16/);
    assert.match(signInButtonBlock, /shadowRadius:\s*8/);
    assert.match(signInButtonBlock, /elevation:\s*5/);
    assert.match(guestMapStylesSource, /riskSummaryText:[\s\S]*color:\s*colors\.surface/);
  });

  it("keeps saved-route picker session notices bounded and accessible", () => {
    const routeListHeaderSource = readFileSync(
      join(process.cwd(), "src/features/routes/RouteListHeader.tsx"),
      "utf8",
    );
    const sessionNoticeSource = readFileSync(
      join(process.cwd(), "src/features/auth/sessionNoticeState.ts"),
      "utf8",
    );

    assert.match(sessionNoticeSource, /SESSION_NOTICE_MESSAGE_MAX_LENGTH\s*=\s*84/);
    assert.match(sessionNoticeSource, /accessibilityLabel:[\s\S]*normalizedMessage/);
    assert.match(routeListHeaderSource, /createSessionNoticeState\(sessionNotice\)/);
    assert.match(routeListHeaderSource, /sessionNoticeState\.message/);
    assert.match(routeListHeaderSource, /accessibilityLabel=\{sessionNoticeState\.accessibilityLabel \|\| undefined\}/);
    assert.match(routeListHeaderSource, /numberOfLines=\{2\}/);
    assert.doesNotMatch(routeListHeaderSource, /<Text style=\{styles\.noticeText\}>\{sessionNotice\}<\/Text>/);
  });

  it("uses labeled endpoint rows and compact waypoint icon controls", () => {
    const guestMapSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );
    const guestMapStylesSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.styles.ts"),
      "utf8",
    );
    const guestPlannerSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/guestRoutePlanner.ts"),
      "utf8",
    );
    const inputStackBlock =
      /inputStack:\s*\{([\s\S]*?)\n  \},\n  routeAlternativeSelector:/.exec(guestMapStylesSource)?.[1] || "";
    const inputRowBlock =
      /inputRow:\s*\{([\s\S]*?)\n  \},\n  waypointRow:/.exec(guestMapStylesSource)?.[1] || "";
    const inputRowDividerBlock =
      /inputRowDivider:\s*\{([\s\S]*?)\n  \},\n  input:/.exec(guestMapStylesSource)?.[1] || "";
    const waypointActionBlock =
      /waypointAction:\s*\{([\s\S]*?)\n  \},\n  waypointActionPressed:/.exec(
        guestMapStylesSource,
      )?.[1] || "";
    const routeInputMarkerBlock =
      /routeInputMarker:\s*\{([\s\S]*?)\n  \},\n  routeInputMarkerOrigin:/.exec(
        guestMapStylesSource,
      )?.[1] || "";
    const waypointMarkerBlock =
      /waypointMarker:\s*\{([\s\S]*?)\n  \},\n  waypointMarkerLabel:/.exec(
        guestMapStylesSource,
      )?.[1] || "";
    const primaryButtonTextBlock =
      /primaryButtonText:\s*\{([\s\S]*?)\n  \},\n  routePreview:/.exec(
        guestMapStylesSource,
      )?.[1] || "";

    assert.match(guestPlannerSource, /GUEST_ROUTE_LABEL_MAX_LENGTH\s*=\s*80/);
    assert.match(guestPlannerSource, /placeholder:\s*['"]Start point['"]/);
    assert.match(guestPlannerSource, /placeholder:\s*['"]Where to\?['"]/);
    assert.match(guestPlannerSource, /accessibilityHint:/);
    assert.match(guestMapSource, /maxLength=\{GUEST_ROUTE_LABEL_MAX_LENGTH\}/);
    assert.match(guestMapSource, /placeholder=\{originInputCopy\.placeholder\}/);
    assert.match(guestMapSource, /placeholder=\{destinationInputCopy\.placeholder\}/);
    assert.match(guestMapSource, /accessibilityHint=\{accessibilityHint\}/);
    assert.match(guestMapSource, /accessibilityLabel=\{label\}/);
    assert.match(guestMapSource, /<RouteInput\s+divided/);
    assert.match(guestMapSource, /overline="From"/);
    assert.match(guestMapSource, /overline="To"/);
    assert.match(guestMapSource, /tone="origin"/);
    assert.match(guestMapSource, /tone="destination"/);
    assert.match(guestMapSource, /tone === 'origin'[\s\S]*<Crosshair[\s\S]*<MapPin/);
    assert.match(guestMapSource, /styles\.waypointMarkerLabel[\s\S]*\{index \+ 1\}/);
    assert.match(guestMapSource, /ChevronUp/);
    assert.match(guestMapSource, /ChevronDown/);
    assert.match(guestMapSource, /Trash2/);
    assert.match(guestMapSource, /styles\.inputRowDivider/);
    assert.match(guestMapSource, /const GUEST_WAYPOINT_ACTION_HIT_SLOP = 6/);
    assert.equal((guestMapSource.match(/hitSlop=\{GUEST_WAYPOINT_ACTION_HIT_SLOP\}/g) || []).length, 3);
    assert.equal((guestMapSource.match(/pressed \? styles\.waypointActionPressed : null/g) || []).length, 3);
    assert.match(guestMapSource, /<Text numberOfLines=\{1\} style=\{styles\.primaryButtonText\}>/);
    assert.match(primaryButtonTextBlock, /maxWidth:\s*['"]100%['"]/);
    assert.match(primaryButtonTextBlock, /flexShrink:\s*1/);
    assert.match(primaryButtonTextBlock, /textAlign:\s*'center'/);
    assert.match(inputStackBlock, /overflow:\s*['"]hidden['"]/);
    assert.match(inputStackBlock, /borderWidth:\s*0\.5/);
    assert.match(inputStackBlock, /borderColor:\s*colors\.glassBorder/);
    assert.match(inputStackBlock, /borderRadius:\s*16/);
    assert.match(inputStackBlock, /backgroundColor:\s*colors\.surface/);
    assert.doesNotMatch(inputStackBlock, /\bgap:/);
    assert.match(inputRowBlock, /minHeight:\s*64/);
    assert.match(inputRowBlock, /gap:\s*12/);
    assert.match(inputRowBlock, /paddingHorizontal:\s*spacing\.md/);
    assert.doesNotMatch(inputRowBlock, /borderRadius:\s*radius\.pill/);
    assert.doesNotMatch(inputRowBlock, /backgroundColor:\s*colors\.surfaceGlass/);
    assert.doesNotMatch(inputRowBlock, /\bborderWidth/);
    assert.doesNotMatch(inputRowBlock, /shadow\.panel/);
    assert.match(inputRowDividerBlock, /borderBottomWidth:\s*0\.5/);
    assert.match(inputRowDividerBlock, /borderBottomColor:\s*colors\.borderSoft/);
    assert.match(waypointActionBlock, /width:\s*34/);
    assert.match(waypointActionBlock, /height:\s*34/);
    assert.match(waypointActionBlock, /alignItems:\s*['"]center['"]/);
    assert.match(waypointActionBlock, /borderRadius:\s*radius\.pill/);
    assert.match(routeInputMarkerBlock, /width:\s*24/);
    assert.match(routeInputMarkerBlock, /height:\s*24/);
    assert.match(routeInputMarkerBlock, /alignItems:\s*['"]center['"]/);
    assert.match(routeInputMarkerBlock, /justifyContent:\s*['"]center['"]/);
    assert.match(waypointMarkerBlock, /width:\s*24/);
    assert.match(waypointMarkerBlock, /marginRight:\s*spacing\.sm/);
    assert.match(guestMapStylesSource, /routeInputMarkerOrigin:[\s\S]*colors\.safeSoft/);
    assert.match(guestMapStylesSource, /routeInputMarkerDestination:[\s\S]*colors\.appleBlueSoft/);
  });

  it("upgrades guest route previews with road geometry without adding sheet chrome", () => {
    const guestMapSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );

    assert.match(guestMapSource, /fetchSafeRouteRoadRoutePreview/);
    assert.match(guestMapSource, /roadRoutePreviewFetcher \|\|/);
    assert.match(
      guestMapSource,
      /routingAccessToken =[\s\S]*!workspaceSelectionRequired &&[\s\S]*!workspaceAuthorizationRequired &&[\s\S]*!isPreviewAccessToken\(accessToken\)/,
    );
    assert.match(guestMapSource, /accessToken:\s*routingAccessToken/);
    assert.match(guestMapSource, /setRoutePlan\(null\)/);
    assert.match(guestMapSource, /upgradeGuestRouteWithRoadPreview\(localRoutePlan\)/);
    assert.match(guestMapSource, /new AbortController\(\)/);
    assert.match(guestMapSource, /roadPreviewPending/);
    assert.match(guestMapSource, /pendingOpenPreviewRef/);
    assert.match(guestMapSource, /openPendingPreview\(roadRoutePlan\)/);
    assert.doesNotMatch(guestMapSource, /openPendingPreview\(localRoutePlan\)/);
    assert.doesNotMatch(guestMapSource, /setRoutePlan\(SAFEROUTE_PREVIEW_MODE_ENABLED\s*\?\s*localRoutePlan/);
    assert.match(guestMapSource, /A road-snapped safe route is unavailable/);
    assert.match(guestMapSource, /GUEST_ROUTE_PROVIDER_UI_TIMEOUT_MS\s*=\s*15000/);
    assert.match(guestMapSource, /timeoutMs:\s*GUEST_ROUTE_PROVIDER_UI_TIMEOUT_MS/);
    assert.match(guestMapSource, /finalRoadPreview,[\s\S]*\.\.\.\(finalRoadPreview\.alternatives \|\| \[\]\)/);
    assert.match(guestMapSource, /roadSnappedCoordinates:\s*preview\.coordinates/);
    assert.match(guestMapSource, /routeDistanceMeters:\s*preview\.distanceMeters/);
    assert.match(guestMapSource, /routeDurationSeconds:\s*preview\.durationSeconds/);
    assert.doesNotMatch(guestMapSource, /roadPreviewLoading|roadPreviewStatus/);
    assert.match(guestMapSource, /accessibilityLabel="Searching nearby places"/);
  });

  it("uses compact origin dots and destination pins", () => {
    const guestMapSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );
    const guestMapStylesSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.styles.ts"),
      "utf8",
    );
    const liveMarkerSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapMarkers.tsx"),
      "utf8",
    );
    const guestMarkerBlock =
      /marker:\s*\{([\s\S]*?)\n  \},\n  markerOrigin:/.exec(
        guestMapStylesSource,
      )?.[1] || "";

    assert.match(guestMapSource, /styles\.markerCore/);
    assert.match(guestMapSource, /description=\{checkpointKindLabel\(checkpoint\.kind\)\}/);
    assert.match(guestMapSource, /checkpoint\.kind === 'destination'/);
    assert.match(guestMapSource, /<MapPin/);
    assert.doesNotMatch(guestMapSource, /checkpoint\.label/);
    assert.match(guestMapStylesSource, /\bmarkerHitArea:[\s\S]*width:\s*32/);
    assert.match(guestMapStylesSource, /\bmarker:[\s\S]*width:\s*18[\s\S]*borderWidth:\s*2/);
    assert.match(guestMapStylesSource, /\bmarkerOrigin:[\s\S]*colors\.safe/);
    assert.match(guestMarkerBlock, /shadowOpacity:\s*0/);
    assert.match(guestMarkerBlock, /shadowRadius:\s*0/);
    assert.match(guestMarkerBlock, /elevation:\s*0/);
    assert.doesNotMatch(guestMarkerBlock, /shadow\.panel/);
    assert.doesNotMatch(guestMapStylesSource, /\bmarkerLabel:/);

    assert.match(liveMarkerSource, /checkpointMarkerCore/);
    assert.match(liveMarkerSource, /<MapPin/);
    assert.match(liveMarkerSource, /checkpointMarkerHitArea:[\s\S]*width:\s*32/);
    assert.match(liveMarkerSource, /checkpointMarker:[\s\S]*width:\s*18[\s\S]*borderWidth:\s*2/);
    assert.match(liveMarkerSource, /description=\{markerRole\}/);
    assert.match(liveMarkerSource, /checkpointMarkerOrigin:[\s\S]*colors\.safe/);
    assert.match(liveMarkerSource, /checkpointMarkerWaypoint:[\s\S]*colors\.inkSoft/);
    assert.match(liveMarkerSource, /checkpoint\.kind === 'destination'/);
    assert.doesNotMatch(liveMarkerSource, /checkpoint\.label/);
    assert.doesNotMatch(liveMarkerSource, /checkpointMarkerText/);
  });

  it("keeps live risk card status bounded", () => {
    const riskCardSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskCard.tsx"),
      "utf8",
    );
    const riskCardStylesSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskCard.styles.ts"),
      "utf8",
    );
    const riskEyebrowBlock =
      /riskEyebrow:\s*\{([\s\S]*?)\n  \},\n  riskTitle:/.exec(
        riskCardStylesSource,
      )?.[1] || "";

    assert.match(riskCardSource, /<Text numberOfLines=\{1\} style=\{styles\.riskEyebrow\}>/);
    assert.match(riskEyebrowBlock, /maxWidth:\s*["']100%["']/);
  });

  it("uses the handoff bottom risk callout with severity and area chips", () => {
    const guestMapSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );
    const calloutSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskDetailCallout.tsx"),
      "utf8",
    );

    assert.match(guestMapSource, /onDismiss=\{\(\) => setSelectedRiskZone\(null\)\}/);
    assert.doesNotMatch(guestMapSource, /function GuestRiskDetail/);
    assert.match(calloutSource, /testID=\{uiTestIds\.liveMapRiskDetail\}/);
    assert.match(calloutSource, /testID=\{uiTestIds\.liveMapRiskDetailDismiss\}/);
    assert.match(calloutSource, /createSeverityChipLabel/);
    assert.match(calloutSource, /createRiskAreaChipLabel/);
    assert.match(calloutSource, /bottomInset = chrome\.tabBarHeight \+ 18/);
    assert.match(calloutSource, /shadowOpacity:\s*0\.2/);
    assert.match(calloutSource, /borderRadius:\s*radius\.sheet/);
  });

  it("uses the current unframed auth hierarchy without duplicate logo chrome", () => {
    const loginSource = readFileSync(
      join(process.cwd(), "src/features/auth/LoginScreen.tsx"),
      "utf8",
    );
    const loginHeaderStateSource = readFileSync(
      join(process.cwd(), "src/features/auth/loginHeaderState.ts"),
      "utf8",
    );
    const loginStylesSource = readFileSync(
      join(process.cwd(), "src/features/auth/LoginScreen.styles.ts"),
      "utf8",
    );

    assert.match(loginSource, /<AuthBackdrop \/>/);
    assert.doesNotMatch(loginSource, /SafeRouteLogo/);
    assert.match(loginSource, /createLoginHeaderState/);
    assert.match(loginHeaderStateSource, /title:\s*["']Log in to LunarChain["']/);
    assert.match(loginHeaderStateSource, /title:\s*["']Enter your login code["']/);
    assert.match(loginHeaderStateSource, /eyebrow:\s*["']Two-factor verification["']/);
    assert.match(loginSource, /title:\s*'Two-factor auth'/);
    assert.match(loginStylesSource, /flowTitle:[\s\S]*fontSize:\s*25/);
    assert.doesNotMatch(loginStylesSource, /flowTitle:[\s\S]*textTransform:\s*["']uppercase["']/);
    assert.match(loginStylesSource, /letterSpacing:\s*0/);
  });

  it("uses the handoff sign-in fields and familiar auth control icons", () => {
    const loginSource = readFileSync(
      join(process.cwd(), "src/features/auth/LoginScreen.tsx"),
      "utf8",
    );
    const loginStylesSource = readFileSync(
      join(process.cwd(), "src/features/auth/LoginScreen.styles.ts"),
      "utf8",
    );

    assert.match(loginSource, /placeholder="Email"/);
    assert.match(loginSource, /placeholder="Password"/);
    assert.match(loginSource, /Forgot password\?/);
    assert.match(loginSource, />Create account<\/Text>/);
    assert.match(loginSource, /ArrowLeft[\s\S]*Eye[\s\S]*EyeOff[\s\S]*LockKeyhole/);
    assert.match(loginSource, /testID=\{uiTestIds\.loginResendCode\}/);
    assert.match(loginSource, /testID=\{uiTestIds\.passwordResetForm\}/);
    assert.doesNotMatch(loginSource, /BlurView|cardFrame|styles\.card/);
    assert.match(loginStylesSource, /handoffInputShell:[\s\S]*borderRadius:\s*15/);
    assert.match(loginStylesSource, /handoffPrimaryButton:[\s\S]*backgroundColor:\s*'#FFFFFF'/);
    assert.match(loginStylesSource, /codeCellRow:[\s\S]*minHeight:\s*58/);
  });

  it("keeps live-map route headers free of brand-logo chrome", () => {
    const liveHeaderSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRouteHeader.tsx"),
      "utf8",
    );
    const liveHeaderStylesSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRouteHeader.styles.ts"),
      "utf8",
    );
    const liveUiStateSource = readFileSync(
      join(process.cwd(), "src/features/live-map/liveMapUiState.ts"),
      "utf8",
    );
    assert.doesNotMatch(liveHeaderSource, /SafeRouteLogo|Ionicons/);
    assert.match(liveHeaderSource, /testID=\{uiTestIds\.liveMapReturn\}/);
    assert.match(liveHeaderSource, /styles\.backButton/);
    assert.match(liveHeaderSource, /accessibilityLabel=\{returnAccessibilityLabel\}/);
    assert.match(liveHeaderSource, /useSafeAreaInsets\(\)/);
    assert.match(
      liveHeaderSource,
      /const topInset = insets\.top \+ \([\s\S]*spacing\.sm[\s\S]*marginTop: topInset/,
    );
    assert.match(liveHeaderStylesSource, /backButton:[\s\S]*width:\s*controlSizes\.icon/);
    assert.match(liveHeaderStylesSource, /backButton:[\s\S]*borderRadius:\s*radius\.pill/);
    assert.match(liveHeaderStylesSource, /backButton:[\s\S]*shadowOpacity:\s*0\.16/);
    assert.match(liveHeaderStylesSource, /permissionNotice:[\s\S]*backgroundColor:\s*colors\.surface/);
    assert.match(liveUiStateSource, /LIVE_ROUTE_STATUS_LABEL_MAX_LENGTH\s*=\s*18/);
    return;
    const noticeBlock =
      /permissionNotice:\s*\{([\s\S]*?)\n  \},\n  permissionNoticeCompactNavigation/.exec(
        liveHeaderStylesSource,
      )?.[1] || "";
    const headerPanelBlock =
      /headerPanel:\s*\{([\s\S]*?)\n  \},\n  headerPanelCompactNavigation/.exec(
        liveHeaderStylesSource,
      )?.[1] || "";
    const routeListButtonBlock =
      /routeListButton:\s*\{([\s\S]*?)\n  \},\n  routeListButtonPressed:/.exec(
        liveHeaderStylesSource,
      )?.[1] || "";
    const routeListButtonPressedBlock =
      /routeListButtonPressed:\s*\{([\s\S]*?)\n  \},\n  routeListButtonText/.exec(
        liveHeaderStylesSource,
      )?.[1] || "";
    const activeBackButtonBlock =
      /activeBackButton:\s*\{([\s\S]*?)\n  \},\n  activeBackButtonText/.exec(
        liveHeaderStylesSource,
      )?.[1] || "";
    const routeListButtonTextBlock =
      /routeListButtonText:\s*\{([\s\S]*?)\n  \},\n  routeTitle/.exec(
        liveHeaderStylesSource,
      )?.[1] || "";
    const minimalHeaderBlock =
      /headerPanelMinimalActiveNavigation:\s*\{([\s\S]*?)\n  \},\n  activeBackButton:/.exec(
        liveHeaderStylesSource,
      )?.[1] || "";
    const statusPillBlock =
      /statusPill:\s*\{([\s\S]*?)\n  \},\n  statusPillLive/.exec(
        liveHeaderStylesSource,
      )?.[1] || "";
    const statusTextBlock =
      /statusText:\s*\{([\s\S]*?)\n  \},\n  statusTextLive/.exec(
        liveHeaderStylesSource,
      )?.[1] || "";
    const compactHeaderBranch =
      /headerPresentation\.compactNavigation \? \(([\s\S]*?)\n        \) : \(/.exec(
        liveHeaderSource,
      )?.[1] || "";

    assert.doesNotMatch(liveHeaderSource, /SafeRouteLogo/);
    assert.doesNotMatch(liveHeaderSource, /Ionicons/);
    assert.doesNotMatch(liveHeaderSource, /alert-circle/);
    assert.doesNotMatch(liveHeaderSource, /radio-button-on|name="location"|arrow-forward/);
    assert.doesNotMatch(liveHeaderSource, /icon=/);
    assert.match(liveHeaderSource, /createRouteTitleAccessibilityLabel/);
    assert.match(liveHeaderSource, /createRouteTitleDisplayText/);
    assert.match(liveHeaderSource, /accessibilityLabel=\{routeTitleAccessibilityLabel\}/);
    assert.match(liveHeaderSource, /routeTitleDisplayText/);
    assert.doesNotMatch(liveHeaderSource, /{routePlan\.name}\s*<\/Text>/);
    assert.doesNotMatch(liveHeaderSource, /styles\.routeSubtitle/);
    assert.doesNotMatch(liveHeaderStylesSource, /\brouteSubtitle:/);
    assert.match(liveHeaderSource, /presentation\.displayText/);
    assert.match(liveHeaderSource, /presentation\.label/);
    assert.match(liveHeaderSource, /presentation\.accessibilityLabel/);
    assert.match(liveHeaderSource, /style=\{\(\{ pressed \}\) => \[/);
    assert.match(liveHeaderSource, /const LIVE_ROUTE_RETURN_HIT_SLOP = 6/);
    assert.match(liveHeaderSource, /hitSlop=\{LIVE_ROUTE_RETURN_HIT_SLOP\}/);
    assert.equal((liveHeaderSource.match(/hitSlop=\{LIVE_ROUTE_RETURN_HIT_SLOP\}/g) || []).length, 2);
    assert.doesNotMatch(liveHeaderStylesSource, /\bbrandCluster:/);
    assert.match(headerPanelBlock, /backgroundColor:\s*colors\.surfaceGlass/);
    assert.match(headerPanelBlock, /shadowOpacity:\s*0/);
    assert.match(headerPanelBlock, /shadowRadius:\s*0/);
    assert.match(headerPanelBlock, /elevation:\s*0/);
    assert.doesNotMatch(headerPanelBlock, /shadow\.panel/);
    assert.doesNotMatch(liveHeaderStylesSource, /,\s*shadow,/);
    assert.match(routeListButtonBlock, /minHeight:\s*controlSizes\.secondary/);
    assert.match(routeListButtonBlock, /borderRadius:\s*radius\.pill/);
    assert.match(routeListButtonBlock, /borderWidth:\s*0/);
    assert.match(routeListButtonBlock, /backgroundColor:\s*["']transparent["']/);
    assert.match(routeListButtonBlock, /maxWidth:\s*132/);
    assert.match(routeListButtonTextBlock, /maxWidth:\s*["']100%["']/);
    assert.match(routeListButtonTextBlock, /flexShrink:\s*1/);
    assert.match(routeListButtonTextBlock, /textAlign:\s*["']center["']/);
    assert.equal(
      (liveHeaderSource.match(/\{returnLabel\}/g) || []).length,
      1,
    );
    assert.doesNotMatch(routeListButtonBlock, /surfaceElevated/);
    assert.match(routeListButtonPressedBlock, /backgroundColor:\s*colors\.appleBlueSoft/);
    assert.match(minimalHeaderBlock, /alignSelf:\s*"flex-start"/);
    assert.match(activeBackButtonBlock, /minWidth:\s*64/);
    assert.match(activeBackButtonBlock, /height:\s*controlSizes\.secondary/);
    assert.match(activeBackButtonBlock, /borderRadius:\s*radius\.pill/);
    assert.match(compactHeaderBranch, />\s*Back\s*</);
    assert.doesNotMatch(compactHeaderBranch, /StatusPill|presentation\.label|returnLabel/);
    assert.match(statusPillBlock, /maxWidth:\s*136/);
    assert.match(statusPillBlock, /minWidth:\s*0/);
    assert.match(statusPillBlock, /flexShrink:\s*1/);
    assert.match(statusTextBlock, /maxWidth:\s*["']100%["']/);
    assert.match(statusTextBlock, /minWidth:\s*0/);
    assert.match(statusTextBlock, /flexShrink:\s*1/);
    assert.match(statusTextBlock, /textAlign:\s*["']center["']/);
    assert.match(liveHeaderSource, /ellipsizeMode="tail"[\s\S]*minimumFontScale=\{0\.82\}[\s\S]*presentation\.label/);
    assert.match(liveUiStateSource, /LIVE_ROUTE_STATUS_LABEL_MAX_LENGTH\s*=\s*18/);
    assert.match(liveUiStateSource, /routeStatusAccessibilityLabel/);
    assert.match(noticeBlock, /alignSelf:\s*"flex-start"/);
    assert.match(noticeBlock, /borderRadius:\s*radius\.pill/);
    assert.match(noticeBlock, /backgroundColor:\s*colors\.amberSoft/);
  });

  it("keeps live-map endpoint context in a single text-led capsule", () => {
    const routeSheetSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRouteSummarySheet.tsx"),
      "utf8",
    );
    const routeSheetStylesSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRouteSummarySheet.styles.ts"),
      "utf8",
    );

    assert.match(routeSheetSource, /function RouteEndpoints/);
    assert.match(routeSheetSource, /endpointDotOrigin/);
    assert.match(routeSheetSource, /endpointDotDestination/);
    assert.match(routeSheetStylesSource, /endpointDotOrigin:[\s\S]*colors\.safe/);
    assert.match(routeSheetStylesSource, /endpointDotDestination:[\s\S]*colors\.appleBlue/);
    return;
    const liveHeaderSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRouteHeader.tsx"),
      "utf8",
    );
    const liveHeaderStylesSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRouteHeader.styles.ts"),
      "utf8",
    );
    const liveUiStateSource = readFileSync(
      join(process.cwd(), "src/features/live-map/liveMapUiState.ts"),
      "utf8",
    );
    const routeEndpointLineBlock =
      /routeEndpointLine:\s*\{([\s\S]*?)\n  \},\n  routeEndpointLineExpanded/.exec(
        liveHeaderStylesSource,
      )?.[1] || "";

    assert.match(liveHeaderSource, /createRouteEndpointLinePresentation/);
    assert.match(liveHeaderSource, /presentation\.displayText/);
    assert.match(liveUiStateSource, /LIVE_ROUTE_ENDPOINT_LABEL_MAX_LENGTH\s*=\s*36/);
    assert.match(liveUiStateSource, /LIVE_ROUTE_TITLE_MAX_LENGTH\s*=\s*64/);
    assert.match(liveUiStateSource, /createCompactLiveRouteLabel/);
    assert.doesNotMatch(liveHeaderSource, /RouteFieldInline/);
    assert.doesNotMatch(liveHeaderSource, /styles\.routeFields/);
    assert.doesNotMatch(liveHeaderSource, /styles\.routeFieldCompact/);
    assert.doesNotMatch(liveHeaderStylesSource, /\brouteFields:/);
    assert.doesNotMatch(liveHeaderStylesSource, /\brouteField:/);
    assert.doesNotMatch(liveHeaderStylesSource, /\brouteFieldCompact:/);
    assert.match(liveHeaderStylesSource, /\brouteEndpointLine:/);
    assert.match(liveHeaderStylesSource, /\brouteEndpointText:/);
    assert.match(routeEndpointLineBlock, /borderRadius:\s*radius\.xl/);
    assert.match(routeEndpointLineBlock, /backgroundColor:\s*colors\.surfaceGlass/);
    assert.doesNotMatch(routeEndpointLineBlock, /surfaceElevated/);
  });

  it("keeps active guidance instruction-first without extra label chrome", () => {
    const guidanceSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapGuidanceCard.tsx"),
      "utf8",
    );
    const guidancePresentationSource = readFileSync(
      join(process.cwd(), "src/features/live-map/liveMapGuidancePresentation.ts"),
      "utf8",
    );
    const guidanceStylesSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapGuidanceCard.styles.ts"),
      "utf8",
    );
    const guidanceCardBlock =
      /guidanceCard:\s*\{([\s\S]*?)\n  \},\n  guidanceCardCompact:/.exec(
        guidanceStylesSource,
      )?.[1] || "";

    assert.match(guidanceSource, /accessibilityLabel=\{stateAwareAccessibilityLabel\}/);
    assert.match(
      guidanceSource,
      /state === "off-route"[\s\S]*`Off route\. \$\{accessibilityLabel\}`/,
    );
    assert.match(guidanceSource, /:\s*presentation\.accessibilityLabel/);
    assert.match(guidanceSource, /presentation\.instructionLabel/);
    assert.match(guidanceSource, /presentation\.distanceLabel/);
    assert.match(guidanceSource, /<Text\s+numberOfLines=\{1\}[\s\S]*styles\.guidanceDistance/);
    assert.match(guidancePresentationSource, /GUIDANCE_INSTRUCTION_MAX_LENGTH\s*=\s*72/);
    assert.match(guidancePresentationSource, /GUIDANCE_DISTANCE_MAX_LENGTH\s*=\s*24/);
    assert.match(guidancePresentationSource, /createCompactGuidanceLabel/);
    assert.doesNotMatch(guidanceSource, /\{guidance\.instruction\}/);
    assert.doesNotMatch(guidanceSource, /\{guidance\.distance\}/);
    assert.doesNotMatch(guidanceSource, /Ionicons/);
    assert.doesNotMatch(guidanceSource, /name=\{icon\}|name="navigate"|name="alert"|name="flag"/);
    assert.doesNotMatch(guidanceSource, /styles\.guidanceIcon/);
    assert.doesNotMatch(guidanceSource, /Current instruction<\/Text>/);
    assert.doesNotMatch(guidanceSource, /styles\.darkLabel/);
    assert.match(guidanceCardBlock, /borderRadius:\s*radius\.xl/);
    assert.match(guidanceCardBlock, /shadowOpacity:\s*0/);
    assert.match(guidanceCardBlock, /shadowRadius:\s*0/);
    assert.match(guidanceCardBlock, /elevation:\s*0/);
    assert.doesNotMatch(guidanceCardBlock, /shadow\.panel/);
    assert.doesNotMatch(guidanceStylesSource, /,\s*shadow,/);
    assert.doesNotMatch(guidanceStylesSource, /\bguidanceIcon:/);
    assert.doesNotMatch(guidanceStylesSource, /\bguidanceIconCompact:/);
    assert.doesNotMatch(guidanceStylesSource, /\bdarkLabel:/);
  });

  it("keeps saved-route cards summary-line based instead of metric-chip heavy", () => {
    const routeCardSource = readFileSync(
      join(process.cwd(), "src/features/routes/RouteCard.tsx"),
      "utf8",
    );
    const routeCardPresentationSource = readFileSync(
      join(process.cwd(), "src/features/routes/routeCardPresentation.ts"),
      "utf8",
    );
    const routeCardStylesSource = readFileSync(
      join(process.cwd(), "src/features/routes/RouteCard.styles.ts"),
      "utf8",
    );
    assert.match(routeCardSource, /styles\.cardBody/);
    assert.match(routeCardSource, /presentation\.endpointLabel/);
    assert.match(routeCardSource, /presentation\.updatedLabel/);
    assert.match(routeCardSource, /metricLabel/);
    assert.match(routeCardSource, /riskLabel/);
    assert.match(routeCardSource, /testID=\{`\$\{presentation\.testID\}-map`\}/);
    assert.match(routeCardStylesSource, /card:[\s\S]*borderRadius:\s*radius\.card/);
    assert.match(routeCardStylesSource, /card:[\s\S]*shadowOpacity:\s*0\.06/);
    assert.match(routeCardStylesSource, /routeFooter:/);
    return;
    const cardBlock =
      /card:\s*\{([\s\S]*?)\n  \},\n  cardPressed:/.exec(
        routeCardStylesSource,
      )?.[1] || "";
    const cardPressedBlock =
      /cardPressed:\s*\{([\s\S]*?)\n  \},\n  cardLoading:/.exec(
        routeCardStylesSource,
      )?.[1] || "";
    const routeTitleRowBlock =
      /routeTitleRow:\s*\{([\s\S]*?)\n  \},\n  statusPill:/.exec(
        routeCardStylesSource,
      )?.[1] || "";
    const statusPillBlock =
      /statusPill:\s*\{([\s\S]*?)\n  \},\n  statusReady:/.exec(
        routeCardStylesSource,
      )?.[1] || "";
    const openButtonBlock =
      /openButton:\s*\{([\s\S]*?)\n  \},\n  openButtonText:/.exec(
        routeCardStylesSource,
      )?.[1] || "";
    const openButtonTextBlock =
      /openButtonText:\s*\{([\s\S]*?)\n  \},\n\}\);/.exec(
        routeCardStylesSource,
      )?.[1] || "";

    assert.match(routeCardSource, /presentation\.endpointLabel/);
    assert.match(routeCardSource, /presentation\.summaryLabel/);
    assert.match(routeCardSource, /presentation\.titleLabel/);
    assert.doesNotMatch(routeCardSource, /\{route\.name\}/);
    assert.match(routeCardSource, /styles\.routeTitleRow/);
    assert.doesNotMatch(routeCardSource, /presentation\.metaLabel/);
    assert.doesNotMatch(routeCardSource, /styles\.routeMeta/);
    assert.doesNotMatch(routeCardSource, /styles\.cardFooter/);
    assert.doesNotMatch(routeCardSource, /styles\.cardHeader/);
    assert.doesNotMatch(routeCardSource, /Ionicons/);
    assert.doesNotMatch(routeCardSource, /MapPreview/);
    assert.doesNotMatch(routeCardSource, /presentation\.updatedLabel/);
    assert.doesNotMatch(routeCardSource, /EndpointLine/);
    assert.doesNotMatch(routeCardSource, /presentation\.metrics/);
    assert.doesNotMatch(routeCardStylesSource, /\bcardTopRow:/);
    assert.doesNotMatch(routeCardStylesSource, /\bmapPreview:/);
    assert.doesNotMatch(routeCardStylesSource, /\bpreviewGridLine/);
    assert.doesNotMatch(routeCardStylesSource, /\bpreviewRouteSegment/);
    assert.doesNotMatch(routeCardStylesSource, /\bpreviewEndpoint/);
    assert.doesNotMatch(routeCardStylesSource, /\bupdatedText:/);
    assert.doesNotMatch(routeCardStylesSource, /\brouteMeta:/);
    assert.doesNotMatch(routeCardStylesSource, /\bmetricRow:/);
    assert.doesNotMatch(routeCardStylesSource, /\bmetric:/);
    assert.doesNotMatch(routeCardStylesSource, /\bendpointLine:/);
    assert.doesNotMatch(routeCardStylesSource, /\bendpointText:/);
    assert.doesNotMatch(routeCardStylesSource, /\bcardFooter:/);
    assert.doesNotMatch(routeCardStylesSource, /\bcardHeader:/);
    assert.match(cardBlock, /backgroundColor:\s*colors\.surfaceTranslucent/);
    assert.match(cardBlock, /shadowOpacity:\s*0/);
    assert.match(cardBlock, /elevation:\s*0/);
    assert.doesNotMatch(cardBlock, /shadow\.panel/);
    assert.match(cardPressedBlock, /backgroundColor:\s*colors\.appleBlueSoft/);
    assert.match(cardPressedBlock, /borderColor:\s*colors\.glassBorder/);
    assert.match(cardPressedBlock, /transform:\s*\[\{ scale:\s*0\.985 \}\]/);
    assert.match(routeCardStylesSource, /\brouteTitleRow:/);
    assert.match(routeTitleRowBlock, /minWidth:\s*0/);
    assert.match(routeTitleRowBlock, /alignItems:\s*"flex-start"/);
    assert.match(routeCardStylesSource, /\brouteEndpoint:/);
    assert.match(routeCardStylesSource, /\brouteSummary:/);
    assert.match(cardBlock, /paddingHorizontal:\s*spacing\.md/);
    assert.match(cardBlock, /borderRadius:\s*radius\.lg/);
    assert.match(openButtonBlock, /maxWidth:\s*84/);
    assert.match(openButtonBlock, /minHeight:\s*30/);
    assert.match(openButtonBlock, /flexShrink:\s*0/);
    assert.match(openButtonBlock, /backgroundColor:\s*"transparent"/);
    assert.match(routeCardStylesSource, /routeFooter:/);
    assert.match(routeCardSource, /accessibilityElementsHidden/);
    assert.match(routeCardSource, /importantForAccessibility="no-hide-descendants"/);
    assert.match(routeCardSource, /pointerEvents="none"/);
    assert.match(routeCardSource, /ActivityIndicator color=\{colors\.appleBlue\}/);
    assert.match(routeCardSource, /<Text numberOfLines=\{1\} style=\{styles\.openButtonText\}>/);
    assert.match(
      routeCardSource,
      /<Text\s+numberOfLines=\{1\}\s+style=\{\[styles\.statusText, statusTextStyle\]\}/,
    );
    assert.match(openButtonTextBlock, /maxWidth:\s*64/);
    assert.match(openButtonTextBlock, /flexShrink:\s*1/);
    assert.match(openButtonTextBlock, /color:\s*colors\.appleBlue/);
    assert.match(statusPillBlock, /maxWidth:\s*76/);
    assert.match(statusPillBlock, /flexShrink:\s*0/);
    assert.match(statusPillBlock, /overflow:\s*"hidden"/);
    assert.match(routeCardStylesSource, /statusText:[\s\S]*maxWidth:\s*68/);
    assert.match(routeCardPresentationSource, /ROUTE_CARD_TITLE_MAX_LENGTH\s*=\s*72/);
    assert.match(routeCardPresentationSource, /ROUTE_CARD_ENDPOINT_MAX_LENGTH\s*=\s*80/);
    assert.match(routeCardPresentationSource, /ROUTE_CARD_META_MAX_LENGTH\s*=\s*64/);
    assert.match(routeCardPresentationSource, /ROUTE_CARD_SUMMARY_METRIC_MAX_LENGTH\s*=\s*24/);
    assert.match(routeCardPresentationSource, /ROUTE_CARD_RISK_MAX_LENGTH\s*=\s*28/);
    assert.match(routeCardPresentationSource, /ROUTE_CARD_RISK_MAX_LENGTH(?:,|\s*-\s*riskSuffix\.length)/);
    assert.match(routeCardPresentationSource, /createRouteCardVisibleMetricLabel/);
    assert.match(routeCardPresentationSource, /createRouteCardVisibleRiskSummaryLabel/);
    assert.match(routeCardPresentationSource, /riskSuffix\s*=\s*" risk"/);
    assert.match(routeCardPresentationSource, /createCompactRouteCardLabel/);
  });

  it("keeps the saved-route picker header action-light", () => {
    const routeListHeaderSource = readFileSync(
      join(process.cwd(), "src/features/routes/RouteListHeader.tsx"),
      "utf8",
    );
    const routeListStylesSource = readFileSync(
      join(process.cwd(), "src/features/routes/RouteListScreen.styles.ts"),
      "utf8",
    );
    const signOutButtonBlock =
      /signOutButton:\s*\{([\s\S]*?)\n  \},\n  signOutButtonPressed:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const signOutButtonPressedBlock =
      /signOutButtonPressed:\s*\{([\s\S]*?)\n  \},\n  signOutButtonText:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const signOutButtonTextBlock =
      /signOutButtonText:\s*\{([\s\S]*?)\n  \},\n  noticeBox:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const noticeBoxBlock =
      /noticeBox:\s*\{([\s\S]*?)\n  \},\n  noticeText:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const noticeTextBlock =
      /noticeText:\s*\{([\s\S]*?)\n  \},\n  clientFilter:/.exec(
        routeListStylesSource,
      )?.[1] || "";

    assert.match(routeListHeaderSource, /styles\.headerTitleRow/);
    assert.match(routeListHeaderSource, /const ROUTE_LIST_HEADER_ACTION_HIT_SLOP = 6/);
    assert.match(routeListHeaderSource, /hitSlop=\{ROUTE_LIST_HEADER_ACTION_HIT_SLOP\}/);
    assert.equal(
      (routeListHeaderSource.match(/hitSlop=\{ROUTE_LIST_HEADER_ACTION_HIT_SLOP\}/g) || []).length,
      1,
    );
    assert.match(routeListHeaderSource, /styles\.signOutButtonPressed/);
    assert.match(
      routeListHeaderSource,
      /accessibilityRole=\{sessionNoticeState\.accessibilityRole\} style=\{styles\.noticeBox\}/,
    );
    assert.doesNotMatch(routeListHeaderSource, /SafeRouteLogo|Ionicons/);
    assert.match(signOutButtonBlock, /minHeight:\s*controlSizes\.compact/);
    assert.match(signOutButtonBlock, /backgroundColor:\s*"transparent"/);
    assert.doesNotMatch(signOutButtonBlock, /\bborderWidth/);
    assert.match(signOutButtonPressedBlock, /backgroundColor:\s*colors\.appleBlueSoft/);
    assert.match(signOutButtonTextBlock, /color:\s*colors\.muted/);
    assert.doesNotMatch(routeListHeaderSource, /routeListMapReturn/);
    assert.match(noticeBoxBlock, /alignSelf:\s*"center"/);
    assert.match(noticeBoxBlock, /maxWidth:\s*"100%"/);
    assert.match(noticeBoxBlock, /minHeight:\s*controlSizes\.compact/);
    assert.match(noticeBoxBlock, /borderRadius:\s*radius\.pill/);
    assert.match(noticeBoxBlock, /paddingVertical:\s*spacing\.xs/);
    assert.match(noticeTextBlock, /textAlign:\s*"center"/);
  });

  it("keeps the live-map summary sheet detail-line based instead of metric-card heavy", () => {
    const routeSheetSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRouteSummarySheet.tsx"),
      "utf8",
    );
    const routeSheetStylesSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRouteSummarySheet.styles.ts"),
      "utf8",
    );
    const routeSummarySource = readFileSync(
      join(process.cwd(), "src/features/live-map/routeSummaryPresentation.ts"),
      "utf8",
    );
    assert.match(routeSheetSource, /function Metric/);
    assert.match(routeSheetSource, /styles\.metricsRow/);
    assert.match(routeSheetSource, /function RouteEndpoints/);
    assert.match(routeSheetSource, /<StatusPill/);
    assert.match(routeSheetSource, /styles\.detailsButton/);
    assert.match(routeSheetSource, /uiTestIds\.liveMapPrimaryAction/);
    assert.match(routeSheetStylesSource, /bottomSheet:[\s\S]*right:\s*12/);
    assert.match(routeSheetStylesSource, /bottomSheet:[\s\S]*borderRadius:\s*radius\.lg/);
    assert.match(routeSheetStylesSource, /bottomSheet:[\s\S]*shadowOpacity:\s*0\.16/);
    assert.match(routeSheetStylesSource, /startButton:[\s\S]*borderRadius:\s*14/);
    assert.match(routeSummarySource, /label:\s*"Start"/);
    return;
    const bottomSheetBlock =
      /bottomSheet:\s*\{([\s\S]*?)\n  \},\n  bottomSheetCompact:/.exec(
        routeSheetStylesSource,
      )?.[1] || "";
    const stopButtonBlock =
      /stopButton:\s*\{([\s\S]*?)\n  \},\n  stopButtonCompactNavigation:/.exec(
        routeSheetStylesSource,
      )?.[1] || "";
    const startButtonBlock =
      /startButton:\s*\{([\s\S]*?)\n  \},\n  startButtonCompactNavigation:/.exec(
        routeSheetStylesSource,
      )?.[1] || "";
    const stopButtonCompactBlock =
      /stopButtonCompactNavigation:\s*\{([\s\S]*?)\n  \},\n  stopButtonPressed:/.exec(
        routeSheetStylesSource,
      )?.[1] || "";
    const stopButtonPressedBlock =
      /stopButtonPressed:\s*\{([\s\S]*?)\n  \},\n  stopButtonText:/.exec(
        routeSheetStylesSource,
      )?.[1] || "";
    const stopButtonTextBlock =
      /stopButtonText:\s*\{([\s\S]*?)\n  \},/.exec(
        routeSheetStylesSource,
      )?.[1] || "";

    assert.match(routeSheetSource, /createRouteSummaryDetail/);
    assert.match(routeSheetSource, /createRouteSummaryHeadline/);
    assert.match(routeSheetSource, /createRouteSummaryRemainingMetric/);
    assert.match(routeSheetSource, /routeDescription:\s*route\.description/);
    assert.match(routeSheetSource, /styles\.routeDetailLine/);
    assert.match(routeSheetSource, /styles\.remainingMetricLine/);
    assert.match(routeSheetSource, /uiTestIds\.liveMapRemainingMetrics/);
    assert.doesNotMatch(routeSheetSource, /DemoDrive|demoButton|Simulate|Simulation/);
    assert.match(routeSheetSource, /const ROUTE_SUMMARY_ACTION_HIT_SLOP = 12;/);
    assert.equal(
      routeSheetSource.match(/hitSlop=\{ROUTE_SUMMARY_ACTION_HIT_SLOP\}/g)
        ?.length,
      2,
    );
    assert.equal(
      routeSheetSource.match(
        /pressRetentionOffset=\{ROUTE_SUMMARY_ACTION_PRESS_RETENTION_OFFSET\}/g,
      )?.length,
      2,
    );
    assert.match(routeSheetSource, /style=\{\(\{ pressed \}\) => \[/);
    assert.match(routeSheetSource, /pressed \? styles\.stopButtonPressed : null/);
    assert.match(
      routeSheetSource,
      /<Text\s+numberOfLines=\{1\}\s+style=\{\[\s*styles\.startButtonText/,
    );
    assert.match(routeSheetSource, /<Text numberOfLines=\{1\} style=\{styles\.stopButtonText\}>/);
    assert.match(
      routeSheetSource,
      /accessibilityLabel=\{headlinePresentation\.accessibilityLabel\}[\s\S]*numberOfLines=\{1\}[\s\S]*\{headlinePresentation\.text\}/,
    );
    assert.doesNotMatch(routeSheetSource, /styles\.cardLabel/);
    assert.doesNotMatch(routeSheetSource, /summaryLabel/);
    assert.doesNotMatch(routeSheetSource, /<Metric/);
    assert.doesNotMatch(routeSheetSource, /styles\.sheetGrabber/);
    assert.doesNotMatch(routeSheetSource, /styles\.metricsRow/);
    assert.doesNotMatch(routeSheetSource, /styles\.routeDescription/);
    assert.doesNotMatch(routeSheetSource, /styles\.cardLabelCompactNavigation/);
    assert.doesNotMatch(routeSheetSource, /shouldShowRouteSummaryDescription/);
    assert.doesNotMatch(routeSheetStylesSource, /\bsheetGrabber:/);
    assert.doesNotMatch(routeSheetStylesSource, /\bmetricsRow:/);
    assert.doesNotMatch(routeSheetStylesSource, /\bmetric:/);
    assert.doesNotMatch(routeSheetStylesSource, /\brouteDescription:/);
    assert.doesNotMatch(routeSheetStylesSource, /\bcardLabel:/);
    assert.doesNotMatch(routeSheetStylesSource, /\bcardLabelCompactNavigation:/);
    assert.match(routeSheetStylesSource, /\bremainingMetricLine:/);
    assert.match(routeSheetStylesSource, /\bsummaryCopyCompactNavigation:\s*\{[\s\S]*justifyContent:\s*"center"/);
    assert.match(routeSheetStylesSource, /startButtonText:[\s\S]*maxWidth:\s*"100%"/);
    assert.match(routeSheetStylesSource, /startButtonText:[\s\S]*flexShrink:\s*1/);
    assert.match(startButtonBlock, /flex:\s*1/);
    assert.match(stopButtonBlock, /flex:\s*1/);
    assert.match(stopButtonBlock, /minHeight:\s*50/);
    assert.doesNotMatch(stopButtonBlock, /maxWidth|minWidth|flexShrink/);
    assert.match(stopButtonBlock, /paddingHorizontal:\s*spacing\.md/);
    assert.match(stopButtonCompactBlock, /minHeight:\s*controlSizes\.secondary/);
    assert.doesNotMatch(stopButtonCompactBlock, /maxWidth|minWidth/);
    assert.match(stopButtonCompactBlock, /paddingHorizontal:\s*spacing\.sm/);
    assert.match(stopButtonPressedBlock, /backgroundColor:\s*colors\.dangerSoft/);
    assert.match(stopButtonPressedBlock, /transform:\s*\[\{ scale:\s*0\.985 \}\]/);
    assert.match(stopButtonTextBlock, /maxWidth:\s*64/);
    assert.match(stopButtonTextBlock, /flexShrink:\s*1/);
    assert.match(stopButtonTextBlock, /textAlign:\s*["']center["']/);
    assert.doesNotMatch(routeSheetStylesSource, /\bdemoButton/);
    assert.match(bottomSheetBlock, /backgroundColor:\s*colors\.surfaceTranslucent/);
    assert.match(bottomSheetBlock, /shadowOpacity:\s*0/);
    assert.match(bottomSheetBlock, /shadowRadius:\s*0/);
    assert.match(bottomSheetBlock, /elevation:\s*0/);
    assert.doesNotMatch(bottomSheetBlock, /shadow\.sheet/);
    assert.doesNotMatch(bottomSheetBlock, /surfaceElevated/);
    assert.doesNotMatch(routeSheetStylesSource, /,\s*shadow,/);
    assert.doesNotMatch(routeSummarySource, /RouteSummaryMetric/);
    assert.match(routeSummarySource, /Route note:/);
    assert.match(routeSummarySource, /ROUTE_SUMMARY_DISTANCE_FALLBACK/);
    assert.match(routeSummarySource, /ROUTE_SUMMARY_HEADLINE_MAX_LENGTH/);
    assert.match(routeSummarySource, /ROUTE_SUMMARY_DETAIL_METRIC_MAX_LENGTH/);
    assert.match(routeSummarySource, /createRouteSummaryVisibleDistanceLabel/);
    assert.match(routeSummarySource, /label:\s*"Start"/);
    assert.match(routeSummarySource, /label:\s*"Pause"/);
    assert.match(routeSummarySource, /label:\s*"Resume"/);
    assert.match(routeSummarySource, /createRouteSummaryHeadline/);
    assert.match(routeSummarySource, /createRouteSummaryHeadlineAccessibilityLabel/);
    assert.doesNotMatch(routeSummarySource, /DemoAction|Simulate|Simulation/);
    assert.match(routeSummarySource, /return "Guidance"/);
    assert.match(routeSummarySource, /return "Preview"/);
    assert.doesNotMatch(routeSummarySource, /Start route|Pause route|Resume route/);
    assert.doesNotMatch(routeSummarySource, /Following saved route|Preview route|Route complete/);
  });

  it("keeps live-map risk context semantic inside the metric row", () => {
    const routeSheetSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRouteSummarySheet.tsx"),
      "utf8",
    );
    const routeSheetStylesSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRouteSummarySheet.styles.ts"),
      "utf8",
    );
    const routeSummarySource = readFileSync(
      join(process.cwd(), "src/features/live-map/routeSummaryPresentation.ts"),
      "utf8",
    );

    assert.match(routeSheetSource, /label="Risk"/);
    assert.match(routeSheetSource, /value=\{safetyBadge\.text\}/);
    assert.match(routeSheetSource, /tone=\{route\.tone\}/);
    assert.match(routeSummarySource, /ROUTE_SUMMARY_SAFETY_BADGE_MAX_LENGTH/);
    assert.match(routeSummarySource, /createRouteSummaryVisibleRiskLabel/);
    assert.match(routeSummarySource, /createCompactInlineLabel/);
    assert.match(routeSheetStylesSource, /\bmetricValueAmber:/);
    assert.match(routeSheetStylesSource, /\bmetricValueSafe:/);
    assert.match(routeSheetStylesSource, /\bmetricValueBlue:/);
  });

  it("keeps live risk alert titles presentation-normalized", () => {
    const riskCardSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskCard.tsx"),
      "utf8",
    );
    const routeRiskSource = readFileSync(
      join(process.cwd(), "src/features/live-map/routeRisk.ts"),
      "utf8",
    );

    assert.match(riskCardSource, /createLiveRouteRiskAlertPresentation/);
    assert.match(riskCardSource, /presentation\.zoneTitle/);
    assert.match(routeRiskSource, /LIVE_RISK_VISIBLE_TITLE_MAX_LENGTH/);
    assert.match(routeRiskSource, /LIVE_RISK_VISIBLE_CATEGORY_MAX_LENGTH/);
    assert.match(routeRiskSource, /LIVE_RISK_VISIBLE_BODY_MAX_LENGTH/);
    assert.match(routeRiskSource, /createCompactRiskCopy/);
    assert.match(routeRiskSource, /accessibilityMetaLabel/);
    assert.doesNotMatch(riskCardSource, /\{alert\.zone\.title\}/);
  });

  it("uses severity triangles and restrained route markers", () => {
    const markerSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapMarkers.tsx"),
      "utf8",
    );
    const checkpointMarkerBlock =
      /checkpointMarker:\s*\{([\s\S]*?)\n  \},\n  checkpointMarkerOrigin:/.exec(
        markerSource,
      )?.[1] || "";
    const riskMarkerBlock =
      /riskMarker:\s*\{([\s\S]*?)\n  \},\n  riskMarkerActive:/.exec(
        markerSource,
      )?.[1] || "";
    const vehicleMarkerBlock =
      /vehicleMarker:\s*\{([\s\S]*?)\n  \},\n  vehicleMarkerHeading:/.exec(
        markerSource,
      )?.[1] || "";

    assert.doesNotMatch(markerSource, /Ionicons/);
    assert.match(markerSource, /AlertTriangle/);
    assert.match(markerSource, /severityMarkerSize/);
    assert.match(markerSource, /return 22/);
    assert.match(markerSource, /return 19/);
    assert.match(markerSource, /return 16/);
    assert.doesNotMatch(markerSource, /,\s*shadow,/);
    assert.doesNotMatch(markerSource, /shadow\.panel/);
    assert.match(markerSource, /\briskMarkerHitArea:[\s\S]*width:\s*38/);
    assert.doesNotMatch(markerSource, /Callout|showCallout/);
    assert.match(markerSource, /\bvehicleMarkerHeading:/);
    assert.match(markerSource, /borderRadius:\s*radius\.pill/);
    assert.match(riskMarkerBlock, /width:\s*34/);
    assert.match(vehicleMarkerBlock, /width:\s*30/);
    assert.match(markerSource, /strokeWidth=\{selected \|\| active \? 6 : 5\}/);
    assert.doesNotMatch(markerSource, /strokeWidth=\{selected \|\| active \? 14 : 11\}/);
    for (const markerBlock of [checkpointMarkerBlock, vehicleMarkerBlock]) {
      assert.match(markerBlock, /shadowOpacity:\s*0/);
      assert.match(markerBlock, /shadowRadius:\s*0/);
      assert.match(markerBlock, /elevation:\s*0/);
    }
    assert.match(riskMarkerBlock, /shadowOpacity:\s*0\.45/);
    assert.match(markerSource, /riskMarkerSelectionRing:[\s\S]*borderWidth:\s*2/);
    assert.doesNotMatch(markerSource, /riskMarkerSelected:\s*\{[^}]*transform:/);
  });

  it("keeps live-map controls as familiar icon buttons", () => {
    const controlsSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapControls.tsx"),
      "utf8",
    );
    const overlayStylesSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapOverlay.styles.ts"),
      "utf8",
    );
    const compactControlsBlock =
      /mapControlsCompact:\s*\{([\s\S]*?)\n  \},\n  controlButton:/.exec(
        overlayStylesSource,
      )?.[1] || "";
    const controlButtonBlock =
      /controlButton:\s*\{([\s\S]*?)\n  \},\n  controlButtonCompact:/.exec(
        overlayStylesSource,
      )?.[1] || "";
    const compactButtonBlock =
      /controlButtonCompact:\s*\{([\s\S]*?)\n  \},\n  controlButtonActive:/.exec(
        overlayStylesSource,
      )?.[1] || "";

    assert.match(controlsSource, /compactControls/);
    assert.match(controlsSource, /driveAlongActive=\{driveAlongActive\}/);
    assert.match(controlsSource, /compact=\{compactControls\}/);
    assert.match(controlsSource, /AlertTriangle, Crosshair, Maximize2/);
    assert.doesNotMatch(controlsSource, /<Text/);
    assert.match(controlButtonBlock, /minHeight:\s*46/);
    assert.match(controlButtonBlock, /borderRadius:\s*radius\.pill/);
    assert.match(controlButtonBlock, /shadowOpacity:\s*0\.14/);
    assert.match(controlButtonBlock, /elevation:\s*4/);
    assert.doesNotMatch(controlButtonBlock, /shadow\.panel/);
    assert.match(overlayStylesSource, /controlButtonCompact:/);
    assert.match(compactButtonBlock, /minHeight:\s*46/);
    assert.doesNotMatch(compactControlsBlock, /\bleft:/);
  });

  it("keeps route-picker filters quiet until they are useful", () => {
    const routeListStateSource = readFileSync(
      join(process.cwd(), "src/features/routes/routeListUiState.ts"),
      "utf8",
    );
    const routeListFiltersSource = readFileSync(
      join(process.cwd(), "src/features/routes/RouteListFilters.tsx"),
      "utf8",
    );
    const routeListStylesSource = readFileSync(
      join(process.cwd(), "src/features/routes/RouteListScreen.styles.ts"),
      "utf8",
    );
    const clientSelectorBlock =
      /clientSelectorButton:\s*\{([\s\S]*?)\n  \},\n  clientSelectorButtonOpen:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const clientMenuBlock =
      /clientMenu:\s*\{([\s\S]*?)\n  \},\n  clientMenuContent:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const clientMenuItemBlock =
      /clientMenuItem:\s*\{([\s\S]*?)\n  \},\n  clientMenuItemActive:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const searchBoxBlock =
      /searchBox:\s*\{([\s\S]*?)\n  \},\n  searchInput:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const clearSearchButtonBlock =
      /clearSearchButton:\s*\{([\s\S]*?)\n  \},\n  clearSearchButtonPressed:/.exec(
        routeListStylesSource,
      )?.[1] || "";

    assert.match(routeListStateSource, /ROUTE_SEARCH_MINIMUM_COUNT = 8/);
    assert.match(routeListStateSource, /ROUTE_LIST_QUERY_INPUT_MAX_LENGTH = 96/);
    assert.match(routeListStateSource, /ROUTE_LIST_QUERY_DISPLAY_MAX_LENGTH = 32/);
    assert.match(routeListStateSource, /ROUTE_LIST_CLIENT_DISPLAY_MAX_LENGTH = 28/);
    assert.match(routeListStateSource, /createRouteListSearchQueryValue/);
    assert.match(routeListStateSource, /createCompactRouteListLabel/);
    assert.doesNotMatch(routeListStateSource, /label: "All"/);
    assert.doesNotMatch(routeListStateSource, /every client/);
    assert.doesNotMatch(routeListStateSource, /totalRouteCount > 1/);
    assert.match(routeListFiltersSource, /const ROUTE_FILTER_HIT_SLOP = 6/);
    assert.equal(
      (routeListFiltersSource.match(/hitSlop=\{ROUTE_FILTER_HIT_SLOP\}/g) ?? [])
        .length,
      3,
    );
    assert.match(routeListFiltersSource, /Workspace, \$\{workspaceLabel\}/);
    assert.match(
      routeListFiltersSource,
      /accessibilityState=\{\{[\s\S]*busy:[\s\S]*workspaceSelectionPending \|\|[\s\S]*workspaceSwitchDisabled && !workspaceSwitchFailure[\s\S]*disabled: switchingDisabled,[\s\S]*expanded: clientMenuOpen/,
    );
    assert.match(
      routeListFiltersSource,
      /workspaceSwitchFailure[\s\S]*"Cleanup needed"[\s\S]*workspaceSelectionFailed[\s\S]*"Try again"[\s\S]*workspaceSelectionPending[\s\S]*"Saving…"[\s\S]*workspaceSwitchDisabled[\s\S]*"Finishing…"[\s\S]*clientMenuOpen[\s\S]*"Close"[\s\S]*"Change"/,
    );
    assert.match(routeListFiltersSource, /nestedScrollEnabled/);
    assert.match(clientSelectorBlock, /minHeight:\s*64/);
    assert.match(clientSelectorBlock, /alignItems:\s*["']center["']/);
    assert.match(clientSelectorBlock, /justifyContent:\s*["']space-between["']/);
    assert.match(clientSelectorBlock, /borderRadius:\s*16/);
    assert.match(clientSelectorBlock, /backgroundColor:\s*colors\.surface/);
    assert.match(clientMenuBlock, /maxHeight:\s*220/);
    assert.match(clientMenuBlock, /overflow:\s*["']hidden["']/);
    assert.match(clientMenuItemBlock, /minHeight:\s*controlSizes\.secondary/);
    assert.match(clientMenuItemBlock, /borderRadius:\s*radius\.lg/);
    assert.doesNotMatch(clientSelectorBlock, /surfaceElevated/);
    assert.match(routeListFiltersSource, /accessibilityLabel="Search saved routes"/);
    assert.match(routeListFiltersSource, /maxLength=\{ROUTE_LIST_QUERY_INPUT_MAX_LENGTH\}/);
    assert.match(routeListFiltersSource, /placeholder="Find route"/);
    assert.doesNotMatch(routeListFiltersSource, /Ionicons/);
    assert.doesNotMatch(routeListFiltersSource, /name="search"/);
    assert.match(routeListFiltersSource, /useState\(false\)/);
    assert.match(routeListFiltersSource, /searchFocused \? styles\.searchBoxFocused : null/);
    assert.match(routeListFiltersSource, /accessibilityHint="Filters saved routes by route, convoy, endpoint, or risk\."/);
    assert.match(routeListFiltersSource, /onFocus=\{\(\) => setSearchFocused\(true\)\}/);
    assert.match(routeListFiltersSource, /onBlur=\{\(\) => setSearchFocused\(false\)\}/);
    assert.match(searchBoxBlock, /minHeight:\s*controlSizes\.secondary/);
    assert.match(searchBoxBlock, /borderRadius:\s*radius\.pill/);
    assert.match(searchBoxBlock, /backgroundColor:\s*colors\.surfaceGlass/);
    assert.doesNotMatch(searchBoxBlock, /shadow\.panel/);
    assert.match(routeListStylesSource, /searchBoxFocused:[\s\S]*borderColor:\s*colors\.appleBlue/);
    assert.match(routeListStylesSource, /searchBoxFocused:[\s\S]*backgroundColor:\s*colors\.surfaceTranslucent/);
    assert.match(routeListFiltersSource, /hitSlop=\{ROUTE_FILTER_HIT_SLOP\}[\s\S]*styles\.clearSearchButton/);
    assert.match(routeListFiltersSource, /pressed \? styles\.clearSearchButtonPressed/);
    assert.match(routeListFiltersSource, /<Text numberOfLines=\{1\} style=\{styles\.clearSearchText\}>/);
    assert.match(clearSearchButtonBlock, /backgroundColor:\s*"transparent"/);
    assert.match(routeListStylesSource, /clearSearchButtonPressed:[\s\S]*backgroundColor:\s*colors\.appleBlueSoft/);
    assert.match(routeListStylesSource, /clearSearchText:[\s\S]*color:\s*colors\.appleBlue/);
  });

  it("keeps the route-picker header title-led with only account context", () => {
    const routeListHeaderSource = readFileSync(
      join(process.cwd(), "src/features/routes/RouteListHeader.tsx"),
      "utf8",
    );
    const routeListStylesSource = readFileSync(
      join(process.cwd(), "src/features/routes/RouteListScreen.styles.ts"),
      "utf8",
    );
    const routeListStateSource = readFileSync(
      join(process.cwd(), "src/features/routes/routeListUiState.ts"),
      "utf8",
    );

    assert.match(routeListHeaderSource, /uiTestIds\.routeListSignOut/);
    assert.match(routeListHeaderSource, /styles\.headerTitleRow/);
    assert.match(routeListHeaderSource, /signOutState\.label/);
    assert.match(routeListHeaderSource, /styles\.signOutButtonText/);
    assert.match(
      routeListHeaderSource,
      /<Text numberOfLines=\{1\} style=\{styles\.signOutButtonText\}>/,
    );
    assert.doesNotMatch(routeListHeaderSource, /SafeRouteLogo/);
    assert.doesNotMatch(routeListHeaderSource, /styles\.brandCluster/);
    assert.doesNotMatch(routeListHeaderSource, /styles\.brandCopy/);
    assert.doesNotMatch(routeListHeaderSource, /Ionicons/);
    assert.doesNotMatch(routeListHeaderSource, /log-out-outline/);
    assert.doesNotMatch(routeListHeaderSource, /name="map"/);
    assert.doesNotMatch(routeListHeaderSource, /routeListMapReturn/);
    assert.doesNotMatch(routeListHeaderSource, /headerCopy\.eyebrow/);
    assert.doesNotMatch(routeListHeaderSource, /styles\.eyebrow/);
    assert.doesNotMatch(routeListHeaderSource, /styles\.accountRow/);
    assert.doesNotMatch(routeListHeaderSource, /styles\.accountBar/);
    assert.doesNotMatch(routeListStylesSource, /\beyebrow:/);
    assert.doesNotMatch(routeListStylesSource, /\baccountRow:/);
    assert.doesNotMatch(routeListStylesSource, /\baccountBar:/);
    assert.doesNotMatch(routeListStylesSource, /\baccountText:/);
    assert.doesNotMatch(routeListStylesSource, /\bbrandCluster:/);
    assert.doesNotMatch(routeListStylesSource, /\bbrandCopy:/);
    assert.match(routeListStylesSource, /clientSelectorLabel:[\s\S]*textTransform:\s*["']uppercase["']/);
    assert.match(routeListStateSource, /label:\s*"Sign out"/);
    assert.doesNotMatch(routeListStateSource, /\beyebrow:/);
    assert.doesNotMatch(routeListStateSource, /accountLabel/);
    assert.doesNotMatch(routeListStateSource, /Live map/);
  });

  it("keeps route-picker empty and error states text-first", () => {
    const routeListScreenSource = readFileSync(
      join(process.cwd(), "src/features/routes/RouteListScreen.tsx"),
      "utf8",
    );
    const routeListStylesSource = readFileSync(
      join(process.cwd(), "src/features/routes/RouteListScreen.styles.ts"),
      "utf8",
    );
    const routeListStateSource = readFileSync(
      join(process.cwd(), "src/features/routes/routeListUiState.ts"),
      "utf8",
    );
    const routeListErrorsSource = readFileSync(
      join(process.cwd(), "src/features/routes/routeListErrors.ts"),
      "utf8",
    );
    const emptyStateBlock =
      /emptyState:\s*\{([\s\S]*?)\n  \},\n  emptyCopy:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const errorBoxBlock =
      /errorBox:\s*\{([\s\S]*?)\n  \},\n  errorCopy:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const retryButtonBlock =
      /retryButton:\s*\{([\s\S]*?)\n  \},\n  retryButtonPressed:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const retryButtonPressedBlock =
      /retryButtonPressed:\s*\{([\s\S]*?)\n  \},\n  retryText:/.exec(
        routeListStylesSource,
      )?.[1] || "";

    assert.match(routeListScreenSource, /accessibilityRole="alert"/);
    assert.match(routeListScreenSource, /const ROUTE_LIST_ERROR_ACTION_HIT_SLOP = 6/);
    assert.match(routeListScreenSource, /accessibilityLabel=\{emptyState\.accessibilityLabel\}/);
    assert.match(routeListScreenSource, /hitSlop=\{ROUTE_LIST_ERROR_ACTION_HIT_SLOP\}/);
    assert.match(
      routeListScreenSource,
      /style=\{\(\{ pressed \}\) => \[\s*styles\.retryButton,\s*pressed \? styles\.retryButtonPressed : null,/,
    );
    assert.match(routeListScreenSource, /styles\.errorTitle/);
    assert.match(routeListScreenSource, /accessibilityLabel=\{ownedErrorState\.messageAccessibilityLabel\}/);
    assert.match(routeListScreenSource, /numberOfLines=\{2\}/);
    assert.match(
      routeListScreenSource,
      /<Text numberOfLines=\{1\} style=\{styles\.errorTitle\}>/,
    );
    assert.match(
      routeListScreenSource,
      /<Text numberOfLines=\{1\} style=\{styles\.retryText\}>/,
    );
    assert.match(
      routeListScreenSource,
      /<Text numberOfLines=\{1\} style=\{styles\.stateTitle\}>/,
    );
    assert.match(
      routeListScreenSource,
      /<Text numberOfLines=\{2\} style=\{styles\.emptyCopy\}>/,
    );
    assert.doesNotMatch(routeListScreenSource, /Ionicons/);
    assert.doesNotMatch(routeListScreenSource, /alert-circle/);
    assert.doesNotMatch(routeListScreenSource, /file-tray-outline/);
    assert.match(errorBoxBlock, /alignSelf:\s*"center"/);
    assert.match(errorBoxBlock, /maxWidth:\s*"100%"/);
    assert.match(errorBoxBlock, /minHeight:\s*controlSizes\.secondary/);
    assert.match(errorBoxBlock, /justifyContent:\s*"center"/);
    assert.match(errorBoxBlock, /borderColor:\s*"rgba\(216, 74, 63, 0\.18\)"/);
    assert.match(errorBoxBlock, /borderRadius:\s*radius\.xl/);
    assert.doesNotMatch(errorBoxBlock, /minHeight:\s*52/);
    assert.match(routeListStylesSource, /\bemptyState:[\s\S]*borderRadius:\s*radius\.xl/);
    assert.match(routeListStylesSource, /\bstateTitle:[\s\S]*color:\s*colors\.ink[\s\S]*fontWeight:\s*"800"/);
    assert.doesNotMatch(routeListScreenSource, /styles\.(?:emptyTitle|loadingTitle)/);
    assert.doesNotMatch(routeListStylesSource, /\b(?:emptyTitle|loadingTitle):/);
    assert.match(emptyStateBlock, /alignSelf:\s*"center"/);
    assert.match(emptyStateBlock, /maxWidth:\s*320/);
    assert.match(emptyStateBlock, /backgroundColor:\s*colors\.surfaceGlass/);
    assert.doesNotMatch(emptyStateBlock, /padding:\s*spacing\.xl/);
    assert.doesNotMatch(emptyStateBlock, /shadow\.panel/);
    assert.match(retryButtonBlock, /minHeight:\s*controlSizes\.compact/);
    assert.match(retryButtonBlock, /borderRadius:\s*radius\.pill/);
    assert.match(retryButtonBlock, /backgroundColor:\s*["']transparent["']/);
    assert.doesNotMatch(retryButtonBlock, /surfaceElevated/);
    assert.match(retryButtonPressedBlock, /backgroundColor:\s*colors\.surfaceGlass/);
    assert.match(routeListErrorsSource, /retryLabel:\s*["']Retry["']/);
    assert.doesNotMatch(routeListErrorsSource, /retryLabel:\s*["']Retry sync["']/);
    assert.doesNotMatch(routeListErrorsSource, /retryLabel:\s*["']Retry route["']/);
    assert.match(routeListErrorsSource, /ROUTE_DETAIL_ERROR_ROUTE_NAME_MAX_LENGTH\s*=\s*56/);
    assert.match(routeListErrorsSource, /ROUTE_LIST_ERROR_REASON_MAX_LENGTH\s*=\s*72/);
    assert.match(routeListErrorsSource, /ROUTE_SYNC_ERROR_MESSAGE_MAX_LENGTH\s*=\s*96/);
    assert.match(routeListErrorsSource, /createCompactRouteErrorName/);
    assert.match(routeListErrorsSource, /createCompactRouteErrorText/);
    assert.match(routeListErrorsSource, /messageAccessibilityLabel:\s*message/);
    assert.match(
      routeListErrorsSource,
      /const compactReason = createCompactRouteErrorText\(reason, ROUTE_LIST_ERROR_REASON_MAX_LENGTH\)/,
    );
    assert.match(routeListErrorsSource, /createRouteDetailErrorMessage/);
    assert.match(routeListErrorsSource, /hasTerminalRouteErrorPunctuation/);
    assert.match(
      routeListErrorsSource,
      /message:\s*createRouteDetailErrorMessage\(compactRouteName, compactReason\)/,
    );
    assert.match(
      routeListErrorsSource,
      /messageAccessibilityLabel:\s*createRouteDetailErrorMessage\(safeRouteName, reason\)/,
    );
    assert.match(
      routeListErrorsSource,
      /retryAccessibilityLabel:\s*`Retry loading \$\{safeRouteName\}`/,
    );
    assert.match(routeListStateSource, /title:\s*"No matches"/);
    assert.match(routeListStateSource, /No saved routes match/);
    assert.match(routeListStateSource, /title:\s*"No routes"/);
    assert.doesNotMatch(routeListStateSource, /title:\s*`No routes for/);
    assert.match(routeListStateSource, /copy:\s*"Save a plan, then open it on the map\."/);
    assert.match(routeListStateSource, /copy:\s*"Try another filter\."/);

    const visibleCopyLines = routeListStateSource
      .split("\n")
      .filter((line) => line.trim().startsWith("copy:"))
      .join("\n");
    assert.doesNotMatch(visibleCopyLines, /No saved routes match/);
    assert.doesNotMatch(visibleCopyLines, /Save a SafeRoute plan/);
    assert.doesNotMatch(visibleCopyLines, /map-ready plan/);
    assert.doesNotMatch(visibleCopyLines, /operation name/);
  });

  it("keeps route-picker loading chrome as one compact rounded status", () => {
    const routeListScreenSource = readFileSync(
      join(process.cwd(), "src/features/routes/RouteListScreen.tsx"),
      "utf8",
    );
    const routeListStylesSource = readFileSync(
      join(process.cwd(), "src/features/routes/RouteListScreen.styles.ts"),
      "utf8",
    );
    const routeListStateSource = readFileSync(
      join(process.cwd(), "src/features/routes/routeListUiState.ts"),
      "utf8",
    );
    const loadingCardBlock =
      /loadingCard:\s*\{([\s\S]*?)\n  \},\n  stateTitle:/.exec(
        routeListStylesSource,
      )?.[1] || "";

    assert.match(routeListScreenSource, /accessibilityRole="progressbar"/);
    assert.match(routeListScreenSource, /styles\.loadingCard/);
    assert.match(routeListScreenSource, /loadingState\.title/);
    assert.match(
      routeListScreenSource,
      /<Text numberOfLines=\{1\} style=\{styles\.stateTitle\}>/,
    );
    assert.doesNotMatch(routeListScreenSource, /loadingState\.copy/);
    assert.doesNotMatch(routeListScreenSource, /styles\.loadingCopy/);
    assert.doesNotMatch(routeListScreenSource, /styles\.loadingTitle/);
    assert.doesNotMatch(routeListStylesSource, /\bloadingTitle:/);
    assert.doesNotMatch(routeListStylesSource, /\bloadingCopy:/);
    assert.doesNotMatch(routeListStylesSource, /\bloadingText:/);
    assert.doesNotMatch(routeListStylesSource, /width:\s*"100%"/);
    assert.match(loadingCardBlock, /alignSelf:\s*"center"/);
    assert.match(loadingCardBlock, /borderRadius:\s*radius\.pill/);
    assert.match(loadingCardBlock, /backgroundColor:\s*colors\.surfaceGlass/);
    assert.match(loadingCardBlock, /shadowOpacity:\s*0/);
    assert.match(loadingCardBlock, /shadowRadius:\s*0/);
    assert.match(loadingCardBlock, /elevation:\s*0/);
    assert.doesNotMatch(loadingCardBlock, /shadow\.panel/);
    assert.doesNotMatch(routeListStylesSource, /,\s*shadow,/);
    assert.match(routeListStateSource, /title:\s*"Syncing routes"/);
    assert.doesNotMatch(routeListStateSource, /copy:\s*null/);
  });

  it("avoids square corners in primary auth, route, and live-map chrome", () => {
    for (const file of styledSourceFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      assert.doesNotMatch(
        source,
        /border(?:TopLeft|TopRight)?Radius:\s*0\b/,
        `${file} should use rounded radius tokens instead of square corners`,
      );
    }
  });
});
