import { useState } from "react";
import { Ellipsis, List, Share2 } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import type { RoutePath, SavedSafeRoutePlan } from "./liveMapTypes";
import {
  createRouteEndpointLinePresentation,
  createRouteTitleAccessibilityLabel,
  createRouteTitleDisplayText,
  primaryRouteActionAccessibility,
  routeStatusPillPresentation,
  stopRouteAccessibility,
  type NavigationLifecycle,
  type RouteStatusPillPresentation,
  type RouteStatusTone,
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
  createGuestRouteDestinationLabel,
  createRouteSummaryHeadline,
  createRouteSummaryPrimaryAction,
  createRouteSummaryRemainingMetric,
  createRouteSummarySafetyBadge,
  createSavedRouteContextDetail,
  shouldShowRouteSummarySafetyBadge,
  shouldUseCompactRouteSummary,
} from "./routeSummaryPresentation";
import { MotionEntrance } from "../../motion/SafeRouteMotion";

const ROUTE_SUMMARY_ACTION_HIT_SLOP = 12;
const ROUTE_SUMMARY_ACTION_PRESS_RETENTION_OFFSET = 20;

interface LiveMapRouteSummarySheetProps {
  layout: LiveMapOverlayLayout;
  navigationState: NavigationLifecycle;
  onPrimaryAction: () => void;
  onShareRoute: () => void;
  onStopRoute: () => void;
  primaryActionPending?: boolean;
  primaryActionStatusReason?: string | null;
  primaryDisabledReason?: string | null;
  progress: RouteProgressSnapshot | null;
  route: RoutePath;
  routeContext: "guest" | "saved";
  routePlan: SavedSafeRoutePlan;
  sharePending?: boolean;
  trackingLabel: string;
}

