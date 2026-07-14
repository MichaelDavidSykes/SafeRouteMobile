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

import { ApiSessionExpiredError } from "../api/apiClient";
import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import { fetchRouteDetail, fetchSavedRoutes } from "./routeApi";
import { RouteCard } from "./RouteCard";
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
  createRouteListLoadingState,
  createRouteListSearchQueryValue,
  createRouteListSummaryState,
  filterSavedRoutes,
  findSelectedClient,
  shouldShowRouteSearch,
  shouldShowClientFilters,
  shouldShowRouteEmptyState,
  shouldShowRouteSummary,
} from "./routeListUiState";
import { colors } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";
import {
  loadOfflineRouteDetail,
  loadOfflineRoutes,
  saveOfflineRouteDetail,
  saveOfflineRoutes,
} from "./offlineRouteCache";
import { hasUsableRoutePlan } from "./offlineRouteCacheCore";
import { useNetworkAvailability } from "../api/useNetworkAvailability";
import type { SafeRouteWorkspace } from "../workspaces/activeWorkspace";
import {
  isWorkspaceForbiddenError,
  isWorkspaceUnavailableError,
} from "../workspaces/workspaceAccessRecovery";
import { WorkspaceAccessRefreshControl } from "../workspaces/WorkspaceAccessRefreshControl";

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
  workspaceAccessRefreshAvailable: boolean;
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
  workspaceAccessRefreshAvailable,
  workspaceSwitchDisabled,
}: RouteListScreenProps) {
  const { offline } = useNetworkAvailability();
  const [query, setQuery] = useState("");
  const [routes, setRoutes] = useState<SavedSafeRoutePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorState, setErrorState] = useState<RouteListErrorState | null>(
    null,
  );
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [showingOfflineCopy, setShowingOfflineCopy] = useState(false);
  const loadRevisionRef = useRef(0);
  const detailRevisionRef = useRef(0);
  const selectedClientId = activeWorkspace?.id || null;
  const activeWorkspaceIdRef = useRef<string | null>(selectedClientId);
  activeWorkspaceIdRef.current = selectedClientId;

  const recoverUnavailableWorkspace = useCallback(
    (workspaceId: string) => {
      loadRevisionRef.current += 1;
      detailRevisionRef.current += 1;
      activeWorkspaceIdRef.current = null;
      setRoutes([]);
      setShowingOfflineCopy(false);
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
        setRoutes([]);
        setShowingOfflineCopy(false);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const requestWorkspaceId = selectedClientId;
      const requestOwnsWorkspace = () =>
        revision === loadRevisionRef.current &&
        activeWorkspaceIdRef.current === requestWorkspaceId;

      let cached = refresh
        ? null
        : await loadOfflineRoutes(cacheIdentity, requestWorkspaceId);
      if (!requestOwnsWorkspace()) {
        return;
      }
      if (!cached && offline && !refresh) {
        cached = await loadOfflineRoutes(cacheIdentity, null);
        if (!requestOwnsWorkspace()) {
          return;
        }
      }
      if (cached) {
        setRoutes(routesForWorkspace(cached.routes, requestWorkspaceId));
        setLoading(false);
        if (offline) {
          setShowingOfflineCopy(true);
          setRefreshing(false);
          return;
        }
        setRefreshing(true);
      } else if (offline) {
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
        setShowingOfflineCopy(false);
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
        let offlineCopy =
          cached || (await loadOfflineRoutes(cacheIdentity, requestWorkspaceId));
        if (!requestOwnsWorkspace()) {
          return;
        }
        if (!offlineCopy) {
          offlineCopy = await loadOfflineRoutes(cacheIdentity, null);
          if (!requestOwnsWorkspace()) {
            return;
          }
        }
        if (offlineCopy) {
          setRoutes(routesForWorkspace(offlineCopy.routes, requestWorkspaceId));
          setShowingOfflineCopy(true);
        } else {
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
      offline,
      onSessionExpired,
      recoverUnavailableWorkspace,
      selectedClientId,
    ],
  );

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
  const workspaceRoutes = useMemo(
    () => selectedClientId ? routesForWorkspace(routes, selectedClientId) : [],
    [routes, selectedClientId],
  );
  const filteredRoutes = useMemo(
    () => filterSavedRoutes(workspaceRoutes, query),
    [query, workspaceRoutes],
  );
  const loadingState = createRouteListLoadingState();
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
    errorAction: errorState?.action,
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
              ? "Choose a cached workspace to show its offline saved routes."
              : "Choose a workspace to show its saved routes.",
            copy: workspaceCatalogError
              ? "Choose a saved workspace. Reconnect to refresh workspace access."
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

  const handleSelectRoute = async (route: SavedSafeRoutePlan) => {
    if (!selectedClientId) {
      return;
    }
    const revision = detailRevisionRef.current + 1;
    detailRevisionRef.current = revision;
    const requestOwnsWorkspace = () =>
      revision === detailRevisionRef.current &&
      activeWorkspaceIdRef.current === selectedClientId;
    setDetailLoadingId(route.id);
    setErrorState(null);

    if (offline) {
      const cached =
        (await loadOfflineRouteDetail(cacheIdentity, route.id)) ||
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
        setShowingOfflineCopy(true);
        setDetailLoadingId(null);
        onSelectRoute({ ...cached, clientId: selectedClientId });
        return;
      }
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
      const cached =
        (await loadOfflineRouteDetail(cacheIdentity, route.id)) ||
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
    if (errorState?.action === "detail" && errorState.route) {
      void handleSelectRoute(errorState.route);
      return;
    }

    void loadRoutes();
  };

  return (
    <SafeAreaView testID={uiTestIds.routeListScreen} style={styles.screen}>
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
        showSummary={!loading && showRouteSummary}
        onChangeQuery={handleChangeQuery}
        workspaceSwitchDisabled={workspaceSwitchDisabled}
        onSelectClient={(clientId) => {
          const workspace = availableWorkspaces.find((client) => client.id === clientId);
          if (workspace) {
            loadRevisionRef.current += 1;
            detailRevisionRef.current += 1;
            activeWorkspaceIdRef.current = workspace.id;
            setDetailLoadingId(null);
            setErrorState(null);
            setRoutes([]);
            setShowingOfflineCopy(false);
            setLoading(true);
            setQuery("");
            onWorkspaceChange(workspace);
          }
        }}
      />

      {workspaceAccessRefreshAvailable &&
      (availableWorkspaces.length > 0 || !workspaceCatalogError) ? (
        <WorkspaceAccessRefreshControl
          loading={workspaceCatalogLoading}
          onRefresh={onRetryWorkspaceCatalog}
        />
      ) : null}

      {showingOfflineCopy ? (
        <View accessibilityRole="alert" style={styles.offlineNotice}>
          <Text style={styles.offlineNoticeText}>
            Offline saved copy · route maps and guidance remain available
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
            <Text numberOfLines={1} style={styles.emptyTitle}>{workspaceState.title}</Text>
            <Text numberOfLines={2} style={styles.emptyCopy}>{workspaceState.copy}</Text>
          </View>
          {workspaceState.retry ? (
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
      ) : errorState ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <View style={styles.errorCopy}>
            <Text numberOfLines={1} style={styles.errorTitle}>
              {errorState.title}
            </Text>
            <Text
              accessibilityLabel={errorState.messageAccessibilityLabel}
              numberOfLines={2}
              style={styles.errorText}
            >
              {errorState.message}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={errorState.retryAccessibilityLabel}
            accessibilityRole="button"
            hitSlop={ROUTE_LIST_ERROR_ACTION_HIT_SLOP}
            style={({ pressed }) => [
              styles.retryButton,
              pressed ? styles.retryButtonPressed : null,
            ]}
            onPress={handleRetry}
          >
            <Text numberOfLines={1} style={styles.retryText}>
              {errorState.retryLabel}
            </Text>
          </Pressable>
        </View>
      ) : loading ? (
        <View style={styles.loadingState}>
          <View
            accessible
            accessibilityLabel={loadingState.accessibilityLabel}
            accessibilityRole="progressbar"
            style={styles.loadingCard}
          >
            <ActivityIndicator color={colors.appleBlue} />
            <Text numberOfLines={1} style={styles.loadingTitle}>
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
              key={route.id}
              loading={detailLoadingId === route.id}
              route={route}
              onPress={() => handleSelectRoute(route)}
            />
          ))}

          {showEmptyState ? (
            <View
              accessible
              accessibilityLabel={emptyState.accessibilityLabel}
              testID={uiTestIds.routeListEmptyState}
              style={styles.emptyState}
            >
              <Text numberOfLines={1} style={styles.emptyTitle}>
                {emptyState.title}
              </Text>
              <Text numberOfLines={2} style={styles.emptyCopy}>
                {emptyState.copy}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
