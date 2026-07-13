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
  reconcileSelectedClientId,
  shouldShowRouteSearch,
  shouldShowClientFilters,
  shouldShowRouteEmptyState,
  shouldShowRouteSummary,
} from "./routeListUiState";
import type { MobileSafeRouteClient } from "./routeMapper";
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

const ROUTE_LIST_ERROR_ACTION_HIT_SLOP = 6;

interface RouteListErrorState extends BaseRouteListErrorState {
  route?: SavedSafeRoutePlan;
}

interface RouteListScreenProps {
  accessToken: string;
  sessionNotice?: string;
  userEmail: string;
  onBackToMap: () => void;
  onSelectRoute: (route: SavedSafeRoutePlan) => void;
  onSessionExpired: (message?: string) => void;
  onSignOut: () => void;
}

export function RouteListScreen({
  accessToken,
  onBackToMap,
  onSelectRoute,
  onSessionExpired,
  onSignOut,
  sessionNotice,
  userEmail,
}: RouteListScreenProps) {
  const { offline } = useNetworkAvailability();
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<MobileSafeRouteClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
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

      const cached = refresh
        ? null
        : await loadOfflineRoutes(userEmail, selectedClientId);
      if (revision !== loadRevisionRef.current) {
        return;
      }
      if (cached) {
        setClients(cached.clients);
        setRoutes(cached.routes);
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
          selectedClientId || undefined,
        );
        if (revision !== loadRevisionRef.current) {
          return;
        }
        setClients(result.clients);
        setSelectedClientId((currentClientId) =>
          reconcileSelectedClientId(result.clients, currentClientId),
        );
        setRoutes(result.routes);
        setShowingOfflineCopy(false);
        void saveOfflineRoutes(userEmail, selectedClientId, result).catch(() => undefined);
      } catch (error) {
        if (revision !== loadRevisionRef.current) {
          return;
        }
        if (error instanceof ApiSessionExpiredError) {
          onSessionExpired(error.message);
          return;
        }
        const offlineCopy =
          cached || (await loadOfflineRoutes(userEmail, selectedClientId));
        if (revision !== loadRevisionRef.current) {
          return;
        }
        if (offlineCopy) {
          setClients(offlineCopy.clients);
          setRoutes(offlineCopy.routes);
          setShowingOfflineCopy(true);
        } else {
          setErrorState(createRouteSyncErrorState(error));
        }
      } finally {
        if (revision === loadRevisionRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accessToken, offline, onSessionExpired, selectedClientId, userEmail],
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
    () => findSelectedClient(clients, selectedClientId),
    [clients, selectedClientId],
  );
  const clientFilterOptions = useMemo(
    () => createRouteListClientFilterOptions(clients, selectedClientId),
    [clients, selectedClientId],
  );
  const filteredRoutes = useMemo(
    () => filterSavedRoutes(routes, query),
    [query, routes],
  );
  const loadingState = createRouteListLoadingState();
  const emptyState = useMemo(
    () =>
      createRouteListEmptyState({
        query,
        routeCount: routes.length,
        selectedClientName: selectedClient?.name,
      }),
    [query, routes.length, selectedClient?.name],
  );
  const routeSummary = useMemo(
    () =>
      createRouteListSummaryState({
        filteredRouteCount: filteredRoutes.length,
        query,
        selectedClientName: selectedClient?.name,
        totalRouteCount: routes.length,
      }),
    [filteredRoutes.length, query, routes.length, selectedClient?.name],
  );
  const showRouteSearch = shouldShowRouteSearch({
    query,
    selectedClientName: selectedClient?.name,
    totalRouteCount: routes.length,
  });
  const showRouteSummary = shouldShowRouteSummary({
    query,
    selectedClientName: selectedClient?.name,
    totalRouteCount: routes.length,
  });
  const showEmptyState = shouldShowRouteEmptyState({
    errorAction: errorState?.action,
    filteredRouteCount: filteredRoutes.length,
    totalRouteCount: routes.length,
  });

  const handleSelectRoute = async (route: SavedSafeRoutePlan) => {
    const revision = detailRevisionRef.current + 1;
    detailRevisionRef.current = revision;
    setDetailLoadingId(route.id);
    setErrorState(null);

    if (offline) {
      const cached =
        (await loadOfflineRouteDetail(userEmail, route.id)) ||
        (hasUsableRoutePlan(route) ? route : null);
      if (revision !== detailRevisionRef.current) {
        return;
      }
      if (cached) {
        setShowingOfflineCopy(true);
        setDetailLoadingId(null);
        onSelectRoute(cached);
        return;
      }
    }

    try {
      const routeDetail = await fetchRouteDetail(accessToken, route.id);
      if (revision !== detailRevisionRef.current) {
        return;
      }
      void saveOfflineRouteDetail(userEmail, routeDetail).catch(() => undefined);
      onSelectRoute(routeDetail);
    } catch (error) {
      if (revision !== detailRevisionRef.current) {
        return;
      }
      if (error instanceof ApiSessionExpiredError) {
        onSessionExpired(error.message);
        return;
      }
      const cached =
        (await loadOfflineRouteDetail(userEmail, route.id)) ||
        (hasUsableRoutePlan(route) ? route : null);
      if (revision !== detailRevisionRef.current) {
        return;
      }
      if (cached) {
        setShowingOfflineCopy(true);
        onSelectRoute(cached);
      } else {
        setErrorState({
          ...createRouteDetailErrorState(error, route.name),
          route,
        });
      }
    } finally {
      if (revision === detailRevisionRef.current) {
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
        onSelectClient={setSelectedClientId}
      />

      {showingOfflineCopy ? (
        <View accessibilityRole="alert" style={styles.offlineNotice}>
          <Text style={styles.offlineNoticeText}>
            Offline saved copy · route maps and guidance remain available
          </Text>
        </View>
      ) : null}

      {errorState ? (
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
      ) : null}

      {loading ? (
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
