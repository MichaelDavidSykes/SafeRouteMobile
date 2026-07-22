import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getUserFacingErrorMessage } from '../api/userFacingErrors';
import {
  SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED,
  SAFEROUTE_PREVIEW_MODE_ENABLED,
} from '../../config/env';
import { uiTestIds } from '../../testing/uiTestIds';
import {
  loginWithPassword,
  requestPasswordReset,
  resendLoginCode,
  resetPassword,
  verifyLoginCode,
} from './authApi';
import { AuthBackdrop } from './AuthBackdrop';
import { authColors } from './authDesign';
import { CreateAccountScreen } from './CreateAccountScreen';
import {
  resolveLoginCredentialDefaults,
  resolveLoginPasswordAutofillHints,
} from './loginAutofillHints';
import { createLoginErrorState } from './loginErrorState';
import { createLoginHeaderState } from './loginHeaderState';
import { createLoginNoticeState } from './loginNoticeState';
import {
  getLoginMapReturnActionState,
  getLoginPrimaryActionState,
  getTwoFactorSecondaryActionState,
} from './loginFormState';
import { resolveLoginViewportLayout } from './loginViewportLayout';
import {
  getPasswordResetError,
  getPasswordResetRequestError,
  PASSWORD_RESET_CONNECTION_MESSAGE,
} from './passwordResetState';
import { styles } from './LoginScreen.styles';
import {
  getTwoFactorChallengeState,
  getTwoFactorRefreshDelayMs,
  getTwoFactorSubtitle,
  sanitizeLoginCode,
} from './twoFactorChallenge';
import type { AuthSession, TwoFactorChallenge } from './authTypes';

const passwordAutofillHints = resolveLoginPasswordAutofillHints(
  SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED
);
const loginCredentialDefaults = resolveLoginCredentialDefaults(
  SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED
);

const LOGIN_CONNECTION_MESSAGE =
  'Unable to reach LunarChain. Check your connection and try again.';
const ICON_BUTTON_HIT_SLOP = 8;

export type LoginInitialView =
  | 'credentials'
  | 'register'
  | 'register-verification'
  | 'reset-request'
  | 'reset-code';
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
  initialChallenge?: TwoFactorChallenge | null;
  initialEmail?: string;
  initialView?: LoginInitialView;
  sessionMessage?: string;
  onAuthenticated: (session: AuthSession) => Promise<void> | void;
  onCancel?: () => void;
  onRetrySavedSession?: () => void;
  savedSessionRetrying?: boolean;
}

interface AuthHeaderProps {
  compact: boolean;
  eyebrow: string;
  subtitle: string | null;
  subtitleAccessibilityLabel?: string | null;
  title: string;
  titleAccessibilityLabel: string;
}

