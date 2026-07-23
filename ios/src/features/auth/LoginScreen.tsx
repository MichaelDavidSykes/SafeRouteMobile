import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import { ArrowLeft, CircleCheck, Eye, EyeOff, LockKeyhole, MailCheck } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getUserFacingErrorMessage } from '../api/userFacingErrors';
import {
  SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED,
  SAFEROUTE_PREVIEW_MODE_ENABLED
} from '../../config/env';
import { MotionEntrance, useMotionValue } from '../../motion/SafeRouteMotion';
import { uiTestIds } from '../../testing/uiTestIds';
import {
  loginWithPassword,
  requestPasswordReset,
  resendLoginCode,
  resetPassword,
  verifyLoginCode
} from './authApi';
import { AuthBackdrop } from './AuthBackdrop';
import { CreateAccountScreen } from './CreateAccountScreen';
import type { AccountInvitation } from './accountInvitation';
import {
  resolveLoginCredentialDefaults,
  resolveLoginPasswordAutofillHints
} from './loginAutofillHints';
import { createLoginErrorState } from './loginErrorState';
import { createLoginHeaderState } from './loginHeaderState';
import { createLoginNoticeState } from './loginNoticeState';
import {
  getLoginMapReturnActionState,
  getLoginPrimaryActionState,
  getTwoFactorSecondaryActionState
} from './loginFormState';
import { resolveLoginViewportLayout } from './loginViewportLayout';
import {
  getPasswordResetError,
  getPasswordResetRequestError,
  PASSWORD_RESET_CONNECTION_MESSAGE
} from './passwordResetState';
import { styles } from './LoginScreen.styles';
import {
  getTwoFactorChallengeState,
  getTwoFactorRefreshDelayMs,
  getTwoFactorSubtitle,
  sanitizeLoginCode
} from './twoFactorChallenge';
import type { AuthSession, TwoFactorChallenge } from './authTypes';

const passwordAutofillHints = resolveLoginPasswordAutofillHints(
  SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED
);
const loginCredentialDefaults = resolveLoginCredentialDefaults(
  SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED
);

const LOGIN_CONNECTION_MESSAGE = 'Unable to reach LunarChain. Check your connection and try again.';
const ICON_BUTTON_HIT_SLOP = 8;

export type LoginInitialView =
  'credentials' | 'register' | 'register-verification' | 'reset-request' | 'reset-code';
type LoginView = LoginInitialView | 'mfa' | 'reset-success';
type FocusedField =
  | 'email'
  | 'password'
  | 'code'
  | 'reset-email'
  | 'reset-code'
  | 'reset-password'
  | 'reset-confirm'
  | null;

interface LoginScreenProps {
  invitation?: AccountInvitation | null;
  initialChallenge?: TwoFactorChallenge | null;
  initialEmail?: string;
  initialView?: LoginInitialView;
  sessionMessage?: string;
  onAuthenticated: (session: AuthSession) => Promise<void> | void;
  onCancel?: () => void;
  onInvitationConsumed?: () => void;
  onRetrySavedSession?: () => void;
  savedSessionRetrying?: boolean;
}

interface AuthHeaderProps {
  compact: boolean;
  icon: 'lock' | 'logo' | 'mail' | 'success';
  subtitle: string | null;
  subtitleAccessibilityLabel?: string | null;
  title: string;
  titleAccessibilityLabel: string;
}

