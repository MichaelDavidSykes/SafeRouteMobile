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
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  signInButton: {
    maxWidth: 144,
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
    maxWidth: '100%',
    flexShrink: 1,
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: '800',
    textAlign: 'center'
  },
  signInButtonTextAuthenticated: {
    color: colors.appleBlue
  },
  riskLoadStatus: {
    minHeight: controlSizes.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceGlass
  },
  riskLoadStatusText: {
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: '700'
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
  sheetDock: {
    position: 'relative'
  },
  sheetScroll: {
    maxHeight: 520
  },
  sheetGrabberTouch: {
    // Keep the visible grabber understated while giving the drag affordance a
    // full iOS-sized touch target. This also prevents a downward sheet gesture
    // from being mistaken for scrolling the route fields beneath it.
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sheetGrabber: {
    width: 38,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.mutedSoft
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
  waypointRow: {
    minHeight: controlSizes.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs
  },
  waypointActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2
  },
  waypointAction: {
    maxWidth: 58,
    minHeight: 34,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill
  },
  waypointActionPressed: {
    backgroundColor: colors.appleBlueSoft
  },
  waypointActionText: {
    maxWidth: '100%',
    flexShrink: 1,
    color: colors.appleBlue,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center'
  },
  waypointRemoveText: {
    maxWidth: '100%',
    flexShrink: 1,
    color: colors.danger,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center'
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
  searchResults: {
    maxHeight: 252,
    marginTop: spacing.xs,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceGlass
  },
  searchStateRow: {
    minHeight: controlSizes.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md
  },
  searchStateText: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.muted,
    fontSize: typeScale.sm,
    fontWeight: '600'
  },
  searchResultRow: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft
  },
  searchResultRowPressed: {
    backgroundColor: colors.appleBlueSoft
  },
  searchResultTitle: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: '700'
  },
  searchResultSubtitle: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: '500'
  },
  routeMessage: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: '600',
    lineHeight: 17
  },
  addStopButton: {
    minHeight: controlSizes.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'transparent'
  },
  addStopButtonPressed: {
    backgroundColor: colors.appleBlueSoft
  },
  addStopButtonText: {
    color: colors.appleBlue,
    fontSize: typeScale.sm,
    fontWeight: '800'
  },
  mapActionMenu: {
    position: 'absolute',
    zIndex: 20,
    elevation: 20,
    right: spacing.md,
    bottom: 250,
    left: spacing.md,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceTranslucent
  },
  mapActionCopy: {
    minWidth: 0
  },
  mapActionTitle: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: '800'
  },
  mapActionSubtitle: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: '600'
  },
  mapActionButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  mapActionButton: {
    minHeight: controlSizes.secondary,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.control
  },
  mapActionButtonPressed: {
    backgroundColor: colors.appleBlueSoft,
    transform: [{ scale: 0.985 }]
  },
  mapActionButtonText: {
    color: colors.ink,
    fontSize: typeScale.xs,
    fontWeight: '800',
    textAlign: 'center'
  },
  guestRiskDetail: {
    position: 'absolute',
    zIndex: 20,
    elevation: 20,
    right: spacing.md,
    bottom: 286,
    left: spacing.md,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceTranslucent
  },
  guestRiskDetailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  guestRiskDetailCopy: {
    flex: 1,
    minWidth: 0
  },
  guestRiskEyebrow: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  guestRiskTitle: {
    marginTop: 2,
    color: colors.ink,
    fontSize: typeScale.md,
    fontWeight: '800'
  },
  guestRiskDismiss: {
    maxWidth: 96,
    flexShrink: 0,
    minHeight: controlSizes.secondary,
    minWidth: controlSizes.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlueSoft
  },
  guestRiskDismissPressed: {
    backgroundColor: colors.controlStrong,
    transform: [{ scale: 0.985 }]
  },
  guestRiskDismissText: {
    maxWidth: 64,
    flexShrink: 1,
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: '800',
    textAlign: 'center'
  },
  guestRiskMeta: {
    marginTop: spacing.sm,
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: '700'
  },
  guestRiskBody: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: typeScale.sm,
    fontWeight: '500',
    lineHeight: 19
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
    maxWidth: '100%',
    flexShrink: 1,
    color: colors.surface,
    fontSize: typeScale.md,
    fontWeight: '800',
    textAlign: 'center'
  },
  routePreview: {
    maxWidth: 138,
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
    maxWidth: '100%',
    flexShrink: 1,
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: '800',
    lineHeight: 16,
    textAlign: 'center'
  },
  supportRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: spacing.xs
  },
  supportButton: {
    maxWidth: 112,
    flexShrink: 1,
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
    maxWidth: '100%',
    flexShrink: 1,
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: '800',
    textAlign: 'center'
  },
  collapsedSheet: {
    position: 'absolute',
    right: spacing.md,
    bottom: Platform.OS === 'ios' ? spacing.sm : spacing.md,
    left: spacing.md,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceTranslucent
  },
  collapsedSheetButton: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  collapsedSheetPressed: {
    backgroundColor: colors.appleBlueSoft
  },
  collapsedSheetCopy: {
    minWidth: 0,
    flex: 1
  },
  collapsedSheetTitle: {
    color: colors.ink,
    fontSize: typeScale.md,
    fontWeight: '800'
  },
  collapsedSheetSubtitle: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: '600'
  },
  collapsedSheetAction: {
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: '800'
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
  markerWaypoint: {
    backgroundColor: colors.inkSoft,
    borderRadius: radius.pill
  },
  markerSelected: {
    backgroundColor: colors.appleBlue,
    borderColor: colors.surface,
    borderRadius: radius.pill
  },
  markerCore: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface
  }
});
