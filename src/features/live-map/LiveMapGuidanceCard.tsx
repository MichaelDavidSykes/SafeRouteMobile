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

export interface LiveReroutePresentation {
  message: string;
  retryAvailable: boolean;
  status: "failed" | "pending";
}

interface LiveMapGuidanceCardProps {
  guidance: { instruction: string; distance: string };
  layout: LiveMapOverlayLayout;
  progress: RouteProgressSnapshot | null;
  riskAdvisory?: RouteRiskAdvisory | null;
  reroutePresentation?: LiveReroutePresentation | null;
  onRetryReroute?: () => void;
  state: NavigationLifecycle;
}

export function LiveMapGuidanceCard({
  guidance,
  layout,
  progress,
  reroutePresentation,
  onRetryReroute,
  riskAdvisory,
  state,
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
    : presentation.accessibilityLabel;
  const warningActive = state === "off-route";
  const stateAwareAccessibilityLabel = warningActive
    ? `Off route. ${accessibilityLabel}`
    : accessibilityLabel;

  return (
    <View
      accessible={!reroutePresentation?.retryAvailable}
      accessibilityLabel={stateAwareAccessibilityLabel}
      testID={uiTestIds.liveMapGuidanceState(state)}
      style={[
        styles.guidanceCard,
        { top: layout.guidanceTop },
        layout.isCompact ? styles.guidanceCardCompact : null,
        warningActive ? styles.guidanceCardWarning : null,
      ]}
    >
      <View style={styles.guidanceCopy}>
        <Text
          numberOfLines={layout.guidanceTitleLines}
          style={[
            styles.guidanceTitle,
            layout.isCompact ? styles.guidanceTitleCompact : null,
            warningActive ? styles.guidanceTitleWarning : null,
          ]}
        >
          {rerouteTitle || presentation.instructionLabel}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.guidanceMeta,
            warningActive ? styles.guidanceMetaWarning : null,
          ]}
        >
          {reroutePresentation?.message || presentation.metaLabel}
        </Text>
        {presentation.riskAdvisory ? (
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
      ) : layout.guidanceDistanceVisible && presentation.distanceLabel && !reroutePresentation ? (
        <Text
          numberOfLines={1}
          style={[
            styles.guidanceDistance,
            layout.isCompact ? styles.guidanceDistanceCompact : null,
            warningActive ? styles.guidanceDistanceWarning : null,
          ]}
        >
          {presentation.distanceLabel}
        </Text>
      ) : null}
    </View>
  );
}

function guidanceRiskMetaStyle(tone: RouteRiskAdvisoryTone) {
  if (tone === "danger") {
    return styles.guidanceRiskMetaDanger;
  }

  if (tone === "warning") {
    return styles.guidanceRiskMetaWarning;
  }

  return styles.guidanceRiskMetaInfo;
}
