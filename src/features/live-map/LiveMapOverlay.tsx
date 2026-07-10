import { SafeAreaView } from "react-native-safe-area-context";

import type { RiskZone, SavedSafeRoutePlan } from "./liveMapTypes";
import type { LiveMapOverlayLayout } from "./liveMapLayout";
import type { RouteRiskAdvisory } from "./liveRouteRiskAdvisory";
import {
  shouldShowGuidanceCard,
  type NavigationLifecycle,
} from "./liveMapUiState";
import type { RouteProgressSnapshot } from "./routeProgress";
import type { LiveRouteRiskAlert, RouteRiskProximity } from "./routeRisk";
import { LiveMapControls } from "./LiveMapControls";
import {
  LiveMapGuidanceCard,
  type LiveReroutePresentation,
} from "./LiveMapGuidanceCard";
import {
  LiveRouteRiskAlertCard,
  LiveRouteRiskDetailCard,
} from "./LiveMapRiskCard";
import { styles } from "./LiveMapOverlay.styles";
import { LiveMapRouteHeader } from "./LiveMapRouteHeader";
import { LiveMapRouteSummarySheet } from "./LiveMapRouteSummarySheet";

interface LiveMapOverlayProps {
  activeNavigationState: NavigationLifecycle;
  alertsVisible: boolean;
  followModeEnabled: boolean;
  guidance: { instruction: string; distance: string };
  hasVehicleCoordinate: boolean;
  layout: LiveMapOverlayLayout;
  locationNotice: string | null;
  onCenterVehicle: () => void;
  onChangeRoute: () => void;
  onFitRoute: () => void;
  onPrimaryAction: () => void;
  onRetryReroute: () => void;
  onSetAlertsVisible: (updater: (value: boolean) => boolean) => void;
  onSetFollowModeEnabled: (updater: (value: boolean) => boolean) => void;
  onStopRoute: () => void;
  primaryDisabledReason?: string | null;
  progress: RouteProgressSnapshot | null;
  liveRiskAlert: LiveRouteRiskAlert | null;
  onDismissRiskDetail: () => void;
  onOpenRiskAlert: () => void;
  riskAdvisory?: RouteRiskAdvisory | null;
  reroutePresentation?: LiveReroutePresentation | null;
  returnAccessibilityLabel: string;
  returnLabel: string;
  routeContext: "guest" | "saved";
  routePlan: SavedSafeRoutePlan;
  selectedRiskProximity: RouteRiskProximity | null;
  selectedRiskZone: RiskZone | null;
  trackingLabel: string;
}

export function LiveMapOverlay({
  activeNavigationState,
  alertsVisible,
  followModeEnabled,
  guidance,
  hasVehicleCoordinate,
  layout,
  locationNotice,
  onCenterVehicle,
  onChangeRoute,
  onFitRoute,
  onPrimaryAction,
  onRetryReroute,
  onSetAlertsVisible,
  onSetFollowModeEnabled,
  onStopRoute,
  primaryDisabledReason,
  progress,
  liveRiskAlert,
  onDismissRiskDetail,
  onOpenRiskAlert,
  riskAdvisory,
  reroutePresentation,
  returnAccessibilityLabel,
  returnLabel,
  routeContext,
  routePlan,
  selectedRiskProximity,
  selectedRiskZone,
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
          reroutePresentation={reroutePresentation}
          riskAdvisory={riskAdvisory}
          state={activeNavigationState}
          onRetryReroute={onRetryReroute}
        />
      ) : null}

      {selectedRiskZone ? (
        <LiveRouteRiskDetailCard
          layout={layout}
          navigationState={activeNavigationState}
          proximity={selectedRiskProximity}
          zone={selectedRiskZone}
          onDismiss={onDismissRiskDetail}
        />
      ) : liveRiskAlert ? (
        <LiveRouteRiskAlertCard
          alert={liveRiskAlert}
          layout={layout}
          navigationState={activeNavigationState}
          onPress={onOpenRiskAlert}
        />
      ) : null}

      <LiveMapRouteSummarySheet
        navigationState={activeNavigationState}
        layout={layout}
        progress={progress}
        route={routePlan.route}
        routeContext={routeContext}
        routePlan={routePlan}
        primaryDisabledReason={primaryDisabledReason}
        onPrimaryAction={onPrimaryAction}
        onStopRoute={onStopRoute}
      />
    </SafeAreaView>
  );
}
