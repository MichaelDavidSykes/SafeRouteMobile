import { useCallback, useEffect, useMemo, useState } from "react";
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

  const loadRoutes = useCallback(
    async ({ refresh = false }: { refresh?: boolean } = {}) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorState(null);

      try {
        const result = await fetchSavedRoutes(
          accessToken,
          selectedClientId || undefined,
        );
        setClients(result.clients);
        setSelectedClientId((currentClientId) =>
          reconcileSelectedClientId(result.clients, currentClientId),
        );
        setRoutes(result.routes);
      } catch (error) {
        if (error instanceof ApiSessionExpiredError) {
          onSessionExpired(error.message);
          return;
        }
        setErrorState(createRouteSyncErrorState(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, onSessionExpired, selectedClientId],
  );

  useEffect(() => {
    void loadRoutes();
  }, [loadRoutes]);

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
    setDetailLoadingId(route.id);
    setErrorState(null);

    try {
      const routeDetail = await fetchRouteDetail(accessToken, route.id);
      onSelectRoute(routeDetail);
    } catch (error) {
      if (error instanceof ApiSessionExpiredError) {
        onSessionExpired(error.message);
        return;
      }
      setErrorState({
        ...createRouteDetailErrorState(error, route.name),
        route,
      });
    } finally {
      setDetailLoadingId(null);
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
        onChangeQuery={setQuery}
        onSelectClient={setSelectedClientId}
      />

      {errorState ? (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <View style={styles.errorCopy}>
            <Text style={styles.errorTitle}>{errorState.title}</Text>
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
            style={({ pressed }) => [
              styles.retryButton,
              pressed ? styles.retryButtonPressed : null,
            ]}
            onPress={handleRetry}
          >
            <Text style={styles.retryText}>{errorState.retryLabel}</Text>
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
            <Text style={styles.loadingTitle}>{loadingState.title}</Text>
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
