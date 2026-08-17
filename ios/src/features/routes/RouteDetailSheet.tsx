import { useCallback, useRef } from "react";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { CarFront, Route as RouteIcon, UsersRound, X } from "lucide-react-native";
import { Modal, Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  SafeRouteBottomSheet,
  type SafeRouteBottomSheetRef,
} from "../../components/SafeRouteBottomSheet";
import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import {
  createRouteCardMetaLabel,
  createRouteCardPresentation,
} from "./routeCardPresentation";
import { routeDetailSheetStyles as styles } from "./RouteDetailSheet.styles";
import { colors } from "../../theme";

const ROUTE_DETAIL_SNAP_POINTS = ["86%"];

interface RouteDetailSheetProps {
  onClose: () => void;
  route: SavedSafeRoutePlan | null;
}

export function RouteDetailSheet({ onClose, route }: RouteDetailSheetProps) {
  const sheetRef = useRef<SafeRouteBottomSheetRef>(null);
  const dismissSheet = useCallback(() => {
    sheetRef.current?.close();
  }, []);

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
      onRequestClose={dismissSheet}
    >
      <GestureHandlerRootView style={styles.overlay}>
        <SafeRouteBottomSheet
          ref={sheetRef}
          accessibilityLabel="Route details"
          accessibilityViewIsModal
          animateOnMount
          backdrop
          dismissOnBackdropPress
          enablePanDownToClose
          index={0}
          onClose={onClose}
          snapPoints={ROUTE_DETAIL_SNAP_POINTS}
          surfaceColor={colors.sheet}
        >
          <SafeAreaView
            accessibilityLabel="Route details"
            accessibilityViewIsModal
            edges={["bottom"]}
            onAccessibilityEscape={dismissSheet}
            style={styles.sheetContent}
            testID="safe-route-detail-sheet"
          >
            <BottomSheetScrollView
              bounces={false}
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              style={styles.scrollView}
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
                onPress={dismissSheet}
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
            </BottomSheetScrollView>

            <Pressable
              accessibilityLabel="Done viewing route details"
              accessibilityRole="button"
              testID="safe-route-detail-done"
              style={({ pressed }) => [
                styles.doneButton,
                pressed ? styles.doneButtonPressed : null,
              ]}
              onPress={dismissSheet}
            >
              <Text numberOfLines={1} style={styles.doneButtonText}>
                Done
              </Text>
            </Pressable>
          </SafeAreaView>
        </SafeRouteBottomSheet>
      </GestureHandlerRootView>
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
