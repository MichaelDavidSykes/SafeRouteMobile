import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getUserFacingErrorMessage } from '../api/userFacingErrors';
import { colors } from '../../theme';
import { SafeRouteLogo } from '../../brand/SafeRouteLogo';
import { SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED } from '../../config/env';
import { uiTestIds } from '../../testing/uiTestIds';
import { loginWithPassword, verifyLoginCode } from './authApi';
import {
  resolveLoginCredentialDefaults,
  resolveLoginPasswordAutofillHints
} from './loginAutofillHints';
import { createLoginErrorState } from './loginErrorState';
import { createLoginHeaderState } from './loginHeaderState';
import { createLoginNoticeState } from './loginNoticeState';
import { styles } from './LoginScreen.styles';
import type { AuthSession, TwoFactorChallenge } from './authTypes';
import {
  getLoginMapReturnActionState,
  getLoginPrimaryActionState,
  getTwoFactorSecondaryActionState
} from './loginFormState';
import { resolveLoginViewportLayout } from './loginViewportLayout';
import {
  getTwoFactorChallengeState,
  getTwoFactorExpiryDelayMs,
  getTwoFactorSubtitle,
  sanitizeLoginCode
} from './twoFactorChallenge';

const passwordAutofillHints = resolveLoginPasswordAutofillHints(
  SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED
);
const loginCredentialDefaults = resolveLoginCredentialDefaults(
  SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED
);

interface LoginScreenProps {
  initialChallenge?: TwoFactorChallenge | null;
  sessionMessage?: string;
  onAuthenticated: (session: AuthSession) => Promise<void> | void;
  onCancel?: () => void;
}

const LOGIN_CONNECTION_MESSAGE = 'Unable to reach LunarChain. Check your connection and try again.';
const PASSWORD_TOGGLE_HIT_SLOP = 8;
const LOGIN_SECONDARY_ACTION_HIT_SLOP = 6;

