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
import { createRouteSyncErrorState, type RouteListErrorState } from "../routes/routeListErrors";
import {
  createRouteListMapReturnState,
  createRouteListSignOutState
} from "../routes/routeListUiState";
import { colors } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";
import { operationsStyles as styles } from "./OperationsScreen.styles";
import {
  createCalendarRows,
  createConvoyRows,
  createOperationsEmptyState,
  createOperationsLoadingLabel,
  createOperationsSubtitle,
  createOperationsTabOptions,
  createOperationsTitle,
  createPlannedRouteRows,
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
  const [routes, setRoutes] = useState<SavedSafeRoutePlan[]>([]);
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

      try {
        const result = await fetchSavedRoutes(accessToken);
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
    [accessToken, onSessionExpired]
  );

  useEffect(() => {
    void loadOperations();
  }, [loadOperations]);

  const tabOptions = useMemo(() => createOperationsTabOptions(activeTab), [activeTab]);
  const plannedRows = useMemo(() => createPlannedRouteRows(routes), [routes]);
  const calendarRows = useMemo(() => createCalendarRows(routes), [routes]);
  const convoyRows = useMemo(() => createConvoyRows(routes), [routes]);
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
