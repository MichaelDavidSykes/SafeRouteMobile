import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createSessionNoticeState } from "../auth/sessionNoticeState";
import { ApiSessionExpiredError } from "../api/apiClient";
import { useNetworkAvailability } from "../api/useNetworkAvailability";
import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import { fetchSavedRoutes } from "../routes/routeApi";
import { createRouteSyncErrorState, type RouteListErrorState } from "../routes/routeListErrors";
import {
  createRouteListMapReturnState,
  createRouteListSignOutState
} from "../routes/routeListUiState";
import { colors } from "../../theme";
import { recordOfflineCalendarWorkspaceSeedContractEvidence } from "../../testing/offlineCalendarCleanupContractEvidence";
import { uiTestIds } from "../../testing/uiTestIds";
import { operationsStyles as styles } from "./OperationsScreen.styles";
import { fetchOperationsState } from "./operationsApi";
import type { SafeRouteOperationsState } from "./operationsTypes";
import {
  clearOfflineOperationsWorkspace,
  disableOfflineOperationsCalendarSaving,
  enableOfflineOperationsCalendarSaving,
  getOfflineOperationsCalendarSavingPreference,
  loadOfflineOperationsSnapshotIfAllowed,
  removeOfflineOperationsWorkspaceCalendar,
  saveOfflineOperationsSnapshotIfAllowed,
} from "./offlineOperationsCache";
import type {
  OfflineOperationsCalendarEntry,
  OfflineOperationsSnapshot,
} from "./offlineOperationsCacheCore";
import type { SafeRouteWorkspace } from "../workspaces/activeWorkspace";
import { WorkspaceAccessRefreshControl } from "../workspaces/WorkspaceAccessRefreshControl";
import type { WorkspaceAccessIssue } from "../workspaces/workspaceAccessRefreshState";
import { loadOperationsWorkspaceData } from "./operationsWorkspaceLoadCore";
import {
  createCalendarRows,
  createConvoyRows,
  createOperationsEmptyState,
  createOperationsExpiredCacheMessage,
  createOperationsLoadingLabel,
  createOperationsOfflineEmptyState,
  createOperationsOfflineSavingEmptyState,
  createOperationsOfflineReviewPresentation,
  createOperationsOfflineCalendarSavingPresentation,
  createOperationsSubtitle,
  createOperationsSummaryState,
  createOperationsSyncWarningState,
  createOperationsTabOptions,
  createOperationsTitle,
  createOperationsWorkspaceOptions,
  createOperationsWorkspaceState,
  getOperationsOfflineReviewRefreshDelayMs,
  createOfflineCalendarRows,
  createOperationsOfflineCalendarRemovalPresentation,
  createPlannedRouteRows,
  shouldShowOperationsWorkspaceSelector,
  type OperationsConvoyRow,
  type OperationsOfflineCalendarRemovalState,
  type OperationsOfflineCalendarSavingState,
  type OperationsRouteRow,
  type OperationsTab
} from "./operationsUiState";

const OPERATIONS_ERROR_ACTION_HIT_SLOP = 6;
const OFFLINE_CALENDAR_REMOVAL_RETRY_SCOPES = new Set<string>();

function resolveOfflineCalendarSavingState(
  status:
    | "allowed"
    | "cleanup-pending"
    | "cleanup-retry"
    | "disabled"
    | "enabled"
    | "unavailable"
    | "unverified",
): OperationsOfflineCalendarSavingState {
  if (status === "cleanup-pending" || status === "cleanup-retry") {
    return "cleanup-retry";
  }
  if (status === "unverified") {
    return "stop-retry";
  }
  if (status === "disabled") {
    return "disabled";
  }
  if (status === "unavailable") {
    return "unavailable";
  }
  return "enabled";
}

interface OperationsScreenProps {
  accessToken: string;
  activeWorkspace: SafeRouteWorkspace | null;
  availableWorkspaces: SafeRouteWorkspace[];
  cacheIdentity: string;
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
  workspaceCatalogStoredAtMs: number | null;
  workspaceAuthorizationFresh: boolean;
  workspaceAccessRecoveryPending: boolean;
  workspaceAccessRefreshAvailable: boolean;
  workspaceAccessFocusTargetRef?: (target: View | null) => void;
  workspaceAccessIssue: WorkspaceAccessIssue;
  workspaceSwitchDisabled: boolean;
}

