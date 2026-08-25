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
    assert.match(
      guestMap,
      /resolveMapPolylineAtCoordinate\([\s\S]*handleRouteAlternativeSelect\(alternativeLine\.plan\)/,
    );
    assert.doesNotMatch(guestMap, /tappable=\{!line\.selected\}/);
    assert.doesNotMatch(
      guestMap,
      /onPress=\{\(\) => handleRouteAlternativeSelect\(line\.plan\)\}/,
    );
    assert.match(
      canvas,
      /event\.nativeEvent\.action === "marker-press"[\s\S]*resolveRiskZoneAtMapCoordinate[\s\S]*onMapPress\(\)/,
    );
    assert.doesNotMatch(canvas, /<LiveMapRiskDetailCallout/);
    assert.match(callout, /<SafeRouteBottomSheet/);
    assert.match(callout, /enablePanDownToClose/);
    assert.match(callout, /onClose=\{handleSheetClosed\}/);
  });

  it("opens pitched iOS route alerts from the direct native map event", () => {
    const liveMap = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapScreen.tsx"),
      "utf8",
    );
    const markers = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapMarkers.tsx"),
      "utf8",
    );

    assert.match(
      markers,
      /<Marker[\s\S]*accessibilityLabel=\{createRiskZoneAccessibilityLabel[\s\S]*onPress=\{onPress\}[\s\S]*tappable=\{visible && interactive\}/,
    );
    assert.match(
      markers,
      /onTouchStart=\{interactive && onPress[\s\S]*event\.stopPropagation\(\)[\s\S]*onPress\(\)/,
    );
    assert.doesNotMatch(
      markers,
      /<Marker[\s\S]*onSelect=\{onPress\}/,
    );
    const canvas = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapCanvas.tsx"),
      "utf8",
    );
    assert.match(canvas, /<RiskOverlay[\s\S]*onPress=\{onRiskZonePress\}/);
    assert.doesNotMatch(canvas, /onMarkerPress=/);
    assert.match(
      canvas,
      /handleMapTouchStart[\s\S]*coordinateForPoint\(point\)[\s\S]*resolveRiskMarkerAtMapCoordinate[\s\S]*onRiskZonePress\(zone\)/,
    );
    assert.match(canvas, /onTouchStart=\{handleMapTouchStart\}/);
    assert.match(
      canvas,
      /activeRiskTouchLayerVisible[\s\S]*pointForCoordinate\(zone\.coordinate\)[\s\S]*activeRiskTouchTargets\.map/,
    );
    assert.match(
      canvas,
      /<Pressable[\s\S]*onPressIn=\{\(event\) => \{[\s\S]*onMapInteractionStart\(\);[\s\S]*onRiskZonePress\(zone\)/,
    );
    assert.match(
      canvas,
      /interactive=\{[\s\S]*visibleRiskZoneIds\.has\(zone\.id\) && !activeRiskTouchLayerVisible/,
    );
    assert.match(
      liveMap,
      /handleRiskZonePress[\s\S]*lastRiskZonePressAtMsRef\.current = pressedAtMs[\s\S]*overlayRef\.current\?\.openRiskDetail\(\{ proximity, zone \}\)/,
    );
    assert.doesNotMatch(liveMap, /setSelectedRiskZoneId/);
    assert.match(
      liveMap,
      /handleMapPress[\s\S]*Date\.now\(\) - lastRiskZonePressAtMsRef\.current < 500[\s\S]*overlayRef\.current\?\.dismissRiskDetail\(\)/,
    );
  });

  it("preloads the exact live alert and morphs it over the route stack", () => {
    const riskCard = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskCard.tsx"),
      "utf8",
    );
    const overlay = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapOverlay.tsx"),
      "utf8",
    );

    assert.match(riskCard, /lastPressInAtMsRef\.current = Date\.now\(\)[\s\S]*onPress\(alert\)/);
    assert.match(riskCard, /Date\.now\(\) - lastPressInAtMsRef\.current > 500/);
    assert.match(
      overlay,
      /onPress=\{\(alert\) => \{[\s\S]*openRiskDetail\(\{[\s\S]*proximity: alert\.proximity,[\s\S]*zone: alert\.zone/,
    );
    assert.doesNotMatch(overlay, /openLiveRiskAlert|setOpenLiveRiskAlert/);
    assert.match(overlay, /<LiveMapRiskDetailCallout/);
    assert.match(overlay, /morphFromRouteStack/);
    assert.match(overlay, /open=\{riskDetailOpen\}/);
    assert.match(overlay, /openImmediately=\{Boolean\(selectedRiskDetail\)\}/);
    assert.match(
      overlay,
      /selectedRiskDetail \? styles\.routeStackSuppressed : null/,
    );
    assert.match(overlay, /proximity=\{riskDetailAlert\.proximity\}/);
    assert.match(
      overlay,
      /selectedRiskDetail \|\|[\s\S]*liveRiskAlert/,
    );
    assert.match(
      overlay,
      /advisoryRiskDetail[\s\S]*riskAdvisory\.proximity[\s\S]*riskAdvisory\.zone/,
    );
    assert.match(
      overlay,
      /fallbackRiskDetail[\s\S]*routePlan\.riskZones\[0\][\s\S]*proximity: null/,
    );
    assert.match(
      overlay,
      /retainedSelectedRiskDetailRef\.current \|\|[\s\S]*fallbackRiskDetail/,
    );
    assert.match(overlay, /pointerEvents=\{riskDetailOpen \? "none" : "box-none"\}/);
    assert.doesNotMatch(overlay, /onOpenRiskAlert/);
  });

  it("keeps the live alert sheet mounted and transitions it without a mount delay", () => {
    const callout = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskDetailCallout.tsx"),
      "utf8",
    );

    assert.match(callout, /animateOnMount=\{!morphFromRouteStack\}/);
    assert.match(callout, /routeStackMorphProgress\.value = withTiming\(open \? 1 : 0/);
    assert.match(
      callout,
      /<Animated\.View[\s\S]*morphFromRouteStack \? routeStackMorphAnimatedStyle : null[\s\S]*<SafeRouteBottomSheet/,
    );
    assert.match(callout, /style=\{styles\.sheet\}/);
    assert.match(
      callout,
      /enablePanDownToClose=\{!hasExpandedSnapPoint \|\| sheetIndex === 0\}/,
    );
    assert.match(
      callout,
      /open\)[\s\S]*sheetRef\.current\?\.snapToIndex\(\s*0/,
    );
    assert.match(
      callout,
      /openImmediately \? \{ duration: 1 \} : undefined[\s\S]*routeStackMorphProgress\.value = 1/,
    );
    assert.match(callout, /runOnJS\(completeRouteStackMorphDismissal\)\(\)/);
    assert.doesNotMatch(callout, /key=\{replayKey\}/);
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

  it("renders a newly selected guest risk immediately after dismissing another", () => {
    const guestMap = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );

    assert.doesNotMatch(guestMap, /activeSheetTargetIndex/);
    assert.match(
      guestMap,
      /expandedSheetContentAnimatedStyle[\s\S]*routeSheetAnimatedIndex\.value[\s\S]*routeSheetDetailCompactIndex/,
    );
    assert.match(
      guestMap,
      /handleSelectRiskZone[\s\S]*riskDetailScrollRef\.current\?\.scrollTo\(\{ animated: false, y: 0 \}\)[\s\S]*setMapSheetIndex\(routeSheetDetailCompactIndex\)[\s\S]*snapToIndex\(routeSheetDetailCompactIndex\)/,
    );
    assert.match(
      guestMap,
      /<BottomSheetScrollView[\s\S]*ref=\{riskDetailScrollRef\}[\s\S]*<LiveMapRiskDetailContent/,
    );
  });
});
