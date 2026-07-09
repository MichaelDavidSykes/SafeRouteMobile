import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createSessionNoticeState } from "../auth/sessionNoticeState";
import { ApiSessionExpiredError } from "../api/apiClient";
import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import { fetchSavedRoutes } from "../routes/routeApi";
import type { MobileSafeRouteClient } from "../routes/routeMapper";
import { createRouteSyncErrorState, type RouteListErrorState } from "../routes/routeListErrors";
import {
  createRouteListMapReturnState,
  createRouteListSignOutState
} from "../routes/routeListUiState";
import { colors } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";
import { operationsStyles as styles } from "./OperationsScreen.styles";
import { fetchOperationsState } from "./operationsApi";
import { createEmptyOperationsState } from "./operationsApiCore";
import type { SafeRouteOperationsState } from "./operationsTypes";
import {
  createCalendarRows,
  createConvoyRows,
  createOperationsClientFilterOptions,
  createOperationsEmptyState,
  createOperationsLoadingLabel,
  createOperationsSubtitle,
  createOperationsSummaryState,
  createOperationsSyncWarningState,
  createOperationsTabOptions,
  createOperationsTitle,
  createPlannedRouteRows,
  resolveOperationsClientId,
  shouldShowOperationsClientFilters,
  type OperationsConvoyRow,
  type OperationsRouteRow,
  type OperationsTab
} from "./operationsUiState";

interface OperationsScreenProps {
  accessToken: string;
  initialTab: OperationsTab;
  sessionNotice?: string;
  userEmail: string;
  onBackToMap: () => void;
  onSessionExpired: (message?: string) => void;
  onSignOut: () => void;
}

