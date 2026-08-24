import { AlertTriangle, ChevronRight, CircleAlert } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import {
  createLiveRouteRiskAlertPresentation,
  type LiveRouteRiskAlert,
} from "./routeRisk";
import { formatDistance } from "./routeProgress";
import { isRouteAlertZone } from "./riskOverlayPresentation";
import { riskCardStyles as styles } from "./LiveMapRiskCard.styles";
import { uiTestIds } from "../../testing/uiTestIds";
import { colors } from "../../theme";

interface LiveRouteRiskAlertCardProps {
  alert: LiveRouteRiskAlert;
  layout: LiveMapOverlayLayout;
  onPress: (alert: LiveRouteRiskAlert) => void;
}

export function LiveRouteRiskAlertCard({
  alert,
  layout,
  onPress,
}: LiveRouteRiskAlertCardProps) {
  const presentation = createLiveRouteRiskAlertPresentation(alert);
  const areaLabel = createAlertAreaLabel(alert);
  const tone: RiskCardTone =
    alert.zone.avoidanceSeverity === "critical"
      ? "critical"
      : presentation.tone;
  const routeAlert = isRouteAlertZone(alert.zone);

  return (
    <Pressable
      accessibilityHint={routeAlert
        ? "Opens the SafeRoute route-alert details."
        : "Opens the SafeRoute risk-area details."}
      accessibilityLabel={presentation.accessibilityLabel}
      accessibilityRole="button"
      testID={uiTestIds.liveMapRiskAlert}
      style={({ pressed }) => [
        styles.riskCard,
        {
          bottom: resolveRiskCardBottom(layout),
        },
        layout.isCompact ? styles.riskCardCompact : null,
        routeAlert ? styles.routeAlertCard : null,
        riskCardToneStyle(tone),
        pressed ? styles.riskCardPressed : null,
      ]}
      onPress={(event) => {
        event.stopPropagation();
        onPress(alert);
      }}
      onPressIn={(event) => {
        event.stopPropagation();
        onPress(alert);
      }}
    >
      <View
        style={[
          styles.riskIconTile,
          routeAlert ? styles.routeAlertIconTile : null,
          riskIconTileToneStyle(tone),
        ]}
      >
        {routeAlert ? (
          <CircleAlert
            accessibilityElementsHidden
            color={riskToneColor(presentation.tone)}
            size={18}
            strokeWidth={2.2}
          />
        ) : (
          <AlertTriangle
            accessibilityElementsHidden
            color={riskToneColor(presentation.tone)}
            size={22}
            strokeWidth={2}
          />
        )}
      </View>
      <View style={styles.riskCopy}>
        <View style={styles.riskTitleRow}>
          <Text numberOfLines={1} style={styles.riskTitle}>
            {presentation.zoneTitle}
          </Text>
          <ChevronRight
            accessibilityElementsHidden
            color={colors.muted}
            size={17}
            strokeWidth={2.2}
          />
        </View>
        <Text numberOfLines={1} style={styles.riskEyebrow}>
          {`${presentation.title} · ${presentation.metaLabel} · ${areaLabel} · ${presentation.detailLabel}`}
        </Text>
      </View>
    </Pressable>
  );
}

function resolveRiskCardBottom(
  layout: LiveMapOverlayLayout,
): number {
  return layout.isCompact ? 128 : 136;
}

type RiskCardTone = "low" | "medium" | "high" | "critical";

function riskCardToneStyle(tone: RiskCardTone) {
  if (tone === "critical") {
    return styles.riskCardHigh;
  }

  if (tone === "high" || tone === "medium") {
    return styles.riskCardMedium;
  }

  return styles.riskCardLow;
}

function createAlertAreaLabel(alert: LiveRouteRiskAlert): string {
  if (isRouteAlertZone(alert.zone)) {
    return "Route segment";
  }

  if (alert.proximity.areaShape === "polygon") {
    return "Mapped area";
  }

  return `${formatDistance(alert.proximity.radiusMeters)} radius`;
}

function riskIconTileToneStyle(tone: RiskCardTone) {
  if (tone === "critical") {
    return styles.riskIconTileHigh;
  }

  if (tone === "high" || tone === "medium") {
    return styles.riskIconTileMedium;
  }

  return styles.riskIconTileLow;
}

function riskToneColor(tone: RiskCardTone): string {
  if (tone === "critical") {
    return colors.danger;
  }

  if (tone === "high" || tone === "medium") {
    return colors.amber;
  }

  return colors.info;
}
