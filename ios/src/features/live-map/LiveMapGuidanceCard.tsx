import { RotateCcw, Volume2, VolumeX } from "lucide-react-native";
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
import { colors } from "../../theme";

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
  spokenGuidanceAvailable?: boolean;
  spokenGuidanceCanRepeat?: boolean;
  spokenGuidanceMuted?: boolean;
  onRepeatSpokenGuidance?: () => void;
  onRetryReroute?: () => void;
  onToggleSpokenGuidance?: () => void;
  state: NavigationLifecycle;
}

export function LiveMapGuidanceCard({
  guidance,
  layout,
  progress,
  reroutePresentation,
  spokenGuidanceAvailable = false,
  spokenGuidanceCanRepeat = false,
  spokenGuidanceMuted = false,
  onRepeatSpokenGuidance,
  onRetryReroute,
  onToggleSpokenGuidance,
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
    <MotionEntrance
      accessible={!reroutePresentation?.retryAvailable}
      accessibilityLabel={stateAwareAccessibilityLabel}
      replayKey={`${state}:${reroutePresentation?.status || "guidance"}`}
      testID={uiTestIds.liveMapGuidanceState(state)}
      variant="chrome"
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
            warningActive ? styles.guidanceDangerText : null,
          ]}
        >
          {rerouteTitle || presentation.instructionLabel}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.guidanceMeta,
            warningActive ? styles.guidanceDangerText : null,
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
          {spokenGuidanceAvailable && onToggleSpokenGuidance ? (
            <Pressable
              accessibilityHint={
                spokenGuidanceMuted
                  ? "Turns spoken backend directions on."
                  : "Mutes spoken backend directions."
              }
              accessibilityLabel={
                spokenGuidanceMuted
                  ? "Unmute spoken directions"
                  : "Mute spoken directions"
              }
              accessibilityRole="button"
              accessibilityState={{ selected: !spokenGuidanceMuted }}
              testID={uiTestIds.liveMapControl("voice")}
              style={({ pressed }) => [
                styles.guidanceAudioButton,
                !spokenGuidanceMuted ? styles.guidanceAudioButtonActive : null,
                pressed ? styles.guidanceAudioButtonPressed : null,
              ]}
              onPress={onToggleSpokenGuidance}
            >
              {spokenGuidanceMuted ? (
                <VolumeX
                  accessibilityElementsHidden
                  color={colors.appleBlue}
                  size={19}
                  strokeWidth={2.2}
                />
              ) : (
                <Volume2
                  accessibilityElementsHidden
                  color={colors.surface}
                  size={19}
                  strokeWidth={2.2}
                />
              )}
            </Pressable>
          ) : null}
          {spokenGuidanceAvailable && onRepeatSpokenGuidance ? (
            <Pressable
              accessibilityHint="Repeats the last backend direction."
              accessibilityLabel="Repeat spoken direction"
              accessibilityRole="button"
              accessibilityState={{ disabled: !spokenGuidanceCanRepeat }}
              disabled={!spokenGuidanceCanRepeat}
              testID={uiTestIds.liveMapControl("repeat-voice")}
              style={({ pressed }) => [
                styles.guidanceAudioButton,
                !spokenGuidanceCanRepeat
                  ? styles.guidanceAudioButtonDisabled
                  : null,
                pressed && spokenGuidanceCanRepeat
                  ? styles.guidanceAudioButtonPressed
                  : null,
              ]}
              onPress={onRepeatSpokenGuidance}
            >
              <RotateCcw
                accessibilityElementsHidden
                color={spokenGuidanceCanRepeat ? colors.appleBlue : colors.mutedSoft}
                size={18}
                strokeWidth={2.2}
              />
            </Pressable>
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
