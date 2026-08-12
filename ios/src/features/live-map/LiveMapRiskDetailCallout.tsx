import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react";
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
  Animated,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
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
import { isRouteAlertZone } from "./riskOverlayPresentation";
import {
  resolveRiskDetailSheetGesture,
  shouldDismissRiskDetailGesture,
  shouldStartRiskDetailDismissGesture,
  shouldStartRiskDetailSheetGesture,
  type RiskDetailSheetStage,
} from "./riskDetailInteraction";
import { createRiskZoneExpandedPresentation } from "./riskDetailPresentation";
import {
  MotionEntrance,
  safeRouteEasing,
  safeRouteMotion,
  safeRouteSpring,
  useReduceMotionEnabled,
} from "../../motion/SafeRouteMotion";

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

      <Text style={styles.body}>{presentation.body}</Text>

      {proximity ? (
        <Text numberOfLines={1} style={styles.clearance}>
          {presentation.clearanceLabel}
        </Text>
      ) : null}
    </LiveMapDetailCallout>
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
  const expandedPanelHeight = Math.min(
    360,
    Math.max(180, viewport.height - bottomInset - 330)
  );
  const translateY = useRef(new Animated.Value(0)).current;
  const dismissProgress = useRef(new Animated.Value(0)).current;
  const expandedContentOpacity = useRef(new Animated.Value(0)).current;
  const animationRevisionRef = useRef(0);
  const dismissingRef = useRef(false);
  const transitioningRef = useRef(false);
  const currentTranslateYRef = useRef(0);
  const pendingExpansionOffsetRef = useRef<number | null>(null);
  const pendingCollapseResetRef = useRef(false);
  const [sheetStage, setSheetStage] = useState<RiskDetailSheetStage>("default");
  const sheetStageRef = useRef<RiskDetailSheetStage>("default");
  const expandableRef = useRef(Boolean(expandedContent));
  expandableRef.current = Boolean(expandedContent);
  const reduceMotionEnabled = useReduceMotionEnabled();
  const reduceMotionEnabledRef = useRef(reduceMotionEnabled);
  reduceMotionEnabledRef.current = reduceMotionEnabled;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const restoreTranslationRef = useRef<() => void>(() => undefined);
  restoreTranslationRef.current = () => {
    animationRevisionRef.current += 1;
    currentTranslateYRef.current = 0;
    translateY.stopAnimation();
    Animated.spring(translateY, {
      ...safeRouteSpring,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  };
  const transitionStageRef = useRef<(stage: RiskDetailSheetStage) => void>(
    () => undefined,
  );
  transitionStageRef.current = (stage) => {
    if (transitioningRef.current) {
      return;
    }
    if (
      !expandableRef.current
      || sheetStageRef.current === stage
    ) {
      restoreTranslationRef.current();
      return;
    }

    transitioningRef.current = true;
    const animationRevision = animationRevisionRef.current + 1;
    animationRevisionRef.current = animationRevision;
    translateY.stopAnimation();
    expandedContentOpacity.stopAnimation();
    if (reduceMotionEnabledRef.current) {
      sheetStageRef.current = stage;
      setSheetStage(stage);
      expandedContentOpacity.setValue(stage === "expanded" ? 1 : 0);
      currentTranslateYRef.current = 0;
      translateY.setValue(0);
      transitioningRef.current = false;
      return;
    }

    if (stage === "expanded") {
      pendingExpansionOffsetRef.current = currentTranslateYRef.current;
      sheetStageRef.current = "expanded";
      setSheetStage("expanded");
      return;
    }

    Animated.parallel([
      Animated.timing(translateY, {
        duration: safeRouteMotion.disclosureDurationMs,
        easing: safeRouteEasing.settled,
        isInteraction: false,
        toValue: expandedPanelHeight,
        useNativeDriver: true,
      }),
      Animated.timing(expandedContentOpacity, {
        duration: safeRouteMotion.sheetExitDurationMs,
        easing: safeRouteEasing.exit,
        isInteraction: false,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (animationRevisionRef.current !== animationRevision) {
        return;
      }
      if (!finished) {
        transitioningRef.current = false;
        return;
      }
      currentTranslateYRef.current = expandedPanelHeight;
      pendingCollapseResetRef.current = true;
      sheetStageRef.current = "default";
      setSheetStage("default");
    });
  };
  const dismissAnimationRef = useRef<(translateTo: number) => void>(
    () => undefined,
  );
  dismissAnimationRef.current = (translateTo) => {
    if (dismissingRef.current) {
      return;
    }
    dismissingRef.current = true;
    transitioningRef.current = true;
    const animationRevision = animationRevisionRef.current + 1;
    animationRevisionRef.current = animationRevision;
    translateY.stopAnimation();
    dismissProgress.stopAnimation();
    expandedContentOpacity.stopAnimation();
    if (reduceMotionEnabledRef.current) {
      onDismissRef.current();
      return;
    }
    Animated.parallel([
      Animated.timing(translateY, {
        duration: safeRouteMotion.sheetExitDurationMs,
        easing: safeRouteEasing.exit,
        isInteraction: false,
        toValue: translateTo,
        useNativeDriver: true,
      }),
      Animated.timing(dismissProgress, {
        duration: safeRouteMotion.sheetExitDurationMs,
        easing: safeRouteEasing.exit,
        isInteraction: false,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (animationRevisionRef.current !== animationRevision) {
        return;
      }
      if (finished) {
        onDismissRef.current();
      } else {
        dismissingRef.current = false;
        transitioningRef.current = false;
      }
    });
  };

  useLayoutEffect(() => {
    animationRevisionRef.current += 1;
    translateY.stopAnimation();
    dismissProgress.stopAnimation();
    expandedContentOpacity.stopAnimation();
    dismissingRef.current = false;
    transitioningRef.current = false;
    currentTranslateYRef.current = 0;
    pendingExpansionOffsetRef.current = null;
    pendingCollapseResetRef.current = false;
    sheetStageRef.current = "default";
    setSheetStage("default");
    translateY.setValue(0);
    dismissProgress.setValue(0);
    expandedContentOpacity.setValue(0);

    return () => {
      animationRevisionRef.current += 1;
      translateY.stopAnimation();
      dismissProgress.stopAnimation();
      expandedContentOpacity.stopAnimation();
    };
  }, [dismissProgress, expandedContentOpacity, replayKey, translateY]);

  useLayoutEffect(() => {
    if (sheetStage === "default" && pendingCollapseResetRef.current) {
      pendingCollapseResetRef.current = false;
      currentTranslateYRef.current = 0;
      translateY.setValue(0);
      expandedContentOpacity.setValue(0);
      transitioningRef.current = false;
      return;
    }

    const gestureOffset = pendingExpansionOffsetRef.current;
    if (sheetStage !== "expanded" || gestureOffset === null) {
      return;
    }
    pendingExpansionOffsetRef.current = null;
    const initialTranslateY = expandedPanelHeight + gestureOffset;
    const animationRevision = animationRevisionRef.current + 1;
    animationRevisionRef.current = animationRevision;
    currentTranslateYRef.current = initialTranslateY;
    translateY.stopAnimation();
    expandedContentOpacity.stopAnimation();
    translateY.setValue(initialTranslateY);
    expandedContentOpacity.setValue(0.55);
    let expansionAnimation: Animated.CompositeAnimation | null = null;
    const animationFrame = requestAnimationFrame(() => {
      if (animationRevisionRef.current !== animationRevision) {
        return;
      }
      expansionAnimation = Animated.parallel([
        Animated.timing(translateY, {
          duration: safeRouteMotion.disclosureDurationMs,
          easing: safeRouteEasing.settled,
          isInteraction: false,
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.timing(expandedContentOpacity, {
          duration: safeRouteMotion.disclosureDurationMs,
          easing: safeRouteEasing.settled,
          isInteraction: false,
          toValue: 1,
          useNativeDriver: true,
        }),
      ]);
      expansionAnimation.start(({ finished }) => {
        if (animationRevisionRef.current !== animationRevision) {
          return;
        }
        currentTranslateYRef.current = 0;
        transitioningRef.current = false;
        if (!finished) {
          expandedContentOpacity.setValue(1);
        }
      });
    });
    return () => {
      cancelAnimationFrame(animationFrame);
      expansionAnimation?.stop();
    };
  }, [
    expandedContentOpacity,
    expandedPanelHeight,
    sheetStage,
    translateY,
  ]);

  const handleGestureReleaseRef = useRef<(
    translationX: number,
    translationY: number,
    velocityY: number
  ) => void>(() => undefined);
  handleGestureReleaseRef.current = (translationX, translationY, velocityY) => {
    if (expandableRef.current) {
      const action = resolveRiskDetailSheetGesture(sheetStageRef.current, {
        translationX,
        translationY,
        velocityY,
      });
      if (action === "expand") {
        transitionStageRef.current("expanded");
        return;
      }
      if (action === "collapse") {
        transitionStageRef.current("default");
        return;
      }
      if (action === "dismiss") {
        dismissAnimationRef.current(320);
        return;
      }
      restoreTranslationRef.current();
      return;
    }

    if (
      shouldDismissRiskDetailGesture({
        translationX,
        translationY,
        velocityY,
      })
    ) {
      dismissAnimationRef.current(320);
      return;
    }
    restoreTranslationRef.current();
  };
  const handleGestureMoveRef = useRef<(translationY: number) => void>(
    () => undefined,
  );
  handleGestureMoveRef.current = (translationY) => {
    const nextTranslateY = sheetStageRef.current === "expanded"
      ? Math.max(0, Math.min(56, translationY))
      : Math.max(-48, translationY);
    currentTranslateYRef.current = nextTranslateY;
    translateY.setValue(nextTranslateY);
  };

  const cardPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !transitioningRef.current && (
        expandableRef.current
          ? (
              sheetStageRef.current === "default"
              && shouldStartRiskDetailSheetGesture({
                translationX: gestureState.dx,
                translationY: gestureState.dy,
              })
            )
          : shouldStartRiskDetailDismissGesture({
              translationX: gestureState.dx,
              translationY: gestureState.dy,
            })),
      onPanResponderMove: (_, gestureState) => {
        handleGestureMoveRef.current(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        handleGestureReleaseRef.current(
          gestureState.dx,
          gestureState.dy,
          gestureState.vy
        );
      },
      onPanResponderTerminate: () => {
        restoreTranslationRef.current();
      },
    }),
  ).current;
  const handlePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !transitioningRef.current && (
        expandableRef.current
          ? shouldStartRiskDetailSheetGesture({
              translationX: gestureState.dx,
              translationY: gestureState.dy,
            })
          : shouldStartRiskDetailDismissGesture({
              translationX: gestureState.dx,
              translationY: gestureState.dy,
            })),
      onPanResponderMove: (_, gestureState) => {
        handleGestureMoveRef.current(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        handleGestureReleaseRef.current(
          gestureState.dx,
          gestureState.dy,
          gestureState.vy
        );
      },
      onPanResponderTerminate: () => {
        restoreTranslationRef.current();
      },
    }),
  ).current;
  const expanded = sheetStage === "expanded";

  return (
    <MotionEntrance
      pointerEvents="box-none"
      replayKey={replayKey}
      style={[StyleSheet.absoluteFill, styles.overlay]}
      variant="sheet"
    >
      <Animated.View
        {...cardPanResponder.panHandlers}
        accessible={groupedAccessibility && !expanded}
        accessibilityLabel={
          groupedAccessibility && !expanded ? accessibilityLabel : undefined
        }
        testID={testID}
        style={[
          styles.card,
          {
            bottom: bottomInset,
            opacity: dismissProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
            transform: [{ translateY }],
          },
        ]}
      >
        <Pressable
          {...handlePanResponder.panHandlers}
          accessibilityLabel={expandedContent
            ? (expanded ? "Show risk summary" : "Show detailed risk intelligence")
            : "Swipe down to close"}
          accessibilityRole={expandedContent ? "button" : undefined}
          onPress={expandedContent
            ? () => transitionStageRef.current(expanded ? "default" : "expanded")
            : undefined}
          style={styles.dragHandleDock}
        >
          <View style={styles.dragHandle} />
        </Pressable>
        <View {...handlePanResponder.panHandlers} style={styles.titleRow}>
          <View style={[styles.iconTile, iconTileStyle]}>
            {icon}
          </View>
          <View
            accessible={!groupedAccessibility || expanded}
            accessibilityLabel={
              !groupedAccessibility || expanded ? accessibilityLabel : undefined
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
            testID={dismissTestID}
            style={({ pressed }) => [
              styles.dismiss,
              pressed ? styles.dismissPressed : null,
            ]}
            onPress={() => dismissAnimationRef.current(36)}
          >
            <X accessibilityElementsHidden color={colors.muted} size={14} strokeWidth={2.2} />
          </Pressable>
        </View>
        {children}
        {expandedContent ? (
          <>
            <Pressable
              accessibilityLabel={expanded
                ? "Collapse detailed risk intelligence"
                : "Expand detailed risk intelligence"}
              accessibilityRole="button"
              onPress={() =>
                transitionStageRef.current(expanded ? "default" : "expanded")
              }
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
                {expanded ? "Swipe down for summary" : "Swipe up for full intelligence"}
              </Text>
            </Pressable>
            <Animated.View
              pointerEvents={expanded ? "auto" : "none"}
              style={[
                styles.expandedPanel,
                {
                  height: expanded ? expandedPanelHeight : 0,
                  opacity: expandedContentOpacity,
                },
              ]}
              testID={expandedTestID}
            >
              <ScrollView
                contentContainerStyle={styles.expandedPanelContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                style={{ height: expandedPanelHeight }}
              >
                {expandedContent}
              </ScrollView>
            </Animated.View>
          </>
        ) : null}
      </Animated.View>
    </MotionEntrance>
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
  disclosureHint: {
    minHeight: 30,
    marginTop: 11,
    marginBottom: -5,
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
    overflow: "hidden",
  },
  expandedPanelContent: {
    paddingTop: 15,
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
