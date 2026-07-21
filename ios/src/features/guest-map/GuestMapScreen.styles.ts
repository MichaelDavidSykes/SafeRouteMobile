import { Platform, StyleSheet } from 'react-native';

import { chrome, colors, controlSizes, radius, spacing, typeScale } from '../../theme';

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
    marginTop: Platform.OS === 'android' ? spacing.lg : 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  signInButton: {
    maxWidth: 144,
    minHeight: controlSizes.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 15,
    paddingRight: 18,
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5
  },
  signInButtonAuthenticated: {
    borderColor: 'rgba(255, 255, 255, 0.92)',
    backgroundColor: colors.surface
  },
  signInButtonPressed: {
    transform: [{ scale: 0.985 }]
  },
  signInButtonText: {
    maxWidth: '100%',
    flexShrink: 1,
    color: colors.ink,
    fontSize: typeScale.md,
    fontWeight: '700',
    textAlign: 'center'
  },
  riskLoadStatus: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: 'transparent'
  },
  riskLoadStatusText: {
    color: colors.surface,
    fontSize: typeScale.xs,
    fontWeight: '700'
  },
  currentLocationControlDock: {
    position: 'absolute',
    zIndex: 24,
    elevation: 24,
    right: 14,
    bottom: 186,
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  currentLocationButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5
  },
  layerButton: {
    marginBottom: 0
  },
  currentLocationButtonDisabled: {
    opacity: 0.5
  },
  currentLocationButtonPressed: {
    backgroundColor: colors.appleBlueSoft,
    transform: [{ scale: 0.96 }]
  },
  sheet: {
    marginHorizontal: 0,
    marginBottom: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.sheet,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 18
  },
  sheetDock: {
    position: 'relative',
    zIndex: 31,
    elevation: 31
  },
  sheetScrim: {
    position: 'absolute',
    zIndex: 30,
    elevation: 30,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.12)'
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
    fontSize: 28,
    fontWeight: '800'
  },
  sheetCancel: {
    minHeight: controlSizes.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill
  },
  sheetCancelPressed: {
    backgroundColor: colors.appleBlueSoft
  },
  sheetCancelText: {
    color: colors.appleBlue,
    fontSize: typeScale.sm,
    fontWeight: '700'
  },
  sheetSubtitle: {
    maxWidth: 260,
    marginTop: 2,
    color: colors.muted,
    fontSize: typeScale.sm,
    fontWeight: '500',
    lineHeight: 18
  },
  workspacePicker: {
    marginTop: spacing.sm
  },
  workspaceSelector: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 0,
    borderRadius: 16,
    backgroundColor: colors.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  workspaceSelectorOpen: {
    borderColor: colors.appleBlue
  },
  workspaceSelectorPressed: {
    backgroundColor: colors.appleBlueSoft
  },
  workspaceSelectorCopy: {
    flex: 1,
    minWidth: 0
  },
  workspaceSelectorLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  workspaceSelectorValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700'
  },
  workspaceSelectorAction: {
    maxWidth: 72,
    flexShrink: 1,
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: '800'
  },
  workspaceMenu: {
    maxHeight: 180,
    marginTop: spacing.xs,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceGlass
  },
  workspaceMenuContent: {
    paddingVertical: 2
  },
  workspaceMenuItem: {
    minHeight: controlSizes.secondary,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft
  },
  workspaceMenuItemSelected: {
    backgroundColor: colors.appleBlueSoft
  },
  workspaceMenuItemPressed: {
    backgroundColor: colors.control
  },
  workspaceMenuItemText: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: '600'
  },
  workspaceMenuItemTextSelected: {
    color: colors.appleBlue,
    fontWeight: '800'
  },
  inputStack: {
    marginTop: spacing.sm,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: 16,
    backgroundColor: colors.surface
  },
  inputRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md
  },
  waypointRow: {
    minHeight: 54,
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
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
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
    minHeight: 24,
    paddingVertical: 0,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600'
  },
  routeInputCopy: {
    minWidth: 0,
    flex: 1,
    justifyContent: 'center'
  },
  routeInputOverline: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    textTransform: 'uppercase'
  },
  routeInputMarker: {
    width: 10,
    height: 10,
    flexShrink: 0,
    borderRadius: radius.pill
  },
  routeInputMarkerOrigin: {
    backgroundColor: colors.safe
  },
  routeInputMarkerDestination: {
    borderRadius: 3,
    backgroundColor: colors.appleBlue
  },
  waypointMarker: {
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.info
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
    flexDirection: 'row',
    gap: 5,
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
    zIndex: 32,
    right: spacing.md,
    bottom: chrome.screenBottomInset,
    left: spacing.md,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTranslucent,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 32
  },
  collapsedSheetButton: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  collapsedSheetPressed: {
    backgroundColor: colors.appleBlueSoft
  },
  collapsedSheetCopy: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  collapsedSearchCopy: {
    minWidth: 0,
    flex: 1
  },
  collapsedSheetTitle: {
    color: colors.ink,
    fontSize: typeScale.lg,
    fontWeight: '700'
  },
  collapsedSheetSubtitle: {
    marginTop: 1,
    color: colors.muted,
    fontSize: typeScale.sm,
    fontWeight: '400'
  },
  currentLocationMarker: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center'
  },
  currentLocationHalo: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10, 132, 255, 0.25)'
  },
  currentLocationDot: {
    width: 18,
    height: 18,
    borderWidth: 3,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0
  },
  markerHitArea: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  marker: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0
  },
  markerOrigin: {
    backgroundColor: colors.safe,
    borderRadius: radius.pill
  },
  markerDestination: {
    backgroundColor: colors.appleBlue,
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
    width: 5,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surface
  },
  mapStatusStack: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    marginLeft: 6
  },
  riskSummary: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  riskSummaryText: {
    color: colors.surface,
    fontSize: typeScale.md,
    fontWeight: '700',
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4
  },
  summaryDot: {
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 }
  },
  summaryDotDanger: {
    backgroundColor: colors.danger,
    shadowColor: colors.danger
  },
  summaryDotAmber: {
    backgroundColor: colors.amber,
    shadowColor: colors.amber
  },
  summaryDivider: {
    width: 1,
    height: 14,
    marginHorizontal: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.62)'
  }
});