export function OperationsScreen({
  accessToken,
  initialTab,
  onBackToMap,
  onSessionExpired,
  onSignOut,
  sessionNotice,
  userEmail
}: OperationsScreenProps) {
  const [activeTab, setActiveTab] = useState<OperationsTab>(initialTab);
  const [clients, setClients] = useState<MobileSafeRouteClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [routes, setRoutes] = useState<SavedSafeRoutePlan[]>([]);
  const [operationsState, setOperationsState] = useState<SafeRouteOperationsState | null>(null);
  const [operationsWarning, setOperationsWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorState, setErrorState] = useState<RouteListErrorState | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadOperations = useCallback(
    async ({ refresh = false }: { refresh?: boolean } = {}) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorState(null);
      setOperationsWarning(null);

      try {
        const result = await fetchSavedRoutes(accessToken, selectedClientId || undefined);
        const nextClientId = resolveOperationsClientId(
          result.clients,
          selectedClientId,
          result.selectedClientId
        );

        setClients(result.clients);
        setSelectedClientId(nextClientId);
        setRoutes(result.routes);

        if (!nextClientId) {
          setOperationsState(createEmptyOperationsState());
          return;
        }

        try {
          const nextOperationsState = await fetchOperationsState(accessToken, nextClientId);
          setOperationsState(nextOperationsState);
        } catch (operationsError) {
          if (operationsError instanceof ApiSessionExpiredError) {
            onSessionExpired(operationsError.message);
            return;
          }

          const warning = createOperationsSyncWarningState(operationsError);
          setOperationsWarning(warning.message);
          setOperationsState(createEmptyOperationsState(nextClientId));
        }
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
    [accessToken, onSessionExpired, selectedClientId]
  );

  useEffect(() => {
    void loadOperations();
  }, [loadOperations]);

  const tabOptions = useMemo(() => createOperationsTabOptions(activeTab), [activeTab]);
  const clientFilterOptions = useMemo(
    () => createOperationsClientFilterOptions(clients, selectedClientId),
    [clients, selectedClientId]
  );
  const plannedRows = useMemo(() => createPlannedRouteRows(routes, operationsState), [operationsState, routes]);
  const calendarRows = useMemo(() => createCalendarRows(routes, operationsState), [operationsState, routes]);
  const convoyRows = useMemo(() => createConvoyRows(routes, operationsState), [operationsState, routes]);
  const summaryState = useMemo(
    () => createOperationsSummaryState(routes, operationsState),
    [operationsState, routes]
  );
  const emptyState = createOperationsEmptyState(activeTab);
  const mapReturnState = createRouteListMapReturnState();
  const signOutState = createRouteListSignOutState(userEmail);
  const sessionNoticeState = createSessionNoticeState(sessionNotice);
  const title = createOperationsTitle(activeTab);
  const subtitle = createOperationsSubtitle(activeTab);
  const loadingLabel = createOperationsLoadingLabel(activeTab);

  const handleRetry = () => {
    void loadOperations();
  };

  return (
    <SafeAreaView testID={uiTestIds.operationsScreen} style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>SafeRoute operations</Text>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          <Text numberOfLines={2} style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityHint={mapReturnState.accessibilityHint}
            accessibilityLabel={mapReturnState.accessibilityLabel}
            accessibilityRole="button"
            testID={uiTestIds.operationsMapReturn}
            style={({ pressed }) => [
              styles.mapButton,
              pressed ? styles.mapButtonPressed : null
            ]}
            onPress={onBackToMap}
          >
            <Text style={styles.mapButtonText}>{mapReturnState.label}</Text>
          </Pressable>
          <Pressable
            accessibilityHint={signOutState.signOutAccessibilityHint}
            accessibilityLabel={signOutState.signOutAccessibilityLabel}
            accessibilityRole="button"
            testID={uiTestIds.operationsSignOut}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed ? styles.signOutButtonPressed : null
            ]}
            onPress={onSignOut}
          >
            <Text style={styles.signOutButtonText}>{signOutState.label}</Text>
          </Pressable>
        </View>
      </View>

      {sessionNoticeState ? (
        <View accessibilityRole="alert" style={styles.noticeBox}>
          <Text
            accessibilityLabel={sessionNoticeState.accessibilityLabel || undefined}
            numberOfLines={2}
            style={styles.noticeText}
          >
            {sessionNoticeState.message}
          </Text>
        </View>
      ) : null}

      {shouldShowOperationsClientFilters(clientFilterOptions) ? (
        <ScrollView
          horizontal
          contentContainerStyle={styles.clientTabs}
          showsHorizontalScrollIndicator={false}
        >
          {clientFilterOptions.map((client) => (
            <Pressable
              key={client.id}
              accessibilityHint={client.accessibilityHint}
              accessibilityLabel={client.accessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{ selected: client.selected }}
              testID={uiTestIds.operationsClientTab(client.id)}
              style={({ pressed }) => [
                styles.clientTab,
                client.selected ? styles.clientTabSelected : null,
                pressed ? styles.tabPressed : null
              ]}
              onPress={() => setSelectedClientId(client.id)}
            >
              <Text
                numberOfLines={1}
                style={[styles.clientTabText, client.selected ? styles.clientTabTextSelected : null]}
              >
                {client.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        horizontal
        contentContainerStyle={styles.tabs}
        showsHorizontalScrollIndicator={false}
      >
        {tabOptions.map((tab) => (
          <Pressable
            key={tab.id}
            accessibilityLabel={tab.accessibilityLabel}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab.selected }}
            testID={uiTestIds.operationsTab(tab.id)}
            style={({ pressed }) => [
              styles.tab,
              tab.selected ? styles.tabSelected : null,
              pressed ? styles.tabPressed : null
            ]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[styles.tabText, tab.selected ? styles.tabTextSelected : null]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {!loading ? (
        <View
          accessible
          accessibilityLabel={summaryState.accessibilityLabel}
          style={styles.summaryStrip}
        >
          {summaryState.metrics.map((metric) => (
            <View key={metric.label} style={styles.summaryMetric}>
              <Text style={styles.summaryValue}>{metric.value}</Text>
              <Text style={styles.summaryLabel}>{metric.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {operationsWarning ? (
        <View accessibilityRole="alert" style={styles.warningBox}>
          <Text
            accessibilityLabel={operationsWarning}
            numberOfLines={2}
            style={styles.warningText}
          >
            {operationsWarning}
          </Text>
        </View>
      ) : null}

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
              pressed ? styles.retryButtonPressed : null
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
            accessibilityLabel={loadingLabel}
            accessibilityRole="progressbar"
            style={styles.loadingCard}
          >
            <ActivityIndicator color={colors.appleBlue} />
            <Text style={styles.loadingTitle}>{loadingLabel}</Text>
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.ink}
              onRefresh={() => loadOperations({ refresh: true })}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {activeTab === "planned-routes"
            ? plannedRows.map((row) => <OperationsRouteCard key={row.id} row={row} />)
            : null}
          {activeTab === "calendar"
            ? calendarRows.map((row) => <OperationsRouteCard key={row.id} row={row} calendar />)
            : null}
          {activeTab === "convoy-management"
            ? convoyRows.map((row) => <OperationsConvoyCard key={row.id} row={row} />)
            : null}

          {shouldShowEmptyState({
            activeTab,
            calendarRows,
            convoyRows,
            plannedRows
          }) ? (
            <View
              accessible
              accessibilityLabel={emptyState.accessibilityLabel}
              style={styles.emptyState}
            >
              <Text style={styles.emptyTitle}>{emptyState.title}</Text>
              <Text style={styles.emptyCopy}>{emptyState.copy}</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function OperationsRouteCard({ calendar = false, row }: { calendar?: boolean; row: OperationsRouteRow }) {
  return (
    <View
      accessible
      accessibilityLabel={row.accessibilityLabel}
      testID={uiTestIds.operationsRouteCard(row.id)}
      style={styles.routeCard}
    >
      <View style={styles.routeHeader}>
        <Text numberOfLines={2} style={styles.routeTitle}>{row.title}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{calendar ? row.scheduleLabel : row.badgeLabel}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.routeEndpoint}>{row.endpointLabel}</Text>
      <Text numberOfLines={2} style={styles.routeMeta}>{row.metaLabel}</Text>
      <Text numberOfLines={2} style={styles.routeManifest}>{row.manifestLabel}</Text>
      {!calendar ? (
        <Text numberOfLines={1} style={styles.routeMeta}>{row.scheduleLabel}</Text>
      ) : null}
      <View style={styles.readOnlyPill}>
        <Text style={styles.readOnlyText}>View only</Text>
      </View>
    </View>
  );
}

function OperationsConvoyCard({ row }: { row: OperationsConvoyRow }) {
  return (
    <View
      accessible
      accessibilityLabel={row.accessibilityLabel}
      testID={uiTestIds.operationsConvoyCard(row.id)}
      style={styles.routeCard}
    >
      <View style={styles.routeHeader}>
        <Text numberOfLines={2} style={styles.routeTitle}>{row.title}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{row.statusLabel}</Text>
        </View>
      </View>
      <Text style={styles.routeMeta}>{row.metaLabel}</Text>
      <Text numberOfLines={2} style={styles.routeManifest}>{row.manifestLabel}</Text>
      <View style={styles.convoyRoutes}>
        {row.routeLabels.map((routeLabel) => (
          <View key={routeLabel} style={styles.convoyRoutePill}>
            <Text numberOfLines={1} style={styles.convoyRouteText}>{routeLabel}</Text>
          </View>
        ))}
      </View>
      <View style={styles.readOnlyPill}>
        <Text style={styles.readOnlyText}>View only</Text>
      </View>
    </View>
  );
}

function shouldShowEmptyState({
  activeTab,
  calendarRows,
  convoyRows,
  plannedRows
}: {
  activeTab: OperationsTab;
  calendarRows: OperationsRouteRow[];
  convoyRows: OperationsConvoyRow[];
  plannedRows: OperationsRouteRow[];
}): boolean {
  if (activeTab === "calendar") {
    return calendarRows.length === 0;
  }

  if (activeTab === "convoy-management") {
    return convoyRows.length === 0;
  }

  return plannedRows.length === 0;
}
