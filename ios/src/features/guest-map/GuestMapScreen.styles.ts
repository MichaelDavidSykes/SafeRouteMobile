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
    color: colors.onAccent,
    fontSize: typeScale.xs,
    fontWeight: '700'
  },
  currentLocationControlDock: {
    position: 'absolute',
    zIndex: 24,
    elevation: 24,
    right: 14,
    bottom: chrome.screenBottomInset + 76 + spacing.sm + 46 + spacing.sm,
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
  sheetDock: {
    zIndex: 31,
    elevation: 31,
  },
  persistentMapSheetContainer: {
    marginHorizontal: spacing.md,
    borderCurve: 'continuous',
    borderRadius: radius.sheet,
  },
  persistentCollapsedContent: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    minHeight: 60,
  },
  persistentDetailContent: {
    flex: 1,
  },
  persistentDetailScroll: {
    flex: 1,
  },
  persistentDetailScrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  sheetScroll: {
    flex: 1,
    maxHeight: 520
  },
  sheetContentFrame: {
    flex: 1,
  },
  sheetScrollContentSearching: {
    paddingBottom: spacing.md,
  },
  sheetFooter: {
    position: 'relative',
    zIndex: 2,
    flexShrink: 0,
    paddingTop: spacing.xs,
  },
  routeChoiceLabel: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: '700',
    textAlign: 'center',
  },
  sheetGrabberTouch: {
    // Keep one measured handle height in every detent. Changing this height
    // after dismissing details shifts the collapsed row on physical devices.
    height: 16,
    minHeight: 16,
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
    minHeight: controlSizes.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  sheetCancel: {
    minHeight: controlSizes.secondary,
    marginLeft: 'auto',
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
  workspaceSelectorContent: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
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
  routeAlternativeSelector: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 4,
    marginTop: spacing.sm,
    padding: 3,
    borderRadius: 13,
    backgroundColor: '#e7e7ec',
  },
  routeAlternativeOption: {
    minWidth: 0,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRadius: 9,
  },
  routeAlternativeOptionSelected: {
    backgroundColor: colors.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  routeAlternativeOptionPressed: {
    opacity: 0.68,
  },
  routeAlternativeTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  routeAlternativeTitleSelected: {
    color: colors.ink,
  },
  routeAlternativeMetric: {
    marginTop: 1,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  routeAlternativeMetricSelected: {
    color: colors.appleBlue,
    fontWeight: '800',
  },
  travelModeSelector: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: spacing.sm,
    padding: 3,
    borderRadius: 13,
    backgroundColor: '#e7e7ec',
  },
  travelModeOptionSelected: {
    backgroundColor: colors.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  travelModeOption: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: 9,
  },
  travelModeOptionPressed: {
    opacity: 0.65,
  },
  travelModeOptionDisabled: {
    opacity: 0.45,
  },
  travelModeLabel: {
    minWidth: 0,
    flexShrink: 1,
    color: colors.muted,
    fontSize: typeScale.sm,
    fontWeight: '700',
  },
  travelModeLabelSelected: {
    color: colors.appleBlue,
    fontWeight: '700',
  },
  routeOptions: {
    marginTop: spacing.xs,
    borderTopWidth: 0.5,
    borderTopColor: colors.glassBorder,
  },
  routeOptionsHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.xs,
  },
  routeOptionsHeaderPressed: {
    opacity: 0.62,
  },
  routeOptionsTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  routeOptionsCount: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  routeOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: spacing.xs,
  },
  routePreference: {
    width: '50%',
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: spacing.xs,
    paddingRight: 2,
  },
  routePreferencePressed: {
    opacity: 0.65,
  },
  routePreferenceLabel: {
    minWidth: 0,
    flex: 1,
    color: colors.ink,
    fontSize: 11,
    fontWeight: '600',
  },
  inputRow: {
    minHeight: 64,
    paddingHorizontal: spacing.md
  },
  waypointRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
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
    height: 24,
    paddingVertical: 0,
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20
  },
  routeInputCopy: {
    minWidth: 0,
    flex: 1,
    justifyContent: 'center'
  },
  routeInputHeaderRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  routeInputMarkerSpacer: {
    width: 24,
    height: 13,
    flexShrink: 0
  },
  routeInputOverline: {
    flex: 1,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    textTransform: 'uppercase'
  },
  routeInputValueRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  routeInputMarker: {
    width: 24,
    height: 24,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.pill
  },
  routeInputMarkerOrigin: {
    borderColor: colors.safe,
    backgroundColor: colors.safeSoft
  },
  routeInputMarkerDestination: {
    borderColor: colors.appleBlue,
    backgroundColor: colors.appleBlueSoft
  },
  waypointMarker: {
    width: 24,
    height: 24,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.info,
    borderRadius: radius.pill,
    backgroundColor: colors.infoSoft
  },
  waypointMarkerLabel: {
    color: colors.infoText,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
    textAlign: 'center'
  },
  searchResults: {
    maxHeight: 280,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
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
  searchSectionLabel: {
    paddingLeft: spacing.md + 17 + spacing.sm,
    paddingRight: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 4,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  searchResultRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSoft
  },
  searchResultRowDisabled: {
    opacity: 0.5,
  },
  searchResultSelection: {
    minWidth: 0,
    minHeight: 52,
    flex: 1,
    justifyContent: 'center',
    marginLeft: spacing.sm,
    paddingVertical: spacing.xs,
  },
  searchResultRowPressed: {
    backgroundColor: colors.appleBlueSoft
  },
  searchResultManage: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
    borderRadius: radius.pill,
  },
  searchResultManagePressed: {
    backgroundColor: colors.control,
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
  mapActionIconTile: {
    backgroundColor: colors.appleBlueSoft
  },
  mapActionBody: {
    marginTop: 13,
    color: colors.inkSoft,
    fontSize: 13.5,
    lineHeight: 20
  },
  mapActionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  mapActionButton: {
    minHeight: controlSizes.secondary,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill
  },
  mapActionPrimaryButton: {
    backgroundColor: colors.appleBlue
  },
  mapActionSecondaryButton: {
    backgroundColor: colors.control
  },
  mapActionButtonDisabled: {
    opacity: 0.45
  },
  mapActionButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }]
  },
  mapActionPrimaryButtonText: {
    color: colors.onAccent,
    fontSize: typeScale.sm,
    fontWeight: '800',
    textAlign: 'center'
  },
  mapActionSecondaryButtonText: {
    color: colors.ink,
    fontSize: typeScale.sm,
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
    color: colors.onAccent,
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
  collapsedSheetButton: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 18,
    paddingVertical: 0
  },
  collapsedRouteActions: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 5,
  },
  collapsedRouteStatus: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 18,
    paddingVertical: spacing.sm,
  },
  collapsedRouteSummaryButton: {
    minWidth: 0,
    height: 50,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: 15,
  },
  collapsedRouteReadyIcon: {
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.appleBlueSoft,
  },
  collapsedRouteReadyLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  collapsedRouteCancelButton: {
    minWidth: 62,
    minHeight: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  collapsedRouteCancelButtonPressed: {
    backgroundColor: colors.control,
    transform: [{ scale: 0.98 }],
  },
  collapsedRouteCancelButtonText: {
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  collapsedRouteStartButton: {
    width: 88,
    minHeight: 44,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.appleBlue,
    borderRadius: 14,
    backgroundColor: colors.appleBlueSoft,
  },
  collapsedRouteStartButtonDisabled: {
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    backgroundColor: colors.controlStrong,
  },
  collapsedRouteStartButtonPressed: {
    backgroundColor: 'rgba(10, 132, 255, 0.24)',
    transform: [{ scale: 0.98 }],
  },
  collapsedRouteStartButtonText: {
    maxWidth: '100%',
    color: colors.appleBlue,
    fontSize: typeScale.sm,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
  collapsedRouteStartButtonTextDisabled: {
    color: colors.inkSoft,
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
    alignSelf: 'stretch',
    flex: 1,
    justifyContent: 'center',
  },
  collapsedSheetTitle: {
    color: colors.ink,
    fontSize: typeScale.md,
    fontWeight: '700',
    lineHeight: 20,
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
    borderColor: colors.onAccent,
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
    borderColor: colors.onAccent,
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
    borderColor: colors.onAccent,
    borderRadius: radius.pill
  },
  markerSelectionHalo: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderWidth: 2,
    borderColor: 'rgba(0, 122, 255, 0.28)',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 122, 255, 0.10)'
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
    color: colors.onAccent,
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
