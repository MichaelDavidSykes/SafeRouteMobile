import { Pressable, Text, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import type { RoutePath, SavedSafeRoutePlan } from "./liveMapTypes";
import {
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
  createRouteSummaryDetail,
  createRouteSummaryHeadline,
  createRouteSummaryPrimaryAction,
  createRouteSummaryRemainingMetric,
  createRouteSummarySafetyBadge,
  shouldShowRouteSummarySafetyBadge,
  shouldUseCompactRouteSummary,
  type RouteSummarySafetyBadge,
} from "./routeSummaryPresentation";
import type { BackgroundNavigationPresentation } from "./backgroundNavigationState";

const ROUTE_SUMMARY_ACTION_HIT_SLOP = 6;

interface LiveMapRouteSummarySheetProps {
  backgroundNavigationPresentation?: BackgroundNavigationPresentation | null;
  layout: LiveMapOverlayLayout;
  navigationState: NavigationLifecycle;
  onEnableBackgroundNavigation: () => void;
  onPrimaryAction: () => void;
  onStopRoute: () => void;
  primaryDisabledReason?: string | null;
  progress: RouteProgressSnapshot | null;
  route: RoutePath;
  routeContext: "guest" | "saved";
  routePlan: SavedSafeRoutePlan;
}

export function LiveMapRouteSummarySheet({
  backgroundNavigationPresentation,
  layout,
  navigationState,
  onEnableBackgroundNavigation,
  onPrimaryAction,
  onStopRoute,
  primaryDisabledReason,
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
  const showStopAction =
    navigationState === "navigating" ||
    navigationState === "off-route" ||
    navigationState === "paused";
  const headlineSource =
    navigationState === "arrived"
      ? "Arrived"
      : progress
        ? formatEta(progress.etaSeconds)
        : route.eta;
  const headlinePresentation = createRouteSummaryHeadline({
    headline: headlineSource,
    routeContext,
    state: navigationState,
  });
  const compactRemainingMetric =
    compactRouteSummary && progress
      ? createRouteSummaryRemainingMetric(
          formatDistance(progress.remainingDistanceMeters),
        )
      : null;
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
            accessibilityLabel={headlinePresentation.accessibilityLabel}
            numberOfLines={1}
            style={[
              styles.etaText,
              compactRouteSummary ? styles.etaTextCompactNavigation : null,
            ]}
          >
            {headlinePresentation.text}
          </Text>
          {compactRemainingMetric ? (
            <Text
              accessibilityLabel={compactRemainingMetric.accessibilityLabel}
              numberOfLines={1}
              testID={uiTestIds.liveMapRemainingMetrics}
              style={styles.remainingMetricLine}
            >
              {compactRemainingMetric.text}
            </Text>
          ) : compactRouteSummary ? null : (
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

      {backgroundNavigationPresentation ? (
        <Pressable
          accessibilityLabel={backgroundNavigationPresentation.accessibilityLabel}
          accessibilityRole="button"
          testID={uiTestIds.liveMapBackgroundNavigationAction}
          style={({ pressed }) => [
            styles.continuityAction,
            pressed ? styles.continuityActionPressed : null,
          ]}
          onPress={onEnableBackgroundNavigation}
        >
          <Text numberOfLines={1} style={styles.continuityMessage}>
            {backgroundNavigationPresentation.message}
          </Text>
          <Text numberOfLines={1} style={styles.continuityActionText}>
            {backgroundNavigationPresentation.actionLabel}
          </Text>
        </Pressable>
      ) : null}

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
          hitSlop={ROUTE_SUMMARY_ACTION_HIT_SLOP}
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
            numberOfLines={1}
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
            hitSlop={ROUTE_SUMMARY_ACTION_HIT_SLOP}
            testID={uiTestIds.liveMapStopAction}
            style={({ pressed }) => [
              styles.stopButton,
              compactRouteSummary ? styles.stopButtonCompactNavigation : null,
              pressed ? styles.stopButtonPressed : null,
            ]}
            onPress={onStopRoute}
          >
            <Text numberOfLines={1} style={styles.stopButtonText}>
              End
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
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
