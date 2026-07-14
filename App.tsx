import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
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
import { clearAuthSession, loadAuthSession, saveAuthSession } from './src/features/auth/authStorage';
import {
  createPreviewLoginCodeChallenge,
  createPreviewAuthSession,
  createPreviewSuspendedNavigationSession,
  isPreviewAccessToken,
  PREVIEW_EXPIRED_SESSION_NOTICE,
  PREVIEW_SESSION_NOTICE
} from './src/features/auth/previewSession';
import { restoreSavedSession } from './src/features/auth/sessionRestore';
import type { AuthSession } from './src/features/auth/authTypes';
import { GuestMapScreen } from './src/features/guest-map/GuestMapScreen';
import type { GuestFullAccessFeature } from './src/features/guest-map/guestRoutePlanner';
import { LiveMapScreen } from './src/features/live-map/LiveMapScreen';
import type { SavedSafeRoutePlan } from './src/features/live-map/liveMapTypes';
import {
  canResumeActiveNavigationSession,
  type ActiveNavigationSession
} from './src/features/live-map/activeNavigationSessionCore';
import {
  clearActiveNavigationSession,
  loadActiveNavigationSession
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
import type { OperationsTab } from './src/features/operations/operationsUiState';
import { RouteListScreen } from './src/features/routes/RouteListScreen';
import { uiTestIds } from './src/testing/uiTestIds';
import { colors } from './src/theme';
import {
  shouldHandleActiveSessionExpiry,
  waitForSessionCleanup
} from './src/features/api/sessionExpiry';
import { ApiSessionExpiredError } from './src/features/api/apiClient';
import { useNetworkAvailability } from './src/features/api/useNetworkAvailability';
import { fetchSavedRoutes } from './src/features/routes/routeApi';
import {
  clearOfflineRouteWorkspace,
  loadOfflineRoutes
} from './src/features/routes/offlineRouteCache';
import {
  canRetainRouteWorkspace,
  findWorkspace,
  normalizeWorkspaceCatalog,
  resolveActiveWorkspace,
  type SafeRouteWorkspace
} from './src/features/workspaces/activeWorkspace';
import {
  loadOfflineWorkspaceContext,
  persistOfflineWorkspaceRecovery,
  saveOfflineWorkspaceContext
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
import { authorizeWorkspaceNavigationStart } from './src/features/workspaces/workspaceNavigationAuthorization';
import { SuspendedNavigationNotice } from './src/features/live-map/SuspendedNavigationNotice';
import { NavigationCleanupNotice } from './src/features/live-map/NavigationCleanupNotice';
import { isNavigationStartRequestCurrent } from './src/features/live-map/navigationStartRequestIdentity';
import {
  flushGuidanceContractEvidence,
  recordGuidanceContractEvidence,
} from './src/testing/guidanceContractEvidence';
import type { SuspendedNavigationStatus } from './src/features/live-map/suspendedNavigationState';

type PendingNavigationRestore = {
  session: ActiveNavigationSession;
  status: SuspendedNavigationStatus;
};

type NavigationCleanupStatus = 'idle' | 'checking' | 'failed';

export default function App() {
  useEffect(() => {
    void flushGuidanceContractEvidence();
  }, []);
  const { offline } = useNetworkAvailability();
  const [session, setSession] = useState<AuthSession | null>(null);
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
  const [workspaceDiscoveryRevision, setWorkspaceDiscoveryRevision] = useState(0);
  const [pendingNavigationRestore, setPendingNavigationRestore] =
    useState<PendingNavigationRestore | null>(null);
  const [navigationCleanupStatus, setNavigationCleanupStatus] =
    useState<NavigationCleanupStatus>('idle');
  const pendingFullAccessFeatureRef = useRef<GuestFullAccessFeature | null>(null);
  const activeSessionTokenRef = useRef(session?.accessToken || null);
  const activeSessionPrincipalIdRef = useRef(getAuthSessionPrincipalId(session));
  const sessionCleanupRef = useRef<Promise<unknown> | null>(null);
  const sessionEpochRef = useRef(0);
  const sessionExpiryHandledRef = useRef(false);
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
  const authenticated = hasAuthenticatedSession(session);
  const sessionPrincipalId = getAuthSessionPrincipalId(session);
  if (freshWorkspaceAuthorizationRef.current.principalId !== sessionPrincipalId) {
    freshWorkspaceAuthorizationRef.current = {
      principalId: sessionPrincipalId,
      workspaceIds: new Set<string>(),
    };
  }
  const activeWorkspaceAuthorizationFresh = Boolean(
    activeWorkspace &&
    freshWorkspaceAuthorizationRef.current.workspaceIds.has(activeWorkspace.id),
  );
  const workspaceAccessRefreshAvailable =
    unavailableWorkspaceIdsRef.current.size > 0 ||
    (authenticated &&
      !workspaceCatalogLoading &&
      !workspaceCatalogError &&
      availableWorkspaces.length === 0);
  const navigationWorkspaceLocked = Boolean(
    activeNavigationSession || pendingNavigationRestore,
  );
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
      await Promise.all([
        recordGuidanceContractEvidence({
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
        }),
        recordGuidanceContractEvidence({
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
        }),
      ]);
      navigationCleanupRequiredRef.current = !cleanupSucceeded;
      setNavigationCleanupStatus(cleanupSucceeded ? 'idle' : 'failed');
      return cleanupSucceeded;
    }).finally(() => {
      navigationCleanupPromiseRef.current = null;
    });
    navigationCleanupPromiseRef.current = cleanupPromise;
    return cleanupPromise;
  };

  const discardPersistedNavigation = async (message?: string) => {
    const evidenceSession =
      pendingNavigationRestoreRef.current || activeNavigationSessionRef.current;
    pendingNavigationRestoreRef.current = null;
    setPendingNavigationRestore(null);
    activeNavigationSessionRef.current = null;
    selectedRouteRef.current = null;
    setActiveNavigationSession(null);
    setSelectedRoute(null);
    const durableClearSucceeded = await performPersistedNavigationCleanup(evidenceSession);
    if (!durableClearSucceeded) {
      setSessionMessage(
        'Saved guidance could not be removed. Retry cleanup before starting another route.',
      );
      return false;
    }
    if (message) {
      setSessionMessage(message);
    }
    return true;
  };

  const handleRetryNavigationCleanup = async () => {
    const durableClearSucceeded = await performPersistedNavigationCleanup(null);
    setSessionMessage(
      durableClearSucceeded
        ? 'Saved guidance removed. You can start another route.'
        : 'Saved guidance could not be removed. Keep SafeRoute open and retry cleanup.',
    );
  };

  useEffect(() => {
    let mounted = true;

    const enablePreviewSession = () => {
      if (!SAFEROUTE_PREVIEW_MODE_ENABLED || !mounted) {
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
      if (previewInitialScreen === 'guidance-suspended') {
        stagePendingNavigationRestore(createPreviewSuspendedNavigationSession());
        setSessionMessage('Checking workspace access before restoring guidance…');
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
      setAuthPrompt('');
      setSelectedRoute(null);
      setAvailableWorkspaces([]);
      activeWorkspaceRef.current = null;
      setActiveWorkspace(null);
      setWorkspaceCatalogLoading(true);
      setWorkspaceCatalogError('');
      setScreen('guest-map');
      let persistedNavigation: ActiveNavigationSession | null = null;

      try {
        await stopBackgroundNavigation();
        persistedNavigation = SAFEROUTE_PREVIEW_MODE_ENABLED
          ? null
          : await loadActiveNavigationSession();
        const storedSession = await loadAuthSession();
        if (!mounted) {
          return;
        }

        if (!storedSession) {
          if (
            !persistedNavigation ||
            !openActiveNavigationSession(persistedNavigation, false, null, null)
          ) {
            if (persistedNavigation) {
              await discardPersistedNavigation(
                'Active guidance needs workspace access. Sign in and plot the route again.',
              );
            }
            enablePreviewSession();
          }
          return;
        }

        if (SAFEROUTE_PREVIEW_MODE_ENABLED && isPreviewAccessToken(storedSession.accessToken)) {
          enablePreviewSession();
          return;
        }

        const restoreResult = await restoreSavedSession(storedSession, getCurrentUser);

        if (restoreResult.status === 'expired') {
          await clearAuthSession();
          if (
            !enablePreviewSession() &&
            mounted &&
            (!persistedNavigation ||
              !openActiveNavigationSession(persistedNavigation, false, null, null))
          ) {
            if (persistedNavigation) {
              await discardPersistedNavigation(
                'Active guidance could not be restored safely. Plot the route again.',
              );
            } else {
              setSessionMessage(restoreResult.message);
            }
          }
        } else if (restoreResult.status === 'restored' && mounted) {
          if (restoreResult.validatedOnline) {
            await saveAuthSession(restoreResult.session);
          }
          const restoredPrincipalId = getAuthSessionPrincipalId(restoreResult.session);
          activeSessionPrincipalIdRef.current = restoredPrincipalId;
          setSessionMessage(restoreResult.message || '');
          setSession(restoreResult.session);
          if (persistedNavigation?.accessScope.kind === 'workspace') {
            if (hasMatchingAuthPrincipal(
              persistedNavigation.accessScope.principalId,
              restoreResult.session,
            )) {
              stagePendingNavigationRestore(persistedNavigation);
              setSessionMessage('Checking workspace access before restoring guidance…');
              await stopBackgroundNavigation();
              await recordNavigationRestoreSuspended(persistedNavigation);
            } else {
              await discardPersistedNavigation(
                'Active guidance belongs to another signed-in account. Plot the route again.',
              );
            }
          } else if (persistedNavigation) {
            await discardPersistedNavigation(
              'Active guidance could not be restored after sign-in. Plot the route again.',
            );
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
        await clearAuthSession().catch(() => undefined);
        if (
          mounted &&
          (!persistedNavigation ||
            !openActiveNavigationSession(persistedNavigation, false, null, null))
        ) {
          if (persistedNavigation) {
            await discardPersistedNavigation(
              'Active guidance could not be restored safely. Plot the route again.',
            );
          }
          enablePreviewSession();
        }
      }
    };

    void restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  const handleAuthenticated = async (nextSession: AuthSession) => {
    workspaceRequestRevisionRef.current += 1;
    unavailableWorkspaceIdsRef.current.clear();
    setAvailableWorkspaces([]);
    activeWorkspaceRef.current = null;
    setActiveWorkspace(null);
    setWorkspaceCatalogLoading(true);
    setWorkspaceCatalogError('');
    await waitForSessionCleanup(sessionCleanupRef.current);
    const persistedSession = await prepareAuthenticatedSession(nextSession, saveAuthSession, getCurrentUser);
    if (!hasAuthenticatedSession(persistedSession)) {
      await clearAuthSession();
      setSession(null);
      setSessionMessage('Your LunarChain session could not be validated. Sign in again.');
      setAuthPrompt('Your LunarChain session could not be validated. Sign in again.');
      setScreen('login');
      return;
    }

    setSessionMessage('');
    setAuthPrompt('');
    setAvailableWorkspaces([]);
    activeWorkspaceRef.current = null;
    setActiveWorkspace(null);
    setWorkspaceCatalogError('');
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
        setSessionMessage('Checking workspace access before restoring guidance…');
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
    workspaceRequestRevisionRef.current += 1;
    unavailableWorkspaceIdsRef.current.clear();
    sessionEpochRef.current += 1;
    activeSessionTokenRef.current = null;
    activeSessionPrincipalIdRef.current = '';
    sessionExpiryHandledRef.current = true;
    await discardPersistedNavigation();
    await clearAuthSession();
    setSessionMessage('');
    setAuthPrompt('');
    setAvailableWorkspaces([]);
    activeWorkspaceRef.current = null;
    setActiveWorkspace(null);
    setWorkspaceCatalogLoading(false);
    setWorkspaceCatalogError('');
    setOperationsTab('planned-routes');
    pendingFullAccessFeatureRef.current = null;
    setSession(null);
    setScreen('guest-map');
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
    workspaceRequestRevisionRef.current += 1;
    unavailableWorkspaceIdsRef.current.clear();
    sessionExpiryHandledRef.current = true;
    activeSessionTokenRef.current = null;
    activeSessionPrincipalIdRef.current = '';
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
      clearAuthSession()
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
    setOperationsTab('planned-routes');
    setSession(null);
    setScreen('login');
    await cleanup;
    if (sessionCleanupRef.current === cleanup) {
      sessionCleanupRef.current = null;
    }
  };

  useEffect(() => {
    const revision = workspaceRequestRevisionRef.current + 1;
    workspaceRequestRevisionRef.current = revision;
    const allowFreshWorkspaceRestoration =
      restoreUnavailableWorkspacesFromFreshCatalogRef.current;
    const accessToken = session?.accessToken?.trim();
    const principalId = getAuthSessionPrincipalId(session);

    if (!accessToken || !authenticated) {
      restoreUnavailableWorkspacesFromFreshCatalogRef.current = false;
      freshWorkspaceAuthorizationRef.current = {
        principalId: '',
        workspaceIds: new Set<string>(),
      };
      setAvailableWorkspaces([]);
      activeWorkspaceRef.current = null;
      setActiveWorkspace(null);
      setWorkspaceCatalogLoading(false);
      setWorkspaceCatalogError('');
      return;
    }

    setWorkspaceCatalogLoading(true);
    setWorkspaceCatalogError('');

    const discoverWorkspaces = async () => {
      const requestIsCurrent = () =>
        revision === workspaceRequestRevisionRef.current &&
        activeSessionTokenRef.current === accessToken &&
        activeSessionPrincipalIdRef.current === principalId;
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

      const legacyRouteCache = cachedContext || forceExplicitPreviewWorkspaceChoice
        ? null
        : await loadOfflineRoutes(principalId, null);
      if (!requestIsCurrent()) {
        return;
      }

      const cachedCatalog = excludeUnavailableWorkspaces(
        normalizeWorkspaceCatalog(
          cachedContext?.workspaces || legacyRouteCache?.clients || [],
        ),
        unavailableWorkspaceIdsRef.current,
      );
      if (cachedCatalog.length) {
        const pendingNavigation = pendingNavigationRestoreRef.current;
        const cachedWorkspace = resolveActiveWorkspace(
          cachedCatalog,
          pendingNavigation?.accessScope.kind === 'workspace'
            ? pendingNavigation.accessScope.clientId
            : activeNavigationSession?.routePlan.clientId || activeWorkspaceRef.current?.id,
          cachedContext?.activeWorkspaceId || legacyRouteCache?.selectedClientId,
        );
        setAvailableWorkspaces(cachedCatalog);
        activeWorkspaceRef.current = pendingNavigation ? null : cachedWorkspace;
        setActiveWorkspace(pendingNavigation ? null : cachedWorkspace);
      }

      try {
        const pendingNavigationForAuthorization = pendingNavigationRestoreRef.current;
        let currentPrincipalId = principalId;
        if (!isPreviewAccessToken(accessToken)) {
          const currentUser = await getCurrentUser(accessToken);
          if (!requestIsCurrent()) {
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
        if (!requestIsCurrent()) {
          return;
        }

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

        // Publish fresh authorization immediately. If a later cache cleanup or
        // persistence write fails, stale workspace state must not remain usable.
        unavailableWorkspaceIdsRef.current = stagedUnavailableWorkspaceIds;
        availableWorkspacesRef.current = stagedCatalog;
        setAvailableWorkspaces(stagedCatalog);
        activeWorkspaceRef.current = stagedResolvedWorkspace;
        setActiveWorkspace(stagedResolvedWorkspace);
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
            () => clearOfflineRouteWorkspace(principalId, workspaceId)
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
        if (!requestIsCurrent()) {
          return;
        }
        if (workspaceAccessRestored && recoveryPersistence !== 'persisted') {
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
          freshWorkspaceAuthorizationRef.current = {
            principalId,
            workspaceIds: new Set<string>(),
          };
          setWorkspaceCatalogError('Offline workspace cleanup needs retry.');
          setSessionMessage(
            'Workspace access refreshed, but offline safety needs retry before another route.',
          );
          return;
        }
        if (recoveryPersistence === 'revoked') {
          setWorkspaceCatalogError('Offline workspace access stays locked until retry.');
        }
        let navigationRestoreRejected = pendingNavigationRejected;
        if (previewWorkspaceRevoked && !navigationWorkspaceRevoked) {
          setSessionMessage(
            'This route closed because its workspace is no longer available.',
          );
        }
        restoreUnavailableWorkspacesFromFreshCatalogRef.current = false;
        if (pendingNavigation && pendingNavigationWorkspace) {
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
        if (workspaceAccessRestored && !navigationRestoreRejected) {
          setSessionMessage('Workspace access refreshed.');
        }
      } catch (error) {
        if (!requestIsCurrent()) {
          return;
        }
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
      } finally {
        if (revision === workspaceRequestRevisionRef.current) {
          setWorkspaceCatalogLoading(false);
        }
      }
    };

    void discoverWorkspaces();

    return () => {
      workspaceRequestRevisionRef.current += 1;
    };
  }, [authenticated, session?.accessToken, workspaceDiscoveryRevision]);

  const handleRetryWorkspaceCatalog = useCallback(() => {
    if (pendingNavigationRestoreRef.current) {
      setPendingNavigationRestoreStatus('checking');
      setSessionMessage('Checking workspace access before restoring guidance…');
    }
    restoreUnavailableWorkspacesFromFreshCatalogRef.current = true;
    setWorkspaceDiscoveryRevision((revision) => revision + 1);
  }, []);

  const previousOfflineRef = useRef(offline);
  const reconnectRetryPendingRef = useRef(false);
  useEffect(() => {
    const wasOffline = previousOfflineRef.current;
    previousOfflineRef.current = offline;
    if (offline || !pendingNavigationRestore) {
      reconnectRetryPendingRef.current = false;
    } else if (wasOffline) {
      reconnectRetryPendingRef.current = true;
    }
    if (
      !offline &&
      reconnectRetryPendingRef.current &&
      pendingNavigationRestore?.status === 'paused' &&
      !workspaceCatalogLoading
    ) {
      reconnectRetryPendingRef.current = false;
      handleRetryWorkspaceCatalog();
    }
  }, [
    handleRetryWorkspaceCatalog,
    offline,
    pendingNavigationRestore?.status,
    workspaceCatalogLoading,
  ]);

  const handleActiveWorkspaceChange = useCallback((workspace: SafeRouteWorkspace | null) => {
    if (
      pendingNavigationRestoreRef.current ||
      (activeNavigationSession && workspace?.id !== activeWorkspace?.id)
    ) {
      return;
    }
    const nextWorkspace = workspace
      ? findWorkspace(availableWorkspaces, workspace.id)
      : null;
    activeWorkspaceRef.current = nextWorkspace;
    setActiveWorkspace(nextWorkspace);
    const principalId = getAuthSessionPrincipalId(session);
    void saveOfflineWorkspaceContext(principalId, {
      activeWorkspaceId: nextWorkspace?.id || null,
      unavailableWorkspaceIds: Array.from(unavailableWorkspaceIdsRef.current),
      workspaces: availableWorkspaces,
    }).catch(() => undefined);
  }, [activeNavigationSession, activeWorkspace?.id, availableWorkspaces, session]);

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
    workspaceRequestRevisionRef.current += 1;
    availableWorkspacesRef.current = recovery.workspaces;
    setAvailableWorkspaces(recovery.workspaces);
    activeWorkspaceRef.current = recovery.activeWorkspace;
    setActiveWorkspace(recovery.activeWorkspace);
    setWorkspaceCatalogError('');
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
          () => clearOfflineRouteWorkspace(principalId, workspaceId)
        ),
        undefined,
        'workspace-access-loss',
      ),
    ]);
    if (!recoveryIsCurrent()) {
      return;
    }
    if (workspaceRecoveryPersistence === 'failed') {
      freshWorkspaceAuthorizationRef.current = {
        principalId,
        workspaceIds: new Set<string>(),
      };
      setWorkspaceCatalogError('Offline workspace cleanup needs retry.');
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
    if (
      navigationCleanupRequiredRef.current ||
      Boolean(pendingNavigationRestoreRef.current) ||
      !canResumeActiveNavigationSession(
        nextSession,
        sessionAuthenticated,
        activeWorkspaceRef.current?.id,
        activeSessionPrincipalIdRef.current,
      ) ||
      (workspaceId && !freshWorkspaceAuthorizationRef.current.workspaceIds.has(workspaceId)) ||
      (workspaceId && unavailableWorkspaceIdsRef.current.has(workspaceId))
    ) {
      return false;
    }

    activeNavigationSessionRef.current = nextSession;
    setActiveNavigationSession(nextSession);
    return true;
  }, []);

  const handleAuthorizeNavigationStart = async (routePlan: SavedSafeRoutePlan) => {
    const workspaceId = routePlan.clientId?.trim() || '';
    if (!workspaceId) {
      return null;
    }

    const accessToken = activeSessionTokenRef.current?.trim() || '';
    const principalId = activeSessionPrincipalIdRef.current.trim();
    const request = {
      accessToken,
      principalId,
      routePlan,
      routePreviewRevision: routePreviewRevisionRef.current,
      sessionEpoch: sessionEpochRef.current,
      workspaceId,
    };
    const requestIsCurrent = () =>
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
      if (!findWorkspace(reconciliation.workspaces, workspaceId)) {
        await handleWorkspaceUnavailable(workspaceId, authorization.workspaces);
        return 'This route closed because its workspace is no longer available.';
      }

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
          () => clearOfflineRouteWorkspace(principalId, unavailableWorkspaceId)
        ),
        undefined,
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
        freshWorkspaceAuthorizationRef.current = {
          principalId,
          workspaceIds: new Set<string>(),
        };
        setWorkspaceCatalogError('Offline workspace cleanup needs retry.');
        setSessionMessage(
          'Workspace access refreshed, but offline safety needs retry before another route.',
        );
        return 'Workspace access could not be secured offline. Retry access and try again.';
      }

      workspaceRequestRevisionRef.current += 1;
      unavailableWorkspaceIdsRef.current = reconciliation.unavailableWorkspaceIds;
      availableWorkspacesRef.current = reconciliation.workspaces;
      setAvailableWorkspaces(reconciliation.workspaces);
      activeWorkspaceRef.current = reconciliation.activeWorkspace;
      setActiveWorkspace(reconciliation.activeWorkspace);
      setWorkspaceCatalogLoading(false);
      setWorkspaceCatalogError(
        persistenceResult === 'revoked'
          ? 'Offline workspace access stays locked until retry.'
          : '',
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
      void saveOfflineWorkspaceContext(principalId, {
        activeWorkspaceId: navigationWorkspace.id,
        unavailableWorkspaceIds: Array.from(unavailableWorkspaceIdsRef.current),
        workspaces: availableWorkspaces,
      }).catch(() => undefined);
    }
  }, [
    activeNavigationSession?.routePlan.clientId,
    availableWorkspaces,
    session,
  ]);

  const openSignIn = (message = DEFAULT_SIGN_IN_PROMPT) => {
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
    if (navigationCleanupRequiredRef.current) {
      setSessionMessage('Finish saved-guidance cleanup before starting another route.');
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
    if (
      authenticated &&
      !freshWorkspaceAuthorizationRef.current.workspaceIds.has(routeWorkspaceId)
    ) {
      setSessionMessage('Reconnect and refresh workspace access before starting guidance.');
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
      activeNavigationSession.routePlan.route.id !== routePlan.route.id
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
    if (navigationCleanupRequiredRef.current) {
      setSessionMessage('Finish saved-guidance cleanup before starting another route.');
      return;
    }
    if (!activeWorkspace || routePlan.clientId !== activeWorkspace.id) {
      setSessionMessage('The active workspace changed. Choose the saved route again.');
      return;
    }
    if (!freshWorkspaceAuthorizationRef.current.workspaceIds.has(routePlan.clientId)) {
      setSessionMessage('Reconnect and refresh workspace access before starting guidance.');
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
      activeNavigationSession.routePlan.route.id !== routePlan.route.id
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
              activeNavigationSession?.routePlan.route.id === selectedRoute.route.id
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
            onWorkspaceChange={handleActiveWorkspaceChange}
            workspaceCatalogError={workspaceCatalogError}
            workspaceCatalogLoading={workspaceCatalogLoading}
            workspaceAccessRefreshAvailable={workspaceAccessRefreshAvailable}
            workspaceSwitchDisabled={navigationWorkspaceLocked}
          />
        ) : screen === 'operations' && session && authenticated ? (
          <OperationsScreen
            accessToken={session.accessToken}
            activeWorkspace={activeWorkspace}
            availableWorkspaces={availableWorkspaces}
            initialTab={operationsTab}
            sessionNotice={routeListSessionNotice}
            userEmail={session.user?.email || session.email}
            onBackToMap={returnToMapHome}
            onRetryWorkspaceCatalog={handleRetryWorkspaceCatalog}
            onSessionExpired={handleSessionExpired}
            onSignOut={handleSignOut}
            onWorkspaceUnavailable={handleWorkspaceUnavailable}
            onWorkspaceChange={handleActiveWorkspaceChange}
            workspaceCatalogError={workspaceCatalogError}
            workspaceCatalogLoading={workspaceCatalogLoading}
            workspaceAccessRefreshAvailable={workspaceAccessRefreshAvailable}
            workspaceSwitchDisabled={navigationWorkspaceLocked}
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
            onWorkspaceChange={handleActiveWorkspaceChange}
            workspaceCatalogError={workspaceCatalogError}
            workspaceCatalogLoading={workspaceCatalogLoading}
            workspaceAuthorizationFresh={activeWorkspaceAuthorizationFresh}
            workspaceAccessRefreshAvailable={workspaceAccessRefreshAvailable}
            workspaceSwitchDisabled={navigationWorkspaceLocked}
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
            offline={offline}
            routeName={pendingNavigationRestore.session.routePlan.name}
            status={pendingNavigationRestore.status}
            onEnd={() => {
              discardPersistedNavigation('Suspended route ended.');
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
  await recordGuidanceContractEvidence({
    authorization: {
      catalog: unavailableWorkspaceIds.length ? 'fresh-denied' : 'fresh-authorized',
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
