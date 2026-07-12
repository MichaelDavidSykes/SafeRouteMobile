import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorState, setErrorState] = useState<RouteListErrorState | null>(null);
  const selectedClientIdRef = useRef<string | null>(null);
  const loadRevisionRef = useRef(0);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadOperations = useCallback(
    async ({
      clientId = selectedClientIdRef.current,
      refresh = false
    }: { clientId?: string | null; refresh?: boolean } = {}) => {
      const revision = loadRevisionRef.current + 1;
      loadRevisionRef.current = revision;
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorState(null);
      setOperationsWarning(null);

      try {
        const result = await fetchSavedRoutes(accessToken, clientId || undefined);
        if (revision !== loadRevisionRef.current) {
          return;
        }
        const nextClientId = resolveOperationsClientId(
          result.clients,
          clientId,
          result.selectedClientId
        );

        setClients(result.clients);
        selectedClientIdRef.current = nextClientId;
        setSelectedClientId(nextClientId);
        setRoutes(result.routes);

        if (!nextClientId) {
          setOperationsState(createEmptyOperationsState());
          return;
        }

        try {
          const nextOperationsState = await fetchOperationsState(accessToken, nextClientId);
          if (revision !== loadRevisionRef.current) {
            return;
          }
          setOperationsState(nextOperationsState);
        } catch (operationsError) {
          if (revision !== loadRevisionRef.current) {
            return;
          }
          const warning = createOperationsSyncWarningState(operationsError);
          setOperationsWarning(warning.message);
          setOperationsState(null);
        }
      } catch (error) {
        if (revision !== loadRevisionRef.current) {
          return;
        }
        if (error instanceof ApiSessionExpiredError) {
          onSessionExpired(error.message);
          return;
        }
        setErrorState(createRouteSyncErrorState(error));
      } finally {
        if (revision === loadRevisionRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accessToken, onSessionExpired]
  );

  useEffect(() => {
    void loadOperations();
    return () => {
      loadRevisionRef.current += 1;
    };
  }, [loadOperations]);

  const tabOptions = useMemo(() => createOperationsTabOptions(activeTab), [activeTab]);
  const clientFilterOptions = useMemo(
    () => createOperationsClientFilterOptions(clients, selectedClientId),
    [clients, selectedClientId]
  );
  const selectedClientOption = clientFilterOptions.find((client) => client.selected)
    || clientFilterOptions[0];
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
        <View style={styles.headerTopRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>SafeRoute · View only</Text>
            <Text numberOfLines={1} style={styles.title}>{title}</Text>
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
        <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
      </View>

      {sessionNoticeState ? (
        <View accessibilityRole="alert" style={styles.noticeBox}>
          <Text
            accessibilityLabel={sessionNoticeState.accessibilityLabel || undefined}
            numberOfLines={1}
            style={styles.noticeText}
          >
            {sessionNoticeState.message}
          </Text>
        </View>
      ) : null}

      <View style={styles.tabs}>
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
            onPress={() => {
              setClientMenuOpen(false);
              setActiveTab(tab.id);
            }}
          >
            <Text style={[styles.tabText, tab.selected ? styles.tabTextSelected : null]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {shouldShowOperationsClientFilters(clientFilterOptions) && selectedClientOption ? (
        <View style={styles.clientFilter}>
          <Pressable
            accessibilityHint="Opens the tenant selector."
            accessibilityLabel={`Tenant, ${selectedClientOption.label}`}
            accessibilityRole="button"
            accessibilityState={{ expanded: clientMenuOpen }}
            testID={uiTestIds.operationsClientSelector}
            style={({ pressed }) => [
              styles.clientSelector,
              clientMenuOpen ? styles.clientSelectorOpen : null,
              pressed ? styles.tabPressed : null
            ]}
            onPress={() => setClientMenuOpen((open) => !open)}
          >
            <View style={styles.clientSelectorCopy}>
              <Text style={styles.clientSelectorLabel}>Tenant</Text>
              <Text numberOfLines={1} style={styles.clientSelectorValue}>
                {selectedClientOption.label}
              </Text>
            </View>
            <Text style={styles.clientSelectorAction}>
              {clientMenuOpen ? "Close" : "Change"}
            </Text>
          </Pressable>
          {clientMenuOpen ? (
            <View style={styles.clientMenu}>
              <ScrollView
                nestedScrollEnabled
                contentContainerStyle={styles.clientMenuContent}
                showsVerticalScrollIndicator={false}
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
                      styles.clientMenuItem,
                      client.selected ? styles.clientMenuItemSelected : null,
                      pressed ? styles.clientMenuItemPressed : null
                    ]}
                    onPress={() => {
                      setClientMenuOpen(false);
                      selectedClientIdRef.current = client.id;
                      setSelectedClientId(client.id);
                      void loadOperations({ clientId: client.id });
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.clientMenuItemText,
                        client.selected ? styles.clientMenuItemTextSelected : null
                      ]}
                    >
                      {client.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}

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
        {row.routeLabels.map((routeLabel, index) => (
          <Text key={`${routeLabel}-${index}`} numberOfLines={1} style={styles.convoyRouteText}>
            {routeLabel}
          </Text>
        ))}
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
