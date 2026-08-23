import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  BottomSheetScrollView,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ExternalLink,
  X,
} from "lucide-react-native";
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Extrapolation,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import {
  SafeRouteBottomSheet,
  type SafeRouteBottomSheetRef,
} from "../../components/SafeRouteBottomSheet";
import { uiTestIds } from "../../testing/uiTestIds";
import { chrome, colors, radius, typeScale } from "../../theme";
import type { RiskSeverity, RiskZone } from "./liveMapTypes";
import {
  createRiskZoneDetailPresentation,
  type RouteRiskProximity,
} from "./routeRisk";
import { formatDistance } from "./routeProgress";
import { isRouteAlertZone } from "./riskOverlayPresentation";
import { createRiskZoneExpandedPresentation } from "./riskDetailPresentation";

const RISK_DETAIL_SHEET_CONTENT_BOTTOM_PADDING = 14;

export function LiveMapRiskDetailCallout({
  bottomInset = chrome.tabBarHeight + 18,
  onDismiss,
  proximity,
  zone,
}: {
  bottomInset?: number;
  onDismiss: () => void;
  proximity?: RouteRiskProximity | null;
  zone: RiskZone;
}) {
  const presentation = createRiskZoneDetailPresentation({
    proximity: proximity || null,
    zone,
  });
  const areaLabel = createRiskAreaChipLabel(zone);
  const severityColor = resolveSeverityColor(presentation.tone);
  const routeAlert = isRouteAlertZone(zone);

  return (
    <LiveMapDetailCallout
      accessibilityLabel={presentation.accessibilityLabel}
      bottomInset={bottomInset}
      dismissAccessibilityLabel={routeAlert
        ? "Close route alert details"
        : "Close risk details"}
      dismissTestID={uiTestIds.liveMapRiskDetailDismiss}
      expandedContent={<RiskZoneExpandedContent zone={zone} />}
      expandedTestID={uiTestIds.liveMapRiskDetailExpanded}
      icon={routeAlert ? (
        <CircleAlert
          accessibilityElementsHidden
          color={severityColor}
          size={22}
          strokeWidth={2.2}
        />
      ) : (
        <AlertTriangle
          accessibilityElementsHidden
          color={severityColor}
          size={22}
          strokeWidth={2}
        />
      )}
      iconTileStyle={severityIconTileStyle(presentation.tone)}
      onDismiss={onDismiss}
      replayKey={zone.id}
      subtitle={routeAlert
        ? `Route alert · ${zone.category || "Safety intelligence"}`
        : zone.category || "Risk area"}
      testID={uiTestIds.liveMapRiskDetail}
      title={presentation.title}
    >
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

      <Text numberOfLines={2} style={styles.body}>
        {presentation.body}
      </Text>

      {proximity ? (
        <Text numberOfLines={1} style={styles.clearance}>
          {presentation.clearanceLabel}
        </Text>
      ) : null}
    </LiveMapDetailCallout>
  );
}

export function LiveMapRiskDetailContent({
  expanded,
  expandedPanelStyle,
  onDismiss,
  onToggleExpanded,
  proximity,
  zone,
}: {
  expanded: boolean;
  expandedPanelStyle?: StyleProp<ViewStyle>;
  onDismiss: () => void;
  onToggleExpanded: () => void;
  proximity?: RouteRiskProximity | null;
  zone: RiskZone;
}) {
  const presentation = createRiskZoneDetailPresentation({
    proximity: proximity || null,
    zone,
  });
  const areaLabel = createRiskAreaChipLabel(zone);
  const severityColor = resolveSeverityColor(presentation.tone);
  const routeAlert = isRouteAlertZone(zone);

  return (
    <LiveMapDetailContent
      accessibilityLabel={presentation.accessibilityLabel}
      dismissAccessibilityLabel={routeAlert
        ? "Close route alert details"
        : "Close risk details"}
      dismissTestID={uiTestIds.liveMapRiskDetailDismiss}
      expanded={expanded}
      expandedContent={<RiskZoneExpandedContent zone={zone} />}
      expandedPanelStyle={expandedPanelStyle}
      expandedTestID={uiTestIds.liveMapRiskDetailExpanded}
      icon={routeAlert ? (
        <CircleAlert
          accessibilityElementsHidden
          color={severityColor}
          size={22}
          strokeWidth={2.2}
        />
      ) : (
        <AlertTriangle
          accessibilityElementsHidden
          color={severityColor}
          size={22}
          strokeWidth={2}
        />
      )}
      iconTileStyle={severityIconTileStyle(presentation.tone)}
      onDismiss={onDismiss}
      onToggleExpanded={onToggleExpanded}
      subtitle={routeAlert
        ? `Route alert · ${zone.category || "Safety intelligence"}`
        : zone.category || "Risk area"}
      testID={uiTestIds.liveMapRiskDetail}
      title={presentation.title}
    >
      <View style={styles.chipRow}>
        <View style={[styles.chip, severityChipStyle(presentation.tone)]}>
          <View style={[styles.severityDot, { backgroundColor: severityColor }]} />
          <Text
            numberOfLines={1}
            style={[styles.chipText, severityTextStyle(presentation.tone)]}
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

      <Text numberOfLines={2} style={styles.body}>
        {presentation.body}
      </Text>

      {proximity ? (
        <Text numberOfLines={1} style={styles.clearance}>
          {presentation.clearanceLabel}
        </Text>
      ) : null}
    </LiveMapDetailContent>
  );
}

