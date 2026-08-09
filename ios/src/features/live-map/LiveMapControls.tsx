import { AlertTriangle, Crosshair, Maximize2 } from "lucide-react-native";
import { Pressable, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import {
  mapControlAccessibility,
  resolveVisibleMapControls,
  shouldShowDriveAlongControl,
  type NavigationLifecycle,
} from "./liveMapUiState";
import { styles } from "./LiveMapOverlay.styles";
import { uiTestIds } from "../../testing/uiTestIds";

const MAP_CONTROL_HIT_SLOP = 8;

interface LiveMapControlsProps {
  activeNavigationState: NavigationLifecycle;
  alertsVisible: boolean;
  hasVehicleCoordinate: boolean;
  layout: LiveMapOverlayLayout;
  onCenterVehicle: () => void;
  onFitRoute: () => void;
  onSetAlertsVisible: (visible: boolean) => void;
  routeIntelCount: number;
}

export function LiveMapControls({
  activeNavigationState,
  alertsVisible,
  hasVehicleCoordinate,
  layout,
  onCenterVehicle,
  onFitRoute,
  onSetAlertsVisible,
  routeIntelCount,
}: LiveMapControlsProps) {
  const driveAlongActive = shouldShowDriveAlongControl(activeNavigationState);
  const compactControls = layout.mapControlsDirection === "row";
  const visibleControls = resolveVisibleMapControls({
    routeIntelCount,
    state: activeNavigationState,
  });

  return (
    <View
      style={[
        styles.mapControls,
        { top: layout.mapControlsTop },
        layout.mapControlsDirection === "row"
          ? styles.mapControlsCompact
          : null,
      ]}
    >
      {visibleControls.includes("center") ? (
        <MapControlButton
          control="center"
          compact={compactControls}
          driveAlongActive={driveAlongActive}
          hasLiveLocation={hasVehicleCoordinate}
          onPress={onCenterVehicle}
        />
      ) : null}
      {visibleControls.includes("fit") ? (
        <MapControlButton
          compact={compactControls}
          control="fit"
          driveAlongActive={driveAlongActive}
          onPress={onFitRoute}
        />
      ) : null}
      {visibleControls.includes("intelligence") ? (
        <MapControlButton
          control="intelligence"
          active={alertsVisible}
          compact={compactControls}
          onPress={() => onSetAlertsVisible(!alertsVisible)}
        />
      ) : null}
    </View>
  );
}

function MapControlButton({
  active,
  compact,
  control,
  disabled,
  driveAlongActive,
  hasLiveLocation,
  onPress,
}: {
  active?: boolean;
  compact?: boolean;
  control: Parameters<typeof mapControlAccessibility>[0];
  disabled?: boolean;
  driveAlongActive?: boolean;
  hasLiveLocation?: boolean;
  onPress: () => void;
}) {
  const controlOptions = {
    active,
    disabled,
    driveAlongActive,
    hasLiveLocation,
  };
  const accessibility = mapControlAccessibility(control, controlOptions);
  const iconColor = active
    ? "#ffffff"
    : disabled
      ? "#b0b0b5"
      : "#0a84ff";

  return (
    <Pressable
      accessibilityHint={accessibility.hint}
      accessibilityLabel={accessibility.label}
      accessibilityRole="button"
      accessibilityState={accessibility.state}
      disabled={disabled}
      hitSlop={MAP_CONTROL_HIT_SLOP}
      testID={uiTestIds.liveMapControl(control)}
      style={({ pressed }) => [
        styles.controlButton,
        compact ? styles.controlButtonCompact : null,
        active ? styles.controlButtonActive : null,
        disabled ? styles.controlButtonDisabled : null,
        pressed && !disabled ? styles.controlButtonPressed : null,
      ]}
      onPress={onPress}
    >
      {control === "center" ? (
        <Crosshair accessibilityElementsHidden color={iconColor} size={21} strokeWidth={2} />
      ) : control === "fit" ? (
        <Maximize2 accessibilityElementsHidden color={iconColor} size={20} strokeWidth={2} />
      ) : (
        <AlertTriangle accessibilityElementsHidden color={iconColor} size={21} strokeWidth={2} />
      )}
    </Pressable>
  );
}