export function LoginScreen({
  initialChallenge = null,
  onCancel,
  onAuthenticated,
  sessionMessage
}: LoginScreenProps) {
  const [email, setEmail] = useState(
    initialChallenge?.email ?? loginCredentialDefaults.email
  );
  const [password, setPassword] = useState(loginCredentialDefaults.password);
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(initialChallenge);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [, refreshChallengeExpiry] = useState(0);
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
  const twoFactorSubtitle = challenge ? getTwoFactorSubtitle(challenge) : '';
  const loginHeaderState = useMemo(
    () =>
      createLoginHeaderState({
        challengeActive: Boolean(challenge),
        challengeSubtitle: twoFactorSubtitle,
        compact: loginLayout.compact
      }),
    [challenge, loginLayout.compact, twoFactorSubtitle]
  );
  const secondaryChallengeAction = challenge
    ? getTwoFactorSecondaryActionState(challengeExpired)
    : null;
  const mapReturnAction = getLoginMapReturnActionState();
  const loginErrorState = useMemo(
    () => (challengeExpired ? null : createLoginErrorState(errorMessage)),
    [challengeExpired, errorMessage]
  );
  const loginNoticeState = useMemo(
    () => createLoginNoticeState(sessionMessage || ''),
    [sessionMessage]
  );
  const primaryActionState = getLoginPrimaryActionState({
    challengeActive: Boolean(challenge),
    challengeExpired,
    code,
    email,
    loading,
    password
  });

  useEffect(() => {
    if (!challenge?.expiresAt) {
      return undefined;
    }

    const expiryDelayMs = getTwoFactorExpiryDelayMs(challenge.expiresAt);
    if (expiryDelayMs === null) {
      return undefined;
    }

    if (expiryDelayMs === 0) {
      refreshChallengeExpiry((value) => value + 1);
      setErrorMessage('');
      return undefined;
    }

    const timeout = setTimeout(() => {
      refreshChallengeExpiry((value) => value + 1);
      setErrorMessage('');
    }, Math.min(expiryDelayMs + 250, 2147483647));

    return () => clearTimeout(timeout);
  }, [challenge?.expiresAt]);

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
        setCode('');
        setErrorMessage('');
        return;
      }

      await onAuthenticated(result.session);
    } catch (error) {
      setErrorMessage(getUserFacingErrorMessage(error, 'Unable to sign in.', LOGIN_CONNECTION_MESSAGE));
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

    try {
      const session = await verifyLoginCode(challenge.email, challenge.challengeToken, cleanCode);
      await onAuthenticated(session);
    } catch (error) {
      setErrorMessage(getUserFacingErrorMessage(error, 'Unable to verify the login code.', LOGIN_CONNECTION_MESSAGE));
    } finally {
      setLoading(false);
    }
  };

  const backToCredentials = () => {
    setChallenge(null);
    setCode('');
    setErrorMessage('');
  };

  return (
    <SafeAreaView style={styles.screen} testID={uiTestIds.loginScreen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={loginLayout.keyboardVerticalOffset}
        style={styles.keyboardShell}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, loginLayout.compact ? styles.scrollContentCompact : null]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.header, loginLayout.compact ? styles.headerCompact : null]}>
            <SafeRouteLogo
              accessible
              accessibilityLabel="SafeRoute Mobile"
              imageSize={loginLayout.compact ? 40 : 50}
              size={loginLayout.compact ? 52 : 64}
              style={[styles.logoMark, loginLayout.compact ? styles.logoMarkCompact : null]}
            />
            <Text
              accessibilityLabel={loginHeaderState.titleAccessibilityLabel}
              style={[styles.title, loginLayout.compact ? styles.titleCompact : null]}
            >
              {loginHeaderState.title}
            </Text>
            {loginHeaderState.subtitle ? (
              <Text
                accessibilityLabel={loginHeaderState.subtitleAccessibilityLabel || undefined}
                numberOfLines={2}
                style={[styles.subtitle, loginLayout.compact ? styles.subtitleCompact : null]}
              >
                {loginHeaderState.subtitle}
              </Text>
            ) : null}
          </View>

          <View style={[styles.formCard, loginLayout.compact ? styles.formCardCompact : null]}>
            {loginNoticeState ? (
              <View style={styles.noticeBox}>
                <Text
                  accessibilityLabel={loginNoticeState.accessibilityLabel || undefined}
                  numberOfLines={2}
                  style={styles.noticeText}
                >
                  {loginNoticeState.message}
                </Text>
              </View>
            ) : null}

          {!challenge ? (
            <>
              <View style={[styles.inputShell, loading ? styles.inputShellDisabled : null]}>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect={false}
                  editable={!loading}
                  keyboardType="email-address"
                  placeholder="Email"
                  returnKeyType="next"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  textContentType="username"
                  value={email}
                  testID={uiTestIds.loginEmail}
                  accessibilityLabel="LunarChain email"
                  accessibilityHint="Enter the email address for your LunarChain account."
                  onChangeText={(value) => {
                    setEmail(value);
                    if (errorMessage) {
                      setErrorMessage('');
                    }
                  }}
                />
              </View>

              <View style={[styles.inputShell, loading ? styles.inputShellDisabled : null]}>
                <TextInput
                  {...passwordAutofillHints}
                  autoCapitalize="none"
                  editable={!loading}
                  placeholder="Password"
                  placeholderTextColor={colors.muted}
                  returnKeyType="go"
                  secureTextEntry={
                    !passwordVisible && !SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED
                  }
                  style={styles.input}
                  value={password}
                  testID={uiTestIds.loginPassword}
                  accessibilityLabel="LunarChain password"
                  accessibilityHint="Enter your LunarChain account password."
                  onChangeText={(value) => {
                    setPassword(value);
                    if (errorMessage) {
                      setErrorMessage('');
                    }
                  }}
                  onSubmitEditing={submitCredentials}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={passwordVisible ? 'Hide LunarChain password' : 'Show LunarChain password'}
                  accessibilityHint={passwordVisible ? 'Masks the password field.' : 'Reveals the password field for review.'}
                  accessibilityState={{ selected: passwordVisible }}
                  disabled={loading}
                  hitSlop={PASSWORD_TOGGLE_HIT_SLOP}
                  style={({ pressed }) => [
                    styles.passwordToggle,
                    pressed && !loading ? styles.passwordTogglePressed : null,
                    loading ? styles.passwordToggleDisabled : null
                  ]}
                  onPress={() => setPasswordVisible((value) => !value)}
                >
                  <Text numberOfLines={1} style={styles.passwordToggleText}>{passwordVisible ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={[styles.inputShell, challengeExpired || loading ? styles.inputShellDisabled : null]}>
                <TextInput
                  autoComplete="one-time-code"
                  editable={!challengeExpired && !loading}
                  keyboardType="number-pad"
                  placeholder="6-digit code"
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  style={styles.input}
                  textContentType="oneTimeCode"
                  value={code}
                  testID={uiTestIds.loginCode}
                  accessibilityLabel="LunarChain login code"
                  accessibilityHint="Enter the six-digit code sent by LunarChain."
                  onChangeText={(value) => {
                    setCode(sanitizeLoginCode(value));
                    if (errorMessage && !challengeExpired) {
                      setErrorMessage('');
                    }
                  }}
                  onSubmitEditing={submitCode}
                />
              </View>
              {challengeState ? (
                <View
                  accessibilityRole={challengeState.expired ? 'alert' : undefined}
                  style={[
                    styles.challengeHintBox,
                    challengeState.tone === 'danger' ? styles.challengeHintBoxDanger : null
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.challengeHintText,
                      challengeState.tone === 'danger' ? styles.challengeHintTextDanger : null
                    ]}
                  >
                    {challengeState.helperText}
                  </Text>
                </View>
              ) : null}
            </>
          )}

          {loginErrorState ? (
            <View accessibilityRole="alert" style={styles.errorBox}>
              <Text
                accessibilityLabel={loginErrorState.accessibilityLabel || undefined}
                numberOfLines={2}
                style={styles.errorText}
              >
                {loginErrorState.message}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryActionState.accessibilityLabel}
            accessibilityHint={primaryActionState.accessibilityHint}
            accessibilityState={{ disabled: primaryActionState.disabled }}
            disabled={primaryActionState.disabled}
            testID={uiTestIds.loginPrimaryAction}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && !primaryActionState.disabled ? styles.primaryButtonPressed : null,
              primaryActionState.disabled ? styles.primaryButtonDisabled : null
            ]}
            onPress={challenge ? submitCode : submitCredentials}
          >
            {loading ? <ActivityIndicator color={colors.surface} /> : null}
            <Text numberOfLines={1} style={styles.primaryButtonText}>{primaryActionState.text}</Text>
          </Pressable>

          {challenge ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={secondaryChallengeAction?.accessibilityLabel}
              accessibilityHint={secondaryChallengeAction?.accessibilityHint}
              disabled={loading}
              hitSlop={LOGIN_SECONDARY_ACTION_HIT_SLOP}
              testID={uiTestIds.loginSecondaryAction}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && !loading ? styles.secondaryButtonPressed : null,
                loading ? styles.secondaryButtonDisabled : null
              ]}
              onPress={backToCredentials}
            >
              <Text numberOfLines={1} style={styles.secondaryButtonText}>{secondaryChallengeAction?.text}</Text>
            </Pressable>
          ) : null}

          {!challenge && onCancel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={mapReturnAction.accessibilityLabel}
              accessibilityHint={mapReturnAction.accessibilityHint}
              disabled={loading}
              hitSlop={LOGIN_SECONDARY_ACTION_HIT_SLOP}
              testID={uiTestIds.loginMapReturn}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && !loading ? styles.secondaryButtonPressed : null,
                loading ? styles.secondaryButtonDisabled : null
              ]}
              onPress={onCancel}
            >
              <Text numberOfLines={1} style={styles.secondaryButtonText}>{mapReturnAction.text}</Text>
            </Pressable>
          ) : null}
        </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
