export interface AuthenticatedUser {
  email: string;
  id?: string;
  name?: string;
}

export interface AuthSession {
  accessToken: string;
  email: string;
  principalId?: string;
  user?: AuthenticatedUser;
}

export interface TwoFactorChallenge {
  email: string;
  challengeToken: string;
  method: string;
  expiresAt?: string;
}

export type PasswordLoginResult =
  | {
      status: 'authenticated';
      session: AuthSession;
    }
  | {
      status: 'two-factor';
      challenge: TwoFactorChallenge;
    };
