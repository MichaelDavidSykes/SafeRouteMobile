import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  AccessibilityInfo,
  Alert,
  AppState,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import {
  SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED,
  SAFEROUTE_PREVIEW_INITIAL_SCREEN,
  SAFEROUTE_PREVIEW_MODE_ENABLED
} from './src/config/env';
import { getCurrentUser } from './src/features/auth/authApi';
import { LoginScreen } from './src/features/auth/LoginScreen';
import { prepareAuthenticatedSession } from './src/features/auth/authCompletion';
import { getAuthSessionPrincipalId, hasMatchingAuthPrincipal } from './src/features/auth/authPrincipal';
import {
  clearAuthSession,
  clearAuthSessionIfCurrent,
  loadAuthSession,
  requireOnlineAuthSessionValidation,
  saveAuthSession,
  saveAuthSessionIfCurrent,
} from './src/features/auth/authStorage';
import {
  createPreviewLoginCodeChallenge,
  createPreviewAuthSession,
  createPreviewSuspendedNavigationSession,
  isPreviewAccessToken,
  PREVIEW_EXPIRED_SESSION_NOTICE,
  PREVIEW_SESSION_NOTICE
} from './src/features/auth/previewSession';
import { restoreSavedSession } from './src/features/auth/sessionRestore';
import {
  isSessionRestoreAttemptCurrent,
  requireCurrentSessionRestoreAttempt,
} from './src/features/auth/sessionRestoreAttempt';
import type { AuthSession } from './src/features/auth/authTypes';
import {
  createActiveSessionExpiryMonitor,
  type ActiveSessionExpiryIdentity,
  type ActiveSessionExpiryMonitor,
} from './src/features/auth/activeSessionExpiry';
import { GuestMapScreen } from './src/features/guest-map/GuestMapScreen';
import type { GuestFullAccessFeature } from './src/features/guest-map/guestRoutePlanner';
import { LiveMapScreen } from './src/features/live-map/LiveMapScreen';
import type { SavedSafeRoutePlan } from './src/features/live-map/liveMapTypes';
import {
  canResumeActiveNavigationSession,
  isNavigationSessionForRoutePreview,
  type ActiveNavigationSession
} from './src/features/live-map/activeNavigationSessionCore';
import {
  clearActiveNavigationSession,
  loadActiveNavigationSession,
  readActiveNavigationSession,
} from './src/features/live-map/activeNavigationSession';
import {
  confirmBackgroundNavigationStopped,
  stopBackgroundNavigation,
} from './src/features/live-map/backgroundNavigation';
import { ResumeNavigationButton } from './src/features/live-map/ResumeNavigationButton';
import {
  DEFAULT_SIGN_IN_PROMPT,
  fullAccessFeatureForOperationsTab,
  hasAuthenticatedSession,
  resolveFullAccessNavigation,
  resolvePostAuthenticationNavigation,
  routePreviewReturnCopy,
  screenAfterRoutePreview,
  type AppScreen,
  type RoutePreviewSource
} from './src/features/navigation/appRouting';
import { OperationsScreen } from './src/features/operations/OperationsScreen';
import {
  clearOfflineOperationsWorkspace,
  ensureSignedOutOfflineOperationsCalendarRemoved,
  prepareOfflineOperationsPrincipalForFreshAuthentication,
  purgeOfflineOperationsPrincipalAtTerminalBoundary,
  recoverOfflineOperationsPrincipalCleanup,
  tryActivateOfflineOperationsPrincipal
} from './src/features/operations/offlineOperationsCache';
import { OfflineCalendarCleanupNotice } from './src/features/operations/OfflineCalendarCleanupNotice';
import type { OperationsTab } from './src/features/operations/operationsUiState';
import { RouteListScreen } from './src/features/routes/RouteListScreen';
import { uiTestIds } from './src/testing/uiTestIds';
import { colors, spacing } from './src/theme';
import {
  shouldHandleActiveSessionExpiry,
  waitForSessionCleanup
} from './src/features/api/sessionExpiry';
import { ApiSessionExpiredError } from './src/features/api/apiClient';
import { resolveNetworkReconnectTransition } from './src/features/api/networkAvailabilityState';
import {
  NetworkAvailabilityProvider,
  useNetworkAvailability,
} from './src/features/api/useNetworkAvailability';
import { fetchSavedRoutes } from './src/features/routes/routeApi';
import {
  clearOfflineRouteWorkspace,
  loadOfflineRoutesSnapshot
} from './src/features/routes/offlineRouteCache';
import {
  canRetainRouteWorkspace,
  findWorkspace,
  normalizeWorkspaceCatalog,
  resolveActiveWorkspace,
  resolveReviewWorkspaceAfterNavigationEnd,
  type SafeRouteWorkspace
} from './src/features/workspaces/activeWorkspace';
import { resolveEndRouteWorkspaceChangeTarget } from './src/features/workspaces/endRouteWorkspaceChange';
import {
  resolveDeferredWorkspaceRefreshAfterSelection,
  resolveWorkspaceHandoffContinuation,
} from './src/features/workspaces/workspaceHandoffContinuation';
import {
  loadOfflineWorkspaceContext,
  migrateOfflineWorkspaceCatalogFromRouteCache,
  persistOfflineReviewWorkspaceSelection,
  persistOfflineWorkspaceRecovery,
  reconcileOfflineReviewWorkspaceSelection,
} from './src/features/workspaces/offlineWorkspaceCache';
import {
  excludeUnavailableWorkspaces,
  findAuthoritativelyUnavailableWorkspaceIds,
  reconcileFreshWorkspaceCatalog,
  resolveFreshWorkspaceAccessRecovery,
  resolveWorkspaceSurfaceClosure,
  resolveWorkspaceAccessRecovery
} from './src/features/workspaces/workspaceAccessRecovery';
import {
  findRestoredWorkspaceIds,
  reconcileUnavailableWorkspaceIds
} from './src/features/workspaces/workspaceMembershipRevalidation';
import {
  isCurrentWorkspaceNavigationContinuation,
  resolveWorkspaceForegroundRevalidation,
} from './src/features/workspaces/workspaceForegroundRevalidation';
import { authorizeWorkspaceNavigationStart } from './src/features/workspaces/workspaceNavigationAuthorization';
import {
  completeWorkspaceCatalogRetry,
  getWorkspaceCatalogExpiryDelayMs,
  resolveWorkspaceAccessAnnouncement,
  shouldArmAutomaticReconnectAnnouncement,
  shouldOfferWorkspaceAccessRefresh,
  type WorkspaceAccessAnnouncementPhase,
  type WorkspaceAccessIssue,
} from './src/features/workspaces/workspaceAccessRefreshState';
import {
  createWorkspaceAccessFocusHandoff,
  type WorkspaceAccessFocusHandoff,
} from './src/features/workspaces/workspaceAccessFocusHandoff';
import { SuspendedNavigationNotice } from './src/features/live-map/SuspendedNavigationNotice';
import { isSuspendedNavigationEndRequestCurrent } from './src/features/live-map/suspendedNavigationState';
import { NavigationCleanupNotice } from './src/features/live-map/NavigationCleanupNotice';
import { isNavigationStartRequestCurrent } from './src/features/live-map/navigationStartRequestIdentity';
import {
  isCurrentPendingNavigationRestore,
  resolvePendingNavigationRestore,
} from './src/features/live-map/pendingNavigationRestore';
import {
  flushGuidanceContractEvidence,
  recordGuidanceContractEvidence,
} from './src/testing/guidanceContractEvidence';
import type { SuspendedNavigationStatus } from './src/features/live-map/suspendedNavigationState';
import {
  recordOfflineCalendarCleanupContractEvidence,
  recordOfflineCalendarPrincipalChangeContractEvidence,
  recordOfflineCalendarWorkspaceRevocationContractEvidence,
} from './src/testing/offlineCalendarCleanupContractEvidence';

type PendingNavigationRestore = {
  session: ActiveNavigationSession;
  status: SuspendedNavigationStatus;
};

type NavigationCleanupStatus = 'idle' | 'checking' | 'failed';
type OfflineCalendarCleanupStatus = 'idle' | 'checking' | 'failed';
type WorkspaceSelectionStatus = 'idle' | 'saving' | 'failed';
type PendingWorkspaceHandoff = {
  evidenceSession: ActiveNavigationSession;
  requestedPrincipalId: string;
  requestedSessionEpoch: number;
  requestedSourceWorkspaceId: string | null;
  requestedTargetName: string;
  requestedTargetWorkspaceId: string;
  requestedWorkspaceRequestRevision: number;
};

export default function App() {
  return (
    <NetworkAvailabilityProvider>
      <SafeRouteApp />
    </NetworkAvailabilityProvider>
  );
}

