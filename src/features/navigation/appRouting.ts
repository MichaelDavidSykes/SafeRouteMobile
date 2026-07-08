import { getGuestFullAccessCopy, type GuestFullAccessFeature } from '../guest-map/guestRoutePlanner';

export type AppScreen = 'guest-map' | 'login' | 'routes' | 'route-preview';
export type RoutePreviewSource = 'guest' | 'saved';

export type FullAccessNavigation =
  | {
      screen: 'login';
      prompt: string;
    }
  | {
      screen: 'routes';
      prompt: '';
    };

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

  return {
    screen: 'routes',
    prompt: ''
  };
}

export function screenAfterAuthentication(): AppScreen {
  return 'guest-map';
}

export function routePreviewReturnCopy(source: RoutePreviewSource): RoutePreviewReturnCopy {
  return source === 'guest'
    ? {
        accessibilityLabel: 'Return to map',
        label: 'Map'
      }
    : {
        accessibilityLabel: 'Return to saved routes',
        label: 'Saved'
      };
}

export function screenAfterRoutePreview(source: RoutePreviewSource, authenticated: boolean): AppScreen {
  if (source === 'guest') {
    return 'guest-map';
  }

  return authenticated ? 'routes' : 'guest-map';
}
