import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  CarFront,
  ChevronDown,
  Layers3,
  Route as RouteIcon,
  UsersRound,
  X,
} from "lucide-react-native";
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
  createOperationsSyncWarningState,
  createOperationsTitle,
  createOperationsWorkspaceOptions,
  createOperationsWorkspaceState,
  getOperationsOfflineReviewRefreshDelayMs,
  createOfflineCalendarRows,
  createOperationsOfflineCalendarRemovalPresentation,
  createPlannedRouteRows,
  shouldShowOperationsWorkspaceSelector,
  type OperationsConvoyRow,
  type OperationsConvoyVehicle,
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
  onDetailVisibilityChange?: (visible: boolean) => void;
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
  onRetryWorkspaceCatalog,
  onConvoySelectionChange,
  onDetailVisibilityChange,
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
  const [selectedCalendarRowId, setSelectedCalendarRowId] = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<{
    convoyId: string;
    vehicleId: string;
  } | null>(null);
  const [collapsedConvoyIds, setCollapsedConvoyIds] = useState<Set<string>>(
    () => new Set(),
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
  const calendarDetailHeadingRef = useRef<Text | null>(null);
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
    setSelectedCalendarRowId(null);
    setSelectedVehicle(null);
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
    setSelectedCalendarRowId(null);
    setCollapsedConvoyIds(new Set());
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
  const selectedCalendarRow = useMemo(
    () => calendarRows.find((row) => row.id === selectedCalendarRowId) || null,
    [calendarRows, selectedCalendarRowId],
  );
  const selectedVehicleContext = useMemo(() => {
    if (!selectedVehicle) {
      return null;
    }

    const convoy = convoyRows.find((row) => row.id === selectedVehicle.convoyId);
    const vehicle = convoy?.vehicles.find((item) => item.id === selectedVehicle.vehicleId);
    return convoy && vehicle ? { convoy, vehicle } : null;
  }, [convoyRows, selectedVehicle]);
  const calendarGroups = useMemo(
    () => createCalendarGroups(calendarRows),
    [calendarRows],
  );

  useEffect(() => {
    onDetailVisibilityChange?.(Boolean(
      selectedCalendarRow || selectedConvoy || selectedVehicleContext,
    ));

    return () => onDetailVisibilityChange?.(false);
  }, [
    onDetailVisibilityChange,
    selectedCalendarRow,
    selectedConvoy,
    selectedVehicleContext,
  ]);

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

  useEffect(() => {
    if (!selectedCalendarRow) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const headingNode = findNodeHandle(calendarDetailHeadingRef.current);
      if (headingNode) {
        AccessibilityInfo.setAccessibilityFocus(headingNode);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [selectedCalendarRow?.id]);
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
  const signOutState = createRouteListSignOutState(userEmail);
  const sessionNoticeState = createSessionNoticeState(sessionNotice);
  const title = createOperationsTitle(activeTab);
  const subtitle = activeTab === "convoy-management"
    ? `${convoyRows.length} ${convoyRows.length === 1 ? "convoy" : "convoys"} · ${convoyRows.reduce((total, row) => total + row.vehicles.length, 0)} vehicles`
    : createOperationsSubtitle(activeTab);
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
            <Text numberOfLines={1} style={styles.title}>{title}</Text>
          </View>
          <View style={styles.headerActions}>
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

      {(workspaceAlternativeSelectionPending || workspaceSelectionFailed) &&
      shouldShowOperationsWorkspaceSelector(workspaceOptions) ? (
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
              ? calendarGroups.map((group) => (
                  <View key={group.dateLabel} style={styles.calendarGroup}>
                    <Text accessibilityRole="header" style={styles.calendarGroupTitle}>
                      {group.dateLabel}
                    </Text>
                    <View style={styles.calendarGroupRows}>
                      {group.rows.map(({ row, timeLabel }) => (
                        <OperationsCalendarCard
                          key={row.id}
                          interactionLocked={Boolean(detailLoadingId)}
                          row={row}
                          timeLabel={timeLabel}
                          onPress={() => setSelectedCalendarRowId(row.id)}
                        />
                      ))}
                    </View>
                  </View>
                ))
              : null}
            {activeTab === "convoy-management"
              ? convoyRows.map((row, index) => (
                    <OperationsConvoyCard
                      key={row.id}
                      expanded={!collapsedConvoyIds.has(row.id)}
                      groupIndex={index}
                      row={row}
                      onToggle={() => {
                        setCollapsedConvoyIds((current) => {
                          const next = new Set(current);
                          if (next.has(row.id)) {
                            next.delete(row.id);
                          } else {
                            next.add(row.id);
                          }
                          return next;
                        });
                      }}
                      onPress={() => {
                        setSelectedConvoyId(row.id);
                        onConvoySelectionChange?.(row.id);
                      }}
                      onVehiclePress={(vehicleId) => {
                        setSelectedConvoyId(null);
                        onConvoySelectionChange?.(null);
                        setSelectedVehicle({ convoyId: row.id, vehicleId });
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

      {!workspaceState && !ownedErrorState && activeTab === "calendar" && selectedCalendarRow ? (
        <OperationsCalendarDetail
          headingRef={(node) => {
            calendarDetailHeadingRef.current = node;
          }}
          interactionLocked={Boolean(detailLoadingId)}
          loading={detailLoadingId === selectedCalendarRow.id}
          row={selectedCalendarRow}
          onBack={() => {
            detailRevisionRef.current += 1;
            detailLoadingIdRef.current = null;
            setDetailLoadingId(null);
            setSelectedCalendarRowId(null);
          }}
          onSelectRoute={() => void handleSelectOperationsRoute(selectedCalendarRow)}
        />
      ) : null}

      {!workspaceState && !ownedErrorState && activeTab === "convoy-management" && selectedConvoy ? (
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
      ) : null}

      {!workspaceState && !ownedErrorState && activeTab === "convoy-management" && selectedVehicleContext ? (
        <OperationsVehicleDetail
          convoy={selectedVehicleContext.convoy}
          vehicle={selectedVehicleContext.vehicle}
          onBack={() => setSelectedVehicle(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function OperationsRouteCard({
  interactionLocked,
  loading,
  onPress,
  row,
}: {
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
            <Text style={styles.badgeText}>{row.badgeLabel}</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={styles.routeEndpoint}>{row.endpointLabel}</Text>
      <Text numberOfLines={2} style={styles.routeMeta}>{row.metaLabel}</Text>
      <Text numberOfLines={2} style={styles.routeManifest}>{row.manifestLabel}</Text>
      <Text numberOfLines={1} style={styles.routeMeta}>{row.scheduleLabel}</Text>
      <Text style={styles.openDetailText}>
        {row.routeId ? "View map and details  ›" : "Map details unavailable"}
      </Text>
    </Pressable>
  );
}

type OperationsCalendarGroup = {
  dateLabel: string;
  rows: Array<{
    row: OperationsRouteRow;
    timeLabel: string;
  }>;
};

function createCalendarGroups(rows: OperationsRouteRow[]): OperationsCalendarGroup[] {
  const groups = new Map<string, OperationsCalendarGroup["rows"]>();

  rows.forEach((row) => {
    const { dateLabel, timeLabel } = splitScheduleLabel(row.scheduleLabel);
    groups.set(dateLabel, [...(groups.get(dateLabel) || []), { row, timeLabel }]);
  });

  return Array.from(groups, ([dateLabel, groupedRows]) => ({
    dateLabel,
    rows: groupedRows,
  }));
}

function splitScheduleLabel(scheduleLabel: string): {
  dateLabel: string;
  timeLabel: string;
} {
  const separator = " · ";
  const separatorIndex = scheduleLabel.lastIndexOf(separator);
  if (separatorIndex < 0) {
    return {
      dateLabel: scheduleLabel || "Schedule pending",
      timeLabel: "TBD",
    };
  }

  return {
    dateLabel: scheduleLabel.slice(0, separatorIndex),
    timeLabel: scheduleLabel.slice(separatorIndex + separator.length),
  };
}

function OperationsCalendarCard({
  interactionLocked,
  onPress,
  row,
  timeLabel,
}: {
  interactionLocked: boolean;
  onPress: () => void;
  row: OperationsRouteRow;
  timeLabel: string;
}) {
  return (
    <Pressable
      accessibilityHint={
        row.routeId
          ? "Opens movement details with a Map action."
          : "Opens saved movement details. A current authorized route link is required for the map."
      }
      accessibilityLabel={row.accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: interactionLocked }}
      disabled={interactionLocked}
      testID={uiTestIds.operationsRouteCard(row.id)}
      style={({ pressed }) => [
        styles.calendarCard,
        pressed ? styles.routeCardPressed : null,
      ]}
      onPress={onPress}
    >
      <View style={styles.calendarTimeColumn}>
        <Text numberOfLines={1} style={styles.calendarTime}>{timeLabel}</Text>
        <Text style={styles.calendarTimeEyebrow}>DEPART</Text>
      </View>
      <View style={styles.calendarDivider} />
      <View style={styles.calendarTripContent}>
        <View style={styles.calendarTripHeader}>
          <Text numberOfLines={2} style={styles.calendarTripTitle}>{row.title}</Text>
          <OperationsStatusChip label={row.statusLabel} />
        </View>
        <Text numberOfLines={2} style={styles.calendarEndpoint}>{row.endpointLabel}</Text>
        <Text numberOfLines={2} style={styles.calendarCrew}>{row.manifestLabel}</Text>
      </View>
    </Pressable>
  );
}

function OperationsConvoyCard({
  expanded,
  groupIndex,
  onPress,
  onToggle,
  onVehiclePress,
  row,
}: {
  expanded: boolean;
  groupIndex: number;
  onPress: () => void;
  onToggle: () => void;
  onVehiclePress: (vehicleId: string) => void;
  row: OperationsConvoyRow;
}) {
  return (
    <View style={styles.convoyGroup}>
      <Pressable
        accessibilityHint={expanded ? "Collapses this convoy." : "Expands this convoy."}
        accessibilityLabel={`${row.title}. ${row.metaLabel}. ${expanded ? "Expanded" : "Collapsed"}.`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [
          styles.convoyGroupHeader,
          pressed ? styles.routeCardPressed : null,
        ]}
        onPress={onToggle}
      >
        <View style={[styles.convoyIconTile, groupIndex > 0 ? styles.convoyIconTileSecondary : null]}>
          <Layers3
            accessibilityElementsHidden
            color={groupIndex === 0 ? colors.appleBlue : colors.info}
            size={22}
            strokeWidth={1.8}
          />
        </View>
        <View style={styles.convoyGroupHeadingAction}>
          <Text numberOfLines={2} style={styles.convoyGroupTitle}>{row.title}</Text>
          <Text numberOfLines={1} style={styles.convoyGroupMeta}>
            {row.vehicles.length
              ? `${row.vehicles.length} ${row.vehicles.length === 1 ? "vehicle" : "vehicles"} · ${row.routeOptions.length} ${row.routeOptions.length === 1 ? "route" : "routes"}`
              : row.metaLabel}
          </Text>
        </View>
        <OperationsStatusChip label={row.statusLabel} />
        <View style={styles.convoyDisclosure}>
          <ChevronDown
            accessibilityElementsHidden
            color={colors.mutedSoft}
            size={17}
            strokeWidth={2.3}
            style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
          />
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.convoyExpandedContent}>
          {row.vehicles.map((vehicle) => (
            <OperationsVehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              onPress={() => onVehiclePress(vehicle.id)}
            />
          ))}
          {!row.vehicles.length ? (
            <View style={styles.convoyMovementSummary}>
              <Text style={styles.convoySchedule}>{row.scheduleLabel}</Text>
              <Text numberOfLines={2} style={styles.convoyEndpoint}>{row.endpointLabel}</Text>
              <Text style={styles.convoyMeta}>{row.manifestLabel}</Text>
            </View>
          ) : null}
          <Pressable
            accessibilityLabel={`Open ${row.title} convoy details`}
            accessibilityRole="button"
            testID={uiTestIds.operationsConvoyCard(row.id)}
            style={({ pressed }) => [
              styles.convoyDetailAction,
              pressed ? styles.routeCardPressed : null,
            ]}
            onPress={onPress}
          >
            <Text style={styles.convoyDetailActionText}>Convoy overview</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function OperationsVehicleCard({
  onPress,
  vehicle,
}: {
  onPress: () => void;
  vehicle: OperationsConvoyVehicle;
}) {
  return (
    <Pressable
      accessibilityHint="Opens vehicle details and its next planned trips."
      accessibilityLabel={vehicle.accessibilityLabel}
      accessibilityRole="button"
      testID={uiTestIds.operationsVehicleCard(vehicle.id)}
      style={({ pressed }) => [
        styles.vehicleCard,
        pressed ? styles.routeCardPressed : null,
      ]}
      onPress={onPress}
    >
      <View style={styles.vehicleHeader}>
        <View style={styles.vehicleIconTile}>
          <CarFront accessibilityElementsHidden color={colors.inkSoft} size={25} strokeWidth={1.7} />
          <View style={styles.vehicleStatusDot} />
        </View>
        <View style={styles.vehicleCopy}>
          <View style={styles.vehicleTitleRow}>
            <Text numberOfLines={1} style={styles.vehicleCallsign}>{vehicle.callsign}</Text>
            {vehicle.lead ? <Text style={styles.vehicleLeadTag}>LEAD</Text> : null}
          </View>
          <Text numberOfLines={1} style={styles.vehicleModel}>{vehicle.modelLabel}</Text>
          <Text numberOfLines={1} style={styles.vehicleDetail}>{vehicle.detailLabel}</Text>
        </View>
        <View style={styles.vehicleStatusCopy}>
          <Text numberOfLines={1} style={styles.vehicleStatus}>{vehicle.statusLabel}</Text>
          <Text numberOfLines={1} style={styles.vehicleRegistration}>{vehicle.registrationLabel}</Text>
        </View>
      </View>
      <View style={styles.vehicleTags}>
        <Text style={styles.vehicleTag}>{vehicle.roleLabel}</Text>
        <Text style={styles.vehicleTag}>{vehicle.protectionLabel}</Text>
        <Text style={styles.vehicleTag}>{vehicle.seatLabel}</Text>
      </View>
      <View style={styles.vehicleNextEvent}>
        <CalendarDays accessibilityElementsHidden color={colors.appleBlue} size={17} strokeWidth={1.9} />
        <View style={styles.vehicleNextEventCopy}>
          <Text style={styles.vehicleNextEventEyebrow}>NEXT EVENT</Text>
          <Text numberOfLines={2} style={styles.vehicleNextEventValue}>{vehicle.nextEventLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function OperationsCalendarDetail({
  headingRef,
  interactionLocked,
  loading,
  onBack,
  onSelectRoute,
  row,
}: {
  headingRef: (node: Text | null) => void;
  interactionLocked: boolean;
  loading: boolean;
  onBack: () => void;
  onSelectRoute: () => void;
  row: OperationsRouteRow;
}) {
  const mapDisabled = interactionLocked || !row.routeId;
  const { dateLabel, timeLabel } = splitScheduleLabel(row.scheduleLabel);

  return (
    <OperationsDetailSheet
      accessibilityLabel={`${row.title} movement details`}
      eyebrow="MOVEMENT DETAILS"
      headingRef={headingRef}
      icon={<RouteIcon accessibilityElementsHidden color={colors.appleBlue} size={28} strokeWidth={1.9} />}
      statusLabel={row.statusLabel}
      subtitle={`${dateLabel} · ${timeLabel}`}
      testID="safe-route-operations-calendar-detail"
      title={row.title}
      onClose={onBack}
    >
      <View style={styles.calendarDetailSchedule}>
        <View style={styles.calendarDetailTimeBlock}>
          <Text style={styles.calendarTimeEyebrow}>DEPART</Text>
          <Text style={styles.calendarDetailTime}>{timeLabel}</Text>
        </View>
        <Text style={styles.calendarDetailDate}>{dateLabel}</Text>
      </View>
      <OperationsDetailFact label="Route" value={row.endpointLabel} />
      <OperationsDetailFact label="Trip" value={row.metaLabel} />
      <OperationsDetailFact label="Crew" value={row.manifestLabel} />
      <Pressable
        accessibilityHint={
          row.routeId
            ? "Opens the route map, risk information, checkpoints, and route details."
            : "A current authorized route link and connection are required."
        }
        accessibilityLabel={row.routeId ? `Map for ${row.title}` : `Map unavailable for ${row.title}`}
        accessibilityRole="button"
        accessibilityState={{ busy: loading, disabled: mapDisabled }}
        disabled={mapDisabled}
        style={({ pressed }) => [
          styles.sheetMapAction,
          mapDisabled ? styles.sheetMapActionDisabled : null,
          pressed ? styles.sheetMapActionPressed : null,
        ]}
        onPress={onSelectRoute}
      >
        {loading ? (
          <ActivityIndicator color={colors.surface} size="small" />
        ) : (
          <Text
            style={[
              styles.sheetMapActionText,
              mapDisabled ? styles.sheetMapActionTextDisabled : null,
            ]}
          >
            {row.routeId ? "Map" : "Map unavailable"}
          </Text>
        )}
      </Pressable>
    </OperationsDetailSheet>
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
    <OperationsDetailSheet
      accessibilityLabel={`${row.title} convoy details`}
      closeTestID={uiTestIds.operationsConvoyDetailBack}
      eyebrow="CONVOY HANDOFF"
      headingRef={headingRef}
      icon={<Layers3 accessibilityElementsHidden color={colors.appleBlue} size={28} strokeWidth={1.9} />}
      statusLabel={row.statusLabel}
      subtitle={row.metaLabel}
      testID={uiTestIds.operationsConvoyDetail}
      title={row.title}
      onClose={onBack}
    >
      <View style={styles.convoyDetailOverview}>
        <OperationsDetailFact label="Departure" value={row.scheduleLabel} />
        <OperationsDetailFact label="Route" value={row.endpointLabel} />
        <OperationsDetailFact label="Window" value={row.durationLabel} />
        <OperationsDetailFact label="Manifest" value={row.metaLabel} />
      </View>

      {row.manifestAvailable ? (
        <OperationsAssignmentCards row={row} />
      ) : (
        <OperationsDetailSection
          emptyLabel="Manifest unavailable. Refresh or reconnect to load assigned people and vehicles."
          labels={[]}
          title="Manifest"
        />
      )}

      <View style={styles.convoyDetailSection}>
        <Text style={styles.convoyDetailSectionTitle}>Route maps</Text>
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
                  {option.routeId ? "Map" : "Unavailable"}
                </Text>
              )}
            </Pressable>
          );
        }) : (
          <Text style={styles.convoyDetailEmpty}>No routes assigned.</Text>
        )}
      </View>
    </OperationsDetailSheet>
  );
}

function OperationsVehicleDetail({
  convoy,
  onBack,
  vehicle,
}: {
  convoy: OperationsConvoyRow;
  onBack: () => void;
  vehicle: OperationsConvoyVehicle;
}) {
  return (
    <OperationsDetailSheet
      accessibilityLabel={`${vehicle.callsign} vehicle details`}
      closeTestID={uiTestIds.operationsVehicleDetailDone}
      eyebrow={vehicle.lead ? "LEAD VEHICLE" : "ASSIGNED VEHICLE"}
      headingRef={() => undefined}
      icon={<CarFront accessibilityElementsHidden color={colors.inkSoft} size={29} strokeWidth={1.8} />}
      statusLabel={vehicle.statusLabel}
      subtitle={`${vehicle.modelLabel} · ${convoy.title}`}
      testID={uiTestIds.operationsVehicleDetail}
      title={vehicle.callsign}
      onClose={onBack}
    >
      <View style={styles.vehicleSpecGrid}>
        <OperationsVehicleSpec label="Role" value={vehicle.roleLabel} />
        <OperationsVehicleSpec label="Protection" value={vehicle.protectionLabel} />
        <OperationsVehicleSpec label="Capacity" value={vehicle.seatLabel} />
        <OperationsVehicleSpec label="Registration" value={vehicle.registrationLabel} mono />
      </View>

      <View style={styles.vehicleTripsSection}>
        <Text style={styles.convoyDetailSectionTitle}>Next planned trips</Text>
        {convoy.routeOptions.length ? convoy.routeOptions.map((route, index) => (
          <View key={`${route.routeId || route.title}-${index}`} style={styles.vehicleTripRow}>
            <View style={styles.vehicleTripDateTile}>
              <Text style={styles.vehicleTripDateText}>
                {route.scheduleLabel === "Unscheduled" ? "TBD" : String(index + 1).padStart(2, "0")}
              </Text>
            </View>
            <View style={styles.vehicleCopy}>
              <Text numberOfLines={1} style={styles.vehicleTripTitle}>{route.title}</Text>
              <Text numberOfLines={2} style={styles.vehicleTripMeta}>
                {route.scheduleLabel} · {vehicle.roleLabel}
              </Text>
            </View>
          </View>
        )) : (
          <Text style={styles.convoyDetailEmpty}>No planned trips.</Text>
        )}
      </View>

      <Pressable
        accessibilityLabel="Done viewing vehicle details"
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.vehicleDoneButton,
          pressed ? styles.sheetMapActionPressed : null,
        ]}
        onPress={onBack}
      >
        <Text style={styles.vehicleDoneButtonText}>Done</Text>
      </Pressable>
    </OperationsDetailSheet>
  );
}

function OperationsVehicleSpec({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <View style={styles.vehicleSpec}>
      <Text style={styles.vehicleSpecLabel}>{label}</Text>
      <Text numberOfLines={2} style={[styles.vehicleSpecValue, mono ? styles.vehicleSpecValueMono : null]}>
        {value}
      </Text>
    </View>
  );
}

function OperationsDetailSheet({
  accessibilityLabel,
  children,
  closeTestID,
  eyebrow,
  headingRef,
  icon,
  onClose,
  statusLabel,
  subtitle,
  testID,
  title,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  closeTestID?: string;
  eyebrow: string;
  headingRef: (node: Text | null) => void;
  icon: ReactNode;
  onClose: () => void;
  statusLabel: string;
  subtitle?: string;
  testID: string;
  title: string;
}) {
  return (
    <View style={styles.detailOverlay}>
      <Pressable
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.detailScrim}
        onPress={onClose}
      />
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityViewIsModal
        testID={testID}
        style={styles.detailSheet}
      >
        <View style={styles.detailGrabber} />
        <View style={styles.detailSheetHeader}>
          <View style={styles.detailHeaderIconTile}>{icon}</View>
          <View style={styles.detailSheetHeadingCopy}>
            <Text
              accessible
              accessibilityLabel={accessibilityLabel}
              accessibilityRole="header"
              ref={headingRef}
              style={styles.detailSheetTitle}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text numberOfLines={2} style={styles.detailSheetSubtitle}>{subtitle}</Text>
            ) : null}
            <View style={styles.detailSheetMetaRow}>
              <OperationsStatusChip label={statusLabel} />
              <Text style={styles.detailSheetEyebrow}>{eyebrow}</Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel="Close details"
            accessibilityRole="button"
            hitSlop={6}
            testID={closeTestID}
            style={({ pressed }) => [
              styles.detailClose,
              pressed ? styles.routeCardPressed : null,
            ]}
            onPress={onClose}
          >
            <X accessibilityElementsHidden color={colors.muted} size={15} strokeWidth={2.2} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.detailSheetContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

function OperationsStatusChip({ label }: { label: string }) {
  const tone = getStatusTone(label);
  return (
    <View
      accessible
      accessibilityLabel={`Status, ${label}`}
      style={[
        styles.statusChip,
        tone === "safe" ? styles.statusChipSafe : null,
        tone === "warning" ? styles.statusChipWarning : null,
        tone === "danger" ? styles.statusChipDanger : null,
      ]}
    >
      <View
        style={[
          styles.statusDot,
          tone === "safe" ? styles.statusDotSafe : null,
          tone === "warning" ? styles.statusDotWarning : null,
          tone === "danger" ? styles.statusDotDanger : null,
        ]}
      />
      <Text
        numberOfLines={1}
        style={[
          styles.statusChipText,
          tone === "safe" ? styles.statusChipTextSafe : null,
          tone === "warning" ? styles.statusChipTextWarning : null,
          tone === "danger" ? styles.statusChipTextDanger : null,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function getStatusTone(label: string): "danger" | "info" | "safe" | "warning" {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("cancel") || normalized.includes("blocked")) {
    return "danger";
  }
  if (
    normalized.includes("pending") ||
    normalized.includes("standby")
  ) {
    return "warning";
  }
  if (
    normalized.includes("ready") ||
    normalized.includes("active") ||
    normalized.includes("live") ||
    normalized.includes("complete")
  ) {
    return "safe";
  }
  return "info";
}

function OperationsAssignmentCards({ row }: { row: OperationsConvoyRow }) {
  return (
    <View style={styles.assignmentSection}>
      <Text style={styles.convoySectionEyebrow}>ASSIGNMENTS</Text>
      <View style={styles.assignmentList}>
        {row.vehicleLabels.length ? row.vehicleLabels.map((label, index) => (
          <OperationsAssignmentCard
            key={`vehicle-${label}-${index}`}
            kind={label === row.leadVehicleLabel ? "Lead vehicle" : "Vehicle"}
            label={label}
            marker="V"
          />
        )) : (
          <OperationsAssignmentCard
            kind="Vehicles"
            label={row.manifestAvailable
              ? "No vehicles assigned"
              : "Vehicle details unavailable until Operations syncs"}
            marker="V"
          />
        )}
        {row.peopleLabels.length ? row.peopleLabels.map((label, index) => (
          <OperationsAssignmentCard
            key={`person-${label}-${index}`}
            kind="Person"
            label={label}
            marker="P"
          />
        )) : (
          <OperationsAssignmentCard
            kind="People"
            label={row.manifestAvailable
              ? "No people assigned"
              : "People details unavailable until Operations syncs"}
            marker="P"
          />
        )}
      </View>
    </View>
  );
}

function OperationsAssignmentCard({
  kind,
  label,
  marker,
}: {
  kind: string;
  label: string;
  marker: string;
}) {
  const [title, ...detailParts] = label.split(" · ");
  const detail = detailParts.join(" · ");
  return (
    <View accessible accessibilityLabel={`${kind}, ${label}`} style={styles.assignmentCard}>
      <View style={styles.assignmentMarker}>
        {marker === "V" ? (
          <CarFront accessibilityElementsHidden color={colors.inkSoft} size={18} strokeWidth={1.8} />
        ) : (
          <UsersRound accessibilityElementsHidden color={colors.inkSoft} size={18} strokeWidth={1.8} />
        )}
      </View>
      <View style={styles.assignmentCopy}>
        <Text style={styles.assignmentKind}>{kind}</Text>
        <Text numberOfLines={1} style={styles.assignmentTitle}>{title}</Text>
        {detail ? (
          <Text numberOfLines={2} style={styles.assignmentDetail}>{detail}</Text>
        ) : null}
      </View>
    </View>
  );
}

function OperationsDetailFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailFact}>
      <Text style={styles.detailFactLabel}>{label}</Text>
      <Text style={styles.detailFactValue}>{value}</Text>
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
