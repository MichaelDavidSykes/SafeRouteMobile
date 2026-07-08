import { SafeAreaView } from "react-native";

import type { SavedSafeRoutePlan } from "./liveMapTypes";
import type { LiveMapOverlayLayout } from "./liveMapLayout";
import {
  shouldShowGuidanceCard,
  type NavigationLifecycle,
} from "./liveMapUiState";
import type { RouteProgressSnapshot } from "./routeProgress";
import { LiveMapControls } from "./LiveMapControls";
import { LiveMapGuidanceCard } from "./LiveMapGuidanceCard";
import { styles } from "./LiveMapOverlay.styles";
import { LiveMapRouteHeader } from "./LiveMapRouteHeader";
import { LiveMapRouteSummarySheet } from "./LiveMapRouteSummarySheet";

interface LiveMapOverlayProps {
  activeNavigationState: NavigationLifecycle;
  alertsVisible: boolean;
  demoDriveActive: boolean;
  demoDriveAvailable: boolean;
  followModeEnabled: boolean;
  guidance: { instruction: string; distance: string };
  hasVehicleCoordinate: boolean;
  layout: LiveMapOverlayLayout;
  locationNotice: string | null;
  onCenterVehicle: () => void;
  onChangeRoute: () => void;
  onFitRoute: () => void;
  onPrimaryAction: () => void;
  onSetAlertsVisible: (updater: (value: boolean) => boolean) => void;
  onSetFollowModeEnabled: (updater: (value: boolean) => boolean) => void;
  onStopRoute: () => void;
  onToggleDemoDrive: () => void;
  primaryDisabledReason?: string | null;
  progress: RouteProgressSnapshot | null;
  returnAccessibilityLabel: string;
  returnLabel: string;
  routeContext: "guest" | "saved";
  routePlan: SavedSafeRoutePlan;
  trackingLabel: string;
}

export function LiveMapOverlay({
  activeNavigationState,
  alertsVisible,
  demoDriveActive,
  demoDriveAvailable,
  followModeEnabled,
  guidance,
  hasVehicleCoordinate,
  layout,
  locationNotice,
  onCenterVehicle,
  onChangeRoute,
  onFitRoute,
  onPrimaryAction,
  onSetAlertsVisible,
  onSetFollowModeEnabled,
  onStopRoute,
  onToggleDemoDrive,
  primaryDisabledReason,
  progress,
  returnAccessibilityLabel,
  returnLabel,
  routeContext,
  routePlan,
  trackingLabel,
}: LiveMapOverlayProps) {
  return (
    <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
      <LiveMapRouteHeader
        activeNavigationState={activeNavigationState}
        layout={layout}
        locationNotice={locationNotice}
        onChangeRoute={onChangeRoute}
        returnAccessibilityLabel={returnAccessibilityLabel}
        returnLabel={returnLabel}
        routePlan={routePlan}
        trackingLabel={trackingLabel}
      />

      <LiveMapControls
        activeNavigationState={activeNavigationState}
        alertsVisible={alertsVisible}
        followModeEnabled={followModeEnabled}
        hasVehicleCoordinate={hasVehicleCoordinate}
        layout={layout}
        onCenterVehicle={onCenterVehicle}
        onFitRoute={onFitRoute}
        onSetAlertsVisible={onSetAlertsVisible}
        onSetFollowModeEnabled={onSetFollowModeEnabled}
        routeIntelCount={routePlan.riskZones.length}
      />

      {shouldShowGuidanceCard(activeNavigationState) ? (
        <LiveMapGuidanceCard
          guidance={guidance}
          layout={layout}
          progress={progress}
          state={activeNavigationState}
        />
      ) : null}

      <LiveMapRouteSummarySheet
        demoDriveAvailable={demoDriveAvailable}
        demoDriveEnabled={demoDriveActive}
        navigationState={activeNavigationState}
        layout={layout}
        progress={progress}
        route={routePlan.route}
        routeContext={routeContext}
        routePlan={routePlan}
        primaryDisabledReason={primaryDisabledReason}
        onPrimaryAction={onPrimaryAction}
        onStopRoute={onStopRoute}
        onToggleDemoDrive={onToggleDemoDrive}
      />
    </SafeAreaView>
  );
}
