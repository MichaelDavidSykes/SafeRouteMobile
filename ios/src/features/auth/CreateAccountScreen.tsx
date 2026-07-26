import { useMemo, useRef, useState } from 'react';
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
  useWindowDimensions
} from 'react-native';
import { ArrowLeft, Check, Eye, EyeOff, MailCheck } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MotionEntrance } from '../../motion/SafeRouteMotion';
import { uiTestIds } from '../../testing/uiTestIds';
import { getUserFacingErrorMessage } from '../api/userFacingErrors';
import {
  getAccountPasswordRequirements,
  getAccountRegistrationError,
  getAccountVerificationError
} from './accountRegistrationState';
import { registerAccount, verifyAccountEmail } from './authApi';
import { ACCOUNT_ALREADY_EXISTS_MESSAGE, AccountAlreadyExistsError } from './authApiCore';
import { AuthBackdrop } from './AuthBackdrop';
import { createAccountStyles as styles } from './CreateAccountScreen.styles';
import { sanitizeLoginCode } from './twoFactorChallenge';

const ACCOUNT_CONNECTION_MESSAGE =
  'Unable to reach LunarChain. Check your connection and try again.';

export type CreateAccountInitialStep = 'details' | 'verification';

interface CreateAccountScreenProps {
  invitationClientName?: string;
  invitationToken?: string;
  initialEmail?: string;
  initialStep?: CreateAccountInitialStep;
  previewMode?: boolean;
  onAccountExists: (email: string) => void;
  onBack: () => void;
  onVerified: (email: string) => void;
}

type AccountField = 'first-name' | 'last-name' | 'email' | 'password' | 'code' | null;