function AuthHeader({
  compact,
  eyebrow,
  subtitle,
  subtitleAccessibilityLabel,
  title,
  titleAccessibilityLabel,
}: AuthHeaderProps) {
  return (
    <View style={[styles.header, compact ? styles.headerCompact : null]}>
      <Text numberOfLines={1} style={styles.eyebrow}>
        {eyebrow}
      </Text>
      <Text
        accessibilityLabel={titleAccessibilityLabel}
        accessibilityRole="header"
        style={[styles.title, compact ? styles.titleCompact : null]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          accessibilityLabel={subtitleAccessibilityLabel || undefined}
          style={styles.subtitle}
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
            : styles.noticeBox,
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
              : styles.noticeText,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

export function LoginScreen({
  initialChallenge = null,
  initialEmail = '',
  initialView = 'credentials',
  onCancel,
  onAuthenticated,
  onRetrySavedSession,
  savedSessionRetrying = false,
  sessionMessage,
}: LoginScreenProps) {
  const initialLoginEmail =
    initialChallenge?.email || initialEmail || loginCredentialDefaults.email;
  const [view, setView] = useState<LoginView>(
    initialChallenge ? 'mfa' : initialView
  );
  const [email, setEmail] = useState(initialLoginEmail);
  const [password, setPassword] = useState(loginCredentialDefaults.password);
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(
    initialChallenge
  );
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
    initialView === 'reset-code'
      ? 'Enter the 6-digit code from your password reset email.'
      : ''
  );
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const resetCodeInputRef = useRef<TextInput>(null);
  const newPasswordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);
  const viewport = useWindowDimensions();

  const loginLayout = useMemo(
    () =>
      resolveLoginViewportLayout({
        height: viewport.height,
        platform: Platform.OS,
        width: viewport.width,
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
        compact: loginLayout.compact,
      }),
    [challenge, loginLayout.compact, view]
  );
  const headerState = useMemo<AuthHeaderProps>(() => {
    if (view === 'reset-request') {
      return {
        compact: loginLayout.compact,
        eyebrow: 'Password reset',
        subtitle: "Enter your email and we'll send you a 6-digit verification code.",
        title: 'Reset your password',
        titleAccessibilityLabel: 'Reset your LunarChain password',
      };
    }

    if (view === 'reset-code') {
      return {
        compact: loginLayout.compact,
        eyebrow: 'Reset password',
        subtitle: resetEmail
          ? `Use the code sent to ${resetEmail}.`
          : 'Use the code from your password reset email.',
        title: 'Create a new password',
        titleAccessibilityLabel: 'Create a new LunarChain password',
      };
    }

    if (view === 'reset-success') {
      return {
        compact: loginLayout.compact,
        eyebrow: 'Password reset',
        subtitle: 'Your password has been reset. Sign in with your new password.',
        title: 'Password updated',
        titleAccessibilityLabel: 'LunarChain password updated',
      };
    }

    return {
      compact: loginLayout.compact,
      ...loginHeaderState,
    };
  }, [loginHeaderState, loginLayout.compact, resetEmail, view]);
  const secondaryChallengeAction = challenge
    ? getTwoFactorSecondaryActionState(challengeExpired)
    : null;
  const mapReturnAction = getLoginMapReturnActionState();
  const loginErrorState = useMemo(
    () => createLoginErrorState(errorMessage),
    [errorMessage]
  );
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
    password,
  });
  const formBusy = loading || resendingCode || savedSessionRetrying;
  const primaryActionDisabled =
    primaryActionState.disabled || resendingCode || savedSessionRetrying;

  useEffect(() => {
    if (!challenge?.expiresAt) {
      return undefined;
    }

    const refreshDelayMs = getTwoFactorRefreshDelayMs(challenge.expiresAt);
    if (refreshDelayMs === null || refreshDelayMs === 0) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      refreshChallengeExpiry((value) => value + 1);
      setErrorMessage('');
    }, Math.min(refreshDelayMs, 2147483647));

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
        getUserFacingErrorMessage(
          error,
          'Unable to sign in.',
          LOGIN_CONNECTION_MESSAGE
        )
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
      const session = await verifyLoginCode(
        challenge.email,
        challenge.challengeToken,
        cleanCode
      );
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
      newPassword,
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

  const resetRequestDisabled =
    loading || Boolean(getPasswordResetRequestError(resetEmail));
  const resetSubmitDisabled =
    loading ||
    sanitizeLoginCode(resetCode).length !== 6 ||
    !newPassword ||
    !confirmPassword;

  if (view === 'register' || view === 'register-verification') {
    return (
      <CreateAccountScreen
        initialEmail={
          view === 'register-verification'
            ? initialEmail || 'preview.operator@lunarchain.local'
            : email
        }
        initialStep={view === 'register-verification' ? 'verification' : 'details'}
        previewMode={SAFEROUTE_PREVIEW_MODE_ENABLED}
        onBack={backToCredentials}
        onVerified={(verifiedEmail) => {
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
              formBusy ? styles.backButtonDisabled : null,
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
              loginLayout.compact ? styles.handoffScrollContentCompact : null,
            ]}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.handoffHeader}>
              <Image
                accessibilityIgnoresInvertColors
                accessibilityLabel="SafeRoute"
                source={require('../../../assets/logo-mark.png')}
                style={styles.handoffLogo}
              />
              <Text accessibilityRole="header" style={styles.handoffBrand}>SafeRoute</Text>
            </View>

            <View style={styles.handoffForm}>
              {loginNoticeState ? (
                <StatusBox
                  accessibilityLabel={loginNoticeState.accessibilityLabel || undefined}
                  tone="notice"
                  testID={uiTestIds.loginNotice}
                >
                  {loginNoticeState.message}
                </StatusBox>
              ) : null}
              {accountNotice ? <StatusBox tone="success">{accountNotice}</StatusBox> : null}

              <View
                style={[
                  styles.handoffInputShell,
                  focusedField === 'email' ? styles.handoffInputShellFocused : null,
                  formBusy ? styles.inputShellDisabled : null,
                ]}
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
              </View>

              <View
                style={[
                  styles.handoffInputShell,
                  focusedField === 'password' ? styles.handoffInputShellFocused : null,
                  formBusy ? styles.inputShellDisabled : null,
                ]}
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
                  secureTextEntry={
                    !passwordVisible && !SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED
                  }
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
                    formBusy ? styles.passwordToggleDisabled : null,
                  ]}
                  onPress={() => setPasswordVisible((value) => !value)}
                >
                  {passwordVisible ? (
                    <EyeOff color="#7F838C" size={19} strokeWidth={1.8} />
                  ) : (
                    <Eye color="#7F838C" size={19} strokeWidth={1.8} />
                  )}
                </Pressable>
              </View>

              {loginErrorState ? (
                <StatusBox
                  accessibilityLabel={loginErrorState.accessibilityLabel || undefined}
                  tone="danger"
                >
                  {loginErrorState.message}
                </StatusBox>
              ) : null}

              {onRetrySavedSession ? (
                <Pressable
                  accessibilityLabel={
                    savedSessionRetrying
                      ? 'Verifying saved session'
                      : 'Retry saved session verification'
                  }
                  accessibilityRole="button"
                  accessibilityState={{ busy: savedSessionRetrying, disabled: formBusy }}
                  disabled={formBusy}
                  style={({ pressed }) => [
                    styles.savedSessionRetryButton,
                    pressed && !formBusy ? styles.savedSessionRetryButtonPressed : null,
                    formBusy ? styles.secondaryButtonDisabled : null,
                  ]}
                  testID={uiTestIds.loginSavedSessionRetry}
                  onPress={onRetrySavedSession}
                >
                  {savedSessionRetrying ? <ActivityIndicator color="#5CB0FF" /> : null}
                  <Text style={styles.savedSessionRetryButtonText}>
                    {savedSessionRetrying ? 'Verifying...' : 'Retry saved session'}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityHint={primaryActionState.accessibilityHint}
                accessibilityLabel={primaryActionState.accessibilityLabel}
                accessibilityRole="button"
                accessibilityState={{ disabled: primaryActionDisabled }}
                disabled={primaryActionDisabled}
                style={({ pressed }) => [
                  styles.handoffPrimaryButton,
                  pressed && !primaryActionDisabled
                    ? styles.handoffPrimaryButtonPressed
                    : null,
                  primaryActionDisabled ? styles.handoffPrimaryButtonDisabled : null,
                ]}
                testID={uiTestIds.loginPrimaryAction}
                onPress={submitCredentials}
              >
                {loading ? <ActivityIndicator color="#12141A" /> : null}
                <Text style={styles.handoffPrimaryButtonText}>
                  {loading ? 'Signing in...' : 'Sign in'}
                </Text>
              </Pressable>

              <View style={styles.handoffFooter}>
                <Pressable
                  accessibilityLabel="Forgot password"
                  accessibilityRole="button"
                  disabled={formBusy}
                  style={({ pressed }) => [
                    styles.handoffFooterButton,
                    pressed && !formBusy ? styles.handoffFooterButtonPressed : null,
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
                    pressed && !formBusy ? styles.handoffFooterButtonPressed : null,
                  ]}
                  testID={uiTestIds.loginCreateAccount}
                  onPress={openCreateAccount}
                >
                  <Text style={styles.handoffFooterLinkText}>Create account</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} testID={uiTestIds.loginScreen}>
      <AuthBackdrop />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={loginLayout.keyboardVerticalOffset}
        style={styles.keyboardShell}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.scrollContent,
            loginLayout.compact ? styles.scrollContentCompact : null,
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.cardFrame}>
            <View style={[styles.card, loginLayout.compact ? styles.cardCompact : null]}>
              <BlurView
                intensity={30}
                pointerEvents="none"
                style={styles.cardBlur}
                tint="systemMaterialDark"
              />
            <Pressable
              accessibilityHint="Returns to the previous authentication step."
              accessibilityLabel="Back"
              accessibilityRole="button"
              disabled={formBusy}
              hitSlop={ICON_BUTTON_HIT_SLOP}
              style={({ pressed }) => [
                styles.backButton,
                pressed && !formBusy ? styles.backButtonPressed : null,
                formBusy ? styles.backButtonDisabled : null,
              ]}
              testID={uiTestIds.authBack}
              onPress={handleBack}
            >
              <ArrowLeft color={authColors.text} size={20} strokeWidth={2} />
            </Pressable>

            <AuthHeader {...headerState} />

            {view === 'mfa' ? (
              <View style={styles.form}>
                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Login code</Text>
                    <Pressable
                      accessibilityLabel="Resend login code"
                      accessibilityRole="button"
                      disabled={formBusy || !challenge}
                      style={({ pressed }) => [
                        styles.inlineButton,
                        pressed && !formBusy ? styles.inlineButtonPressed : null,
                        formBusy || !challenge ? styles.inlineButtonDisabled : null,
                      ]}
                      testID={uiTestIds.loginResendCode}
                      onPress={handleResendCode}
                    >
                      <Text style={styles.inlineButtonText}>
                        {resendingCode ? 'Sending...' : 'Resend code'}
                      </Text>
                    </Pressable>
                  </View>
                  <View
                    style={[
                      styles.inputShell,
                      focusedField === 'code' ? styles.inputShellFocused : null,
                      challengeExpired || formBusy ? styles.inputShellDisabled : null,
                    ]}
                  >
                    <TextInput
                      accessibilityHint="Enter the six-digit code sent by LunarChain."
                      accessibilityLabel="LunarChain login code"
                      autoComplete="one-time-code"
                      editable={!challengeExpired && !formBusy}
                      keyboardType="number-pad"
                      placeholder="123456"
                      placeholderTextColor={authColors.muted}
                      returnKeyType="done"
                      style={[styles.input, styles.codeInput]}
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
                  </View>
                </View>

                {challengeState ? (
                  <View
                    accessibilityRole={challengeState.expired ? 'alert' : undefined}
                    style={[
                      styles.challengeHintBox,
                      challengeState.tone === 'danger'
                        ? styles.challengeHintBoxDanger
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.challengeHintText,
                        challengeState.tone === 'danger'
                          ? styles.challengeHintTextDanger
                          : null,
                      ]}
                    >
                      {challengeState.helperText}
                    </Text>
                  </View>
                ) : null}

                {mfaNotice ? <StatusBox tone="success">{mfaNotice}</StatusBox> : null}
                {loginErrorState ? (
                  <StatusBox
                    accessibilityLabel={loginErrorState.accessibilityLabel || undefined}
                    tone="danger"
                  >
                    {loginErrorState.message}
                  </StatusBox>
                ) : null}

                <Pressable
                  accessibilityHint={primaryActionState.accessibilityHint}
                  accessibilityLabel={primaryActionState.accessibilityLabel}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: primaryActionDisabled }}
                  disabled={primaryActionDisabled}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && !primaryActionDisabled
                      ? styles.primaryButtonPressed
                      : null,
                    primaryActionDisabled ? styles.primaryButtonDisabled : null,
                  ]}
                  testID={uiTestIds.loginPrimaryAction}
                  onPress={submitCode}
                >
                  {loading ? (
                    <ActivityIndicator color={authColors.accentInk} />
                  ) : null}
                  <Text style={styles.primaryButtonText}>
                    {loading ? 'Verifying...' : 'Verify and continue'}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityHint={secondaryChallengeAction?.accessibilityHint}
                  accessibilityLabel={secondaryChallengeAction?.accessibilityLabel}
                  accessibilityRole="button"
                  disabled={formBusy}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && !formBusy ? styles.secondaryButtonPressed : null,
                    formBusy ? styles.secondaryButtonDisabled : null,
                  ]}
                  testID={uiTestIds.loginSecondaryAction}
                  onPress={backToCredentials}
                >
                  <Text style={styles.secondaryButtonText}>
                    {secondaryChallengeAction?.text}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {view === 'reset-request' ? (
              <View style={styles.form} testID={uiTestIds.passwordResetRequest}>
                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Email</Text>
                  </View>
                  <View
                    style={[
                      styles.inputShell,
                      focusedField === 'reset-email'
                        ? styles.inputShellFocused
                        : null,
                      loading ? styles.inputShellDisabled : null,
                    ]}
                  >
                    <TextInput
                      accessibilityLabel="Password reset email"
                      autoCapitalize="none"
                      autoComplete="email"
                      autoCorrect={false}
                      editable={!loading}
                      keyboardType="email-address"
                      placeholder="you@example.com"
                      placeholderTextColor={authColors.muted}
                      returnKeyType="send"
                      style={styles.input}
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
                  </View>
                </View>

                {resetError ? <StatusBox tone="danger">{resetError}</StatusBox> : null}

                <Pressable
                  accessibilityLabel="Send password reset verification code"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: resetRequestDisabled }}
                  disabled={resetRequestDisabled}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && !resetRequestDisabled
                      ? styles.primaryButtonPressed
                      : null,
                    resetRequestDisabled ? styles.primaryButtonDisabled : null,
                  ]}
                  testID={uiTestIds.passwordResetSend}
                  onPress={submitResetRequest}
                >
                  {loading ? (
                    <ActivityIndicator color={authColors.accentInk} />
                  ) : null}
                  <Text style={styles.primaryButtonText}>
                    {loading ? 'Sending code...' : 'Send verification code'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {view === 'reset-code' ? (
              <View style={styles.form} testID={uiTestIds.passwordResetForm}>
                {resetNotice ? <StatusBox tone="notice">{resetNotice}</StatusBox> : null}

                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Email</Text>
                  </View>
                  <View style={[styles.inputShell, styles.inputShellDisabled]}>
                    <TextInput
                      accessibilityLabel="Password reset email"
                      editable={false}
                      style={styles.input}
                      testID={uiTestIds.passwordResetEmail}
                      value={resetEmail}
                    />
                  </View>
                </View>

                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Verification code</Text>
                  </View>
                  <View
                    style={[
                      styles.inputShell,
                      focusedField === 'reset-code'
                        ? styles.inputShellFocused
                        : null,
                      loading ? styles.inputShellDisabled : null,
                    ]}
                  >
                    <TextInput
                      ref={resetCodeInputRef}
                      accessibilityLabel="Password reset verification code"
                      autoComplete="one-time-code"
                      editable={!loading}
                      keyboardType="number-pad"
                      placeholder="123456"
                      placeholderTextColor={authColors.muted}
                      returnKeyType="next"
                      style={[styles.input, styles.codeInput]}
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
                  </View>
                </View>

                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>New password</Text>
                  </View>
                  <View
                    style={[
                      styles.inputShell,
                      focusedField === 'reset-password'
                        ? styles.inputShellFocused
                        : null,
                      loading ? styles.inputShellDisabled : null,
                    ]}
                  >
                    <TextInput
                      ref={newPasswordInputRef}
                      accessibilityLabel="New LunarChain password"
                      autoCapitalize="none"
                      autoComplete="new-password"
                      editable={!loading}
                      placeholder="Enter a strong password"
                      placeholderTextColor={authColors.muted}
                      returnKeyType="next"
                      secureTextEntry={!resetPasswordsVisible}
                      style={styles.input}
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
                        resetPasswordsVisible
                          ? 'Hide new passwords'
                          : 'Show new passwords'
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: resetPasswordsVisible }}
                      disabled={loading}
                      hitSlop={ICON_BUTTON_HIT_SLOP}
                      style={({ pressed }) => [
                        styles.passwordToggle,
                        pressed && !loading ? styles.passwordTogglePressed : null,
                        loading ? styles.passwordToggleDisabled : null,
                      ]}
                      onPress={() => setResetPasswordsVisible((value) => !value)}
                    >
                      {resetPasswordsVisible ? (
                        <EyeOff color={authColors.accent} size={19} strokeWidth={2} />
                      ) : (
                        <Eye color={authColors.accent} size={19} strokeWidth={2} />
                      )}
                    </Pressable>
                  </View>
                  <Text style={styles.helperText}>
                    Use 8+ characters with uppercase, lowercase, a number and a symbol.
                  </Text>
                </View>

                <View style={styles.field}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Confirm password</Text>
                  </View>
                  <View
                    style={[
                      styles.inputShell,
                      focusedField === 'reset-confirm'
                        ? styles.inputShellFocused
                        : null,
                      loading ? styles.inputShellDisabled : null,
                    ]}
                  >
                    <TextInput
                      ref={confirmPasswordInputRef}
                      accessibilityLabel="Confirm new LunarChain password"
                      autoCapitalize="none"
                      autoComplete="new-password"
                      editable={!loading}
                      placeholder="Confirm your new password"
                      placeholderTextColor={authColors.muted}
                      returnKeyType="done"
                      secureTextEntry={!resetPasswordsVisible}
                      style={styles.input}
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
                  </View>
                </View>

                {resetError ? <StatusBox tone="danger">{resetError}</StatusBox> : null}

                <Pressable
                  accessibilityLabel="Reset LunarChain password"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: resetSubmitDisabled }}
                  disabled={resetSubmitDisabled}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && !resetSubmitDisabled
                      ? styles.primaryButtonPressed
                      : null,
                    resetSubmitDisabled ? styles.primaryButtonDisabled : null,
                  ]}
                  testID={uiTestIds.passwordResetSubmit}
                  onPress={submitPasswordReset}
                >
                  {loading ? (
                    <ActivityIndicator color={authColors.accentInk} />
                  ) : null}
                  <Text style={styles.primaryButtonText}>
                    {loading ? 'Resetting password...' : 'Reset password'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {view === 'reset-success' ? (
              <View style={styles.form} testID={uiTestIds.passwordResetSuccess}>
                <StatusBox tone="success">Password reset successfully.</StatusBox>
                <Pressable
                  accessibilityLabel="Back to LunarChain sign in"
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed ? styles.primaryButtonPressed : null,
                  ]}
                  testID={uiTestIds.passwordResetDone}
                  onPress={backToCredentials}
                >
                  <Text style={styles.primaryButtonText}>Back to sign in</Text>
                </Pressable>
              </View>
            ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
