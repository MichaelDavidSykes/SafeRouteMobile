import { StyleSheet } from "react-native";

import { colors, controlSizes, radius, spacing, typeScale } from "../../theme";

export const operationsStyles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.control
  },
  header: {
    gap: 3,
    marginTop: spacing.md,
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
    letterSpacing: 0.5,
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 28
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
    minHeight: controlSizes.secondary,
    flexDirection: "row",
    gap: 3,
    marginBottom: spacing.sm,
    padding: 3,
    borderRadius: radius.lg,
    backgroundColor: colors.borderSoft
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: "transparent"
  },
  tabSelected: {
    backgroundColor: colors.surfaceTranslucent
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
    paddingBottom: spacing.xl
  },
  routeCard: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft
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
