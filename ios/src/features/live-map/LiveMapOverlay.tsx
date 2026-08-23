import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

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
import { MotionEntrance } from "../../motion/SafeRouteMotion";

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
  onShareRoute: () => void;
  onRetryReroute: () => void;
  onSetAlertsVisible: (visible: boolean) => void;
  onStopRoute: () => void;
  primaryActionPending?: boolean;
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
  sharePending?: boolean;
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
  onShareRoute,
  onRetryReroute,
  onSetAlertsVisible,
  onStopRoute,
  primaryActionPending,
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
  sharePending,
  selectedRiskZone,
  trackingLabel,
}: LiveMapOverlayProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const guidanceCardVisible = shouldShowGuidanceCard(activeNavigationState);

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
      <MotionEntrance
        pointerEvents="box-none"
        replayKey={routePlan.id}
        style={styles.chromeEntrance}
        variant="chrome"
      >
        {guidanceCardVisible ? null : (
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
        )}

        <LiveMapControls
          activeNavigationState={activeNavigationState}
          alertsVisible={alertsVisible}
          hasVehicleCoordinate={hasVehicleCoordinate}
          layout={layout}
          onCenterVehicle={onCenterVehicle}
          onFitRoute={onFitRoute}
          onSetAlertsVisible={onSetAlertsVisible}
          routeIntelCount={
            routePlan.riskZones.length + (routePlan.supportFacilities?.length || 0)
          }
        />
      </MotionEntrance>

      {guidanceCardVisible ? (
        <LiveMapGuidanceCard
          guidance={guidance}
          layout={layout}
          onChangeRoute={onChangeRoute}
          progress={progress}
          reroutePresentation={reroutePresentation}
          returnAccessibilityLabel={returnAccessibilityLabel}
          riskAdvisory={riskAdvisory}
          safeAreaInsets={safeAreaInsets}
          state={activeNavigationState}
          onRetryReroute={onRetryReroute}
          statusNotice={locationNotice}
        />
      ) : null}

      {!selectedRiskZone && liveRiskAlert ? (
        <MotionEntrance
          pointerEvents="box-none"
          replayKey={liveRiskAlert.zone.id}
          style={styles.transientEntrance}
          variant="sheet"
        >
          <LiveRouteRiskAlertCard
            alert={liveRiskAlert}
            layout={layout}
            onPress={onOpenRiskAlert}
            routeSummaryHasContinuityAction={Boolean(
              backgroundNavigationPresentation,
            )}
          />
        </MotionEntrance>
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
        primaryActionPending={primaryActionPending}
        primaryActionStatusReason={primaryActionStatusReason}
        primaryDisabledReason={primaryDisabledReason}
        onEnableBackgroundNavigation={onEnableBackgroundNavigation}
        onPrimaryAction={onPrimaryAction}
        onShareRoute={onShareRoute}
        onStopRoute={onStopRoute}
        sharePending={sharePending}
      /> : null}
    </SafeAreaView>
  );
}
