import { Platform, StyleSheet } from 'react-native';

import { colors, controlSizes, radius, spacing, typeScale } from '../../theme';

export const guestMapStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.mapFallback
  },
  map: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    pointerEvents: 'box-none'
  },
  topBar: {
    marginHorizontal: spacing.md,
    marginTop: Platform.OS === 'android' ? spacing.lg : spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm
  },
  signInButton: {
    minHeight: controlSizes.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceGlass,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0
  },
  signInButtonAuthenticated: {
    borderColor: 'rgba(10, 132, 255, 0.2)',
    backgroundColor: colors.appleBlueSoft
  },
  signInButtonPressed: {
    transform: [{ scale: 0.985 }]
  },
  signInButtonText: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: '800'
  },
  signInButtonTextAuthenticated: {
    color: colors.appleBlue
  },
  sheet: {
    marginHorizontal: spacing.md,
    marginBottom: Platform.OS === 'ios' ? spacing.sm : spacing.md,
    padding: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceTranslucent,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  sheetTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  sheetTitle: {
    color: colors.ink,
    fontSize: typeScale.xl,
    fontWeight: '800'
  },
  sheetSubtitle: {
    maxWidth: 260,
    marginTop: 2,
    color: colors.muted,
    fontSize: typeScale.sm,
    fontWeight: '500',
    lineHeight: 18
  },
  inputStack: {
    marginTop: spacing.sm,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceGlass
  },
  inputRow: {
    minHeight: controlSizes.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm
  },
  inputRowDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft
  },
  input: {
    flex: 1,
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: '600'
  },
  primaryButton: {
    minHeight: controlSizes.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue
  },
  primaryButtonDisabled: {
    backgroundColor: colors.mutedSoft
  },
  primaryButtonPressed: {
    backgroundColor: colors.appleBluePressed,
    transform: [{ scale: 0.985 }]
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: typeScale.md,
    fontWeight: '800'
  },
  routePreview: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    backgroundColor: colors.control
  },
  routePreviewInline: {
    marginTop: 2,
    flexShrink: 0
  },
  routePreviewSummary: {
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: '800',
    lineHeight: 16
  },
  supportRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: spacing.xs
  },
  supportButton: {
    minHeight: controlSizes.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'transparent'
  },
  supportButtonPressed: {
    backgroundColor: colors.appleBlueSoft,
    transform: [{ scale: 0.985 }]
  },
  supportLabel: {
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: '800',
    textAlign: 'center'
  },
  marker: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0
  },
  markerOrigin: {
    backgroundColor: colors.appleBlue,
    borderRadius: radius.pill
  },
  markerDestination: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill
  },
  markerCore: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface
  }
});
