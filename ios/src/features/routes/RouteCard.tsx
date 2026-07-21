import { CalendarDays } from "lucide-react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type {
  SavedSafeRoutePlan,
  SavedRouteStatus,
} from "../live-map/liveMapTypes";
import { colors } from "../../theme";
import { styles } from "./RouteCard.styles";
import {
  createRouteCardPresentation,
  createRouteStatusLabel,
} from "./routeCardPresentation";

interface RouteCardProps {
  cachedReviewAccessibilityLabel?: string | null;
  loading: boolean;
  onMapPress?: () => void;
  onPress: () => void;
  route: SavedSafeRoutePlan;
}

export function RouteCard({
  cachedReviewAccessibilityLabel,
  loading,
  onMapPress,
  onPress,
  route,
}: RouteCardProps) {
  const presentation = createRouteCardPresentation(
    route,
    loading,
    cachedReviewAccessibilityLabel,
  );
  const riskLabel = createVisibleRiskLabel(route.route.riskLabel);
  const riskTone = resolveRiskTone(route.route.riskLabel);
  const metricLabel = [route.route.eta.trim(), route.route.distance.trim()]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityHint="Shows route details"
        accessibilityLabel={presentation.accessibilityLabel}
        accessibilityRole="button"
        testID={presentation.testID}
        style={({ pressed }) => [
          styles.cardBody,
          pressed ? styles.cardBodyPressed : null,
        ]}
        onPress={onPress}
      >
        <View style={styles.cardCopy}>
          <View style={styles.routeTitleRow}>
            <Text numberOfLines={2} style={styles.routeName}>
              {presentation.titleLabel}
            </Text>
            <StatusPill status={route.status} />
          </View>

          <Text numberOfLines={2} style={styles.routeEndpoint}>
            {presentation.endpointLabel}
          </Text>
          <View style={styles.updatedRow}>
            <CalendarDays
              accessibilityElementsHidden
              color={colors.muted}
              size={14}
              strokeWidth={1.9}
            />
            <Text numberOfLines={1} style={styles.updatedLabel}>
              {presentation.updatedLabel === "Updated"
                ? presentation.updatedLabel
                : `Updated ${presentation.updatedLabel}`}
            </Text>
          </View>
        </View>
      </Pressable>
      <View style={styles.routeFooter}>
        <Pressable
          accessible={false}
          style={({ pressed }) => [
            styles.footerDetailAction,
            pressed ? styles.footerDetailActionPressed : null,
          ]}
          onPress={onPress}
        >
          <View style={styles.routeSummary}>
            <Text numberOfLines={1} style={styles.routeSummaryMetric}>
              {metricLabel || "Route details pending"}
            </Text>
            <View style={styles.summarySeparator} />
            <View style={styles.riskSummary}>
              <View style={[styles.riskDot, riskDotStyle(riskTone)]} />
              <Text numberOfLines={1} style={[styles.riskText, riskTextStyle(riskTone)]}>
                {riskLabel}
              </Text>
            </View>
          </View>
        </Pressable>
        <Pressable
          accessibilityHint={presentation.accessibilityHint}
          accessibilityLabel={`${presentation.actionLabel} ${presentation.titleLabel}`}
          accessibilityRole="button"
          accessibilityState={{ busy: loading, disabled: loading }}
          disabled={loading}
          hitSlop={4}
          testID={`${presentation.testID}-map`}
          style={({ pressed }) => [
            styles.openButton,
            pressed && !loading ? styles.openButtonPressed : null,
            loading ? styles.openButtonLoading : null,
          ]}
          onPress={(event) => {
            event.stopPropagation();
            (onMapPress || onPress)();
          }}
        >
          {loading ? (
            <ActivityIndicator color={colors.appleBlue} size="small" />
          ) : null}
          <Text numberOfLines={1} style={styles.openButtonText}>
            {presentation.actionLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createVisibleRiskLabel(value: string): string {
  const normalized = value.trim() || "Risk";
  return /\brisk\b/i.test(normalized) ? normalized : `${normalized} risk`;
}

function resolveRiskTone(value: string): "high" | "low" | "medium" {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("high")) {
    return "high";
  }
  if (normalized.includes("low")) {
    return "low";
  }
  return "medium";
}

function riskDotStyle(tone: "high" | "low" | "medium") {
  if (tone === "high") {
    return styles.riskDotHigh;
  }
  if (tone === "low") {
    return styles.riskDotLow;
  }
  return styles.riskDotMedium;
}

function riskTextStyle(tone: "high" | "low" | "medium") {
  if (tone === "high") {
    return styles.riskTextHigh;
  }
  if (tone === "low") {
    return styles.riskTextLow;
  }
  return styles.riskTextMedium;
}

function StatusPill({ status }: { status: SavedRouteStatus }) {
  const statusLabel = createRouteStatusLabel(status);
  const statusStyle =
    status === "ready"
      ? styles.statusReady
      : status === "in-progress"
        ? styles.statusLive
        : styles.statusPlanned;
  const statusTextStyle =
    status === "ready"
      ? styles.statusTextReady
      : status === "in-progress"
        ? styles.statusTextLive
        : styles.statusTextPlanned;

  return (
    <View style={[styles.statusPill, statusStyle]}>
      <Text numberOfLines={1} style={[styles.statusText, statusTextStyle]}>
        {statusLabel}
      </Text>
    </View>
  );
}
