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
import { createRouteSyncErrorState, type RouteListErrorState } from "../routes/routeListErrors";
import {
  createRouteListMapReturnState,
  createRouteListSignOutState
} from "../routes/routeListUiState";
import { colors } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";
import { operationsStyles as styles } from "./OperationsScreen.styles";
import { fetchOperationsState } from "./operationsApi";
import type { SafeRouteOperationsState } from "./operationsTypes";
import type { SafeRouteWorkspace } from "../workspaces/activeWorkspace";
import { WorkspaceAccessRefreshControl } from "../workspaces/WorkspaceAccessRefreshControl";
import type { WorkspaceAccessIssue } from "../workspaces/workspaceAccessRefreshState";
import { loadOperationsWorkspaceData } from "./operationsWorkspaceLoadCore";
import {
  createCalendarRows,
  createConvoyRows,
  createOperationsEmptyState,
  createOperationsLoadingLabel,
  createOperationsSubtitle,
  createOperationsSummaryState,
  createOperationsSyncWarningState,
  createOperationsTabOptions,
  createOperationsTitle,
  createOperationsWorkspaceOptions,
  createOperationsWorkspaceState,
  createPlannedRouteRows,
  shouldShowOperationsWorkspaceSelector,
  type OperationsConvoyRow,
  type OperationsRouteRow,
  type OperationsTab
} from "./operationsUiState";

const OPERATIONS_ERROR_ACTION_HIT_SLOP = 6;

interface OperationsScreenProps {
  accessToken: string;
  activeWorkspace: SafeRouteWorkspace | null;
  availableWorkspaces: SafeRouteWorkspace[];
  initialTab: OperationsTab;
  sessionNotice?: string;
  userEmail: string;
  onBackToMap: () => void;
  onRetryWorkspaceCatalog: () => void;
  onSessionExpired: (message?: string) => void;
  onSignOut: () => void;
  onWorkspaceUnavailable: (workspaceId: string) => void;
  onWorkspaceChange: (workspace: SafeRouteWorkspace) => void;
  workspaceCatalogError: string;
  workspaceCatalogLoading: boolean;
  workspaceAccessRecoveryPending: boolean;
  workspaceAccessRefreshAvailable: boolean;
  workspaceAccessIssue: WorkspaceAccessIssue;
  workspaceSwitchDisabled: boolean;
}

