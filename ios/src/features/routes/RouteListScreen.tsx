import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MotionEntrance } from "../../motion/SafeRouteMotion";
import { ApiSessionExpiredError } from "../api/apiClient";
import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import { fetchRouteDetail, fetchSavedRoutes } from "./routeApi";
import { RouteCard } from "./RouteCard";
import { RouteDetailSheet } from "./RouteDetailSheet";
import { RouteListFilters } from "./RouteListFilters";
import { RouteListHeader } from "./RouteListHeader";
import { routeListStyles as styles } from "./RouteListScreen.styles";
import {
  createRouteDetailErrorState,
  createRouteSyncErrorState,
  type RouteListErrorState as BaseRouteListErrorState,
} from "./routeListErrors";
import {
  createRouteListClientFilterOptions,
  createRouteListEmptyState,
  createRouteListExpiredCacheMessage,
  createRouteListLoadingState,
  createRouteListOfflineReviewPresentation,
  createRouteListSearchQueryValue,
  createRouteListSummaryState,
  filterSavedRoutes,
  findSelectedClient,
  getRouteListOfflineReviewRefreshDelayMs,
  shouldShowRouteSearch,
  shouldShowClientFilters,
  shouldShowRouteEmptyState,
  shouldShowRouteSummary,
} from "./routeListUiState";
import { colors } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";
import { recordGuidanceContractEvidence } from "../../testing/guidanceContractEvidence";
import {
  loadOfflineRouteDetail,
  loadOfflineRoutesSnapshot,
  saveOfflineRouteDetail,
  saveOfflineRoutes,
} from "./offlineRouteCache";
import { recordOwnedRouteCacheReadback } from "./ownedRouteCacheReadback";
import { hasUsableRoutePlan } from "./offlineRouteCacheCore";
import { useNetworkAvailability } from "../api/useNetworkAvailability";
import type { SafeRouteWorkspace } from "../workspaces/activeWorkspace";
import {
  isWorkspaceForbiddenError,
  isWorkspaceUnavailableError,
} from "../workspaces/workspaceAccessRecovery";
import { WorkspaceAccessRefreshControl } from "../workspaces/WorkspaceAccessRefreshControl";
import type { WorkspaceAccessIssue } from "../workspaces/workspaceAccessRefreshState";

const ROUTE_LIST_ERROR_ACTION_HIT_SLOP = 6;

function routesForWorkspace(
  routes: SavedSafeRoutePlan[],
  workspaceId: string,
): SavedSafeRoutePlan[] {
  return routes.filter((route) => route.clientId === workspaceId);
}

interface RouteListErrorState extends BaseRouteListErrorState {
  route?: SavedSafeRoutePlan;
}

interface RouteListScreenProps {
  accessToken: string;
  activeWorkspace: SafeRouteWorkspace | null;
  availableWorkspaces: SafeRouteWorkspace[];
  cacheIdentity: string;
  sessionNotice?: string;
  userEmail: string;
  onBackToMap: () => void;
  onRetryWorkspaceCatalog: () => void;
  onSelectRoute: (route: SavedSafeRoutePlan) => void;
  onSessionExpired: (message?: string) => void;
  onSignOut: () => void;
  onWorkspaceUnavailable: (workspaceId: string) => void;
  onWorkspaceChange: (workspace: SafeRouteWorkspace) => void;
  workspaceCatalogError: string;
  workspaceCatalogLoading: boolean;
  workspaceCatalogStoredAtMs: number | null;
  workspaceAuthorizationFresh: boolean;
  workspaceAccessRecoveryPending: boolean;
  workspaceAccessRefreshAvailable: boolean;
  workspaceAccessFocusTargetRef?: (target: View | null) => void;
  workspaceAccessIssue: WorkspaceAccessIssue;
  workspaceAlternativeSelectionPending: boolean;
  workspaceChangeEndsNavigation: boolean;
  workspaceNavigationNoticeInset: number;
  workspaceSelectionFailed: boolean;
  workspaceSelectionPending: boolean;
  workspaceSwitchFailure: boolean;
  workspaceSwitchDisabled: boolean;
}

