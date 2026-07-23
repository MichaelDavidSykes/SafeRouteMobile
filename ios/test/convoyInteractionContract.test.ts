import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("convoy interaction contract", () => {
  const screen = readFileSync(
    join(process.cwd(), "src/features/operations/OperationsScreen.tsx"),
    "utf8",
  );
  const styles = readFileSync(
    join(process.cwd(), "src/features/operations/OperationsScreen.styles.ts"),
    "utf8",
  );

  it("reports stable detail visibility without false-true cleanup flicker", () => {
    assert.match(
      screen,
      /const detailVisible = Boolean\([\s\S]*selectedVehicleContext[\s\S]*\);/,
    );
    assert.match(
      screen,
      /useEffect\(\(\) => \{\s*onDetailVisibilityChange\?\.\(detailVisible\);\s*\}, \[detailVisible, onDetailVisibilityChange\]\);/,
    );
    assert.match(
      screen,
      /useEffect\(\s*\(\) => \(\) => onDetailVisibilityChange\?\.\(false\),\s*\[onDetailVisibilityChange\],\s*\);/,
    );
  });

  it("opens vehicle details without mutating the parent convoy return context", () => {
    const vehiclePress =
      /onVehiclePress=\{\(vehicleId\) => \{[\s\S]*?\n\s*\}\}/.exec(screen)?.[0] || "";

    assert.match(vehiclePress, /setSelectedConvoyId\(null\)/);
    assert.match(vehiclePress, /setSelectedVehicle\(\{ convoyId: row\.id, vehicleId \}\)/);
    assert.doesNotMatch(vehiclePress, /onConvoySelectionChange/);
  });

  it("does not reload Operations when a parent detail callback changes identity", () => {
    assert.match(screen, /const onSessionExpiredRef = useRef\(onSessionExpired\)/);
    assert.match(
      screen,
      /const onWorkspaceUnavailableRef = useRef\(onWorkspaceUnavailable\)/,
    );
    assert.match(
      screen,
      /onWorkspaceUnavailableRef\.current\(requestWorkspaceId\)/,
    );
    assert.match(screen, /onSessionExpiredRef\.current\(error\.message\)/);

    const loadOperations =
      /const loadOperations = useCallback\([\s\S]*?\n\s*\]\n\s*\);/.exec(screen)?.[0] || "";
    assert.doesNotMatch(loadOperations, /\n\s*onSessionExpired,/);
    assert.doesNotMatch(loadOperations, /\n\s*onWorkspaceUnavailable,/);
  });

  it("clears a selected vehicle when workspace ownership changes", () => {
    const workspaceChange =
      /const previousSelectedWorkspaceIdRef[\s\S]*?\}, \[selectedWorkspaceId\]\);/.exec(screen)?.[0] || "";

    assert.match(workspaceChange, /setSelectedVehicle\(null\)/);
  });

  it("animates convoy expansion and uses circular header controls", () => {
    assert.match(screen, /LayoutAnimation\.configureNext/);
    assert.match(screen, /configureConvoyExpansionAnimation\(\)/);
    assert.match(
      screen,
      /useMotionValue\(expanded \? 1 : 0,[\s\S]*duration: CONVOY_CHEVRON_DURATION_MS/,
    );
    assert.match(screen, /onPress=\{onOpenDetails\}[\s\S]*<Info/);
    assert.doesNotMatch(screen, /Convoy overview/);
    assert.match(
      styles,
      /convoyHeaderIconButton:\s*\{[\s\S]*borderRadius: radius\.pill/,
    );
    assert.match(
      styles,
      /convoyDisclosure:\s*\{[\s\S]*borderRadius: radius\.pill/,
    );
    assert.match(
      styles,
      /convoyExpandedContent:\s*\{[\s\S]*borderLeftColor: colors\.appleBlueSoft/,
    );
  });

  it("makes Operations detail handles smoothly dismissible", () => {
    assert.match(screen, /function OperationsDetailSheet/);
    assert.match(screen, /PanResponder\.create/);
    assert.match(screen, /shouldStartRiskDetailDismissGesture/);
    assert.match(screen, /shouldDismissRiskDetailGesture/);
    assert.match(screen, /\.\.\.dragResponder\.panHandlers/);
    assert.match(screen, /Animated\.timing\(sheetTranslateY/);
  });
});
