import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("SafeRoute design handoff", () => {
  it("keeps the four-tab iPhone chrome and semantic palette", () => {
    const theme = source("src/theme.ts");
    const tabBar = source("src/components/AppTabBar.tsx");
    const app = source("App.tsx");

    assert.match(theme, /appleBlue:\s*'#0a84ff'/);
    assert.match(theme, /danger:\s*'#e5484d'/);
    assert.match(theme, /amber:\s*'#f76b15'/);
    assert.match(theme, /tabBarHeight:\s*86/);
    for (const label of ["Map", "Routes", "Convoys", "Calendar"]) {
      assert.match(tabBar, new RegExp(`label: "${label}"`));
    }
    assert.match(app, /!operationsDetailOpen/);
    assert.match(app, /mapPlannerOpen/);
  });

  it("opens on a collapsed Cape Town map with dark and satellite layers", () => {
    const planner = source("src/features/guest-map/guestRoutePlanner.ts");
    const screen = source("src/features/guest-map/GuestMapScreen.tsx");
    const styles = source("src/features/guest-map/GuestMapScreen.styles.ts");
    const transport = source("src/features/api/mapTransportState.ts");

    assert.match(planner, /latitude:\s*-33\.945/);
    assert.match(planner, /longitude:\s*18\.55/);
    assert.match(screen, /new Animated\.Value\(1\)/);
    assert.match(screen, /useState\(true\)/);
    assert.match(screen, /uiTestIds\.guestMapLayerToggle/);
    assert.match(screen, /layer:\s*mapLayer/);
    assert.match(styles, /bottom:\s*chrome\.screenBottomInset/);
    assert.match(transport, /if \(layer === "satellite"\)/);
    assert.match(transport, /if \(!online\)[\s\S]*return "none"/);
  });

  it("provides assigned-route cards and a complete route detail sheet", () => {
    const listState = source("src/features/routes/routeListUiState.ts");
    const card = source("src/features/routes/RouteCard.tsx");
    const detail = source("src/features/routes/RouteDetailSheet.tsx");

    assert.match(listState, /title:\s*"Assigned routes"/);
    assert.match(listState, /subtitle:\s*"Tap Map to preview it live"/);
    assert.match(card, /testID=\{`\$\{presentation\.testID\}-map`\}/);
    assert.match(detail, /<Modal/);
    assert.match(detail, /label="From"/);
    assert.match(detail, /label="To"/);
    assert.match(detail, /label="risks"/);
    assert.match(detail, /safe-route-detail-done/);
  });

  it("renders calendar groups, convoy vehicles, and both detail-sheet types", () => {
    const screen = source("src/features/operations/OperationsScreen.tsx");
    const styles = source("src/features/operations/OperationsScreen.styles.ts");
    const state = source("src/features/operations/operationsUiState.ts");

    assert.match(screen, /createCalendarGroups/);
    assert.match(screen, /function OperationsCalendarDetail/);
    assert.match(screen, /function OperationsVehicleCard/);
    assert.match(screen, /function OperationsVehicleDetail/);
    assert.match(screen, /uiTestIds\.operationsVehicleDetail/);
    assert.match(state, /export type OperationsConvoyVehicle/);
    assert.match(state, /vehicles:\s*convoyVehicles/);
    assert.doesNotMatch(styles, /convoyGroupRail:/);
    assert.match(styles, /vehicleCard:[\s\S]*borderRadius:\s*16/);
    assert.match(styles, /vehicleSpecGrid:/);
  });

  it("uses the handoff route casing, risk callout, and floating summary", () => {
    const mapTheme = source("src/features/maps/safeRouteMapTheme.ts");
    const callout = source("src/features/live-map/LiveMapRiskDetailCallout.tsx");
    const summary = source("src/features/live-map/LiveMapRouteSummarySheet.tsx");
    const summaryStyles = source("src/features/live-map/LiveMapRouteSummarySheet.styles.ts");

    assert.match(mapTheme, /SAFE_ROUTE_DARK_ROUTE_CASING\s*=\s*"#ffffff"/);
    assert.match(mapTheme, /SAFE_ROUTE_ROUTE_CASING_WIDTH\s*=\s*9/);
    assert.match(mapTheme, /SAFE_ROUTE_ROUTE_CORE_WIDTH\s*=\s*5/);
    assert.match(callout, /createSeverityChipLabel/);
    assert.match(callout, /createRiskAreaChipLabel/);
    assert.match(summary, /function RouteEndpoints/);
    assert.match(summary, /function Metric/);
    assert.match(summary, /uiTestIds\.liveMapPrimaryAction/);
    assert.match(summaryStyles, /bottomSheet:[\s\S]*right:\s*12/);
    assert.match(summaryStyles, /bottomSheet:[\s\S]*shadowOpacity:\s*0\.16/);
  });
});
