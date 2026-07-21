import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  findNodeHandle,
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
import { fetchRouteDetail, fetchSavedRoutes } from "../routes/routeApi";
import {
  createRouteDetailErrorState,
  createRouteSyncErrorState,
  type RouteListErrorState as BaseRouteListErrorState,
} from "../routes/routeListErrors";
import { hasUsableRoutePlan } from "../routes/offlineRouteCacheCore";
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
import { isWorkspaceForbiddenError } from "../workspaces/workspaceAccessRecovery";
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
const COMPACT_OFFLINE_SAVING_STATES = new Set<OperationsOfflineCalendarSavingState>([
  "allowed",
  "enabled",
  "saved",
]);

type OperationsRouteSelection = Pick<OperationsRouteRow, "id" | "routeId" | "title"> & {
  convoyId?: string | null;
};

interface OperationsErrorState extends BaseRouteListErrorState {
  row?: OperationsRouteSelection;
}

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
  initialConvoyId?: string | null;
  initialTab: OperationsTab;
  sessionNotice?: string;
  userEmail: string;
  onBackToMap: () => void;
  onRetryWorkspaceCatalog: () => void;
  onConvoySelectionChange?: (convoyId: string | null) => void;
  onSelectRoute: (
    route: SavedSafeRoutePlan,
    sourceTab: OperationsTab,
    sourceConvoyId?: string | null,
  ) => void;
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

