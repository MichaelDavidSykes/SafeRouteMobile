import { SafeAreaView } from "react-native-safe-area-context";

import type { RiskZone, SavedSafeRoutePlan } from "./liveMapTypes";
import type { LiveMapOverlayLayout } from "./liveMapLayout";
import type { RouteRiskAdvisory } from "./liveRouteRiskAdvisory";
import {
  shouldShowGuidanceCard,
  type NavigationLifecycle,
} from "./liveMapUiState";
import type { RouteProgressSnapshot } from "./routeProgress";
import type { LiveRouteRiskAlert } from "./routeRisk";
import { LiveMapControls } from "./LiveMapControls";
import {
  LiveMapGuidanceCard,
  type LiveReroutePresentation,
} from "./LiveMapGuidanceCard";
import { LiveRouteRiskAlertCard } from "./LiveMapRiskCard";
import { styles } from "./LiveMapOverlay.styles";
import { LiveMapRouteHeader } from "./LiveMapRouteHeader";
import { LiveMapRouteSummarySheet } from "./LiveMapRouteSummarySheet";
import type { BackgroundNavigationPresentation } from "./backgroundNavigationState";

interface LiveMapOverlayProps {
  activeNavigationState: NavigationLifecycle;
  alertsVisible: boolean;
  backgroundNavigationPresentation?: BackgroundNavigationPresentation | null;
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
  onStopRoute: () => void;
  primaryActionStatusReason?: string | null;
  primaryDisabledReason?: string | null;
  progress: RouteProgressSnapshot | null;
  liveRiskAlert: LiveRouteRiskAlert | null;
  onEnableBackgroundNavigation: () => void;
  onOpenRiskAlert: () => void;
  riskAdvisory?: RouteRiskAdvisory | null;
  reroutePresentation?: LiveReroutePresentation | null;
  returnAccessibilityLabel: string;
  returnLabel: string;
  routeContext: "guest" | "saved";
  routePlan: SavedSafeRoutePlan;
  selectedRiskZone: RiskZone | null;
  trackingLabel: string;
}

export function LiveMapOverlay({
  activeNavigationState,
  alertsVisible,
  backgroundNavigationPresentation,
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
  onStopRoute,
  primaryActionStatusReason,
  primaryDisabledReason,
  progress,
  liveRiskAlert,
  onEnableBackgroundNavigation,
  onOpenRiskAlert,
  riskAdvisory,
  reroutePresentation,
  returnAccessibilityLabel,
  returnLabel,
  routeContext,
  routePlan,
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
        hasVehicleCoordinate={hasVehicleCoordinate}
        layout={layout}
        onCenterVehicle={onCenterVehicle}
        onFitRoute={onFitRoute}
        onSetAlertsVisible={onSetAlertsVisible}
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

      {!selectedRiskZone && liveRiskAlert ? (
        <LiveRouteRiskAlertCard
          alert={liveRiskAlert}
          layout={layout}
          onPress={onOpenRiskAlert}
        />
      ) : null}

      {!selectedRiskZone ? <LiveMapRouteSummarySheet
        backgroundNavigationPresentation={backgroundNavigationPresentation}
        navigationState={activeNavigationState}
        layout={layout}
        progress={progress}
        route={routePlan.route}
        routeContext={routeContext}
        routePlan={routePlan}
        trackingLabel={trackingLabel}
        primaryActionStatusReason={primaryActionStatusReason}
        primaryDisabledReason={primaryDisabledReason}
        onEnableBackgroundNavigation={onEnableBackgroundNavigation}
        onPrimaryAction={onPrimaryAction}
        onStopRoute={onStopRoute}
      /> : null}
    </SafeAreaView>
  );
}
