import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import {
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
import { stopBackgroundNavigation } from './src/features/live-map/backgroundNavigation';
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
  saveOfflineWorkspaceContext
} from './src/features/workspaces/offlineWorkspaceCache';
import {
  excludeUnavailableWorkspaces,
  findAuthoritativelyUnavailableWorkspaceIds,
  resolveWorkspaceAccessRecovery
} from './src/features/workspaces/workspaceAccessRecovery';
import { reconcileUnavailableWorkspaceIds } from './src/features/workspaces/workspaceMembershipRevalidation';
import { shouldOfferWorkspaceAccessRefresh } from './src/features/workspaces/workspaceAccessRefreshState';
import { SuspendedNavigationNotice } from './src/features/live-map/SuspendedNavigationNotice';
import { NavigationCleanupNotice } from './src/features/live-map/NavigationCleanupNotice';
import type { SuspendedNavigationStatus } from './src/features/live-map/suspendedNavigationState';

type PendingNavigationRestore = {
  session: ActiveNavigationSession;
  status: SuspendedNavigationStatus;
};

type NavigationCleanupStatus = 'idle' | 'checking' | 'failed';

export default function App() {
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
  const [workspaceCatalogRetrying, setWorkspaceCatalogRetrying] = useState(false);
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
  const workspaceCatalogRetryingRef = useRef(false);
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
  const workspaceAccessRecoveryPending = unavailableWorkspaceIdsRef.current.size > 0;
  const workspaceAccessRefreshAvailable = shouldOfferWorkspaceAccessRefresh({
    accessRecoveryPending: workspaceAccessRecoveryPending,
    authenticated,
    availableWorkspaceCount: availableWorkspaces.length,
    catalogError: Boolean(workspaceCatalogError),
    catalogLoading: workspaceCatalogLoading,
    catalogRetrying: workspaceCatalogRetrying,
  });
  const workspaceCatalogBusy = workspaceCatalogLoading || workspaceCatalogRetrying;
  const navigationWorkspaceLocked = Boolean(
    activeNavigationSession || pendingNavigationRestore,
  );
  const sessionEpoch = sessionEpochRef.current;
  activeSessionTokenRef.current = session?.accessToken || null;
  activeSessionPrincipalIdRef.current = getAuthSessionPrincipalId(session);
  activeWorkspaceRef.current = activeWorkspace;
  availableWorkspacesRef.current = availableWorkspaces;
  activeNavigationSessionRef.current = activeNavigationSession;
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

  const performPersistedNavigationCleanup = async () => {
    if (navigationCleanupPromiseRef.current) {
      return navigationCleanupPromiseRef.current;
    }

    navigationCleanupRequiredRef.current = true;
    setNavigationCleanupStatus('checking');
    const cleanupPromise = Promise.allSettled([
      stopBackgroundNavigation(),
      clearActiveNavigationSession(),
    ]).then((cleanup) => {
      const durableClearSucceeded =
        cleanup[1].status === 'fulfilled' && cleanup[1].value === true;
      navigationCleanupRequiredRef.current = !durableClearSucceeded;
      setNavigationCleanupStatus(durableClearSucceeded ? 'idle' : 'failed');
      return durableClearSucceeded;
    }).finally(() => {
      navigationCleanupPromiseRef.current = null;
    });
    navigationCleanupPromiseRef.current = cleanupPromise;
    return cleanupPromise;
  };

  const discardPersistedNavigation = async (message?: string) => {
    pendingNavigationRestoreRef.current = null;
    setPendingNavigationRestore(null);
    activeNavigationSessionRef.current = null;
    selectedRouteRef.current = null;
    setActiveNavigationSession(null);
    setSelectedRoute(null);
    const durableClearSucceeded = await performPersistedNavigationCleanup();
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
    const durableClearSucceeded = await performPersistedNavigationCleanup();
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
      workspaceCatalogRetryingRef.current = false;
      setWorkspaceCatalogRetrying(false);
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
      workspaceCatalogRetryingRef.current = false;
      setWorkspaceCatalogRetrying(false);
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
    workspaceCatalogRetryingRef.current = false;
    setWorkspaceCatalogRetrying(false);
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
    workspaceCatalogRetryingRef.current = false;
    setWorkspaceCatalogRetrying(false);
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
    workspaceCatalogRetryingRef.current = false;
    setWorkspaceCatalogRetrying(false);
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
      workspaceCatalogRetryingRef.current = false;
      setWorkspaceCatalogRetrying(false);
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
        const previousUnavailableWorkspaceCount = unavailableWorkspaceIdsRef.current.size;
        const unavailableWorkspaceIds = reconcileUnavailableWorkspaceIds({
          allowFreshRestoration: allowFreshWorkspaceRestoration,
          freshWorkspaces: normalizedCatalog,
          unavailableWorkspaceIds: unavailableWorkspaceIdsRef.current,
        });
        const workspaceAccessRestored =
          unavailableWorkspaceIds.size < previousUnavailableWorkspaceCount;
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
        const catalog = excludeUnavailableWorkspaces(
          normalizedCatalog,
          unavailableWorkspaceIds,
        );
        freshWorkspaceAuthorizationRef.current = {
          principalId,
          workspaceIds: new Set(catalog.map((workspace) => workspace.id)),
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
              catalog,
              currentNavigation.routeContext,
              currentNavigation.routePlan.clientId,
            )
          : false;
        const previewWorkspaceRevoked = currentPreview
          ? !canRetainRouteWorkspace(
              catalog,
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

        // Publish fresh authorization immediately. If a later cache cleanup or
        // persistence write fails, stale workspace state must not remain usable.
        unavailableWorkspaceIdsRef.current = unavailableWorkspaceIds;
        availableWorkspacesRef.current = catalog;
        setAvailableWorkspaces(catalog);
        activeWorkspaceRef.current = resolvedWorkspace;
        setActiveWorkspace(resolvedWorkspace);
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
        const workspaceContextPersistence = saveOfflineWorkspaceContext(principalId, {
          activeWorkspaceId: resolvedWorkspace?.id || null,
          unavailableWorkspaceIds: Array.from(unavailableWorkspaceIds),
          workspaces: catalog,
        }).catch(() => undefined);
        const routeCacheCleanup = authoritativelyUnavailableWorkspaceIds.length
          ? Promise.allSettled(
            authoritativelyUnavailableWorkspaceIds.map((workspaceId) =>
              clearOfflineRouteWorkspace(principalId, workspaceId),
            ),
          )
          : Promise.resolve([]);
        await Promise.all([
          currentNavigationCleanup,
          pendingNavigationCleanup,
          workspaceContextPersistence,
          routeCacheCleanup,
        ]);
        if (!requestIsCurrent()) {
          return;
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

  const handleRetryWorkspaceCatalog = useCallback(() => {
    if (workspaceCatalogRetryingRef.current) {
      return;
    }
    workspaceCatalogRetryingRef.current = true;
    if (pendingNavigationRestoreRef.current) {
      setPendingNavigationRestoreStatus('checking');
      setSessionMessage('Checking workspace access before restoring guidance…');
    }
    restoreUnavailableWorkspacesFromFreshCatalogRef.current = true;
    setWorkspaceCatalogRetrying(true);
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

  const handleWorkspaceUnavailable = useCallback((workspaceId: string) => {
    const normalizedWorkspaceId = workspaceId.trim();
    const recovery = resolveWorkspaceAccessRecovery(
      availableWorkspacesRef.current,
      activeWorkspaceRef.current?.id,
      normalizedWorkspaceId,
    );
    if (recovery.status === 'ignored') {
      return;
    }

    const unavailableWorkspace = activeWorkspaceRef.current;
    restoreUnavailableWorkspacesFromFreshCatalogRef.current = false;
    unavailableWorkspaceIdsRef.current.add(normalizedWorkspaceId);
    freshWorkspaceAuthorizationRef.current.workspaceIds.delete(normalizedWorkspaceId);
    workspaceRequestRevisionRef.current += 1;
    availableWorkspacesRef.current = recovery.workspaces;
    setAvailableWorkspaces(recovery.workspaces);
    activeWorkspaceRef.current = recovery.activeWorkspace;
    setActiveWorkspace(recovery.activeWorkspace);
    setWorkspaceCatalogError('');
    setWorkspaceCatalogLoading(true);

    const currentNavigation = activeNavigationSessionRef.current;
    const currentPreview = selectedRouteRef.current;
    const navigationUnavailable = currentNavigation?.routePlan.clientId === normalizedWorkspaceId;
    const previewUnavailable = currentPreview?.clientId === normalizedWorkspaceId;
    if (navigationUnavailable) {
      void discardPersistedNavigation(
        'Active guidance ended because this workspace is no longer available.',
      );
    }
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

    const principalId = getAuthSessionPrincipalId(session);
    void Promise.allSettled([
      clearOfflineRouteWorkspace(principalId, normalizedWorkspaceId),
      saveOfflineWorkspaceContext(principalId, {
        activeWorkspaceId: recovery.activeWorkspace?.id || null,
        unavailableWorkspaceIds: Array.from(unavailableWorkspaceIdsRef.current),
        workspaces: recovery.workspaces,
      }),
    ]);
    setWorkspaceDiscoveryRevision((revision) => revision + 1);
  }, [session]);

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
      (workspaceId && unavailableWorkspaceIdsRef.current.has(workspaceId))
    ) {
      return false;
    }

    activeNavigationSessionRef.current = nextSession;
    setActiveNavigationSession(nextSession);
    return true;
  }, []);

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
            workspaceCatalogLoading={workspaceCatalogBusy}
            workspaceAccessRecoveryPending={workspaceAccessRecoveryPending}
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
            workspaceCatalogLoading={workspaceCatalogBusy}
            workspaceAccessRecoveryPending={workspaceAccessRecoveryPending}
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
            workspaceCatalogLoading={workspaceCatalogBusy}
            workspaceAuthorizationFresh={activeWorkspaceAuthorizationFresh}
            workspaceAccessRecoveryPending={workspaceAccessRecoveryPending}
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
