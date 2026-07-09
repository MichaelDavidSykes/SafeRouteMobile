import { Pressable, Text, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import type { RiskZone } from "./liveMapTypes";
import type { NavigationLifecycle } from "./liveMapUiState";
import {
  createLiveRouteRiskAlertPresentation,
  createRiskZoneDetailPresentation,
  type LiveRouteRiskAlert,
  type RouteRiskProximity,
} from "./routeRisk";
import { riskCardStyles as styles } from "./LiveMapRiskCard.styles";
import { uiTestIds } from "../../testing/uiTestIds";

interface LiveRouteRiskAlertCardProps {
  alert: LiveRouteRiskAlert;
  layout: LiveMapOverlayLayout;
  navigationState: NavigationLifecycle;
  onPress: () => void;
}

interface LiveRouteRiskDetailCardProps {
  layout: LiveMapOverlayLayout;
  navigationState: NavigationLifecycle;
  onDismiss: () => void;
  proximity: RouteRiskProximity | null;
  zone: RiskZone;
}

export function LiveRouteRiskAlertCard({
  alert,
  layout,
  navigationState,
  onPress,
}: LiveRouteRiskAlertCardProps) {
  const presentation = createLiveRouteRiskAlertPresentation(alert);

  return (
    <Pressable
      accessibilityHint="Opens the SafeRoute risk-area details."
      accessibilityLabel={presentation.accessibilityLabel}
      accessibilityRole="button"
      testID={uiTestIds.liveMapRiskAlert}
      style={({ pressed }) => [
        styles.riskCard,
        {
          bottom: resolveRiskCardBottom(layout, navigationState),
        },
        layout.isCompact ? styles.riskCardCompact : null,
        riskCardToneStyle(presentation.tone),
        pressed ? styles.riskCardPressed : null,
      ]}
      onPress={onPress}
    >
      <View style={styles.riskCopy}>
        <Text numberOfLines={1} style={styles.riskEyebrow}>
          {presentation.title}
        </Text>
        <Text numberOfLines={1} style={styles.riskTitle}>
          {presentation.zoneTitle}
        </Text>
        <Text numberOfLines={1} style={styles.riskMeta}>
          {presentation.metaLabel}
        </Text>
      </View>
      <Text numberOfLines={1} style={styles.riskDistance}>
        {presentation.detailLabel}
      </Text>
    </Pressable>
  );
}

export function LiveRouteRiskDetailCard({
  layout,
  navigationState,
  onDismiss,
  proximity,
  zone,
}: LiveRouteRiskDetailCardProps) {
  const presentation = createRiskZoneDetailPresentation({ proximity, zone });

  return (
    <View
      accessible
      accessibilityLabel={presentation.accessibilityLabel}
      testID={uiTestIds.liveMapRiskDetail}
      style={[
        styles.riskDetailCard,
        {
          bottom: resolveRiskCardBottom(layout, navigationState),
        },
        layout.isCompact ? styles.riskDetailCardCompact : null,
        riskCardToneStyle(presentation.tone),
      ]}
    >
      <View style={styles.riskDetailHeader}>
        <View style={styles.riskCopy}>
          <Text numberOfLines={1} style={styles.riskEyebrow}>
            Risk area
          </Text>
          <Text numberOfLines={1} style={styles.riskTitle}>
            {presentation.title}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close risk details"
          accessibilityRole="button"
          testID={uiTestIds.liveMapRiskDetailDismiss}
          style={({ pressed }) => [
            styles.riskDismissButton,
            pressed ? styles.riskDismissButtonPressed : null,
          ]}
          onPress={onDismiss}
        >
          <Text numberOfLines={1} style={styles.riskDismissText}>
            Done
          </Text>
        </Pressable>
      </View>

      <Text numberOfLines={1} style={styles.riskMeta}>
        {presentation.metaLabel}
      </Text>
      <Text numberOfLines={2} style={styles.riskBody}>
        {presentation.body}
      </Text>
      <Text numberOfLines={1} style={styles.riskClearance}>
        {presentation.clearanceLabel}
      </Text>
    </View>
  );
}

function resolveRiskCardBottom(
  layout: LiveMapOverlayLayout,
  navigationState: NavigationLifecycle
): number {
  if (
    navigationState === "navigating" ||
    navigationState === "off-route" ||
    navigationState === "paused"
  ) {
    return layout.guidanceBottom + (layout.isCompact ? 70 : 86);
  }

  return layout.isCompact ? 176 : 218;
}

function riskCardToneStyle(tone: "low" | "medium" | "high") {
  if (tone === "high") {
    return styles.riskCardHigh;
  }

  if (tone === "medium") {
    return styles.riskCardMedium;
  }

  return styles.riskCardLow;
}
