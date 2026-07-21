import { useRef, type RefObject } from "react";
import { AlertTriangle, X } from "lucide-react-native";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView from "react-native-maps";

import { uiTestIds } from "../../testing/uiTestIds";
import { chrome, colors, radius, typeScale } from "../../theme";
import type { RiskSeverity, RiskZone } from "./liveMapTypes";
import {
  createRiskZoneDetailPresentation,
  type RouteRiskProximity,
} from "./routeRisk";
import { formatDistance } from "./routeProgress";
import {
  shouldDismissRiskDetailGesture,
  shouldStartRiskDetailDismissGesture,
} from "./riskDetailInteraction";

export function LiveMapRiskDetailCallout({
  bottomInset = chrome.tabBarHeight + 18,
  onDismiss,
  proximity,
  zone,
}: {
  bottomInset?: number;
  mapRef: RefObject<MapView | null>;
  onDismiss: () => void;
  proximity?: RouteRiskProximity | null;
  zone: RiskZone;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        shouldStartRiskDetailDismissGesture({
          translationX: gestureState.dx,
          translationY: gestureState.dy,
        }),
      onPanResponderMove: (_, gestureState) => {
        translateY.setValue(Math.max(0, gestureState.dy));
      },
      onPanResponderRelease: (_, gestureState) => {
        if (
          shouldDismissRiskDetailGesture({
            translationX: gestureState.dx,
            translationY: gestureState.dy,
            velocityY: gestureState.vy,
          })
        ) {
          Animated.timing(translateY, {
            duration: 160,
            toValue: 320,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished) {
              onDismissRef.current();
            }
          });
          return;
        }

        Animated.spring(translateY, {
          damping: 22,
          mass: 0.7,
          stiffness: 240,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          damping: 22,
          mass: 0.7,
          stiffness: 240,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;
  const presentation = createRiskZoneDetailPresentation({
    proximity: proximity || null,
    zone,
  });
  const areaLabel = createRiskAreaChipLabel(zone);
  const severityColor = resolveSeverityColor(presentation.tone);

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.overlay]}>
      <Animated.View
        {...panResponder.panHandlers}
        accessible
        accessibilityLabel={presentation.accessibilityLabel}
        testID={uiTestIds.liveMapRiskDetail}
        style={[
          styles.card,
          { bottom: bottomInset, transform: [{ translateY }] },
        ]}
      >
        <View accessibilityElementsHidden style={styles.dragHandleDock}>
          <View style={styles.dragHandle} />
        </View>
        <View style={styles.titleRow}>
          <View
            style={[
              styles.iconTile,
              severityIconTileStyle(presentation.tone),
            ]}
          >
            <AlertTriangle
              accessibilityElementsHidden
              color={severityColor}
              size={22}
              strokeWidth={2}
            />
          </View>
          <View style={styles.titleCopy}>
            <Text numberOfLines={2} style={styles.title}>
              {presentation.title}
            </Text>
            <Text numberOfLines={1} style={styles.category}>
              {zone.category || "Risk area"}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close risk details"
            accessibilityRole="button"
            hitSlop={8}
            testID={uiTestIds.liveMapRiskDetailDismiss}
            style={({ pressed }) => [
              styles.dismiss,
              pressed ? styles.dismissPressed : null,
            ]}
            onPress={onDismiss}
          >
            <X accessibilityElementsHidden color={colors.muted} size={14} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={styles.chipRow}>
          <View
            style={[
              styles.chip,
              severityChipStyle(presentation.tone),
            ]}
          >
            <View style={[styles.severityDot, { backgroundColor: severityColor }]} />
            <Text
              numberOfLines={1}
              style={[
                styles.chipText,
                severityTextStyle(presentation.tone),
              ]}
            >
              {createSeverityChipLabel(presentation.tone)}
            </Text>
          </View>
          <View style={[styles.chip, styles.areaChip]}>
            <Text numberOfLines={1} style={styles.areaChipText}>
              {areaLabel}
            </Text>
          </View>
        </View>

        <Text style={styles.body}>{presentation.body}</Text>

        {proximity ? (
          <Text numberOfLines={1} style={styles.clearance}>
            {presentation.clearanceLabel}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

function createRiskAreaChipLabel(zone: RiskZone): string {
  if (
    zone.shape?.trim().toLowerCase() === "route-alert" ||
    (zone.routeSegmentCoordinates?.length || 0) > 1
  ) {
    return "Route segment";
  }

  if ((zone.polygonCoordinates?.length || 0) > 2) {
    return "Mapped area";
  }

  return `Radius ${formatDistance(zone.radiusMeters)}`;
}

function createSeverityChipLabel(severity: RiskSeverity): string {
  if (severity === "high") {
    return "High severity";
  }

  if (severity === "medium") {
    return "Medium severity";
  }

  return "Low severity";
}

function resolveSeverityColor(severity: RiskSeverity): string {
  if (severity === "high") {
    return colors.danger;
  }

  if (severity === "medium") {
    return colors.amber;
  }

  return colors.info;
}

function severityIconTileStyle(severity: RiskSeverity) {
  if (severity === "high") {
    return styles.iconTileHigh;
  }

  if (severity === "medium") {
    return styles.iconTileMedium;
  }

  return styles.iconTileLow;
}

function severityChipStyle(severity: RiskSeverity) {
  if (severity === "high") {
    return styles.chipHigh;
  }

  if (severity === "medium") {
    return styles.chipMedium;
  }

  return styles.chipLow;
}

function severityTextStyle(severity: RiskSeverity) {
  if (severity === "high") {
    return styles.textHigh;
  }

  if (severity === "medium") {
    return styles.textMedium;
  }

  return styles.textLow;
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 50,
    elevation: 50,
  },
  card: {
    position: "absolute",
    right: 12,
    left: 12,
    padding: 18,
    borderRadius: radius.sheet,
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  dragHandleDock: {
    height: 10,
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: -10,
    marginBottom: 4,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  iconTile: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: 12,
  },
  iconTileHigh: {
    backgroundColor: colors.dangerSoft,
  },
  iconTileMedium: {
    backgroundColor: colors.amberSoft,
  },
  iconTileLow: {
    backgroundColor: colors.infoSoft,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
  },
  category: {
    marginTop: 3,
    color: colors.muted,
    fontSize: typeScale.sm,
    lineHeight: 17,
  },
  body: {
    marginTop: 13,
    color: colors.inkSoft,
    fontSize: 13.5,
    fontWeight: "400",
    lineHeight: 20,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  chip: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
  },
  severityDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  chipHigh: {
    backgroundColor: colors.dangerSoft,
  },
  chipMedium: {
    backgroundColor: colors.amberSoft,
  },
  chipLow: {
    backgroundColor: colors.infoSoft,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  textHigh: {
    color: colors.dangerText,
  },
  textMedium: {
    color: colors.amberText,
  },
  textLow: {
    color: colors.infoText,
  },
  areaChip: {
    backgroundColor: colors.control,
  },
  areaChipText: {
    color: "#6e6e73",
    fontSize: 12,
    fontWeight: "600",
  },
  clearance: {
    marginTop: 8,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "600",
  },
  dismiss: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.controlStrong,
  },
  dismissPressed: {
    backgroundColor: colors.controlStrong,
    transform: [{ scale: 0.96 }],
  },
});
