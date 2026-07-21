import { StyleSheet } from "react-native";

import { chrome, colors, controlSizes, radius, spacing, typeScale } from "../../theme";

export const operationsStyles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.control
  },
  header: {
    gap: 3,
    marginTop: 0,
    marginBottom: spacing.md
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  headerCopy: {
    flex: 1,
    minWidth: 0
  },
  eyebrow: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: typeScale.display,
    fontWeight: "800",
    lineHeight: 38
  },
  subtitle: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "600",
    lineHeight: 16
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  mapButton: {
    minHeight: controlSizes.compact,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlueSoft
  },
  mapButtonPressed: {
    transform: [{ scale: 0.985 }]
  },
  mapButtonText: {
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: "900"
  },
  signOutButton: {
    minHeight: controlSizes.compact,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: "transparent"
  },
  signOutButtonPressed: {
    backgroundColor: colors.appleBlueSoft,
    transform: [{ scale: 0.985 }]
  },
  signOutButtonText: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "800"
  },
  noticeBox: {
    alignSelf: "stretch",
    minHeight: 24,
    alignItems: "flex-start",
    justifyContent: "center",
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs
  },
  noticeText: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "700",
    lineHeight: 16
  },
  clientFilter: {
    marginBottom: spacing.sm
  },
  clientSelector: {
    minHeight: controlSizes.secondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceGlass
  },
  clientSelectorOpen: {
    borderColor: colors.appleBlue,
    backgroundColor: colors.surfaceTranslucent
  },
  clientSelectorCopy: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  clientSelectorLabel: {
    flexShrink: 0,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "700"
  },
  clientSelectorValue: {
    minWidth: 0,
    flex: 1,
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "800"
  },
  clientSelectorAction: {
    flexShrink: 0,
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: "800"
  },
  clientMenu: {
    maxHeight: 220,
    marginTop: spacing.xs,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceTranslucent
  },
  clientMenuContent: {
    padding: 4
  },
  clientMenuItem: {
    minHeight: controlSizes.secondary,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg
  },
  clientMenuItemSelected: {
    backgroundColor: colors.appleBlueSoft
  },
  clientMenuItemPressed: {
    backgroundColor: colors.surfaceGlass
  },
  clientMenuItemText: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "700"
  },
  clientMenuItemTextSelected: {
    color: colors.appleBlue,
    fontWeight: "900"
  },
  tabs: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.lg,
    marginBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: "transparent"
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: controlSizes.secondary,
    paddingHorizontal: 2,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    backgroundColor: "transparent"
  },
  tabSelected: {
    borderBottomColor: colors.appleBlue
  },
  tabPressed: {
    transform: [{ scale: 0.985 }]
  },
  tabText: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "800"
  },
  tabTextSelected: {
    color: colors.appleBlue
  },
  summaryStrip: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs
  },
  summaryMetric: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3
  },
  summaryValue: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "900",
    lineHeight: 18
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "800"
  },
  warningBox: {
    alignSelf: "center",
    maxWidth: "100%",
    minHeight: controlSizes.compact,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 0.5,
    borderColor: "rgba(243, 163, 43, 0.22)",
    borderRadius: radius.pill,
    backgroundColor: colors.amberSoft
  },
  warningText: {
    color: colors.amberText,
    fontSize: typeScale.xs,
    fontWeight: "800",
    lineHeight: 16,
    textAlign: "center"
  },
  offlineReviewControls: {
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  offlineSavingControl: {
    width: "100%",
    minHeight: controlSizes.secondary,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceGlass,
  },
  offlineSavingCompactAction: {
    alignSelf: "flex-end",
    minHeight: controlSizes.compact,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: "transparent",
  },
  offlineSavingCompactActionText: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "800",
  },
  offlineSavingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingVertical: spacing.xs,
  },
  offlineSavingTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  offlineSavingTitle: {
    flexShrink: 1,
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "800",
    lineHeight: 18,
  },
  offlineSavingMessage: {
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "600",
    lineHeight: 16,
  },
  offlineSavingAction: {
    minHeight: controlSizes.secondary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlueSoft,
  },
  offlineSavingActionDanger: {
    backgroundColor: "transparent",
  },
  offlineSavingActionPressed: {
    transform: [{ scale: 0.985 }],
  },
  offlineSavingActionText: {
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: "900",
    textAlign: "center",
  },
  offlineSavingActionDangerText: {
    color: colors.dangerText,
  },
  offlineNotice: {
    alignSelf: "center",
    maxWidth: "94%",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceGlass
  },
  offlineNoticeText: {
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "700",
    textAlign: "center"
  },
  offlineRemoveButton: {
    minHeight: controlSizes.secondary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: "transparent",
  },
  offlineRemoveButtonPressed: {
    backgroundColor: colors.dangerSoft,
    transform: [{ scale: 0.985 }],
  },
  offlineRemoveButtonText: {
    color: colors.dangerText,
    fontSize: typeScale.sm,
    fontWeight: "800",
    textAlign: "center",
  },
  offlineRemovalStatus: {
    alignSelf: "center",
    width: "100%",
    minHeight: controlSizes.secondary,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    backgroundColor: colors.infoSoft,
  },
  offlineRemovalStatusFailure: {
    borderColor: "rgba(243, 163, 43, 0.22)",
    backgroundColor: colors.amberSoft,
  },
  offlineRemovalStatusSuccess: {
    borderColor: "rgba(21, 185, 129, 0.22)",
    backgroundColor: colors.safeSoft,
  },
  offlineRemovalStatusCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  offlineRemovalStatusTitle: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "800",
  },
  offlineRemovalStatusText: {
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "600",
    lineHeight: 16,
  },
  offlineRemovalRetry: {
    alignSelf: "center",
    minHeight: controlSizes.secondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: "transparent",
  },
  offlineRemovalRetryText: {
    color: colors.amberText,
    fontSize: typeScale.sm,
    fontWeight: "800",
    textAlign: "center",
  },
  errorBox: {
    alignSelf: "center",
    maxWidth: "100%",
    minHeight: controlSizes.secondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 0.5,
    borderColor: "rgba(216, 74, 63, 0.18)",
    borderRadius: radius.xl,
    backgroundColor: colors.dangerSoft
  },
  errorCopy: {
    flex: 1,
    gap: 2
  },
  errorTitle: {
    color: colors.dangerText,
    fontSize: typeScale.sm,
    fontWeight: "800"
  },
  errorText: {
    color: colors.dangerText,
    fontSize: typeScale.xs,
    fontWeight: "600",
    lineHeight: 16
  },
  retryButton: {
    minHeight: controlSizes.compact,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: "transparent"
  },
  retryButtonPressed: {
    backgroundColor: colors.surfaceGlass
  },
  retryText: {
    color: colors.dangerText,
    fontSize: typeScale.xs,
    fontWeight: "800"
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md
  },
  loadingCard: {
    minHeight: controlSizes.secondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceGlass
  },
  loadingTitle: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "800"
  },
  list: {
    paddingTop: 0,
    paddingBottom: chrome.screenBottomInset
  },
  routeCard: {
    minHeight: controlSizes.secondary,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft
  },
  routeCardPressed: {
    backgroundColor: colors.surfaceGlass,
    transform: [{ scale: 0.995 }],
  },
  routeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  routeTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: typeScale.lg,
    fontWeight: "800",
    lineHeight: 21
  },
  badge: {
    minHeight: 26,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.infoSoft
  },
  badgeText: {
    color: colors.infoText,
    fontSize: typeScale.xs,
    fontWeight: "900"
  },
  routeEndpoint: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "700"
  },
  routeMeta: {
    marginTop: spacing.xs,
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "800",
    lineHeight: 16
  },
  routeManifest: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "700",
    lineHeight: 16
  },
  convoyRoutes: {
    gap: 3,
    marginTop: spacing.sm
  },
  convoyRouteText: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "700",
    lineHeight: 16
  },
  openDetailText: {
    marginTop: spacing.sm,
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: "900",
  },
  calendarGroup: {
    gap: 10,
    marginBottom: 24,
  },
  calendarGroupTitle: {
    paddingHorizontal: 4,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
  calendarGroupRows: {
    gap: 10,
  },
  calendarCard: {
    minHeight: 108,
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.045,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  calendarTimeColumn: {
    width: 50,
    alignItems: "flex-start",
    paddingRight: spacing.sm,
  },
  calendarTimeEyebrow: {
    marginTop: 2,
    color: colors.mutedSoft,
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
  },
  calendarTime: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 21,
  },
  calendarDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginRight: spacing.md,
    backgroundColor: colors.border,
  },
  calendarTripContent: {
    minWidth: 0,
    flex: 1,
  },
  calendarTripEyebrow: {
    color: colors.muted,
    fontSize: typeScale.xs - 1,
    fontWeight: "900",
    lineHeight: 13,
  },
  calendarTripHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  calendarTripTitle: {
    minWidth: 0,
    flex: 1,
    color: colors.ink,
    fontSize: typeScale.md,
    fontWeight: "900",
    lineHeight: 20,
  },
  calendarEndpoint: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: "600",
    lineHeight: 17,
  },
  calendarCrewEyebrow: {
    marginTop: spacing.sm,
    color: colors.muted,
    fontSize: typeScale.xs - 1,
    fontWeight: "900",
    lineHeight: 13,
  },
  calendarCrew: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  statusChip: {
    minHeight: 24,
    maxWidth: 108,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.infoSoft,
  },
  statusChipSafe: {
    backgroundColor: colors.safeSoft,
  },
  statusChipWarning: {
    backgroundColor: colors.amberSoft,
  },
  statusChipDanger: {
    backgroundColor: colors.dangerSoft,
  },
  statusDot: {
    width: 6,
    height: 6,
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.info,
  },
  statusDotSafe: {
    backgroundColor: colors.safe,
  },
  statusDotWarning: {
    backgroundColor: colors.amber,
  },
  statusDotDanger: {
    backgroundColor: colors.danger,
  },
  statusChipText: {
    minWidth: 0,
    flexShrink: 1,
    color: colors.infoText,
    fontSize: typeScale.xs,
    fontWeight: "900",
    lineHeight: 15,
  },
  statusChipTextSafe: {
    color: colors.safeText,
  },
  statusChipTextWarning: {
    color: colors.amberText,
  },
  statusChipTextDanger: {
    color: colors.dangerText,
  },
  convoyGroup: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  convoyGroupHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  convoyIconTile: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlueSoft,
  },
  convoyIconTileSecondary: {
    backgroundColor: colors.infoSoft,
  },
  convoyIconText: {
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: "900",
  },
  convoyGroupHeadingAction: {
    minWidth: 0,
    flex: 1,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  convoyGroupHeadingActionPressed: {
    opacity: 0.58,
  },
  convoyGroupCopy: {
    minWidth: 0,
    flex: 1,
  },
  convoyGroupEyebrow: {
    color: colors.appleBlue,
    fontSize: typeScale.xs - 1,
    fontWeight: "900",
    lineHeight: 13,
  },
  convoyGroupTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  convoyGroupTitle: {
    minWidth: 0,
    flex: 1,
    color: colors.ink,
    fontSize: typeScale.lg,
    fontWeight: "700",
    lineHeight: 22,
  },
  convoyGroupMeta: {
    marginTop: 3,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "600",
    lineHeight: 16,
  },
  convoyDisclosure: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  convoyHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  convoyHeaderIconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  convoyHeaderIconButtonPressed: {
    backgroundColor: colors.controlStrong,
    transform: [{ scale: 0.94 }],
  },
  convoyDisclosureText: {
    color: colors.muted,
    fontSize: typeScale.xl,
    fontWeight: "700",
  },
  convoyExpandedContent: {
    gap: 10,
    marginTop: 12,
    marginLeft: 22,
    paddingLeft: 20,
    borderLeftWidth: 2,
    borderLeftColor: colors.appleBlueSoft,
  },
  convoyMovementSummary: {
    gap: 3,
  },
  convoySchedule: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "900",
    lineHeight: 18,
  },
  convoyEndpoint: {
    color: colors.inkSoft,
    fontSize: typeScale.sm,
    fontWeight: "700",
    lineHeight: 18,
  },
  convoyMeta: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "700",
    lineHeight: 16,
  },
  convoySectionEyebrow: {
    color: colors.muted,
    fontSize: typeScale.xs - 1,
    fontWeight: "900",
    lineHeight: 13,
  },
  vehicleCard: {
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  vehicleHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  vehicleIconTile: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: 12,
    backgroundColor: colors.control,
  },
  vehicleIconText: {
    color: colors.appleBlue,
    fontSize: typeScale.md,
    fontWeight: "900",
  },
  vehicleStatusDot: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 9,
    height: 9,
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    backgroundColor: colors.safe,
  },
  vehicleCopy: {
    minWidth: 0,
    flex: 1,
  },
  vehicleTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  vehicleCallsign: {
    minWidth: 0,
    flexShrink: 1,
    color: colors.ink,
    fontSize: typeScale.lg,
    fontWeight: "700",
    lineHeight: 21,
  },
  vehicleLeadTag: {
    flexShrink: 0,
    color: colors.appleBlue,
    fontSize: typeScale.xs - 1,
    fontWeight: "900",
  },
  vehicleModel: {
    color: colors.inkSoft,
    fontSize: typeScale.sm,
    fontWeight: "700",
    lineHeight: 18,
  },
  vehicleDetail: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "600",
    lineHeight: 16,
  },
  vehicleStatusCopy: {
    maxWidth: 92,
    alignItems: "flex-end",
    flexShrink: 0,
  },
  vehicleStatus: {
    color: colors.safeText,
    fontSize: typeScale.xs,
    fontWeight: "800",
  },
  vehicleRegistration: {
    marginTop: 3,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  vehicleTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  vehicleTag: {
    overflow: "hidden",
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.quiet,
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "700",
  },
  vehicleNextEvent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  vehicleNextEventIcon: {
    color: colors.appleBlue,
    fontSize: typeScale.md,
    fontWeight: "900",
  },
  vehicleNextEventCopy: {
    minWidth: 0,
    flex: 1,
  },
  vehicleNextEventEyebrow: {
    color: colors.muted,
    fontSize: typeScale.xs - 1,
    fontWeight: "800",
  },
  vehicleNextEventValue: {
    marginTop: 2,
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "700",
    lineHeight: 16,
  },
  assignmentSection: {
    gap: spacing.xs,
  },
  assignmentList: {
    gap: spacing.xs,
  },
  assignmentCard: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    borderRadius: radius.card,
    backgroundColor: colors.quiet,
  },
  assignmentMarker: {
    width: 34,
    height: 34,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.controlStrong,
  },
  assignmentMarkerText: {
    color: colors.inkSoft,
    fontSize: typeScale.sm,
    fontWeight: "900",
  },
  assignmentCopy: {
    minWidth: 0,
    flex: 1,
  },
  assignmentKind: {
    color: colors.muted,
    fontSize: typeScale.xs - 1,
    fontWeight: "900",
    lineHeight: 12,
  },
  assignmentTitle: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "900",
    lineHeight: 18,
  },
  assignmentDetail: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "600",
    lineHeight: 16,
  },
  vehicleDetailIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  vehicleDetailIconTile: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: 15,
    backgroundColor: colors.control,
  },
  vehicleDetailIconText: {
    color: colors.appleBlue,
    fontSize: typeScale.xl,
    fontWeight: "900",
  },
  vehicleDetailModel: {
    color: colors.ink,
    fontSize: typeScale.lg,
    fontWeight: "800",
    lineHeight: 22,
  },
  vehicleDetailMeta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typeScale.sm,
    fontWeight: "600",
    lineHeight: 18,
  },
  vehicleSpecGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  vehicleSpec: {
    width: "48%",
    minHeight: 76,
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  vehicleSpecLabel: {
    color: colors.muted,
    fontSize: typeScale.xs - 1,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  vehicleSpecValue: {
    marginTop: 4,
    color: colors.ink,
    fontSize: typeScale.md,
    fontWeight: "800",
    lineHeight: 19,
  },
  vehicleSpecValueMono: {
    fontVariant: ["tabular-nums"],
  },
  vehicleTripsSection: {
    gap: spacing.xs,
  },
  vehicleTripRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  vehicleTripDateTile: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: 10,
    backgroundColor: colors.appleBlueSoft,
  },
  vehicleTripDateText: {
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: "900",
  },
  vehicleTripTitle: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "800",
    lineHeight: 18,
  },
  vehicleTripMeta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "600",
    lineHeight: 16,
  },
  vehicleDoneButton: {
    minHeight: controlSizes.primary,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.appleBlue,
  },
  vehicleDoneButtonText: {
    color: colors.surface,
    fontSize: typeScale.md,
    fontWeight: "800",
  },
  detailOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 90,
    justifyContent: "flex-end",
  },
  detailScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.28)",
  },
  detailSheet: {
    maxHeight: "88%",
    overflow: "hidden",
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.sheet,
  },
  detailGrabber: {
    width: 38,
    height: 5,
    alignSelf: "center",
    marginTop: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  detailSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  detailSheetHeadingCopy: {
    minWidth: 0,
    flex: 1,
  },
  detailHeaderIconTile: {
    width: 56,
    height: 56,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.control,
  },
  detailSheetEyebrow: {
    color: colors.muted,
    fontSize: typeScale.xs - 1,
    fontWeight: "900",
    lineHeight: 13,
  },
  detailSheetTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 26,
  },
  detailSheetSubtitle: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
  },
  detailSheetMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  detailSheetHeaderActions: {
    flexShrink: 0,
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  detailClose: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.control,
  },
  detailCloseText: {
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: "900",
  },
  detailSheetContent: {
    gap: spacing.md,
    padding: 20,
    paddingBottom: spacing.xl,
  },
  calendarDetailSchedule: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  calendarDetailTimeBlock: {
    minWidth: 68,
  },
  calendarDetailTime: {
    marginTop: 2,
    color: colors.ink,
    fontSize: typeScale.xl,
    fontWeight: "900",
    lineHeight: 27,
  },
  calendarDetailDate: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: typeScale.md,
    fontWeight: "800",
    lineHeight: 20,
  },
  detailFact: {
    gap: 3,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  detailFactLabel: {
    color: colors.muted,
    fontSize: typeScale.xs - 1,
    fontWeight: "900",
    lineHeight: 13,
    textTransform: "uppercase",
  },
  detailFactValue: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "700",
    lineHeight: 19,
  },
  sheetMapAction: {
    minHeight: controlSizes.primary,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.card,
    backgroundColor: colors.appleBlue,
  },
  sheetMapActionDisabled: {
    backgroundColor: colors.controlStrong,
  },
  sheetMapActionPressed: {
    backgroundColor: colors.appleBluePressed,
  },
  sheetMapActionText: {
    color: colors.surface,
    fontSize: typeScale.md,
    fontWeight: "900",
  },
  sheetMapActionTextDisabled: {
    color: colors.muted,
  },
  convoyDetailOverview: {
    gap: spacing.sm,
  },
  convoyDetail: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  convoyDetailBack: {
    alignSelf: "flex-start",
    minHeight: controlSizes.compact,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
  },
  convoyDetailBackText: {
    color: colors.appleBlue,
    fontSize: typeScale.sm,
    fontWeight: "900",
  },
  convoyDetailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  convoyDetailTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 28,
  },
  convoyDetailMeta: {
    color: colors.muted,
    fontSize: typeScale.sm,
    fontWeight: "700",
    lineHeight: 18,
  },
  convoyDetailSection: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  convoyDetailSectionTitle: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "900",
  },
  convoyDetailValue: {
    color: colors.inkSoft,
    fontSize: typeScale.sm,
    fontWeight: "700",
    lineHeight: 19,
  },
  convoyDetailEmpty: {
    color: colors.muted,
    fontSize: typeScale.sm,
    fontWeight: "600",
  },
  convoyRouteAction: {
    minHeight: controlSizes.secondary,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceGlass,
  },
  convoyRouteActionText: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "800",
  },
  convoyRouteActionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  convoyRouteActionMeta: {
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "700",
    lineHeight: 16,
  },
  convoyRouteActionManifest: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "600",
    lineHeight: 16,
  },
  convoyRouteActionLabel: {
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: "900",
  },
  emptyState: {
    alignSelf: "center",
    alignItems: "center",
    maxWidth: 320,
    gap: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceGlass
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "800"
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "500",
    textAlign: "center"
  }
});