export function OperationsScreen({
  accessToken,
  activeWorkspace,
  availableWorkspaces,
  initialTab,
  onBackToMap,
  onRetryWorkspaceCatalog,
  onSessionExpired,
  onSignOut,
  onWorkspaceUnavailable,
  onWorkspaceChange,
  sessionNotice,
  userEmail,
  workspaceCatalogError,
  workspaceCatalogLoading,
  workspaceAccessRecoveryPending,
  workspaceAccessRefreshAvailable,
  workspaceAccessIssue,
  workspaceSwitchDisabled
}: OperationsScreenProps) {
  const [activeTab, setActiveTab] = useState<OperationsTab>(initialTab);
  const [routes, setRoutes] = useState<SavedSafeRoutePlan[]>([]);
  const [operationsState, setOperationsState] = useState<SafeRouteOperationsState | null>(null);
  const [operationsWarning, setOperationsWarning] = useState<string | null>(null);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorState, setErrorState] = useState<RouteListErrorState | null>(null);
  const loadRevisionRef = useRef(0);
  const selectedWorkspaceId = activeWorkspace?.id || null;
  const activeWorkspaceIdRef = useRef<string | null>(selectedWorkspaceId);
  activeWorkspaceIdRef.current = selectedWorkspaceId;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadOperations = useCallback(
    async ({
      refresh = false
    }: { refresh?: boolean } = {}) => {
      const revision = loadRevisionRef.current + 1;
      loadRevisionRef.current = revision;
      const requestWorkspaceId = selectedWorkspaceId;
      const requestOwnsWorkspace = () =>
        revision === loadRevisionRef.current &&
        activeWorkspaceIdRef.current === requestWorkspaceId;
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setLoadedWorkspaceId(null);
      setRoutes([]);
      setOperationsState(null);
      setErrorState(null);
      setOperationsWarning(null);

      if (!requestWorkspaceId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        const result = await loadOperationsWorkspaceData({
          loadOperations: () => fetchOperationsState(accessToken, requestWorkspaceId),
          loadRoutes: () => fetchSavedRoutes(accessToken, requestWorkspaceId),
          ownsRequest: requestOwnsWorkspace,
          workspaceId: requestWorkspaceId
        });
        if (result.status === "stale" || !requestOwnsWorkspace()) {
          return;
        }
        if (result.status === "workspace-unavailable") {
          loadRevisionRef.current += 1;
          activeWorkspaceIdRef.current = null;
          setLoadedWorkspaceId(null);
          setRoutes([]);
          setOperationsState(null);
          setOperationsWarning(null);
          setErrorState(null);
          setClientMenuOpen(false);
          onWorkspaceUnavailable(requestWorkspaceId);
          return;
        }
        if (result.status === "loaded") {
          setRoutes(result.routes);
          setLoadedWorkspaceId(requestWorkspaceId);
          setOperationsState(result.operationsState);
          return;
        }

        if (result.error instanceof ApiSessionExpiredError) {
          onSessionExpired(result.error.message);
          return;
        }
        setRoutes(result.routes);
        setLoadedWorkspaceId(requestWorkspaceId);
        const warning = createOperationsSyncWarningState(result.error);
        setOperationsWarning(warning.message);
        setOperationsState(null);
      } catch (error) {
        if (!requestOwnsWorkspace()) {
          return;
        }
        if (error instanceof ApiSessionExpiredError) {
          onSessionExpired(error.message);
          return;
        }
        setErrorState(createRouteSyncErrorState(error));
      } finally {
        if (requestOwnsWorkspace()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accessToken, onSessionExpired, onWorkspaceUnavailable, selectedWorkspaceId]
  );

  useEffect(() => {
    void loadOperations();
    return () => {
      loadRevisionRef.current += 1;
    };
  }, [loadOperations]);

  const tabOptions = useMemo(() => createOperationsTabOptions(activeTab), [activeTab]);
  const workspaceOptions = useMemo(
    () => createOperationsWorkspaceOptions(availableWorkspaces, selectedWorkspaceId),
    [availableWorkspaces, selectedWorkspaceId]
  );
  const selectedWorkspaceOption = workspaceOptions.find((workspace) => workspace.selected);
  const workspaceOwnsResults = Boolean(
    selectedWorkspaceId && loadedWorkspaceId === selectedWorkspaceId
  );
  const visibleRoutes = workspaceOwnsResults ? routes : [];
  const visibleOperationsState = workspaceOwnsResults ? operationsState : null;
  const plannedRows = useMemo(
    () => createPlannedRouteRows(visibleRoutes, visibleOperationsState),
    [visibleOperationsState, visibleRoutes]
  );
  const calendarRows = useMemo(
    () => createCalendarRows(visibleRoutes, visibleOperationsState),
    [visibleOperationsState, visibleRoutes]
  );
  const convoyRows = useMemo(
    () => createConvoyRows(visibleRoutes, visibleOperationsState),
    [visibleOperationsState, visibleRoutes]
  );
  const summaryState = useMemo(
    () => createOperationsSummaryState(visibleRoutes, visibleOperationsState),
    [visibleOperationsState, visibleRoutes]
  );
  const emptyState = createOperationsEmptyState(activeTab);
  const mapReturnState = createRouteListMapReturnState();
  const signOutState = createRouteListSignOutState(userEmail);
  const sessionNoticeState = createSessionNoticeState(sessionNotice);
  const title = createOperationsTitle(activeTab);
  const subtitle = createOperationsSubtitle(activeTab);
  const loadingLabel = createOperationsLoadingLabel(activeTab);
  const workspaceState = createOperationsWorkspaceState({
    activeWorkspaceId: selectedWorkspaceId,
    availableWorkspaceCount: availableWorkspaces.length,
    errorMessage: workspaceCatalogError,
    loading: workspaceCatalogLoading
  });

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

      {shouldShowOperationsWorkspaceSelector(workspaceOptions) ? (
        <View style={styles.clientFilter}>
          <Pressable
            accessibilityHint={workspaceSwitchDisabled
              ? "End active guidance before changing workspace."
              : "Opens the active workspace menu."}
            accessibilityLabel={`Workspace, ${selectedWorkspaceOption?.label || "Choose workspace"}`}
            accessibilityRole="button"
            accessibilityState={{
              disabled: workspaceSwitchDisabled,
              expanded: clientMenuOpen
            }}
            disabled={workspaceSwitchDisabled}
            testID={uiTestIds.operationsWorkspaceSelector}
            style={({ pressed }) => [
              styles.clientSelector,
              clientMenuOpen ? styles.clientSelectorOpen : null,
              pressed && !workspaceSwitchDisabled ? styles.tabPressed : null
            ]}
            onPress={() => {
              if (!workspaceSwitchDisabled) {
                setClientMenuOpen((open) => !open);
              }
            }}
          >
            <View style={styles.clientSelectorCopy}>
              <Text style={styles.clientSelectorLabel}>Workspace</Text>
              <Text numberOfLines={1} style={styles.clientSelectorValue}>
                {selectedWorkspaceOption?.label || "Choose workspace"}
              </Text>
            </View>
            <Text style={styles.clientSelectorAction}>
              {clientMenuOpen ? "Close" : "Change"}
            </Text>
          </Pressable>
          {clientMenuOpen && !workspaceSwitchDisabled ? (
            <View style={styles.clientMenu}>
              <ScrollView
                nestedScrollEnabled
                contentContainerStyle={styles.clientMenuContent}
                showsVerticalScrollIndicator={false}
              >
                {workspaceOptions.map((workspace) => (
                  <Pressable
                    key={workspace.id}
                    accessibilityHint={workspace.accessibilityHint}
                    accessibilityLabel={workspace.accessibilityLabel}
                    accessibilityRole="button"
                    accessibilityState={{ selected: workspace.selected }}
                    testID={uiTestIds.operationsWorkspaceOption(workspace.id)}
                    style={({ pressed }) => [
                      styles.clientMenuItem,
                      workspace.selected ? styles.clientMenuItemSelected : null,
                      pressed ? styles.clientMenuItemPressed : null
                    ]}
                    onPress={() => {
                      const nextWorkspace = availableWorkspaces.find(
                        (candidate) => candidate.id === workspace.id
                      );
                      if (!nextWorkspace || nextWorkspace.id === selectedWorkspaceId) {
                        setClientMenuOpen(false);
                        return;
                      }
                      setClientMenuOpen(false);
                      loadRevisionRef.current += 1;
                      activeWorkspaceIdRef.current = nextWorkspace.id;
                      setLoadedWorkspaceId(null);
                      setRoutes([]);
                      setOperationsState(null);
                      setOperationsWarning(null);
                      setErrorState(null);
                      setLoading(true);
                      setRefreshing(false);
                      onWorkspaceChange(nextWorkspace);
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.clientMenuItemText,
                        workspace.selected ? styles.clientMenuItemTextSelected : null
                      ]}
                    >
                      {workspace.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}

      {workspaceAccessRefreshAvailable &&
      (availableWorkspaces.length > 0 || !workspaceCatalogError) ? (
        <WorkspaceAccessRefreshControl
          accessRecoveryPending={workspaceAccessRecoveryPending}
          availableWorkspaceCount={availableWorkspaces.length}
          issue={workspaceAccessIssue}
          loading={workspaceCatalogLoading}
          onRefresh={() => {
            setClientMenuOpen(false);
            onRetryWorkspaceCatalog();
          }}
        />
      ) : null}

      {!workspaceState && !loading && !errorState && workspaceOwnsResults ? (
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

      {!workspaceState && workspaceOwnsResults && operationsWarning ? (
        <View
          accessibilityRole="alert"
          testID={uiTestIds.operationsSyncWarning}
          style={styles.warningBox}
        >
          <Text
            accessibilityLabel={operationsWarning}
            numberOfLines={2}
            style={styles.warningText}
          >
            {operationsWarning}
          </Text>
        </View>
      ) : null}

      {workspaceState ? (
        <View style={styles.loadingState}>
          <View
            accessible
            accessibilityLabel={workspaceState.accessibilityLabel}
            accessibilityRole={workspaceState.loading ? "progressbar" : "summary"}
            testID={uiTestIds.operationsWorkspaceState}
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
              hitSlop={OPERATIONS_ERROR_ACTION_HIT_SLOP}
              testID={uiTestIds.operationsWorkspaceRetry}
              style={({ pressed }) => [
                styles.retryButton,
                pressed ? styles.retryButtonPressed : null
              ]}
              onPress={onRetryWorkspaceCatalog}
            >
              <Text numberOfLines={1} style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : errorState ? (
        <View
          accessibilityRole="alert"
          testID={uiTestIds.operationsErrorState}
          style={styles.errorBox}
        >
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
            hitSlop={OPERATIONS_ERROR_ACTION_HIT_SLOP}
            testID={uiTestIds.operationsRetry}
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

      {!workspaceState && !errorState ? (
        loading ? (
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
                testID={uiTestIds.operationsEmptyState}
                style={styles.emptyState}
              >
                <Text style={styles.emptyTitle}>{emptyState.title}</Text>
                <Text style={styles.emptyCopy}>{emptyState.copy}</Text>
              </View>
            ) : null}
          </ScrollView>
        )
      ) : null}
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
