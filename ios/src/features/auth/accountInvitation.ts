const INVITATION_TOKEN_MIN_LENGTH = 8;
const INVITATION_TOKEN_MAX_LENGTH = 2048;
const TRUSTED_INVITATION_HOSTS = new Set([
  'app.lunarchain.net',
  'lunarchain.net',
  'www.lunarchain.net',
]);
const TRUSTED_INVITATION_PATHS = new Set(['/login', '/register', '/verify']);

export interface AccountInvitation {
  clientId: string;
  clientName: string;
  email: string;
  hasAccount: boolean;
  token: string;
}

export interface AccountInvitationPayload {
  client_id?: string;
  client_name?: string;
  email?: string;
  has_account?: boolean;
}

export function extractInvitationTokenFromUrl(value: string | null | undefined): string {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    return '';
  }

  if (!isTrustedInvitationUrl(url)) {
    return '';
  }

  const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const token = String(
    url.searchParams.get('invite_token') ||
      new URLSearchParams(fragment).get('invite_token') ||
      ''
  ).trim();

  return token.length >= INVITATION_TOKEN_MIN_LENGTH &&
    token.length <= INVITATION_TOKEN_MAX_LENGTH
    ? token
    : '';
}

export function createAccountInvitation(
  token: string,
  payload: AccountInvitationPayload
): AccountInvitation {
  return {
    clientId: String(payload.client_id || '').trim(),
    clientName: String(payload.client_name || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    hasAccount: payload.has_account === true,
    token: token.trim(),
  };
}

function isTrustedInvitationUrl(url: URL): boolean {
  const protocol = url.protocol.toLowerCase();
  const path = normalizeInvitationPath(url.pathname || url.hostname);

  if (protocol === 'saferoute:') {
    return TRUSTED_INVITATION_PATHS.has(path);
  }

  return protocol === 'https:' &&
    TRUSTED_INVITATION_HOSTS.has(url.hostname.toLowerCase()) &&
    TRUSTED_INVITATION_PATHS.has(path);
}

function normalizeInvitationPath(value: string): string {
  const normalized = `/${String(value || '').trim().replace(/^\/+|\/+$/g, '')}`;
  return normalized === '/' ? '/login' : normalized.toLowerCase();
}
