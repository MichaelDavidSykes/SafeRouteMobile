import { Pressable, Text, View } from "react-native";

import type { LiveMapOverlayLayout } from "./liveMapLayout";
import {
  mapControlAccessibility,
  mapControlDisplayLabel,
  shouldShowDriveAlongControl,
  shouldShowRouteIntelligenceControl,
  type NavigationLifecycle,
} from "./liveMapUiState";
import { styles } from "./LiveMapOverlay.styles";

interface LiveMapControlsProps {
  activeNavigationState: NavigationLifecycle;
  alertsVisible: boolean;
  followModeEnabled: boolean;
  hasVehicleCoordinate: boolean;
  layout: LiveMapOverlayLayout;
  onCenterVehicle: () => void;
  onFitRoute: () => void;
  onSetAlertsVisible: (updater: (value: boolean) => boolean) => void;
  onSetFollowModeEnabled: (updater: (value: boolean) => boolean) => void;
  routeIntelCount: number;
}

export function LiveMapControls({
  activeNavigationState,
  alertsVisible,
  followModeEnabled,
  hasVehicleCoordinate,
  layout,
  onCenterVehicle,
  onFitRoute,
  onSetAlertsVisible,
  onSetFollowModeEnabled,
  routeIntelCount,
}: LiveMapControlsProps) {
  const driveAlongActive = shouldShowDriveAlongControl(activeNavigationState);
  const showRouteIntelligenceControl =
    shouldShowRouteIntelligenceControl(routeIntelCount);
  const compactControls = layout.mapControlsDirection === "row";

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
      <MapControlButton
        control="center"
        compact={compactControls}
        driveAlongActive={driveAlongActive}
        hasLiveLocation={hasVehicleCoordinate}
        onPress={onCenterVehicle}
      />
      <MapControlButton
        compact={compactControls}
        control="fit"
        onPress={onFitRoute}
      />
      {driveAlongActive ? (
        <MapControlButton
          control="follow"
          active={followModeEnabled}
          compact={compactControls}
          driveAlongActive
          onPress={() => onSetFollowModeEnabled((value) => !value)}
        />
      ) : null}
      {showRouteIntelligenceControl ? (
        <MapControlButton
          control="intelligence"
          active={alertsVisible}
          compact={compactControls}
          onPress={() => onSetAlertsVisible((value) => !value)}
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
  const displayLabel = mapControlDisplayLabel(control, controlOptions);

  return (
    <Pressable
      accessibilityHint={accessibility.hint}
      accessibilityLabel={accessibility.label}
      accessibilityRole="button"
      accessibilityState={accessibility.state}
      disabled={disabled}
      style={({ pressed }) => [
        styles.controlButton,
        compact ? styles.controlButtonCompact : null,
        active ? styles.controlButtonActive : null,
        disabled ? styles.controlButtonDisabled : null,
        pressed && !disabled ? styles.controlButtonPressed : null,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.controlButtonText,
          active ? styles.controlButtonTextActive : null,
          disabled ? styles.controlButtonTextDisabled : null,
        ]}
      >
        {displayLabel}
      </Text>
    </Pressable>
  );
}
