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

  it("keeps primary component corners generous with no small radius tokens", () => {
    const violations = styledSourceFiles.filter((file) => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      return /borderRadius:\s*radius\.(?:sm|md)\b/.test(source);
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

    assert.equal(packageJson.dependencies?.["react-native-safe-area-context"], "~5.7.0");
    assert.equal(packageLock.packages?.[""]?.dependencies?.["react-native-safe-area-context"], "~5.7.0");
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
    const guestMapSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );

    for (const source of [liveMapCanvasSource, guestMapSource]) {
      assert.match(source, /colors\.routePrimary/);
    }
  });

  it("keeps signed-in map support actions text-only and low-clutter", () => {
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
    const supportRowBlock =
      /supportRow:\s*\{([\s\S]*?)\n  \},\n  supportButton:/.exec(
        guestMapStylesSource,
      )?.[1] || "";
    const supportButtonBlock =
      /supportButton:\s*\{([\s\S]*?)\n  \},\n  supportButtonPressed:/.exec(
        guestMapStylesSource,
      )?.[1] || "";
    const supportButtonPressedBlock =
      /supportButtonPressed:\s*\{([\s\S]*?)\n  \},\n  supportLabel:/.exec(
        guestMapStylesSource,
      )?.[1] || "";
    const supportLabelBlock =
      /supportLabel:\s*\{([\s\S]*?)\n  \},\n  marker:/.exec(
        guestMapStylesSource,
      )?.[1] || "";

    assert.match(guestMapSource, /<SupportButton/);
    assert.match(guestMapSource, /styles\.supportRow/);
    assert.match(guestMapSource, /styles\.supportButton/);
    assert.doesNotMatch(guestMapSource, /GATE_FEATURE_ICONS/);
    assert.doesNotMatch(guestMapSource, /styles\.gateButton/);
    assert.doesNotMatch(guestMapSource, /styles\.gateRow/);
    assert.match(supportRowBlock, /justifyContent:\s*'center'/);
    assert.match(supportButtonBlock, /minHeight:\s*controlSizes\.secondary/);
    assert.match(supportButtonBlock, /backgroundColor:\s*'transparent'/);
    assert.doesNotMatch(supportButtonBlock, /\bflex:\s*1/);
    assert.doesNotMatch(supportButtonBlock, /\bborderWidth/);
    assert.match(supportButtonPressedBlock, /backgroundColor:\s*colors\.appleBlueSoft/);
    assert.match(supportLabelBlock, /color:\s*colors\.appleBlue/);
    assert.doesNotMatch(guestMapStylesSource, /\bgateButton:/);
    assert.doesNotMatch(guestMapStylesSource, /\bgateRow:/);
    assert.doesNotMatch(guestPlannerSource, /eyebrow/);
    assert.doesNotMatch(guestPlannerSource, /Private trips|Private convoys|Private routes/);
  });

  it("keeps the map-home sheet subtitle progressively disclosed", () => {
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

    assert.match(guestPlannerSource, /shouldShowGuestMapSubtitle/);
    assert.match(guestPlannerSource, /return !routePlotted/);
    assert.match(guestMapSource, /showSheetSubtitle/);
    assert.match(guestMapSource, /showSheetSubtitle \? \(/);
    assert.match(guestMapSource, /styles\.sheetTitleBlock/);
    assert.match(guestMapSource, /styles\.routePreviewSummary/);
    assert.match(guestMapSource, /routePlan \? \(\s*<RoutePreview[\s\S]*inline/);
    assert.doesNotMatch(guestMapSource, /routePreviewTitle/);
    assert.doesNotMatch(guestMapSource, /<\/Pressable>\s*\n\s*\{routePlan \? <RoutePreview/);
    assert.doesNotMatch(guestMapSource, /styles\.grabber/);
    assert.doesNotMatch(guestMapStylesSource, /\bgrabber:/);
    assert.match(guestMapStylesSource, /\bsheetTitleBlock:[\s\S]*minWidth:\s*0/);
    assert.match(sheetBlock, /backgroundColor:\s*colors\.surfaceTranslucent/);
    assert.match(sheetBlock, /shadowOpacity:\s*0/);
    assert.match(sheetBlock, /shadowRadius:\s*0/);
    assert.match(sheetBlock, /elevation:\s*0/);
    assert.doesNotMatch(sheetBlock, /shadow\.sheet/);
    assert.doesNotMatch(sheetBlock, /surfaceElevated/);
    assert.doesNotMatch(guestMapStylesSource, /\broutePreviewTitle:/);
    assert.match(guestMapStylesSource, /\broutePreview:[\s\S]*borderRadius:\s*radius\.pill/);
    assert.match(guestMapStylesSource, /\broutePreviewInline:[\s\S]*marginTop:\s*2/);
  });

  it("keeps the map-home top chrome action-only and low-clutter", () => {
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
    assert.doesNotMatch(guestMapSource, /accessibilityLabel="SafeRoute map"/);
    assert.doesNotMatch(guestMapSource, /styles\.brandRow/);
    assert.match(guestMapSource, /testID=\{uiTestIds\.guestMapPrimaryAction\}/);
    assert.match(guestMapSource, /authenticated \? styles\.signInButtonAuthenticated : null/);
    assert.match(guestMapSource, /authenticated \? styles\.signInButtonTextAuthenticated : null/);
    assert.doesNotMatch(guestMapSource, /modeBadgeLabel/);
    assert.doesNotMatch(guestMapSource, /styles\.modeBadge/);
    assert.doesNotMatch(guestMapSource, /styles\.eyebrow/);
    assert.doesNotMatch(guestMapSource, /styles\.topTitle/);
    assert.doesNotMatch(guestMapStylesSource, /\bbrandRow:/);
    assert.doesNotMatch(topBarBlock, /borderWidth|backgroundColor|shadow\.panel/);
    assert.match(topBarBlock, /justifyContent:\s*["']flex-end["']/);
    assert.match(signInButtonBlock, /backgroundColor:\s*colors\.surfaceGlass/);
    assert.match(signInButtonBlock, /borderRadius:\s*radius\.pill/);
    assert.match(signInButtonBlock, /shadowOpacity:\s*0/);
    assert.match(signInButtonBlock, /shadowRadius:\s*0/);
    assert.match(signInButtonBlock, /elevation:\s*0/);
    assert.doesNotMatch(signInButtonBlock, /shadow\.panel/);
    assert.doesNotMatch(guestMapStylesSource, /,\s*shadow,/);
    assert.match(guestMapStylesSource, /signInButtonAuthenticated:[\s\S]*colors\.appleBlueSoft/);
    assert.match(guestMapStylesSource, /signInButtonTextAuthenticated:[\s\S]*colors\.appleBlue/);
  });

  it("keeps map-home route inputs grouped, placeholder-led, and icon-free", () => {
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
      /inputStack:\s*\{([\s\S]*?)\n  \},\n  inputRow:/.exec(guestMapStylesSource)?.[1] || "";
    const inputRowBlock =
      /inputRow:\s*\{([\s\S]*?)\n  \},\n  inputRowDivider:/.exec(guestMapStylesSource)?.[1] || "";
    const inputRowDividerBlock =
      /inputRowDivider:\s*\{([\s\S]*?)\n  \},\n  input:/.exec(guestMapStylesSource)?.[1] || "";

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
    assert.match(guestMapSource, /styles\.inputRowDivider/);
    assert.doesNotMatch(guestMapSource, /Ionicons/);
    assert.doesNotMatch(guestMapSource, /radio-button-on|name="location"|icon=/);
    assert.match(inputStackBlock, /overflow:\s*['"]hidden['"]/);
    assert.match(inputStackBlock, /borderWidth:\s*0\.5/);
    assert.match(inputStackBlock, /borderColor:\s*colors\.glassBorder/);
    assert.match(inputStackBlock, /borderRadius:\s*radius\.lg/);
    assert.match(inputStackBlock, /backgroundColor:\s*colors\.surfaceGlass/);
    assert.doesNotMatch(inputStackBlock, /\bgap:/);
    assert.match(inputRowBlock, /minHeight:\s*controlSizes\.secondary/);
    assert.match(inputRowBlock, /paddingHorizontal:\s*spacing\.sm/);
    assert.doesNotMatch(inputRowBlock, /borderRadius:\s*radius\.pill/);
    assert.doesNotMatch(inputRowBlock, /backgroundColor:\s*colors\.surfaceGlass/);
    assert.doesNotMatch(inputRowBlock, /\bborderWidth/);
    assert.doesNotMatch(inputRowBlock, /\bgap:/);
    assert.doesNotMatch(inputRowBlock, /shadow\.panel/);
    assert.match(inputRowDividerBlock, /borderBottomWidth:\s*0\.5/);
    assert.match(inputRowDividerBlock, /borderBottomColor:\s*colors\.borderSoft/);
  });

  it("upgrades guest route previews with road geometry without adding sheet chrome", () => {
    const guestMapSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );

    assert.match(guestMapSource, /fetchGuestRoadRoutePreview/);
    assert.match(guestMapSource, /roadRoutePreviewFetcher = fetchGuestRoadRoutePreview/);
    assert.match(guestMapSource, /setRoutePlan\(localRoutePlan\)/);
    assert.match(guestMapSource, /upgradeGuestRouteWithRoadPreview\(localRoutePlan\)/);
    assert.match(guestMapSource, /new AbortController\(\)/);
    assert.match(guestMapSource, /GUEST_ROUTE_PROVIDER_UI_TIMEOUT_MS\s*=\s*3500/);
    assert.match(guestMapSource, /timeoutMs:\s*GUEST_ROUTE_PROVIDER_UI_TIMEOUT_MS/);
    assert.match(guestMapSource, /roadSnappedCoordinates:\s*roadPreview\.coordinates/);
    assert.match(guestMapSource, /routeDistanceMeters:\s*roadPreview\.distanceMeters/);
    assert.match(guestMapSource, /routeDurationSeconds:\s*roadPreview\.durationSeconds/);
    assert.doesNotMatch(guestMapSource, /roadPreviewLoading|roadPreviewStatus|ActivityIndicator/);
  });

  it("keeps route endpoint markers compact, geometric, and text-free", () => {
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
    assert.match(guestMapSource, /description=\{checkpoint\.kind === 'origin' \? 'Route start' : 'Destination'\}/);
    assert.doesNotMatch(guestMapSource, /checkpoint\.label/);
    assert.match(guestMapStylesSource, /\bmarker:[\s\S]*width:\s*28[\s\S]*borderWidth:\s*3/);
    assert.match(guestMapStylesSource, /\bmarkerDestination:[\s\S]*borderRadius:\s*radius\.pill/);
    assert.match(guestMarkerBlock, /shadowOpacity:\s*0/);
    assert.match(guestMarkerBlock, /shadowRadius:\s*0/);
    assert.match(guestMarkerBlock, /elevation:\s*0/);
    assert.doesNotMatch(guestMarkerBlock, /shadow\.panel/);
    assert.doesNotMatch(guestMapStylesSource, /\bmarkerLabel:/);

    assert.match(liveMarkerSource, /checkpointMarkerCore/);
    assert.match(liveMarkerSource, /description=\{markerRole\}/);
    assert.match(liveMarkerSource, /checkpointMarkerOrigin:[\s\S]*colors\.appleBlue/);
    assert.match(liveMarkerSource, /checkpointMarkerWaypoint:[\s\S]*colors\.safe/);
    assert.match(liveMarkerSource, /checkpointMarkerDestination:[\s\S]*borderRadius:\s*radius\.pill/);
    assert.doesNotMatch(liveMarkerSource, /checkpoint\.label/);
    assert.doesNotMatch(liveMarkerSource, /checkpointMarkerText/);
  });

  it("keeps the login header logo-first without duplicate brand text", () => {
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
    const logoSource = readFileSync(
      join(process.cwd(), "src/brand/SafeRouteLogo.tsx"),
      "utf8",
    );
    const logoFrameBlock =
      /logoFrame:\s*\{([\s\S]*?)\n  \},/.exec(logoSource)?.[1] || "";

    assert.match(loginSource, /<SafeRouteLogo[\s\S]*accessibilityLabel="SafeRoute Mobile"/);
    assert.match(loginSource, /imageSize=\{loginLayout\.compact \? 40 : 50\}/);
    assert.match(loginSource, /size=\{loginLayout\.compact \? 52 : 64\}/);
    assert.match(logoSource, /resizeMode="contain"/);
    assert.match(logoSource, /height:\s*resolvedImageSize/);
    assert.match(logoSource, /width:\s*resolvedImageSize/);
    assert.match(logoSource, /borderRadius:\s*Math\.max\(radius\.sm,\s*size \/ 2\)/);
    assert.match(logoFrameBlock, /backgroundColor:\s*colors\.ink/);
    assert.match(logoFrameBlock, /shadowOpacity:\s*0/);
    assert.match(logoFrameBlock, /shadowRadius:\s*0/);
    assert.match(logoFrameBlock, /elevation:\s*0/);
    assert.doesNotMatch(logoSource, /shadow\.panel/);
    assert.doesNotMatch(logoSource, /,\s*shadow,/);
    assert.doesNotMatch(loginSource, /\belevated\b/);
    assert.match(loginSource, /createLoginHeaderState/);
    assert.match(loginSource, /loginHeaderState\.titleAccessibilityLabel/);
    assert.match(loginSource, /loginHeaderState\.subtitle \? \(/);
    assert.match(loginHeaderStateSource, /subtitle:\s*compact \? null : SIGN_IN_SUBTITLE/);
    assert.match(loginHeaderStateSource, /title:\s*["']Enter code["']/);
    assert.match(loginHeaderStateSource, /Sync saved routes to the map\./);
    assert.doesNotMatch(loginSource, /Map first\. Save after sign-in\./);
    assert.doesNotMatch(loginSource, /Save routes and sync live map context/);
    assert.doesNotMatch(loginSource, /<Text style=\{styles\.eyebrow\}>SafeRoute Mobile<\/Text>/);
    assert.doesNotMatch(loginSource, /styles\.eyebrow/);
    assert.doesNotMatch(loginStylesSource, /\beyebrow:/);
  });

  it("keeps the login form placeholder-led without redundant field-label chrome", () => {
    const loginSource = readFileSync(
      join(process.cwd(), "src/features/auth/LoginScreen.tsx"),
      "utf8",
    );
    const loginStylesSource = readFileSync(
      join(process.cwd(), "src/features/auth/LoginScreen.styles.ts"),
      "utf8",
    );
    const formCardBlock =
      /formCard:\s*\{([\s\S]*?)\n  \},\n  formCardCompact:/.exec(
        loginStylesSource,
      )?.[1] || "";
    const errorBoxBlock =
      /errorBox:\s*\{([\s\S]*?)\n  \},\n  errorText:/.exec(
        loginStylesSource,
      )?.[1] || "";
    const errorTextBlock =
      /errorText:\s*\{([\s\S]*?)\n  \},\n  noticeBox:/.exec(
        loginStylesSource,
      )?.[1] || "";
    const noticeBoxBlock =
      /noticeBox:\s*\{([\s\S]*?)\n  \},\n  noticeText:/.exec(
        loginStylesSource,
      )?.[1] || "";
    const noticeTextBlock =
      /noticeText:\s*\{([\s\S]*?)\n  \},\n  challengeHintBox:/.exec(
        loginStylesSource,
      )?.[1] || "";
    const challengeHintBoxBlock =
      /challengeHintBox:\s*\{([\s\S]*?)\n  \},\n  challengeHintBoxDanger:/.exec(
        loginStylesSource,
      )?.[1] || "";
    const challengeHintTextBlock =
      /challengeHintText:\s*\{([\s\S]*?)\n  \},\n  challengeHintTextDanger:/.exec(
        loginStylesSource,
      )?.[1] || "";

    assert.match(loginSource, /placeholder="Email"/);
    assert.match(loginSource, /accessibilityLabel="LunarChain email"/);
    assert.match(loginSource, /accessibilityLabel="LunarChain password"/);
    assert.match(loginSource, /accessibilityLabel="LunarChain login code"/);
    assert.match(loginSource, /styles\.formCardCompact/);
    assert.match(loginSource, /styles\.passwordToggle/);
    assert.match(loginSource, /passwordVisible \? 'Hide' : 'Show'/);
    assert.doesNotMatch(loginSource, /Ionicons/);
    assert.doesNotMatch(loginSource, /name="mail"|name="lock-closed"|name="keypad"|name="alert-circle"|name="time"|name="timer"|eye-off|name="eye"/);
    assert.doesNotMatch(loginSource, /<FieldLabel/);
    assert.doesNotMatch(loginSource, /styles\.fieldLabel/);
    assert.doesNotMatch(loginStylesSource, /\bfieldLabel:/);
    assert.match(formCardBlock, /backgroundColor:\s*colors\.surfaceTranslucent/);
    assert.match(formCardBlock, /shadowOpacity:\s*0/);
    assert.match(formCardBlock, /elevation:\s*0/);
    assert.doesNotMatch(formCardBlock, /shadow\.panel/);
    assert.match(loginStylesSource, /formCardCompact:\s*\{[\s\S]*padding:\s*spacing\.md/);
    assert.match(loginStylesSource, /passwordToggle:\s*\{[\s\S]*borderRadius:\s*radius\.pill/);
    assert.match(loginStylesSource, /passwordToggle:\s*\{[\s\S]*backgroundColor:\s*colors\.surfaceGlass/);
    assert.match(loginStylesSource, /passwordToggleText:\s*\{[\s\S]*color:\s*colors\.appleBlue/);
    for (const statusBlock of [
      errorBoxBlock,
      noticeBoxBlock,
      challengeHintBoxBlock,
    ]) {
      assert.match(statusBlock, /alignSelf:\s*['"]center['"]/);
      assert.match(statusBlock, /maxWidth:\s*['"]100%['"]/);
      assert.match(statusBlock, /minHeight:\s*controlSizes\.compact/);
      assert.match(statusBlock, /alignItems:\s*['"]center['"]/);
      assert.match(statusBlock, /paddingVertical:\s*spacing\.xs/);
      assert.match(statusBlock, /borderRadius:\s*radius\.pill/);
      assert.match(statusBlock, /borderWidth:\s*0\.5/);
    }
    assert.match(errorBoxBlock, /backgroundColor:\s*colors\.dangerSoft/);
    assert.match(noticeBoxBlock, /backgroundColor:\s*colors\.amberSoft/);
    assert.match(challengeHintBoxBlock, /backgroundColor:\s*colors\.surfaceGlass/);
    assert.match(challengeHintBoxBlock, /borderColor:\s*colors\.borderSoft/);
    assert.match(loginStylesSource, /challengeHintBoxDanger:\s*\{[\s\S]*backgroundColor:\s*colors\.dangerSoft/);
    for (const statusTextBlock of [
      errorTextBlock,
      noticeTextBlock,
      challengeHintTextBlock,
    ]) {
      assert.match(statusTextBlock, /lineHeight:\s*18/);
      assert.match(statusTextBlock, /textAlign:\s*['"]center['"]/);
    }
  });

  it("keeps auth secondary actions quiet and text-led", () => {
    const loginSource = readFileSync(
      join(process.cwd(), "src/features/auth/LoginScreen.tsx"),
      "utf8",
    );
    const loginStylesSource = readFileSync(
      join(process.cwd(), "src/features/auth/LoginScreen.styles.ts"),
      "utf8",
    );
    const loginFormStateSource = readFileSync(
      join(process.cwd(), "src/features/auth/loginFormState.ts"),
      "utf8",
    );
    const secondaryButtonBlock =
      /secondaryButton:\s*\{([\s\S]*?)\n  \},\n  secondaryButtonPressed:/.exec(
        loginStylesSource,
      )?.[1] || "";
    const secondaryTextBlock =
      /secondaryButtonText:\s*\{([\s\S]*?)\n  \}/.exec(loginStylesSource)?.[1] || "";

    assert.match(loginSource, /styles\.secondaryButtonPressed/);
    assert.match(secondaryButtonBlock, /alignSelf:\s*["']center["']/);
    assert.match(secondaryButtonBlock, /backgroundColor:\s*["']transparent["']/);
    assert.doesNotMatch(secondaryButtonBlock, /borderWidth/);
    assert.doesNotMatch(secondaryButtonBlock, /borderColor/);
    assert.match(loginStylesSource, /secondaryButtonPressed:\s*\{[\s\S]*colors\.appleBlueSoft/);
    assert.match(secondaryTextBlock, /color:\s*colors\.appleBlue/);
    assert.match(loginSource, /getLoginMapReturnActionState/);
    assert.match(loginSource, /mapReturnAction\.text/);
    assert.match(loginFormStateSource, /text:\s*["']Edit sign-in["']/);
    assert.match(loginFormStateSource, /text:\s*["']Request code["']/);
    assert.match(loginFormStateSource, /text:\s*["']Map["']/);
    assert.doesNotMatch(loginFormStateSource, /Back to credentials/);
    assert.doesNotMatch(loginFormStateSource, /Request new code/);
    assert.doesNotMatch(loginSource, /Back to map/);
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
      /routeListButtonPressed:\s*\{([\s\S]*?)\n  \},\n  routeListButtonCompactNavigation/.exec(
        liveHeaderStylesSource,
      )?.[1] || "";
    const minimalReturnBlock =
      /routeListButtonMinimalActiveNavigation:\s*\{([\s\S]*?)\n  \},\n  routeListButtonText/.exec(
        liveHeaderStylesSource,
      )?.[1] || "";
    const minimalHeaderBlock =
      /headerPanelMinimalActiveNavigation:\s*\{([\s\S]*?)\n  \},\n  compactNavigationRow:/.exec(
        liveHeaderStylesSource,
      )?.[1] || "";
    const minimalStatusBlock =
      /statusPillMinimalActiveNavigation:\s*\{([\s\S]*?)\n  \},\n  statusPillLive/.exec(
        liveHeaderStylesSource,
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
    assert.match(liveHeaderSource, /minimal \? null : \(/);
    assert.match(liveHeaderSource, /style=\{\(\{ pressed \}\) => \[/);
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
    assert.doesNotMatch(routeListButtonBlock, /surfaceElevated/);
    assert.match(routeListButtonPressedBlock, /backgroundColor:\s*colors\.appleBlueSoft/);
    assert.match(minimalHeaderBlock, /borderRadius:\s*radius\.pill/);
    assert.match(minimalHeaderBlock, /shadowOpacity:\s*0/);
    assert.match(minimalHeaderBlock, /shadowRadius:\s*0/);
    assert.match(minimalHeaderBlock, /elevation:\s*0/);
    assert.match(minimalReturnBlock, /borderWidth:\s*0/);
    assert.match(minimalReturnBlock, /backgroundColor:\s*["']transparent["']/);
    assert.match(minimalStatusBlock, /paddingHorizontal:\s*spacing\.xs/);
    assert.match(minimalStatusBlock, /backgroundColor:\s*["']transparent["']/);
    assert.match(noticeBlock, /alignSelf:\s*"flex-start"/);
    assert.match(noticeBlock, /borderRadius:\s*radius\.pill/);
    assert.match(noticeBlock, /backgroundColor:\s*colors\.amberSoft/);
  });

  it("keeps live-map endpoint context in a single text-led capsule", () => {
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
    const guidanceStylesSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapGuidanceCard.styles.ts"),
      "utf8",
    );
    const guidanceCardBlock =
      /guidanceCard:\s*\{([\s\S]*?)\n  \},\n  guidanceCardCompact:/.exec(
        guidanceStylesSource,
      )?.[1] || "";

    assert.match(guidanceSource, /accessibilityLabel=\{presentation\.accessibilityLabel\}/);
    assert.match(guidanceSource, /presentation\.instructionLabel/);
    assert.match(guidanceSource, /presentation\.distanceLabel/);
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
    const cardBlock =
      /card:\s*\{([\s\S]*?)\n  \},\n  cardPressed:/.exec(
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
    assert.match(routeCardStylesSource, /\brouteTitleRow:/);
    assert.match(routeCardStylesSource, /routeTitleRow:[\s\S]*alignItems:\s*"flex-start"/);
    assert.match(routeCardStylesSource, /\brouteEndpoint:/);
    assert.match(routeCardStylesSource, /\brouteSummary:/);
    assert.match(routeCardStylesSource, /\bopenButton:[\s\S]*minHeight:\s*controlSizes\.compact/);
    assert.match(routeCardPresentationSource, /ROUTE_CARD_TITLE_MAX_LENGTH\s*=\s*72/);
    assert.match(routeCardPresentationSource, /ROUTE_CARD_ENDPOINT_MAX_LENGTH\s*=\s*80/);
    assert.match(routeCardPresentationSource, /ROUTE_CARD_META_MAX_LENGTH\s*=\s*64/);
    assert.match(routeCardPresentationSource, /createCompactRouteCardLabel/);
  });

  it("keeps the saved-route picker header action-light and map-first", () => {
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
      /signOutButtonText:\s*\{([\s\S]*?)\n  \},\n  mapReturnButton:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const mapReturnButtonBlock =
      /mapReturnButton:\s*\{([\s\S]*?)\n  \},\n  mapReturnButtonPressed:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const mapReturnButtonTextBlock =
      /mapReturnButtonText:\s*\{([\s\S]*?)\n  \},\n  noticeBox:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const noticeBoxBlock =
      /noticeBox:\s*\{([\s\S]*?)\n  \},\n  noticeText:/.exec(
        routeListStylesSource,
      )?.[1] || "";
    const noticeTextBlock =
      /noticeText:\s*\{([\s\S]*?)\n  \},\n  clientTabs:/.exec(
        routeListStylesSource,
      )?.[1] || "";

    assert.match(routeListHeaderSource, /styles\.headerActions/);
    assert.match(routeListHeaderSource, /styles\.signOutButtonPressed/);
    assert.match(routeListHeaderSource, /accessibilityRole="alert" style=\{styles\.noticeBox\}/);
    assert.doesNotMatch(routeListHeaderSource, /SafeRouteLogo|Ionicons/);
    assert.match(signOutButtonBlock, /minHeight:\s*controlSizes\.compact/);
    assert.match(signOutButtonBlock, /backgroundColor:\s*"transparent"/);
    assert.doesNotMatch(signOutButtonBlock, /\bborderWidth/);
    assert.match(signOutButtonPressedBlock, /backgroundColor:\s*colors\.appleBlueSoft/);
    assert.match(signOutButtonTextBlock, /color:\s*colors\.muted/);
    assert.match(mapReturnButtonBlock, /minHeight:\s*controlSizes\.compact/);
    assert.match(mapReturnButtonBlock, /paddingHorizontal:\s*spacing\.sm/);
    assert.match(mapReturnButtonBlock, /borderWidth:\s*0/);
    assert.match(mapReturnButtonBlock, /backgroundColor:\s*colors\.appleBlueSoft/);
    assert.match(mapReturnButtonTextBlock, /color:\s*colors\.appleBlue/);
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
    const bottomSheetBlock =
      /bottomSheet:\s*\{([\s\S]*?)\n  \},\n  bottomSheetCompact:/.exec(
        routeSheetStylesSource,
      )?.[1] || "";
    const demoButtonBlock =
      /demoButton:\s*\{([\s\S]*?)\n  \},\n  demoButtonInline:/.exec(
        routeSheetStylesSource,
      )?.[1] || "";
    const demoButtonPressedBlock =
      /demoButtonPressed:\s*\{([\s\S]*?)\n  \},\n  demoButtonText:/.exec(
        routeSheetStylesSource,
      )?.[1] || "";
    const demoButtonTextBlock =
      /demoButtonText:\s*\{([\s\S]*?)\n  \},\n  demoButtonTextActive:/.exec(
        routeSheetStylesSource,
      )?.[1] || "";

    assert.match(routeSheetSource, /createRouteSummaryDetail/);
    assert.match(routeSheetSource, /createRouteSummaryHeadline/);
    assert.match(routeSheetSource, /createRouteSummaryRemainingMetric/);
    assert.match(routeSheetSource, /routeDescription:\s*route\.description/);
    assert.match(routeSheetSource, /styles\.routeDetailLine/);
    assert.match(routeSheetSource, /styles\.remainingMetricLine/);
    assert.match(routeSheetSource, /uiTestIds\.liveMapRemainingMetrics/);
    assert.match(routeSheetSource, /shouldInlineRouteSummaryDemoAction/);
    assert.match(routeSheetSource, /inlineDemoAction/);
    assert.match(routeSheetSource, /styles\.demoButtonInline/);
    assert.match(routeSheetSource, /style=\{\(\{ pressed \}\) => \[/);
    assert.match(routeSheetSource, /pressed \? styles\.demoButtonPressed : null/);
    assert.match(routeSheetSource, /accessibilityLabel=\{headlinePresentation\.accessibilityLabel\}/);
    assert.match(routeSheetSource, /\{headlinePresentation\.text\}/);
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
    assert.match(routeSheetStylesSource, /\bdemoButtonInline:\s*\{[\s\S]*marginTop:\s*0/);
    assert.match(demoButtonBlock, /minHeight:\s*controlSizes\.compact/);
    assert.match(demoButtonBlock, /borderRadius:\s*radius\.pill/);
    assert.match(demoButtonBlock, /backgroundColor:\s*"transparent"/);
    assert.doesNotMatch(demoButtonBlock, /\bborderWidth/);
    assert.match(demoButtonPressedBlock, /backgroundColor:\s*colors\.appleBlueSoft/);
    assert.match(demoButtonTextBlock, /color:\s*colors\.appleBlue/);
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
    assert.match(routeSummarySource, /label:\s*"Start"/);
    assert.match(routeSummarySource, /label:\s*"Pause"/);
    assert.match(routeSummarySource, /label:\s*"Resume"/);
    assert.match(routeSummarySource, /createRouteSummaryHeadline/);
    assert.match(routeSummarySource, /createRouteSummaryHeadlineAccessibilityLabel/);
    assert.match(routeSummarySource, /shouldInlineRouteSummaryDemoAction/);
    assert.match(routeSummarySource, /return "Guidance"/);
    assert.match(routeSummarySource, /return "Preview"/);
    assert.doesNotMatch(routeSummarySource, /Start route|Pause route|Resume route/);
    assert.doesNotMatch(routeSummarySource, /Following saved route|Preview route|Route complete/);
  });

  it("keeps live-map safety context in one compact badge label", () => {
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

    assert.match(routeSheetSource, /<SafetyBadge/);
    assert.match(routeSheetSource, /badge\.text/);
    assert.match(routeSummarySource, /ROUTE_SUMMARY_SAFETY_BADGE_MAX_LENGTH/);
    assert.match(routeSummarySource, /createCompactInlineLabel/);
    assert.doesNotMatch(routeSheetSource, /badge\.label/);
    assert.doesNotMatch(routeSheetSource, /badge\.value/);
    assert.match(routeSheetStylesSource, /\bsafetyBadge:/);
    assert.match(routeSheetStylesSource, /\bsafetyBadgeText:/);
    assert.doesNotMatch(routeSheetStylesSource, /\bscoreLabel:/);
    assert.doesNotMatch(routeSheetStylesSource, /\bscoreValue:/);
    assert.doesNotMatch(routeSummarySource, /label:\s*"risk"/);
  });

  it("keeps live risk alert titles presentation-normalized", () => {
    const riskCardSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskCard.tsx"),
      "utf8",
    );

    assert.match(riskCardSource, /createLiveRouteRiskAlertPresentation/);
    assert.match(riskCardSource, /presentation\.zoneTitle/);
    assert.doesNotMatch(riskCardSource, /\{alert\.zone\.title\}/);
  });

  it("keeps live-map markers geometric instead of decorative-icon heavy", () => {
    const markerSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapMarkers.tsx"),
      "utf8",
    );
    const checkpointMarkerBlock =
      /checkpointMarker:\s*\{([\s\S]*?)\n  \},\n  checkpointMarkerOrigin:/.exec(
        markerSource,
      )?.[1] || "";
    const riskMarkerBlock =
      /riskMarker:\s*\{([\s\S]*?)\n  \},\n  riskMarkerCore:/.exec(
        markerSource,
      )?.[1] || "";
    const vehicleMarkerBlock =
      /vehicleMarker:\s*\{([\s\S]*?)\n  \},\n  vehicleMarkerHeading:/.exec(
        markerSource,
      )?.[1] || "";

    assert.doesNotMatch(markerSource, /Ionicons/);
    assert.doesNotMatch(markerSource, /name="navigate"|name=\{icon\}|warning|business/);
    assert.doesNotMatch(markerSource, /,\s*shadow,/);
    assert.doesNotMatch(markerSource, /shadow\.panel/);
    assert.match(markerSource, /\briskMarkerCore:/);
    assert.match(markerSource, /\bvehicleMarkerHeading:/);
    assert.match(markerSource, /borderRadius:\s*radius\.pill/);
    for (const markerBlock of [
      checkpointMarkerBlock,
      riskMarkerBlock,
      vehicleMarkerBlock,
    ]) {
      assert.match(markerBlock, /shadowOpacity:\s*0/);
      assert.match(markerBlock, /shadowRadius:\s*0/);
      assert.match(markerBlock, /elevation:\s*0/);
    }
  });

  it("keeps live-map controls as text-led rounded capsules", () => {
    const controlsSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapControls.tsx"),
      "utf8",
    );
    const overlayStylesSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapOverlay.styles.ts"),
      "utf8",
    );
    const uiStateSource = readFileSync(
      join(process.cwd(), "src/features/live-map/liveMapUiState.ts"),
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

    assert.match(controlsSource, /mapControlDisplayLabel/);
    assert.match(controlsSource, /compactControls/);
    assert.match(controlsSource, /compact=\{compactControls\}/);
    assert.match(controlsSource, /styles\.controlButtonText/);
    assert.match(controlsSource, /\{displayLabel\}/);
    assert.doesNotMatch(controlsSource, /Ionicons/);
    assert.doesNotMatch(controlsSource, /icon=/);
    assert.doesNotMatch(controlsSource, /name="locate"|name="map"|name="navigate"|name="warning"/);
    assert.match(controlButtonBlock, /minHeight:\s*44/);
    assert.match(controlButtonBlock, /borderRadius:\s*radius\.pill/);
    assert.match(controlButtonBlock, /shadowOpacity:\s*0/);
    assert.match(controlButtonBlock, /elevation:\s*0/);
    assert.doesNotMatch(controlButtonBlock, /shadow\.panel/);
    assert.match(overlayStylesSource, /controlButtonCompact:/);
    assert.match(compactButtonBlock, /minHeight:\s*44/);
    assert.match(compactButtonBlock, /shadowOpacity:\s*0/);
    assert.match(compactButtonBlock, /elevation:\s*0/);
    assert.doesNotMatch(compactControlsBlock, /\bleft:/);
    assert.match(overlayStylesSource, /controlButtonText:/);
    assert.match(uiStateSource, /case 'fit':[\s\S]*return 'Route'/);
    assert.match(uiStateSource, /case 'intelligence':[\s\S]*return 'Risk'/);
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
    const clientTabBlock =
      /clientTab:\s*\{([\s\S]*?)\n  \},\n  clientTabActive:/.exec(
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

    assert.match(routeListStateSource, /ROUTE_SEARCH_MINIMUM_COUNT = 4/);
    assert.match(routeListStateSource, /ROUTE_LIST_QUERY_DISPLAY_MAX_LENGTH = 32/);
    assert.match(routeListStateSource, /ROUTE_LIST_CLIENT_DISPLAY_MAX_LENGTH = 28/);
    assert.match(routeListStateSource, /createCompactRouteListLabel/);
    assert.match(routeListStateSource, /label: "All"/);
    assert.doesNotMatch(routeListStateSource, /label: "All clients"/);
    assert.doesNotMatch(routeListStateSource, /totalRouteCount > 1/);
    assert.match(clientTabBlock, /minHeight:\s*controlSizes\.compact/);
    assert.match(clientTabBlock, /borderRadius:\s*radius\.pill/);
    assert.match(clientTabBlock, /backgroundColor:\s*colors\.surfaceGlass/);
    assert.doesNotMatch(clientTabBlock, /surfaceElevated/);
    assert.match(routeListFiltersSource, /accessibilityLabel="Search saved routes"/);
    assert.match(routeListFiltersSource, /placeholder="Find route"/);
    assert.doesNotMatch(routeListFiltersSource, /Ionicons/);
    assert.doesNotMatch(routeListFiltersSource, /name="search"/);
    assert.match(searchBoxBlock, /minHeight:\s*controlSizes\.secondary/);
    assert.match(searchBoxBlock, /borderRadius:\s*radius\.pill/);
    assert.match(searchBoxBlock, /backgroundColor:\s*colors\.surfaceGlass/);
    assert.doesNotMatch(searchBoxBlock, /shadow\.panel/);
    assert.match(routeListFiltersSource, /pressed \? styles\.clearSearchButtonPressed/);
    assert.match(clearSearchButtonBlock, /backgroundColor:\s*"transparent"/);
    assert.match(routeListStylesSource, /clearSearchButtonPressed:[\s\S]*backgroundColor:\s*colors\.appleBlueSoft/);
    assert.match(routeListStylesSource, /clearSearchText:[\s\S]*color:\s*colors\.appleBlue/);
  });

  it("keeps the route-picker header title-only with map return context", () => {
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

    assert.match(routeListHeaderSource, /uiTestIds\.routeListMapReturn/);
    assert.match(routeListHeaderSource, /uiTestIds\.routeListSignOut/);
    assert.match(routeListHeaderSource, /styles\.headerActions/);
    assert.match(routeListHeaderSource, /mapReturnState\.label/);
    assert.match(routeListHeaderSource, /signOutState\.label/);
    assert.match(routeListHeaderSource, /styles\.signOutButtonText/);
    assert.doesNotMatch(routeListHeaderSource, /SafeRouteLogo/);
    assert.doesNotMatch(routeListHeaderSource, /styles\.brandCluster/);
    assert.doesNotMatch(routeListHeaderSource, /styles\.brandCopy/);
    assert.doesNotMatch(routeListHeaderSource, /Ionicons/);
    assert.doesNotMatch(routeListHeaderSource, /log-out-outline/);
    assert.doesNotMatch(routeListHeaderSource, /name="map"/);
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
    assert.doesNotMatch(routeListStylesSource, /textTransform:\s*["']uppercase["']/);
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
      /emptyState:\s*\{([\s\S]*?)\n  \},\n  emptyTitle:/.exec(
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
    assert.match(routeListScreenSource, /accessibilityLabel=\{emptyState\.accessibilityLabel\}/);
    assert.match(
      routeListScreenSource,
      /style=\{\(\{ pressed \}\) => \[\s*styles\.retryButton,\s*pressed \? styles\.retryButtonPressed : null,/,
    );
    assert.match(routeListScreenSource, /styles\.errorTitle/);
    assert.match(routeListScreenSource, /styles\.emptyTitle/);
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
    assert.match(routeListErrorsSource, /createCompactRouteErrorName/);
    assert.match(
      routeListErrorsSource,
      /message:\s*`Could not load \$\{compactRouteName\}\. \$\{reason\}`/,
    );
    assert.match(
      routeListErrorsSource,
      /retryAccessibilityLabel:\s*`Retry loading \$\{safeRouteName\}`/,
    );
    assert.match(routeListStateSource, /title:\s*"No matches"/);
    assert.match(routeListStateSource, /No saved routes match/);
    assert.match(routeListStateSource, /copy:\s*"Save a plan, then open it here\."/);
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
      /loadingCard:\s*\{([\s\S]*?)\n  \},\n  loadingTitle:/.exec(
        routeListStylesSource,
      )?.[1] || "";

    assert.match(routeListScreenSource, /accessibilityRole="progressbar"/);
    assert.match(routeListScreenSource, /styles\.loadingCard/);
    assert.match(routeListScreenSource, /loadingState\.title/);
    assert.doesNotMatch(routeListScreenSource, /loadingState\.copy/);
    assert.doesNotMatch(routeListScreenSource, /styles\.loadingCopy/);
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
