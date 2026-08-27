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
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

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
  trackingLabel,
}, ref) {
  const safeAreaInsets = useSafeAreaInsets();
  const [openedRiskDetail, setOpenedRiskDetail] =
    useState<RiskDetailTarget | null>(null);
  const [routeSummaryAnchorHeight, setRouteSummaryAnchorHeight] = useState(100);
  const retainedSelectedRiskDetailRef = useRef<RiskDetailTarget | null>(null);
  const preloadedRiskDetailRef = useRef<RiskDetailTarget | null>(null);
  const guidanceCardVisible = shouldShowGuidanceCard(activeNavigationState);
  const selectedRiskDetail = openedRiskDetail;
  const advisoryRiskDetail: RiskDetailTarget | null = riskAdvisory
    ? { proximity: riskAdvisory.proximity, zone: riskAdvisory.zone }
    : null;
  const fallbackRiskDetail: RiskDetailTarget | null = routePlan.riskZones[0]
    ? { proximity: null, zone: routePlan.riskZones[0] }
    : null;
  if (selectedRiskDetail) {
    retainedSelectedRiskDetailRef.current = selectedRiskDetail;
  }
  const riskDetailOpen = Boolean(selectedRiskDetail);
  const riskDetailSheetAnimatedIndex = useSharedValue(0);
  const preloadCandidate = liveRiskAlert || advisoryRiskDetail || fallbackRiskDetail;
  if (
    preloadCandidate &&
    preloadedRiskDetailRef.current?.zone.id !== preloadCandidate.zone.id
  ) {
    preloadedRiskDetailRef.current = preloadCandidate;
  }
  const riskDetailAlert: RiskDetailTarget | null =
    selectedRiskDetail ||
    retainedSelectedRiskDetailRef.current ||
    preloadedRiskDetailRef.current;
  const routeStackAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      riskDetailSheetAnimatedIndex.value,
      [0, 0.45, 1],
      [1, 0, 0],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        translateY: interpolate(
          riskDetailSheetAnimatedIndex.value,
          [0, 1],
          [0, -8],
          Extrapolation.CLAMP,
        ),
      },
      {
        scale: interpolate(
          riskDetailSheetAnimatedIndex.value,
          [0, 1],
          [1, 0.985],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const dismissOpenedRiskDetail = useCallback(() => {
    setOpenedRiskDetail(null);
  }, []);
  const openRiskDetail = useCallback((target: RiskDetailTarget) => {
    retainedSelectedRiskDetailRef.current = target;
    setOpenedRiskDetail(target);
  }, []);
  const handleRouteSummaryLayoutHeight = useCallback((height: number) => {
    if (!Number.isFinite(height) || height <= 0) {
      return;
    }
    setRouteSummaryAnchorHeight((current) =>
      Math.abs(current - height) < 1 ? current : height,
    );
  }, []);

  useImperativeHandle(ref, () => ({
    dismissRiskDetail: dismissOpenedRiskDetail,
    openRiskDetail,
  }), [dismissOpenedRiskDetail, openRiskDetail]);

  useEffect(() => {
    setOpenedRiskDetail(null);
    retainedSelectedRiskDetailRef.current = null;
    preloadedRiskDetailRef.current = null;
    riskDetailSheetAnimatedIndex.value = 0;
  }, [riskDetailSheetAnimatedIndex, routePlan.id]);

  const routeSummary = (
    <LiveMapRouteSummarySheet
      inline={Boolean(riskDetailAlert)}
      navigationState={activeNavigationState}
      layout={layout}
      onLayoutHeight={handleRouteSummaryLayoutHeight}
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
  );

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

      <Animated.View
        accessibilityElementsHidden={riskDetailOpen}
        importantForAccessibility={
          riskDetailOpen ? "no-hide-descendants" : "auto"
        }
        pointerEvents={riskDetailOpen ? "none" : "box-none"}
        style={[styles.routeStack, routeStackAnimatedStyle]}
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
              onPress={(alert) => {
                openRiskDetail({
                  proximity: alert.proximity,
                  zone: alert.zone,
                });
              }}
            />
          </MotionEntrance>
        ) : null}

        {riskDetailAlert ? null : routeSummary}
      </Animated.View>

      {riskDetailAlert ? (
        <LiveMapRiskDetailCallout
          bottomInset={safeAreaInsets.bottom + 14}
          collapsedContent={routeSummary}
          morphAnchorHeight={routeSummaryAnchorHeight + 16}
          morphAnimatedIndex={riskDetailSheetAnimatedIndex}
          morphFromRouteStack
          open={riskDetailOpen}
          proximity={riskDetailAlert.proximity}
          zone={riskDetailAlert.zone}
          onDismiss={dismissOpenedRiskDetail}
        />
      ) : null}
    </SafeAreaView>
  );
});
