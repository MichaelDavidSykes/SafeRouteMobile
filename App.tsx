import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { SAFEROUTE_PREVIEW_MODE_ENABLED } from './src/config/env';
import { getCurrentUser } from './src/features/auth/authApi';
import { LoginScreen } from './src/features/auth/LoginScreen';
import { prepareAuthenticatedSession } from './src/features/auth/authCompletion';
import { clearAuthSession, loadAuthSession, saveAuthSession } from './src/features/auth/authStorage';
import {
  createPreviewAuthSession,
  isPreviewAccessToken,
  PREVIEW_SESSION_NOTICE
} from './src/features/auth/previewSession';
import { restoreSavedSession } from './src/features/auth/sessionRestore';
import type { AuthSession } from './src/features/auth/authTypes';
import { GuestMapScreen } from './src/features/guest-map/GuestMapScreen';
import type { GuestFullAccessFeature } from './src/features/guest-map/guestRoutePlanner';
import { LiveMapScreen } from './src/features/live-map/LiveMapScreen';
import type { SavedSafeRoutePlan } from './src/features/live-map/liveMapTypes';
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
import { RouteListScreen } from './src/features/routes/RouteListScreen';
import { uiTestIds } from './src/testing/uiTestIds';
import { colors } from './src/theme';

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<SavedSafeRoutePlan | null>(null);
  const [sessionMessage, setSessionMessage] = useState('');
  const [authPrompt, setAuthPrompt] = useState('');
  const [screen, setScreen] = useState<AppScreen>('guest-map');
  const [routePreviewSource, setRoutePreviewSource] = useState<RoutePreviewSource>('guest');
  const authenticated = hasAuthenticatedSession(session);

  useEffect(() => {
    let mounted = true;

    const enablePreviewSession = () => {
      if (!SAFEROUTE_PREVIEW_MODE_ENABLED || !mounted) {
        return false;
      }

      setSession(createPreviewAuthSession());
      setSessionMessage(PREVIEW_SESSION_NOTICE);
      return true;
    };

    const restoreSession = async () => {
      setAuthPrompt('');
      setSelectedRoute(null);
      setScreen('guest-map');

      try {
        const storedSession = await loadAuthSession();

        if (!storedSession) {
          enablePreviewSession();
          return;
        }

        const restoreResult = await restoreSavedSession(storedSession, getCurrentUser);

        if (restoreResult.status === 'expired') {
          await clearAuthSession();
          if (!enablePreviewSession() && mounted) {
            setSessionMessage(restoreResult.message);
          }
        } else if (restoreResult.status === 'restored' && mounted) {
          setSessionMessage(restoreResult.message || '');
          setSession(restoreResult.session);
        }
      } catch {
        await clearAuthSession();
        enablePreviewSession();
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
    setScreen(screenAfterAuthentication());
  };

  const handleSignOut = async () => {
    await clearAuthSession();
    setSelectedRoute(null);
    setSessionMessage('');
    setAuthPrompt('');
    setSession(null);
    setScreen('guest-map');
  };

  const returnToMapHome = () => {
    setSelectedRoute(null);
    setSessionMessage('');
    setAuthPrompt('');
    setScreen('guest-map');
  };

  const handleSessionExpired = async (message = 'Your LunarChain session expired. Sign in again.') => {
    await clearAuthSession();
    setSelectedRoute(null);
    setSessionMessage(message);
    setAuthPrompt(message);
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

    setSessionMessage(nextNavigation.prompt);
    setScreen(nextNavigation.screen);
  };

  const openRoutePreview = (routePlan: SavedSafeRoutePlan) => {
    setSelectedRoute(routePlan);
    setRoutePreviewSource('guest');
    setScreen('route-preview');
  };

  const handleSelectSavedRoute = (routePlan: SavedSafeRoutePlan) => {
    setSelectedRoute(routePlan);
    setRoutePreviewSource('saved');
    setScreen('route-preview');
  };

  const returnFromRoutePreview = () => {
    setSelectedRoute(null);
    setScreen(screenAfterRoutePreview(routePreviewSource, authenticated));
  };

  const returnCopy = routePreviewReturnCopy(routePreviewSource);
  const routeListSessionNotice =
    session && isPreviewAccessToken(session.accessToken)
      ? PREVIEW_SESSION_NOTICE
      : sessionMessage;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.root}>
      <View testID={uiTestIds.appRoot} style={styles.root}>
        <StatusBar style="dark" />
        {screen === 'login' ? (
          <LoginScreen
            sessionMessage={authPrompt || sessionMessage}
            onAuthenticated={handleAuthenticated}
            onCancel={() => {
              setAuthPrompt('');
              setScreen('guest-map');
            }}
          />
        ) : screen === 'route-preview' && selectedRoute ? (
          <LiveMapScreen
            returnAccessibilityLabel={returnCopy.accessibilityLabel}
            returnLabel={returnCopy.label}
            routeContext={routePreviewSource}
            routePlan={selectedRoute}
            onChangeRoute={returnFromRoutePreview}
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
        ) : (
          <GuestMapScreen
            authenticated={authenticated}
            onOpenFullAccessFeature={openFullAccessFeature}
            onOpenRoutePreview={openRoutePreview}
            onSignIn={() => openSignIn()}
          />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.control
  }
});