export function CreateAccountScreen({
  invitationClientName = '',
  invitationToken = '',
  initialEmail = '',
  initialStep = 'details',
  previewMode = false,
  onAccountExists,
  onBack,
  onVerified
}: CreateAccountScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const viewport = useWindowDimensions();
  const compact = viewport.height < 720 || viewport.width < 370;
  const [step, setStep] = useState<CreateAccountInitialStep>(initialStep);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [code, setCode] = useState('');
  const [focusedField, setFocusedField] = useState<AccountField>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);
  const requirements = useMemo(() => getAccountPasswordRequirements(password), [password]);
  const hasInvitation = invitationToken.trim().length >= 8;
  const registrationDisabled = loading || (!previewMode && !hasInvitation);
  const invitationRequiredMessage =
    !previewMode && !hasInvitation
      ? 'Account creation is invitation-only. Open the invitation sent by your workspace admin.'
      : '';

  const clearError = () => {
    if (errorMessage) {
      setErrorMessage('');
    }
  };

  const submitRegistration = async () => {
    if (!previewMode && !hasInvitation) {
      setErrorMessage(invitationRequiredMessage);
      AccessibilityInfo.announceForAccessibility(invitationRequiredMessage);
      return;
    }

    const validationError = getAccountRegistrationError({
      email,
      firstName,
      lastName,
      password
    });
    if (validationError) {
      setErrorMessage(validationError);
      AccessibilityInfo.announceForAccessibility(validationError);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      if (!previewMode) {
        await registerAccount({
          email,
          firstName,
          invitationToken,
          lastName,
          password
        });
      }
      setEmail(email.trim().toLowerCase());
      setCode('');
      setStep('verification');
      requestAnimationFrame(() => codeRef.current?.focus());
    } catch (error) {
      if (error instanceof AccountAlreadyExistsError) {
        AccessibilityInfo.announceForAccessibility(ACCOUNT_ALREADY_EXISTS_MESSAGE);
        onAccountExists(email.trim().toLowerCase());
        return;
      }
      setErrorMessage(
        getUserFacingErrorMessage(
          error,
          'Unable to create the account.',
          ACCOUNT_CONNECTION_MESSAGE
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const submitVerification = async () => {
    const cleanCode = sanitizeLoginCode(code);
    const validationError = getAccountVerificationError(cleanCode);
    if (validationError) {
      setErrorMessage(validationError);
      AccessibilityInfo.announceForAccessibility(validationError);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      if (!previewMode) {
        await verifyAccountEmail(email, cleanCode, invitationToken);
      }
      onVerified(email.trim().toLowerCase());
    } catch (error) {
      setErrorMessage(
        getUserFacingErrorMessage(
          error,
          'Unable to verify the account. Check the verification code and try again.',
          ACCOUNT_CONNECTION_MESSAGE
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (loading) {
      return;
    }
    if (step === 'verification') {
      setCode('');
      setErrorMessage('');
      setStep('details');
      return;
    }
    onBack();
  };

  return (
    <SafeAreaView style={styles.screen} testID={uiTestIds.accountCreateScreen}>
      <AuthBackdrop />
      <Pressable
        accessibilityLabel={step === 'verification' ? 'Back to account details' : 'Back to sign in'}
        accessibilityRole="button"
        disabled={loading}
        style={({ pressed }) => [
          styles.backButton,
          { top: safeAreaInsets.top + 12 },
          pressed && !loading ? styles.backButtonPressed : null,
          loading ? styles.backButtonDisabled : null
        ]}
        testID={uiTestIds.accountCreateBack}
        onPress={handleBack}
      >
        <ArrowLeft color="#FFFFFF" size={20} strokeWidth={2.4} />
      </Pressable>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardShell}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.scrollContent,
            compact ? styles.scrollContentCompact : null
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'details' ? (
            <>
              <MotionEntrance
                delay={0}
                replayKey={step}
                style={[styles.header, compact ? styles.headerCompact : null]}
                variant="auth"
              >
                <Image
                  accessibilityIgnoresInvertColors
                  accessibilityLabel="SafeRoute"
                  source={require('../../../assets/logo-mark-approved.png')}
                  style={styles.logo}
                />
                <Text accessibilityRole="header" style={styles.title}>
                  Create account
                </Text>
                <Text style={styles.subtitle}>
                  {invitationClientName
                    ? `Join ${invitationClientName} with your SafeRoute account`
                    : 'Set up your SafeRoute account'}
                </Text>
              </MotionEntrance>

              <View style={styles.form} testID={uiTestIds.accountCreateForm}>
                <MotionEntrance delay={60} replayKey={step} style={styles.nameRow} variant="auth">
                  <View
                    style={[
                      styles.inputShell,
                      styles.nameField,
                      focusedField === 'first-name' ? styles.inputShellFocused : null,
                      loading ? styles.inputShellDisabled : null
                    ]}
                  >
                    <TextInput
                      accessibilityLabel="First name"
                      autoCapitalize="words"
                      autoCorrect={false}
                      editable={!loading}
                      placeholder="First name"
                      placeholderTextColor="#7F838C"
                      returnKeyType="next"
                      style={styles.input}
                      testID={uiTestIds.accountCreateFirstName}
                      textContentType="givenName"
                      value={firstName}
                      onBlur={() => setFocusedField(null)}
                      onChangeText={(value) => {
                        setFirstName(value);
                        clearError();
                      }}
                      onFocus={() => setFocusedField('first-name')}
                      onSubmitEditing={() => lastNameRef.current?.focus()}
                    />
                  </View>
                  <View
                    style={[
                      styles.inputShell,
                      styles.nameField,
                      focusedField === 'last-name' ? styles.inputShellFocused : null,
                      loading ? styles.inputShellDisabled : null
                    ]}
                  >
                    <TextInput
                      ref={lastNameRef}
                      accessibilityLabel="Last name"
                      autoCapitalize="words"
                      autoCorrect={false}
                      editable={!loading}
                      placeholder="Last name"
                      placeholderTextColor="#7F838C"
                      returnKeyType="next"
                      style={styles.input}
                      testID={uiTestIds.accountCreateLastName}
                      textContentType="familyName"
                      value={lastName}
                      onBlur={() => setFocusedField(null)}
                      onChangeText={(value) => {
                        setLastName(value);
                        clearError();
                      }}
                      onFocus={() => setFocusedField('last-name')}
                      onSubmitEditing={() => emailRef.current?.focus()}
                    />
                  </View>
                </MotionEntrance>

                <MotionEntrance
                  delay={60}
                  replayKey={step}
                  style={[
                    styles.inputShell,
                    focusedField === 'email' ? styles.inputShellFocused : null,
                    loading ? styles.inputShellDisabled : null
                  ]}
                  variant="auth"
                >
                  <TextInput
                    ref={emailRef}
                    accessibilityLabel="Email"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    editable={!loading && !hasInvitation}
                    keyboardType="email-address"
                    placeholder="Email"
                    placeholderTextColor="#7F838C"
                    returnKeyType="next"
                    style={styles.input}
                    testID={uiTestIds.accountCreateEmail}
                    textContentType="emailAddress"
                    value={email}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={(value) => {
                      setEmail(value);
                      clearError();
                    }}
                    onFocus={() => setFocusedField('email')}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </MotionEntrance>

                <MotionEntrance
                  delay={60}
                  replayKey={step}
                  style={[
                    styles.inputShell,
                    focusedField === 'password' ? styles.inputShellFocused : null,
                    loading ? styles.inputShellDisabled : null
                  ]}
                  variant="auth"
                >
                  <TextInput
                    ref={passwordRef}
                    accessibilityLabel="Password"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    autoCorrect={false}
                    editable={!loading}
                    placeholder="Password"
                    placeholderTextColor="#7F838C"
                    returnKeyType="done"
                    secureTextEntry={!passwordVisible}
                    style={styles.input}
                    testID={uiTestIds.accountCreatePassword}
                    textContentType="newPassword"
                    value={password}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={(value) => {
                      setPassword(value);
                      clearError();
                    }}
                    onFocus={() => setFocusedField('password')}
                    onSubmitEditing={() => void submitRegistration()}
                  />
                  <Pressable
                    accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
                    accessibilityRole="button"
                    accessibilityState={{ selected: passwordVisible }}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.passwordToggle,
                      pressed && !loading ? styles.passwordTogglePressed : null
                    ]}
                    testID={uiTestIds.accountCreatePasswordToggle}
                    onPress={() => setPasswordVisible((visible) => !visible)}
                  >
                    {passwordVisible ? (
                      <EyeOff color="#7F838C" size={19} strokeWidth={1.8} />
                    ) : (
                      <Eye color="#7F838C" size={19} strokeWidth={1.8} />
                    )}
                  </Pressable>
                </MotionEntrance>

                <MotionEntrance
                  accessibilityLabel="Password requirements"
                  delay={100}
                  replayKey={step}
                  style={styles.requirements}
                  variant="auth"
                >
                  <PasswordRequirement
                    label="At least 8 characters"
                    met={requirements.length}
                    testID={uiTestIds.accountCreateRequirementLength}
                  />
                  <PasswordRequirement
                    label="One letter and one number"
                    met={requirements.letterAndNumber}
                    testID={uiTestIds.accountCreateRequirementLetterNumber}
                  />
                  <PasswordRequirement
                    label="One special character"
                    met={requirements.special}
                    testID={uiTestIds.accountCreateRequirementSpecial}
                  />
                </MotionEntrance>

                {invitationRequiredMessage && !errorMessage ? (
                  <MotionEntrance delay={100} replayKey={step} variant="auth">
                    <AccountError>{invitationRequiredMessage}</AccountError>
                  </MotionEntrance>
                ) : null}
                {errorMessage ? (
                  <MotionEntrance delay={100} replayKey={step} variant="auth">
                    <AccountError>{errorMessage}</AccountError>
                  </MotionEntrance>
                ) : null}

                <MotionEntrance delay={140} replayKey={step} variant="auth">
                  <Pressable
                    accessibilityLabel="Create SafeRoute account"
                    accessibilityRole="button"
                    accessibilityState={{
                      busy: loading,
                      disabled: registrationDisabled
                    }}
                    disabled={registrationDisabled}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && !loading ? styles.primaryButtonPressed : null,
                      registrationDisabled ? styles.primaryButtonDisabled : null
                    ]}
                    testID={uiTestIds.accountCreateSubmit}
                    onPress={() => void submitRegistration()}
                  >
                    {loading ? <ActivityIndicator color="#12141A" /> : null}
                    <Text style={styles.primaryButtonText}>
                      {loading ? 'Creating account...' : 'Create account'}
                    </Text>
                  </Pressable>
                </MotionEntrance>

                <MotionEntrance delay={200} replayKey={step} style={styles.footer} variant="auth">
                  <Text style={styles.footerText}>Already have an account?</Text>
                  <Pressable
                    accessibilityLabel="Sign in"
                    accessibilityRole="button"
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.footerButton,
                      pressed ? styles.footerButtonPressed : null
                    ]}
                    testID={uiTestIds.accountCreateSignIn}
                    onPress={onBack}
                  >
                    <Text style={styles.footerButtonText}>Sign in</Text>
                  </Pressable>
                </MotionEntrance>
              </View>
            </>
          ) : (
            <View testID={uiTestIds.accountVerifyScreen}>
              <MotionEntrance
                delay={0}
                replayKey={step}
                style={[styles.header, compact ? styles.headerCompact : null]}
                variant="auth"
              >
                <View style={styles.verificationIcon}>
                  <MailCheck color="#5CA4FF" size={28} strokeWidth={1.8} />
                </View>
                <Text accessibilityRole="header" style={styles.title}>
                  Verify your email
                </Text>
                <Text style={styles.subtitle}>
                  Enter the 6-digit code sent to {email || 'your email'}.
                </Text>
              </MotionEntrance>
              <View style={styles.form}>
                <MotionEntrance
                  delay={60}
                  replayKey={step}
                  style={[
                    styles.inputShell,
                    focusedField === 'code' ? styles.inputShellFocused : null,
                    loading ? styles.inputShellDisabled : null
                  ]}
                  variant="auth"
                >
                  <TextInput
                    ref={codeRef}
                    accessibilityLabel="Email verification code"
                    autoComplete="one-time-code"
                    editable={!loading}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="123456"
                    placeholderTextColor="#7F838C"
                    returnKeyType="done"
                    style={[styles.input, styles.codeInput]}
                    testID={uiTestIds.accountVerifyCode}
                    textContentType="oneTimeCode"
                    value={code}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={(value) => {
                      setCode(sanitizeLoginCode(value));
                      clearError();
                    }}
                    onFocus={() => setFocusedField('code')}
                    onSubmitEditing={() => void submitVerification()}
                  />
                </MotionEntrance>
                {errorMessage ? (
                  <MotionEntrance delay={60} replayKey={step} variant="auth">
                    <AccountError>{errorMessage}</AccountError>
                  </MotionEntrance>
                ) : null}
                <MotionEntrance delay={120} replayKey={step} variant="auth">
                  <Pressable
                    accessibilityLabel="Verify email"
                    accessibilityRole="button"
                    accessibilityState={{ busy: loading, disabled: loading }}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && !loading ? styles.primaryButtonPressed : null,
                      loading ? styles.primaryButtonDisabled : null
                    ]}
                    testID={uiTestIds.accountVerifySubmit}
                    onPress={() => void submitVerification()}
                  >
                    {loading ? <ActivityIndicator color="#12141A" /> : null}
                    <Text style={styles.primaryButtonText}>
                      {loading ? 'Verifying...' : 'Verify email'}
                    </Text>
                  </Pressable>
                </MotionEntrance>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasswordRequirement({
  label,
  met,
  testID
}: {
  label: string;
  met: boolean;
  testID: string;
}) {
  return (
    <View
      accessibilityLabel={`${label}. ${met ? 'Met' : 'Not met'}`}
      style={styles.requirement}
      testID={testID}
    >
      <View style={[styles.requirementIcon, met ? styles.requirementIconMet : null]}>
        <Check color={met ? '#0A0C11' : 'rgba(255,255,255,0.25)'} size={11} strokeWidth={2.4} />
      </View>
      <Text style={[styles.requirementText, met ? styles.requirementTextMet : null]}>{label}</Text>
    </View>
  );
}

function AccountError({ children }: { children: string }) {
  return (
    <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.status}>
      <Text style={styles.statusText}>{children}</Text>
    </View>
  );
}
