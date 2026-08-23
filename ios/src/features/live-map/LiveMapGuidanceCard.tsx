import { ChevronLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import { createGuidanceCardPresentation } from "./liveMapGuidancePresentation";
import type {
  RouteRiskAdvisory,
  RouteRiskAdvisoryTone,
} from "./liveRouteRiskAdvisory";
import type { NavigationLifecycle } from "./liveMapUiState";
import type { RouteProgressSnapshot } from "./routeProgress";
import { guidanceCardStyles as styles } from "./LiveMapGuidanceCard.styles";
import { uiTestIds } from "../../testing/uiTestIds";
import { MotionEntrance } from "../../motion/SafeRouteMotion";

export interface LiveReroutePresentation {
  message: string;
  retryAvailable: boolean;
  status: "failed" | "pending";
}

interface LiveMapGuidanceCardProps {
  guidance: { instruction: string; distance: string };
  layout: LiveMapOverlayLayout;
  onChangeRoute: () => void;
  progress: RouteProgressSnapshot | null;
  returnAccessibilityLabel: string;
  safeAreaInsets?: { left: number; right: number; top: number };
  riskAdvisory?: RouteRiskAdvisory | null;
  reroutePresentation?: LiveReroutePresentation | null;
  onRetryReroute?: () => void;
  state: NavigationLifecycle;
  statusNotice?: string | null;
}

export function LiveMapGuidanceCard({
  guidance,
  layout,
  onChangeRoute,
  progress,
  reroutePresentation,
  onRetryReroute,
  returnAccessibilityLabel,
  riskAdvisory,
  safeAreaInsets = { left: 0, right: 0, top: 0 },
  state,
  statusNotice,
}: LiveMapGuidanceCardProps) {
  const presentation = createGuidanceCardPresentation({
    guidance,
    progress,
    riskAdvisory,
  });
  const rerouteTitle = reroutePresentation?.status === "pending"
    ? "Finding safer route"
    : reroutePresentation?.status === "failed"
      ? "Reroute unavailable"
      : null;
  const accessibilityLabel = reroutePresentation
    ? `${rerouteTitle}. ${reroutePresentation.message}`
    : [presentation.accessibilityLabel, statusNotice?.trim()]
        .filter(Boolean)
        .join(" ");
  const warningActive = state === "off-route";
  const stateAwareAccessibilityLabel = warningActive
    ? `Off route. ${accessibilityLabel}`
    : accessibilityLabel;

  return (
    <MotionEntrance
      replayKey={`${state}:${reroutePresentation?.status || "guidance"}`}
      testID={uiTestIds.liveMapGuidanceState(state)}
      variant="chrome"
      style={[
        styles.guidanceCard,
        {
          left: 16 + safeAreaInsets.left,
          right: 16 + safeAreaInsets.right,
          top: Math.max(layout.guidanceTop, safeAreaInsets.top + 8),
        },
        layout.isCompact ? styles.guidanceCardCompact : null,
        warningActive ? styles.guidanceCardWarning : null,
      ]}
    >
      <Pressable
        accessibilityHint="Returns to the previous SafeRoute view without ending this route."
        accessibilityLabel={returnAccessibilityLabel}
        accessibilityRole="button"
        hitSlop={8}
        testID={uiTestIds.liveMapReturn}
        style={({ pressed }) => [
          styles.backButton,
          pressed ? styles.backButtonPressed : null,
        ]}
        onPress={onChangeRoute}
      >
        <ChevronLeft
          accessibilityElementsHidden
          color="#f5f5f7"
          size={24}
          strokeWidth={2.3}
        />
      </Pressable>
      <View
        accessible={!reroutePresentation?.retryAvailable}
        accessibilityLabel={stateAwareAccessibilityLabel}
        style={styles.guidanceCopy}
      >
        <Text
          numberOfLines={layout.guidanceTitleLines}
          style={[
            styles.guidanceTitle,
            layout.isCompact ? styles.guidanceTitleCompact : null,
            warningActive ? styles.guidanceDangerText : null,
          ]}
        >
          {rerouteTitle || presentation.instructionLabel}
        </Text>
        {reroutePresentation?.message || statusNotice?.trim() ? (
          <Text
            numberOfLines={1}
            style={[
              styles.guidanceMeta,
              warningActive ? styles.guidanceDangerText : null,
            ]}
          >
            {reroutePresentation?.message || statusNotice?.trim()}
          </Text>
        ) : presentation.riskAdvisory ? (
          <Text
            numberOfLines={1}
            style={[
              styles.guidanceRiskMeta,
              guidanceRiskMetaStyle(presentation.riskAdvisory.tone),
            ]}
          >
            {presentation.riskAdvisory.visibleLabel}
          </Text>
        ) : null}
      </View>
      {reroutePresentation?.retryAvailable && onRetryReroute ? (
        <Pressable
          accessibilityHint="Tries the road and risk-aware reroute again."
          accessibilityLabel="Retry safer route"
          accessibilityRole="button"
          testID={uiTestIds.liveMapRerouteRetry}
          style={({ pressed }) => [
            styles.rerouteButton,
            pressed ? styles.rerouteButtonPressed : null,
          ]}
          onPress={onRetryReroute}
        >
          <Text style={styles.rerouteButtonText}>Retry</Text>
        </Pressable>
      ) : !reroutePresentation ? (
        <View style={styles.guidanceActions}>
          {layout.guidanceDistanceVisible && presentation.distanceLabel ? (
            <Text
              numberOfLines={1}
              style={[
                styles.guidanceDistance,
                layout.isCompact ? styles.guidanceDistanceCompact : null,
                warningActive ? styles.guidanceDangerText : null,
              ]}
            >
              {presentation.distanceLabel}
            </Text>
          ) : null}
        </View>
      ) : null}
    </MotionEntrance>
  );
}

function guidanceRiskMetaStyle(tone: RouteRiskAdvisoryTone) {
  if (tone === "danger") {
    return styles.guidanceDangerText;
  }

  if (tone === "warning") {
    return styles.guidanceRiskMetaWarning;
  }

  return styles.guidanceRiskMetaInfo;
}