function SafeRouteApp() {
  const {
    offline,
    online,
    status: networkStatus,
  } = useNetworkAvailability();
  useEffect(() => {
    if (online) {
      void flushGuidanceContractEvidence();
    }
  }, [online]);
  const networkStatusRef = useRef(networkStatus);
  const networkRequestEpochRef = useRef(0);
  if (networkStatusRef.current !== networkStatus) {
    networkStatusRef.current = networkStatus;
    networkRequestEpochRef.current += 1;
  }
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionRestoreNetworkStatus, setSessionRestoreNetworkStatus] =
    useState<typeof networkStatus | null>(null);
  const [sessionRestoreRevision, setSessionRestoreRevision] = useState(0);
  const [savedSessionValidationRetryAvailable, setSavedSessionValidationRetryAvailable] =
    useState(false);
  const [savedSessionValidationRetrying, setSavedSessionValidationRetrying] =
    useState(false);
  const [selectedRoute, setSelectedRoute] = useState<SavedSafeRoutePlan | null>(null);
  const [activeNavigationSession, setActiveNavigationSession] =
    useState<ActiveNavigationSession | null>(null);
  const [sessionMessage, setSessionMessage] = useState('');
  const [authPrompt, setAuthPrompt] = useState('');
  const [screen, setScreen] = useState<AppScreen>('guest-map');
  const [routePreviewSource, setRoutePreviewSource] = useState<RoutePreviewSource>('guest');
  const [operationsTab, setOperationsTab] = useState<OperationsTab>('planned-routes');
  const [availableWorkspaces, setAvailableWorkspaces] = useState<SafeRouteWorkspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<SafeRouteWorkspace | null>(null);
  const [workspaceCatalogLoading, setWorkspaceCatalogLoading] = useState(false);
  const [workspaceCatalogError, setWorkspaceCatalogError] = useState('');
  const [workspaceCatalogStoredAtMs, setWorkspaceCatalogStoredAtMs] =
    useState<number | null>(null);
  const [workspaceCatalogRetentionStoredAtMs, setWorkspaceCatalogRetentionStoredAtMs] =
    useState<number | null>(null);
  const [workspaceAccessIssue, setWorkspaceAccessIssue] =
    useState<WorkspaceAccessIssue>('none');
  const [workspaceCatalogRetrying, setWorkspaceCatalogRetrying] = useState(false);
  const [workspaceForegroundAuthorizationPaused, setWorkspaceForegroundAuthorizationPaused] =
    useState(false);
  const [networkAuthorizationReady, setNetworkAuthorizationReady] =
    useState(false);
  const [workspaceDiscoveryRevision, setWorkspaceDiscoveryRevision] = useState(0);
  const [pendingNavigationRestore, setPendingNavigationRestore] =
    useState<PendingNavigationRestore | null>(null);
  const [navigationCleanupStatus, setNavigationCleanupStatus] =
    useState<NavigationCleanupStatus>('idle');
  const [workspaceHandoffPending, setWorkspaceHandoffPending] = useState(false);
  const [
    pendingWorkspaceHandoffTargetName,
    setPendingWorkspaceHandoffTargetName,
  ] = useState('');
  const [workspaceSelectionStatus, setWorkspaceSelectionStatus] =
    useState<WorkspaceSelectionStatus>('idle');
  const [
    suspendedNavigationNoticeHeight,
    setSuspendedNavigationNoticeHeight,
  ] = useState(0);
  const [offlineCalendarCleanupStatus, setOfflineCalendarCleanupStatus] =
    useState<OfflineCalendarCleanupStatus>('idle');
  const pendingFullAccessFeatureRef = useRef<GuestFullAccessFeature | null>(null);
  const activeSessionTokenRef = useRef(session?.accessToken || null);
  const activeSessionPrincipalIdRef = useRef(getAuthSessionPrincipalId(session));
  const sessionCleanupRef = useRef<Promise<unknown> | null>(null);
  const sessionEpochRef = useRef(0);
  const sessionExpiryHandledRef = useRef(false);
  const sessionRestoreStartedRef = useRef(false);
  const sessionRestoreGenerationRef = useRef(0);
  const activeSessionExpiryHandlerRef =
    useRef<((identity: ActiveSessionExpiryIdentity) => void) | null>(null);
  const activeSessionExpiryMonitorRef =
    useRef<ActiveSessionExpiryMonitor | null>(null);
  if (!activeSessionExpiryMonitorRef.current) {
    activeSessionExpiryMonitorRef.current = createActiveSessionExpiryMonitor({
      onExpire: (identity) => {
        activeSessionExpiryHandlerRef.current?.(identity);
      },
      schedule: (callback, delayMs) => {
        const timeout = setTimeout(callback, delayMs);
        return () => clearTimeout(timeout);
      },
    });
  }
  const workspaceCatalogRetryingRef = useRef(false);
  const workspaceCatalogBusyRef = useRef(false);
  const workspaceForegroundAuthorizationEpochRef = useRef(0);
  const workspaceForegroundAuthorizationPausedRef = useRef(false);
  const workspaceForegroundRefreshPendingRef = useRef(false);
  const workspaceWasBackgroundedRef = useRef(AppState.currentState === 'background');
  const offlineNetworkObservedRef = useRef(networkStatus === 'offline');
  const workspaceAccessAnnouncementPhaseRef =
    useRef<WorkspaceAccessAnnouncementPhase>('idle');
  const automaticReconnectAnnouncementPendingRef = useRef(false);
  const workspaceAccessFocusTargetRef = useRef<View | null>(null);
  const workspaceAccessFocusHandoffRef =
    useRef<WorkspaceAccessFocusHandoff<View> | null>(null);
  if (!workspaceAccessFocusHandoffRef.current) {
    workspaceAccessFocusHandoffRef.current = createWorkspaceAccessFocusHandoff({
      announce: (announcement) => {
        AccessibilityInfo.announceForAccessibilityWithOptions(announcement, {
          queue: true,
        });
      },
      focus: (target) => {
        AccessibilityInfo.sendAccessibilityEvent(target, 'focus');
      },
      isScreenReaderEnabled: () => AccessibilityInfo.isScreenReaderEnabled(),
      scheduleFallback: (callback, delayMs) => {
        const timeout = setTimeout(callback, delayMs);
        return () => clearTimeout(timeout);
      },
      subscribeToAnnouncementFinished: (listener) => {
        const subscription = AccessibilityInfo.addEventListener(
          'announcementFinished',
          listener,
        );
        return () => subscription.remove();
      },
    });
  }
  const updateWorkspaceAccessFocusTarget = useCallback((target: View | null) => {
    workspaceAccessFocusTargetRef.current = target;
  }, []);
  const workspaceRequestRevisionRef = useRef(0);
  const activeWorkspaceRef = useRef<SafeRouteWorkspace | null>(null);
  const availableWorkspacesRef = useRef<SafeRouteWorkspace[]>([]);
  const unavailableWorkspaceIdsRef = useRef(new Set<string>());
  const freshWorkspaceAuthorizationRef = useRef({
    principalId: '',
    workspaceIds: new Set<string>(),
  });
  const restoreUnavailableWorkspacesFromFreshCatalogRef = useRef(false);
  const pendingNavigationRestoreRef = useRef<ActiveNavigationSession | null>(null);
  const activeNavigationSessionRef = useRef<ActiveNavigationSession | null>(
    activeNavigationSession,
  );
  const selectedRouteRef = useRef<SavedSafeRoutePlan | null>(selectedRoute);
  const lastRenderedSelectedRouteRef = useRef<SavedSafeRoutePlan | null>(selectedRoute);
  const routePreviewRevisionRef = useRef(0);
  const routePreviewSourceRef = useRef<RoutePreviewSource>(routePreviewSource);
  const navigationCleanupRequiredRef = useRef(false);
  const navigationCleanupPromiseRef = useRef<Promise<boolean> | null>(null);
  const workspaceHandoffPendingRef = useRef(false);
  const pendingWorkspaceHandoffRef = useRef<PendingWorkspaceHandoff | null>(null);
  const workspaceSelectionRequestRevisionRef = useRef(0);
  const workspaceSelectionPendingRef = useRef(false);
  const workspaceSelectionSavingMessageRef = useRef<string | null>(null);
  const workspaceCatalogRefreshDeferredRef = useRef(false);
  const workspaceForegroundRefreshDeferredRef = useRef(false);
  const authenticated = hasAuthenticatedSession(session);
  const sessionPrincipalId = getAuthSessionPrincipalId(session);
  if (freshWorkspaceAuthorizationRef.current.principalId !== sessionPrincipalId) {
    freshWorkspaceAuthorizationRef.current = {
      principalId: sessionPrincipalId,
      workspaceIds: new Set<string>(),
    };
  }
  const activeWorkspaceAuthorizationFresh = Boolean(
    online &&
    networkAuthorizationReady &&
    activeWorkspace &&
    freshWorkspaceAuthorizationRef.current.workspaceIds.has(activeWorkspace.id) &&
    !workspaceForegroundRefreshPendingRef.current &&
    !workspaceForegroundAuthorizationPaused,
  );
  const workspaceAccessRecoveryPending = unavailableWorkspaceIdsRef.current.size > 0;
  const workspaceAccessRefreshAvailable = shouldOfferWorkspaceAccessRefresh({
    accessRecoveryPending: workspaceAccessRecoveryPending,
    authenticated,
    availableWorkspaceCount: availableWorkspaces.length,
    catalogLoading: workspaceCatalogLoading,
    catalogRetrying: workspaceCatalogRetrying,
    issue: workspaceAccessIssue,
  });
  const workspaceCatalogBusy = workspaceCatalogLoading || workspaceCatalogRetrying;
  workspaceCatalogBusyRef.current = workspaceCatalogBusy;
  const navigationWorkspaceLocked = Boolean(
    activeNavigationSession || pendingNavigationRestore,
  );
  const workspaceCleanupFailed = navigationCleanupStatus === 'failed';
  const workspaceCleanupLocked =
    navigationCleanupStatus !== 'idle' || workspaceHandoffPending;
  const workspaceSelectionPending = workspaceSelectionStatus === 'saving';
  const workspaceSelectionFailed = workspaceSelectionStatus === 'failed';
  const pendingWorkspaceHandoffForNotice =
    pendingWorkspaceHandoffTargetName
      ? pendingWorkspaceHandoffRef.current
      : null;
  const pendingWorkspaceHandoffNoticeDecision =
    pendingWorkspaceHandoffForNotice
      ? resolveWorkspaceHandoffContinuation({
          context: {
            availableWorkspaces,
            catalogBusy:
              workspaceCatalogBusy ||
              workspaceForegroundRefreshPendingRef.current,
            cleanupPending: Boolean(navigationCleanupPromiseRef.current),
            cleanupRequired: navigationCleanupRequiredRef.current,
            currentPrincipalId: getAuthSessionPrincipalId(session),
            currentSessionEpoch: sessionEpochRef.current,
            currentSourceWorkspaceId: activeWorkspace?.id || null,
            hasActiveNavigation: Boolean(activeNavigationSession),
            hasPendingNavigation: Boolean(pendingNavigationRestore),
            selectionPending: workspaceSelectionPending,
            unavailableWorkspaceIds: unavailableWorkspaceIdsRef.current,
          },
          request: {
            principalId:
              pendingWorkspaceHandoffForNotice.requestedPrincipalId,
            sessionEpoch:
              pendingWorkspaceHandoffForNotice.requestedSessionEpoch,
            sourceWorkspaceId:
              pendingWorkspaceHandoffForNotice.requestedSourceWorkspaceId,
            targetWorkspaceId:
              pendingWorkspaceHandoffForNotice.requestedTargetWorkspaceId,
          },
        })
      : null;
  const workspaceHandoffNoticeTargetName =
    pendingWorkspaceHandoffNoticeDecision?.target?.name || '';
  const sessionEpoch = sessionEpochRef.current;
  activeSessionTokenRef.current = session?.accessToken || null;
  activeSessionPrincipalIdRef.current = getAuthSessionPrincipalId(session);
  activeWorkspaceRef.current = activeWorkspace;
  availableWorkspacesRef.current = availableWorkspaces;
  activeNavigationSessionRef.current = activeNavigationSession;
  if (lastRenderedSelectedRouteRef.current !== selectedRoute) {
    lastRenderedSelectedRouteRef.current = selectedRoute;
    routePreviewRevisionRef.current += 1;
  }
  selectedRouteRef.current = selectedRoute;
  routePreviewSourceRef.current = routePreviewSource;

  useEffect(() => {
    if (
      automaticReconnectAnnouncementPendingRef.current &&
      networkStatus === 'online' &&
      !workspaceCatalogLoading
    ) {
      return;
    }
    const transition = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: workspaceAccessRecoveryPending,
      availableWorkspaceCount: availableWorkspaces.length,
      catalogStoredAtMs: activeWorkspaceAuthorizationFresh
        ? null
        : workspaceCatalogStoredAtMs,
      issue: workspaceAccessIssue,
      loading: workspaceCatalogLoading,
      networkStatus,
      previousPhase: workspaceAccessAnnouncementPhaseRef.current,
      retrying: workspaceCatalogRetrying,
      workspaceContextResolved:
        authenticated &&
        !(workspaceCatalogLoading && availableWorkspaces.length === 0),
    });
    workspaceAccessAnnouncementPhaseRef.current = transition.phase;
    if (Platform.OS === 'ios' && transition.announcement) {
      workspaceAccessFocusHandoffRef.current?.cancel();
      AccessibilityInfo.announceForAccessibilityWithOptions(
        transition.announcement,
        { queue: true },
      );
    }
  }, [
    authenticated,
    activeWorkspaceAuthorizationFresh,
    availableWorkspaces.length,
    networkStatus,
    workspaceAccessIssue,
    workspaceAccessRecoveryPending,
    workspaceCatalogLoading,
    workspaceCatalogRetrying,
    workspaceCatalogStoredAtMs,
  ]);

  useEffect(() => () => {
    workspaceAccessFocusHandoffRef.current?.cancel();
  }, []);

  useEffect(() => {
    workspaceSelectionRequestRevisionRef.current += 1;
    workspaceSelectionPendingRef.current = false;
    workspaceCatalogRefreshDeferredRef.current = false;
    workspaceForegroundRefreshDeferredRef.current = false;
    restoreUnavailableWorkspacesFromFreshCatalogRef.current = false;
    const savingMessage = workspaceSelectionSavingMessageRef.current;
    workspaceSelectionSavingMessageRef.current = null;
    if (savingMessage) {
      setSessionMessage((currentMessage) =>
        currentMessage === savingMessage ? '' : currentMessage,
      );
    }
    setWorkspaceSelectionStatus('idle');
  }, [sessionPrincipalId]);

  useEffect(() => {
    if (!online) {
      setNetworkAuthorizationReady(false);
    }
  }, [online]);

  useEffect(() => {
    if (
      !authenticated ||
      activeWorkspaceAuthorizationFresh ||
      workspaceCatalogRetentionStoredAtMs === null ||
      availableWorkspaces.length === 0
    ) {
      return;
    }

    const expireCachedCatalog = () => {
      freshWorkspaceAuthorizationRef.current = {
        principalId: sessionPrincipalId,
        workspaceIds: new Set<string>(),
      };
      availableWorkspacesRef.current = [];
      setAvailableWorkspaces([]);
      activeWorkspaceRef.current = null;
      setActiveWorkspace(null);
      setWorkspaceCatalogStoredAtMs(null);
      setWorkspaceCatalogRetentionStoredAtMs(null);
      setNetworkAuthorizationReady(false);
      setWorkspaceCatalogError(
        networkStatus === 'offline'
          ? 'Saved workspace list expired. Reconnect to refresh.'
          : networkStatus === 'checking'
            ? 'Saved workspace list expired. Wait for the connection check.'
            : 'Saved workspace list expired. Retry workspace access.',
      );
      setWorkspaceAccessIssue('verification-unavailable');
    };
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleExpiryCheck = () => {
      const expiryDelayMs = getWorkspaceCatalogExpiryDelayMs({
        retentionStoredAtMs: workspaceCatalogRetentionStoredAtMs,
      });
      if (expiryDelayMs === null) {
        expireCachedCatalog();
        return;
      }
      expiryTimer = setTimeout(scheduleExpiryCheck, expiryDelayMs);
    };
    scheduleExpiryCheck();
    return () => {
      if (expiryTimer !== null) {
        clearTimeout(expiryTimer);
      }
    };
  }, [
    activeWorkspaceAuthorizationFresh,
    authenticated,
    availableWorkspaces.length,
    networkStatus,
    sessionPrincipalId,
    workspaceCatalogRetentionStoredAtMs,
  ]);

  useEffect(() => {
    if (
      sessionRestoreNetworkStatus === null &&
      (networkStatus !== 'checking' || SAFEROUTE_PREVIEW_MODE_ENABLED)
    ) {
      setSessionRestoreNetworkStatus(networkStatus);
    }
  }, [networkStatus, sessionRestoreNetworkStatus]);

  const requestWorkspaceForegroundRevalidation = useCallback(
    (nextAppState: Parameters<typeof resolveWorkspaceForegroundRevalidation>[0]['nextAppState']) => {
      if (
        nextAppState === 'active' &&
        activeSessionExpiryMonitorRef.current?.checkNow()
      ) {
        workspaceWasBackgroundedRef.current = false;
        return;
      }
      if (
        nextAppState === 'active' &&
        (
          AppState.currentState !== 'active' ||
          networkStatusRef.current !== 'online'
        )
      ) {
        return;
      }
      const accessToken = activeSessionTokenRef.current?.trim() || '';
      const principalId = activeSessionPrincipalIdRef.current;
      const decision = resolveWorkspaceForegroundRevalidation({
        authenticated: Boolean(accessToken),
        backgrounded: workspaceWasBackgroundedRef.current,
        catalogBusy: workspaceCatalogBusyRef.current,
        nextAppState,
        previewSession: isPreviewAccessToken(accessToken),
        refreshPending: workspaceForegroundRefreshPendingRef.current,
        sessionCleanupPending: Boolean(sessionCleanupRef.current),
        stablePrincipal: Boolean(principalId),
      });
      workspaceWasBackgroundedRef.current = decision.backgrounded;
      if (
        nextAppState === 'background' &&
        accessToken &&
        principalId &&
        !isPreviewAccessToken(accessToken)
      ) {
        workspaceForegroundAuthorizationEpochRef.current += 1;
        workspaceForegroundAuthorizationPausedRef.current = true;
        setWorkspaceForegroundAuthorizationPaused(true);
      }
      if (!decision.revalidate) {
        return;
      }
      if (
        workspaceSelectionPendingRef.current ||
        pendingWorkspaceHandoffRef.current
      ) {
        workspaceCatalogRefreshDeferredRef.current = true;
        workspaceForegroundRefreshDeferredRef.current = true;
        workspaceForegroundAuthorizationPausedRef.current = true;
        setWorkspaceForegroundAuthorizationPaused(true);
        return;
      }

      workspaceForegroundRefreshPendingRef.current = true;
      workspaceForegroundAuthorizationPausedRef.current = true;
      setWorkspaceForegroundAuthorizationPaused(true);
      workspaceCatalogBusyRef.current = true;
      if (pendingNavigationRestoreRef.current) {
        setPendingNavigationRestoreStatus('checking');
        setSessionMessage('Restoring your saved route…');
      }
      restoreUnavailableWorkspacesFromFreshCatalogRef.current = false;
      setWorkspaceCatalogLoading(true);
      setWorkspaceCatalogError('');
      setWorkspaceAccessIssue('none');
      setWorkspaceDiscoveryRevision((revision) => revision + 1);
    },
    [],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', requestWorkspaceForegroundRevalidation);

    return () => subscription.remove();
  }, [requestWorkspaceForegroundRevalidation]);

  useEffect(() => {
    if (!workspaceCatalogBusy) {
      requestWorkspaceForegroundRevalidation(AppState.currentState);
    }
  }, [requestWorkspaceForegroundRevalidation, workspaceCatalogBusy]);

  const takePendingFullAccessFeature = () => {
    const pendingFeature = pendingFullAccessFeatureRef.current;
    pendingFullAccessFeatureRef.current = null;
    return pendingFeature;
  };

  const openAuthenticatedFeature = (feature: GuestFullAccessFeature) => {
    const nextNavigation = resolveFullAccessNavigation({
      authenticated: true,
      feature
    });

    setSessionMessage('');
    setAuthPrompt('');

    if (nextNavigation.screen === 'operations') {
      setOperationsTab(nextNavigation.tab);
      setScreen('operations');
      return;
    }

    if (nextNavigation.screen === 'routes') {
      setScreen('routes');
    }
  };

  const openActiveNavigationSession = (
    nextNavigationSession: ActiveNavigationSession,
    sessionAuthenticated: boolean,
    authorizedWorkspaceId?: string | null,
    authorizedPrincipalId?: string | null
  ) => {
    if (
      navigationCleanupRequiredRef.current ||
      !canResumeActiveNavigationSession(
      nextNavigationSession,
      sessionAuthenticated,
      authorizedWorkspaceId,
      authorizedPrincipalId,
      )
    ) {
      return false;
    }

    pendingNavigationRestoreRef.current = null;
    setPendingNavigationRestore(null);
    activeNavigationSessionRef.current = nextNavigationSession;
    selectedRouteRef.current = nextNavigationSession.routePlan;
    setActiveNavigationSession(nextNavigationSession);
    setSelectedRoute(nextNavigationSession.routePlan);
    setRoutePreviewSource(nextNavigationSession.routeContext);
    setScreen('route-preview');
    void recordGuidanceContractEvidence({
      authorization: {
        catalog: nextNavigationSession.accessScope.kind === 'workspace'
          ? 'fresh-authorized'
          : 'not-checked',
        principal: nextNavigationSession.accessScope.kind === 'workspace'
          ? 'matching'
          : 'none',
      },
      cause: nextNavigationSession.accessScope.kind === 'workspace'
        ? 'workspace-fresh-authorized'
        : 'public-cold-restore',
      durability: { activeNavigation: 'present' },
      navigationInstanceId: nextNavigationSession.navigationInstanceId,
      outcome: 'ready',
      routeId: nextNavigationSession.routePlan.route.id,
      type: 'restore.ready',
      unavailableWorkspaceIds: [],
      workspaceId: nextNavigationSession.accessScope.kind === 'workspace'
        ? nextNavigationSession.accessScope.clientId
        : null,
    });
    return true;
  };

  const stagePendingNavigationRestore = (
    nextNavigationSession: ActiveNavigationSession,
  ) => {
    pendingNavigationRestoreRef.current = nextNavigationSession;
    setPendingNavigationRestore({
      session: nextNavigationSession,
      status: 'checking',
    });
  };

  const setPendingNavigationRestoreStatus = (
    status: SuspendedNavigationStatus,
  ) => {
    const pendingSession = pendingNavigationRestoreRef.current;
    if (!pendingSession) {
      setPendingNavigationRestore(null);
      return;
    }
    setPendingNavigationRestore({ session: pendingSession, status });
  };

  const performPersistedNavigationCleanup = async (
    evidenceSession: ActiveNavigationSession | null,
  ) => {
    if (navigationCleanupPromiseRef.current) {
      return navigationCleanupPromiseRef.current;
    }

    navigationCleanupRequiredRef.current = true;
    setNavigationCleanupStatus('checking');
    const cleanupPromise = Promise.allSettled([
      stopBackgroundNavigation(),
      clearActiveNavigationSession(),
    ]).then(async (cleanup) => {
      const durableClearSucceeded =
        cleanup[1].status === 'fulfilled' && cleanup[1].value === true;
      const trackingVerification =
        cleanup[0].status === 'fulfilled' && durableClearSucceeded
          ? await confirmBackgroundNavigationStopped()
          : {
              nativeTracking: 'unknown' as const,
              runtimePermit: 'unknown' as const,
              stopped: false,
            };
      const cleanupSucceeded = durableClearSucceeded && trackingVerification.stopped;
      const workspaceId = evidenceSession?.accessScope.kind === 'workspace'
        ? evidenceSession.accessScope.clientId
        : null;
      await recordGuidanceContractEvidence({
        authorization: {
          catalog: 'not-checked',
          principal: evidenceSession?.accessScope.kind === 'workspace'
            ? 'matching'
            : 'none',
        },
        cause: 'navigation-discard',
        durability: {
          activeNavigation: durableClearSucceeded ? 'revoked' : 'unknown',
          persistedPermit: durableClearSucceeded ? 'revoked' : 'unknown',
        },
        navigationInstanceId: evidenceSession?.navigationInstanceId || null,
        outcome: durableClearSucceeded ? 'cleared' : 'failed',
        routeId: evidenceSession?.routePlan.route.id || null,
        type: 'navigation.cleanup.settled',
        unavailableWorkspaceIds: workspaceId ? [workspaceId] : [],
        workspaceId,
      });
      await recordGuidanceContractEvidence({
        authorization: {
          catalog: 'not-checked',
          principal: evidenceSession?.accessScope.kind === 'workspace'
            ? 'matching'
            : 'none',
        },
        cause: 'navigation-discard',
        durability: {
          nativeTracking: trackingVerification.nativeTracking,
          persistedPermit: durableClearSucceeded ? 'revoked' : 'unknown',
          runtimePermit: trackingVerification.runtimePermit,
        },
        navigationInstanceId: evidenceSession?.navigationInstanceId || null,
        outcome: trackingVerification.stopped ? 'off' : 'unknown',
        routeId: evidenceSession?.routePlan.route.id || null,
        type: 'tracking.stop.settled',
        unavailableWorkspaceIds: workspaceId ? [workspaceId] : [],
        workspaceId,
      });
      navigationCleanupRequiredRef.current = !cleanupSucceeded;
      setNavigationCleanupStatus(cleanupSucceeded ? 'idle' : 'failed');
      return cleanupSucceeded;
    }).finally(() => {
      navigationCleanupPromiseRef.current = null;
    });
    navigationCleanupPromiseRef.current = cleanupPromise;
    return cleanupPromise;
  };

  const discardPersistedNavigation = async (
    message?: string,
    {
      evidenceSession: evidenceSessionOverride = null,
      publishCleanupFailure = true,
    }: {
      evidenceSession?: ActiveNavigationSession | null;
      publishCleanupFailure?: boolean;
    } = {},
  ) => {
    const evidenceSession =
      evidenceSessionOverride ||
      pendingNavigationRestoreRef.current ||
      activeNavigationSessionRef.current;
    pendingNavigationRestoreRef.current = null;
    setPendingNavigationRestore(null);
    activeNavigationSessionRef.current = null;
    selectedRouteRef.current = null;
    setActiveNavigationSession(null);
    setSelectedRoute(null);
    const durableClearSucceeded = await performPersistedNavigationCleanup(evidenceSession);
    if (!durableClearSucceeded) {
      if (publishCleanupFailure) {
        setSessionMessage(
          'Saved guidance could not be removed. Retry cleanup before starting another route.',
        );
      }
      return false;
    }
    if (message) {
      setSessionMessage(message);
    }
    return true;
  };

  const clearPendingWorkspaceHandoff = (
    request?: PendingWorkspaceHandoff,
    {
      discardDeferredCatalogRefresh = false,
    }: {
      discardDeferredCatalogRefresh?: boolean;
    } = {},
  ) => {
    if (request && pendingWorkspaceHandoffRef.current !== request) {
      return;
    }
    pendingWorkspaceHandoffRef.current = null;
    setPendingWorkspaceHandoffTargetName('');
    if (discardDeferredCatalogRefresh) {
      workspaceCatalogRefreshDeferredRef.current = false;
      workspaceForegroundRefreshDeferredRef.current = false;
    }
  };

  const resumeDeferredWorkspaceCatalogRefresh = () => {
    if (!workspaceCatalogRefreshDeferredRef.current) {
      return;
    }
    const foregroundRefresh =
      workspaceForegroundRefreshDeferredRef.current;
    workspaceCatalogRefreshDeferredRef.current = false;
    workspaceForegroundRefreshDeferredRef.current = false;
    workspaceCatalogBusyRef.current = true;
    if (foregroundRefresh) {
      workspaceForegroundRefreshPendingRef.current = true;
      workspaceForegroundAuthorizationPausedRef.current = true;
      setWorkspaceForegroundAuthorizationPaused(true);
    }
    setWorkspaceCatalogLoading(true);
    setWorkspaceDiscoveryRevision((revision) => revision + 1);
  };

  const resolvePendingWorkspaceHandoffDecision = (
    request: PendingWorkspaceHandoff,
  ) =>
    resolveWorkspaceHandoffContinuation({
      context: {
        availableWorkspaces: availableWorkspacesRef.current,
        catalogBusy:
          workspaceCatalogBusyRef.current ||
          workspaceCatalogRetryingRef.current ||
          workspaceForegroundRefreshPendingRef.current,
        cleanupPending: Boolean(navigationCleanupPromiseRef.current),
        cleanupRequired: navigationCleanupRequiredRef.current,
        currentPrincipalId: activeSessionPrincipalIdRef.current,
        currentSessionEpoch: sessionEpochRef.current,
        currentSourceWorkspaceId: activeWorkspaceRef.current?.id || null,
        hasActiveNavigation: Boolean(activeNavigationSessionRef.current),
        hasPendingNavigation: Boolean(pendingNavigationRestoreRef.current),
        selectionPending: workspaceSelectionPendingRef.current,
        unavailableWorkspaceIds: unavailableWorkspaceIdsRef.current,
      },
      request: {
        principalId: request.requestedPrincipalId,
        sessionEpoch: request.requestedSessionEpoch,
        sourceWorkspaceId: request.requestedSourceWorkspaceId,
        targetWorkspaceId: request.requestedTargetWorkspaceId,
      },
    });

  const handleRetryNavigationCleanup = async () => {
    const retainedHandoff = pendingWorkspaceHandoffRef.current;
    if (retainedHandoff) {
      if (workspaceHandoffPendingRef.current) {
        return;
      }
      workspaceHandoffPendingRef.current = true;
      setWorkspaceHandoffPending(true);
    }
    try {
      const durableClearSucceeded = await performPersistedNavigationCleanup(
        retainedHandoff?.evidenceSession || null,
      );
      if (!retainedHandoff) {
        setSessionMessage(
          durableClearSucceeded
            ? 'Saved guidance removed. You can start another route.'
            : 'Saved guidance could not be removed. Keep SafeRoute open and retry cleanup.',
        );
        return;
      }
      if (!durableClearSucceeded) {
        const retainedRequestOwnsCurrentSession =
          pendingWorkspaceHandoffRef.current === retainedHandoff &&
          retainedHandoff.requestedPrincipalId ===
            activeSessionPrincipalIdRef.current &&
          retainedHandoff.requestedSessionEpoch === sessionEpochRef.current;
        if (!retainedRequestOwnsCurrentSession) {
          return;
        }
        const retainedDecision =
          resolvePendingWorkspaceHandoffDecision(retainedHandoff);
        if (retainedDecision?.target) {
          setSessionMessage(
            `Saved guidance could not be removed. Retry cleanup to finish changing to ${retainedDecision.target.name}.`,
          );
        } else {
          clearPendingWorkspaceHandoff(retainedHandoff);
          setSessionMessage(
            'Saved guidance could not be removed. Keep SafeRoute open and retry cleanup.',
          );
        }
        return;
      }
      await continuePendingWorkspaceHandoff(retainedHandoff);
    } finally {
      const continuationStillPending = Boolean(
        retainedHandoff &&
        pendingWorkspaceHandoffRef.current === retainedHandoff &&
        !navigationCleanupRequiredRef.current,
      );
      workspaceHandoffPendingRef.current = continuationStillPending;
      setWorkspaceHandoffPending(continuationStillPending);
    }
  };

  const handleRetryOfflineCalendarCleanup = async () => {
    if (offlineCalendarCleanupStatus === 'checking') {
      return;
    }
    const retrySession = session;
    const retryPrincipalId = getAuthSessionPrincipalId(retrySession);
    const retrySessionEpoch = sessionEpochRef.current;
    setOfflineCalendarCleanupStatus('checking');
    const cleanup = await recoverOfflineOperationsPrincipalCleanup(
      retryPrincipalId || null,
      clearAuthSession,
    );
    const signedOutCalendarRemoved =
      cleanup.status === 'clean' && !retrySession
        ? await ensureSignedOutOfflineOperationsCalendarRemoved()
        : true;
    if (
      cleanup.status !== 'clean' ||
      !signedOutCalendarRemoved ||
      retrySessionEpoch !== sessionEpochRef.current
    ) {
      if (retrySessionEpoch === sessionEpochRef.current) {
        setOfflineCalendarCleanupStatus('failed');
      }
      return;
    }
    if (retrySessionEpoch !== sessionEpochRef.current) {
      return;
    }
    await recordOfflineCalendarCleanupContractEvidence(
      'cleanup-retry',
      'clean',
    );
    setOfflineCalendarCleanupStatus('idle');
    setSessionMessage(
      retrySession
        ? 'Offline data storage restored for this session. Fresh sync can resume.'
        : 'Offline data storage restored. Sign in again to resume offline review.',
    );
  };

  const handleEndSuspendedNavigation = async () => {
    const endedNavigation = pendingNavigationRestoreRef.current;
    const endedWorkspaceId =
      endedNavigation?.accessScope.kind === 'workspace'
        ? endedNavigation.accessScope.clientId
        : null;
    const endedPrincipalId =
      endedNavigation?.accessScope.kind === 'workspace'
        ? endedNavigation.accessScope.principalId
        : '';
    const endedSessionEpoch = sessionEpochRef.current;
    const endRequestIsCurrent = () =>
      isSuspendedNavigationEndRequestCurrent({
        currentPrincipalId: activeSessionPrincipalIdRef.current,
        currentSessionEpoch: sessionEpochRef.current,
        endedPrincipalId,
        endedSessionEpoch,
        hasActiveNavigation: Boolean(activeNavigationSessionRef.current),
        hasPendingNavigation: Boolean(pendingNavigationRestoreRef.current),
      });
    const reviewWorkspaceRequestIsCurrent = () =>
      endRequestIsCurrent() && !activeWorkspaceRef.current;
    const ended = await discardPersistedNavigation(undefined, {
      publishCleanupFailure: false,
    });
    if (!ended) {
      if (endRequestIsCurrent()) {
        setSessionMessage(
          'Saved guidance could not be removed. Retry cleanup before starting another route.',
        );
      }
      return;
    }
    if (!endRequestIsCurrent()) {
      return;
    }
    if (!endedWorkspaceId) {
      setSessionMessage('Suspended route ended.');
      return;
    }
    let persistedReviewContext: Awaited<
      ReturnType<typeof persistOfflineReviewWorkspaceSelection>
    >;
    try {
      persistedReviewContext = await persistOfflineReviewWorkspaceSelection(
        endedPrincipalId,
        endedWorkspaceId,
      );
    } catch {
      if (reviewWorkspaceRequestIsCurrent()) {
        setSessionMessage(
          'Suspended route ended. Choose a cached workspace to keep reviewing saved routes.',
        );
      }
      return;
    }
    if (!reviewWorkspaceRequestIsCurrent()) {
      return;
    }
    const persistedReviewWorkspace = resolveReviewWorkspaceAfterNavigationEnd({
      endedWorkspaceId,
      unavailableWorkspaceIds: unavailableWorkspaceIdsRef.current,
      workspaces: availableWorkspacesRef.current,
    });
    if (
      persistedReviewContext?.activeWorkspaceId !== endedWorkspaceId ||
      persistedReviewWorkspace?.id !== endedWorkspaceId
    ) {
      setSessionMessage(
        'Suspended route ended. Choose a cached workspace to keep reviewing saved routes.',
      );
      return;
    }
    activeWorkspaceRef.current = persistedReviewWorkspace;
    setActiveWorkspace(persistedReviewWorkspace);
    setSessionMessage('Suspended route ended.');
  };

  useEffect(() => {
    const restoreNetworkStatus =
      sessionRestoreRevision > 0
        ? networkStatusRef.current
        : sessionRestoreNetworkStatus;
    if (
      sessionRestoreStartedRef.current ||
      restoreNetworkStatus === null
    ) {
      return;
    }
    sessionRestoreStartedRef.current = true;
    let mounted = true;
    const restoreGeneration = ++sessionRestoreGenerationRef.current;
    const restoreIsCurrent = () =>
      isSessionRestoreAttemptCurrent(
        sessionRestoreGenerationRef.current,
        restoreGeneration,
        mounted,
      );
    const clearAuthSessionForCurrentRestore = async () => {
      requireCurrentSessionRestoreAttempt(
        sessionRestoreGenerationRef.current,
        restoreGeneration,
        mounted,
      );
      await clearAuthSession();
    };

    const enablePreviewSession = () => {
      if (!SAFEROUTE_PREVIEW_MODE_ENABLED || !restoreIsCurrent()) {
        return false;
      }

      const previewInitialScreen = SAFEROUTE_PREVIEW_INITIAL_SCREEN;

      if (
        previewInitialScreen === 'login' ||
        previewInitialScreen === 'login-code' ||
        previewInitialScreen === 'session-expired'
      ) {
        const previewSessionMessage =
          previewInitialScreen === 'session-expired' ? PREVIEW_EXPIRED_SESSION_NOTICE : '';

        setSession(null);
        setAuthPrompt(previewSessionMessage);
        setSessionMessage(previewSessionMessage);
        setScreen('login');
        return true;
      }

      setAuthPrompt('');
      unavailableWorkspaceIdsRef.current.clear();
      setWorkspaceCatalogLoading(true);
      workspaceCatalogRetryingRef.current = false;
      setWorkspaceCatalogRetrying(false);
      if (previewInitialScreen === 'guidance-suspended') {
        stagePendingNavigationRestore(createPreviewSuspendedNavigationSession());
        setSessionMessage('Restoring your saved route…');
      }
      setSession(createPreviewAuthSession());
      if (previewInitialScreen !== 'guidance-suspended') {
        setSessionMessage(PREVIEW_SESSION_NOTICE);
      }
      const pendingFeature = takePendingFullAccessFeature();
      if (pendingFeature) {
        openAuthenticatedFeature(pendingFeature);
      } else {
        setScreen(screenForAuthenticatedPreview(previewInitialScreen));
      }
      return true;
    };

    const restoreSession = async () => {
      const manualRetry = sessionRestoreRevision > 0;
      if (!manualRetry) {
        setAuthPrompt('');
      }
      setSelectedRoute(null);
      setAvailableWorkspaces([]);
      activeWorkspaceRef.current = null;
      setActiveWorkspace(null);
      setWorkspaceCatalogLoading(true);
      setWorkspaceCatalogError('');
      setWorkspaceCatalogStoredAtMs(null);
      setWorkspaceCatalogRetentionStoredAtMs(null);
      setWorkspaceAccessIssue('none');
      setNetworkAuthorizationReady(false);
      workspaceCatalogRetryingRef.current = false;
      setWorkspaceCatalogRetrying(false);
      if (!manualRetry) {
        setScreen('guest-map');
      }
      let persistedNavigation: ActiveNavigationSession | null = null;
      let storedSessionAvailableForRetry = false;

      try {
        const entryTrackingVerification =
          SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED
            ? await confirmBackgroundNavigationStopped()
            : null;
        if (!restoreIsCurrent()) {
          return;
        }
        await stopBackgroundNavigation();
        if (!restoreIsCurrent()) {
          return;
        }
        const operationsCleanup =
          await recoverOfflineOperationsPrincipalCleanup(
            null,
            clearAuthSessionForCurrentRestore,
          );
        if (!restoreIsCurrent()) {
          return;
        }
        setOfflineCalendarCleanupStatus(
          operationsCleanup.status === 'clean' ? 'idle' : 'failed',
        );
        if (operationsCleanup.status !== 'clean') {
          await recordOfflineCalendarCleanupContractEvidence(
            'startup-terminal-replay',
            'retry-required',
          );
          if (!restoreIsCurrent()) {
            return;
          }
          setSession(null);
          setSessionMessage(
            'Secure offline data cleanup needs retry before account access can be restored.',
          );
          setAuthPrompt(
            'Retry offline data cleanup before signing in.',
          );
          setScreen('guest-map');
          return;
        }
        const navigationReadback = SAFEROUTE_PREVIEW_MODE_ENABLED
          ? { session: null, status: 'absent' as const }
          : await readActiveNavigationSession();
        if (!restoreIsCurrent()) {
          return;
        }
        persistedNavigation = navigationReadback.session;
        if (
          !SAFEROUTE_PREVIEW_MODE_ENABLED &&
          navigationReadback.status === 'absent'
        ) {
          await recordNavigationAbsenceReadback(entryTrackingVerification);
          if (!restoreIsCurrent()) {
            return;
          }
        }
        const storedSession = await loadAuthSession();
        if (!restoreIsCurrent()) {
          return;
        }
        storedSessionAvailableForRetry = Boolean(storedSession);

        if (!storedSession) {
          setSavedSessionValidationRetryAvailable(false);
          const principalChangeRevocationObserved =
            await recordOfflineCalendarPrincipalChangeContractEvidence(
              'principal-change-relaunch-revoked',
            );
          if (!restoreIsCurrent()) {
            return;
          }
          const signedOutCalendarRemoved =
            await ensureSignedOutOfflineOperationsCalendarRemoved();
          if (!restoreIsCurrent()) {
            return;
          }
          setOfflineCalendarCleanupStatus(
            signedOutCalendarRemoved ? 'idle' : 'failed',
          );
          if (signedOutCalendarRemoved) {
            await recordOfflineCalendarCleanupContractEvidence(
              'signed-out-boot',
              'clean',
            );
            if (!restoreIsCurrent()) {
              return;
            }
            if (principalChangeRevocationObserved) {
              await recordOfflineCalendarPrincipalChangeContractEvidence(
                'principal-change-relaunch',
              );
              if (!restoreIsCurrent()) {
                return;
              }
            }
          }
          if (
            !persistedNavigation ||
            !openActiveNavigationSession(persistedNavigation, false, null, null)
          ) {
            if (persistedNavigation) {
              await discardPersistedNavigation(
                'Active guidance needs workspace access. Sign in and plot the route again.',
              );
              if (!restoreIsCurrent()) {
                return;
              }
            }
            enablePreviewSession();
          }
          return;
        }

        if (SAFEROUTE_PREVIEW_MODE_ENABLED && isPreviewAccessToken(storedSession.accessToken)) {
          enablePreviewSession();
          return;
        }

        const restoreResult = await restoreSavedSession(
          storedSession,
          getCurrentUser,
          { validateOnline: restoreNetworkStatus === 'online' },
        );
        if (!restoreIsCurrent()) {
          return;
        }

        if (restoreResult.status === 'validation-unavailable') {
          if (!storedSession.onlineValidationRequired) {
            try {
              const quarantineResult =
                await requireOnlineAuthSessionValidation(storedSession);
              if (!restoreIsCurrent() || quarantineResult === 'stale') {
                return;
              }
            } catch {
              if (!restoreIsCurrent()) {
                return;
              }
              storedSessionAvailableForRetry = false;
              const clearResult = await clearAuthSessionIfCurrent(storedSession);
              if (!restoreIsCurrent() || clearResult === 'stale') {
                return;
              }
              throw new Error(
                'Saved-session validation quarantine could not be persisted.',
              );
            }
          }
          if (!restoreIsCurrent()) {
            return;
          }
          setSavedSessionValidationRetryAvailable(true);
          setSession(null);
          setSelectedRoute(null);
          setAvailableWorkspaces([]);
          activeWorkspaceRef.current = null;
          setActiveWorkspace(null);
          setWorkspaceCatalogLoading(false);
          setWorkspaceCatalogError('');
          setWorkspaceCatalogStoredAtMs(null);
          setWorkspaceCatalogRetentionStoredAtMs(null);
          setWorkspaceAccessIssue('verification-unavailable');
          setNetworkAuthorizationReady(false);
          setSessionMessage(restoreResult.message);
          setAuthPrompt(restoreResult.message);
          setScreen('login');
          await recordOfflineCalendarPrincipalChangeContractEvidence(
            restoreNetworkStatus === 'offline'
              ? 'principal-change-validation-offline-relaunch'
              : 'principal-change-validation-unavailable',
          );
          if (!restoreIsCurrent()) {
            return;
          }
          return;
        }

        if (restoreResult.status === 'expired') {
          if (!restoreIsCurrent()) {
            return;
          }
          setSavedSessionValidationRetryAvailable(false);
          const operationsCleanup = await
            purgeOfflineOperationsPrincipalAtTerminalBoundary(
              getAuthSessionPrincipalId(storedSession),
              async () => {
                await clearAuthSessionIfCurrent(storedSession);
              },
            ).catch(() => null);
          if (!restoreIsCurrent()) {
            return;
          }
          const operationsCleanupNeedsRetry =
            operationsCleanup?.status !== 'clean';
          setOfflineCalendarCleanupStatus(
            operationsCleanupNeedsRetry ? 'failed' : 'idle',
          );
          if (operationsCleanupNeedsRetry) {
            await recordOfflineCalendarCleanupContractEvidence(
              'inactive-account',
              'retry-required',
            );
            if (!restoreIsCurrent()) {
              return;
            }
          }
          const terminalAccountBoundary =
            restoreResult.reason === 'inactive-account' ||
            restoreResult.reason === 'principal-changed';
          if (
            terminalAccountBoundary &&
            (
              restoreResult.reason === 'principal-changed' ||
              !enablePreviewSession()
            ) &&
            restoreIsCurrent()
          ) {
            if (
              restoreResult.reason === 'principal-changed' &&
              !operationsCleanupNeedsRetry
            ) {
              await recordOfflineCalendarPrincipalChangeContractEvidence(
                'principal-change',
              );
              if (!restoreIsCurrent()) {
                return;
              }
            }
            const guidanceCleared = persistedNavigation
              ? await discardPersistedNavigation(undefined, {
                  evidenceSession: persistedNavigation,
                })
              : true;
            if (!restoreIsCurrent()) {
              return;
            }
            const terminalMessage = guidanceCleared
              ? restoreResult.message
              : `${restoreResult.message} Saved guidance cleanup needs retry before signing in again.`;
            setSession(null);
            setSelectedRoute(null);
            setAvailableWorkspaces([]);
            activeWorkspaceRef.current = null;
            setActiveWorkspace(null);
            setWorkspaceCatalogLoading(false);
            setWorkspaceCatalogError('');
            setWorkspaceCatalogStoredAtMs(null);
            setWorkspaceCatalogRetentionStoredAtMs(null);
            setWorkspaceAccessIssue('none');
            setSessionMessage(terminalMessage);
            setAuthPrompt(terminalMessage);
            setScreen('login');
            return;
          }
          if (
            !enablePreviewSession() &&
            restoreIsCurrent() &&
            (!persistedNavigation ||
              !openActiveNavigationSession(persistedNavigation, false, null, null))
          ) {
            if (persistedNavigation) {
              await discardPersistedNavigation(
                'Active guidance could not be restored safely. Plot the route again.',
              );
              if (!restoreIsCurrent()) {
                return;
              }
            } else {
              setSessionMessage(restoreResult.message);
            }
          }
        } else if (restoreResult.status === 'restored' && restoreIsCurrent()) {
          setSavedSessionValidationRetryAvailable(false);
          const restoredPrincipalId = getAuthSessionPrincipalId(restoreResult.session);
          const operationsCacheActivated =
            await tryActivateOfflineOperationsPrincipal(restoredPrincipalId);
          if (!restoreIsCurrent()) {
            return;
          }
          setOfflineCalendarCleanupStatus(
            operationsCacheActivated ? 'idle' : 'failed',
          );
          if (restoreResult.validatedOnline) {
            const saveResult = await saveAuthSessionIfCurrent(
              storedSession,
              restoreResult.session,
            );
            if (!restoreIsCurrent() || saveResult === 'stale') {
              return;
            }
          }
          activeSessionPrincipalIdRef.current = restoredPrincipalId;
          setSessionMessage(
            operationsCacheActivated
              ? restoreResult.message || ''
              : 'Secure offline Calendar is unavailable until device storage can be accessed.',
          );
          setSession(restoreResult.session);
          if (persistedNavigation?.accessScope.kind === 'workspace') {
            if (hasMatchingAuthPrincipal(
              persistedNavigation.accessScope.principalId,
              restoreResult.session,
            )) {
              stagePendingNavigationRestore(persistedNavigation);
              setSessionMessage('Restoring your saved route…');
              await stopBackgroundNavigation();
              if (!restoreIsCurrent()) {
                return;
              }
              await recordNavigationRestoreSuspended(persistedNavigation);
              if (!restoreIsCurrent()) {
                return;
              }
            } else {
              await discardPersistedNavigation(
                'Active guidance belongs to another signed-in account. Plot the route again.',
              );
              if (!restoreIsCurrent()) {
                return;
              }
            }
          } else if (persistedNavigation) {
            await discardPersistedNavigation(
              'Active guidance could not be restored after sign-in. Plot the route again.',
            );
            if (!restoreIsCurrent()) {
              return;
            }
          }
          if (!pendingNavigationRestoreRef.current) {
            const pendingFeature = takePendingFullAccessFeature();
            if (pendingFeature) {
              openAuthenticatedFeature(pendingFeature);
            } else {
              setScreen('guest-map');
            }
          }
        }
      } catch {
        if (!restoreIsCurrent()) {
          return;
        }
        setSession(null);
        setSelectedRoute(null);
        setAvailableWorkspaces([]);
        activeWorkspaceRef.current = null;
        setActiveWorkspace(null);
        setWorkspaceCatalogLoading(false);
        setWorkspaceCatalogError('');
        setWorkspaceCatalogStoredAtMs(null);
        setWorkspaceCatalogRetentionStoredAtMs(null);
        setWorkspaceAccessIssue('verification-unavailable');
        setNetworkAuthorizationReady(false);
        const message = storedSessionAvailableForRetry
          ? 'Saved session verification did not finish. Retry or sign in again.'
          : 'SafeRoute could not restore account access. Sign in again.';
        setSavedSessionValidationRetryAvailable(storedSessionAvailableForRetry);
        setSessionMessage(message);
        setAuthPrompt(message);
        setScreen('login');
        if (SAFEROUTE_PREVIEW_MODE_ENABLED) {
          enablePreviewSession();
        }
      } finally {
        sessionRestoreStartedRef.current = false;
        if (restoreIsCurrent()) {
          setSavedSessionValidationRetrying(false);
        }
      }
    };

    void restoreSession();

    return () => {
      mounted = false;
    };
  }, [sessionRestoreNetworkStatus, sessionRestoreRevision]);

  const handleRetrySavedSessionValidation = () => {
    if (savedSessionValidationRetrying) {
      return;
    }
    setSavedSessionValidationRetrying(true);
    setSessionRestoreRevision((revision) => revision + 1);
  };

  const handleAuthenticated = async (nextSession: AuthSession) => {
    sessionRestoreGenerationRef.current += 1;
    clearPendingWorkspaceHandoff(undefined, {
      discardDeferredCatalogRefresh: true,
    });
    workspaceHandoffPendingRef.current = false;
    setWorkspaceHandoffPending(false);
    setSavedSessionValidationRetryAvailable(false);
    setSavedSessionValidationRetrying(false);
    workspaceRequestRevisionRef.current += 1;
    unavailableWorkspaceIdsRef.current.clear();
    setAvailableWorkspaces([]);
    activeWorkspaceRef.current = null;
    setActiveWorkspace(null);
    setWorkspaceCatalogLoading(true);
    setWorkspaceCatalogError('');
    setWorkspaceCatalogStoredAtMs(null);
    setWorkspaceCatalogRetentionStoredAtMs(null);
    setWorkspaceAccessIssue('none');
    workspaceCatalogRetryingRef.current = false;
    setWorkspaceCatalogRetrying(false);
    await waitForSessionCleanup(sessionCleanupRef.current);
    let operationsPreparation: Awaited<
      ReturnType<
        typeof prepareOfflineOperationsPrincipalForFreshAuthentication
      >
    > = {
      persistenceSafe: false,
      principalId: null,
      status: 'retry',
    };
    let authSessionPersisted = false;
    const persistedSession = await prepareAuthenticatedSession(
      nextSession,
      async (acceptedSession) => {
        operationsPreparation =
          await prepareOfflineOperationsPrincipalForFreshAuthentication(
            getAuthSessionPrincipalId(acceptedSession),
          );
        if (operationsPreparation.persistenceSafe) {
          await saveAuthSession(acceptedSession);
          authSessionPersisted = true;
        }
      },
      getCurrentUser,
    );
    if (!hasAuthenticatedSession(persistedSession)) {
      await clearAuthSession();
      setSession(null);
      setSessionMessage('Your LunarChain session could not be validated. Sign in again.');
      setAuthPrompt('Your LunarChain session could not be validated. Sign in again.');
      setScreen('login');
      return;
    }
    const operationsCacheActivated =
      operationsPreparation.status === 'clean';
    setOfflineCalendarCleanupStatus(
      operationsCacheActivated ? 'idle' : 'failed',
    );

    setSessionMessage(
      operationsCacheActivated
        ? ''
        : authSessionPersisted
          ? 'Secure offline Calendar cleanup needs retry before offline review.'
          : 'Signed in for this session only. Retry saved Calendar cleanup before offline review; sign in again after reopening.',
    );
    setAuthPrompt('');
    setAvailableWorkspaces([]);
    activeWorkspaceRef.current = null;
    setActiveWorkspace(null);
    setWorkspaceCatalogError('');
    setWorkspaceCatalogStoredAtMs(null);
    setWorkspaceCatalogRetentionStoredAtMs(null);
    setWorkspaceAccessIssue('none');
    sessionEpochRef.current += 1;
    activeSessionTokenRef.current = persistedSession.accessToken;
    activeSessionPrincipalIdRef.current = getAuthSessionPrincipalId(persistedSession);
    sessionExpiryHandledRef.current = false;
    const pendingFeature = takePendingFullAccessFeature();
    const persistedNavigation = await loadActiveNavigationSession();
    if (!persistedNavigation) {
      await stopBackgroundNavigation();
    }
    if (persistedNavigation?.accessScope.kind === 'workspace') {
      if (hasMatchingAuthPrincipal(
        persistedNavigation.accessScope.principalId,
        persistedSession,
      )) {
        stagePendingNavigationRestore(persistedNavigation);
        setSessionMessage('Restoring your saved route…');
        await stopBackgroundNavigation();
        await recordNavigationRestoreSuspended(persistedNavigation);
        setScreen('guest-map');
      } else {
        await discardPersistedNavigation(
          'Active guidance belongs to another signed-in account. Plot the route again.',
        );
      }
    } else {
      if (persistedNavigation) {
        await discardPersistedNavigation(
          'Active guidance could not be restored after sign-in. Plot the route again.',
        );
      }
      const nextNavigation = resolvePostAuthenticationNavigation(pendingFeature);
      if (nextNavigation.screen === 'operations') {
        setOperationsTab(nextNavigation.tab);
      }
      setScreen(nextNavigation.screen);
    }
    if (!pendingNavigationRestoreRef.current && persistedNavigation?.accessScope.kind === 'workspace') {
      setScreen('guest-map');
    }
    setSession(persistedSession);
  };

  const handleSignOut = async () => {
    const signingOutPrincipalId = activeSessionPrincipalIdRef.current;
    clearPendingWorkspaceHandoff(undefined, {
      discardDeferredCatalogRefresh: true,
    });
    workspaceHandoffPendingRef.current = false;
    setWorkspaceHandoffPending(false);
    workspaceRequestRevisionRef.current += 1;
    unavailableWorkspaceIdsRef.current.clear();
    sessionEpochRef.current += 1;
    activeSessionTokenRef.current = null;
    activeSessionPrincipalIdRef.current = '';
    sessionExpiryHandledRef.current = true;
    setOfflineCalendarCleanupStatus('checking');
    setAvailableWorkspaces([]);
    activeWorkspaceRef.current = null;
    setActiveWorkspace(null);
    setSession(null);
    setScreen('guest-map');
    const cleanup = Promise.allSettled([
      discardPersistedNavigation(),
      purgeOfflineOperationsPrincipalAtTerminalBoundary(
        signingOutPrincipalId,
        clearAuthSession,
      ),
    ]);
    sessionCleanupRef.current = cleanup;
    const cleanupResults = await cleanup;
    if (sessionCleanupRef.current === cleanup) {
      sessionCleanupRef.current = null;
    }
    const operationsCleanup = cleanupResults[1];
    setOfflineCalendarCleanupStatus(
      operationsCleanup.status === 'fulfilled' &&
        operationsCleanup.value.status === 'clean'
        ? 'idle'
        : 'failed',
    );
    setSessionMessage('');
    setAuthPrompt('');
    setWorkspaceCatalogLoading(false);
    workspaceForegroundAuthorizationPausedRef.current = false;
    setWorkspaceForegroundAuthorizationPaused(false);
    setWorkspaceCatalogError('');
    setWorkspaceCatalogStoredAtMs(null);
    setWorkspaceCatalogRetentionStoredAtMs(null);
    setWorkspaceAccessIssue('none');
    workspaceCatalogRetryingRef.current = false;
    setWorkspaceCatalogRetrying(false);
    setOperationsTab('planned-routes');
    pendingFullAccessFeatureRef.current = null;
  };

  const returnToMapHome = () => {
    setSelectedRoute(null);
    setSessionMessage('');
    setAuthPrompt('');
    setOperationsTab('planned-routes');
    pendingFullAccessFeatureRef.current = null;
    setScreen('guest-map');
  };

  const handleSessionExpired = async (
    message = 'Your LunarChain session expired. Sign in again.',
    expiredAccessToken = session?.accessToken || null,
    expiredSessionEpoch = sessionEpoch
  ) => {
    if (!shouldHandleActiveSessionExpiry({
      activeAccessToken: activeSessionTokenRef.current,
      activeSessionEpoch: sessionEpochRef.current,
      expiredAccessToken,
      expiredSessionEpoch,
      handled: sessionExpiryHandledRef.current
    })) {
      return;
    }
    clearPendingWorkspaceHandoff(undefined, {
      discardDeferredCatalogRefresh: true,
    });
    workspaceHandoffPendingRef.current = false;
    setWorkspaceHandoffPending(false);
    workspaceRequestRevisionRef.current += 1;
    unavailableWorkspaceIdsRef.current.clear();
    sessionExpiryHandledRef.current = true;
    const expiredPrincipalId = activeSessionPrincipalIdRef.current;
    activeSessionTokenRef.current = null;
    activeSessionPrincipalIdRef.current = '';
    setOfflineCalendarCleanupStatus('checking');
    pendingNavigationRestoreRef.current = null;
    setPendingNavigationRestore(null);
    pendingFullAccessFeatureRef.current = screen === 'operations'
      ? fullAccessFeatureForOperationsTab(operationsTab)
      : screen === 'routes'
        ? 'saved-routes'
        : screen === 'route-preview' && routePreviewSource === 'saved'
          ? 'saved-routes'
          : null;
    const cleanup = Promise.allSettled([
      discardPersistedNavigation(),
      purgeOfflineOperationsPrincipalAtTerminalBoundary(
        expiredPrincipalId,
        clearAuthSession,
      )
    ]);
    sessionCleanupRef.current = cleanup;
    setActiveNavigationSession(null);
    setSelectedRoute(null);
    setSessionMessage(message);
    setAuthPrompt(message);
    setAvailableWorkspaces([]);
    activeWorkspaceRef.current = null;
    setActiveWorkspace(null);
    setWorkspaceCatalogLoading(false);
    setWorkspaceCatalogError('');
    setWorkspaceCatalogStoredAtMs(null);
    setWorkspaceCatalogRetentionStoredAtMs(null);
    setWorkspaceAccessIssue('none');
    workspaceCatalogRetryingRef.current = false;
    setWorkspaceCatalogRetrying(false);
    setOperationsTab('planned-routes');
    setSession(null);
    setScreen('login');
    const cleanupResults = await cleanup;
    if (sessionCleanupRef.current === cleanup) {
      sessionCleanupRef.current = null;
    }
    const operationsCleanup = cleanupResults[1];
    setOfflineCalendarCleanupStatus(
      operationsCleanup.status === 'fulfilled' &&
        operationsCleanup.value.status === 'clean'
        ? 'idle'
        : 'failed',
    );
  };

  activeSessionExpiryHandlerRef.current = ({
    accessToken,
    sessionEpoch: expiredSessionEpoch,
  }) => {
    void handleSessionExpired(
      'Your LunarChain session expired. Sign in again.',
      accessToken,
      expiredSessionEpoch,
    );
  };

  useEffect(() => {
    const accessToken = session?.accessToken?.trim() || '';
    activeSessionExpiryMonitorRef.current?.arm(
      accessToken
        ? {
            accessToken,
            sessionEpoch,
          }
        : null,
    );

    return () => activeSessionExpiryMonitorRef.current?.cancel();
  }, [session?.accessToken, sessionEpoch]);

  useEffect(() => {
    const revision = workspaceRequestRevisionRef.current + 1;
    workspaceRequestRevisionRef.current = revision;
    const networkRequestEpoch = networkRequestEpochRef.current;
    const catalogRetryWasRequested = workspaceCatalogRetryingRef.current;
    const allowFreshWorkspaceRestoration =
      restoreUnavailableWorkspacesFromFreshCatalogRef.current;
    const accessToken = session?.accessToken?.trim();
    const principalId = getAuthSessionPrincipalId(session);

    if (
      !accessToken ||
      !authenticated ||
      sessionExpiryHandledRef.current ||
      activeSessionTokenRef.current !== accessToken
    ) {
      restoreUnavailableWorkspacesFromFreshCatalogRef.current = false;
      freshWorkspaceAuthorizationRef.current = {
        principalId: '',
        workspaceIds: new Set<string>(),
      };
      setAvailableWorkspaces([]);
      activeWorkspaceRef.current = null;
      setActiveWorkspace(null);
      setWorkspaceCatalogLoading(false);
      workspaceCatalogBusyRef.current = false;
      workspaceForegroundRefreshPendingRef.current = false;
      workspaceForegroundAuthorizationPausedRef.current = false;
      setWorkspaceForegroundAuthorizationPaused(false);
      setWorkspaceCatalogError('');
      setWorkspaceCatalogStoredAtMs(null);
      setWorkspaceCatalogRetentionStoredAtMs(null);
      setWorkspaceAccessIssue('none');
      workspaceCatalogRetryingRef.current = false;
      setWorkspaceCatalogRetrying(false);
      return;
    }

    setWorkspaceCatalogLoading(true);
    workspaceCatalogBusyRef.current = true;
    setWorkspaceCatalogError('');
    if (!workspaceCatalogRetryingRef.current) {
      setWorkspaceAccessIssue('none');
    }

    const discoverWorkspaces = async () => {
      const requestIsCurrent = () =>
        revision === workspaceRequestRevisionRef.current &&
        activeSessionTokenRef.current === accessToken &&
        activeSessionPrincipalIdRef.current === principalId;
      const onlineRequestIsCurrent = () =>
        requestIsCurrent() &&
        networkStatusRef.current === 'online' &&
        networkRequestEpoch === networkRequestEpochRef.current;
      const forceExplicitPreviewWorkspaceChoice =
        SAFEROUTE_PREVIEW_MODE_ENABLED &&
        SAFEROUTE_PREVIEW_INITIAL_SCREEN === 'workspace-choice';
      const cachedContext = forceExplicitPreviewWorkspaceChoice
        ? null
        : await loadOfflineWorkspaceContext(principalId);
      if (!requestIsCurrent()) {
        return;
      }
      unavailableWorkspaceIdsRef.current = new Set([
        ...unavailableWorkspaceIdsRef.current,
        ...(cachedContext?.unavailableWorkspaceIds || []),
      ]);
      if (networkStatus === 'offline' && cachedContext) {
        await recordOfflineCalendarWorkspaceRevocationContractEvidence({
          authorizationCatalog: 'not-checked',
          cause: 'workspace-denial-relaunch',
          principalId,
          unavailableWorkspaceIds: cachedContext.unavailableWorkspaceIds,
        });
      }
      const stagedNavigation = pendingNavigationRestoreRef.current;
      const stagedWorkspaceId = stagedNavigation?.accessScope.kind === 'workspace'
        ? stagedNavigation.accessScope.clientId
        : '';
      if (
        stagedWorkspaceId &&
        unavailableWorkspaceIdsRef.current.has(stagedWorkspaceId)
      ) {
        await discardPersistedNavigation(
          'Active guidance could not be restored because its workspace is no longer available. Plot the route again.',
        );
        if (!requestIsCurrent()) {
          return;
        }
      }

      const legacyRouteCacheSnapshot = cachedContext || forceExplicitPreviewWorkspaceChoice
        ? null
        : await loadOfflineRoutesSnapshot(principalId, null);
      if (!requestIsCurrent()) {
        return;
      }
      const legacyRouteCache = legacyRouteCacheSnapshot?.value || null;
      const migratedCachedContext =
        !cachedContext && legacyRouteCacheSnapshot?.value.clients.length
          ? await migrateOfflineWorkspaceCatalogFromRouteCache(
              principalId,
              {
                activeWorkspaceId: legacyRouteCacheSnapshot.value.selectedClientId,
                unavailableWorkspaceIds: Array.from(
                  unavailableWorkspaceIdsRef.current,
                ),
                workspaces: legacyRouteCacheSnapshot.value.clients,
              },
              legacyRouteCacheSnapshot.storedAtMs,
            )
          : null;
      if (!requestIsCurrent()) {
        return;
      }
      const cachedWorkspaceContext = cachedContext || migratedCachedContext;
      setWorkspaceCatalogStoredAtMs(
        cachedWorkspaceContext?.catalogStoredAtMs ??
          legacyRouteCacheSnapshot?.storedAtMs ??
          null,
      );
      setWorkspaceCatalogRetentionStoredAtMs(
        cachedWorkspaceContext?.retentionStoredAtMs ??
          legacyRouteCacheSnapshot?.storedAtMs ??
          null,
      );

      const cachedCatalog = excludeUnavailableWorkspaces(
        normalizeWorkspaceCatalog(
          cachedWorkspaceContext?.workspaces || legacyRouteCache?.clients || [],
        ),
        unavailableWorkspaceIdsRef.current,
      );
      if (!online) {
        setNetworkAuthorizationReady(false);
        freshWorkspaceAuthorizationRef.current = {
          principalId,
          workspaceIds: new Set<string>(),
        };
      }
      if (cachedCatalog.length) {
        const pendingNavigation = pendingNavigationRestoreRef.current;
        const cachedWorkspace = resolveActiveWorkspace(
          cachedCatalog,
          pendingNavigation?.accessScope.kind === 'workspace'
            ? pendingNavigation.accessScope.clientId
            : activeNavigationSession?.routePlan.clientId || activeWorkspaceRef.current?.id,
          cachedWorkspaceContext?.activeWorkspaceId ||
            legacyRouteCache?.selectedClientId,
        );
        setAvailableWorkspaces(cachedCatalog);
        activeWorkspaceRef.current = pendingNavigation ? null : cachedWorkspace;
        setActiveWorkspace(pendingNavigation ? null : cachedWorkspace);
      }

      if (!online) {
        if (pendingNavigationRestoreRef.current) {
          setPendingNavigationRestoreStatus(
            networkStatus === 'checking' ? 'checking' : 'paused',
          );
          setSessionMessage(
            networkStatus === 'checking'
              ? 'Checking connection before restoring your saved route…'
              : 'Guidance paused until workspace access can be verified.',
          );
        }
        if (networkStatus === 'checking') {
          return;
        }
        setWorkspaceCatalogError(
          'Offline. Saved workspace data is available for review only.',
        );
        setWorkspaceAccessIssue('verification-unavailable');
        setWorkspaceCatalogLoading(false);
        workspaceCatalogBusyRef.current = false;
        workspaceForegroundRefreshPendingRef.current = false;
        workspaceCatalogRetryingRef.current = false;
        setWorkspaceCatalogRetrying(false);
        return;
      }

      try {
        if (!onlineRequestIsCurrent()) {
          return;
        }
        const pendingNavigationForAuthorization = pendingNavigationRestoreRef.current;
        let currentPrincipalId = principalId;
        if (!isPreviewAccessToken(accessToken)) {
          const currentUser = await getCurrentUser(accessToken);
          if (!onlineRequestIsCurrent()) {
            return;
          }
          currentPrincipalId = String(currentUser.id || '').trim();
          if (currentPrincipalId !== principalId) {
            await handleSessionExpired(
              'Workspace access belongs to another signed-in account. Sign in again.',
              accessToken,
              sessionEpochRef.current,
            );
            return;
          }
        }
        if (
          pendingNavigationForAuthorization?.accessScope.kind === 'workspace' &&
          isCurrentPendingNavigationRestore(
            pendingNavigationRestoreRef.current,
            pendingNavigationForAuthorization,
          ) &&
          currentPrincipalId !== pendingNavigationForAuthorization.accessScope.principalId
        ) {
          await handleSessionExpired(
            'Active guidance belongs to another signed-in account. Sign in and plot the route again.',
            accessToken,
            sessionEpochRef.current,
          );
          return;
        }

        const result = await fetchSavedRoutes(accessToken);
        if (!onlineRequestIsCurrent()) {
          return;
        }

        const authoritativeCatalogStoredAtMs = Date.now();
        const normalizedCatalog = normalizeWorkspaceCatalog(result.clients);
        const previousUnavailableWorkspaceIds = new Set(
          unavailableWorkspaceIdsRef.current,
        );
        const unavailableWorkspaceIds = reconcileUnavailableWorkspaceIds({
          allowFreshRestoration: allowFreshWorkspaceRestoration,
          freshWorkspaces: normalizedCatalog,
          unavailableWorkspaceIds: unavailableWorkspaceIdsRef.current,
        });
        const pendingNavigation = pendingNavigationRestoreRef.current;
        const currentNavigation = activeNavigationSessionRef.current;
        const currentPreview = selectedRouteRef.current;
        const authoritativelyUnavailableWorkspaceIds =
          findAuthoritativelyUnavailableWorkspaceIds({
            candidateWorkspaceIds: [
              pendingNavigation?.accessScope.kind === 'workspace'
                ? pendingNavigation.accessScope.clientId
                : null,
              currentNavigation?.routePlan.clientId,
              currentPreview?.clientId,
              activeWorkspaceRef.current?.id,
            ],
            freshWorkspaces: normalizedCatalog,
            knownWorkspaces: [
              ...cachedCatalog,
              ...availableWorkspacesRef.current,
            ],
          });
        for (const workspaceId of authoritativelyUnavailableWorkspaceIds) {
          unavailableWorkspaceIds.add(workspaceId);
        }
        const workspaceAccessRestored = findRestoredWorkspaceIds(
          previousUnavailableWorkspaceIds,
          unavailableWorkspaceIds,
        ).length > 0;
        const catalog = excludeUnavailableWorkspaces(
          normalizedCatalog,
          unavailableWorkspaceIds,
        );
        const stagedUnavailableWorkspaceIds = workspaceAccessRestored
          ? new Set([
              ...previousUnavailableWorkspaceIds,
              ...unavailableWorkspaceIds,
            ])
          : unavailableWorkspaceIds;
        const stagedCatalog = workspaceAccessRestored
          ? excludeUnavailableWorkspaces(
              normalizedCatalog,
              stagedUnavailableWorkspaceIds,
            )
          : catalog;
        freshWorkspaceAuthorizationRef.current = {
          principalId,
          workspaceIds: new Set(stagedCatalog.map((workspace) => workspace.id)),
        };
        const pendingNavigationWorkspaceId =
          pendingNavigation?.accessScope.kind === 'workspace'
            ? pendingNavigation.accessScope.clientId
            : '';
        const pendingNavigationWorkspace = findWorkspace(
          catalog,
          pendingNavigationWorkspaceId,
        );
        const navigationWorkspaceRevoked = currentNavigation
          ? !canRetainRouteWorkspace(
              stagedCatalog,
              currentNavigation.routeContext,
              currentNavigation.routePlan.clientId,
            )
          : false;
        const previewWorkspaceRevoked = currentPreview
          ? !canRetainRouteWorkspace(
              stagedCatalog,
              routePreviewSourceRef.current,
              currentPreview.clientId,
            )
          : false;
        const resolvedWorkspace = resolveActiveWorkspace(
          catalog,
          pendingNavigationWorkspace?.id ||
            currentNavigation?.routePlan.clientId ||
            activeWorkspaceRef.current?.id,
          result.selectedClientId,
        );
        const stagedResolvedWorkspace = workspaceAccessRestored
          ? resolveActiveWorkspace(
              stagedCatalog,
              activeWorkspaceRef.current?.id,
              result.selectedClientId,
            )
          : resolvedWorkspace;
        if (!onlineRequestIsCurrent()) {
          return;
        }

        // Publish fresh authorization immediately. If a later cache cleanup or
        // persistence write fails, stale workspace state must not remain usable.
        unavailableWorkspaceIdsRef.current = stagedUnavailableWorkspaceIds;
        availableWorkspacesRef.current = stagedCatalog;
        setAvailableWorkspaces(stagedCatalog);
        activeWorkspaceRef.current = stagedResolvedWorkspace;
        setActiveWorkspace(stagedResolvedWorkspace);
        // Replace any retained-cache deadline as soon as the owned full
        // catalog is published. Persistence failures below clear it again.
        setWorkspaceCatalogStoredAtMs(authoritativeCatalogStoredAtMs);
        setWorkspaceCatalogRetentionStoredAtMs(authoritativeCatalogStoredAtMs);
        if (previewWorkspaceRevoked && !navigationWorkspaceRevoked) {
          selectedRouteRef.current = null;
          setSelectedRoute(null);
        }
        if (navigationWorkspaceRevoked || previewWorkspaceRevoked) {
          setScreen((currentScreen) =>
            currentScreen === 'route-preview' ? 'guest-map' : currentScreen,
          );
        }
        const currentNavigationCleanup = navigationWorkspaceRevoked
          ? discardPersistedNavigation(
              'Active guidance ended because this workspace is no longer available.',
            )
          : Promise.resolve(true);
        const pendingNavigationRejected = Boolean(
          pendingNavigation && !pendingNavigationWorkspace,
        );
        const pendingNavigationCleanup = pendingNavigationRejected
          ? discardPersistedNavigation(
              'Active guidance could not be restored because its workspace is no longer available. Plot the route again.',
            )
          : Promise.resolve(true);
        const purgeStagedWorkspaceCaches = () =>
          Array.from(stagedUnavailableWorkspaceIds).map((workspaceId) =>
            () => clearOfflineWorkspaceProductCaches(principalId, workspaceId)
          );
        const workspaceRecoveryPersistence = (async () => {
          if (workspaceAccessRestored) {
            const stagedPersistence = await persistWorkspaceRecoveryWithEvidence(
              principalId,
              {
                activeWorkspaceId: stagedResolvedWorkspace?.id || null,
                unavailableWorkspaceIds: Array.from(stagedUnavailableWorkspaceIds),
                workspaces: stagedCatalog,
              },
              purgeStagedWorkspaceCaches(),
              {
                authoritativeCatalogStoredAtMs,
                fallbackUnavailableWorkspaceIds: stagedUnavailableWorkspaceIds,
              },
              'catalog-restoration-staged',
            );
            if (stagedPersistence !== 'persisted') {
              return stagedPersistence;
            }
          }

          return persistWorkspaceRecoveryWithEvidence(
            principalId,
            {
              activeWorkspaceId: resolvedWorkspace?.id || null,
              unavailableWorkspaceIds: Array.from(unavailableWorkspaceIds),
              workspaces: catalog,
            },
            purgeStagedWorkspaceCaches(),
            {
              authoritativeCatalogStoredAtMs,
              fallbackUnavailableWorkspaceIds: stagedUnavailableWorkspaceIds,
              requireFallback: workspaceAccessRestored,
            },
            workspaceAccessRestored
              ? 'catalog-restoration-final'
              : 'catalog-reconciliation',
          );
        })();
        const [, , recoveryPersistence] = await Promise.all([
          currentNavigationCleanup,
          pendingNavigationCleanup,
          workspaceRecoveryPersistence,
        ]);
        if (!onlineRequestIsCurrent()) {
          return;
        }
        if (workspaceAccessRestored && recoveryPersistence !== 'persisted') {
          setWorkspaceCatalogStoredAtMs(null);
          setWorkspaceCatalogRetentionStoredAtMs(null);
          automaticReconnectAnnouncementPendingRef.current = false;
          restoreUnavailableWorkspacesFromFreshCatalogRef.current = false;
          if (recoveryPersistence === 'failed') {
            freshWorkspaceAuthorizationRef.current = {
              principalId,
              workspaceIds: new Set<string>(),
            };
          }
          if (pendingNavigation) {
            setPendingNavigationRestoreStatus('paused');
          }
          setWorkspaceCatalogError('Offline workspace cleanup needs retry.');
          setWorkspaceAccessIssue('offline-safety');
          setSessionMessage(
            'Workspace access could not be restored safely. Retry access.',
          );
          return;
        }
        if (workspaceAccessRestored) {
          unavailableWorkspaceIdsRef.current = unavailableWorkspaceIds;
          availableWorkspacesRef.current = catalog;
          setAvailableWorkspaces(catalog);
          activeWorkspaceRef.current = resolvedWorkspace;
          setActiveWorkspace(resolvedWorkspace);
          freshWorkspaceAuthorizationRef.current = {
            principalId,
            workspaceIds: new Set(catalog.map((workspace) => workspace.id)),
          };
        }
        if (recoveryPersistence === 'failed') {
          setWorkspaceCatalogStoredAtMs(null);
          setWorkspaceCatalogRetentionStoredAtMs(null);
          automaticReconnectAnnouncementPendingRef.current = false;
          freshWorkspaceAuthorizationRef.current = {
            principalId,
            workspaceIds: new Set<string>(),
          };
          setWorkspaceCatalogError('Offline workspace cleanup needs retry.');
          setWorkspaceAccessIssue('offline-safety');
          setSessionMessage(
            'Workspace access refreshed, but offline safety needs retry before another route.',
          );
          return;
        }
        if (recoveryPersistence === 'revoked') {
          setWorkspaceCatalogStoredAtMs(null);
          setWorkspaceCatalogRetentionStoredAtMs(null);
          setNetworkAuthorizationReady(false);
          setWorkspaceCatalogError('Offline workspace access stays locked until retry.');
          setWorkspaceAccessIssue('offline-safety');
        } else {
          setWorkspaceCatalogStoredAtMs(authoritativeCatalogStoredAtMs);
          setWorkspaceCatalogRetentionStoredAtMs(authoritativeCatalogStoredAtMs);
          setNetworkAuthorizationReady(true);
          if (!workspaceWasBackgroundedRef.current) {
            workspaceForegroundAuthorizationPausedRef.current = false;
            setWorkspaceForegroundAuthorizationPaused(false);
          }
          setWorkspaceAccessIssue('none');
        }
        // End clears the pending ref before native and durable cleanup settle.
        // Re-resolve after catalog persistence so a late response cannot reopen
        // that explicitly ended journey or replace its completion message.
        const pendingNavigationResolution = resolvePendingNavigationRestore({
          candidate: pendingNavigationForAuthorization,
          current: pendingNavigationRestoreRef.current,
        });
        let navigationRestoreRejected =
          pendingNavigationRejected || pendingNavigationResolution === 'stale';
        if (previewWorkspaceRevoked && !navigationWorkspaceRevoked) {
          setSessionMessage(
            'This route closed because its workspace is no longer available.',
          );
        } else if (
          authoritativelyUnavailableWorkspaceIds.length > 0 &&
          !navigationWorkspaceRevoked
        ) {
          setSessionMessage(
            'Workspace access changed. Unavailable workspace data was removed.',
          );
        }
        restoreUnavailableWorkspacesFromFreshCatalogRef.current = false;
        if (
          pendingNavigation &&
          pendingNavigationWorkspace &&
          pendingNavigationResolution === 'resume'
        ) {
          if (!openActiveNavigationSession(
            pendingNavigation,
            true,
            resolvedWorkspace?.id,
            principalId,
          )) {
            navigationRestoreRejected = true;
            await discardPersistedNavigation(
              'Active guidance could not be restored safely. Plot the route again.',
            );
          } else {
            setSessionMessage('');
          }
        }
        if (
          catalogRetryWasRequested &&
          recoveryPersistence === 'persisted' &&
          !navigationRestoreRejected
        ) {
          const confirmation = workspaceAccessRestored
            ? 'Workspace access refreshed.'
            : 'Workspace access verified.';
          const workspaceAccessRefreshWillRemain = shouldOfferWorkspaceAccessRefresh({
            accessRecoveryPending: unavailableWorkspaceIds.size > 0,
            authenticated: true,
            availableWorkspaceCount: catalog.length,
            catalogLoading: false,
            catalogRetrying: false,
            issue: 'none',
          });
          setSessionMessage(confirmation);
          if (Platform.OS === 'ios' && !workspaceAccessRefreshWillRemain) {
            void workspaceAccessFocusHandoffRef.current?.request(
              confirmation,
              () => workspaceAccessFocusTargetRef.current,
            );
          } else {
            AccessibilityInfo.announceForAccessibilityWithOptions(confirmation, {
              queue: true,
            });
          }
        }
        if (!catalogRetryWasRequested) {
          const automaticReconnectCompleted =
            automaticReconnectAnnouncementPendingRef.current &&
            recoveryPersistence === 'persisted' &&
            !navigationRestoreRejected &&
            catalog.length > 0;
          automaticReconnectAnnouncementPendingRef.current = false;
          if (automaticReconnectCompleted) {
            AccessibilityInfo.announceForAccessibilityWithOptions(
              'Connection restored. Workspace access verified.',
              { queue: true },
            );
          }
        }
      } catch (error) {
        if (!onlineRequestIsCurrent()) {
          return;
        }
        if (workspaceForegroundRefreshPendingRef.current) {
          freshWorkspaceAuthorizationRef.current = {
            principalId,
            workspaceIds: new Set<string>(),
          };
        }
        setNetworkAuthorizationReady(false);
        automaticReconnectAnnouncementPendingRef.current = false;
        restoreUnavailableWorkspacesFromFreshCatalogRef.current = false;
        if (error instanceof ApiSessionExpiredError) {
          void handleSessionExpired(error.message);
          return;
        }
        if (pendingNavigationRestoreRef.current) {
          setPendingNavigationRestoreStatus('paused');
          setSessionMessage(
            'Guidance paused until workspace access can be verified.',
          );
        }
        setWorkspaceCatalogError('Workspaces could not be loaded. Retry.');
        setWorkspaceAccessIssue('verification-unavailable');
      } finally {
        if (revision === workspaceRequestRevisionRef.current) {
          setWorkspaceCatalogLoading(false);
          workspaceCatalogBusyRef.current = false;
          workspaceForegroundRefreshPendingRef.current = false;
          workspaceCatalogRetryingRef.current = false;
          setWorkspaceCatalogRetrying(false);
        }
      }
    };

    void discoverWorkspaces();

    return () => {
      workspaceRequestRevisionRef.current += 1;
    };
  }, [authenticated, session?.accessToken, workspaceDiscoveryRevision]);

  const beginWorkspaceCatalogRetry = useCallback((replaceInFlight: boolean) => {
    if (
      workspaceSelectionPendingRef.current ||
      pendingWorkspaceHandoffRef.current
    ) {
      workspaceCatalogRefreshDeferredRef.current = true;
      restoreUnavailableWorkspacesFromFreshCatalogRef.current = true;
      return false;
    }
    if (
      !replaceInFlight &&
      (
        workspaceCatalogRetryingRef.current ||
        workspaceCatalogBusyRef.current
      )
    ) {
      return false;
    }
    workspaceAccessFocusHandoffRef.current?.cancel();
    automaticReconnectAnnouncementPendingRef.current = false;
    workspaceCatalogRetryingRef.current = true;
    workspaceCatalogBusyRef.current = true;
    if (pendingNavigationRestoreRef.current) {
      setPendingNavigationRestoreStatus('checking');
      setSessionMessage('Restoring your saved route…');
    }
    restoreUnavailableWorkspacesFromFreshCatalogRef.current = true;
    setWorkspaceCatalogRetrying(true);
    setWorkspaceDiscoveryRevision((revision) => revision + 1);
    return true;
  }, []);

  const handleRetryWorkspaceCatalog = useCallback(() => {
    beginWorkspaceCatalogRetry(false);
  }, [beginWorkspaceCatalogRetry]);

  const handleNetworkReconnectWorkspaceCatalog = useCallback(() => {
    beginWorkspaceCatalogRetry(true);
  }, [beginWorkspaceCatalogRetry]);

  const previousNetworkStatusRef = useRef(networkStatus);
  useEffect(() => {
    const previous = previousNetworkStatusRef.current;
    previousNetworkStatusRef.current = networkStatus;
    const reconnect = resolveNetworkReconnectTransition({
      current: networkStatus,
      offlineObserved: offlineNetworkObservedRef.current,
      previous,
    });
    offlineNetworkObservedRef.current = reconnect.offlineObserved;
    if (!authenticated || networkStatus === 'checking') {
      automaticReconnectAnnouncementPendingRef.current =
        shouldArmAutomaticReconnectAnnouncement({
          authenticated,
          networkStatus,
          offlineObserved: reconnect.offlineObserved,
        });
    }
    if (previous === networkStatus) {
      return;
    }
    if (networkStatus === 'checking') {
      return;
    }
    if (
      networkStatus === 'online' &&
      workspaceWasBackgroundedRef.current &&
      AppState.currentState === 'active'
    ) {
      requestWorkspaceForegroundRevalidation('active');
      return;
    }
    if (
      reconnect.retry &&
      pendingNavigationRestore?.status === 'paused'
    ) {
      handleNetworkReconnectWorkspaceCatalog();
      return;
    }
    if (
      workspaceSelectionPendingRef.current ||
      pendingWorkspaceHandoffRef.current
    ) {
      workspaceCatalogRefreshDeferredRef.current = true;
      return;
    }
    workspaceCatalogBusyRef.current = true;
    setWorkspaceCatalogLoading(true);
    setWorkspaceDiscoveryRevision((revision) => revision + 1);
  }, [
    handleNetworkReconnectWorkspaceCatalog,
    authenticated,
    networkStatus,
    pendingNavigationRestore?.status,
    requestWorkspaceForegroundRevalidation,
  ]);

  const handleActiveWorkspaceChange = useCallback((
    workspace: SafeRouteWorkspace | null,
    {
      completedRouteHandoff = false,
    }: {
      completedRouteHandoff?: boolean;
    } = {},
  ) => {
    const requestedTarget = workspace
      ? findWorkspace(availableWorkspacesRef.current, workspace.id)
      : null;
    const retryingVisibleWorkspace =
      Boolean(requestedTarget) &&
      requestedTarget?.id === activeWorkspaceRef.current?.id &&
      workspaceSelectionStatus === 'failed';
    if (
      requestedTarget &&
      requestedTarget.id === activeWorkspaceRef.current?.id &&
      !retryingVisibleWorkspace
    ) {
      return;
    }
    if (
      !requestedTarget ||
      workspaceCatalogBusyRef.current ||
      workspaceCatalogRetryingRef.current ||
      workspaceForegroundRefreshPendingRef.current ||
      unavailableWorkspaceIdsRef.current.has(requestedTarget.id) ||
      workspaceHandoffPendingRef.current ||
      workspaceSelectionPendingRef.current ||
      pendingNavigationRestoreRef.current ||
      activeNavigationSessionRef.current ||
      navigationCleanupRequiredRef.current ||
      navigationCleanupPromiseRef.current
    ) {
      return;
    }

    const requestRevision = workspaceSelectionRequestRevisionRef.current + 1;
    workspaceSelectionRequestRevisionRef.current = requestRevision;
    workspaceSelectionPendingRef.current = true;
    const requestedPrincipalId = activeSessionPrincipalIdRef.current;
    const requestedSessionEpoch = sessionEpochRef.current;
    const requestedWorkspaceRequestRevision = workspaceRequestRevisionRef.current;
    const requestedSourceWorkspaceId = activeWorkspaceRef.current?.id || null;
    const requestedSourceWorkspaceName = activeWorkspaceRef.current?.name || '';
    const requestedTargetWorkspaceId = requestedTarget.id;
    const requestedCatalog = [...availableWorkspacesRef.current];
    const requestedUnavailableWorkspaceIds = Array.from(
      unavailableWorkspaceIdsRef.current,
    );
    const savingMessage = `Saving workspace ${requestedTarget.name}…`;
    const requestOwnerIsCurrent = () =>
      requestRevision === workspaceSelectionRequestRevisionRef.current &&
      requestedPrincipalId === activeSessionPrincipalIdRef.current &&
      requestedSessionEpoch === sessionEpochRef.current;
    const resolveCurrentTarget = () => {
      if (
        workspaceHandoffPendingRef.current ||
        workspaceCatalogBusyRef.current ||
        workspaceCatalogRetryingRef.current ||
        workspaceForegroundRefreshPendingRef.current ||
        navigationCleanupRequiredRef.current ||
        navigationCleanupPromiseRef.current ||
        unavailableWorkspaceIdsRef.current.has(requestedTargetWorkspaceId)
      ) {
        return null;
      }
      return resolveEndRouteWorkspaceChangeTarget({
        availableWorkspaces: availableWorkspacesRef.current,
        currentPrincipalId: activeSessionPrincipalIdRef.current,
        currentSessionEpoch: sessionEpochRef.current,
        currentSourceWorkspaceId: activeWorkspaceRef.current?.id || null,
        currentWorkspaceRequestRevision: workspaceRequestRevisionRef.current,
        hasActiveNavigation: Boolean(activeNavigationSessionRef.current),
        hasPendingNavigation: Boolean(pendingNavigationRestoreRef.current),
        allowSameSourceTarget: retryingVisibleWorkspace,
        requestedPrincipalId,
        requestedSessionEpoch,
        requestedSourceWorkspaceId,
        requestedTargetWorkspaceId,
        requestedWorkspaceRequestRevision,
      });
    };
    setWorkspaceSelectionStatus('saving');
    workspaceSelectionSavingMessageRef.current = savingMessage;
    setSessionMessage(savingMessage);
    void (async () => {
      let selectionStatus: WorkspaceSelectionStatus = 'idle';
      let outcomePublished = false;
      const reconcileVisibleSelection = async () => {
        const requestStillOwnsPrincipal = requestOwnerIsCurrent();
        const visibleWorkspace = requestStillOwnsPrincipal
          ? activeWorkspaceRef.current
          : findWorkspace(requestedCatalog, requestedSourceWorkspaceId);
        const reconciliationCatalog = requestStillOwnsPrincipal
          ? availableWorkspacesRef.current
          : requestedCatalog;
        const unavailableWorkspaceIds = requestStillOwnsPrincipal
          ? Array.from(unavailableWorkspaceIdsRef.current)
          : requestedUnavailableWorkspaceIds;
        return reconcileOfflineReviewWorkspaceSelection(
          requestedPrincipalId,
          {
            activeWorkspaceId: visibleWorkspace?.id || null,
            unavailableWorkspaceIds,
            workspaces: reconciliationCatalog,
          },
        );
      };
      const publishStorageFailure = () => {
        outcomePublished = true;
        selectionStatus = 'failed';
        setNetworkAuthorizationReady(false);
        setWorkspaceCatalogError('Offline workspace storage needs retry.');
        setWorkspaceAccessIssue('offline-safety');
        const failure =
          'Workspace storage could not be verified. Refresh workspace access before continuing.';
        setSessionMessage(failure);
        if (Platform.OS === 'ios') {
          void workspaceAccessFocusHandoffRef.current?.request(
            failure,
            () => workspaceAccessFocusTargetRef.current,
          );
        } else {
          AccessibilityInfo.announceForAccessibilityWithOptions(failure, {
            queue: true,
          });
        }
      };
      const publishSelectionFailure = () => {
        outcomePublished = true;
        selectionStatus = 'failed';
        const failure = requestedSourceWorkspaceName
          ? `Workspace unchanged. Still using ${requestedSourceWorkspaceName} because ${requestedTarget.name} could not be saved. Choose a workspace again.`
          : `Workspace not selected. ${requestedTarget.name} could not be saved. Choose a workspace again.`;
        setSessionMessage(failure);
        if (Platform.OS === 'ios') {
          void workspaceAccessFocusHandoffRef.current?.request(
            failure,
            () => workspaceAccessFocusTargetRef.current,
          );
        } else {
          AccessibilityInfo.announceForAccessibilityWithOptions(
            failure,
            { queue: true },
          );
        }
      };
      try {
        const persistedSelection = await persistOfflineReviewWorkspaceSelection(
          requestedPrincipalId,
          requestedTargetWorkspaceId,
        );
        const persistedTarget =
          persistedSelection?.activeWorkspaceId === requestedTargetWorkspaceId
            ? resolveCurrentTarget()
            : null;
        if (!persistedTarget) {
          const reconciliation = await reconcileVisibleSelection();
          if (requestOwnerIsCurrent()) {
            if (reconciliation !== 'persisted') {
              publishStorageFailure();
            } else if (
              persistedSelection?.activeWorkspaceId !== requestedTargetWorkspaceId &&
              resolveCurrentTarget()
            ) {
              publishSelectionFailure();
            }
          }
          return;
        }

        activeWorkspaceRef.current = persistedTarget;
        setActiveWorkspace(persistedTarget);
        outcomePublished = true;
        const confirmation = completedRouteHandoff
          ? `Route ended. Workspace changed to ${persistedTarget.name}.`
          : retryingVisibleWorkspace
            ? `Workspace remains ${persistedTarget.name}.`
            : `Workspace changed to ${persistedTarget.name}.`;
        setSessionMessage(confirmation);
        if (Platform.OS === 'ios') {
          void workspaceAccessFocusHandoffRef.current?.request(
            confirmation,
            () => workspaceAccessFocusTargetRef.current,
          );
        } else {
          AccessibilityInfo.announceForAccessibilityWithOptions(
            confirmation,
            { queue: true },
          );
        }
      } catch {
        const reconciliation = await reconcileVisibleSelection();
        if (requestOwnerIsCurrent()) {
          if (reconciliation === 'persisted' && resolveCurrentTarget()) {
            publishSelectionFailure();
          } else if (reconciliation !== 'persisted') {
            publishStorageFailure();
          }
        }
      } finally {
        if (requestRevision === workspaceSelectionRequestRevisionRef.current) {
          const requestStillOwnsSelection = requestOwnerIsCurrent();
          const uiRequestOwnerIsCurrent =
            requestStillOwnsSelection &&
            requestedSourceWorkspaceId ===
              (activeWorkspaceRef.current?.id || null);
          workspaceSelectionPendingRef.current = false;
          workspaceSelectionSavingMessageRef.current = null;
          setWorkspaceSelectionStatus(selectionStatus);
          if (!outcomePublished && uiRequestOwnerIsCurrent) {
            const visibleWorkspaceName =
              activeWorkspaceRef.current?.name || '';
            const stoppedMessage = visibleWorkspaceName
              ? `Workspace change stopped. Still using ${visibleWorkspaceName}.`
              : 'Workspace change stopped. Choose a workspace again.';
            setSessionMessage((currentMessage) =>
              currentMessage === savingMessage ? stoppedMessage : currentMessage,
            );
          } else if (!outcomePublished) {
            setSessionMessage((currentMessage) =>
              currentMessage === savingMessage ? '' : currentMessage,
            );
          }
          const deferredRefreshResolution =
            resolveDeferredWorkspaceRefreshAfterSelection({
              refreshDeferred:
                workspaceCatalogRefreshDeferredRef.current,
              requestOwnerIsCurrent: requestStillOwnsSelection,
            });
          if (deferredRefreshResolution === 'resume') {
            resumeDeferredWorkspaceCatalogRefresh();
          } else if (deferredRefreshResolution === 'discard') {
            workspaceCatalogRefreshDeferredRef.current = false;
            workspaceForegroundRefreshDeferredRef.current = false;
          }
        }
      }
    })();
  }, [workspaceSelectionStatus]);

  const continuePendingWorkspaceHandoff = useCallback((
    request: PendingWorkspaceHandoff,
  ) => {
    if (pendingWorkspaceHandoffRef.current !== request) {
      return;
    }
    const requestOwnerIsCurrent =
      request.requestedPrincipalId === activeSessionPrincipalIdRef.current &&
      request.requestedSessionEpoch === sessionEpochRef.current;
    const decision = resolvePendingWorkspaceHandoffDecision(request);
    if (decision.status === 'deferred') {
      workspaceHandoffPendingRef.current = true;
      setWorkspaceHandoffPending(true);
      setPendingWorkspaceHandoffTargetName(decision.target.name);
      setSessionMessage(
        `Route ended. Waiting for workspace access before changing to ${decision.target.name}.`,
      );
      return;
    }

    clearPendingWorkspaceHandoff(request);
    if (decision.status === 'stale') {
      if (requestOwnerIsCurrent) {
        const stoppedMessage =
          `Route ended, but the change to ${request.requestedTargetName} stopped because workspace access changed. Choose a workspace again.`;
        setSessionMessage(stoppedMessage);
        if (Platform.OS === 'ios') {
          void workspaceAccessFocusHandoffRef.current?.request(
            stoppedMessage,
            () => workspaceAccessFocusTargetRef.current,
          );
        } else {
          AccessibilityInfo.announceForAccessibilityWithOptions(
            stoppedMessage,
            { queue: true },
          );
        }
        resumeDeferredWorkspaceCatalogRefresh();
      }
      return;
    }

    workspaceHandoffPendingRef.current = false;
    setWorkspaceHandoffPending(false);
    handleActiveWorkspaceChange(decision.target, {
      completedRouteHandoff: true,
    });
  }, [handleActiveWorkspaceChange]);

  useEffect(() => {
    const pendingHandoff = pendingWorkspaceHandoffRef.current;
    if (
      !pendingHandoff ||
      navigationCleanupStatus !== 'idle' ||
      workspaceCatalogLoading ||
      workspaceCatalogRetrying ||
      workspaceSelectionStatus === 'saving'
    ) {
      return;
    }
    continuePendingWorkspaceHandoff(pendingHandoff);
  }, [
    continuePendingWorkspaceHandoff,
    navigationCleanupStatus,
    workspaceCatalogLoading,
    workspaceCatalogRetrying,
    workspaceSelectionStatus,
  ]);

  const handleGuardedWorkspaceChange = useCallback((workspace: SafeRouteWorkspace) => {
    if (
      workspaceHandoffPendingRef.current ||
      workspaceCatalogBusyRef.current ||
      workspaceCatalogRetryingRef.current ||
      workspaceForegroundRefreshPendingRef.current
    ) {
      return;
    }
    const requestedNavigation =
      pendingNavigationRestoreRef.current ||
      activeNavigationSessionRef.current;
    if (!requestedNavigation) {
      handleActiveWorkspaceChange(workspace);
      return;
    }

    const requestedTarget = findWorkspace(
      availableWorkspacesRef.current,
      workspace.id,
    );
    const requestedSource = activeWorkspaceRef.current;
    if (!requestedTarget) {
      return;
    }
    const requestedRouteWorkspaceId =
      requestedNavigation.accessScope.kind === 'workspace'
        ? requestedNavigation.accessScope.clientId
        : requestedNavigation.routePlan.clientId;
    const requestedRouteWorkspace = findWorkspace(
      availableWorkspacesRef.current,
      requestedRouteWorkspaceId,
    );
    if (
      requestedTarget.id ===
      (requestedSource?.id || requestedRouteWorkspace?.id)
    ) {
      return;
    }

    const requestedPrincipalId = activeSessionPrincipalIdRef.current;
    const requestedSessionEpoch = sessionEpochRef.current;
    const requestedWorkspaceRequestRevision = workspaceRequestRevisionRef.current;
    const requestedSourceWorkspaceId = requestedSource?.id || null;
    const requestedTargetWorkspaceId = requestedTarget.id;
    const routeName = requestedNavigation.routePlan.name.trim() || 'Active route';
    const requestedSourceName =
      requestedSource?.name ||
      requestedRouteWorkspace?.name ||
      'the current route workspace';
    const requestOwnerIsCurrent = () =>
      requestedPrincipalId === activeSessionPrincipalIdRef.current &&
      requestedSessionEpoch === sessionEpochRef.current;
    const requestIsCurrentBeforeCleanup = () =>
      requestOwnerIsCurrent() &&
      requestedWorkspaceRequestRevision === workspaceRequestRevisionRef.current &&
      requestedSourceWorkspaceId === (activeWorkspaceRef.current?.id || null) &&
      Boolean(
        findWorkspace(
          availableWorkspacesRef.current,
          requestedTargetWorkspaceId,
        ),
      ) &&
      isCurrentPendingNavigationRestore(
        pendingNavigationRestoreRef.current ||
          activeNavigationSessionRef.current,
        requestedNavigation,
      );
    const handoffRequest: PendingWorkspaceHandoff = {
      evidenceSession: requestedNavigation,
      requestedPrincipalId,
      requestedSessionEpoch,
      requestedSourceWorkspaceId,
      requestedTargetName: requestedTarget.name,
      requestedTargetWorkspaceId,
      requestedWorkspaceRequestRevision,
    };

    Alert.alert(
      'End route and change workspace?',
      `End ${routeName} in ${requestedSourceName}, then change to ${requestedTarget.name}. Guidance and background tracking will stop.`,
      [
        {
          onPress: () => {
            if (!requestIsCurrentBeforeCleanup()) {
              return;
            }
            const confirmation =
              `Keeping ${routeName}. Workspace remains ${requestedSourceName}.`;
            if (Platform.OS === 'ios') {
              void workspaceAccessFocusHandoffRef.current?.request(
                confirmation,
                () => workspaceAccessFocusTargetRef.current,
              );
            } else {
              AccessibilityInfo.announceForAccessibilityWithOptions(
                confirmation,
                { queue: true },
              );
            }
          },
          style: 'cancel',
          text: 'Keep route',
        },
        {
          onPress: () => {
            void (async () => {
              if (
                workspaceHandoffPendingRef.current ||
                !requestIsCurrentBeforeCleanup()
              ) {
                return;
              }
              workspaceHandoffPendingRef.current = true;
              setWorkspaceHandoffPending(true);
              pendingWorkspaceHandoffRef.current = handoffRequest;
              setPendingWorkspaceHandoffTargetName(requestedTarget.name);
              try {
                const cleanupSucceeded = await discardPersistedNavigation(undefined, {
                  evidenceSession: requestedNavigation,
                  publishCleanupFailure: false,
                });
                if (!cleanupSucceeded) {
                  const retainedDecision =
                    pendingWorkspaceHandoffRef.current === handoffRequest
                      ? resolvePendingWorkspaceHandoffDecision(handoffRequest)
                      : null;
                  if (retainedDecision?.target) {
                    setSessionMessage(
                      `Saved guidance could not be removed. Retry cleanup to finish changing to ${retainedDecision.target.name}.`,
                    );
                  } else {
                    clearPendingWorkspaceHandoff(handoffRequest);
                    if (requestOwnerIsCurrent()) {
                      setSessionMessage(
                        'Saved guidance could not be removed. Workspace access changed; finish cleanup, then choose a workspace again.',
                      );
                    }
                  }
                  return;
                }
                continuePendingWorkspaceHandoff(handoffRequest);
              } finally {
                const continuationStillPending =
                  pendingWorkspaceHandoffRef.current === handoffRequest &&
                  !navigationCleanupRequiredRef.current;
                workspaceHandoffPendingRef.current = continuationStillPending;
                setWorkspaceHandoffPending(continuationStillPending);
              }
            })();
          },
          style: 'destructive',
          text: 'End route and change workspace',
        },
      ],
    );
  }, [continuePendingWorkspaceHandoff, handleActiveWorkspaceChange]);

  const handleWorkspaceUnavailable = useCallback(async (
    workspaceId: string,
    freshWorkspaces?: SafeRouteWorkspace[],
  ) => {
    const normalizedWorkspaceId = workspaceId.trim();
    const recoveryAccessToken = activeSessionTokenRef.current;
    const recoveryPrincipalId = activeSessionPrincipalIdRef.current;
    const recoverySessionEpoch = sessionEpochRef.current;
    const recoveryIsCurrent = () =>
      activeSessionTokenRef.current === recoveryAccessToken &&
      activeSessionPrincipalIdRef.current === recoveryPrincipalId &&
      sessionEpochRef.current === recoverySessionEpoch;
    const freshCatalog = freshWorkspaces
      ? normalizeWorkspaceCatalog(freshWorkspaces)
      : null;
    const authoritativeCatalogStoredAtMs = freshCatalog ? Date.now() : undefined;
    const currentNavigation = activeNavigationSessionRef.current;
    const currentPreview = selectedRouteRef.current;
    const freshRecovery = freshCatalog
      ? resolveFreshWorkspaceAccessRecovery({
          activeWorkspaceId: activeWorkspaceRef.current?.id,
          candidateWorkspaceIds: [
            currentNavigation?.routePlan.clientId,
            currentPreview?.clientId,
            activeWorkspaceRef.current?.id,
            ...freshWorkspaceAuthorizationRef.current.workspaceIds,
          ],
          freshWorkspaces: freshCatalog,
          knownWorkspaces: availableWorkspacesRef.current,
          unavailableWorkspaceId: normalizedWorkspaceId,
          unavailableWorkspaceIds: unavailableWorkspaceIdsRef.current,
        })
      : null;
    const recovery = freshRecovery || resolveWorkspaceAccessRecovery(
      availableWorkspacesRef.current,
      activeWorkspaceRef.current?.id,
      normalizedWorkspaceId,
    );
    if (recovery.status === 'ignored') {
      return;
    }

    const unavailableWorkspace = activeWorkspaceRef.current;
    const principalId = recoveryPrincipalId;
    restoreUnavailableWorkspacesFromFreshCatalogRef.current = false;
    if (!freshCatalog) {
      // A scoped denial is authoritative only for the requested workspace.
      // Hold every other protected surface until the owned principal and full
      // catalog have completed, rather than reusing pre-denial freshness.
      setNetworkAuthorizationReady(false);
    }
    unavailableWorkspaceIdsRef.current = freshRecovery?.status === 'recovered'
      ? freshRecovery.unavailableWorkspaceIds
      : new Set([
          ...unavailableWorkspaceIdsRef.current,
          normalizedWorkspaceId,
        ]);
    if (freshCatalog) {
      freshWorkspaceAuthorizationRef.current = {
        principalId,
        workspaceIds: new Set(recovery.workspaces.map((workspace) => workspace.id)),
      };
    } else {
      freshWorkspaceAuthorizationRef.current.workspaceIds.delete(normalizedWorkspaceId);
    }
    completeWorkspaceCatalogRetry(
      workspaceCatalogRetryingRef,
      setWorkspaceCatalogRetrying,
    );
    workspaceRequestRevisionRef.current += 1;
    availableWorkspacesRef.current = recovery.workspaces;
    setAvailableWorkspaces(recovery.workspaces);
    activeWorkspaceRef.current = recovery.activeWorkspace;
    setActiveWorkspace(recovery.activeWorkspace);
    setWorkspaceCatalogError('');
    setWorkspaceAccessIssue('none');
    setWorkspaceCatalogLoading(!freshCatalog);

    const { navigationUnavailable, previewUnavailable } =
      resolveWorkspaceSurfaceClosure({
        navigationWorkspaceId: currentNavigation?.routePlan.clientId,
        previewWorkspaceId: currentPreview?.clientId,
        unavailableWorkspaceIds: unavailableWorkspaceIdsRef.current,
      });
    const navigationCleanup = navigationUnavailable
      ? discardPersistedNavigation(
          'Active guidance ended because this workspace is no longer available.',
        )
      : Promise.resolve(true);
    if (previewUnavailable) {
      selectedRouteRef.current = null;
      setSelectedRoute(null);
      setScreen((currentScreen) =>
        currentScreen === 'route-preview' ? 'guest-map' : currentScreen,
      );
    }

    const workspaceName = unavailableWorkspace?.name || 'This workspace';
    setSessionMessage(
      navigationUnavailable
        ? 'Active guidance ended because this workspace is no longer available.'
        : previewUnavailable
          ? 'This route closed because its workspace is no longer available.'
          : recovery.activeWorkspace
            ? `${workspaceName} is no longer available. Switched to ${recovery.activeWorkspace.name}.`
            : recovery.workspaces.length
              ? `${workspaceName} is no longer available. Choose an available workspace to continue.`
              : `${workspaceName} is no longer available. No workspace access remains for this account.`,
    );

    if (!freshCatalog) {
      setWorkspaceDiscoveryRevision((revision) => revision + 1);
    }
    const [, workspaceRecoveryPersistence] = await Promise.all([
      navigationCleanup,
      persistWorkspaceRecoveryWithEvidence(
        principalId,
        {
          activeWorkspaceId: recovery.activeWorkspace?.id || null,
          unavailableWorkspaceIds: Array.from(unavailableWorkspaceIdsRef.current),
          workspaces: recovery.workspaces,
        },
        Array.from(unavailableWorkspaceIdsRef.current).map((workspaceId) =>
          () => clearOfflineWorkspaceProductCaches(principalId, workspaceId)
        ),
        { authoritativeCatalogStoredAtMs },
        'workspace-access-loss',
      ),
    ]);
    if (!recoveryIsCurrent()) {
      return;
    }
    if (freshCatalog) {
      if (workspaceRecoveryPersistence === 'persisted') {
        setWorkspaceCatalogStoredAtMs(authoritativeCatalogStoredAtMs || null);
        setWorkspaceCatalogRetentionStoredAtMs(
          authoritativeCatalogStoredAtMs || null,
        );
      } else {
        setWorkspaceCatalogStoredAtMs(null);
        setWorkspaceCatalogRetentionStoredAtMs(null);
      }
    }
    if (workspaceRecoveryPersistence === 'failed') {
      freshWorkspaceAuthorizationRef.current = {
        principalId,
        workspaceIds: new Set<string>(),
      };
      setWorkspaceCatalogError('Offline workspace cleanup needs retry.');
      setWorkspaceAccessIssue('offline-safety');
      setSessionMessage(
        'Workspace access closed. Retry access before starting another route.',
      );
    }
  }, []);

  const handleNavigationSessionChange = useCallback((nextSession: ActiveNavigationSession | null) => {
    if (!nextSession) {
      void discardPersistedNavigation();
      return true;
    }

    const workspaceId = nextSession.accessScope.kind === 'workspace'
      ? nextSession.accessScope.clientId
      : '';
    const sessionAuthenticated = Boolean(activeSessionTokenRef.current?.trim());
    const continuesCurrentWorkspaceNavigation =
      isCurrentWorkspaceNavigationContinuation(
        activeNavigationSessionRef.current,
        nextSession,
      );
    if (
      navigationCleanupRequiredRef.current ||
      Boolean(pendingNavigationRestoreRef.current) ||
      workspaceSelectionPendingRef.current ||
      !canResumeActiveNavigationSession(
        nextSession,
        sessionAuthenticated,
        activeWorkspaceRef.current?.id,
        activeSessionPrincipalIdRef.current,
      ) ||
      (workspaceId &&
        !freshWorkspaceAuthorizationRef.current.workspaceIds.has(workspaceId) &&
        !continuesCurrentWorkspaceNavigation) ||
      (workspaceId && unavailableWorkspaceIdsRef.current.has(workspaceId))
    ) {
      return false;
    }

    workspaceSelectionRequestRevisionRef.current += 1;
    workspaceSelectionPendingRef.current = false;
    setWorkspaceSelectionStatus('idle');
    activeNavigationSessionRef.current = nextSession;
    setActiveNavigationSession(nextSession);
    return true;
  }, []);

  const handleAuthorizeNavigationStart = async (routePlan: SavedSafeRoutePlan) => {
    const workspaceId = routePlan.clientId?.trim() || '';
    if (!workspaceId) {
      return null;
    }
    if (workspaceSelectionPendingRef.current) {
      return 'Wait for the workspace change before starting guidance.';
    }
    if (networkStatusRef.current !== 'online') {
      return networkStatusRef.current === 'checking'
        ? 'SafeRoute is checking the connection. Wait before starting guidance.'
        : 'Reconnect before starting guidance.';
    }
    if (
      workspaceForegroundAuthorizationPausedRef.current ||
      workspaceForegroundRefreshPendingRef.current
    ) {
      return 'Workspace access is being checked. Wait before starting guidance.';
    }

    const accessToken = activeSessionTokenRef.current?.trim() || '';
    const principalId = activeSessionPrincipalIdRef.current.trim();
    const request = {
      accessToken,
      principalId,
      routePlan,
      routePreviewRevision: routePreviewRevisionRef.current,
      networkRequestEpoch: networkRequestEpochRef.current,
      sessionEpoch: sessionEpochRef.current,
      workspaceAuthorizationEpoch: workspaceForegroundAuthorizationEpochRef.current,
      workspaceId,
    };
    const requestIsCurrent = () =>
      networkStatusRef.current === 'online' &&
      request.networkRequestEpoch === networkRequestEpochRef.current &&
      !workspaceForegroundAuthorizationPausedRef.current &&
      !workspaceForegroundRefreshPendingRef.current &&
      request.workspaceAuthorizationEpoch ===
        workspaceForegroundAuthorizationEpochRef.current &&
      isNavigationStartRequestCurrent(request, {
        accessToken: activeSessionTokenRef.current?.trim() || '',
        activeWorkspaceId: activeWorkspaceRef.current?.id || '',
        navigationCleanupRequired: navigationCleanupRequiredRef.current,
        pendingNavigationRestore: Boolean(pendingNavigationRestoreRef.current),
        principalId: activeSessionPrincipalIdRef.current,
        routePlan: selectedRouteRef.current,
        routePlanWorkspaceId: selectedRouteRef.current?.clientId?.trim() || '',
        routePreviewRevision: routePreviewRevisionRef.current,
        sessionEpoch: sessionEpochRef.current,
      });

    if (!requestIsCurrent()) {
      return 'The active workspace changed. Plot the route again.';
    }

    try {
      const authorization = await authorizeWorkspaceNavigationStart({
        expectedPrincipalId: principalId,
        loadCurrentPrincipalId: isPreviewAccessToken(accessToken)
          ? undefined
          : async () => String((await getCurrentUser(accessToken)).id || ''),
        loadWorkspaceCatalog: async () =>
          normalizeWorkspaceCatalog((await fetchSavedRoutes(accessToken)).clients),
        requestIsCurrent,
        workspaceId,
      });

      if (authorization.status === 'stale') {
        return 'The route or signed-in account changed. Plot the route again.';
      }
      if (authorization.status === 'principal-mismatch') {
        await handleSessionExpired(
          'Workspace access belongs to another signed-in account. Sign in again.',
          accessToken,
          request.sessionEpoch,
        );
        return 'Sign in again before starting guidance.';
      }
      if (authorization.status === 'workspace-unavailable') {
        await handleWorkspaceUnavailable(workspaceId, authorization.workspaces);
        return 'This route closed because its workspace is no longer available.';
      }

      const currentNavigation = activeNavigationSessionRef.current;
      const currentPreview = selectedRouteRef.current;
      const reconciliation = reconcileFreshWorkspaceCatalog({
        activeWorkspaceId: activeWorkspaceRef.current?.id,
        candidateWorkspaceIds: [
          currentNavigation?.routePlan.clientId,
          currentPreview?.clientId,
          activeWorkspaceRef.current?.id,
          workspaceId,
          ...freshWorkspaceAuthorizationRef.current.workspaceIds,
        ],
        freshWorkspaces: authorization.workspaces,
        knownWorkspaces: availableWorkspacesRef.current,
        unavailableWorkspaceIds: unavailableWorkspaceIdsRef.current,
      });
      if (!requestIsCurrent()) {
        return 'The connection changed. Verify workspace access and try again.';
      }
      if (!findWorkspace(reconciliation.workspaces, workspaceId)) {
        await handleWorkspaceUnavailable(workspaceId, authorization.workspaces);
        return 'This route closed because its workspace is no longer available.';
      }
      const authoritativeCatalogStoredAtMs = Date.now();

      const { navigationUnavailable, previewUnavailable } =
        resolveWorkspaceSurfaceClosure({
          navigationWorkspaceId: currentNavigation?.routePlan.clientId,
          previewWorkspaceId: currentPreview?.clientId,
          unavailableWorkspaceIds: reconciliation.unavailableWorkspaceIds,
        });
      const navigationCleanup = navigationUnavailable
        ? discardPersistedNavigation(
            'Active guidance ended because this workspace is no longer available.',
          )
        : Promise.resolve(true);
      const recoveryPersistence = persistWorkspaceRecoveryWithEvidence(
        principalId,
        {
          activeWorkspaceId: reconciliation.activeWorkspace?.id || null,
          unavailableWorkspaceIds: Array.from(reconciliation.unavailableWorkspaceIds),
          workspaces: reconciliation.workspaces,
        },
        Array.from(reconciliation.unavailableWorkspaceIds).map((unavailableWorkspaceId) =>
          () => clearOfflineWorkspaceProductCaches(principalId, unavailableWorkspaceId)
        ),
        { authoritativeCatalogStoredAtMs },
        'navigation-start-revalidation',
      );
      const [, persistenceResult] = await Promise.all([
        navigationCleanup,
        recoveryPersistence,
      ]);
      if (!requestIsCurrent()) {
        return 'The route or signed-in account changed. Plot the route again.';
      }
      if (persistenceResult === 'failed') {
        setWorkspaceCatalogStoredAtMs(null);
        setWorkspaceCatalogRetentionStoredAtMs(null);
        freshWorkspaceAuthorizationRef.current = {
          principalId,
          workspaceIds: new Set<string>(),
        };
        setWorkspaceCatalogError('Offline workspace cleanup needs retry.');
        setWorkspaceAccessIssue('offline-safety');
        setSessionMessage(
          'Workspace access refreshed, but offline safety needs retry before another route.',
        );
        return 'Workspace access could not be secured offline. Retry access and try again.';
      }

      completeWorkspaceCatalogRetry(
        workspaceCatalogRetryingRef,
        setWorkspaceCatalogRetrying,
      );
      workspaceRequestRevisionRef.current += 1;
      unavailableWorkspaceIdsRef.current = reconciliation.unavailableWorkspaceIds;
      availableWorkspacesRef.current = reconciliation.workspaces;
      setAvailableWorkspaces(reconciliation.workspaces);
      activeWorkspaceRef.current = reconciliation.activeWorkspace;
      setActiveWorkspace(reconciliation.activeWorkspace);
      setWorkspaceCatalogLoading(false);
      setWorkspaceCatalogStoredAtMs(
        persistenceResult === 'persisted'
          ? authoritativeCatalogStoredAtMs
          : null,
      );
      setWorkspaceCatalogRetentionStoredAtMs(
        persistenceResult === 'persisted'
          ? authoritativeCatalogStoredAtMs
          : null,
      );
      setWorkspaceCatalogError(
        persistenceResult === 'revoked'
          ? 'Offline workspace access stays locked until retry.'
          : '',
      );
      setWorkspaceAccessIssue(
        persistenceResult === 'revoked' ? 'offline-safety' : 'none',
      );
      if (previewUnavailable) {
        selectedRouteRef.current = null;
        setSelectedRoute(null);
      }
      if (navigationUnavailable || previewUnavailable) {
        setScreen((currentScreen) =>
          currentScreen === 'route-preview' ? 'guest-map' : currentScreen,
        );
      }
      freshWorkspaceAuthorizationRef.current = {
        principalId,
        workspaceIds: new Set(
          reconciliation.workspaces.map((workspace) => workspace.id),
        ),
      };
      if (reconciliation.newlyUnavailableWorkspaceIds.length) {
        setSessionMessage(
          'Workspace access changed. Unavailable workspace data was removed.',
        );
      }
      return null;
    } catch (error) {
      if (!requestIsCurrent()) {
        return 'The route or signed-in account changed. Plot the route again.';
      }
      if (error instanceof ApiSessionExpiredError) {
        await handleSessionExpired(error.message, accessToken, request.sessionEpoch);
        return 'Sign in again before starting guidance.';
      }
      return 'Workspace access could not be verified. Reconnect and try again.';
    }
  };

  useEffect(() => {
    const navigationWorkspaceId = activeNavigationSession?.routePlan.clientId;
    if (!navigationWorkspaceId) {
      return;
    }
    const navigationWorkspace = findWorkspace(availableWorkspaces, navigationWorkspaceId);
    if (navigationWorkspace) {
      activeWorkspaceRef.current = navigationWorkspace;
      setActiveWorkspace(navigationWorkspace);
      const principalId = getAuthSessionPrincipalId(session);
      void persistOfflineReviewWorkspaceSelection(
        principalId,
        navigationWorkspace.id,
      ).catch(() => undefined);
    }
  }, [
    activeNavigationSession?.routePlan.clientId,
    availableWorkspaces,
    session,
  ]);

  const openSignIn = (message = DEFAULT_SIGN_IN_PROMPT) => {
    sessionRestoreGenerationRef.current += 1;
    setAuthPrompt(message);
    setScreen('login');
  };

  const openFullAccessFeature = (feature: GuestFullAccessFeature) => {
    const nextNavigation = resolveFullAccessNavigation({
      authenticated,
      feature
    });

    if (nextNavigation.screen === 'login') {
      pendingFullAccessFeatureRef.current = feature;
      openSignIn(nextNavigation.prompt);
      return;
    }

    pendingFullAccessFeatureRef.current = null;
    openAuthenticatedFeature(feature);
  };

  const openRoutePreview = (routePlan: SavedSafeRoutePlan) => {
    const routeWorkspaceId = routePlan.clientId?.trim() || '';
    if (
      navigationCleanupRequiredRef.current ||
      workspaceHandoffPendingRef.current ||
      workspaceSelectionPendingRef.current
    ) {
      setSessionMessage(
        workspaceSelectionPendingRef.current
          ? 'Wait for the workspace change before opening another route.'
          : 'Finish saved-guidance cleanup before starting another route.',
      );
      return;
    }
    if (
      authenticated &&
      (
        !routeWorkspaceId ||
        unavailableWorkspaceIdsRef.current.has(routeWorkspaceId) ||
        activeWorkspaceRef.current?.id !== routeWorkspaceId
      )
    ) {
      setSessionMessage('The active workspace changed. Plot the route again.');
      return;
    }
    if (pendingNavigationRestoreRef.current) {
      void discardPersistedNavigation(
        'Saved guidance removed. Select the new route again.',
      );
      return;
    }
    if (
      activeNavigationSession &&
      !isNavigationSessionForRoutePreview({
        navigationSession: activeNavigationSession,
        principalId: sessionPrincipalId,
        routeContext: 'guest',
        routePlan,
      })
    ) {
      void discardPersistedNavigation(
        'Current guidance ended. Select the new route again.',
      );
      return;
    }
    selectedRouteRef.current = routePlan;
    setSelectedRoute(routePlan);
    setRoutePreviewSource('guest');
    setScreen('route-preview');
  };

  const handleSelectSavedRoute = (routePlan: SavedSafeRoutePlan) => {
    if (
      navigationCleanupRequiredRef.current ||
      workspaceHandoffPendingRef.current ||
      workspaceSelectionPendingRef.current
    ) {
      setSessionMessage(
        workspaceSelectionPendingRef.current
          ? 'Wait for the workspace change before opening another route.'
          : 'Finish saved-guidance cleanup before starting another route.',
      );
      return;
    }
    if (!activeWorkspace || routePlan.clientId !== activeWorkspace.id) {
      setSessionMessage('The active workspace changed. Choose the saved route again.');
      return;
    }
    if (pendingNavigationRestoreRef.current) {
      void discardPersistedNavigation(
        'Saved guidance removed. Choose the new route again.',
      );
      return;
    }
    if (
      activeNavigationSession &&
      !isNavigationSessionForRoutePreview({
        navigationSession: activeNavigationSession,
        principalId: sessionPrincipalId,
        routeContext: 'saved',
        routePlan,
      })
    ) {
      void discardPersistedNavigation(
        'Current guidance ended. Choose the new route again.',
      );
      return;
    }
    selectedRouteRef.current = routePlan;
    setSelectedRoute(routePlan);
    setRoutePreviewSource('saved');
    setScreen('route-preview');
  };

  const returnFromRoutePreview = () => {
    selectedRouteRef.current = null;
    setSelectedRoute(null);
    setScreen(screenAfterRoutePreview(routePreviewSource, authenticated));
  };

  const resumeActiveNavigation = async () => {
    const persistedNavigation =
      (await loadActiveNavigationSession()) || activeNavigationSession;
    if (!persistedNavigation) {
      setActiveNavigationSession(null);
      return;
    }

    if (!openActiveNavigationSession(
      persistedNavigation,
      authenticated,
      activeWorkspaceRef.current?.id,
      activeSessionPrincipalIdRef.current,
    )) {
      await discardPersistedNavigation(
        'Active guidance could not be resumed safely. Plot the route again.',
      );
    }
  };

  const returnCopy = routePreviewReturnCopy(routePreviewSource);
  const routeListSessionNotice =
    session && isPreviewAccessToken(session.accessToken)
      ? PREVIEW_SESSION_NOTICE
      : sessionMessage;
  const statusBarStyle = screen === 'guest-map' || screen === 'route-preview'
    ? 'light'
    : 'dark';

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.root}>
      <View testID={uiTestIds.appRoot} style={styles.root}>
        <StatusBar style={statusBarStyle} />
        {screen === 'login' ? (
          <LoginScreen
            initialChallenge={
              SAFEROUTE_PREVIEW_MODE_ENABLED && SAFEROUTE_PREVIEW_INITIAL_SCREEN === 'login-code'
                ? createPreviewLoginCodeChallenge()
                : null
            }
            sessionMessage={authPrompt || sessionMessage}
            onAuthenticated={handleAuthenticated}
            onRetrySavedSession={
              savedSessionValidationRetryAvailable
                ? handleRetrySavedSessionValidation
                : undefined
            }
            savedSessionRetrying={savedSessionValidationRetrying}
            onCancel={() => {
              pendingFullAccessFeatureRef.current = null;
              setAuthPrompt('');
              setScreen('guest-map');
            }}
          />
        ) : screen === 'route-preview' && selectedRoute ? (
          <LiveMapScreen
            accessToken={session?.accessToken || null}
            initialNavigationSession={
              isNavigationSessionForRoutePreview({
                navigationSession: activeNavigationSession,
                principalId: sessionPrincipalId,
                routeContext: routePreviewSource,
                routePlan: selectedRoute,
              })
                ? activeNavigationSession
                : null
            }
            returnAccessibilityLabel={returnCopy.accessibilityLabel}
            returnLabel={returnCopy.label}
            routeContext={routePreviewSource}
            routePlan={selectedRoute}
            onChangeRoute={returnFromRoutePreview}
            onAuthorizeNavigationStart={handleAuthorizeNavigationStart}
            onNavigationSessionChange={handleNavigationSessionChange}
            onSessionExpired={handleSessionExpired}
            onWorkspaceUnavailable={handleWorkspaceUnavailable}
            principalId={sessionPrincipalId}
            workspaceAuthorizationChecking={
              workspaceCatalogBusy && !activeWorkspaceAuthorizationFresh
            }
            workspaceAuthorizationFresh={activeWorkspaceAuthorizationFresh}
            workspaceAuthorizationUnavailable={
              workspaceForegroundAuthorizationPaused && !workspaceCatalogBusy
            }
          />
        ) : screen === 'routes' && session && authenticated ? (
          <RouteListScreen
            accessToken={session.accessToken}
            activeWorkspace={activeWorkspace}
            availableWorkspaces={availableWorkspaces}
            cacheIdentity={sessionPrincipalId}
            onRetryWorkspaceCatalog={handleRetryWorkspaceCatalog}
            sessionNotice={routeListSessionNotice}
            userEmail={session.user?.email || session.email}
            onBackToMap={returnToMapHome}
            onSelectRoute={handleSelectSavedRoute}
            onSessionExpired={handleSessionExpired}
            onWorkspaceUnavailable={handleWorkspaceUnavailable}
            onSignOut={handleSignOut}
            onWorkspaceChange={handleGuardedWorkspaceChange}
            workspaceCatalogError={workspaceCatalogError}
            workspaceCatalogLoading={workspaceCatalogBusy}
            workspaceCatalogStoredAtMs={workspaceCatalogStoredAtMs}
            workspaceAuthorizationFresh={activeWorkspaceAuthorizationFresh}
            workspaceAccessRecoveryPending={workspaceAccessRecoveryPending}
            workspaceAccessRefreshAvailable={workspaceAccessRefreshAvailable}
            workspaceAccessIssue={workspaceAccessIssue}
            workspaceAccessFocusTargetRef={updateWorkspaceAccessFocusTarget}
            workspaceChangeEndsNavigation={navigationWorkspaceLocked}
            workspaceNavigationNoticeInset={
              pendingNavigationRestore
                ? suspendedNavigationNoticeHeight + spacing.sm
                : 0
            }
            workspaceSwitchFailure={workspaceCleanupFailed}
            workspaceSwitchDisabled={workspaceCleanupLocked}
            workspaceSelectionFailed={workspaceSelectionFailed}
            workspaceSelectionPending={workspaceSelectionPending}
          />
        ) : screen === 'operations' && session && authenticated ? (
          <OperationsScreen
            accessToken={session.accessToken}
            activeWorkspace={activeWorkspace}
            availableWorkspaces={availableWorkspaces}
            cacheIdentity={sessionPrincipalId}
            initialTab={operationsTab}
            sessionNotice={routeListSessionNotice}
            userEmail={session.user?.email || session.email}
            onBackToMap={returnToMapHome}
            onRetryWorkspaceCatalog={handleRetryWorkspaceCatalog}
            onSessionExpired={handleSessionExpired}
            onSignOut={handleSignOut}
            onWorkspaceUnavailable={handleWorkspaceUnavailable}
            onWorkspaceChange={handleGuardedWorkspaceChange}
            workspaceCatalogError={workspaceCatalogError}
            workspaceCatalogLoading={workspaceCatalogBusy}
            workspaceCatalogStoredAtMs={workspaceCatalogStoredAtMs}
            workspaceAuthorizationFresh={activeWorkspaceAuthorizationFresh}
            workspaceAccessRecoveryPending={workspaceAccessRecoveryPending}
            workspaceAccessRefreshAvailable={workspaceAccessRefreshAvailable}
            workspaceAccessIssue={workspaceAccessIssue}
            workspaceAccessFocusTargetRef={updateWorkspaceAccessFocusTarget}
            workspaceChangeEndsNavigation={navigationWorkspaceLocked}
            workspaceNavigationNoticeInset={
              pendingNavigationRestore
                ? suspendedNavigationNoticeHeight + spacing.sm
                : 0
            }
            workspaceSwitchFailure={workspaceCleanupFailed}
            workspaceSwitchDisabled={workspaceCleanupLocked}
            workspaceSelectionFailed={workspaceSelectionFailed}
            workspaceSelectionPending={workspaceSelectionPending}
          />
        ) : (
          <GuestMapScreen
            accessToken={session?.accessToken || null}
            activeWorkspace={activeWorkspace}
            authenticated={authenticated}
            availableWorkspaces={availableWorkspaces}
            onOpenFullAccessFeature={openFullAccessFeature}
            onOpenRoutePreview={openRoutePreview}
            onSessionExpired={handleSessionExpired}
            onWorkspaceUnavailable={handleWorkspaceUnavailable}
            sessionNotice={session && isPreviewAccessToken(session.accessToken)
              ? ''
              : sessionMessage}
            onRetryWorkspaceCatalog={handleRetryWorkspaceCatalog}
            onSignIn={() => {
              pendingFullAccessFeatureRef.current = null;
              openSignIn();
            }}
            onWorkspaceChange={handleGuardedWorkspaceChange}
            workspaceCatalogError={workspaceCatalogError}
            workspaceCatalogLoading={workspaceCatalogBusy}
            workspaceCatalogStoredAtMs={workspaceCatalogStoredAtMs}
            workspaceAuthorizationFresh={activeWorkspaceAuthorizationFresh}
            workspaceAccessRecoveryPending={workspaceAccessRecoveryPending}
            workspaceAccessRefreshAvailable={workspaceAccessRefreshAvailable}
            workspaceAccessIssue={workspaceAccessIssue}
            workspaceAccessFocusTargetRef={updateWorkspaceAccessFocusTarget}
            workspaceChangeEndsNavigation={navigationWorkspaceLocked}
            workspaceNavigationNoticeInset={
              pendingNavigationRestore
                ? suspendedNavigationNoticeHeight + spacing.sm
                : 0
            }
            workspaceSwitchFailure={workspaceCleanupFailed}
            workspaceSwitchDisabled={workspaceCleanupLocked}
            workspaceSelectionFailed={workspaceSelectionFailed}
            workspaceSelectionPending={workspaceSelectionPending}
          />
        )}
        {activeNavigationSession && screen !== 'route-preview' && screen !== 'login' ? (
          <ResumeNavigationButton
            routeName={activeNavigationSession.routePlan.name}
            onPress={() => {
              void resumeActiveNavigation();
            }}
          />
        ) : null}
        {pendingNavigationRestore && screen !== 'login' ? (
          <SuspendedNavigationNotice
            networkStatus={networkStatus}
            onLayoutHeight={setSuspendedNavigationNoticeHeight}
            routeName={pendingNavigationRestore.session.routePlan.name}
            status={pendingNavigationRestore.status}
            onEnd={() => {
              void handleEndSuspendedNavigation();
            }}
            onRetry={handleRetryWorkspaceCatalog}
          />
        ) : null}
        {navigationCleanupStatus !== 'idle' ? (
          <NavigationCleanupNotice
            checking={navigationCleanupStatus === 'checking'}
            onRetry={() => {
              void handleRetryNavigationCleanup();
            }}
            workspaceName={workspaceHandoffNoticeTargetName}
          />
        ) : null}
        {offlineCalendarCleanupStatus !== 'idle' &&
        navigationCleanupStatus === 'idle' ? (
          <OfflineCalendarCleanupNotice
            checking={offlineCalendarCleanupStatus === 'checking'}
            onRetry={() => {
              void handleRetryOfflineCalendarCleanup();
            }}
          />
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}

async function recordNavigationRestoreSuspended(
  navigation: ActiveNavigationSession,
): Promise<void> {
  if (!SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED) {
    return;
  }
  const trackingVerification = await confirmBackgroundNavigationStopped();
  const workspaceId = navigation.accessScope.kind === 'workspace'
    ? navigation.accessScope.clientId
    : null;
  await recordGuidanceContractEvidence({
    authorization: {
      catalog: 'unavailable',
      principal: navigation.accessScope.kind === 'workspace' ? 'matching' : 'none',
    },
    cause: 'workspace-authorization-pending',
    durability: {
      activeNavigation: 'present',
      nativeTracking: trackingVerification.nativeTracking,
      runtimePermit: trackingVerification.runtimePermit,
    },
    navigationInstanceId: navigation.navigationInstanceId,
    outcome: trackingVerification.stopped ? 'suspended' : 'tracking-unknown',
    routeId: navigation.routePlan.route.id,
    type: 'restore.suspended',
    unavailableWorkspaceIds: [],
    workspaceId,
  });
}

async function recordNavigationAbsenceReadback(
  entryTrackingVerification: Awaited<
    ReturnType<typeof confirmBackgroundNavigationStopped>
  > | null,
): Promise<void> {
  if (
    !SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED ||
    !entryTrackingVerification
  ) {
    return;
  }
  await recordGuidanceContractEvidence({
    authorization: {
      catalog: 'not-checked',
      principal: 'unknown',
    },
    cause: 'cold-start-readback',
    durability: {
      activeNavigation: 'absent',
      nativeTracking: entryTrackingVerification.nativeTracking,
      runtimePermit: entryTrackingVerification.runtimePermit,
    },
    navigationInstanceId: null,
    outcome: entryTrackingVerification.stopped ? 'absent' : 'tracking-active',
    routeId: null,
    type: 'navigation.absence.readback',
    unavailableWorkspaceIds: [],
    workspaceId: null,
  });
}

async function clearOfflineWorkspaceProductCaches(
  principalId: string,
  workspaceId: string,
): Promise<void> {
  await Promise.all([
    clearOfflineRouteWorkspace(principalId, workspaceId),
    clearOfflineOperationsWorkspace(principalId, workspaceId),
  ]);
}

async function persistWorkspaceRecoveryWithEvidence(
  principalId: string,
  context: Parameters<typeof persistOfflineWorkspaceRecovery>[1],
  purgeWorkspaceCaches: Parameters<typeof persistOfflineWorkspaceRecovery>[2],
  options: Parameters<typeof persistOfflineWorkspaceRecovery>[3] = undefined,
  cause = 'workspace-recovery',
) {
  const result = await persistOfflineWorkspaceRecovery(
    principalId,
    context,
    purgeWorkspaceCaches,
    options,
  );
  const unavailableWorkspaceIds = Array.from(context.unavailableWorkspaceIds || []);
  const authoritativeCatalogObserved = Number.isFinite(
    options?.authoritativeCatalogStoredAtMs,
  );
  await recordGuidanceContractEvidence({
    authorization: {
      catalog: authoritativeCatalogObserved
        ? unavailableWorkspaceIds.length
          ? 'fresh-denied'
          : 'fresh-authorized'
        : 'not-checked',
      principal: 'matching',
    },
    cause,
    durability: {
      routeCache:
        result === 'persisted' && purgeWorkspaceCaches.length > 0
          ? 'purged'
          : result === 'failed'
            ? 'failed'
            : 'unknown',
      workspaceContext:
        result === 'persisted'
          ? 'persisted'
          : result === 'revoked'
            ? 'revoked'
            : 'failed',
    },
    navigationInstanceId: null,
    outcome: result,
    routeId: null,
    type: 'workspace.recovery.settled',
    unavailableWorkspaceIds,
    workspaceId: unavailableWorkspaceIds[0] || context.activeWorkspaceId || null,
  });
  if (
    result === 'persisted' &&
    authoritativeCatalogObserved &&
    unavailableWorkspaceIds.length > 0
  ) {
    await recordOfflineCalendarWorkspaceRevocationContractEvidence({
      authorizationCatalog: 'fresh-denied',
      cause: 'workspace-denial',
      principalId,
      unavailableWorkspaceIds,
    });
  }
  return result;
}

function screenForAuthenticatedPreview(
  previewInitialScreen: typeof SAFEROUTE_PREVIEW_INITIAL_SCREEN,
): AppScreen {
  if (previewInitialScreen === 'operations') {
    return 'operations';
  }

  if (previewInitialScreen === 'routes' || previewInitialScreen === 'routes-empty') {
    return 'routes';
  }

  return 'guest-map';
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.control
  }
});