export function OperationsScreen({
  accessToken,
  activeWorkspace,
  availableWorkspaces,
  cacheIdentity,
  initialConvoyId = null,
  initialTab,
  onBackToMap,
  onRetryWorkspaceCatalog,
  onConvoySelectionChange,
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
  const [selectedConvoyId, setSelectedConvoyId] = useState<string | null>(
    initialConvoyId,
  );
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorState, setErrorState] = useState<OperationsErrorState | null>(null);
  const loadRevisionRef = useRef(0);
  const detailRevisionRef = useRef(0);
  const detailLoadingIdRef = useRef<string | null>(null);
  const operationsListRef = useRef<ScrollView | null>(null);
  const convoyDetailHeadingRef = useRef<Text | null>(null);
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
    detailRevisionRef.current += 1;
    detailLoadingIdRef.current = null;
  }
  const activeWorkspaceIdRef = useRef<string | null>(selectedWorkspaceId);
  activeWorkspaceIdRef.current = selectedWorkspaceId;
  const loadedWorkspaceIdRef = useRef<string | null>(loadedWorkspaceId);
  loadedWorkspaceIdRef.current = loadedWorkspaceId;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    setActiveTab(initialTab);
    activeTabRef.current = initialTab;
    setSelectedConvoyId(
      initialTab === "convoy-management" ? initialConvoyId : null,
    );
    if (initialTab !== "convoy-management" && initialConvoyId) {
      onConvoySelectionChange?.(null);
    }
    detailRevisionRef.current += 1;
    detailLoadingIdRef.current = null;
    setDetailLoadingId(null);
  }, [initialConvoyId, initialTab]);

  useEffect(() => {
    detailRevisionRef.current += 1;
    detailLoadingIdRef.current = null;
    setDetailLoadingId(null);
  }, [protectedRequestsAvailable]);

  useEffect(() => {
    if (
      workspaceCatalogLoading ||
      workspaceSwitchDisabled ||
      workspaceSelectionPending
    ) {
      setClientMenuOpen(false);
    }
  }, [
    workspaceCatalogLoading,
    workspaceSelectionPending,
    workspaceSwitchDisabled,
  ]);

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
          loadedWorkspaceIdRef.current = requestWorkspaceId;
          setLoadedWorkspaceId(requestWorkspaceId);
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

  const previousSelectedWorkspaceIdRef = useRef(selectedWorkspaceId);
  useEffect(() => {
    if (previousSelectedWorkspaceIdRef.current === selectedWorkspaceId) {
      return;
    }
    previousSelectedWorkspaceIdRef.current = selectedWorkspaceId;
    loadRevisionRef.current += 1;
    detailRevisionRef.current += 1;
    detailLoadingIdRef.current = null;
    loadedWorkspaceIdRef.current = null;
    setLoadedWorkspaceId(null);
    setRoutes([]);
    setOperationsState(null);
    setOfflineCalendarEntries([]);
    setOperationsWarning(null);
    setShowingOfflineCopy(false);
    setOfflineCopyStoredAtMs(null);
    setErrorState(null);
    setSelectedConvoyId(null);
    onConvoySelectionChange?.(null);
    setDetailLoadingId(null);
    setLoading(true);
    setRefreshing(false);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    void loadOperations();
    return () => {
      loadRevisionRef.current += 1;
      detailRevisionRef.current += 1;
      detailLoadingIdRef.current = null;
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
  useEffect(() => {
    if (
      workspaceAlternativeSelectionPending &&
      !workspaceCatalogLoading &&
      !workspaceSwitchDisabled &&
      !workspaceSelectionPending &&
      workspaceOptions.length > 0
    ) {
      setClientMenuOpen(true);
    }
  }, [
    workspaceAlternativeSelectionPending,
    workspaceCatalogLoading,
    workspaceOptions.length,
    workspaceSelectionPending,
    workspaceSwitchDisabled,
  ]);

  useEffect(() => {
    if (!workspaceAlternativeSelectionPending) {
      setClientMenuOpen(false);
    }
  }, [workspaceAlternativeSelectionPending]);

  const workspaceOwnsResults = Boolean(
    selectedWorkspaceId && loadedWorkspaceId === selectedWorkspaceId
  );
  const ownedShowingOfflineCopy = workspaceOwnsResults && showingOfflineCopy;
  const ownedErrorState = workspaceOwnsResults ? errorState : null;
  const ownedOfflineCalendarEntries = workspaceOwnsResults
    ? offlineCalendarEntries
    : [];
  const ownedOfflineCopyStoredAtMs = ownedShowingOfflineCopy
    ? offlineCopyStoredAtMs
    : null;
  const contentLoading =
    loading || Boolean(selectedWorkspaceId && !workspaceOwnsResults);
  const visibleRoutes = workspaceOwnsResults ? routes : [];
  const visibleOperationsState = workspaceOwnsResults ? operationsState : null;
  const plannedRows = useMemo(
    () =>
      ownedShowingOfflineCopy && visibleRoutes.length === 0
        ? []
        : createPlannedRouteRows(visibleRoutes, visibleOperationsState),
    [ownedShowingOfflineCopy, visibleOperationsState, visibleRoutes]
  );
  const calendarRows = useMemo(
    () =>
      ownedShowingOfflineCopy
        ? createOfflineCalendarRows(ownedOfflineCalendarEntries)
        : createCalendarRows(visibleRoutes, visibleOperationsState),
    [
      ownedOfflineCalendarEntries,
      ownedShowingOfflineCopy,
      visibleOperationsState,
      visibleRoutes,
    ]
  );
  const convoyRows = useMemo(
    () =>
      ownedShowingOfflineCopy
        ? []
        : createConvoyRows(visibleRoutes, visibleOperationsState),
    [ownedShowingOfflineCopy, visibleOperationsState, visibleRoutes]
  );
  const selectedConvoy = useMemo(
    () => convoyRows.find((row) => row.id === selectedConvoyId) || null,
    [convoyRows, selectedConvoyId],
  );

  useEffect(() => {
    if (!selectedConvoy) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      operationsListRef.current?.scrollTo({ animated: false, y: 0 });
      const headingNode = findNodeHandle(convoyDetailHeadingRef.current);
      if (headingNode) {
        AccessibilityInfo.setAccessibilityFocus(headingNode);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [selectedConvoy?.id]);
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
    (ownedShowingOfflineCopy || !protectedRequestsAvailable
      ? createOperationsOfflineEmptyState(
          activeTab,
          ownedShowingOfflineCopy,
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
      ownedOfflineCopyStoredAtMs === null
        ? null
        : createOperationsOfflineReviewPresentation({
            nowMs: offlineCopyNowMs,
            status: offlineReviewStatus,
            storedAtMs: ownedOfflineCopyStoredAtMs,
          }),
    [offlineCopyNowMs, offlineReviewStatus, ownedOfflineCopyStoredAtMs],
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
  const showCompactOfflineSavingControl =
    COMPACT_OFFLINE_SAVING_STATES.has(offlineCalendarSavingState);

  useEffect(() => {
    if (!ownedShowingOfflineCopy || ownedOfflineCopyStoredAtMs === null) {
      return;
    }
    const refreshDelayMs = getOperationsOfflineReviewRefreshDelayMs({
      nowMs: offlineCopyNowMs,
      storedAtMs: ownedOfflineCopyStoredAtMs,
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
        loadedWorkspaceIdRef.current = expiringWorkspaceId;
        setLoadedWorkspaceId(expiringWorkspaceId);
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
    offlineReviewStatus,
    ownedOfflineCopyStoredAtMs,
    ownedShowingOfflineCopy,
    cacheIdentity,
    selectedWorkspaceId,
  ]);

  const handleSelectOperationsRoute = async (
    row: OperationsRouteSelection,
  ) => {
    const requestWorkspaceId = selectedWorkspaceId;
    const requestTab = activeTabRef.current;
    if (!row.routeId) {
      Alert.alert(
        "Route map unavailable",
        ownedShowingOfflineCopy
          ? "Reconnect and verify workspace access to load this route's map and details."
          : "This movement is not linked to an available SafeRoute route. Refresh Operations and try again.",
      );
      return;
    }
    if (
      !requestWorkspaceId ||
      !protectedRequestsAvailableRef.current ||
      detailLoadingIdRef.current
    ) {
      if (!protectedRequestsAvailableRef.current) {
        Alert.alert(
          "Route map unavailable offline",
          "Reconnect and verify workspace access to load the current route map, risks, checkpoints, and details.",
        );
      }
      return;
    }

    const revision = detailRevisionRef.current + 1;
    detailRevisionRef.current = revision;
    detailLoadingIdRef.current = row.id;
    setDetailLoadingId(row.id);
    setErrorState(null);
    const requestOwnsWorkspace = () =>
      revision === detailRevisionRef.current &&
      activeWorkspaceIdRef.current === requestWorkspaceId &&
      activeTabRef.current === requestTab &&
      protectedRequestsAvailableRef.current;
    try {
      const routeDetail = await fetchRouteDetail(accessToken, row.routeId);
      if (!requestOwnsWorkspace()) {
        return;
      }
      if (routeDetail.clientId !== requestWorkspaceId) {
        setErrorState({
          ...createRouteDetailErrorState(
            new Error("This route belongs to another workspace."),
            row.title,
          ),
          row,
        });
        return;
      }
      if (!hasUsableRoutePlan(routeDetail)) {
        setErrorState({
          ...createRouteDetailErrorState(
            new Error("The route map is not available yet. Refresh and try again."),
            row.title,
          ),
          row,
        });
        return;
      }
      detailLoadingIdRef.current = null;
      setDetailLoadingId(null);
      onSelectRoute(routeDetail, requestTab, row.convoyId || null);
    } catch (error) {
      if (!requestOwnsWorkspace()) {
        return;
      }
      if (error instanceof ApiSessionExpiredError) {
        onSessionExpired(error.message);
        return;
      }
      if (isWorkspaceForbiddenError(error)) {
        detailRevisionRef.current += 1;
        detailLoadingIdRef.current = null;
        setDetailLoadingId(null);
        onWorkspaceUnavailable(requestWorkspaceId);
        return;
      }
      setErrorState({
        ...createRouteDetailErrorState(error, row.title),
        row,
      });
    } finally {
      if (requestOwnsWorkspace()) {
        detailLoadingIdRef.current = null;
        setDetailLoadingId(null);
      }
    }
  };

  const handleRetry = () => {
    if (ownedErrorState?.action === "detail" && ownedErrorState.row) {
      void handleSelectOperationsRoute(ownedErrorState.row);
      return;
    }
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
      !ownedShowingOfflineCopy ||
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
    if (ownedShowingOfflineCopy) {
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
    <SafeAreaView
      testID={uiTestIds.operationsScreen}
      style={[
        styles.screen,
        workspaceNavigationNoticeInset > 0
          ? { paddingTop: workspaceNavigationNoticeInset }
          : null,
      ]}
    >
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
              setSelectedConvoyId(null);
              onConvoySelectionChange?.(null);
              setErrorState(null);
              detailRevisionRef.current += 1;
              detailLoadingIdRef.current = null;
              setDetailLoadingId(null);
              activeTabRef.current = tab.id;
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
            accessibilityHint={workspaceSwitchFailure
              ? "Retry guidance cleanup before changing workspace."
              : workspaceCatalogLoading
                ? "Wait while SafeRoute verifies workspace access."
              : workspaceAlternativeSelectionPending
                ? clientMenuOpen
                  ? "Closes the workspace menu."
                  : "Opens the workspace menu to choose another workspace. Selecting the current workspace keeps it."
              : workspaceSelectionFailed
                ? "Opens the workspace menu to choose the workspace again."
              : workspaceSelectionPending
                ? "Wait while the workspace choice is saved."
              : workspaceSwitchDisabled
                ? "Finish guidance cleanup before changing workspace."
                : workspaceChangeEndsNavigation
                  ? "Opens the workspace menu. Choosing another workspace asks before ending active guidance."
                  : "Opens the active workspace menu."}
            accessibilityLabel={`Workspace, ${selectedWorkspaceOption?.label || "Choose workspace"}`}
            accessibilityRole="button"
            accessibilityState={{
              busy:
                workspaceCatalogLoading ||
                workspaceSelectionPending ||
                (workspaceSwitchDisabled && !workspaceSwitchFailure),
              disabled:
                workspaceCatalogLoading ||
                workspaceSwitchDisabled ||
                workspaceSelectionPending,
              expanded: clientMenuOpen
            }}
            disabled={
              workspaceCatalogLoading ||
              workspaceSwitchDisabled ||
              workspaceSelectionPending
            }
            testID={uiTestIds.operationsWorkspaceSelector}
            style={({ pressed }) => [
              styles.clientSelector,
              clientMenuOpen ? styles.clientSelectorOpen : null,
              pressed &&
              !workspaceCatalogLoading &&
              !workspaceSwitchDisabled &&
              !workspaceSelectionPending
                ? styles.tabPressed
                : null
            ]}
            onPress={() => {
              if (
                !workspaceCatalogLoading &&
                !workspaceSwitchDisabled &&
                !workspaceSelectionPending
              ) {
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
              {workspaceSwitchFailure
                ? "Cleanup needed"
                : workspaceCatalogLoading
                  ? "Checking…"
                : workspaceAlternativeSelectionPending
                  ? clientMenuOpen ? "Close" : "Choose"
                : workspaceSelectionFailed
                  ? "Try again"
                : workspaceSelectionPending
                  ? "Saving…"
                : workspaceSwitchDisabled
                  ? "Finishing…"
                  : clientMenuOpen
                    ? "Close"
                    : "Change"}
            </Text>
          </Pressable>
          {clientMenuOpen &&
          !workspaceCatalogLoading &&
          !workspaceSwitchDisabled &&
          !workspaceSelectionPending ? (
            <View style={styles.clientMenu}>
              <ScrollView
                nestedScrollEnabled
                contentContainerStyle={styles.clientMenuContent}
                showsVerticalScrollIndicator={false}
              >
                {workspaceOptions.map((workspace) => (
                  <Pressable
                    key={workspace.id}
                    accessibilityHint={
                      workspaceChangeEndsNavigation && !workspace.selected
                        ? `Asks to end active guidance before changing to ${workspace.label}.`
                        : workspace.accessibilityHint
                    }
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
                      if (
                        !nextWorkspace ||
                        (
                          nextWorkspace.id === selectedWorkspaceId &&
                          !workspaceSelectionFailed &&
                          !workspaceAlternativeSelectionPending
                        )
                      ) {
                        setClientMenuOpen(false);
                        return;
                      }
                      setClientMenuOpen(false);
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
        showCompactOfflineSavingControl ? (
          <Pressable
            accessibilityHint={
              "Opens the option to stop future offline Calendar saves for this workspace on this device."
            }
            accessibilityLabel={`Offline Calendar options for ${selectedWorkspaceOption?.label || "current workspace"}`}
            accessibilityRole="button"
            testID={uiTestIds.operationsCalendarSavingControl}
            style={({ pressed }) => [
              styles.offlineSavingCompactAction,
              pressed ? styles.offlineSavingActionPressed : null,
            ]}
            onPress={handleOfflineCalendarSavingAction}
          >
            <Text style={styles.offlineSavingCompactActionText}>
              Offline options
            </Text>
          </Pressable>
        ) : (
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
        )
      ) : null}

      {ownedShowingOfflineCopy && offlineReviewPresentation ? (
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
      !contentLoading &&
      !ownedErrorState &&
      protectedRequestsAvailable &&
      workspaceOwnsResults &&
      (visibleOperationsState !== null || visibleRoutes.length > 0) &&
      !ownedShowingOfflineCopy ? (
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
      ) : ownedErrorState ? (
        <View
          accessibilityRole="alert"
          testID={uiTestIds.operationsErrorState}
          style={styles.errorBox}
        >
          <View style={styles.errorCopy}>
            <Text style={styles.errorTitle}>{ownedErrorState.title}</Text>
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
            hitSlop={OPERATIONS_ERROR_ACTION_HIT_SLOP}
            testID={uiTestIds.operationsRetry}
            style={({ pressed }) => [
              styles.retryButton,
              pressed ? styles.retryButtonPressed : null
            ]}
            onPress={handleRetry}
          >
            <Text style={styles.retryText}>{ownedErrorState.retryLabel}</Text>
          </Pressable>
        </View>
      ) : null}

      {!workspaceState && !ownedErrorState ? (
        contentLoading ? (
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
            ref={operationsListRef}
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
              ? plannedRows.map((row) => (
                  <OperationsRouteCard
                    key={row.id}
                    interactionLocked={Boolean(detailLoadingId)}
                    loading={detailLoadingId === row.id}
                    row={row}
                    onPress={() => void handleSelectOperationsRoute(row)}
                  />
                ))
              : null}
            {activeTab === "calendar"
              ? calendarRows.map((row) => (
                  <OperationsRouteCard
                    calendar
                    key={row.id}
                    interactionLocked={Boolean(detailLoadingId)}
                    loading={detailLoadingId === row.id}
                    row={row}
                    onPress={() => void handleSelectOperationsRoute(row)}
                  />
                ))
              : null}
            {activeTab === "convoy-management"
              ? selectedConvoy
                ? (
                    <OperationsConvoyDetail
                      detailLoadingId={detailLoadingId}
                      headingRef={(node) => {
                        convoyDetailHeadingRef.current = node;
                      }}
                      interactionLocked={Boolean(detailLoadingId)}
                      row={selectedConvoy}
                      onBack={() => {
                        detailRevisionRef.current += 1;
                        detailLoadingIdRef.current = null;
                        setDetailLoadingId(null);
                        setSelectedConvoyId(null);
                        onConvoySelectionChange?.(null);
                      }}
                      onSelectRoute={(routeId, title, index) =>
                        void handleSelectOperationsRoute({
                          convoyId: selectedConvoy.id,
                          id: `${selectedConvoy.id}-${routeId || "unavailable"}-${index}`,
                          routeId,
                          title,
                        })
                      }
                    />
                  )
                : convoyRows.map((row) => (
                    <OperationsConvoyCard
                      key={row.id}
                      row={row}
                      onPress={() => {
                        setSelectedConvoyId(row.id);
                        onConvoySelectionChange?.(row.id);
                      }}
                    />
                  ))
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

function OperationsRouteCard({
  calendar = false,
  interactionLocked,
  loading,
  onPress,
  row,
}: {
  calendar?: boolean;
  interactionLocked: boolean;
  loading: boolean;
  onPress: () => void;
  row: OperationsRouteRow;
}) {
  return (
    <Pressable
      accessibilityLabel={row.accessibilityLabel}
      accessibilityHint={
        row.routeId
          ? "Opens the route map, risk information, checkpoints, and route details."
          : "Full route map details require a current authorized route link and connection."
      }
      accessibilityRole="button"
      accessibilityState={{
        busy: loading,
        disabled: interactionLocked || !row.routeId,
      }}
      disabled={interactionLocked || !row.routeId}
      testID={uiTestIds.operationsRouteCard(row.id)}
      style={({ pressed }) => [
        styles.routeCard,
        pressed ? styles.routeCardPressed : null,
      ]}
      onPress={onPress}
    >
      <View style={styles.routeHeader}>
        <Text numberOfLines={2} style={styles.routeTitle}>{row.title}</Text>
        {loading ? (
          <ActivityIndicator color={colors.appleBlue} size="small" />
        ) : (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{calendar ? row.scheduleLabel : row.badgeLabel}</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={styles.routeEndpoint}>{row.endpointLabel}</Text>
      <Text numberOfLines={2} style={styles.routeMeta}>{row.metaLabel}</Text>
      <Text numberOfLines={2} style={styles.routeManifest}>{row.manifestLabel}</Text>
      {!calendar ? (
        <Text numberOfLines={1} style={styles.routeMeta}>{row.scheduleLabel}</Text>
      ) : null}
      <Text style={styles.openDetailText}>
        {row.routeId ? "View map and details  ›" : "Map details unavailable"}
      </Text>
    </Pressable>
  );
}

function OperationsConvoyCard({
  onPress,
  row,
}: {
  onPress: () => void;
  row: OperationsConvoyRow;
}) {
  return (
    <Pressable
      accessibilityLabel={row.accessibilityLabel}
      accessibilityHint={
        row.manifestAvailable
          ? "Opens the complete read-only convoy manifest and its route choices."
          : "Opens available route choices. Convoy manifest details need an Operations sync."
      }
      accessibilityRole="button"
      testID={uiTestIds.operationsConvoyCard(row.id)}
      style={({ pressed }) => [
        styles.routeCard,
        pressed ? styles.routeCardPressed : null,
      ]}
      onPress={onPress}
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
      <Text style={styles.openDetailText}>View convoy details  ›</Text>
    </Pressable>
  );
}

function OperationsConvoyDetail({
  detailLoadingId,
  headingRef,
  interactionLocked,
  onBack,
  onSelectRoute,
  row,
}: {
  detailLoadingId: string | null;
  headingRef: (node: Text | null) => void;
  interactionLocked: boolean;
  onBack: () => void;
  onSelectRoute: (routeId: string | null, title: string, index: number) => void;
  row: OperationsConvoyRow;
}) {
  return (
    <View
      testID={uiTestIds.operationsConvoyDetail}
      style={styles.convoyDetail}
    >
      <Pressable
        accessibilityLabel="Return to convoys"
        accessibilityRole="button"
        testID={uiTestIds.operationsConvoyDetailBack}
        style={({ pressed }) => [
          styles.convoyDetailBack,
          pressed ? styles.routeCardPressed : null,
        ]}
        onPress={onBack}
      >
        <Text style={styles.convoyDetailBackText}>‹ Convoys</Text>
      </Pressable>

      <View style={styles.convoyDetailHeader}>
        <Text
          accessible
          accessibilityLabel={`${row.title} convoy details`}
          accessibilityRole="header"
          ref={headingRef}
          style={styles.convoyDetailTitle}
        >
          {row.title}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{row.statusLabel}</Text>
        </View>
      </View>
      <Text style={styles.convoyDetailMeta}>{row.scheduleLabel}</Text>
      <Text style={styles.convoyDetailMeta}>{row.endpointLabel}</Text>
      <Text style={styles.convoyDetailMeta}>{row.durationLabel}</Text>
      <Text style={styles.convoyDetailMeta}>{row.metaLabel}</Text>

      {row.manifestAvailable ? (
        <>
          <OperationsDetailSection
            emptyLabel="No lead vehicle assigned"
            labels={[row.leadVehicleLabel]}
            title="Lead vehicle"
          />
          <OperationsDetailSection
            emptyLabel="No vehicles assigned"
            labels={row.vehicleLabels}
            title="Vehicles"
          />
          <OperationsDetailSection
            emptyLabel="No people assigned"
            labels={row.peopleLabels}
            title="People"
          />
        </>
      ) : (
        <OperationsDetailSection
          emptyLabel="Manifest unavailable. Refresh or reconnect to load assigned people and vehicles."
          labels={[]}
          title="Manifest"
        />
      )}

      <View style={styles.convoyDetailSection}>
        <Text style={styles.convoyDetailSectionTitle}>Routes</Text>
        {row.routeOptions.length ? row.routeOptions.map((option, index) => {
          const optionId = `${option.routeId || "unavailable"}-${index}`;
          const selectionId = `${row.id}-${optionId}`;
          const loading = detailLoadingId === selectionId;
          const disabled = interactionLocked || !option.routeId;
          return (
            <Pressable
              key={selectionId}
              accessibilityHint={
                option.routeId
                  ? "Opens this route on the map with risk information and route details."
                  : "This route reference is not currently available on the map."
              }
              accessibilityLabel={
                option.routeId
                  ? `${option.title}. ${option.statusLabel}. ${option.scheduleLabel}. ${option.durationLabel}. ${option.manifestLabel}. View on map.`
                  : `${option.title}. ${option.statusLabel}. ${option.scheduleLabel}. ${option.durationLabel}. ${option.manifestLabel}. Route map unavailable.`
              }
              accessibilityRole="button"
              accessibilityState={{ busy: loading, disabled }}
              disabled={disabled}
              testID={uiTestIds.operationsConvoyRoute(optionId)}
              style={({ pressed }) => [
                styles.convoyRouteAction,
                pressed ? styles.routeCardPressed : null,
              ]}
              onPress={() => onSelectRoute(option.routeId, option.title, index)}
            >
              <View style={styles.convoyRouteActionCopy}>
                <Text numberOfLines={2} style={styles.convoyRouteActionText}>
                  {option.title}
                </Text>
                <Text style={styles.convoyRouteActionMeta}>
                  {option.statusLabel} · {option.scheduleLabel} · {option.durationLabel}
                </Text>
                <Text style={styles.convoyRouteActionManifest}>
                  {option.manifestLabel}
                </Text>
                {option.vehicleLabels.map((label, labelIndex) => (
                  <Text
                    key={`vehicle-${label}-${labelIndex}`}
                    style={styles.convoyRouteActionManifest}
                  >
                    {label}
                  </Text>
                ))}
                {option.peopleLabels.map((label, labelIndex) => (
                  <Text
                    key={`person-${label}-${labelIndex}`}
                    style={styles.convoyRouteActionManifest}
                  >
                    {label}
                  </Text>
                ))}
              </View>
              {loading ? (
                <ActivityIndicator color={colors.appleBlue} size="small" />
              ) : (
                <Text style={styles.convoyRouteActionLabel}>
                  {option.routeId ? "View map  ›" : "Unavailable"}
                </Text>
              )}
            </Pressable>
          );
        }) : (
          <Text style={styles.convoyDetailEmpty}>No routes assigned.</Text>
        )}
      </View>
    </View>
  );
}

function OperationsDetailSection({
  emptyLabel,
  labels,
  title,
}: {
  emptyLabel: string;
  labels: string[];
  title: string;
}) {
  return (
    <View style={styles.convoyDetailSection}>
      <Text style={styles.convoyDetailSectionTitle}>{title}</Text>
      {(labels.length ? labels : [emptyLabel]).map((label, index) => (
        <Text key={`${label}-${index}`} style={styles.convoyDetailValue}>
          {label}
        </Text>
      ))}
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