export function RouteListScreen({
  accessToken,
  activeWorkspace,
  availableWorkspaces,
  cacheIdentity,
  onBackToMap,
  onRetryWorkspaceCatalog,
  onSelectRoute,
  onSessionExpired,
  onSignOut,
  onWorkspaceUnavailable,
  onWorkspaceChange,
  sessionNotice,
  userEmail,
  workspaceCatalogError,
  workspaceCatalogLoading,
  workspaceCatalogStoredAtMs,
  workspaceAuthorizationFresh,
  workspaceAccessRecoveryPending,
  workspaceAccessRefreshAvailable,
  workspaceAccessFocusTargetRef,
  workspaceAccessIssue,
  workspaceAlternativeSelectionPending,
  workspaceChangeEndsNavigation,
  workspaceNavigationNoticeInset,
  workspaceSelectionFailed,
  workspaceSelectionPending,
  workspaceSwitchFailure,
  workspaceSwitchDisabled,
}: RouteListScreenProps) {
  const {
    checking: networkChecking,
    offline,
    online,
    status: networkStatus,
  } = useNetworkAvailability();
  const protectedRequestsAvailable = online && workspaceAuthorizationFresh;
  const reviewOnly = !protectedRequestsAvailable;
  const [query, setQuery] = useState("");
  const [routes, setRoutes] = useState<SavedSafeRoutePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorState, setErrorState] = useState<RouteListErrorState | null>(
    null,
  );
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [selectedDetailRoute, setSelectedDetailRoute] =
    useState<SavedSafeRoutePlan | null>(null);
  const [showingOfflineCopy, setShowingOfflineCopy] = useState(false);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const [offlineCopyStoredAtMs, setOfflineCopyStoredAtMs] = useState<
    number | null
  >(null);
  const [offlineCopyNowMs, setOfflineCopyNowMs] = useState(() => Date.now());
  const loadRevisionRef = useRef(0);
  const detailRevisionRef = useRef(0);
  const protectedRequestsAvailableRef = useRef(protectedRequestsAvailable);
  if (protectedRequestsAvailableRef.current !== protectedRequestsAvailable) {
    protectedRequestsAvailableRef.current = protectedRequestsAvailable;
    detailRevisionRef.current += 1;
  }
  const selectedClientId = activeWorkspace?.id || null;
  const activeWorkspaceIdRef = useRef<string | null>(selectedClientId);
  activeWorkspaceIdRef.current = selectedClientId;

  const recoverUnavailableWorkspace = useCallback(
    (workspaceId: string) => {
      loadRevisionRef.current += 1;
      detailRevisionRef.current += 1;
      activeWorkspaceIdRef.current = null;
      setLoadedWorkspaceId(null);
      setRoutes([]);
      setShowingOfflineCopy(false);
      setOfflineCopyStoredAtMs(null);
      setDetailLoadingId(null);
      setErrorState(null);
      setLoading(false);
      setRefreshing(false);
      setQuery("");
      onWorkspaceUnavailable(workspaceId);
    },
    [onWorkspaceUnavailable],
  );

  const loadRoutes = useCallback(
    async ({ refresh = false }: { refresh?: boolean } = {}) => {
      const revision = loadRevisionRef.current + 1;
      loadRevisionRef.current = revision;
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorState(null);

      if (!selectedClientId) {
        setLoadedWorkspaceId(null);
        setRoutes([]);
        setShowingOfflineCopy(false);
        setOfflineCopyStoredAtMs(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const requestWorkspaceId = selectedClientId;
      const protectedListRequest = protectedRequestsAvailable;
      const requestOwnsWorkspace = () =>
        revision === loadRevisionRef.current &&
        activeWorkspaceIdRef.current === requestWorkspaceId &&
        (
          !protectedListRequest ||
          protectedRequestsAvailableRef.current
        );

      let cachedSnapshot = refresh && protectedRequestsAvailable
        ? null
        : await loadOfflineRoutesSnapshot(cacheIdentity, requestWorkspaceId);
      if (!requestOwnsWorkspace()) {
        return;
      }
      if (!cachedSnapshot && reviewOnly) {
        cachedSnapshot = await loadOfflineRoutesSnapshot(cacheIdentity, null);
        if (!requestOwnsWorkspace()) {
          return;
        }
      }
      if (cachedSnapshot) {
        const cached = cachedSnapshot.value;
        const cachedRoutes = routesForWorkspace(cached.routes, requestWorkspaceId);
        if (reviewOnly) {
          if (!(await recordOwnedRouteCacheReadback(
            requestOwnsWorkspace,
            () => recordOfflineRouteCacheReadback(
              cachedRoutes,
              requestWorkspaceId,
              "saved-list-readback",
            ),
          ))) {
            return;
          }
          setRoutes(cachedRoutes);
          setLoadedWorkspaceId(requestWorkspaceId);
          setLoading(false);
          setShowingOfflineCopy(true);
          setOfflineCopyStoredAtMs(cachedSnapshot.storedAtMs);
          setOfflineCopyNowMs(Date.now());
          setRefreshing(false);
          return;
        }
        setRoutes(cachedRoutes);
        setLoadedWorkspaceId(requestWorkspaceId);
        setOfflineCopyStoredAtMs(null);
        setLoading(false);
        setRefreshing(true);
      } else if (reviewOnly) {
        setRoutes([]);
        setLoadedWorkspaceId(requestWorkspaceId);
        setShowingOfflineCopy(false);
        setOfflineCopyStoredAtMs(null);
        if (networkChecking || online) {
          setRefreshing(false);
          return;
        }
        setErrorState(
          createRouteSyncErrorState(new TypeError("Network request failed")),
        );
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        const result = await fetchSavedRoutes(
          accessToken,
          requestWorkspaceId,
        );
        if (!requestOwnsWorkspace()) {
          return;
        }
        const scopedResult = {
          ...result,
          routes: routesForWorkspace(result.routes, requestWorkspaceId),
        };
        setRoutes(scopedResult.routes);
        setLoadedWorkspaceId(requestWorkspaceId);
        setShowingOfflineCopy(false);
        setOfflineCopyStoredAtMs(null);
        void saveOfflineRoutes(cacheIdentity, requestWorkspaceId, scopedResult).catch(() => undefined);
      } catch (error) {
        if (!requestOwnsWorkspace()) {
          return;
        }
        if (error instanceof ApiSessionExpiredError) {
          onSessionExpired(error.message);
          return;
        }
        if (isWorkspaceUnavailableError(error)) {
          recoverUnavailableWorkspace(requestWorkspaceId);
          return;
        }
        let offlineSnapshot =
          cachedSnapshot ||
          (await loadOfflineRoutesSnapshot(cacheIdentity, requestWorkspaceId));
        if (!requestOwnsWorkspace()) {
          return;
        }
        if (!offlineSnapshot) {
          offlineSnapshot = await loadOfflineRoutesSnapshot(cacheIdentity, null);
          if (!requestOwnsWorkspace()) {
            return;
          }
        }
        if (offlineSnapshot) {
          const offlineCopy = offlineSnapshot.value;
          const offlineRoutes = routesForWorkspace(
            offlineCopy.routes,
            requestWorkspaceId,
          );
          if (!(await recordOwnedRouteCacheReadback(
            requestOwnsWorkspace,
            () => recordOfflineRouteCacheReadback(
              offlineRoutes,
              requestWorkspaceId,
              "saved-list-readback",
            ),
          ))) {
            return;
          }
          setRoutes(offlineRoutes);
          setLoadedWorkspaceId(requestWorkspaceId);
          setShowingOfflineCopy(true);
          setOfflineCopyStoredAtMs(offlineSnapshot.storedAtMs);
          setOfflineCopyNowMs(Date.now());
        } else {
          setRoutes([]);
          setLoadedWorkspaceId(requestWorkspaceId);
          setShowingOfflineCopy(false);
          setOfflineCopyStoredAtMs(null);
          setErrorState(createRouteSyncErrorState(error));
        }
      } finally {
        if (requestOwnsWorkspace()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      accessToken,
      cacheIdentity,
      networkChecking,
      networkStatus,
      online,
      onSessionExpired,
      recoverUnavailableWorkspace,
      selectedClientId,
      protectedRequestsAvailable,
      reviewOnly,
      workspaceAuthorizationFresh,
    ],
  );

  const previousSelectedClientIdRef = useRef(selectedClientId);
  useEffect(() => {
    if (previousSelectedClientIdRef.current === selectedClientId) {
      return;
    }
    previousSelectedClientIdRef.current = selectedClientId;
    loadRevisionRef.current += 1;
    detailRevisionRef.current += 1;
    setLoadedWorkspaceId(null);
    setDetailLoadingId(null);
    setErrorState(null);
    setRoutes([]);
    setShowingOfflineCopy(false);
    setOfflineCopyStoredAtMs(null);
    setLoading(true);
    setRefreshing(false);
    setQuery("");
  }, [selectedClientId]);

  useEffect(() => {
    void loadRoutes();
    return () => {
      loadRevisionRef.current += 1;
    };
  }, [loadRoutes]);

  useEffect(
    () => () => {
      detailRevisionRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (!protectedRequestsAvailable) {
      setDetailLoadingId(null);
    }
  }, [protectedRequestsAvailable]);

  const handleChangeQuery = useCallback((nextQuery: string) => {
    setQuery(createRouteListSearchQueryValue(nextQuery));
  }, []);

  const selectedClient = useMemo(
    () => findSelectedClient(availableWorkspaces, selectedClientId),
    [availableWorkspaces, selectedClientId],
  );
  const clientFilterOptions = useMemo(
    () => createRouteListClientFilterOptions(availableWorkspaces, selectedClientId),
    [availableWorkspaces, selectedClientId],
  );
  const workspaceOwnsResults = Boolean(
    selectedClientId && loadedWorkspaceId === selectedClientId,
  );
  const workspaceRoutes = useMemo(
    () =>
      workspaceOwnsResults && selectedClientId
        ? routesForWorkspace(routes, selectedClientId)
        : [],
    [routes, selectedClientId, workspaceOwnsResults],
  );
  const ownedErrorState = workspaceOwnsResults ? errorState : null;
  const ownedShowingOfflineCopy = workspaceOwnsResults && showingOfflineCopy;
  const ownedOfflineCopyStoredAtMs = ownedShowingOfflineCopy
    ? offlineCopyStoredAtMs
    : null;
  const contentLoading =
    loading || Boolean(selectedClientId && !workspaceOwnsResults);
  const filteredRoutes = useMemo(
    () => filterSavedRoutes(workspaceRoutes, query),
    [query, workspaceRoutes],
  );
  useEffect(() => {
    setSelectedDetailRoute((currentRoute) => {
      if (!currentRoute) {
        return null;
      }

      return (
        workspaceRoutes.find((route) => route.id === currentRoute.id) || null
      );
    });
  }, [workspaceRoutes]);
  const loadingState =
    reviewOnly && networkChecking
      ? {
          accessibilityLabel:
            "Checking connection. No cached saved routes are available.",
          title: "Checking connection",
        }
      : reviewOnly && online
        ? {
            accessibilityLabel:
              "Checking workspace access. No cached saved routes are available.",
            title: "Checking workspace access",
          }
        : createRouteListLoadingState();
  const emptyState = useMemo(
    () =>
      createRouteListEmptyState({
        query,
        routeCount: workspaceRoutes.length,
        selectedClientName: selectedClient?.name,
      }),
    [query, workspaceRoutes.length, selectedClient?.name],
  );
  const routeSummary = useMemo(
    () =>
      createRouteListSummaryState({
        filteredRouteCount: filteredRoutes.length,
        query,
        selectedClientName: selectedClient?.name,
        totalRouteCount: workspaceRoutes.length,
      }),
    [filteredRoutes.length, query, workspaceRoutes.length, selectedClient?.name],
  );
  const showRouteSearch = shouldShowRouteSearch({
    query,
    selectedClientName: selectedClient?.name,
    totalRouteCount: workspaceRoutes.length,
  });
  const showRouteSummary = shouldShowRouteSummary({
    query,
    selectedClientName: selectedClient?.name,
    totalRouteCount: workspaceRoutes.length,
  });
  const showEmptyState = shouldShowRouteEmptyState({
    errorAction: ownedErrorState?.action,
    filteredRouteCount: filteredRoutes.length,
    totalRouteCount: workspaceRoutes.length,
  });
  const workspaceState = !selectedClientId
    ? workspaceCatalogLoading && !availableWorkspaces.length
      ? {
          accessibilityLabel: "Loading SafeRoute workspaces.",
          copy: "Checking the workspaces available to this account.",
          loading: true,
          retry: false,
          title: "Loading workspaces",
        }
      : availableWorkspaces.length
        ? {
            accessibilityLabel: workspaceCatalogError
              ? "Choose a cached workspace to review its saved routes."
              : "Choose a workspace to show its saved routes.",
            copy: workspaceCatalogError
              ? "Choose a saved workspace. Verify current access before starting guidance."
              : "Choose the workspace whose routes you need.",
            loading: false,
            retry: false,
            title: "Choose workspace",
          }
        : workspaceCatalogError
          ? {
              accessibilityLabel: "Workspaces unavailable. Retry loading your SafeRoute workspaces.",
              copy: workspaceCatalogError,
              loading: false,
              retry: true,
              title: "Workspaces unavailable",
            }
          : {
              accessibilityLabel: "No SafeRoute workspace access is available for this account.",
              copy: "Ask an administrator to add this account to a SafeRoute workspace.",
              loading: false,
              retry: false,
              title: "No workspace access",
            }
    : null;
  const offlineReviewStatus = networkChecking
    ? "checking-connection"
    : offline
      ? "offline"
      : "checking-access";
  const offlineReviewPresentation = useMemo(
    () =>
      ownedOfflineCopyStoredAtMs === null
        ? null
        : createRouteListOfflineReviewPresentation({
            nowMs: offlineCopyNowMs,
            status: offlineReviewStatus,
            storedAtMs: ownedOfflineCopyStoredAtMs,
          }),
    [offlineCopyNowMs, offlineReviewStatus, ownedOfflineCopyStoredAtMs],
  );

  useEffect(() => {
    if (!ownedShowingOfflineCopy || ownedOfflineCopyStoredAtMs === null) {
      return;
    }

    const refreshDelayMs = getRouteListOfflineReviewRefreshDelayMs({
      nowMs: offlineCopyNowMs,
      storedAtMs: ownedOfflineCopyStoredAtMs,
    });
    if (refreshDelayMs === null) {
      loadRevisionRef.current += 1;
      detailRevisionRef.current += 1;
      setRoutes([]);
      setShowingOfflineCopy(false);
      setOfflineCopyStoredAtMs(null);
      setDetailLoadingId(null);
      setErrorState(
        createRouteSyncErrorState(
          new Error(createRouteListExpiredCacheMessage(offlineReviewStatus)),
        ),
      );
      return;
    }

    const refreshTimer = setTimeout(() => {
      setOfflineCopyNowMs(Date.now());
    }, refreshDelayMs);
    return () => clearTimeout(refreshTimer);
  }, [
    offlineCopyNowMs,
    offlineReviewStatus,
    ownedOfflineCopyStoredAtMs,
    ownedShowingOfflineCopy,
  ]);

  const handleSelectRoute = async (route: SavedSafeRoutePlan) => {
    if (!selectedClientId) {
      return;
    }
    const revision = detailRevisionRef.current + 1;
    detailRevisionRef.current = revision;
    const protectedDetailRequest = !reviewOnly;
    const requestOwnsWorkspace = () =>
      revision === detailRevisionRef.current &&
      activeWorkspaceIdRef.current === selectedClientId &&
      (
        !protectedDetailRequest ||
        protectedRequestsAvailableRef.current
      );
    setDetailLoadingId(route.id);
    setErrorState(null);

    if (reviewOnly) {
      const cachedDetail = await loadOfflineRouteDetail(cacheIdentity, route.id);
      const cached =
        cachedDetail ||
        (hasUsableRoutePlan(route) ? route : null);
      if (!requestOwnsWorkspace()) {
        return;
      }
      if (cached) {
        if (cached.clientId !== selectedClientId) {
          setErrorState({
            ...createRouteDetailErrorState(
              new Error("This route belongs to another workspace."),
              route.name,
            ),
            route,
          });
          setDetailLoadingId(null);
          return;
        }
        if (cachedDetail) {
          if (!(await recordOwnedRouteCacheReadback(
            requestOwnsWorkspace,
            () => recordOfflineRouteCacheReadback(
              [cachedDetail],
              selectedClientId,
              "saved-detail-readback",
            ),
          ))) {
            return;
          }
        }
        setShowingOfflineCopy(true);
        setDetailLoadingId(null);
        onSelectRoute({ ...cached, clientId: selectedClientId });
        return;
      }
      setErrorState({
        ...createRouteDetailErrorState(
          new Error(
            networkChecking
              ? "SafeRoute is still checking the connection. Try again shortly."
              : offline
                ? "Reconnect before loading this route."
                : "SafeRoute is still checking workspace access. Try again shortly.",
          ),
          route.name,
        ),
        route,
      });
      setDetailLoadingId(null);
      return;
    }

    try {
      const routeDetail = await fetchRouteDetail(accessToken, route.id);
      if (!requestOwnsWorkspace()) {
        return;
      }
      if (routeDetail.clientId !== selectedClientId) {
        setErrorState({
          ...createRouteDetailErrorState(
            new Error("This route belongs to another workspace."),
            route.name,
          ),
          route,
        });
        return;
      }
      void saveOfflineRouteDetail(cacheIdentity, routeDetail).catch(() => undefined);
      onSelectRoute(routeDetail);
    } catch (error) {
      if (!requestOwnsWorkspace()) {
        return;
      }
      if (error instanceof ApiSessionExpiredError) {
        onSessionExpired(error.message);
        return;
      }
      if (isWorkspaceForbiddenError(error)) {
        recoverUnavailableWorkspace(selectedClientId);
        return;
      }
      const cachedDetail = await loadOfflineRouteDetail(cacheIdentity, route.id);
      const cached =
        cachedDetail ||
        (hasUsableRoutePlan(route) ? route : null);
      if (!requestOwnsWorkspace()) {
        return;
      }
      if (cached) {
        if (cached.clientId !== selectedClientId) {
          setErrorState({
            ...createRouteDetailErrorState(
              new Error("This route belongs to another workspace."),
              route.name,
            ),
            route,
          });
          return;
        }
        if (cachedDetail) {
          if (!(await recordOwnedRouteCacheReadback(
            requestOwnsWorkspace,
            () => recordOfflineRouteCacheReadback(
              [cachedDetail],
              selectedClientId,
              "saved-detail-readback",
            ),
          ))) {
            return;
          }
        }
        setShowingOfflineCopy(true);
        onSelectRoute({ ...cached, clientId: selectedClientId });
      } else {
        setErrorState({
          ...createRouteDetailErrorState(error, route.name),
          route,
        });
      }
    } finally {
      if (requestOwnsWorkspace()) {
        setDetailLoadingId(null);
      }
    }
  };

  const handleRetry = () => {
    if (ownedErrorState?.action === "detail" && ownedErrorState.route) {
      void handleSelectRoute(ownedErrorState.route);
      return;
    }

    void loadRoutes();
  };

  return (
    <SafeAreaView
      testID={uiTestIds.routeListScreen}
      style={[
        styles.screen,
        workspaceNavigationNoticeInset > 0
          ? { paddingTop: workspaceNavigationNoticeInset }
          : null,
      ]}
    >
      <MotionEntrance
        replayKey={selectedClientId || "no-workspace"}
        style={{ flex: 1 }}
        variant="scene"
      >
        <RouteListHeader
          sessionNotice={sessionNotice}
          userEmail={userEmail}
          onBackToMap={onBackToMap}
          onSignOut={onSignOut}
        />

        <RouteListFilters
          clientFilterOptions={clientFilterOptions}
          query={query}
          routeSummary={routeSummary}
          showClientFilters={shouldShowClientFilters(clientFilterOptions)}
          showSearch={showRouteSearch}
          showSummary={!contentLoading && showRouteSummary}
          workspaceAlternativeSelectionPending={
            workspaceAlternativeSelectionPending
          }
          workspaceChangeEndsNavigation={workspaceChangeEndsNavigation}
          workspaceCatalogLoading={workspaceCatalogLoading}
          workspaceSelectionFailed={workspaceSelectionFailed}
          workspaceSelectionPending={workspaceSelectionPending}
          workspaceSwitchFailure={workspaceSwitchFailure}
          workspaceAccessFocusTargetRef={workspaceAccessFocusTargetRef}
          onChangeQuery={handleChangeQuery}
          workspaceSwitchDisabled={workspaceSwitchDisabled}
          onSelectClient={(clientId) => {
            const workspace = availableWorkspaces.find((client) => client.id === clientId);
            if (
              !workspace ||
              (
                workspace.id === selectedClientId &&
                !workspaceSelectionFailed &&
                !workspaceAlternativeSelectionPending
              )
            ) {
              return;
            }
            onWorkspaceChange(workspace);
          }}
        />

      {workspaceAccessRefreshAvailable ? (
        <WorkspaceAccessRefreshControl
          accessRecoveryPending={workspaceAccessRecoveryPending}
          availableWorkspaceCount={availableWorkspaces.length}
          catalogStoredAtMs={
            workspaceAuthorizationFresh ? null : workspaceCatalogStoredAtMs
          }
          issue={workspaceAccessIssue}
          loading={workspaceCatalogLoading}
          onRefresh={onRetryWorkspaceCatalog}
        />
      ) : null}

      {ownedShowingOfflineCopy && offlineReviewPresentation ? (
        <View
          accessible
          accessibilityLabel={offlineReviewPresentation.accessibilityLabel}
          accessibilityRole="alert"
          style={styles.offlineNotice}
          testID={uiTestIds.routeListOfflineNotice}
        >
          <Text numberOfLines={2} style={styles.offlineNoticeText}>
            {offlineReviewPresentation.visibleLabel}
          </Text>
        </View>
      ) : null}

      {workspaceState ? (
        <View style={styles.loadingState}>
          <View
            accessible
            accessibilityLabel={workspaceState.accessibilityLabel}
            accessibilityRole={workspaceState.loading ? "progressbar" : "summary"}
            testID={uiTestIds.routeListWorkspaceState}
            style={styles.emptyState}
          >
            {workspaceState.loading ? <ActivityIndicator color={colors.appleBlue} /> : null}
            <Text numberOfLines={1} style={styles.stateTitle}>{workspaceState.title}</Text>
            <Text numberOfLines={2} style={styles.emptyCopy}>{workspaceState.copy}</Text>
          </View>
          {workspaceState.retry && !workspaceAccessRefreshAvailable ? (
            <Pressable
              accessibilityLabel="Retry loading SafeRoute workspaces"
              accessibilityRole="button"
              hitSlop={ROUTE_LIST_ERROR_ACTION_HIT_SLOP}
              style={({ pressed }) => [
                styles.retryButton,
                pressed ? styles.retryButtonPressed : null,
              ]}
              onPress={onRetryWorkspaceCatalog}
            >
              <Text numberOfLines={1} style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : ownedErrorState ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <View style={styles.errorCopy}>
            <Text numberOfLines={1} style={styles.errorTitle}>
              {ownedErrorState.title}
            </Text>
            <Text
              accessibilityLabel={ownedErrorState.messageAccessibilityLabel}
              numberOfLines={2}
              style={styles.errorText}
            >
              {ownedErrorState.message}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={ownedErrorState.retryAccessibilityLabel}
            accessibilityRole="button"
            hitSlop={ROUTE_LIST_ERROR_ACTION_HIT_SLOP}
            style={({ pressed }) => [
              styles.retryButton,
              pressed ? styles.retryButtonPressed : null,
            ]}
            onPress={handleRetry}
          >
            <Text numberOfLines={1} style={styles.retryText}>
              {ownedErrorState.retryLabel}
            </Text>
          </Pressable>
        </View>
      ) : contentLoading ? (
        <View style={styles.loadingState}>
          <View
            accessible
            accessibilityLabel={loadingState.accessibilityLabel}
            accessibilityRole="progressbar"
            style={styles.loadingCard}
          >
            <ActivityIndicator color={colors.appleBlue} />
            <Text numberOfLines={1} style={styles.stateTitle}>
              {loadingState.title}
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.routeList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.ink}
              onRefresh={() => loadRoutes({ refresh: true })}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {filteredRoutes.map((route) => (
            <RouteCard
              cachedReviewAccessibilityLabel={
                ownedShowingOfflineCopy
                  ? offlineReviewPresentation?.cardAccessibilityLabel
                  : null
              }
              key={route.id}
              loading={detailLoadingId === route.id}
              route={route}
              onMapPress={() => handleSelectRoute(route)}
              onPress={() => setSelectedDetailRoute(route)}
            />
          ))}

          {showEmptyState ? (
            <View
              accessible
              accessibilityLabel={emptyState.accessibilityLabel}
              testID={uiTestIds.routeListEmptyState}
              style={styles.emptyState}
            >
              <Text numberOfLines={1} style={styles.stateTitle}>
                {emptyState.title}
              </Text>
              <Text numberOfLines={2} style={styles.emptyCopy}>
                {emptyState.copy}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      </MotionEntrance>

      <RouteDetailSheet
        route={selectedDetailRoute}
        onClose={() => setSelectedDetailRoute(null)}
      />
    </SafeAreaView>
  );
}

async function recordOfflineRouteCacheReadback(
  routes: SavedSafeRoutePlan[],
  workspaceId: string,
  cause: "saved-detail-readback" | "saved-list-readback",
): Promise<void> {
  await Promise.all(routes.map((route) =>
    recordGuidanceContractEvidence({
      authorization: {
        catalog: "unavailable",
        principal: "matching",
      },
      cause,
      durability: {
        routeCache: "present",
      },
      navigationInstanceId: null,
      outcome: "readable",
      routeId: route.route.id,
      type: "route.cache.readback",
      unavailableWorkspaceIds: [],
      workspaceId,
    }),
  ));
}
