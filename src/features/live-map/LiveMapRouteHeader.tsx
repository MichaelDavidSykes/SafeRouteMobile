import { Pressable, Text, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import type { SavedSafeRoutePlan } from "./liveMapTypes";
import {
  createLiveLocationNoticePresentation,
  createRouteEndpointLinePresentation,
  createRouteHeaderPresentation,
  createRouteTitleAccessibilityLabel,
  createRouteTitleDisplayText,
  routeStatusPillPresentation,
  type NavigationLifecycle,
  type RouteStatusPillPresentation,
  type RouteStatusTone,
} from "./liveMapUiState";
import { styles } from "./LiveMapRouteHeader.styles";
import { uiTestIds } from "../../testing/uiTestIds";

const LIVE_ROUTE_RETURN_HIT_SLOP = 6;

interface LiveMapRouteHeaderProps {
  activeNavigationState: NavigationLifecycle;
  layout: LiveMapOverlayLayout;
  locationNotice: string | null;
  onChangeRoute: () => void;
  returnAccessibilityLabel: string;
  returnLabel: string;
  routePlan: SavedSafeRoutePlan;
  trackingLabel: string;
}

export function LiveMapRouteHeader({
  activeNavigationState,
  layout,
  locationNotice,
  onChangeRoute,
  returnAccessibilityLabel,
  returnLabel,
  routePlan,
  trackingLabel,
}: LiveMapRouteHeaderProps) {
  const statusPresentation = routeStatusPillPresentation({
    state: activeNavigationState,
    trackingLabel,
  });
  const headerPresentation = createRouteHeaderPresentation({
    state: activeNavigationState,
    showRouteEndpoints: layout.showRouteEndpoints,
    showRouteSubtitle: layout.showRouteSubtitle,
  });
  const locationNoticePresentation =
    createLiveLocationNoticePresentation(locationNotice);
  const routeTitleAccessibilityLabel = createRouteTitleAccessibilityLabel({
    convoyCallsign: routePlan.convoyCallsign,
    name: routePlan.name,
    operation: routePlan.operation,
  });
  const routeTitleDisplayText = createRouteTitleDisplayText(routePlan.name);

  return (
    <View pointerEvents="box-none" style={styles.topStack}>
      <View
        style={[
          styles.headerPanel,
          headerPresentation.compactNavigation
            ? styles.headerPanelCompactNavigation
            : null,
          headerPresentation.minimalActiveNavigation
            ? styles.headerPanelMinimalActiveNavigation
            : null,
        ]}
      >
        {headerPresentation.compactNavigation ? (
          <View
            style={[
              styles.compactNavigationRow,
              headerPresentation.minimalActiveNavigation
                ? styles.compactNavigationRowMinimal
                : null,
            ]}
          >
            <Pressable
              accessibilityLabel={returnAccessibilityLabel}
              accessibilityHint="Returns to the previous SafeRoute view without ending this route."
              accessibilityRole="button"
              hitSlop={LIVE_ROUTE_RETURN_HIT_SLOP}
              testID={uiTestIds.liveMapReturn}
              style={({ pressed }) => [
                styles.routeListButton,
                styles.routeListButtonCompactNavigation,
                headerPresentation.minimalActiveNavigation
                  ? styles.routeListButtonMinimalActiveNavigation
                  : null,
                pressed ? styles.routeListButtonPressed : null,
              ]}
              onPress={onChangeRoute}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.routeListButtonText,
                  headerPresentation.minimalActiveNavigation
                    ? styles.routeListButtonTextMinimalActiveNavigation
                    : null,
                ]}
              >
                {returnLabel}
              </Text>
            </Pressable>
            {headerPresentation.showRouteTitle ? (
              <Text
                accessibilityLabel={routeTitleAccessibilityLabel}
                numberOfLines={1}
                style={styles.routeTitleCompactNavigation}
              >
                {routeTitleDisplayText}
              </Text>
            ) : null}
            <StatusPill
              compact
              minimal={headerPresentation.minimalActiveNavigation}
              presentation={statusPresentation}
            />
          </View>
        ) : (
          <>
            <View style={styles.brandRow}>
              <Pressable
                accessibilityLabel={returnAccessibilityLabel}
                accessibilityHint="Returns to the previous SafeRoute view without ending this route."
                accessibilityRole="button"
                hitSlop={LIVE_ROUTE_RETURN_HIT_SLOP}
                testID={uiTestIds.liveMapReturn}
                style={({ pressed }) => [
                  styles.routeListButton,
                  pressed ? styles.routeListButtonPressed : null,
                ]}
                onPress={onChangeRoute}
              >
                <Text numberOfLines={1} style={styles.routeListButtonText}>
                  {returnLabel}
                </Text>
              </Pressable>
              <StatusPill presentation={statusPresentation} />
            </View>

            <Text
              accessibilityLabel={routeTitleAccessibilityLabel}
              numberOfLines={1}
              style={styles.routeTitle}
            >
              {routeTitleDisplayText}
            </Text>
          </>
        )}

        {headerPresentation.showRouteEndpoints ||
        headerPresentation.showInlineEndpoints ? (
          <RouteEndpointLine
            origin={routePlan.origin}
            destination={routePlan.destination}
            expanded={headerPresentation.showRouteEndpoints}
          />
        ) : null}

        {locationNoticePresentation ? (
          <View
            accessibilityLabel={locationNoticePresentation.accessibilityLabel}
            accessibilityRole="alert"
            style={[
              styles.permissionNotice,
              headerPresentation.compactNavigation
                ? styles.permissionNoticeCompactNavigation
                : null,
            ]}
          >
            <Text
              numberOfLines={
                headerPresentation.compactNavigation ? 1 : undefined
              }
              style={styles.permissionText}
            >
              {locationNoticePresentation.displayText}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function StatusPill({
  compact = false,
  minimal = false,
  presentation,
}: {
  compact?: boolean;
  minimal?: boolean;
  presentation: RouteStatusPillPresentation;
}) {
  return (
    <View
      accessible
      accessibilityLabel={presentation.accessibilityLabel}
      style={[
        styles.statusPill,
        statusPillStyle(presentation.tone),
        compact ? styles.statusPillCompactNavigation : null,
        minimal ? styles.statusPillMinimalActiveNavigation : null,
      ]}
    >
      {minimal ? null : (
        <View style={[styles.statusDot, statusDotStyle(presentation.tone)]} />
      )}
      <Text
        adjustsFontSizeToFit
        ellipsizeMode="tail"
        minimumFontScale={0.82}
        numberOfLines={1}
        style={[
          styles.statusText,
          compact ? styles.statusTextCompactNavigation : null,
          statusTextStyle(presentation.tone),
        ]}
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

function RouteEndpointLine({
  destination,
  expanded,
  origin,
}: {
  destination: string;
  expanded: boolean;
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
      style={[
        styles.routeEndpointLine,
        expanded ? styles.routeEndpointLineExpanded : null,
      ]}
    >
      <Text numberOfLines={1} style={styles.routeEndpointText}>
        {presentation.displayText}
      </Text>
    </View>
  );
}
