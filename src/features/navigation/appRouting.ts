import { getGuestFullAccessCopy, type GuestFullAccessFeature } from '../guest-map/guestRoutePlanner';
import type { OperationsTab } from '../operations/operationsUiState';

export type AppScreen = 'guest-map' | 'login' | 'operations' | 'routes' | 'route-preview';
export type RoutePreviewSource = 'guest' | 'saved';

export type FullAccessNavigation =
  | {
      screen: 'login';
      prompt: string;
    }
  | {
      screen: 'routes';
      prompt: '';
    }
  | {
      screen: 'operations';
      prompt: '';
      tab: OperationsTab;
    };

export type PostAuthenticationNavigation =
  | {
      screen: 'guest-map';
      prompt: '';
    }
  | Exclude<FullAccessNavigation, { screen: 'login' }>;

export type RoutePreviewReturnCopy = {
  accessibilityLabel: string;
  label: string;
};

export const DEFAULT_SIGN_IN_PROMPT = 'Sign in to save and sync.';

export function hasAuthenticatedSession(session: { accessToken?: string | null } | null | undefined): boolean {
  return Boolean(String(session?.accessToken || '').trim());
}

export function createSignInPrompt(feature: GuestFullAccessFeature): string {
  const copy = getGuestFullAccessCopy(feature);
  return copy.action.endsWith('.') ? copy.action : `${copy.action}.`;
}

export function resolveFullAccessNavigation({
  authenticated,
  feature
}: {
  authenticated: boolean;
  feature: GuestFullAccessFeature;
}): FullAccessNavigation {
  if (!authenticated) {
    return {
      screen: 'login',
      prompt: createSignInPrompt(feature)
    };
  }

  if (feature === 'planned-trips') {
    return {
      screen: 'operations',
      prompt: '',
      tab: 'planned-routes'
    };
  }

  if (feature === 'calendar') {
    return {
      screen: 'operations',
      prompt: '',
      tab: 'calendar'
    };
  }

  if (feature === 'convoy-management') {
    return {
      screen: 'operations',
      prompt: '',
      tab: 'convoy-management'
    };
  }

  return {
    screen: 'routes',
    prompt: ''
  };
}

export function screenAfterAuthentication(): AppScreen {
  return 'guest-map';
}

export function resolvePostAuthenticationNavigation(
  pendingFeature: GuestFullAccessFeature | null | undefined
): PostAuthenticationNavigation {
  if (!pendingFeature) {
    return {
      screen: 'guest-map',
      prompt: ''
    };
  }

  return resolveFullAccessNavigation({
    authenticated: true,
    feature: pendingFeature
  }) as Exclude<FullAccessNavigation, { screen: 'login' }>;
}

export function fullAccessFeatureForOperationsTab(tab: OperationsTab): GuestFullAccessFeature {
  if (tab === 'calendar') {
    return 'calendar';
  }

  if (tab === 'convoy-management') {
    return 'convoy-management';
  }

  return 'planned-trips';
}

export function routePreviewReturnCopy(source: RoutePreviewSource): RoutePreviewReturnCopy {
  return source === 'guest'
    ? {
        accessibilityLabel: 'Return to map',
        label: 'Map'
      }
    : {
        accessibilityLabel: 'Return to saved routes',
        label: 'All routes'
      };
}

export function screenAfterRoutePreview(source: RoutePreviewSource, authenticated: boolean): AppScreen {
  if (source === 'guest') {
    return 'guest-map';
  }

  return authenticated ? 'routes' : 'guest-map';
}