export function LiveMapDetailContent({
  accessibilityLabel,
  children,
  dismissAccessibilityLabel,
  dismissTestID,
  expanded = false,
  expandedContent,
  expandedPanelStyle,
  expandedTestID,
  groupedAccessibility = false,
  icon,
  iconTileStyle,
  onDismiss,
  onToggleExpanded,
  subtitle,
  testID,
  title,
}: {
  accessibilityLabel: string;
  children?: ReactNode;
  dismissAccessibilityLabel: string;
  dismissTestID?: string;
  expanded?: boolean;
  expandedContent?: ReactNode;
  expandedPanelStyle?: StyleProp<ViewStyle>;
  expandedTestID?: string;
  groupedAccessibility?: boolean;
  icon: ReactNode;
  iconTileStyle?: StyleProp<ViewStyle>;
  onDismiss: () => void;
  onToggleExpanded?: () => void;
  subtitle: string;
  testID?: string;
  title: string;
}) {
  return (
    <View>
      <View
        accessible={groupedAccessibility && !expanded}
        accessibilityLabel={
          groupedAccessibility && !expanded ? accessibilityLabel : undefined
        }
        testID={testID}
      >
        <View style={styles.titleRow}>
          <View style={[styles.iconTile, iconTileStyle]}>{icon}</View>
          <View
            accessible={!groupedAccessibility || expanded}
            accessibilityLabel={
              !groupedAccessibility || expanded
                ? accessibilityLabel
                : undefined
            }
            style={styles.titleCopy}
          >
            <Text numberOfLines={2} style={styles.title}>{title}</Text>
            <Text numberOfLines={1} style={styles.category}>{subtitle}</Text>
          </View>
          <Pressable
            accessibilityLabel={dismissAccessibilityLabel}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onDismiss}
            testID={dismissTestID}
            style={({ pressed }) => [
              styles.dismiss,
              pressed ? styles.dismissPressed : null,
            ]}
          >
            <X
              accessibilityElementsHidden
              color={colors.muted}
              size={14}
              strokeWidth={2.2}
            />
          </Pressable>
        </View>

        {children}

        {expandedContent && onToggleExpanded ? (
          <Pressable
            accessibilityLabel={expanded
              ? "Collapse detailed risk intelligence"
              : "Expand detailed risk intelligence"}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={onToggleExpanded}
            style={({ pressed }) => [
              styles.disclosureHint,
              pressed ? styles.disclosureHintPressed : null,
            ]}
          >
            {expanded ? (
              <ChevronDown
                accessibilityElementsHidden
                color={colors.appleBlue}
                size={15}
                strokeWidth={2.2}
              />
            ) : (
              <ChevronUp
                accessibilityElementsHidden
                color={colors.appleBlue}
                size={15}
                strokeWidth={2.2}
              />
            )}
            <Text style={styles.disclosureHintText}>
              {expanded
                ? "Swipe down for summary"
                : "Swipe up for full intelligence"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {expandedContent ? (
        <Animated.View
          accessibilityElementsHidden={!expanded}
          importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
          pointerEvents={expanded ? "auto" : "none"}
          style={[styles.expandedPanel, expandedPanelStyle]}
          testID={expandedTestID}
        >
          {expandedContent}
        </Animated.View>
      ) : null}
    </View>
  );
}

export function LiveMapDetailCallout({
  accessibilityLabel,
  bottomInset = chrome.tabBarHeight + 18,
  children,
  dismissAccessibilityLabel,
  dismissTestID,
  expandedContent,
  expandedTestID,
  groupedAccessibility = false,
  icon,
  iconTileStyle,
  onDismiss,
  replayKey,
  subtitle,
  testID,
  title,
}: {
  accessibilityLabel: string;
  bottomInset?: number;
  children?: ReactNode;
  dismissAccessibilityLabel: string;
  dismissTestID?: string;
  expandedContent?: ReactNode;
  expandedTestID?: string;
  groupedAccessibility?: boolean;
  icon: ReactNode;
  iconTileStyle?: StyleProp<ViewStyle>;
  onDismiss: () => void;
  replayKey: string;
  subtitle: string;
  testID?: string;
  title: string;
}) {
  const viewport = useWindowDimensions();
  const sheetRef = useRef<SafeRouteBottomSheetRef>(null);
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  const dismissalNotifiedRef = useRef(false);
  const previousReplayKeyRef = useRef(replayKey);
  const [sheetIndex, setSheetIndex] = useState(0);
  const animatedSheetIndex = useSharedValue(-1);

  const availableSheetHeight = Math.max(
    240,
    viewport.height - bottomInset - 12,
  );
  const preferredCompactHeight = expandedContent ? 252 : 240;
  const compactSnapPoint = Math.min(
    preferredCompactHeight,
    Math.max(220, availableSheetHeight - (expandedContent ? 160 : 0)),
  );
  const expandedSnapPoint = Math.min(500, availableSheetHeight);
  const hasExpandedSnapPoint = Boolean(
    expandedContent && expandedSnapPoint > compactSnapPoint + 20,
  );
  const snapPoints = useMemo(
    () => hasExpandedSnapPoint
      ? [compactSnapPoint, expandedSnapPoint]
      : [expandedContent ? expandedSnapPoint : compactSnapPoint],
    [
      compactSnapPoint,
      expandedContent,
      expandedSnapPoint,
      hasExpandedSnapPoint,
    ],
  );
  const expanded = Boolean(
    expandedContent && (!hasExpandedSnapPoint || sheetIndex === 1),
  );
  const expandedPanelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: hasExpandedSnapPoint
      ? interpolate(
          animatedSheetIndex.value,
          [0, 0.45, 1],
          [0, 0, 1],
          Extrapolation.CLAMP,
        )
      : 1,
  }), [hasExpandedSnapPoint]);

  useEffect(() => {
    if (previousReplayKeyRef.current === replayKey) {
      return;
    }

    previousReplayKeyRef.current = replayKey;
    dismissalNotifiedRef.current = false;
    setSheetIndex(0);
    sheetRef.current?.snapToIndex(0);
  }, [replayKey]);

  const handleSheetChange = useCallback((index: number) => {
    const nextIndex = Math.max(0, index);
    if (nextIndex === 0) {
      scrollRef.current?.scrollTo({ animated: false, y: 0 });
    }
    setSheetIndex(nextIndex);
  }, []);
  const handleSheetClosed = useCallback(() => {
    if (dismissalNotifiedRef.current) {
      return;
    }

    dismissalNotifiedRef.current = true;
    onDismiss();
  }, [onDismiss]);
  const handleDismissRequest = useCallback(() => {
    sheetRef.current?.close();
  }, []);
  const handleDisclosurePress = useCallback(() => {
    if (!hasExpandedSnapPoint) {
      return;
    }

    sheetRef.current?.snapToIndex(expanded ? 0 : 1);
  }, [expanded, hasExpandedSnapPoint]);

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, styles.overlay]}
    >
      <SafeRouteBottomSheet
        animateOnMount
        animatedIndex={animatedSheetIndex}
        bottomInset={bottomInset}
        detached
        enablePanDownToClose={!hasExpandedSnapPoint || sheetIndex === 0}
        index={0}
        key={replayKey}
        onChange={handleSheetChange}
        onClose={handleSheetClosed}
        overrideReduceMotion={ReduceMotion.System}
        ref={sheetRef}
        snapPoints={snapPoints}
        style={styles.sheet}
      >
        <BottomSheetScrollView
          ref={scrollRef}
          contentContainerStyle={styles.sheetContent}
          scrollEnabled={expanded}
          showsVerticalScrollIndicator={false}
        >
          <View
            accessible={groupedAccessibility && !expanded}
            accessibilityLabel={
              groupedAccessibility && !expanded ? accessibilityLabel : undefined
            }
            testID={testID}
          >
            <View style={styles.titleRow}>
              <View style={[styles.iconTile, iconTileStyle]}>
                {icon}
              </View>
              <View
                accessible={!groupedAccessibility || expanded}
                accessibilityLabel={
                  !groupedAccessibility || expanded
                    ? accessibilityLabel
                    : undefined
                }
                style={styles.titleCopy}
              >
                <Text numberOfLines={2} style={styles.title}>
                  {title}
                </Text>
                <Text numberOfLines={1} style={styles.category}>
                  {subtitle}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={dismissAccessibilityLabel}
                accessibilityRole="button"
                hitSlop={8}
                onPress={handleDismissRequest}
                testID={dismissTestID}
                style={({ pressed }) => [
                  styles.dismiss,
                  pressed ? styles.dismissPressed : null,
                ]}
              >
                <X
                  accessibilityElementsHidden
                  color={colors.muted}
                  size={14}
                  strokeWidth={2.2}
                />
              </Pressable>
            </View>

            {children}

            {expandedContent && hasExpandedSnapPoint ? (
              <Pressable
                accessibilityLabel={expanded
                  ? "Collapse detailed risk intelligence"
                  : "Expand detailed risk intelligence"}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={handleDisclosurePress}
                style={({ pressed }) => [
                  styles.disclosureHint,
                  pressed ? styles.disclosureHintPressed : null,
                ]}
              >
                {expanded ? (
                  <ChevronDown
                    accessibilityElementsHidden
                    color={colors.appleBlue}
                    size={15}
                    strokeWidth={2.2}
                  />
                ) : (
                  <ChevronUp
                    accessibilityElementsHidden
                    color={colors.appleBlue}
                    size={15}
                    strokeWidth={2.2}
                  />
                )}
                <Text style={styles.disclosureHintText}>
                  {expanded
                    ? "Swipe down for summary"
                    : "Swipe up for full intelligence"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {expandedContent ? (
            <Animated.View
              accessibilityElementsHidden={!expanded}
              importantForAccessibility={
                expanded ? "auto" : "no-hide-descendants"
              }
              pointerEvents={expanded ? "auto" : "none"}
              style={[styles.expandedPanel, expandedPanelAnimatedStyle]}
              testID={expandedTestID}
            >
              {expandedContent}
            </Animated.View>
          ) : null}
        </BottomSheetScrollView>
      </SafeRouteBottomSheet>
    </View>
  );
}

function RiskZoneExpandedContent({ zone }: { zone: RiskZone }) {
  const detail = createRiskZoneExpandedPresentation(zone);
  const routeAlert = isRouteAlertZone(zone);
  return (
    <View>
      <View style={styles.expandedHeadingRow}>
        <Text style={styles.expandedHeading}>
          {routeAlert ? "Route intelligence" : "Risk intelligence"}
        </Text>
        <View style={styles.intelligenceBadge}>
          <Text style={styles.intelligenceBadgeText}>
            {routeAlert ? "ROUTE ALERT" : "AREA RECORD"}
          </Text>
        </View>
      </View>

      <View style={styles.descriptionBlock}>
        <Text style={styles.detailSectionHeading}>Full description</Text>
        <Text selectable style={styles.descriptionText}>
          {detail.description}
        </Text>
      </View>

      <View style={styles.factList}>
        {detail.facts.map((fact) => (
          <View key={fact.label} style={styles.factRow}>
            <Text style={styles.factLabel}>{fact.label}</Text>
            <Text selectable style={styles.factValue}>{fact.value}</Text>
          </View>
        ))}
      </View>

      <RiskDetailSections
        heading="Context"
        sections={detail.context}
      />
      <RiskDetailSections
        heading="Escalation indicators"
        sections={detail.indicators}
      />
      <RiskSourceLinks sources={detail.sources} />
      {detail.actions.length ? (
        <View style={styles.detailSectionGroup}>
          <Text style={styles.detailSectionHeading}>Recommended actions</Text>
          {detail.actions.map((action, index) => (
            <View key={`${index}-${action}`} style={styles.actionRow}>
              <View style={styles.actionBullet} />
              <Text style={styles.actionText}>{action}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function RiskSourceLinks({
  sources,
}: {
  sources: Array<{ description: string; label: string; url: string }>;
}) {
  if (!sources.length) {
    return null;
  }
  return (
    <View style={styles.detailSectionGroup}>
      <Text style={styles.detailSectionHeading}>
        Sources · {sources.length}
      </Text>
      {sources.map((source) => (
        <Pressable
          accessibilityHint="Opens the original source outside SafeRoute"
          accessibilityLabel={`Open source: ${source.label}`}
          accessibilityRole="link"
          key={source.url}
          onPress={() => {
            void openRiskSource(source.url);
          }}
          style={({ pressed }) => [
            styles.sourceLink,
            pressed ? styles.sourceLinkPressed : null,
          ]}
        >
          <View style={styles.sourceCopy}>
            <Text numberOfLines={1} style={styles.sourceLabel}>
              {source.label}
            </Text>
            <Text numberOfLines={2} style={styles.sourceDescription}>
              {source.description}
            </Text>
          </View>
          <ExternalLink
            accessibilityElementsHidden
            color={colors.appleBlue}
            size={16}
            strokeWidth={2}
          />
        </Pressable>
      ))}
    </View>
  );
}

async function openRiskSource(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      "Unable to open source",
      "SafeRoute couldn't open this source link on your device."
    );
  }
}

function RiskDetailSections({
  heading,
  sections,
}: {
  heading: string;
  sections: Array<{ label: string; value: string }>;
}) {
  if (!sections.length) {
    return null;
  }
  return (
    <View style={styles.detailSectionGroup}>
      <Text style={styles.detailSectionHeading}>{heading}</Text>
      {sections.map((section, index) => (
        <View key={`${index}-${section.label}`} style={styles.detailSection}>
          <Text style={styles.detailSectionLabel}>{section.label}</Text>
          <Text selectable style={styles.detailSectionValue}>{section.value}</Text>
        </View>
      ))}
    </View>
  );
}

function createRiskAreaChipLabel(zone: RiskZone): string {
  if (isRouteAlertZone(zone)) {
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
  sheet: {
    marginHorizontal: 12,
  },
  sheetContent: {
    paddingHorizontal: 18,
    paddingBottom: RISK_DETAIL_SHEET_CONTENT_BOTTOM_PADDING,
  },
  disclosureHint: {
    minHeight: 28,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: radius.pill,
  },
  disclosureHintPressed: {
    backgroundColor: colors.control,
  },
  disclosureHintText: {
    color: colors.appleBlue,
    fontSize: 11.5,
    fontWeight: "600",
  },
  expandedPanel: {
    paddingTop: 12,
    paddingBottom: 3,
  },
  expandedHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  expandedHeading: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "700",
  },
  descriptionBlock: {
    marginBottom: 14,
  },
  descriptionText: {
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  intelligenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.infoSoft,
  },
  intelligenceBadgeText: {
    color: colors.infoText,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  factList: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.control,
  },
  factRow: {
    minHeight: 39,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  factLabel: {
    flexShrink: 0,
    color: colors.muted,
    fontSize: 11.5,
    fontWeight: "600",
    lineHeight: 17,
  },
  factValue: {
    flex: 1,
    color: colors.ink,
    fontSize: 11.5,
    fontWeight: "600",
    lineHeight: 17,
    textAlign: "right",
  },
  detailSectionGroup: {
    marginTop: 17,
  },
  detailSectionHeading: {
    marginBottom: 7,
    color: colors.muted,
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  detailSection: {
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailSectionLabel: {
    color: colors.ink,
    fontSize: 12.5,
    fontWeight: "700",
    lineHeight: 17,
  },
  detailSectionValue: {
    marginTop: 3,
    color: colors.inkSoft,
    fontSize: 11.5,
    lineHeight: 17,
  },
  sourceLink: {
    minHeight: 54,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.control,
  },
  sourceLinkPressed: {
    backgroundColor: colors.controlStrong,
    transform: [{ scale: 0.99 }],
  },
  sourceCopy: {
    flex: 1,
    minWidth: 0,
  },
  sourceLabel: {
    color: colors.appleBlue,
    fontSize: 12.5,
    fontWeight: "700",
    lineHeight: 17,
  },
  sourceDescription: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 15,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingVertical: 5,
  },
  actionBullet: {
    width: 6,
    height: 6,
    marginTop: 6,
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
  },
  actionText: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: 11.5,
    lineHeight: 17,
  },
  iconTile: {
    width: 40,
    height: 40,
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
    gap: 10,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.ink,
    fontSize: 17,
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
    marginTop: 11,
    color: colors.inkSoft,
    fontSize: 13.5,
    fontWeight: "400",
    lineHeight: 20,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
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
