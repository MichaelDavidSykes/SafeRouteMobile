import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { View } from "react-native";

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
import { LiveRouteRiskAlertCard } from "./LiveMapRiskCard";
import { LiveMapRiskDetailCallout } from "./LiveMapRiskDetailCallout";
import { styles } from "./LiveMapOverlay.styles";
import { LiveMapRouteHeader } from "./LiveMapRouteHeader";
import { LiveMapRouteSummarySheet } from "./LiveMapRouteSummarySheet";
import { MotionEntrance } from "../../motion/SafeRouteMotion";

interface LiveMapOverlayProps {
  activeNavigationState: NavigationLifecycle;
  alertsVisible: boolean;
  guidance: { instruction: string; distance: string };
  hasVehicleCoordinate: boolean;
  layout: LiveMapOverlayLayout;
  locationNotice: string | null;
  onCenterVehicle: () => void;
  onChangeRoute: () => void;
  onDismissRiskDetail: () => void;
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
  riskAdvisory?: RouteRiskAdvisory | null;
  reroutePresentation?: LiveReroutePresentation | null;
  returnAccessibilityLabel: string;
  returnLabel: string;
  routeContext: "guest" | "saved";
  routePlan: SavedSafeRoutePlan;
  sharePending?: boolean;
  selectedRiskZone: RiskZone | null;
  selectedRiskProximity: RouteRiskProximity | null;
  trackingLabel: string;
}

interface RiskDetailTarget {
  proximity: RouteRiskProximity | null;
  zone: RiskZone;
}

export interface LiveMapOverlayHandle {
  dismissRiskDetail: () => void;
  openRiskDetail: (target: RiskDetailTarget) => void;
}

export const LiveMapOverlay = forwardRef<
  LiveMapOverlayHandle,
  LiveMapOverlayProps
>(function LiveMapOverlay({
  activeNavigationState,
  alertsVisible,
  guidance,
  hasVehicleCoordinate,
  layout,
  locationNotice,
  onCenterVehicle,
  onChangeRoute,
  onDismissRiskDetail,
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
  riskAdvisory,
  reroutePresentation,
  returnAccessibilityLabel,
  returnLabel,
  routeContext,
  routePlan,
  sharePending,
  selectedRiskZone,
  selectedRiskProximity,
  trackingLabel,
}, ref) {
  const safeAreaInsets = useSafeAreaInsets();
  const [openLiveRiskAlert, setOpenLiveRiskAlert] =
    useState<LiveRouteRiskAlert | null>(null);
  const [openedRiskDetail, setOpenedRiskDetail] =
    useState<RiskDetailTarget | null>(null);
  const retainedSelectedRiskDetailRef = useRef<RiskDetailTarget | null>(null);
  const guidanceCardVisible = shouldShowGuidanceCard(activeNavigationState);
  const propSelectedRiskDetail: RiskDetailTarget | null = selectedRiskZone
    ? { proximity: selectedRiskProximity, zone: selectedRiskZone }
    : null;
  const selectedRiskDetail = openedRiskDetail || propSelectedRiskDetail;
  const advisoryRiskDetail: RiskDetailTarget | null = riskAdvisory
    ? { proximity: riskAdvisory.proximity, zone: riskAdvisory.zone }
    : null;
  if (selectedRiskDetail) {
    retainedSelectedRiskDetailRef.current = selectedRiskDetail;
  }
  const riskDetailOpen = Boolean(selectedRiskDetail || openLiveRiskAlert);
  const riskDetailAlert: RiskDetailTarget | null =
    selectedRiskDetail ||
    openLiveRiskAlert ||
    liveRiskAlert ||
    advisoryRiskDetail ||
    retainedSelectedRiskDetailRef.current;

  const dismissOpenedRiskDetail = useCallback(() => {
    setOpenedRiskDetail(null);
  }, []);
  const openRiskDetail = useCallback((target: RiskDetailTarget) => {
    retainedSelectedRiskDetailRef.current = target;
    setOpenLiveRiskAlert(null);
    setOpenedRiskDetail(target);
  }, []);

  useImperativeHandle(ref, () => ({
    dismissRiskDetail: dismissOpenedRiskDetail,
    openRiskDetail,
  }), [dismissOpenedRiskDetail, openRiskDetail]);

  useEffect(() => {
    setOpenLiveRiskAlert(null);
    setOpenedRiskDetail(null);
    retainedSelectedRiskDetailRef.current = null;
  }, [routePlan.id]);

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

      <View
          accessibilityElementsHidden={riskDetailOpen}
          importantForAccessibility={
            riskDetailOpen ? "no-hide-descendants" : "auto"
          }
          pointerEvents={riskDetailOpen ? "none" : "box-none"}
          style={[
            styles.routeStack,
            selectedRiskDetail ? styles.routeStackSuppressed : null,
          ]}
        >
          {liveRiskAlert ? (
            <MotionEntrance
              pointerEvents="box-none"
              replayKey={liveRiskAlert.zone.id}
              style={styles.transientEntrance}
              variant="sheet"
            >
              <LiveRouteRiskAlertCard
                alert={liveRiskAlert}
                layout={layout}
                onPress={setOpenLiveRiskAlert}
              />
            </MotionEntrance>
          ) : null}

          <LiveMapRouteSummarySheet
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
            onPrimaryAction={onPrimaryAction}
            onShareRoute={onShareRoute}
            onStopRoute={onStopRoute}
            sharePending={sharePending}
          />
        </View>

      {riskDetailAlert ? (
        <LiveMapRiskDetailCallout
          bottomInset={safeAreaInsets.bottom + 12}
          morphFromRouteStack
          open={riskDetailOpen}
          openImmediately={Boolean(selectedRiskDetail)}
          proximity={riskDetailAlert.proximity}
          zone={riskDetailAlert.zone}
          onDismiss={() => {
            if (selectedRiskDetail) {
              dismissOpenedRiskDetail();
              if (propSelectedRiskDetail) {
                onDismissRiskDetail();
              }
              return;
            }
            setOpenLiveRiskAlert(null);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
});
