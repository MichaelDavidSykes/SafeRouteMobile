import { Pressable, Text, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import type { RoutePath, SavedSafeRoutePlan } from "./liveMapTypes";
import {
  demoDriveAccessibility,
  primaryRouteActionAccessibility,
  stopRouteAccessibility,
  type NavigationLifecycle,
} from "./liveMapUiState";
import {
  formatDistance,
  formatEta,
  type RouteProgressSnapshot,
} from "./routeProgress";
import { routeSummaryStyles as styles } from "./LiveMapRouteSummarySheet.styles";
import { uiTestIds } from "../../testing/uiTestIds";
import {
  createRouteSummaryDemoAction,
  createRouteSummaryDetail,
  createRouteSummaryHeadlineAccessibilityLabel,
  createRouteSummaryPrimaryAction,
  createRouteSummarySafetyBadge,
  shouldInlineRouteSummaryDemoAction,
  shouldShowRouteSummarySafetyBadge,
  shouldUseCompactRouteSummary,
  type RouteSummarySafetyBadge,
} from "./routeSummaryPresentation";

interface LiveMapRouteSummarySheetProps {
  demoDriveAvailable: boolean;
  demoDriveEnabled: boolean;
  layout: LiveMapOverlayLayout;
  navigationState: NavigationLifecycle;
  onPrimaryAction: () => void;
  onStopRoute: () => void;
  onToggleDemoDrive: () => void;
  primaryDisabledReason?: string | null;
  progress: RouteProgressSnapshot | null;
  route: RoutePath;
  routeContext: "guest" | "saved";
  routePlan: SavedSafeRoutePlan;
}

export function LiveMapRouteSummarySheet({
  demoDriveAvailable,
  demoDriveEnabled,
  layout,
  navigationState,
  onPrimaryAction,
  onStopRoute,
  primaryDisabledReason,
  onToggleDemoDrive,
  progress,
  route,
  routeContext,
  routePlan,
}: LiveMapRouteSummarySheetProps) {
  const routeIntelCount = routePlan.riskZones.length;
  const primary = createRouteSummaryPrimaryAction(
    navigationState,
    primaryDisabledReason,
  );
  const primaryAccessibility = primaryRouteActionAccessibility(
    navigationState,
    primaryDisabledReason,
  );
  const stopAccessibility = stopRouteAccessibility(navigationState);
  const primaryDisabled = Boolean(primaryAccessibility.state.disabled);
  const compactRouteSummary = shouldUseCompactRouteSummary(navigationState);
  const inlineDemoAction =
    demoDriveAvailable && shouldInlineRouteSummaryDemoAction(navigationState);
  const showStopAction =
    navigationState === "navigating" ||
    navigationState === "off-route" ||
    navigationState === "paused";
  const headline =
    navigationState === "arrived"
      ? "Arrived"
      : progress
        ? formatEta(progress.etaSeconds)
        : route.eta;
  const routeDetail = createRouteSummaryDetail({
    remainingDistance: progress
      ? formatDistance(progress.remainingDistanceMeters)
      : null,
    routeContext,
    routeDescription: route.description,
    routeDistance: route.distance,
    routeIntelCount,
  });
  const safetyBadge = createRouteSummarySafetyBadge({
    routeRiskLabel: route.riskLabel,
    safeScore: route.safeScore,
  });
  const demoAction = createRouteSummaryDemoAction(demoDriveEnabled);
  const headlineAccessibilityLabel = createRouteSummaryHeadlineAccessibilityLabel({
    headline,
    routeContext,
    state: navigationState,
  });

  return (
    <View
      testID={uiTestIds.liveMapRouteSummarySheet}
      style={[
        styles.bottomSheet,
        layout.isCompact ? styles.bottomSheetCompact : null,
        compactRouteSummary ? styles.bottomSheetCompactNavigation : null,
        { paddingBottom: layout.sheetBottomPadding },
      ]}
    >
      <View
        style={[
          styles.summaryRow,
          compactRouteSummary ? styles.summaryRowCompactNavigation : null,
        ]}
      >
        <View
          style={[
            styles.summaryCopy,
            compactRouteSummary ? styles.summaryCopyCompactNavigation : null,
          ]}
        >
          <Text
            accessibilityLabel={headlineAccessibilityLabel}
            style={[
              styles.etaText,
              compactRouteSummary ? styles.etaTextCompactNavigation : null,
            ]}
          >
            {headline}
          </Text>
          {compactRouteSummary ? null : (
            <Text
              accessibilityLabel={routeDetail.accessibilityLabel}
              numberOfLines={1}
              style={styles.routeDetailLine}
            >
              {routeDetail.text}
            </Text>
          )}
        </View>
        {!compactRouteSummary && shouldShowRouteSummarySafetyBadge(routeContext) ? (
          <SafetyBadge
            badge={safetyBadge}
            compact={layout.isCompact}
            route={route}
          />
        ) : null}
      </View>

      <View
        style={[
          styles.actionRow,
          compactRouteSummary ? styles.actionRowCompactNavigation : null,
        ]}
      >
        <Pressable
          accessibilityHint={primaryAccessibility.hint}
          accessibilityLabel={primaryAccessibility.label}
          accessibilityRole="button"
          accessibilityState={primaryAccessibility.state}
          disabled={primaryDisabled}
          testID={uiTestIds.liveMapPrimaryAction}
          style={({ pressed }) => [
            styles.startButton,
            compactRouteSummary ? styles.startButtonCompactNavigation : null,
            primaryDisabled ? styles.startButtonDisabled : null,
            pressed && !primaryDisabled ? styles.startButtonPressed : null,
          ]}
          onPress={onPrimaryAction}
        >
          <Text
            style={[
              styles.startButtonText,
              primaryDisabled ? styles.startButtonTextDisabled : null,
            ]}
          >
            {primary.label}
          </Text>
        </Pressable>
        {showStopAction ? (
          <Pressable
            accessibilityHint={stopAccessibility.hint}
            accessibilityLabel={stopAccessibility.label}
            accessibilityRole="button"
            accessibilityState={stopAccessibility.state}
            testID={uiTestIds.liveMapStopAction}
            style={[
              styles.stopButton,
              compactRouteSummary ? styles.stopButtonCompactNavigation : null,
            ]}
            onPress={onStopRoute}
          >
            <Text style={styles.stopButtonText}>End</Text>
          </Pressable>
        ) : null}
        {inlineDemoAction ? (
          <DemoDriveButton
            compact={compactRouteSummary}
            demoAction={demoAction}
            enabled={demoDriveEnabled}
            inline
            onPress={onToggleDemoDrive}
          />
        ) : null}
      </View>

      {demoDriveAvailable && !inlineDemoAction ? (
        <DemoDriveButton
          compact={compactRouteSummary}
          demoAction={demoAction}
          enabled={demoDriveEnabled}
          onPress={onToggleDemoDrive}
        />
      ) : null}
    </View>
  );
}

function DemoDriveButton({
  compact,
  demoAction,
  enabled,
  inline = false,
  onPress,
}: {
  compact: boolean;
  demoAction: { label: string };
  enabled: boolean;
  inline?: boolean;
  onPress: () => void;
}) {
  const accessibility = demoDriveAccessibility(enabled);

  return (
    <Pressable
      accessibilityHint={accessibility.hint}
      accessibilityLabel={accessibility.label}
      accessibilityRole="button"
      accessibilityState={accessibility.state}
      testID={uiTestIds.liveMapDemoDriveAction}
      style={({ pressed }) => [
        styles.demoButton,
        inline ? styles.demoButtonInline : null,
        compact ? styles.demoButtonCompactNavigation : null,
        pressed ? styles.demoButtonPressed : null,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.demoButtonText,
          enabled ? styles.demoButtonTextActive : null,
        ]}
      >
        {demoAction.label}
      </Text>
    </Pressable>
  );
}

function SafetyBadge({
  badge,
  compact,
  route,
}: {
  badge: RouteSummarySafetyBadge;
  compact: boolean;
  route: RoutePath;
}) {
  const toneStyle =
    route.tone === "amber"
      ? styles.safetyBadgeAmber
      : route.tone === "blue"
        ? styles.safetyBadgeBlue
        : styles.safetyBadgeSafe;
  const textStyle =
    route.tone === "amber"
      ? styles.safetyBadgeTextAmber
      : route.tone === "blue"
        ? styles.safetyBadgeTextBlue
        : styles.safetyBadgeTextSafe;

  return (
    <View
      accessible
      accessibilityLabel={badge.accessibilityLabel}
      style={[
        styles.safetyBadge,
        compact ? styles.safetyBadgeCompact : null,
        toneStyle,
      ]}
    >
      <Text numberOfLines={1} style={[styles.safetyBadgeText, textStyle]}>
        {badge.text}
      </Text>
    </View>
  );
}
