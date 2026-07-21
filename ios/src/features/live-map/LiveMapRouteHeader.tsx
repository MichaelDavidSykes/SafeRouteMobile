import { ChevronLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import type { SavedSafeRoutePlan } from "./liveMapTypes";
import {
  createLiveLocationNoticePresentation,
  shouldUseCompactRouteHeader,
  type NavigationLifecycle,
} from "./liveMapUiState";
import { styles } from "./LiveMapRouteHeader.styles";
import { uiTestIds } from "../../testing/uiTestIds";

const LIVE_ROUTE_RETURN_HIT_SLOP = 6;

interface LiveMapRouteHeaderProps {
  activeNavigationState: NavigationLifecycle;
  layout: LiveMapOverlayLayout;
  locationNotice: string | null;
  onChangeRoute: () => void;
  returnAccessibilityLabel: string;
  returnLabel: string;
  routePlan: SavedSafeRoutePlan;
  trackingLabel: string;
}

export function LiveMapRouteHeader({
  activeNavigationState,
  locationNotice,
  onChangeRoute,
  returnAccessibilityLabel,
}: LiveMapRouteHeaderProps) {
  const locationNoticePresentation =
    createLiveLocationNoticePresentation(locationNotice);
  const compactNavigation = shouldUseCompactRouteHeader(activeNavigationState);

  return (
    <View pointerEvents="box-none" style={styles.topStack}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityLabel={returnAccessibilityLabel}
          accessibilityHint="Returns to the previous SafeRoute view without ending this route."
          accessibilityRole="button"
          hitSlop={LIVE_ROUTE_RETURN_HIT_SLOP}
          testID={uiTestIds.liveMapReturn}
          style={({ pressed }) => [
            styles.backButton,
            pressed ? styles.backButtonPressed : null,
          ]}
          onPress={onChangeRoute}
        >
          <ChevronLeft accessibilityElementsHidden color="#1c1c1e" size={25} strokeWidth={2.2} />
        </Pressable>

        {locationNoticePresentation ? (
          <View
            accessibilityLabel={locationNoticePresentation.accessibilityLabel}
            accessibilityRole="alert"
            style={[
              styles.permissionNotice,
              compactNavigation
                ? styles.permissionNoticeCompactNavigation
                : null,
            ]}
          >
            <Text
              numberOfLines={1}
              style={styles.permissionText}
            >
              {locationNoticePresentation.displayText}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
