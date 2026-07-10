import { Text, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import { createGuidanceCardPresentation } from "./liveMapGuidancePresentation";
import type {
  RouteRiskAdvisory,
  RouteRiskAdvisoryTone,
} from "./liveRouteRiskAdvisory";
import type { NavigationLifecycle } from "./liveMapUiState";
import type { RouteProgressSnapshot } from "./routeProgress";
import { guidanceCardStyles as styles } from "./LiveMapGuidanceCard.styles";

interface LiveMapGuidanceCardProps {
  guidance: { instruction: string; distance: string };
  layout: LiveMapOverlayLayout;
  progress: RouteProgressSnapshot | null;
  riskAdvisory?: RouteRiskAdvisory | null;
  state: NavigationLifecycle;
}

export function LiveMapGuidanceCard({
  guidance,
  layout,
  progress,
  riskAdvisory,
  state,
}: LiveMapGuidanceCardProps) {
  const presentation = createGuidanceCardPresentation({
    guidance,
    progress,
    riskAdvisory,
  });
  const warningActive = state === "off-route";

  return (
    <View
      accessible
      accessibilityLabel={presentation.accessibilityLabel}
      style={[
        styles.guidanceCard,
        { bottom: layout.guidanceBottom },
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
          {presentation.instructionLabel}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.guidanceMeta,
            warningActive ? styles.guidanceMetaWarning : null,
          ]}
        >
          {presentation.metaLabel}
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
      {layout.guidanceDistanceVisible && presentation.distanceLabel ? (
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
