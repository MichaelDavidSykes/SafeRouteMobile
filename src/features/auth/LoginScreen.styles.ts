import { StyleSheet } from 'react-native';

import { colors, controlSizes, radius, spacing, typeScale } from '../../theme';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.control
  },
  keyboardShell: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg
  },
  scrollContentCompact: {
    justifyContent: 'flex-start',
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg
  },
  headerCompact: {
    marginBottom: spacing.md
  },
  logoMark: {
    marginBottom: spacing.md
  },
  logoMarkCompact: {
    marginBottom: spacing.sm
  },
  title: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 40
  },
  titleCompact: {
    fontSize: 30,
    lineHeight: 34
  },
  subtitle: {
    maxWidth: 320,
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: typeScale.md,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center'
  },
  subtitleCompact: {
    fontSize: typeScale.sm,
    lineHeight: 19
  },
  formCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceTranslucent,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0
  },
  formCardCompact: {
    gap: spacing.xs,
    padding: spacing.md
  },
  inputShell: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.xl,
    backgroundColor: colors.control
  },
  inputShellDisabled: {
    opacity: 0.62
  },
  input: {
    flex: 1,
    color: colors.ink,
    fontSize: typeScale.md,
    fontWeight: '600'
  },
  passwordToggle: {
    minHeight: 36,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceGlass
  },
  passwordTogglePressed: {
    backgroundColor: colors.appleBlueSoft
  },
  passwordToggleDisabled: {
    opacity: 0.6
  },
  passwordToggleText: {
    color: colors.appleBlue,
    fontSize: typeScale.sm,
    fontWeight: '800',
    maxWidth: 52,
    textAlign: 'center'
  },
  errorBox: {
    alignSelf: 'center',
    maxWidth: '100%',
    minHeight: controlSizes.compact,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 0.5,
    borderColor: 'rgba(216, 74, 63, 0.18)',
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSoft
  },
  errorText: {
    color: colors.dangerText,
    fontSize: typeScale.sm,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center'
  },
  noticeBox: {
    alignSelf: 'center',
    maxWidth: '100%',
    minHeight: controlSizes.compact,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 0.5,
    borderColor: 'rgba(243, 163, 43, 0.2)',
    borderRadius: radius.pill,
    backgroundColor: colors.amberSoft
  },
  noticeText: {
    color: colors.amberText,
    fontSize: typeScale.sm,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center'
  },
  challengeHintBox: {
    alignSelf: 'center',
    maxWidth: '100%',
    minHeight: controlSizes.compact,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceGlass
  },
  challengeHintBoxDanger: {
    borderColor: 'rgba(216, 74, 63, 0.18)',
    backgroundColor: colors.dangerSoft
  },
  challengeHintText: {
    flexShrink: 1,
    color: colors.muted,
    fontSize: typeScale.sm,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center'
  },
  challengeHintTextDanger: {
    color: colors.dangerText
  },
  primaryButton: {
    minHeight: controlSizes.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue
  },
  primaryButtonPressed: {
    backgroundColor: colors.appleBluePressed,
    transform: [{ scale: 0.985 }]
  },
  primaryButtonDisabled: {
    opacity: 0.68
  },
  primaryButtonText: {
    flexShrink: 1,
    color: colors.surface,
    fontSize: typeScale.md,
    fontWeight: '800',
    maxWidth: 220,
    textAlign: 'center'
  },
  secondaryButton: {
    minHeight: controlSizes.secondary,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: 'transparent'
  },
  secondaryButtonPressed: {
    backgroundColor: colors.appleBlueSoft
  },
  secondaryButtonDisabled: {
    opacity: 0.6
  },
  secondaryButtonText: {
    flexShrink: 1,
    color: colors.appleBlue,
    fontSize: typeScale.sm,
    fontWeight: '800',
    maxWidth: 180,
    textAlign: 'center'
  }
});
