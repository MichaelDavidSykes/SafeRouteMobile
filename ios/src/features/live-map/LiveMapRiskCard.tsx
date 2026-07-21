import { Pressable, Text, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import {
  createLiveRouteRiskAlertPresentation,
  type LiveRouteRiskAlert,
} from "./routeRisk";
import { riskCardStyles as styles } from "./LiveMapRiskCard.styles";
import { uiTestIds } from "../../testing/uiTestIds";

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

function resolveRiskCardBottom(layout: LiveMapOverlayLayout): number {
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
