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
        riskCardToneStyle(presentation.tone),
        pressed ? styles.riskCardPressed : null,
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.riskIconTile,
          riskIconTileToneStyle(presentation.tone),
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
              riskChipToneStyle(presentation.tone),
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.riskChipText, riskTextToneStyle(presentation.tone)]}
            >
              {riskSeverityLabel(presentation.tone)}
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

function riskCardToneStyle(tone: "low" | "medium" | "high") {
  if (tone === "high") {
    return styles.riskCardHigh;
  }

  if (tone === "medium") {
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

function riskSeverityLabel(tone: "low" | "medium" | "high"): string {
  if (tone === "high") {
    return "High risk";
  }

  if (tone === "medium") {
    return "Medium risk";
  }

  return "Low risk";
}

function riskIconTileToneStyle(tone: "low" | "medium" | "high") {
  if (tone === "high") {
    return styles.riskIconTileHigh;
  }

  if (tone === "medium") {
    return styles.riskIconTileMedium;
  }

  return styles.riskIconTileLow;
}

function riskChipToneStyle(tone: "low" | "medium" | "high") {
  if (tone === "high") {
    return styles.riskChipHigh;
  }

  if (tone === "medium") {
    return styles.riskChipMedium;
  }

  return styles.riskChipLow;
}

function riskTextToneStyle(tone: "low" | "medium" | "high") {
  if (tone === "high") {
    return styles.riskTextHigh;
  }

  if (tone === "medium") {
    return styles.riskTextMedium;
  }

  return styles.riskTextLow;
}

function riskToneColor(tone: "low" | "medium" | "high"): string {
  if (tone === "high") {
    return colors.danger;
  }

  if (tone === "medium") {
    return colors.amber;
  }

  return colors.info;
}
