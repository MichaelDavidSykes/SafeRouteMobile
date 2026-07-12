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
  shouldShowRouteStatusPill,
} from "./routeCardPresentation";

interface RouteCardProps {
  loading: boolean;
  onPress: () => void;
  route: SavedSafeRoutePlan;
}

export function RouteCard({ loading, onPress, route }: RouteCardProps) {
  const presentation = createRouteCardPresentation(route, loading);

  return (
    <Pressable
      accessibilityHint={presentation.accessibilityHint}
      accessibilityLabel={presentation.accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
      disabled={loading}
      testID={presentation.testID}
      style={({ pressed }) => [
        styles.card,
        pressed && !loading ? styles.cardPressed : null,
        loading ? styles.cardLoading : null,
      ]}
      onPress={onPress}
    >
      <View style={styles.cardCopy}>
        <View style={styles.routeTitleRow}>
          <Text numberOfLines={2} style={styles.routeName}>
            {presentation.titleLabel}
          </Text>
          {shouldShowRouteStatusPill(route.status) ? (
            <StatusPill status={route.status} />
          ) : null}
        </View>

        <Text numberOfLines={1} style={styles.routeEndpoint}>
          {presentation.endpointLabel}
        </Text>
        <View style={styles.routeFooter}>
          <Text numberOfLines={1} style={styles.routeSummary}>
            {presentation.summaryLabel}
          </Text>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={styles.openButton}
          >
            {loading ? (
              <ActivityIndicator color={colors.appleBlue} size="small" />
            ) : null}
            <Text numberOfLines={1} style={styles.openButtonText}>
              {presentation.actionLabel}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
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
