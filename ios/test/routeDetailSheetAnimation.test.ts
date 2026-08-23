import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("saved route detail animation", () => {
  const sheetSource = readFileSync(
    join(process.cwd(), "src/features/routes/RouteDetailSheet.tsx"),
    "utf8",
  );
  const foundationSource = readFileSync(
    join(process.cwd(), "src/components/SafeRouteBottomSheet.tsx"),
    "utf8",
  );

  it("keeps the native modal stationary and delegates motion to the shared sheet", () => {
    assert.match(sheetSource, /animationType="none"/);
    assert.match(sheetSource, /<GestureHandlerRootView/);
    assert.match(sheetSource, /<SafeRouteBottomSheet/);
    assert.match(sheetSource, /<BottomSheetScrollView/);
    assert.doesNotMatch(sheetSource, /animationType="slide"/);
    assert.doesNotMatch(sheetSource, /\bAnimated\b/);
    assert.doesNotMatch(sheetSource, /\bPanResponder\b/);
  });

  it("uses one explicit detent and leaves reduce-motion handling to the system default", () => {
    assert.match(sheetSource, /ROUTE_DETAIL_SNAP_POINTS = \["86%"\]/);
    assert.match(sheetSource, /snapPoints=\{ROUTE_DETAIL_SNAP_POINTS\}/);
    assert.match(foundationSource, /enableDynamicSizing=\{false\}/);
    assert.doesNotMatch(sheetSource, /overrideReduceMotion/);
    assert.doesNotMatch(sheetSource, /useReduceMotionEnabled/);
  });

  it("clips the shared glass background to continuous rounded corners", () => {
    assert.match(foundationSource, /<BlurView/);
    assert.match(foundationSource, /background:[\s\S]*overflow:\s*'hidden'/);
    assert.match(foundationSource, /background:[\s\S]*borderCurve:\s*'continuous'/);
    assert.match(foundationSource, /background:[\s\S]*borderRadius:\s*radius\.sheet/);
  });

  it("dismisses by handle, backdrop, close controls, and accessibility escape", () => {
    assert.match(sheetSource, /backdrop/);
    assert.match(sheetSource, /dismissOnBackdropPress/);
    assert.match(sheetSource, /enablePanDownToClose/);
    assert.match(
      sheetSource,
      /const dismissSheet = useCallback\(\(\) => \{\s*sheetRef\.current\?\.close\(\);\s*\}, \[\]\);/,
    );
    assert.match(sheetSource, /onClose=\{onClose\}/);
    assert.match(sheetSource, /onRequestClose=\{dismissSheet\}/);
    assert.match(sheetSource, /onAccessibilityEscape=\{dismissSheet\}/);
    assert.match(sheetSource, /testID="safe-route-detail-sheet"/);
    assert.match(sheetSource, /testID="safe-route-detail-done"/);
  });
});
