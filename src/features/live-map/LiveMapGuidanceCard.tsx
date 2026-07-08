import { Text, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import { createGuidanceCardPresentation } from "./liveMapGuidancePresentation";
import type { NavigationLifecycle } from "./liveMapUiState";
import type { RouteProgressSnapshot } from "./routeProgress";
import { guidanceCardStyles as styles } from "./LiveMapGuidanceCard.styles";

interface LiveMapGuidanceCardProps {
  guidance: { instruction: string; distance: string };
  layout: LiveMapOverlayLayout;
  progress: RouteProgressSnapshot | null;
  state: NavigationLifecycle;
}

export function LiveMapGuidanceCard({
  guidance,
  layout,
  progress,
  state,
}: LiveMapGuidanceCardProps) {
  const presentation = createGuidanceCardPresentation({ guidance, progress });

  return (
    <View
      accessible
      accessibilityLabel={presentation.accessibilityLabel}
      style={[
        styles.guidanceCard,
        { bottom: layout.guidanceBottom },
        layout.isCompact ? styles.guidanceCardCompact : null,
        state === "off-route" ? styles.guidanceCardWarning : null,
      ]}
    >
      <View style={styles.guidanceCopy}>
        <Text
          numberOfLines={layout.guidanceTitleLines}
          style={[
            styles.guidanceTitle,
            layout.isCompact ? styles.guidanceTitleCompact : null,
          ]}
        >
          {guidance.instruction}
        </Text>
        <Text numberOfLines={1} style={styles.guidanceMeta}>
          {presentation.metaLabel}
        </Text>
      </View>
      {layout.guidanceDistanceVisible ? (
        <Text
          style={[
            styles.guidanceDistance,
            layout.isCompact ? styles.guidanceDistanceCompact : null,
          ]}
        >
          {guidance.distance}
        </Text>
      ) : null}
    </View>
  );
}