export function OperationsScreen({
  accessToken,
  activeWorkspace,
  availableWorkspaces,
  cacheIdentity,
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
  workspaceCatalogStoredAtMs,
  workspaceAuthorizationFresh,
  workspaceAccessRecoveryPending,
  workspaceAccessRefreshAvailable,
  workspaceAccessFocusTargetRef,
  workspaceAccessIssue,
  workspaceSwitchDisabled
}: OperationsScreenProps) {
  const {
    checking: networkChecking,
    online,
    status: networkStatus,
  } = useNetworkAvailability();
  const protectedRequestsAvailable = online && workspaceAuthorizationFresh;
  const selectedWorkspaceId = activeWorkspace?.id || null;
  const offlineCalendarRemovalScopeKey = JSON.stringify([
    cacheIdentity,
    selectedWorkspaceId,
  ]);
  const [activeTab, setActiveTab] = useState<OperationsTab>(initialTab);
  const [routes, setRoutes] = useState<SavedSafeRoutePlan[]>([]);
  const [operationsState, setOperationsState] = useState<SafeRouteOperationsState | null>(null);
  const [offlineCalendarEntries, setOfflineCalendarEntries] =
    useState<OfflineOperationsCalendarEntry[]>([]);
  const [operationsWarning, setOperationsWarning] = useState<string | null>(null);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const [showingOfflineCopy, setShowingOfflineCopy] = useState(false);
  const [offlineCopyStoredAtMs, setOfflineCopyStoredAtMs] =
    useState<number | null>(null);
  const [offlineCopyNowMs, setOfflineCopyNowMs] = useState(() => Date.now());
  const [storedOfflineCalendarRemovalState, setStoredOfflineCalendarRemovalState] =
    useState<OperationsOfflineCalendarRemovalState>("idle");
  const [storedOfflineCalendarSavingState, setStoredOfflineCalendarSavingState] =
    useState<OperationsOfflineCalendarSavingState>("checking");
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorState, setErrorState] = useState<RouteListErrorState | null>(null);
  const loadRevisionRef = useRef(0);
  const offlineCalendarRemovalRevisionRef = useRef(0);
  const offlineCalendarSavingRevisionRef = useRef(0);
  const offlineCalendarSavingPendingRef = useRef<{
    revision: number;
    scopeKey: string;
  } | null>(null);
  const offlineCalendarSavingAwaitingSaveScopeRef =
    useRef<string | null>(null);
  const offlineCalendarRemovalPendingRef = useRef<{
    revision: number;
    scopeKey: string;
  } | null>(null);
  const offlineCalendarRemovalReloadPendingRef = useRef(false);
  const offlineCalendarRemovalRetryScopesRef = useRef(
    OFFLINE_CALENDAR_REMOVAL_RETRY_SCOPES,
  );
  const offlineCalendarRemovalStateScopeRef = useRef(
    offlineCalendarRemovalScopeKey,
  );
  const offlineCalendarRemovalState =
    offlineCalendarRemovalStateScopeRef.current ===
    offlineCalendarRemovalScopeKey
      ? storedOfflineCalendarRemovalState
      : "idle";
  const offlineCalendarSavingStateScopeRef = useRef(
    offlineCalendarRemovalScopeKey,
  );
  const offlineCalendarSavingState =
    offlineCalendarSavingStateScopeRef.current ===
    offlineCalendarRemovalScopeKey
      ? storedOfflineCalendarSavingState
      : "checking";
  const setOfflineCalendarRemovalState = (
    state: OperationsOfflineCalendarRemovalState,
  ) => {
    offlineCalendarRemovalStateScopeRef.current =
      offlineCalendarRemovalScopeKey;
    setStoredOfflineCalendarRemovalState(state);
  };
  const setOfflineCalendarSavingState = (
    state: OperationsOfflineCalendarSavingState,
  ) => {
    offlineCalendarSavingStateScopeRef.current =
      offlineCalendarRemovalScopeKey;
    setStoredOfflineCalendarSavingState(state);
  };
  const setOfflineCalendarSavingStateFromLoad = (
    state: OperationsOfflineCalendarSavingState,
  ) => {
    if (
      offlineCalendarSavingPendingRef.current?.scopeKey ===
      offlineCalendarRemovalScopeKey
    ) {
      return;
    }
    setOfflineCalendarSavingState(state);
  };
  const protectedRequestsAvailableRef = useRef(protectedRequestsAvailable);
  if (protectedRequestsAvailableRef.current !== protectedRequestsAvailable) {
    protectedRequestsAvailableRef.current = protectedRequestsAvailable;
    loadRevisionRef.current += 1;
  }
  const activeWorkspaceIdRef = useRef<string | null>(selectedWorkspaceId);
  activeWorkspaceIdRef.current = selectedWorkspaceId;
  const loadedWorkspaceIdRef = useRef<string | null>(loadedWorkspaceId);
  loadedWorkspaceIdRef.current = loadedWorkspaceId;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadOperations = useCallback(
    async ({
      refresh = false
    }: { refresh?: boolean } = {}) => {
      const requestWorkspaceId = selectedWorkspaceId;
      const requestRemovalScopeKey = JSON.stringify([
        cacheIdentity,
        requestWorkspaceId,
      ]);
      if (
        offlineCalendarRemovalPendingRef.current?.scopeKey ===
        requestRemovalScopeKey
      ) {
        if (protectedRequestsAvailable) {
          offlineCalendarRemovalReloadPendingRef.current = true;
        }
        return;
      }
      const revision = loadRevisionRef.current + 1;
      loadRevisionRef.current = revision;
      const protectedOperationsRequest = protectedRequestsAvailable;
      const requestOwnsWorkspace = () =>
        revision === loadRevisionRef.current &&
        activeWorkspaceIdRef.current === requestWorkspaceId &&
        (
          !protectedOperationsRequest ||
          protectedRequestsAvailableRef.current
        );
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorState(null);

      if (!requestWorkspaceId) {
        loadedWorkspaceIdRef.current = null;
        setLoadedWorkspaceId(null);
        setRoutes([]);
        setOperationsState(null);
        setOfflineCalendarEntries([]);
        setOperationsWarning(null);
        setShowingOfflineCopy(false);
        setOfflineCopyStoredAtMs(null);
        setOfflineCalendarRemovalState("idle");
        setOfflineCalendarSavingState("checking");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const publishOfflineSnapshot = (
        snapshot: OfflineOperationsSnapshot,
        warning: string | null = null,
      ) => {
        loadedWorkspaceIdRef.current = requestWorkspaceId;
        setLoadedWorkspaceId(requestWorkspaceId);
        setRoutes([]);
        setOperationsState(null);
        setOfflineCalendarEntries(snapshot.entries);
        setOperationsWarning(
          warning ||
            (snapshot.truncated
              ? `Showing ${snapshot.entries.length} saved calendar movements. Calendar labels and endpoints are stored; full route plans, live risk and ETA, and convoy manifests are not.`
              : "Showing a saved calendar. Calendar labels and endpoints are stored; full route plans, live risk and ETA, and convoy manifests are not."),
        );
        setShowingOfflineCopy(true);
        setOfflineCopyStoredAtMs(snapshot.storedAtMs);
        setOfflineCopyNowMs(Date.now());
        setOfflineCalendarRemovalState("idle");
        setLoading(false);
        setRefreshing(false);
      };

      if (!protectedRequestsAvailable) {
        const cacheResult = await loadOfflineOperationsSnapshotIfAllowed(
          cacheIdentity,
          requestWorkspaceId,
        );
        if (!requestOwnsWorkspace()) {
          return;
        }
        setOfflineCalendarSavingStateFromLoad(
          resolveOfflineCalendarSavingState(cacheResult.status),
        );
        const cachedSnapshot = cacheResult.snapshot;
        if (cachedSnapshot) {
          publishOfflineSnapshot(cachedSnapshot);
        } else {
          loadedWorkspaceIdRef.current = requestWorkspaceId;
          setLoadedWorkspaceId(requestWorkspaceId);
          setRoutes([]);
          setOperationsState(null);
          setOfflineCalendarEntries([]);
          setOperationsWarning(
            networkChecking
              ? "Checking connection. No saved calendar is available yet."
              : online
                ? "Checking workspace access. No saved calendar is available yet."
                : "Offline calendar unavailable. Reconnect to load it.",
          );
          setShowingOfflineCopy(false);
          setOfflineCopyStoredAtMs(null);
          setLoading(false);
        }
        setRefreshing(false);
        return;
      }

      loadedWorkspaceIdRef.current = null;
      setLoadedWorkspaceId(null);
      setRoutes([]);
      setOperationsState(null);
      setOfflineCalendarEntries([]);
      setOperationsWarning(null);
      setShowingOfflineCopy(false);
      setOfflineCopyStoredAtMs(null);

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
          loadedWorkspaceIdRef.current = null;
          setLoadedWorkspaceId(null);
          setRoutes([]);
          setOperationsState(null);
          setOfflineCalendarEntries([]);
          setOperationsWarning(null);
          setShowingOfflineCopy(false);
          setOfflineCopyStoredAtMs(null);
          setOfflineCalendarRemovalState("idle");
          setErrorState(null);
          setClientMenuOpen(false);
          onWorkspaceUnavailable(requestWorkspaceId);
          return;
        }
        if (result.status === "loaded") {
          const cacheResult =
            await saveOfflineOperationsSnapshotIfAllowed(
              cacheIdentity,
              requestWorkspaceId,
              {
                operationsState: result.operationsState,
                routes: result.routes,
              },
            );
          if (!requestOwnsWorkspace()) {
            return;
          }
          if (cacheResult.status === "allowed" && cacheResult.snapshot) {
            await recordOfflineCalendarWorkspaceSeedContractEvidence(
              cacheIdentity,
              requestWorkspaceId,
            );
            if (!requestOwnsWorkspace()) {
              return;
            }
          }
          const cachedSnapshot = cacheResult.snapshot;
          const awaitingVerifiedSave =
            offlineCalendarSavingAwaitingSaveScopeRef.current ===
            requestRemovalScopeKey;
          if (
            awaitingVerifiedSave &&
            cacheResult.status === "allowed" &&
            cachedSnapshot
          ) {
            offlineCalendarSavingAwaitingSaveScopeRef.current = null;
          }
          setOfflineCalendarSavingStateFromLoad(
            awaitingVerifiedSave &&
              cacheResult.status === "allowed" &&
              cachedSnapshot
              ? "saved"
              : resolveOfflineCalendarSavingState(cacheResult.status),
          );
          setRoutes(result.routes);
          loadedWorkspaceIdRef.current = requestWorkspaceId;
          setLoadedWorkspaceId(requestWorkspaceId);
          setOperationsState(result.operationsState);
          setOfflineCalendarEntries([]);
          setShowingOfflineCopy(false);
          setOfflineCopyStoredAtMs(cachedSnapshot?.storedAtMs || null);
          if (cacheResult.status === "allowed") {
            offlineCalendarRemovalRetryScopesRef.current.delete(
              requestRemovalScopeKey,
            );
            setOfflineCalendarRemovalState("idle");
          }
          return;
        }

        const cacheResult = await loadOfflineOperationsSnapshotIfAllowed(
          cacheIdentity,
          requestWorkspaceId,
        );
        if (!requestOwnsWorkspace()) {
          return;
        }
        setOfflineCalendarSavingStateFromLoad(
          resolveOfflineCalendarSavingState(cacheResult.status),
        );
        const cachedSnapshot = cacheResult.snapshot;
        if (cachedSnapshot) {
          loadedWorkspaceIdRef.current = requestWorkspaceId;
          setLoadedWorkspaceId(requestWorkspaceId);
          setRoutes(result.routes);
          setOperationsState(null);
          setOfflineCalendarEntries(cachedSnapshot.entries);
          setOperationsWarning(
            cachedSnapshot.truncated
              ? `Trip and convoy manifests could not sync. Showing ${cachedSnapshot.entries.length} saved calendar movements; convoy manifests are not stored offline.`
              : "Trip and convoy manifests could not sync. Showing a saved calendar; convoy manifests are not stored offline.",
          );
          setShowingOfflineCopy(true);
          setOfflineCopyStoredAtMs(cachedSnapshot.storedAtMs);
          setOfflineCopyNowMs(Date.now());
          setOfflineCalendarRemovalState("idle");
          return;
        }
        setRoutes(result.routes);
        loadedWorkspaceIdRef.current = requestWorkspaceId;
        setLoadedWorkspaceId(requestWorkspaceId);
        const warning = createOperationsSyncWarningState(
          result.error
        );
        setOperationsWarning(warning.message);
        setOperationsState(null);
        setOfflineCalendarEntries([]);
      } catch (error) {
        if (!requestOwnsWorkspace()) {
          return;
        }
        if (error instanceof ApiSessionExpiredError) {
          onSessionExpired(error.message);
          return;
        }
        const cacheResult = await loadOfflineOperationsSnapshotIfAllowed(
          cacheIdentity,
          requestWorkspaceId,
        );
        if (!requestOwnsWorkspace()) {
          return;
        }
        setOfflineCalendarSavingStateFromLoad(
          resolveOfflineCalendarSavingState(cacheResult.status),
        );
        const cachedSnapshot = cacheResult.snapshot;
        if (cachedSnapshot) {
          publishOfflineSnapshot(
            cachedSnapshot,
            cachedSnapshot.truncated
              ? `Operations could not sync. Showing ${cachedSnapshot.entries.length} saved calendar movements.`
              : "Operations could not sync. Showing a saved calendar.",
          );
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
      networkChecking,
      networkStatus,
      online,
      onSessionExpired,
      onWorkspaceUnavailable,
      selectedWorkspaceId,
      protectedRequestsAvailable,
      workspaceAuthorizationFresh,
    ]
  );
  const loadOperationsRef = useRef(loadOperations);
  loadOperationsRef.current = loadOperations;

  useEffect(() => {
    void loadOperations();
    return () => {
      loadRevisionRef.current += 1;
    };
  }, [loadOperations]);

  useEffect(() => {
    offlineCalendarRemovalRevisionRef.current += 1;
    offlineCalendarSavingRevisionRef.current += 1;
    offlineCalendarRemovalPendingRef.current = null;
    offlineCalendarRemovalReloadPendingRef.current = false;
    offlineCalendarSavingPendingRef.current = null;
    offlineCalendarSavingAwaitingSaveScopeRef.current = null;
    offlineCalendarRemovalStateScopeRef.current =
      offlineCalendarRemovalScopeKey;
    offlineCalendarSavingStateScopeRef.current =
      offlineCalendarRemovalScopeKey;
    setStoredOfflineCalendarRemovalState(
      offlineCalendarRemovalRetryScopesRef.current.has(
        offlineCalendarRemovalScopeKey,
      )
        ? "retry"
        : "idle",
    );
    setStoredOfflineCalendarSavingState("checking");
    const preferenceWorkspaceId = selectedWorkspaceId;
    if (!preferenceWorkspaceId) {
      return;
    }
    const preferenceRevision = offlineCalendarSavingRevisionRef.current;
    void getOfflineOperationsCalendarSavingPreference(
      cacheIdentity,
      preferenceWorkspaceId,
    ).then((preference) => {
      if (
        offlineCalendarSavingRevisionRef.current !== preferenceRevision ||
        activeWorkspaceIdRef.current !== preferenceWorkspaceId
      ) {
        return;
      }
      setOfflineCalendarSavingState(
        resolveOfflineCalendarSavingState(preference),
      );
    });
  }, [offlineCalendarRemovalScopeKey]);

  useEffect(
    () => () => {
      offlineCalendarRemovalRevisionRef.current += 1;
      offlineCalendarSavingRevisionRef.current += 1;
      offlineCalendarRemovalPendingRef.current = null;
      offlineCalendarRemovalReloadPendingRef.current = false;
      offlineCalendarSavingPendingRef.current = null;
      offlineCalendarSavingAwaitingSaveScopeRef.current = null;
    },
    [],
  );

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
    () =>
      showingOfflineCopy && visibleRoutes.length === 0
        ? []
        : createPlannedRouteRows(visibleRoutes, visibleOperationsState),
    [showingOfflineCopy, visibleOperationsState, visibleRoutes]
  );
  const calendarRows = useMemo(
    () =>
      showingOfflineCopy
        ? createOfflineCalendarRows(offlineCalendarEntries)
        : createCalendarRows(visibleRoutes, visibleOperationsState),
    [
      offlineCalendarEntries,
      showingOfflineCopy,
      visibleOperationsState,
      visibleRoutes,
    ]
  );
  const convoyRows = useMemo(
    () =>
      showingOfflineCopy
        ? []
        : createConvoyRows(visibleRoutes, visibleOperationsState),
    [showingOfflineCopy, visibleOperationsState, visibleRoutes]
  );
  const summaryState = useMemo(
    () => createOperationsSummaryState(visibleRoutes, visibleOperationsState),
    [visibleOperationsState, visibleRoutes]
  );
  const offlineReviewStatus = networkChecking
    ? "checking-connection"
    : !online
      ? "offline"
      : protectedRequestsAvailable
        ? "sync-unavailable"
        : "checking-access";
  const offlineSavingEmptyState =
    activeTab === "calendar" && !protectedRequestsAvailable
      ? createOperationsOfflineSavingEmptyState(
          offlineCalendarSavingState,
        )
      : null;
  const emptyState =
    offlineSavingEmptyState ||
    (showingOfflineCopy || !protectedRequestsAvailable
      ? createOperationsOfflineEmptyState(
          activeTab,
          showingOfflineCopy,
          offlineReviewStatus,
        )
      : createOperationsEmptyState(activeTab));
  const mapReturnState = createRouteListMapReturnState();
  const signOutState = createRouteListSignOutState(userEmail);
  const sessionNoticeState = createSessionNoticeState(sessionNotice);
  const title = createOperationsTitle(activeTab);
  const subtitle = createOperationsSubtitle(activeTab);
  const loadingLabel =
    !protectedRequestsAvailable && networkChecking
      ? "Checking connection and securely saved Operations data."
      : !protectedRequestsAvailable && online
        ? "Checking workspace access."
        : createOperationsLoadingLabel(activeTab);
  const workspaceState = createOperationsWorkspaceState({
    activeWorkspaceId: selectedWorkspaceId,
    availableWorkspaceCount: availableWorkspaces.length,
    errorMessage: workspaceCatalogError,
    loading: workspaceCatalogLoading
  });
  const offlineReviewPresentation = useMemo(
    () =>
      offlineCopyStoredAtMs === null
        ? null
        : createOperationsOfflineReviewPresentation({
            nowMs: offlineCopyNowMs,
            status: offlineReviewStatus,
            storedAtMs: offlineCopyStoredAtMs,
          }),
    [offlineCopyNowMs, offlineCopyStoredAtMs, offlineReviewStatus],
  );
  const offlineCalendarRemovalPresentation = useMemo(
    () =>
      createOperationsOfflineCalendarRemovalPresentation(
        offlineCalendarRemovalState,
      ),
    [offlineCalendarRemovalState],
  );
  const offlineCalendarSavingPresentation = useMemo(
    () =>
      createOperationsOfflineCalendarSavingPresentation(
        offlineCalendarSavingState,
        selectedWorkspaceOption?.label,
      ),
    [offlineCalendarSavingState, selectedWorkspaceOption?.label],
  );

  useEffect(() => {
    if (!showingOfflineCopy || offlineCopyStoredAtMs === null) {
      return;
    }
    const refreshDelayMs = getOperationsOfflineReviewRefreshDelayMs({
      nowMs: offlineCopyNowMs,
      storedAtMs: offlineCopyStoredAtMs,
    });
    if (refreshDelayMs === null) {
      loadRevisionRef.current += 1;
      const expiringWorkspaceId = selectedWorkspaceId;
      let cancelled = false;
      void (async () => {
        let cleanupFailed = false;
        if (expiringWorkspaceId) {
          await clearOfflineOperationsWorkspace(
            cacheIdentity,
            expiringWorkspaceId,
          ).catch(() => {
            cleanupFailed = true;
          });
        }
        if (
          cancelled ||
          activeWorkspaceIdRef.current !== expiringWorkspaceId
        ) {
          return;
        }
        loadedWorkspaceIdRef.current = null;
        setLoadedWorkspaceId(null);
        setRoutes([]);
        setOperationsState(null);
        setOfflineCalendarEntries([]);
        setOperationsWarning(null);
        setShowingOfflineCopy(false);
        setOfflineCopyStoredAtMs(null);
        setErrorState(
          createRouteSyncErrorState(
            new Error(
              `${createOperationsExpiredCacheMessage(offlineReviewStatus)}${
                cleanupFailed
                  ? " Saved calendar cleanup needs retry."
                  : ""
              }`,
            ),
          ),
        );
      })();
      return () => {
        cancelled = true;
      };
    }
    const refreshTimer = setTimeout(() => {
      setOfflineCopyNowMs(Date.now());
    }, refreshDelayMs);
    return () => clearTimeout(refreshTimer);
  }, [
    offlineCopyNowMs,
    offlineCopyStoredAtMs,
    offlineReviewStatus,
    cacheIdentity,
    selectedWorkspaceId,
    showingOfflineCopy,
  ]);

  const handleRetry = () => {
    void loadOperations();
  };

  const removeSavedCalendar = async () => {
    const removalWorkspaceId = selectedWorkspaceId;
    const removalCacheIdentity = cacheIdentity;
    if (
      !removalWorkspaceId ||
      offlineCalendarRemovalState === "removing" ||
      offlineCalendarSavingPresentation.busy ||
      offlineCalendarSavingPendingRef.current?.scopeKey ===
        offlineCalendarRemovalScopeKey ||
      offlineCalendarRemovalPendingRef.current?.scopeKey ===
        offlineCalendarRemovalScopeKey ||
      activeWorkspaceIdRef.current !== removalWorkspaceId
    ) {
      return;
    }

    const removalRevision =
      offlineCalendarRemovalRevisionRef.current + 1;
    offlineCalendarRemovalRevisionRef.current = removalRevision;
    offlineCalendarRemovalPendingRef.current = {
      revision: removalRevision,
      scopeKey: offlineCalendarRemovalScopeKey,
    };
    offlineCalendarRemovalReloadPendingRef.current =
      protectedRequestsAvailableRef.current;
    const loadRevision = loadRevisionRef.current + 1;
    loadRevisionRef.current = loadRevision;

    loadedWorkspaceIdRef.current = removalWorkspaceId;
    setLoadedWorkspaceId(removalWorkspaceId);
    setRoutes([]);
    setOperationsState(null);
    setOfflineCalendarEntries([]);
    setOperationsWarning(null);
    setShowingOfflineCopy(false);
    setOfflineCopyStoredAtMs(null);
    setErrorState(null);
    setLoading(false);
    setRefreshing(false);
    setOfflineCalendarRemovalState("removing");

    let removalFailed = false;
    try {
      await removeOfflineOperationsWorkspaceCalendar(
        removalCacheIdentity,
        removalWorkspaceId,
      );
    } catch {
      removalFailed = true;
    }

    if (removalFailed) {
      offlineCalendarRemovalRetryScopesRef.current.add(
        offlineCalendarRemovalScopeKey,
      );
    } else {
      offlineCalendarRemovalRetryScopesRef.current.delete(
        offlineCalendarRemovalScopeKey,
      );
    }

    const pendingRemoval = offlineCalendarRemovalPendingRef.current;
    if (
      pendingRemoval?.revision !== removalRevision ||
      pendingRemoval.scopeKey !== offlineCalendarRemovalScopeKey
    ) {
      return;
    }
    offlineCalendarRemovalPendingRef.current = null;
    if (
      offlineCalendarRemovalRevisionRef.current !== removalRevision ||
      activeWorkspaceIdRef.current !== removalWorkspaceId
    ) {
      return;
    }
    setOfflineCalendarRemovalState(removalFailed ? "retry" : "removed");
    const reloadAfterRemoval =
      offlineCalendarRemovalReloadPendingRef.current &&
      protectedRequestsAvailableRef.current;
    offlineCalendarRemovalReloadPendingRef.current = false;
    if (reloadAfterRemoval) {
      void loadOperationsRef.current();
    }
  };

  const confirmRemoveSavedCalendar = () => {
    if (
      !showingOfflineCopy ||
      !selectedWorkspaceId ||
      offlineCalendarRemovalState === "removing" ||
      offlineCalendarSavingPresentation.busy ||
      offlineCalendarSavingPendingRef.current?.scopeKey ===
        offlineCalendarRemovalScopeKey
    ) {
      return;
    }
    const confirmation = offlineCalendarRemovalPresentation.confirmation;
    if (!confirmation) {
      return;
    }
    Alert.alert(confirmation.title, confirmation.copy, [
      {
        style: "cancel",
        text: "Cancel",
      },
      {
        onPress: () => {
          void removeSavedCalendar();
        },
        style: "destructive",
        text: "Remove",
      },
    ]);
  };

  const stopOfflineCalendarSaving = async () => {
    const preferenceWorkspaceId = selectedWorkspaceId;
    const preferenceCacheIdentity = cacheIdentity;
    if (
      !preferenceWorkspaceId ||
      offlineCalendarSavingPresentation.busy ||
      offlineCalendarRemovalState === "removing" ||
      offlineCalendarRemovalPendingRef.current?.scopeKey ===
        offlineCalendarRemovalScopeKey ||
      offlineCalendarSavingPendingRef.current?.scopeKey ===
        offlineCalendarRemovalScopeKey ||
      activeWorkspaceIdRef.current !== preferenceWorkspaceId
    ) {
      return;
    }
    const preferenceRevision =
      offlineCalendarSavingRevisionRef.current + 1;
    offlineCalendarSavingRevisionRef.current = preferenceRevision;
    offlineCalendarSavingPendingRef.current = {
      revision: preferenceRevision,
      scopeKey: offlineCalendarRemovalScopeKey,
    };
    offlineCalendarSavingAwaitingSaveScopeRef.current = null;
    loadRevisionRef.current += 1;
    setOfflineCalendarSavingState("stopping");
    if (showingOfflineCopy) {
      loadedWorkspaceIdRef.current = preferenceWorkspaceId;
      setLoadedWorkspaceId(preferenceWorkspaceId);
      setRoutes([]);
      setOperationsState(null);
      setOfflineCalendarEntries([]);
      setOperationsWarning(null);
      setShowingOfflineCopy(false);
      setOfflineCopyStoredAtMs(null);
      setErrorState(null);
    }
    if (loadedWorkspaceIdRef.current !== preferenceWorkspaceId) {
      loadedWorkspaceIdRef.current = preferenceWorkspaceId;
      setLoadedWorkspaceId(preferenceWorkspaceId);
      setRoutes([]);
      setOperationsState(null);
      setOfflineCalendarEntries([]);
    }
    setLoading(false);
    setRefreshing(false);

    let nextState: OperationsOfflineCalendarSavingState;
    try {
      const result = await disableOfflineOperationsCalendarSaving(
        preferenceCacheIdentity,
        preferenceWorkspaceId,
      );
      nextState =
        result === "capacity"
          ? "capacity"
          : result === "cleanup-retry"
            ? "cleanup-retry"
            : "disabled";
    } catch {
      nextState = "stop-retry";
    }
    if (
      offlineCalendarSavingRevisionRef.current !== preferenceRevision ||
      activeWorkspaceIdRef.current !== preferenceWorkspaceId
    ) {
      return;
    }
    const pendingPreference = offlineCalendarSavingPendingRef.current;
    if (
      pendingPreference?.revision !== preferenceRevision ||
      pendingPreference.scopeKey !== offlineCalendarRemovalScopeKey
    ) {
      return;
    }
    if (protectedRequestsAvailableRef.current) {
      await loadOperationsRef.current();
    }
    if (
      offlineCalendarSavingRevisionRef.current !== preferenceRevision ||
      activeWorkspaceIdRef.current !== preferenceWorkspaceId ||
      offlineCalendarSavingPendingRef.current?.revision !==
        preferenceRevision ||
      offlineCalendarSavingPendingRef.current.scopeKey !==
        offlineCalendarRemovalScopeKey
    ) {
      return;
    }
    offlineCalendarSavingPendingRef.current = null;
    setOfflineCalendarSavingState(nextState);
  };

  const confirmStopOfflineCalendarSaving = () => {
    const confirmation = offlineCalendarSavingPresentation.confirmation;
    if (
      !confirmation ||
      offlineCalendarSavingPresentation.busy ||
      offlineCalendarRemovalState === "removing" ||
      offlineCalendarRemovalPendingRef.current?.scopeKey ===
        offlineCalendarRemovalScopeKey
    ) {
      return;
    }
    Alert.alert(confirmation.title, confirmation.copy, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: () => {
          void stopOfflineCalendarSaving();
        },
        style: "destructive",
        text: "Stop saving",
      },
    ]);
  };

  const allowOfflineCalendarSaving = async () => {
    const preferenceWorkspaceId = selectedWorkspaceId;
    const preferenceCacheIdentity = cacheIdentity;
    if (
      !preferenceWorkspaceId ||
      offlineCalendarSavingPresentation.busy ||
      offlineCalendarRemovalState === "removing" ||
      offlineCalendarRemovalPendingRef.current?.scopeKey ===
        offlineCalendarRemovalScopeKey ||
      offlineCalendarSavingPendingRef.current?.scopeKey ===
        offlineCalendarRemovalScopeKey ||
      activeWorkspaceIdRef.current !== preferenceWorkspaceId
    ) {
      return;
    }
    const preferenceRevision =
      offlineCalendarSavingRevisionRef.current + 1;
    offlineCalendarSavingRevisionRef.current = preferenceRevision;
    offlineCalendarSavingPendingRef.current = {
      revision: preferenceRevision,
      scopeKey: offlineCalendarRemovalScopeKey,
    };
    setOfflineCalendarSavingState("allowing");
    try {
      await enableOfflineOperationsCalendarSaving(
        preferenceCacheIdentity,
        preferenceWorkspaceId,
      );
    } catch {
      if (
        offlineCalendarSavingRevisionRef.current === preferenceRevision &&
        activeWorkspaceIdRef.current === preferenceWorkspaceId
      ) {
        offlineCalendarSavingPendingRef.current = null;
        setOfflineCalendarSavingState("allow-retry");
      }
      return;
    }
    if (
      offlineCalendarSavingRevisionRef.current !== preferenceRevision ||
      activeWorkspaceIdRef.current !== preferenceWorkspaceId
    ) {
      return;
    }
    const pendingPreference = offlineCalendarSavingPendingRef.current;
    if (
      pendingPreference?.revision !== preferenceRevision ||
      pendingPreference.scopeKey !== offlineCalendarRemovalScopeKey
    ) {
      return;
    }
    offlineCalendarSavingPendingRef.current = null;
    offlineCalendarSavingAwaitingSaveScopeRef.current =
      offlineCalendarRemovalScopeKey;
    setOfflineCalendarSavingState("allowed");
    if (protectedRequestsAvailableRef.current) {
      void loadOperationsRef.current();
    }
  };

  const retryOfflineCalendarSavingCheck = async () => {
    const preferenceWorkspaceId = selectedWorkspaceId;
    if (!preferenceWorkspaceId) {
      return;
    }
    const preferenceRevision =
      offlineCalendarSavingRevisionRef.current + 1;
    offlineCalendarSavingRevisionRef.current = preferenceRevision;
    setOfflineCalendarSavingState("checking");
    const preference = await getOfflineOperationsCalendarSavingPreference(
      cacheIdentity,
      preferenceWorkspaceId,
    );
    if (
      offlineCalendarSavingRevisionRef.current !== preferenceRevision ||
      activeWorkspaceIdRef.current !== preferenceWorkspaceId
    ) {
      return;
    }
    setOfflineCalendarSavingState(
      resolveOfflineCalendarSavingState(preference),
    );
  };

  const handleOfflineCalendarSavingAction = () => {
    if (
      offlineCalendarRemovalState === "removing" ||
      offlineCalendarRemovalPendingRef.current?.scopeKey ===
        offlineCalendarRemovalScopeKey
    ) {
      return;
    }
    if (offlineCalendarSavingPresentation.actionKind === "stop") {
      if (offlineCalendarSavingPresentation.confirmation) {
        confirmStopOfflineCalendarSaving();
      } else {
        void stopOfflineCalendarSaving();
      }
      return;
    }
    if (offlineCalendarSavingPresentation.actionKind === "allow") {
      void allowOfflineCalendarSaving();
      return;
    }
    if (offlineCalendarSavingPresentation.actionKind === "check") {
      void retryOfflineCalendarSavingCheck();
    }
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
        <View accessibilityRole={sessionNoticeState.accessibilityRole} style={styles.noticeBox}>
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
            ref={workspaceAccessFocusTargetRef}
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
                      loadedWorkspaceIdRef.current = null;
                      setLoadedWorkspaceId(null);
                      setRoutes([]);
                      setOperationsState(null);
                      setOfflineCalendarEntries([]);
                      setOperationsWarning(null);
                      setShowingOfflineCopy(false);
                      setOfflineCopyStoredAtMs(null);
                      offlineCalendarRemovalRevisionRef.current += 1;
                      offlineCalendarSavingRevisionRef.current += 1;
                      offlineCalendarRemovalPendingRef.current = null;
                      offlineCalendarRemovalReloadPendingRef.current = false;
                      offlineCalendarSavingPendingRef.current = null;
                      offlineCalendarSavingAwaitingSaveScopeRef.current = null;
                      setOfflineCalendarRemovalState("idle");
                      setOfflineCalendarSavingState("checking");
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

      {workspaceAccessRefreshAvailable ? (
        <WorkspaceAccessRefreshControl
          accessRecoveryPending={workspaceAccessRecoveryPending}
          availableWorkspaceCount={availableWorkspaces.length}
          catalogStoredAtMs={
            workspaceAuthorizationFresh ? null : workspaceCatalogStoredAtMs
          }
          issue={workspaceAccessIssue}
          loading={workspaceCatalogLoading}
          onRefresh={() => {
            setClientMenuOpen(false);
            onRetryWorkspaceCatalog();
          }}
        />
      ) : null}

      {activeTab === "calendar" &&
      selectedWorkspaceId &&
      !workspaceState ? (
        <View style={styles.offlineSavingControl}>
          <View
            accessible
            accessibilityLabel={`${selectedWorkspaceOption?.label || "Current workspace"}. ${offlineCalendarSavingPresentation.title}. ${offlineCalendarSavingPresentation.message}`}
            accessibilityRole={
              offlineCalendarSavingPresentation.busy
                ? "progressbar"
                : offlineCalendarSavingPresentation.tone === "failure" ||
                    offlineCalendarSavingPresentation.tone === "success"
                  ? "alert"
                  : "summary"
            }
            accessibilityState={{
              busy: offlineCalendarSavingPresentation.busy,
            }}
            style={styles.offlineSavingCopy}
            testID={uiTestIds.operationsCalendarSavingStatus}
          >
            <View style={styles.offlineSavingTitleRow}>
              {offlineCalendarSavingPresentation.busy ? (
                <ActivityIndicator
                  color={colors.appleBlue}
                  size="small"
                />
              ) : null}
              <Text style={styles.offlineSavingTitle}>
                {offlineCalendarSavingPresentation.title}
              </Text>
            </View>
            <Text style={styles.offlineSavingMessage}>
              {offlineCalendarSavingPresentation.message}
            </Text>
          </View>
          {offlineCalendarSavingPresentation.actionLabel ? (
            <Pressable
              accessibilityHint={
                offlineCalendarSavingPresentation.actionAccessibilityHint ||
                undefined
              }
              accessibilityLabel={
                offlineCalendarSavingPresentation.actionAccessibilityLabel ||
                undefined
              }
              accessibilityRole="button"
              accessibilityState={{
                disabled:
                  offlineCalendarSavingPresentation.busy ||
                  offlineCalendarRemovalState === "removing",
              }}
              disabled={
                offlineCalendarSavingPresentation.busy ||
                offlineCalendarRemovalState === "removing"
              }
              testID={uiTestIds.operationsCalendarSavingControl}
              style={({ pressed }) => [
                styles.offlineSavingAction,
                offlineCalendarSavingPresentation.actionKind === "stop"
                  ? styles.offlineSavingActionDanger
                  : null,
                pressed ? styles.offlineSavingActionPressed : null,
              ]}
              onPress={handleOfflineCalendarSavingAction}
            >
              <Text
                style={[
                  styles.offlineSavingActionText,
                  offlineCalendarSavingPresentation.actionKind === "stop"
                    ? styles.offlineSavingActionDangerText
                    : null,
                ]}
              >
                {offlineCalendarSavingPresentation.actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showingOfflineCopy && offlineReviewPresentation ? (
        <View style={styles.offlineReviewControls}>
          <View
            accessible
            accessibilityLabel={offlineReviewPresentation.accessibilityLabel}
            accessibilityRole="alert"
            style={styles.offlineNotice}
            testID={uiTestIds.operationsOfflineNotice}
          >
            <Text style={styles.offlineNoticeText}>
              {offlineReviewPresentation.visibleLabel}
            </Text>
          </View>
          <Pressable
            accessibilityHint={
              offlineCalendarRemovalPresentation.actionAccessibilityHint ||
              undefined
            }
            accessibilityLabel={
              offlineCalendarRemovalPresentation.actionAccessibilityLabel ||
              undefined
            }
            accessibilityRole="button"
            accessibilityState={{
              busy: offlineCalendarRemovalPresentation.busy,
              disabled:
                offlineCalendarRemovalPresentation.busy ||
                offlineCalendarSavingPresentation.busy,
            }}
            disabled={
              offlineCalendarRemovalPresentation.busy ||
              offlineCalendarSavingPresentation.busy
            }
            testID={uiTestIds.operationsRemoveSavedCalendar}
            style={({ pressed }) => [
              styles.offlineRemoveButton,
              pressed ? styles.offlineRemoveButtonPressed : null,
            ]}
            onPress={confirmRemoveSavedCalendar}
          >
            <Text style={styles.offlineRemoveButtonText}>
              {offlineCalendarRemovalPresentation.actionLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {offlineCalendarRemovalPresentation.status ? (
        <View
          accessible
          accessibilityLabel={
            offlineCalendarRemovalPresentation.status.accessibilityLabel
          }
          accessibilityRole={
            offlineCalendarRemovalState === "removing"
              ? "progressbar"
              : "alert"
          }
          accessibilityState={{
            busy: offlineCalendarRemovalPresentation.busy,
          }}
          testID={uiTestIds.operationsCalendarRemovalStatus}
          style={[
            styles.offlineRemovalStatus,
            offlineCalendarRemovalPresentation.status.tone === "failure"
              ? styles.offlineRemovalStatusFailure
              : offlineCalendarRemovalPresentation.status.tone === "success"
                ? styles.offlineRemovalStatusSuccess
                : null,
          ]}
        >
          {offlineCalendarRemovalPresentation.busy ? (
            <ActivityIndicator color={colors.appleBlue} />
          ) : null}
          <View style={styles.offlineRemovalStatusCopy}>
            <Text style={styles.offlineRemovalStatusTitle}>
              {offlineCalendarRemovalPresentation.status.title}
            </Text>
            <Text style={styles.offlineRemovalStatusText}>
              {offlineCalendarRemovalPresentation.status.message}
            </Text>
          </View>
        </View>
      ) : null}

      {offlineCalendarRemovalState === "retry" ? (
        <Pressable
          accessibilityHint={
            offlineCalendarRemovalPresentation.actionAccessibilityHint ||
            undefined
          }
              accessibilityLabel={
                offlineCalendarRemovalPresentation.actionAccessibilityLabel ||
                undefined
              }
              accessibilityRole="button"
              accessibilityState={{
                disabled: offlineCalendarSavingPresentation.busy,
              }}
              disabled={offlineCalendarSavingPresentation.busy}
              testID={uiTestIds.operationsCalendarRemovalRetry}
          style={({ pressed }) => [
            styles.offlineRemovalRetry,
            pressed ? styles.offlineRemoveButtonPressed : null,
          ]}
          onPress={() => {
            void removeSavedCalendar();
          }}
        >
          <Text style={styles.offlineRemovalRetryText}>
            {offlineCalendarRemovalPresentation.actionLabel}
          </Text>
        </Pressable>
      ) : null}

      {!workspaceState &&
      !loading &&
      !errorState &&
      protectedRequestsAvailable &&
      workspaceOwnsResults &&
      (visibleOperationsState !== null || visibleRoutes.length > 0) &&
      !showingOfflineCopy ? (
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
          {workspaceState.retry && !workspaceAccessRefreshAvailable ? (
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
