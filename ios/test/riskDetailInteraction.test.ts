import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("risk detail interaction", () => {
  it("keeps risk details open during map pans in both map modes", () => {
    const guestMap = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );
    const liveMap = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapScreen.tsx"),
      "utf8",
    );
    const canvas = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapCanvas.tsx"),
      "utf8",
    );
    const callout = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskDetailCallout.tsx"),
      "utf8",
    );
    const guestPanHandler =
      /onPanDrag=\{\(\) => \{([\s\S]*?)\}\}/.exec(guestMap)?.[1] || "";
    const livePanHandler =
      /const handleMapPanDrag = \(\) => \{([\s\S]*?)\n  \};/.exec(liveMap)?.[1] || "";

    assert.doesNotMatch(guestPanHandler, /setSelectedRiskZone\(null\)/);
    assert.doesNotMatch(livePanHandler, /setSelectedRiskZoneId\(null\)/);
    assert.match(guestMap, /onPress=\{handleMapPress\}/);
    assert.match(canvas, /onPress=\{onMapPress\}/);
    assert.match(callout, /<SafeRouteBottomSheet/);
    assert.match(callout, /enablePanDownToClose/);
    assert.match(callout, /onClose=\{handleSheetClosed\}/);
  });

  it("keeps one content tree mounted while the native sheet changes snap points", () => {
    const callout = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskDetailCallout.tsx"),
      "utf8",
    );

    assert.match(callout, /snapPoints=\{snapPoints\}/);
    assert.match(callout, /<BottomSheetScrollView/);
    assert.match(
      callout,
      /sheetRef\.current\?\.snapToIndex\(expanded \? 0 : 1\)/,
    );
    assert.match(
      callout,
      /nextIndex === 0[\s\S]*scrollRef\.current\?\.scrollTo\(\{ animated: false, y: 0 \}\)/,
    );
    assert.doesNotMatch(callout, /PanResponder|requestAnimationFrame/);
    assert.doesNotMatch(callout, /Animated[\s\S]*from "react-native"/);
    assert.doesNotMatch(callout, /height:\s*expanded\s*\?/);
  });

  it("removes collapsed intelligence from the native accessibility tree", () => {
    const callout = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskDetailCallout.tsx"),
      "utf8",
    );

    assert.match(callout, /accessibilityElementsHidden=\{!expanded\}/);
    assert.match(
      callout,
      /expanded \? "auto" : "no-hide-descendants"/,
    );
  });

  it("keeps expanded intelligence visually clipped until the sheet expands", () => {
    const callout = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskDetailCallout.tsx"),
      "utf8",
    );

    assert.match(callout, /animatedIndex=\{animatedSheetIndex\}/);
    assert.match(
      callout,
      /hasExpandedSnapPoint[\s\S]*\? interpolate\([\s\S]*animatedSheetIndex\.value[\s\S]*\[0, 0\.45, 1\][\s\S]*\[0, 0, 1\]/,
    );
    assert.match(
      callout,
      /pointerEvents=\{expanded \? "auto" : "none"\}/,
    );
    assert.match(
      callout,
      /style=\{\[styles\.expandedPanel, expandedPanelAnimatedStyle\]\}/,
    );
    assert.match(callout, /preferredCompactHeight = expandedContent \? 252 : 240/);
    assert.match(callout, /expandedSnapPoint = Math\.min\(500, availableSheetHeight\)/);
    assert.match(callout, /scrollEnabled=\{expanded\}/);
    assert.doesNotMatch(callout, /minHeight: Math\.max\([\s\S]*compactSnapPoint/);
  });

  it("morphs guest map details inside one persistent search sheet", () => {
    const guestMap = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );
    const callout = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskDetailCallout.tsx"),
      "utf8",
    );

    assert.match(guestMap, /animatedIndex=\{routeSheetAnimatedIndex\}/);
    assert.match(guestMap, /index=\{mapSheetLayout\.collapsedIndex\}/);
    assert.match(guestMap, /style=\{\[[\s\S]*styles\.persistentCollapsedContent,[\s\S]*collapsedSheetAnimatedStyle/);
    assert.match(guestMap, /<LiveMapRiskDetailContent/);
    assert.match(guestMap, /<LiveMapDetailContent/);
    assert.match(
      guestMap,
      /handleSelectRiskZone[\s\S]*snapToIndex\(routeSheetDetailCompactIndex\)/,
    );
    assert.match(
      guestMap,
      /dismissMapDetail[\s\S]*handleRouteSheetClose\(\)/,
    );
    assert.doesNotMatch(guestMap, /index=\{-1\}|routeSheetRef\.current\?\.close\(\)/);
    assert.doesNotMatch(guestMap, /<LiveMapRiskDetailCallout|<LiveMapDetailCallout/);
    assert.match(callout, /export function LiveMapRiskDetailContent/);
    assert.match(callout, /export function LiveMapDetailContent/);
  });
});
