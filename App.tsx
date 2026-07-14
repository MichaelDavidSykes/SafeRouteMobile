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
import { clearAuthSession, loadAuthSession, saveAuthSession } from './src/features/auth/authStorage';
import {
  createPreviewLoginCodeChallenge,
  createPreviewAuthSession,
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
  resolveWorkspaceAccessRecovery
} from './src/features/workspaces/workspaceAccessRecovery';

export default function App() {
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
  const pendingFullAccessFeatureRef = useRef<GuestFullAccessFeature | null>(null);
  const activeSessionTokenRef = useRef(session?.accessToken || null);
  const sessionCleanupRef = useRef<Promise<unknown> | null>(null);
  const sessionEpochRef = useRef(0);
  const sessionExpiryHandledRef = useRef(false);
  const workspaceRequestRevisionRef = useRef(0);
  const activeWorkspaceRef = useRef<SafeRouteWorkspace | null>(null);
  const availableWorkspacesRef = useRef<SafeRouteWorkspace[]>([]);
  const unavailableWorkspaceIdsRef = useRef(new Set<string>());
  const activeNavigationSessionRef = useRef<ActiveNavigationSession | null>(
    activeNavigationSession,
  );
  const selectedRouteRef = useRef<SavedSafeRoutePlan | null>(selectedRoute);
  const routePreviewSourceRef = useRef<RoutePreviewSource>(routePreviewSource);
  const authenticated = hasAuthenticatedSession(session);
  const sessionEpoch = sessionEpochRef.current;
  activeSessionTokenRef.current = session?.accessToken || null;
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
    sessionAuthenticated: boolean
  ) => {
    if (!canResumeActiveNavigationSession(nextNavigationSession, sessionAuthenticated)) {
      return false;
    }

    setActiveNavigationSession(nextNavigationSession);
    setSelectedRoute(nextNavigationSession.routePlan);
    setRoutePreviewSource(nextNavigationSession.routeContext);
    setScreen('route-preview');
    return true;
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
      setSession(createPreviewAuthSession());
      setSessionMessage(PREVIEW_SESSION_NOTICE);
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
            !openActiveNavigationSession(persistedNavigation, false)
          ) {
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
              !openActiveNavigationSession(persistedNavigation, false))
          ) {
            setSessionMessage(restoreResult.message);
          }
        } else if (restoreResult.status === 'restored' && mounted) {
          setSessionMessage(restoreResult.message || '');
          setSession(restoreResult.session);
          if (!persistedNavigation || !openActiveNavigationSession(persistedNavigation, true)) {
            const pendingFeature = takePendingFullAccessFeature();
            if (pendingFeature) {
              openAuthenticatedFeature(pendingFeature);
            } else {
              setScreen('guest-map');
            }
          }
        }
      } catch {
        await clearAuthSession();
        if (
          mounted &&
          (!persistedNavigation ||
            !openActiveNavigationSession(persistedNavigation, false))
        ) {
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
    sessionExpiryHandledRef.current = false;
    setSession(persistedSession);
    const pendingFeature = takePendingFullAccessFeature();
    const persistedNavigation = await loadActiveNavigationSession();
    if (
      !persistedNavigation ||
      !openActiveNavigationSession(persistedNavigation, true)
    ) {
      const nextNavigation = resolvePostAuthenticationNavigation(pendingFeature);
      if (nextNavigation.screen === 'operations') {
        setOperationsTab(nextNavigation.tab);
      }
      setScreen(nextNavigation.screen);
    }
  };

  const handleSignOut = async () => {
    workspaceRequestRevisionRef.current += 1;
    unavailableWorkspaceIdsRef.current.clear();
    sessionEpochRef.current += 1;
    activeSessionTokenRef.current = null;
    sessionExpiryHandledRef.current = true;
    await stopBackgroundNavigation();
    await clearActiveNavigationSession();
    await clearAuthSession();
    setActiveNavigationSession(null);
    setSelectedRoute(null);
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
    pendingFullAccessFeatureRef.current = screen === 'operations'
      ? fullAccessFeatureForOperationsTab(operationsTab)
      : screen === 'routes'
        ? 'saved-routes'
        : screen === 'route-preview' && routePreviewSource === 'saved'
          ? 'saved-routes'
          : null;
    const cleanup = Promise.allSettled([
      stopBackgroundNavigation(),
      clearActiveNavigationSession(),
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
    const accessToken = session?.accessToken?.trim();
    const userEmail = (session?.user?.email || session?.email || '').trim();

    if (!accessToken || !authenticated) {
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
      const cachedContext = await loadOfflineWorkspaceContext(userEmail);
      if (revision !== workspaceRequestRevisionRef.current) {
        return;
      }

      const legacyRouteCache = cachedContext
        ? null
        : await loadOfflineRoutes(userEmail, null);
      if (revision !== workspaceRequestRevisionRef.current) {
        return;
      }

      const cachedCatalog = excludeUnavailableWorkspaces(
        normalizeWorkspaceCatalog(
          cachedContext?.workspaces || legacyRouteCache?.clients || [],
        ),
        unavailableWorkspaceIdsRef.current,
      );
      if (cachedCatalog.length) {
        const cachedWorkspace = resolveActiveWorkspace(
          cachedCatalog,
          activeNavigationSession?.routePlan.clientId || activeWorkspaceRef.current?.id,
          cachedContext?.activeWorkspaceId || legacyRouteCache?.selectedClientId,
        );
        setAvailableWorkspaces(cachedCatalog);
        activeWorkspaceRef.current = cachedWorkspace;
        setActiveWorkspace(cachedWorkspace);
      }

      try {
        const result = await fetchSavedRoutes(accessToken);
        if (revision !== workspaceRequestRevisionRef.current) {
          return;
        }

        const catalog = excludeUnavailableWorkspaces(
          normalizeWorkspaceCatalog(result.clients),
          unavailableWorkspaceIdsRef.current,
        );
        const currentNavigation = activeNavigationSessionRef.current;
        const currentPreview = selectedRouteRef.current;
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
        if (navigationWorkspaceRevoked || previewWorkspaceRevoked) {
          if (navigationWorkspaceRevoked) {
            activeNavigationSessionRef.current = null;
            setActiveNavigationSession(null);
            void Promise.allSettled([
              stopBackgroundNavigation(),
              clearActiveNavigationSession(),
            ]);
          }
          selectedRouteRef.current = null;
          setSelectedRoute(null);
          setScreen((currentScreen) =>
            currentScreen === 'route-preview' ? 'guest-map' : currentScreen,
          );
          setSessionMessage(
            navigationWorkspaceRevoked
              ? 'Active guidance ended because this workspace is no longer available.'
              : 'This route closed because its workspace is no longer available.',
          );
        }
        const resolvedWorkspace = resolveActiveWorkspace(
          catalog,
          activeNavigationSessionRef.current?.routePlan.clientId || activeWorkspaceRef.current?.id,
          result.selectedClientId,
        );
        setAvailableWorkspaces(catalog);
        activeWorkspaceRef.current = resolvedWorkspace;
        setActiveWorkspace(resolvedWorkspace);
        void saveOfflineWorkspaceContext(userEmail, {
          activeWorkspaceId: resolvedWorkspace?.id || null,
          workspaces: catalog,
        }).catch(() => undefined);
      } catch (error) {
        if (revision !== workspaceRequestRevisionRef.current) {
          return;
        }
        if (error instanceof ApiSessionExpiredError) {
          void handleSessionExpired(error.message);
          return;
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

  const handleActiveWorkspaceChange = useCallback((workspace: SafeRouteWorkspace | null) => {
    if (
      activeNavigationSession &&
      workspace?.id !== activeWorkspace?.id
    ) {
      return;
    }
    const nextWorkspace = workspace
      ? findWorkspace(availableWorkspaces, workspace.id)
      : null;
    activeWorkspaceRef.current = nextWorkspace;
    setActiveWorkspace(nextWorkspace);
    const userEmail = (session?.user?.email || session?.email || '').trim();
    void saveOfflineWorkspaceContext(userEmail, {
      activeWorkspaceId: nextWorkspace?.id || null,
      workspaces: availableWorkspaces,
    }).catch(() => undefined);
  }, [activeNavigationSession, activeWorkspace?.id, availableWorkspaces, session?.email, session?.user?.email]);

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
    unavailableWorkspaceIdsRef.current.add(normalizedWorkspaceId);
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
      activeNavigationSessionRef.current = null;
      setActiveNavigationSession(null);
      void Promise.allSettled([
        stopBackgroundNavigation(),
        clearActiveNavigationSession(),
      ]);
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

    const userEmail = (session?.user?.email || session?.email || '').trim();
    void Promise.allSettled([
      clearOfflineRouteWorkspace(userEmail, normalizedWorkspaceId),
      saveOfflineWorkspaceContext(userEmail, {
        activeWorkspaceId: recovery.activeWorkspace?.id || null,
        workspaces: recovery.workspaces,
      }),
    ]);
    setWorkspaceDiscoveryRevision((revision) => revision + 1);
  }, [session?.email, session?.user?.email]);

  const handleNavigationSessionChange = useCallback((nextSession: ActiveNavigationSession | null) => {
    const workspaceId = nextSession?.routePlan.clientId?.trim() || '';
    if (
      workspaceId &&
      (
        unavailableWorkspaceIdsRef.current.has(workspaceId) ||
        activeWorkspaceRef.current?.id !== workspaceId
      )
    ) {
      return;
    }

    activeNavigationSessionRef.current = nextSession;
    setActiveNavigationSession(nextSession);
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
      const userEmail = (session?.user?.email || session?.email || '').trim();
      void saveOfflineWorkspaceContext(userEmail, {
        activeWorkspaceId: navigationWorkspace.id,
        workspaces: availableWorkspaces,
      }).catch(() => undefined);
    }
  }, [
    activeNavigationSession?.routePlan.clientId,
    availableWorkspaces,
    session?.email,
    session?.user?.email,
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
      activeNavigationSession &&
      activeNavigationSession.routePlan.route.id !== routePlan.route.id
    ) {
      handleNavigationSessionChange(null);
      void stopBackgroundNavigation();
      void clearActiveNavigationSession();
    }
    selectedRouteRef.current = routePlan;
    setSelectedRoute(routePlan);
    setRoutePreviewSource('guest');
    setScreen('route-preview');
  };

  const handleSelectSavedRoute = (routePlan: SavedSafeRoutePlan) => {
    if (!activeWorkspace || routePlan.clientId !== activeWorkspace.id) {
      setSessionMessage('The active workspace changed. Choose the saved route again.');
      return;
    }
    if (
      activeNavigationSession &&
      activeNavigationSession.routePlan.route.id !== routePlan.route.id
    ) {
      handleNavigationSessionChange(null);
      void stopBackgroundNavigation();
      void clearActiveNavigationSession();
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

    openActiveNavigationSession(persistedNavigation, authenticated);
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
          />
        ) : screen === 'routes' && session && authenticated ? (
          <RouteListScreen
            accessToken={session.accessToken}
            activeWorkspace={activeWorkspace}
            availableWorkspaces={availableWorkspaces}
            onRetryWorkspaceCatalog={() => {
              setWorkspaceDiscoveryRevision((revision) => revision + 1);
            }}
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
            workspaceSwitchDisabled={Boolean(activeNavigationSession)}
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
            onRetryWorkspaceCatalog={() => {
              setWorkspaceDiscoveryRevision((revision) => revision + 1);
            }}
            onSessionExpired={handleSessionExpired}
            onSignOut={handleSignOut}
            onWorkspaceUnavailable={handleWorkspaceUnavailable}
            onWorkspaceChange={handleActiveWorkspaceChange}
            workspaceCatalogError={workspaceCatalogError}
            workspaceCatalogLoading={workspaceCatalogLoading}
            workspaceSwitchDisabled={Boolean(activeNavigationSession)}
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
            sessionNotice={session && !isPreviewAccessToken(session.accessToken)
              ? sessionMessage
              : ''}
            onRetryWorkspaceCatalog={() => {
              setWorkspaceDiscoveryRevision((revision) => revision + 1);
            }}
            onSignIn={() => {
              pendingFullAccessFeatureRef.current = null;
              openSignIn();
            }}
            onWorkspaceChange={handleActiveWorkspaceChange}
            workspaceCatalogError={workspaceCatalogError}
            workspaceCatalogLoading={workspaceCatalogLoading}
            workspaceSwitchDisabled={Boolean(activeNavigationSession)}
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
