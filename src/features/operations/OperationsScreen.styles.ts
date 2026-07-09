import { StyleSheet } from "react-native";

import { colors, controlSizes, radius, spacing, typeScale } from "../../theme";

export const operationsStyles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.control
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm
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
    marginTop: 2,
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
    alignSelf: "center",
    maxWidth: "100%",
    minHeight: controlSizes.compact,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlueSoft
  },
  noticeText: {
    color: colors.appleBlue,
    fontSize: typeScale.sm,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center"
  },
  tabs: {
    gap: spacing.sm,
    paddingBottom: spacing.sm
  },
  tab: {
    minHeight: controlSizes.compact,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceGlass
  },
  tabSelected: {
    backgroundColor: colors.appleBlue
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
    color: colors.surface
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
    gap: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl
  },
  routeCard: {
    padding: 12,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceTranslucent
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
  readOnlyPill: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.control
  },
  readOnlyText: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "800"
  },
  convoyRoutes: {
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  convoyRoutePill: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.control
  },
  convoyRouteText: {
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "700"
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
