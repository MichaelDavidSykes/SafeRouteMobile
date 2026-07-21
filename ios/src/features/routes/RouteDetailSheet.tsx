import { useEffect, useRef } from "react";
import { CarFront, Route as RouteIcon, UsersRound, X } from "lucide-react-native";
import { Animated, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import {
  createRouteCardMetaLabel,
  createRouteCardPresentation,
} from "./routeCardPresentation";
import { routeDetailSheetStyles as styles } from "./RouteDetailSheet.styles";
import { colors } from "../../theme";

const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);

interface RouteDetailSheetProps {
  onClose: () => void;
  route: SavedSafeRoutePlan | null;
}

export function RouteDetailSheet({ onClose, route }: RouteDetailSheetProps) {
  const viewport = useWindowDimensions();
  const sheetTranslateY = useRef(new Animated.Value(viewport.height)).current;

  useEffect(() => {
    if (!route) {
      sheetTranslateY.setValue(viewport.height);
      return;
    }

    sheetTranslateY.setValue(viewport.height);
    Animated.spring(sheetTranslateY, {
      damping: 24,
      mass: 0.9,
      stiffness: 220,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [route, sheetTranslateY, viewport.height]);

  if (!route) {
    return null;
  }

  const presentation = createRouteCardPresentation(route, false);
  const assignment = createRouteCardMetaLabel(
    route.operation,
    route.convoyCallsign,
  );
  const statusStyle =
    route.status === "ready"
      ? styles.statusReady
      : route.status === "in-progress"
        ? styles.statusLive
        : styles.statusPlanned;
  const statusTextStyle =
    route.status === "ready"
      ? styles.statusTextReady
      : route.status === "in-progress"
        ? styles.statusTextLive
        : styles.statusTextPlanned;
  const statusDotStyle =
    route.status === "ready"
      ? styles.statusDotReady
      : route.status === "in-progress"
        ? styles.statusDotLive
        : styles.statusDotPlanned;

  return (
    <Modal
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close route details"
          accessibilityRole="button"
          style={styles.scrim}
          onPress={onClose}
        />
        <AnimatedSafeAreaView
          accessibilityViewIsModal
          edges={["bottom"]}
          onAccessibilityEscape={onClose}
          style={[
            styles.sheet,
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
          testID="safe-route-detail-sheet"
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.handle}
          />
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <View style={styles.headerIconTile}>
                <RouteIcon accessibilityElementsHidden color={colors.appleBlue} size={28} strokeWidth={1.9} />
              </View>
              <View style={styles.headerCopy}>
                <Text numberOfLines={3} style={styles.title}>
                  {presentation.titleLabel}
                </Text>
                <View style={styles.headerMetaRow}>
                  <View style={[styles.statusPill, statusStyle]}>
                    <View style={[styles.statusDot, statusDotStyle]} />
                    <Text
                      numberOfLines={1}
                      style={[styles.statusText, statusTextStyle]}
                    >
                      {presentation.statusLabel}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={styles.updatedLabel}>
                    {route.updatedAtLabel || "Updated"}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityLabel="Close route details"
                accessibilityRole="button"
                hitSlop={6}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed ? styles.closeButtonPressed : null,
                ]}
                onPress={onClose}
              >
                <X accessibilityElementsHidden color={colors.muted} size={15} strokeWidth={2.2} />
              </Pressable>
            </View>

            <View style={styles.endpointGroup}>
              <DetailRow label="From" tone="origin" value={route.origin || "Pending"} />
              <View style={styles.divider} />
              <DetailRow label="To" tone="destination" value={route.destination || "Pending"} />
            </View>

            <View style={styles.statsRow}>
              <Stat fallbackLabel="ETA" metric={route.route.eta || "Pending"} />
              <View style={styles.statDivider} />
              <Stat fallbackLabel="Distance" metric={route.route.distance || "Pending"} />
              <View style={styles.statDivider} />
              <Stat label="risks" value={String(route.riskZones.length)} />
            </View>

            {assignment ? (
              <View style={styles.assignment}>
                <View style={styles.assignmentIconTile}>
                  <CarFront accessibilityElementsHidden color={colors.appleBlue} size={21} strokeWidth={1.8} />
                </View>
                <View style={styles.assignmentCopy}>
                  <Text style={styles.detailLabel}>Assigned vehicle / operation</Text>
                  <Text style={styles.assignmentValue}>{assignment}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.assignment}>
              <View style={styles.assignmentIconTile}>
                <UsersRound accessibilityElementsHidden color={colors.inkSoft} size={21} strokeWidth={1.8} />
              </View>
              <View style={styles.assignmentCopy}>
                <Text style={styles.detailLabel}>Assigned team</Text>
                <Text style={styles.assignmentValue}>Review the convoy manifest for current crew.</Text>
              </View>
            </View>
          </ScrollView>

          <Pressable
            accessibilityLabel="Done viewing route details"
            accessibilityRole="button"
            testID="safe-route-detail-done"
            style={({ pressed }) => [
              styles.doneButton,
              pressed ? styles.doneButtonPressed : null,
            ]}
            onPress={onClose}
          >
            <Text numberOfLines={1} style={styles.doneButtonText}>
              Done
            </Text>
          </Pressable>
        </AnimatedSafeAreaView>
      </View>
    </Modal>
  );
}

function DetailRow({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "destination" | "origin";
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={[styles.endpointMarker, tone === "origin" ? styles.endpointMarkerOrigin : styles.endpointMarkerDestination]} />
      <View style={styles.endpointCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function Stat({
  fallbackLabel,
  label,
  metric,
  value,
}: {
  fallbackLabel?: string;
  label?: string;
  metric?: string;
  value?: string;
}) {
  const parsedMetric = metric ? splitMetric(metric, fallbackLabel || "") : null;
  return (
    <View style={styles.stat}>
      <Text numberOfLines={2} style={styles.statValue}>
        {parsedMetric?.value || value}
      </Text>
      <Text numberOfLines={1} style={styles.statLabel}>
        {parsedMetric?.label || label}
      </Text>
    </View>
  );
}

function splitMetric(metric: string, fallbackLabel: string) {
  const normalized = metric.trim();
  const match = normalized.match(/^([\d.,]+)\s*(.*)$/);
  if (!match) {
    return { label: fallbackLabel, value: normalized };
  }

  return {
    label: match[2].trim().toLowerCase() || fallbackLabel,
    value: match[1],
  };
}
