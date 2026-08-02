import { AlertTriangle } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import {
  createLiveRouteRiskAlertPresentation,
  type LiveRouteRiskAlert,
} from "./routeRisk";
import { formatDistance } from "./routeProgress";
import { riskCardStyles as styles } from "./LiveMapRiskCard.styles";
import { uiTestIds } from "../../testing/uiTestIds";
import { colors } from "../../theme";

interface LiveRouteRiskAlertCardProps {
  alert: LiveRouteRiskAlert;
  layout: LiveMapOverlayLayout;
  onPress: () => void;
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

  return (
    <Pressable
      accessibilityHint="Opens the SafeRoute risk-area details."
      accessibilityLabel={presentation.accessibilityLabel}
      accessibilityRole="button"
      testID={uiTestIds.liveMapRiskAlert}
      style={({ pressed }) => [
        styles.riskCard,
        {
          bottom: resolveRiskCardBottom(layout),
        },
        layout.isCompact ? styles.riskCardCompact : null,
        riskCardToneStyle(tone),
        pressed ? styles.riskCardPressed : null,
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.riskIconTile,
          riskIconTileToneStyle(tone),
        ]}
      >
        <AlertTriangle
          accessibilityElementsHidden
          color={riskToneColor(presentation.tone)}
          size={22}
          strokeWidth={2}
        />
      </View>
      <View style={styles.riskCopy}>
        <View style={styles.riskTitleRow}>
          <View style={styles.riskTitleCopy}>
            <Text numberOfLines={1} style={styles.riskEyebrow}>
              {presentation.title}
            </Text>
            <Text numberOfLines={1} style={styles.riskTitle}>
              {presentation.zoneTitle}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.riskDistance}>
            {presentation.detailLabel}
          </Text>
        </View>
        <View style={styles.riskChipRow}>
          <View
            style={[
              styles.riskChip,
              riskChipToneStyle(tone),
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.riskChipText, riskTextToneStyle(tone)]}
            >
              {riskSeverityLabel(tone)}
            </Text>
          </View>
          <View style={[styles.riskChip, styles.riskAreaChip]}>
            <Text numberOfLines={1} style={styles.riskAreaChipText}>
              {areaLabel}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function resolveRiskCardBottom(layout: LiveMapOverlayLayout): number {
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
  if (
    alert.zone.shape?.trim().toLowerCase() === "route-alert" ||
    (alert.zone.routeSegmentCoordinates?.length || 0) > 1
  ) {
    return "Route segment";
  }

  if (alert.proximity.areaShape === "polygon") {
    return "Mapped area";
  }

  return `${formatDistance(alert.proximity.radiusMeters)} radius`;
}

function riskSeverityLabel(tone: RiskCardTone): string {
  if (tone === "critical") {
    return "Critical risk";
  }

  if (tone === "high") {
    return "High risk";
  }

  if (tone === "medium") {
    return "Medium risk";
  }

  return "Low risk";
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

function riskChipToneStyle(tone: RiskCardTone) {
  if (tone === "critical") {
    return styles.riskChipHigh;
  }

  if (tone === "high" || tone === "medium") {
    return styles.riskChipMedium;
  }

  return styles.riskChipLow;
}

function riskTextToneStyle(tone: RiskCardTone) {
  if (tone === "critical") {
    return styles.riskTextHigh;
  }

  if (tone === "high" || tone === "medium") {
    return styles.riskTextMedium;
  }

  return styles.riskTextLow;
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
