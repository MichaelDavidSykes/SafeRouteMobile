import { useEffect, useState } from 'react';
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
  hasAuthenticatedSession,
  resolveFullAccessNavigation,
  routePreviewReturnCopy,
  screenAfterAuthentication,
  screenAfterRoutePreview,
  type AppScreen,
  type RoutePreviewSource
} from './src/features/navigation/appRouting';
import { OperationsScreen } from './src/features/operations/OperationsScreen';
import type { OperationsTab } from './src/features/operations/operationsUiState';
import { RouteListScreen } from './src/features/routes/RouteListScreen';
import { uiTestIds } from './src/testing/uiTestIds';
import { colors } from './src/theme';

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
  const authenticated = hasAuthenticatedSession(session);

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
      setSession(createPreviewAuthSession());
      setSessionMessage(PREVIEW_SESSION_NOTICE);
      setScreen(screenForAuthenticatedPreview(previewInitialScreen));
      return true;
    };

    const restoreSession = async () => {
      setAuthPrompt('');
      setSelectedRoute(null);
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
          if (persistedNavigation) {
            openActiveNavigationSession(persistedNavigation, true);
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
    setSession(persistedSession);
    const persistedNavigation = await loadActiveNavigationSession();
    if (
      !persistedNavigation ||
      !openActiveNavigationSession(persistedNavigation, true)
    ) {
      setScreen(screenAfterAuthentication());
    }
  };

  const handleSignOut = async () => {
    await stopBackgroundNavigation();
    await clearActiveNavigationSession();
    await clearAuthSession();
    setActiveNavigationSession(null);
    setSelectedRoute(null);
    setSessionMessage('');
    setAuthPrompt('');
    setOperationsTab('planned-routes');
    setSession(null);
    setScreen('guest-map');
  };

  const returnToMapHome = () => {
    setSelectedRoute(null);
    setSessionMessage('');
    setAuthPrompt('');
    setOperationsTab('planned-routes');
    setScreen('guest-map');
  };

  const handleSessionExpired = async (message = 'Your LunarChain session expired. Sign in again.') => {
    await stopBackgroundNavigation();
    await clearActiveNavigationSession();
    await clearAuthSession();
    setActiveNavigationSession(null);
    setSelectedRoute(null);
    setSessionMessage(message);
    setAuthPrompt(message);
    setOperationsTab('planned-routes');
    setSession(null);
    setScreen('login');
  };

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
      openSignIn(nextNavigation.prompt);
      return;
    }

    if (nextNavigation.screen === 'operations') {
      setSessionMessage('');
      setOperationsTab(nextNavigation.tab);
      setScreen('operations');
      return;
    }

    setSessionMessage(nextNavigation.prompt);
    setScreen(nextNavigation.screen);
  };

  const openRoutePreview = (routePlan: SavedSafeRoutePlan) => {
    if (
      activeNavigationSession &&
      activeNavigationSession.routePlan.route.id !== routePlan.route.id
    ) {
      setActiveNavigationSession(null);
      void stopBackgroundNavigation();
      void clearActiveNavigationSession();
    }
    setSelectedRoute(routePlan);
    setRoutePreviewSource('guest');
    setScreen('route-preview');
  };

  const handleSelectSavedRoute = (routePlan: SavedSafeRoutePlan) => {
    if (
      activeNavigationSession &&
      activeNavigationSession.routePlan.route.id !== routePlan.route.id
    ) {
      setActiveNavigationSession(null);
      void stopBackgroundNavigation();
      void clearActiveNavigationSession();
    }
    setSelectedRoute(routePlan);
    setRoutePreviewSource('saved');
    setScreen('route-preview');
  };

  const returnFromRoutePreview = () => {
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
            onNavigationSessionChange={setActiveNavigationSession}
          />
        ) : screen === 'routes' && session && authenticated ? (
          <RouteListScreen
            accessToken={session.accessToken}
            sessionNotice={routeListSessionNotice}
            userEmail={session.user?.email || session.email}
            onBackToMap={returnToMapHome}
            onSelectRoute={handleSelectSavedRoute}
            onSessionExpired={handleSessionExpired}
            onSignOut={handleSignOut}
          />
        ) : screen === 'operations' && session && authenticated ? (
          <OperationsScreen
            accessToken={session.accessToken}
            initialTab={operationsTab}
            sessionNotice={routeListSessionNotice}
            userEmail={session.user?.email || session.email}
            onBackToMap={returnToMapHome}
            onSessionExpired={handleSessionExpired}
            onSignOut={handleSignOut}
          />
        ) : (
          <GuestMapScreen
            accessToken={session?.accessToken || null}
            authenticated={authenticated}
            onOpenFullAccessFeature={openFullAccessFeature}
            onOpenRoutePreview={openRoutePreview}
            onSessionExpired={handleSessionExpired}
            onSignIn={() => openSignIn()}
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