export function LiveMapRouteSummarySheet({
  layout,
  navigationState,
  onPrimaryAction,
  onShareRoute,
  onStopRoute,
  primaryActionPending = false,
  primaryActionStatusReason,
  primaryDisabledReason,
  progress,
  route,
  routeContext,
  routePlan,
  sharePending = false,
  trackingLabel,
}: LiveMapRouteSummarySheetProps) {
  const [detailsVisible, setDetailsVisible] = useState(false);
  const routeIntelCount =
    routePlan.riskZones.length + (routePlan.supportFacilities?.length || 0);
  const primary = createRouteSummaryPrimaryAction(
    navigationState,
    primaryDisabledReason || primaryActionStatusReason,
  );
  const primaryAccessibility = primaryRouteActionAccessibility(
    navigationState,
    primaryDisabledReason,
    primaryActionStatusReason,
  );
  const stopAccessibility = stopRouteAccessibility(navigationState);
  const primaryDisabled =
    primaryActionPending || Boolean(primaryAccessibility.state.disabled);
  const compactRouteSummary = shouldUseCompactRouteSummary(navigationState);
  const showStopAction =
    navigationState === "navigating" ||
    navigationState === "off-route" ||
    navigationState === "paused";
  const showPrimaryAction = !showStopAction || navigationState === "paused";
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
  const remainingDistance = progress
    ? formatDistance(progress.remainingDistanceMeters)
    : null;
  const distanceMetricValue =
    remainingDistance || route.distance.trim() || "Distance unavailable";
  const compactRemainingMetric =
    compactRouteSummary && remainingDistance
      ? createRouteSummaryRemainingMetric(remainingDistance)
      : null;
  const routeDetail = createRouteSummaryDetail({
    remainingDistance,
    routeContext,
    routeDescription: route.description,
    routeDistance: route.distance,
    routeIntelCount,
  });
  const safetyBadge = createRouteSummarySafetyBadge({
    routeRiskLabel: route.riskLabel,
    safeScore: route.safeScore,
  });
  const showSafetyMetric = shouldShowRouteSummarySafetyBadge(routeContext);
  const savedRouteContext = createSavedRouteContextDetail({
    convoyCallsign: routePlan.convoyCallsign,
    operation: routePlan.operation,
    routePlanName: routePlan.name,
    updatedAtLabel: routePlan.updatedAtLabel,
    waypointCount: routePlan.checkpoints.filter(
      (checkpoint) => checkpoint.kind === "waypoint",
    ).length,
  });
  const routeTitleAccessibilityLabel = createRouteTitleAccessibilityLabel({
    convoyCallsign: routePlan.convoyCallsign,
    name: routePlan.name,
    operation: routePlan.operation,
  });
  const statusPresentation = routeStatusPillPresentation({
    state: navigationState,
    trackingLabel,
  });

  return (
    <MotionEntrance
      replayKey={routePlan.id}
      testID={uiTestIds.liveMapRouteSummarySheet}
      variant="sheet"
      style={[
        styles.bottomSheet,
        layout.isCompact ? styles.bottomSheetCompact : null,
        compactRouteSummary ? styles.bottomSheetCompactNavigation : null,
        {
          paddingBottom: compactRouteSummary
            ? 10
            : 14,
        },
      ]}
    >
      <View testID={uiTestIds.liveMapJourney(routePlan.id)}>
        {compactRouteSummary ? (
          <View style={styles.compactSummaryRow}>
            <View style={styles.compactSummaryCopy}>
              <Text
                accessibilityLabel={headlinePresentation.accessibilityLabel}
                numberOfLines={1}
                style={styles.compactEtaText}
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
              ) : null}
            </View>
            <StatusPill compact presentation={statusPresentation} />
          </View>
        ) : routeContext === "guest" ? (
          <GuestRouteOverview
            destination={routePlan.destination}
            distanceAccessibilityLabel={routeDetail.accessibilityLabel}
            distance={distanceMetricValue}
            etaAccessibilityLabel={headlinePresentation.accessibilityLabel}
            eta={headlinePresentation.text}
          />
        ) : (
          <>
            <View style={styles.identityRow}>
              <Text
                accessibilityLabel={routeTitleAccessibilityLabel}
                numberOfLines={1}
                style={styles.routeTitle}
              >
                {createRouteTitleDisplayText(routePlan.name)}
              </Text>
              {statusPresentation.label === "Ready" ? null : (
                <StatusPill presentation={statusPresentation} />
              )}
            </View>

            <RouteEndpoints
              destination={routePlan.destination}
              origin={routePlan.origin}
            />

            <View style={styles.metricsRow}>
              <Metric
                accessibilityLabel={headlinePresentation.accessibilityLabel}
                label="ETA"
                value={headlinePresentation.text}
              />
              <View
                style={styles.metricDivider}
              />
              <Metric
                accessibilityLabel={routeDetail.accessibilityLabel}
                label={remainingDistance ? "Remaining" : "Distance"}
                value={distanceMetricValue}
              />
              {showSafetyMetric ? (
                <>
                  <View style={styles.metricDivider} />
                  <Metric
                    accessibilityLabel={safetyBadge.accessibilityLabel}
                    label="Risk"
                    tone={route.tone}
                    value={safetyBadge.text}
                  />
                </>
              ) : null}
            </View>
          </>
        )}
      </View>

      {!compactRouteSummary && detailsVisible ? (
        <MotionEntrance
          replayKey={`${routePlan.id}:details`}
          style={styles.detailsPanel}
          variant="disclosure"
        >
          {routeContext === "saved" ? (
            <View
              accessible
              accessibilityLabel={savedRouteContext.accessibilityLabel}
            >
              <Text numberOfLines={1} style={styles.detailsPrimary}>
                {savedRouteContext.primary}
              </Text>
              <Text numberOfLines={1} style={styles.detailsSecondary}>
                {savedRouteContext.secondary}
              </Text>
            </View>
          ) : null}
          <Text numberOfLines={2} style={styles.routeDescription}>
            {route.description || routeDetail.text}
          </Text>
        </MotionEntrance>
      ) : null}

      {primaryActionPending ? null : (
        <View
          style={[
            styles.actionRow,
            compactRouteSummary ? styles.actionRowCompactNavigation : null,
            routeContext === "guest" && !compactRouteSummary
              ? styles.actionRowGuest
              : null,
          ]}
        >
          <>
            {showPrimaryAction ? (
              <Pressable
                accessibilityHint={primaryAccessibility.hint}
                accessibilityLabel={primaryAccessibility.label}
                accessibilityRole="button"
                accessibilityState={primaryAccessibility.state}
                disabled={primaryDisabled}
                hitSlop={ROUTE_SUMMARY_ACTION_HIT_SLOP}
                pressRetentionOffset={ROUTE_SUMMARY_ACTION_PRESS_RETENTION_OFFSET}
                testID={uiTestIds.liveMapPrimaryAction}
                style={({ pressed }) => [
                  styles.startButton,
                  compactRouteSummary ? styles.startButtonCompactNavigation : null,
                  routeContext === "guest" && !compactRouteSummary
                    ? styles.startButtonGuest
                    : null,
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
            ) : null}

            {showStopAction ? (
              <Pressable
                accessibilityHint={stopAccessibility.hint}
                accessibilityLabel={stopAccessibility.label}
                accessibilityRole="button"
                accessibilityState={stopAccessibility.state}
                hitSlop={ROUTE_SUMMARY_ACTION_HIT_SLOP}
                pressRetentionOffset={ROUTE_SUMMARY_ACTION_PRESS_RETENTION_OFFSET}
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
            ) : (
              <>
                <Pressable
                  accessibilityLabel={sharePending ? "Preparing route share" : "Share route"}
                  accessibilityRole="button"
                  accessibilityState={{ busy: sharePending, disabled: sharePending }}
                  disabled={sharePending}
                  hitSlop={ROUTE_SUMMARY_ACTION_HIT_SLOP}
                  testID={uiTestIds.liveMapShareRoute}
                  style={({ pressed }) => [
                    styles.detailsButton,
                    routeContext === "guest" ? styles.detailsButtonGuest : null,
                    sharePending ? styles.detailsButtonDisabled : null,
                    pressed && !sharePending ? styles.detailsButtonPressed : null,
                  ]}
                  onPress={onShareRoute}
                >
                  <Share2 accessibilityElementsHidden color="#0a84ff" size={21} strokeWidth={2.1} />
                </Pressable>
                <Pressable
                  accessibilityLabel={
                    routeContext === "saved"
                      ? savedRouteContext.accessibilityLabel
                      : "Route details"
                  }
                  accessibilityRole="button"
                  accessibilityState={{ expanded: detailsVisible }}
                  hitSlop={ROUTE_SUMMARY_ACTION_HIT_SLOP}
                  testID={uiTestIds.liveMapSavedRouteDetails}
                  style={({ pressed }) => [
                    styles.detailsButton,
                    routeContext === "guest" ? styles.detailsButtonGuest : null,
                    detailsVisible ? styles.detailsButtonActive : null,
                    pressed ? styles.detailsButtonPressed : null,
                  ]}
                  onPress={() => setDetailsVisible((visible) => !visible)}
                >
                  {routeContext === "guest" ? (
                    <Ellipsis accessibilityElementsHidden color="#0a84ff" size={22} strokeWidth={2.1} />
                  ) : (
                    <List accessibilityElementsHidden color="#0a84ff" size={22} strokeWidth={2.1} />
                  )}
                </Pressable>
              </>
            )}
          </>
        </View>
      )}
    </MotionEntrance>
  );
}