function AuthHeader({
  compact,
  icon,
  subtitle,
  subtitleAccessibilityLabel,
  title,
  titleAccessibilityLabel
}: AuthHeaderProps) {
  const headerIcon =
    icon === 'logo' ? (
      <Image
        accessibilityIgnoresInvertColors
        accessibilityLabel="SafeRoute"
        source={require('../../../assets/logo-mark.png')}
        style={styles.flowLogo}
      />
    ) : (
      <View accessible={false} style={styles.flowIconTile}>
        {icon === 'lock' ? (
          <LockKeyhole color="#5CB0FF" size={28} strokeWidth={1.9} />
        ) : icon === 'success' ? (
          <CircleCheck color="#56D47B" size={30} strokeWidth={1.9} />
        ) : (
          <MailCheck color="#5CB0FF" size={29} strokeWidth={1.9} />
        )}
      </View>
    );

  return (
    <View style={[styles.flowHeader, compact ? styles.flowHeaderCompact : null]}>
      {headerIcon}
      <Text
        accessibilityLabel={titleAccessibilityLabel}
        accessibilityRole="header"
        style={styles.flowTitle}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          accessibilityLabel={subtitleAccessibilityLabel || undefined}
          style={styles.flowSubtitle}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

interface StatusBoxProps {
  accessibilityLabel?: string;
  children: ReactNode;
  testID?: string;
  tone: 'danger' | 'notice' | 'success';
}

function StatusBox({ accessibilityLabel, children, testID, tone }: StatusBoxProps) {
  const spokenMessage = accessibilityLabel || (typeof children === 'string' ? children : '');

  useEffect(() => {
    if (spokenMessage) {
      AccessibilityInfo.announceForAccessibility(spokenMessage);
    }
  }, [spokenMessage]);

  return (
    <View
      accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.statusBox,
        tone === 'danger'
          ? styles.errorBox
          : tone === 'success'
            ? styles.successBox
            : styles.noticeBox
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.statusText,
          tone === 'danger'
            ? styles.errorText
            : tone === 'success'
              ? styles.successText
              : styles.noticeText
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

function MfaCodeCell({
  filled,
  focused,
  value
}: {
  filled: boolean;
  focused: boolean;
  value: string;
}) {
  const emphasis = useMotionValue(filled || focused ? 1.06 : 1, {
    duration: 200
  });

  return (
    <Animated.View
      accessibilityElementsHidden
      accessible={false}
      style={[
        styles.codeCell,
        filled ? styles.codeCellFilled : null,
        focused ? styles.codeCellFocused : null,
        { transform: [{ scale: emphasis }] }
      ]}
    >
      <Text style={styles.codeCellText}>{value}</Text>
    </Animated.View>
  );
}

export function LoginScreen({
  invitation = null,
  initialChallenge = null,
  initialEmail = '',
  initialView = 'credentials',
  onCancel,
  onAuthenticated,
  onInvitationConsumed,
  onRetrySavedSession,
  savedSessionRetrying = false,
  sessionMessage
}: LoginScreenProps) {
  const initialLoginEmail =
    initialChallenge?.email || invitation?.email || initialEmail || loginCredentialDefaults.email;
  const [view, setView] = useState<LoginView>(
    initialChallenge ? 'mfa' : invitation && !invitation.hasAccount ? 'register' : initialView
  );
  const [email, setEmail] = useState(initialLoginEmail);
  const [password, setPassword] = useState(loginCredentialDefaults.password);
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(initialChallenge);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendingCode, setResendingCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [mfaNotice, setMfaNotice] = useState('');
  const [accountNotice, setAccountNotice] = useState('');
  const [challengeClockRevision, refreshChallengeExpiry] = useState(0);
  const [resetEmail, setResetEmail] = useState(initialLoginEmail);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetPasswordsVisible, setResetPasswordsVisible] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetNotice, setResetNotice] = useState(
    initialView === 'reset-code' ? 'Enter the 6-digit code from your password reset email.' : ''
  );
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const codeInputRef = useRef<TextInput>(null);
  const resetCodeInputRef = useRef<TextInput>(null);
  const newPasswordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
  const viewport = useWindowDimensions();

  const loginLayout = useMemo(
    () =>
      resolveLoginViewportLayout({
        height: viewport.height,
        platform: Platform.OS,
        width: viewport.width
      }),
    [viewport.height, viewport.width]
  );
  const challengeState = challenge ? getTwoFactorChallengeState(challenge) : null;
  const challengeExpired = Boolean(challengeState?.expired);
  const loginHeaderState = useMemo(
    () =>
      createLoginHeaderState({
        challengeActive: view === 'mfa',
        challengeSubtitle: challenge ? getTwoFactorSubtitle(challenge) : '',
        compact: loginLayout.compact
      }),
    [challenge, loginLayout.compact, view]
  );
  const headerState = useMemo<AuthHeaderProps>(() => {
    if (view === 'reset-request') {
      return {
        compact: loginLayout.compact,
        icon: 'logo',
        subtitle: "Enter the email linked to your account and we'll send a secure reset code.",
        title: 'Reset password',
        titleAccessibilityLabel: 'Reset your LunarChain password'
      };
    }

    if (view === 'reset-code') {
      return {
        compact: loginLayout.compact,
        icon: 'mail',
        subtitle: resetEmail
          ? `Use the code sent to ${resetEmail}.`
          : 'Use the code from your password reset email.',
        title: 'Create a new password',
        titleAccessibilityLabel: 'Create a new LunarChain password'
      };
    }

    if (view === 'reset-success') {
      return {
        compact: loginLayout.compact,
        icon: 'success',
        subtitle: 'Your password has been reset. Sign in with your new password.',
        title: 'Password updated',
        titleAccessibilityLabel: 'LunarChain password updated'
      };
    }

    return {
      compact: loginLayout.compact,
      icon: 'lock',
      subtitle: loginHeaderState.subtitle,
      subtitleAccessibilityLabel: loginHeaderState.subtitleAccessibilityLabel,
      title: 'Two-factor auth',
      titleAccessibilityLabel: 'LunarChain two-factor authentication'
    };
  }, [loginHeaderState, loginLayout.compact, resetEmail, view]);
  const secondaryChallengeAction = challenge
    ? getTwoFactorSecondaryActionState(challengeExpired)
    : null;
  const mapReturnAction = getLoginMapReturnActionState();
  const loginErrorState = useMemo(() => createLoginErrorState(errorMessage), [errorMessage]);
  const loginNoticeState = useMemo(
    () => createLoginNoticeState(sessionMessage || ''),
    [sessionMessage]
  );
  const primaryActionState = getLoginPrimaryActionState({
    challengeActive: view === 'mfa',
    challengeExpired,
    code,
    email,
    loading,
    password
  });
  const formBusy = loading || resendingCode || savedSessionRetrying;
  const primaryActionDisabled =
    primaryActionState.disabled || resendingCode || savedSessionRetrying;

  useEffect(() => {
    if (!invitation) {
      return;
    }

    setEmail(invitation.email);
    setResetEmail(invitation.email);
    setPassword('');
    setCode('');
    setChallenge(null);
    setErrorMessage('');
    setMfaNotice('');
    setAccountNotice(
      invitation.hasAccount && invitation.clientName
        ? `Sign in to join ${invitation.clientName}.`
        : ''
    );
    setView(invitation.hasAccount ? 'credentials' : 'register');
  }, [invitation?.token]);

  useEffect(() => {
    if (!challenge?.expiresAt) {
      return undefined;
    }

    const refreshDelayMs = getTwoFactorRefreshDelayMs(challenge.expiresAt);
    if (refreshDelayMs === null || refreshDelayMs === 0) {
      return undefined;
    }

    const timeout = setTimeout(
      () => {
        refreshChallengeExpiry((value) => value + 1);
        setErrorMessage('');
      },
      Math.min(refreshDelayMs, 2147483647)
    );

    return () => clearTimeout(timeout);
  }, [challenge?.expiresAt, challengeClockRevision]);

  const clearLoginError = () => {
    if (errorMessage) {
      setErrorMessage('');
    }
  };

  const submitCredentials = async () => {
    if (!email.trim() || !password) {
      setErrorMessage('Enter your LunarChain email and password.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const result = await loginWithPassword(email, password);
      if (result.status === 'two-factor') {
        setChallenge(result.challenge);
        setView('mfa');
        setCode('');
        setErrorMessage('');
        setMfaNotice('');
        return;
      }

      await onAuthenticated(result.session);
    } catch (error) {
      setErrorMessage(
        getUserFacingErrorMessage(error, 'Unable to sign in.', LOGIN_CONNECTION_MESSAGE)
      );
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async () => {
    if (!challenge) {
      setErrorMessage('Start sign in again.');
      return;
    }

    const cleanCode = sanitizeLoginCode(code);
    if (challengeExpired) {
      setErrorMessage('');
      return;
    }

    if (cleanCode.length !== 6) {
      setErrorMessage('Enter the 6-digit login code.');
      return;
    }

    setCode(cleanCode);
    setLoading(true);
    setErrorMessage('');
    setMfaNotice('');

    try {
      const session = await verifyLoginCode(challenge.email, challenge.challengeToken, cleanCode);
      await onAuthenticated(session);
    } catch (error) {
      setErrorMessage(
        getUserFacingErrorMessage(
          error,
          'Unable to verify the login code.',
          LOGIN_CONNECTION_MESSAGE
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!challenge || resendingCode || loading) {
      return;
    }

    setResendingCode(true);
    setErrorMessage('');
    setMfaNotice('');

    try {
      const refreshedChallenge = await resendLoginCode(challenge);
      setChallenge(refreshedChallenge);
      setCode('');
      setMfaNotice('A new login code has been sent.');
      refreshChallengeExpiry((value) => value + 1);
    } catch (error) {
      setErrorMessage(
        getUserFacingErrorMessage(
          error,
          'Unable to resend the login code.',
          LOGIN_CONNECTION_MESSAGE
        )
      );
    } finally {
      setResendingCode(false);
    }
  };

  const clearPasswordResetSecrets = () => {
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setResetPasswordsVisible(false);
  };

  const backToCredentials = () => {
    clearPasswordResetSecrets();
    setView('credentials');
    setChallenge(null);
    setCode('');
    setErrorMessage('');
    setMfaNotice('');
    setResetError('');
    setResetNotice('');
  };

  const openPasswordReset = () => {
    clearPasswordResetSecrets();
    setResetEmail(email.trim());
    setResetError('');
    setResetNotice('');
    setView('reset-request');
  };

  const openCreateAccount = () => {
    setAccountNotice('');
    setErrorMessage('');
    setPassword('');
    setView('register');
  };

  const handleAccountAlreadyExists = (existingEmail: string) => {
    setEmail(existingEmail);
    setResetEmail(existingEmail);
    setPassword('');
    setErrorMessage('');
    setAccountNotice(
      invitation?.clientName
        ? `An account already exists for this email. Sign in to join ${invitation.clientName}.`
        : 'An account already exists for this email. Sign in instead.'
    );
    setView('credentials');
    requestAnimationFrame(() => passwordInputRef.current?.focus());
  };

  const submitResetRequest = async () => {
    const validationError = getPasswordResetRequestError(resetEmail);
    if (validationError) {
      setResetError(validationError);
      return;
    }

    setLoading(true);
    setResetError('');

    try {
      await requestPasswordReset(resetEmail);
      setResetCode('');
      setResetNotice('A 6-digit verification code has been sent to your email.');
      setView('reset-code');
    } catch (error) {
      setResetError(
        getUserFacingErrorMessage(
          error,
          'Unable to send a password reset code.',
          PASSWORD_RESET_CONNECTION_MESSAGE
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const submitPasswordReset = async () => {
    const cleanCode = sanitizeLoginCode(resetCode);
    const validationError = getPasswordResetError({
      code: cleanCode,
      confirmPassword,
      email: resetEmail,
      newPassword
    });
    if (validationError) {
      setResetError(validationError);
      return;
    }

    setLoading(true);
    setResetError('');

    try {
      await resetPassword(resetEmail, cleanCode, newPassword);
      setEmail(resetEmail.trim().toLowerCase());
      setPassword('');
      clearPasswordResetSecrets();
      setResetNotice('');
      setView('reset-success');
    } catch (error) {
      setResetError(
        getUserFacingErrorMessage(
          error,
          'Unable to reset the password. Check the verification code and try again.',
          PASSWORD_RESET_CONNECTION_MESSAGE
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (view === 'credentials') {
      onCancel?.();
      return;
    }

    if (view === 'reset-code') {
      clearPasswordResetSecrets();
      setResetError('');
      setResetNotice('');
      setView('reset-request');
      return;
    }

    backToCredentials();
  };

  const resetRequestDisabled = loading || Boolean(getPasswordResetRequestError(resetEmail));
  const resetSubmitDisabled =
    loading || sanitizeLoginCode(resetCode).length !== 6 || !newPassword || !confirmPassword;

  if (view === 'register' || view === 'register-verification') {
    return (
      <CreateAccountScreen
        invitationClientName={invitation?.clientName}
        invitationToken={invitation?.token}
        initialEmail={
          view === 'register-verification'
            ? initialEmail || 'preview.operator@lunarchain.local'
            : email
        }
        initialStep={view === 'register-verification' ? 'verification' : 'details'}
        previewMode={SAFEROUTE_PREVIEW_MODE_ENABLED}
        onAccountExists={handleAccountAlreadyExists}
        onBack={backToCredentials}
        onVerified={(verifiedEmail) => {
          onInvitationConsumed?.();
          setEmail(verifiedEmail);
          setPassword('');
          setAccountNotice('Email verified. Sign in to continue.');
          setView('credentials');
        }}
      />
    );
  }

  if (view === 'credentials') {
    return (
      <SafeAreaView style={styles.screen} testID={uiTestIds.loginScreen}>
        <AuthBackdrop />
        {onCancel ? (
          <Pressable
            accessibilityHint={mapReturnAction.accessibilityHint}
            accessibilityLabel={mapReturnAction.accessibilityLabel}
            accessibilityRole="button"
            disabled={formBusy}
            hitSlop={ICON_BUTTON_HIT_SLOP}
            style={({ pressed }) => [
              styles.handoffBackButton,
              pressed && !formBusy ? styles.handoffBackButtonPressed : null,
              formBusy ? styles.handoffPrimaryButtonDisabled : null
            ]}
            testID={uiTestIds.loginMapReturn}
            onPress={handleBack}
          >
            <ArrowLeft color="#FFFFFF" size={20} strokeWidth={2.4} />
          </Pressable>
        ) : null}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={loginLayout.keyboardVerticalOffset}
          style={styles.keyboardShell}
        >
          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={[
              styles.handoffScrollContent,
              loginLayout.compact ? styles.handoffScrollContentCompact : null
            ]}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <MotionEntrance
              delay={0}
              replayKey="credentials"
              style={styles.handoffHeader}
              variant="auth"
            >
              <Image
                accessibilityIgnoresInvertColors
                accessibilityLabel="SafeRoute"
                source={require('../../../assets/logo-mark.png')}
                style={styles.handoffLogo}
              />
              <Text accessibilityRole="header" style={styles.handoffBrand}>
                SafeRoute
              </Text>
            </MotionEntrance>

            <View style={styles.handoffForm}>
              {loginNoticeState ? (
                <MotionEntrance delay={60} replayKey="credentials" variant="auth">
                  <StatusBox
                    accessibilityLabel={loginNoticeState.accessibilityLabel || undefined}
                    tone="notice"
                    testID={uiTestIds.loginNotice}
                  >
                    {loginNoticeState.message}
                  </StatusBox>
                </MotionEntrance>
              ) : null}
              {accountNotice ? (
                <MotionEntrance delay={60} replayKey="credentials" variant="auth">
                  <StatusBox tone="success">{accountNotice}</StatusBox>
                </MotionEntrance>
              ) : null}

              <MotionEntrance
                delay={60}
                replayKey="credentials"
                style={[
                  styles.handoffInputShell,
                  focusedField === 'email' ? styles.handoffInputShellFocused : null,
                  formBusy ? styles.inputShellDisabled : null
                ]}
                variant="auth"
              >
                <TextInput
                  accessibilityHint="Enter the email address for your LunarChain account."
                  accessibilityLabel="LunarChain email"
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect={false}
                  editable={!formBusy}
                  keyboardType="email-address"
                  placeholder="Email"
                  placeholderTextColor="#B0B0B5"
                  returnKeyType="next"
                  style={styles.handoffInput}
                  testID={uiTestIds.loginEmail}
                  textContentType="username"
                  value={email}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={(value) => {
                    setEmail(value);
                    setAccountNotice('');
                    clearLoginError();
                  }}
                  onFocus={() => setFocusedField('email')}
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                />
              </MotionEntrance>

              <MotionEntrance
                delay={60}
                replayKey="credentials"
                style={[
                  styles.handoffInputShell,
                  focusedField === 'password' ? styles.handoffInputShellFocused : null,
                  formBusy ? styles.inputShellDisabled : null
                ]}
                variant="auth"
              >
                <TextInput
                  {...passwordAutofillHints}
                  ref={passwordInputRef}
                  accessibilityHint="Enter your LunarChain account password."
                  accessibilityLabel="LunarChain password"
                  autoCapitalize="none"
                  editable={!formBusy}
                  placeholder="Password"
                  placeholderTextColor="#B0B0B5"
                  returnKeyType="go"
                  secureTextEntry={!passwordVisible && !SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED}
                  style={styles.handoffInput}
                  testID={uiTestIds.loginPassword}
                  value={password}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={(value) => {
                    setPassword(value);
                    setAccountNotice('');
                    clearLoginError();
                  }}
                  onFocus={() => setFocusedField('password')}
                  onSubmitEditing={submitCredentials}
                />
                <Pressable
                  accessibilityLabel={
                    passwordVisible ? 'Hide LunarChain password' : 'Show LunarChain password'
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: passwordVisible }}
                  disabled={formBusy}
                  hitSlop={ICON_BUTTON_HIT_SLOP}
                  style={({ pressed }) => [
                    styles.passwordToggle,
                    pressed && !formBusy ? styles.passwordTogglePressed : null,
                    formBusy ? styles.passwordToggleDisabled : null
                  ]}
                  onPress={() => setPasswordVisible((value) => !value)}
                >
                  {passwordVisible ? (
                    <EyeOff color="#7F838C" size={19} strokeWidth={1.8} />
                  ) : (
                    <Eye color="#7F838C" size={19} strokeWidth={1.8} />
                  )}
                </Pressable>
              </MotionEntrance>

              {loginErrorState ? (
                <MotionEntrance delay={60} replayKey="credentials" variant="auth">
                  <StatusBox
                    accessibilityLabel={loginErrorState.accessibilityLabel || undefined}
                    tone="danger"
                  >
                    {loginErrorState.message}
                  </StatusBox>
                </MotionEntrance>
              ) : null}

              {onRetrySavedSession ? (
                <MotionEntrance delay={60} replayKey="credentials" variant="auth">
                  <Pressable
                    accessibilityHint="Checks the saved account before any workspace, route, or Calendar data is shown."
                    accessibilityLabel={
                      savedSessionRetrying
                        ? 'Verifying saved session'
                        : 'Retry saved session verification'
                    }
                    accessibilityRole="button"
                    accessibilityState={{
                      busy: savedSessionRetrying,
                      disabled: formBusy
                    }}
                    disabled={formBusy}
                    style={({ pressed }) => [
                      styles.savedSessionRetryButton,
                      pressed && !formBusy ? styles.savedSessionRetryButtonPressed : null,
                      formBusy ? styles.handoffPrimaryButtonDisabled : null
                    ]}
                    testID={uiTestIds.loginSavedSessionRetry}
                    onPress={onRetrySavedSession}
                  >
                    {savedSessionRetrying ? <ActivityIndicator color="#5CB0FF" /> : null}
                    <Text style={styles.savedSessionRetryButtonText}>
                      {savedSessionRetrying ? 'Verifying...' : 'Retry saved session'}
                    </Text>
                  </Pressable>
                </MotionEntrance>
              ) : null}

              <MotionEntrance delay={120} replayKey="credentials" variant="auth">
                <Pressable
                  accessibilityHint={primaryActionState.accessibilityHint}
                  accessibilityLabel={primaryActionState.accessibilityLabel}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: primaryActionDisabled }}
                  disabled={primaryActionDisabled}
                  style={({ pressed }) => [
                    styles.handoffPrimaryButton,
                    pressed && !primaryActionDisabled ? styles.handoffPrimaryButtonPressed : null,
                    primaryActionDisabled ? styles.handoffPrimaryButtonDisabled : null
                  ]}
                  testID={uiTestIds.loginPrimaryAction}
                  onPress={submitCredentials}
                >
                  {loading ? <ActivityIndicator color="#12141A" /> : null}
                  <Text style={styles.handoffPrimaryButtonText}>
                    {loading ? 'Signing in...' : 'Sign in'}
                  </Text>
                </Pressable>
              </MotionEntrance>

              <MotionEntrance
                delay={180}
                replayKey="credentials"
                style={styles.handoffFooter}
                variant="auth"
              >
                <Pressable
                  accessibilityLabel="Forgot password"
                  accessibilityRole="button"
                  disabled={formBusy}
                  style={({ pressed }) => [
                    styles.handoffFooterButton,
                    pressed && !formBusy ? styles.handoffFooterButtonPressed : null
                  ]}
                  testID={uiTestIds.passwordResetOpen}
                  onPress={openPasswordReset}
                >
                  <Text style={styles.handoffFooterMutedText}>Forgot password?</Text>
                </Pressable>
                <View style={styles.handoffFooterDot} />
                <Pressable
                  accessibilityLabel="Create account"
                  accessibilityRole="button"
                  disabled={formBusy}
                  style={({ pressed }) => [
                    styles.handoffFooterButton,
                    pressed && !formBusy ? styles.handoffFooterButtonPressed : null
                  ]}
                  testID={uiTestIds.loginCreateAccount}
                  onPress={openCreateAccount}
                >
                  <Text style={styles.handoffFooterLinkText}>Create account</Text>
                </Pressable>
              </MotionEntrance>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} testID={uiTestIds.loginScreen}>
      <AuthBackdrop />
      <Pressable
        accessibilityHint="Returns to the previous authentication step."
        accessibilityLabel="Back"
        accessibilityRole="button"
        disabled={formBusy}
        hitSlop={ICON_BUTTON_HIT_SLOP}
        style={({ pressed }) => [
          styles.handoffBackButton,
          pressed && !formBusy ? styles.handoffBackButtonPressed : null,
          formBusy ? styles.handoffPrimaryButtonDisabled : null
        ]}
        testID={uiTestIds.authBack}
        onPress={handleBack}
      >
        <ArrowLeft color="#FFFFFF" size={20} strokeWidth={2.4} />
      </Pressable>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={loginLayout.keyboardVerticalOffset}
        style={styles.keyboardShell}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.flowScrollContent,
            loginLayout.compact ? styles.flowScrollContentCompact : null
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.flowContent}>
            <MotionEntrance delay={0} replayKey={view} variant="auth">
              <AuthHeader {...headerState} />
            </MotionEntrance>

            {view === 'mfa' ? (
              <View style={styles.handoffForm}>
                <MotionEntrance
                  delay={60}
                  replayKey={view}
                  style={[
                    styles.codeCellRow,
                    challengeExpired || formBusy ? styles.inputShellDisabled : null
                  ]}
                  variant="auth"
                >
                  {Array.from({ length: 6 }, (_, index) => {
                    const cellFocused =
                      focusedField === 'code' && Math.min(code.length, 5) === index;
                    return (
                      <MfaCodeCell
                        key={index}
                        filled={Boolean(code[index])}
                        focused={cellFocused}
                        value={code[index] || ''}
                      />
                    );
                  })}
                  <TextInput
                    ref={codeInputRef}
                    accessibilityHint="Enter the six-digit code sent by LunarChain."
                    accessibilityLabel="LunarChain login code"
                    autoComplete="one-time-code"
                    caretHidden
                    editable={!challengeExpired && !formBusy}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    style={styles.codeInputOverlay}
                    testID={uiTestIds.loginCode}
                    textContentType="oneTimeCode"
                    value={code}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={(value) => {
                      setCode(sanitizeLoginCode(value));
                      setMfaNotice('');
                      if (!challengeExpired) {
                        clearLoginError();
                      }
                    }}
                    onFocus={() => setFocusedField('code')}
                    onSubmitEditing={submitCode}
                  />
                </MotionEntrance>

                {challengeState ? (
                  <MotionEntrance delay={60} replayKey={view} variant="auth">
                    <View
                      accessibilityRole={challengeState.expired ? 'alert' : undefined}
                      style={[
                        styles.challengeHintBox,
                        challengeState.tone === 'danger' ? styles.challengeHintBoxDanger : null
                      ]}
                    >
                      <Text
                        style={[
                          styles.challengeHintText,
                          challengeState.tone === 'danger' ? styles.challengeHintTextDanger : null
                        ]}
                      >
                        {challengeState.helperText}
                      </Text>
                    </View>
                  </MotionEntrance>
                ) : null}

                {mfaNotice ? (
                  <MotionEntrance delay={60} replayKey={view} variant="auth">
                    <StatusBox tone="success">{mfaNotice}</StatusBox>
                  </MotionEntrance>
                ) : null}
                {loginErrorState ? (
                  <MotionEntrance delay={60} replayKey={view} variant="auth">
                    <StatusBox
                      accessibilityLabel={loginErrorState.accessibilityLabel || undefined}
                      tone="danger"
                    >
                      {loginErrorState.message}
                    </StatusBox>
                  </MotionEntrance>
                ) : null}

                <MotionEntrance delay={120} replayKey={view} variant="auth">
                  <Pressable
                    accessibilityHint={primaryActionState.accessibilityHint}
                    accessibilityLabel={primaryActionState.accessibilityLabel}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: primaryActionDisabled }}
                    disabled={primaryActionDisabled}
                    style={({ pressed }) => [
                      styles.handoffPrimaryButton,
                      pressed && !primaryActionDisabled ? styles.handoffPrimaryButtonPressed : null,
                      primaryActionDisabled ? styles.handoffPrimaryButtonDisabled : null
                    ]}
                    testID={uiTestIds.loginPrimaryAction}
                    onPress={submitCode}
                  >
                    {loading ? <ActivityIndicator color="#12141A" /> : null}
                    <Text style={styles.handoffPrimaryButtonText}>
                      {loading ? 'Verifying...' : 'Verify and continue'}
                    </Text>
                  </Pressable>
                </MotionEntrance>

                <MotionEntrance
                  delay={180}
                  replayKey={view}
                  style={styles.flowLinkRow}
                  variant="auth"
                >
                  <Text style={styles.handoffFooterMutedText}>Didn't receive a code?</Text>
                  <Pressable
                    accessibilityLabel="Resend login code"
                    accessibilityRole="button"
                    disabled={formBusy || !challenge}
                    style={({ pressed }) => [
                      styles.handoffFooterButton,
                      pressed && !formBusy ? styles.handoffFooterButtonPressed : null,
                      formBusy || !challenge ? styles.handoffPrimaryButtonDisabled : null
                    ]}
                    testID={uiTestIds.loginResendCode}
                    onPress={handleResendCode}
                  >
                    <Text style={styles.handoffFooterLinkText}>
                      {resendingCode ? 'Sending...' : 'Resend'}
                    </Text>
                  </Pressable>
                </MotionEntrance>

                <MotionEntrance delay={180} replayKey={view} variant="auth">
                  <Pressable
                    accessibilityHint={secondaryChallengeAction?.accessibilityHint}
                    accessibilityLabel={secondaryChallengeAction?.accessibilityLabel}
                    accessibilityRole="button"
                    disabled={formBusy}
                    style={({ pressed }) => [
                      styles.flowSecondaryLink,
                      pressed && !formBusy ? styles.handoffFooterButtonPressed : null,
                      formBusy ? styles.handoffPrimaryButtonDisabled : null
                    ]}
                    testID={uiTestIds.loginSecondaryAction}
                    onPress={backToCredentials}
                  >
                    <Text style={styles.handoffFooterMutedText}>
                      {secondaryChallengeAction?.text}
                    </Text>
                  </Pressable>
                </MotionEntrance>
              </View>
            ) : null}

            {view === 'reset-request' ? (
              <View style={styles.handoffForm} testID={uiTestIds.passwordResetRequest}>
                <MotionEntrance
                  delay={60}
                  replayKey={view}
                  style={[
                    styles.handoffInputShell,
                    focusedField === 'reset-email' ? styles.handoffInputShellFocused : null,
                    loading ? styles.inputShellDisabled : null
                  ]}
                  variant="auth"
                >
                  <TextInput
                    accessibilityLabel="Password reset email"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    editable={!loading}
                    keyboardType="email-address"
                    placeholder="Email"
                    placeholderTextColor="#7F838C"
                    returnKeyType="send"
                    style={styles.handoffInput}
                    testID={uiTestIds.passwordResetEmail}
                    textContentType="emailAddress"
                    value={resetEmail}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={(value) => {
                      setResetEmail(value);
                      setResetError('');
                    }}
                    onFocus={() => setFocusedField('reset-email')}
                    onSubmitEditing={submitResetRequest}
                  />
                </MotionEntrance>

                {resetError ? (
                  <MotionEntrance delay={60} replayKey={view} variant="auth">
                    <StatusBox tone="danger">{resetError}</StatusBox>
                  </MotionEntrance>
                ) : null}

                <MotionEntrance delay={120} replayKey={view} variant="auth">
                  <Pressable
                    accessibilityLabel="Send password reset verification code"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: resetRequestDisabled }}
                    disabled={resetRequestDisabled}
                    style={({ pressed }) => [
                      styles.handoffPrimaryButton,
                      pressed && !resetRequestDisabled ? styles.handoffPrimaryButtonPressed : null,
                      resetRequestDisabled ? styles.handoffPrimaryButtonDisabled : null
                    ]}
                    testID={uiTestIds.passwordResetSend}
                    onPress={submitResetRequest}
                  >
                    {loading ? <ActivityIndicator color="#12141A" /> : null}
                    <Text style={styles.handoffPrimaryButtonText}>
                      {loading ? 'Sending code...' : 'Send reset code'}
                    </Text>
                  </Pressable>
                </MotionEntrance>

                <MotionEntrance delay={180} replayKey={view} variant="auth">
                  <Pressable
                    accessibilityLabel="Back to sign in"
                    accessibilityRole="button"
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.flowSecondaryLink,
                      pressed && !loading ? styles.handoffFooterButtonPressed : null
                    ]}
                    onPress={backToCredentials}
                  >
                    <Text style={styles.handoffFooterLinkText}>Back to sign in</Text>
                  </Pressable>
                </MotionEntrance>
              </View>
            ) : null}

            {view === 'reset-code' ? (
              <View style={styles.handoffForm} testID={uiTestIds.passwordResetForm}>
                {resetNotice ? (
                  <MotionEntrance delay={60} replayKey={view} variant="auth">
                    <StatusBox tone="notice">{resetNotice}</StatusBox>
                  </MotionEntrance>
                ) : null}

                <MotionEntrance
                  delay={60}
                  replayKey={view}
                  style={[styles.handoffInputShell, styles.inputShellDisabled]}
                  variant="auth"
                >
                  <TextInput
                    accessibilityLabel="Password reset email"
                    editable={false}
                    style={styles.handoffInput}
                    testID={uiTestIds.passwordResetEmail}
                    value={resetEmail}
                  />
                </MotionEntrance>

                <MotionEntrance
                  delay={60}
                  replayKey={view}
                  style={[
                    styles.handoffInputShell,
                    focusedField === 'reset-code' ? styles.handoffInputShellFocused : null,
                    loading ? styles.inputShellDisabled : null
                  ]}
                  variant="auth"
                >
                  <TextInput
                    ref={resetCodeInputRef}
                    accessibilityLabel="Password reset verification code"
                    autoComplete="one-time-code"
                    editable={!loading}
                    keyboardType="number-pad"
                    placeholder="6-digit code"
                    placeholderTextColor="#7F838C"
                    returnKeyType="next"
                    style={styles.handoffInput}
                    testID={uiTestIds.passwordResetCode}
                    textContentType="oneTimeCode"
                    value={resetCode}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={(value) => {
                      setResetCode(sanitizeLoginCode(value));
                      setResetError('');
                    }}
                    onFocus={() => setFocusedField('reset-code')}
                    onSubmitEditing={() => newPasswordInputRef.current?.focus()}
                  />
                </MotionEntrance>

                <MotionEntrance delay={60} replayKey={view} variant="auth">
                  <View
                    style={[
                      styles.handoffInputShell,
                      focusedField === 'reset-password' ? styles.handoffInputShellFocused : null,
                      loading ? styles.inputShellDisabled : null
                    ]}
                  >
                    <TextInput
                      ref={newPasswordInputRef}
                      accessibilityLabel="New LunarChain password"
                      autoCapitalize="none"
                      autoComplete="new-password"
                      editable={!loading}
                      placeholder="New password"
                      placeholderTextColor="#7F838C"
                      returnKeyType="next"
                      secureTextEntry={!resetPasswordsVisible}
                      style={styles.handoffInput}
                      testID={uiTestIds.passwordResetNewPassword}
                      textContentType="newPassword"
                      value={newPassword}
                      onBlur={() => setFocusedField(null)}
                      onChangeText={(value) => {
                        setNewPassword(value);
                        setResetError('');
                      }}
                      onFocus={() => setFocusedField('reset-password')}
                      onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
                    />
                    <Pressable
                      accessibilityLabel={
                        resetPasswordsVisible ? 'Hide new passwords' : 'Show new passwords'
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: resetPasswordsVisible }}
                      disabled={loading}
                      hitSlop={ICON_BUTTON_HIT_SLOP}
                      style={({ pressed }) => [
                        styles.passwordToggle,
                        pressed && !loading ? styles.passwordTogglePressed : null,
                        loading ? styles.passwordToggleDisabled : null
                      ]}
                      onPress={() => setResetPasswordsVisible((value) => !value)}
                    >
                      {resetPasswordsVisible ? (
                        <EyeOff color="#7F838C" size={19} strokeWidth={1.8} />
                      ) : (
                        <Eye color="#7F838C" size={19} strokeWidth={1.8} />
                      )}
                    </Pressable>
                  </View>
                  <Text style={styles.flowHelperText}>
                    Use 8+ characters with uppercase, lowercase, a number and a symbol.
                  </Text>
                </MotionEntrance>

                <MotionEntrance
                  delay={60}
                  replayKey={view}
                  style={[
                    styles.handoffInputShell,
                    focusedField === 'reset-confirm' ? styles.handoffInputShellFocused : null,
                    loading ? styles.inputShellDisabled : null
                  ]}
                  variant="auth"
                >
                  <TextInput
                    ref={confirmPasswordInputRef}
                    accessibilityLabel="Confirm new LunarChain password"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    editable={!loading}
                    placeholder="Confirm new password"
                    placeholderTextColor="#7F838C"
                    returnKeyType="done"
                    secureTextEntry={!resetPasswordsVisible}
                    style={styles.handoffInput}
                    testID={uiTestIds.passwordResetConfirmPassword}
                    textContentType="newPassword"
                    value={confirmPassword}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={(value) => {
                      setConfirmPassword(value);
                      setResetError('');
                    }}
                    onFocus={() => setFocusedField('reset-confirm')}
                    onSubmitEditing={submitPasswordReset}
                  />
                </MotionEntrance>

                {resetError ? (
                  <MotionEntrance delay={60} replayKey={view} variant="auth">
                    <StatusBox tone="danger">{resetError}</StatusBox>
                  </MotionEntrance>
                ) : null}

                <MotionEntrance delay={120} replayKey={view} variant="auth">
                  <Pressable
                    accessibilityLabel="Reset LunarChain password"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: resetSubmitDisabled }}
                    disabled={resetSubmitDisabled}
                    style={({ pressed }) => [
                      styles.handoffPrimaryButton,
                      pressed && !resetSubmitDisabled ? styles.handoffPrimaryButtonPressed : null,
                      resetSubmitDisabled ? styles.handoffPrimaryButtonDisabled : null
                    ]}
                    testID={uiTestIds.passwordResetSubmit}
                    onPress={submitPasswordReset}
                  >
                    {loading ? <ActivityIndicator color="#12141A" /> : null}
                    <Text style={styles.handoffPrimaryButtonText}>
                      {loading ? 'Resetting password...' : 'Reset password'}
                    </Text>
                  </Pressable>
                </MotionEntrance>
              </View>
            ) : null}

            {view === 'reset-success' ? (
              <View style={styles.handoffForm} testID={uiTestIds.passwordResetSuccess}>
                <MotionEntrance delay={60} replayKey={view} variant="auth">
                  <StatusBox tone="success">Password reset successfully.</StatusBox>
                </MotionEntrance>
                <MotionEntrance delay={120} replayKey={view} variant="auth">
                  <Pressable
                    accessibilityLabel="Back to LunarChain sign in"
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.handoffPrimaryButton,
                      pressed ? styles.handoffPrimaryButtonPressed : null
                    ]}
                    testID={uiTestIds.passwordResetDone}
                    onPress={backToCredentials}
                  >
                    <Text style={styles.handoffPrimaryButtonText}>Back to sign in</Text>
                  </Pressable>
                </MotionEntrance>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