function Metric({
  accessibilityLabel,
  label,
  tone,
  value,
}: {
  accessibilityLabel: string;
  label: string;
  tone?: RoutePath["tone"];
  value: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={styles.metric}
    >
      <Text
        numberOfLines={1}
        style={styles.metricLabel}
      >
        {label}
      </Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={[
          styles.metricValue,
          tone ? metricToneStyle(tone) : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function GuestRouteOverview({
  destination,
  distance,
  distanceAccessibilityLabel,
  eta,
  etaAccessibilityLabel,
}: {
  destination: string;
  distance: string;
  distanceAccessibilityLabel: string;
  eta: string;
  etaAccessibilityLabel: string;
}) {
  return (
    <View style={styles.guestOverview}>
      <Text
        accessibilityLabel={`Destination ${destination || "Destination"}`}
        numberOfLines={1}
        style={styles.guestDestination}
      >
        {createGuestRouteDestinationLabel(destination)}
      </Text>
      <View style={styles.guestMetrics}>
        <Text
          accessibilityLabel={etaAccessibilityLabel}
          numberOfLines={1}
          style={styles.guestMetric}
        >
          {eta}
        </Text>
        <View accessibilityElementsHidden style={styles.guestMetricSeparator} />
        <Text
          accessibilityLabel={distanceAccessibilityLabel}
          numberOfLines={1}
          style={styles.guestMetric}
        >
          {distance}
        </Text>
      </View>
    </View>
  );
}

function RouteEndpoints({
  destination,
  origin,
}: {
  destination: string;
  origin: string;
}) {
  const presentation = createRouteEndpointLinePresentation({
    destination,
    origin,
  });

  return (
    <View
      accessible
      accessibilityLabel={presentation.accessibilityLabel}
      style={styles.endpointRow}
    >
      <View style={styles.endpointRail}>
        <View style={[styles.endpointDot, styles.endpointDotOrigin]} />
        <View style={styles.endpointLine} />
        <View style={[styles.endpointDot, styles.endpointDotDestination]} />
      </View>
      <View style={styles.endpointCopy}>
        <Text numberOfLines={1} style={styles.endpointText}>
          {origin || "Route start"}
        </Text>
        <Text numberOfLines={1} style={styles.endpointText}>
          {destination || "Destination"}
        </Text>
      </View>
    </View>
  );
}

function StatusPill({
  compact,
  presentation,
}: {
  compact?: boolean;
  presentation: RouteStatusPillPresentation;
}) {
  return (
    <View
      accessible
      accessibilityLabel={presentation.accessibilityLabel}
      style={[
        styles.statusPill,
        compact ? styles.statusPillCompact : null,
        statusPillStyle(presentation.tone),
      ]}
    >
      <View style={[styles.statusDot, statusDotStyle(presentation.tone)]} />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        numberOfLines={1}
        style={[styles.statusText, statusTextStyle(presentation.tone)]}
      >
        {presentation.label}
      </Text>
    </View>
  );
}

function statusPillStyle(tone: RouteStatusTone) {
  if (tone === "danger") {
    return styles.statusPillDanger;
  }

  if (tone === "live") {
    return styles.statusPillLive;
  }

  return styles.statusPillDemo;
}

function statusDotStyle(tone: RouteStatusTone) {
  if (tone === "danger") {
    return styles.statusDotDanger;
  }

  if (tone === "live") {
    return styles.statusDotLive;
  }

  return styles.statusDotDemo;
}

function statusTextStyle(tone: RouteStatusTone) {
  if (tone === "danger") {
    return styles.statusTextDanger;
  }

  if (tone === "live") {
    return styles.statusTextLive;
  }

  return styles.statusTextDemo;
}

function metricToneStyle(tone: RoutePath["tone"]) {
  if (tone === "amber") {
    return styles.metricValueAmber;
  }

  if (tone === "blue") {
    return styles.metricValueBlue;
  }

  return styles.metricValueSafe;
}
