import { Platform, StyleSheet } from "react-native";

import { colors, controlSizes, radius, spacing, typeScale } from "../../theme";

export const routeSummaryStyles = StyleSheet.create({
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingTop: 9,
    paddingBottom: Platform.OS === "ios" ? 24 : spacing.md,
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surfaceTranslucent,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  bottomSheetCompact: {
    paddingTop: spacing.xs,
    paddingBottom: Platform.OS === "ios" ? 18 : spacing.sm,
  },
  bottomSheetCompactNavigation: {
    paddingTop: spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  summaryRowCompactNavigation: {
    alignItems: "center",
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  summaryCopyCompactNavigation: {
    justifyContent: "center",
  },
  etaText: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 32,
  },
  etaTextCompactNavigation: {
    fontSize: typeScale.xl,
    lineHeight: 26,
  },
  routeDetailLine: {
    marginTop: 3,
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "800",
  },
  remainingMetricLine: {
    marginTop: 2,
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "800",
  },
  safetyBadge: {
    minWidth: 64,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  safetyBadgeCompact: {
    minWidth: 56,
    minHeight: 32,
  },
  safetyBadgeSafe: {
    backgroundColor: colors.safeSoft,
  },
  safetyBadgeAmber: {
    backgroundColor: colors.amberSoft,
  },
  safetyBadgeBlue: {
    backgroundColor: colors.infoSoft,
  },
  safetyBadgeText: {
    maxWidth: 84,
    fontSize: typeScale.sm,
    fontWeight: "900",
    lineHeight: 17,
  },
  safetyBadgeTextSafe: {
    color: colors.safeText,
  },
  safetyBadgeTextAmber: {
    color: colors.amberText,
  },
  safetyBadgeTextBlue: {
    color: colors.infoText,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionRowCompactNavigation: {
    marginTop: spacing.xs,
  },
  startButton: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
  },
  startButtonCompactNavigation: {
    minHeight: controlSizes.secondary,
  },
  startButtonDisabled: {
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    backgroundColor: colors.controlStrong,
  },
  startButtonPressed: {
    backgroundColor: colors.appleBluePressed,
    transform: [{ scale: 0.985 }],
  },
  startButtonText: {
    color: colors.surface,
    fontSize: typeScale.md,
    fontWeight: "800",
  },
  startButtonTextDisabled: {
    color: colors.inkSoft,
  },
  stopButton: {
    minWidth: 86,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: "rgba(255, 59, 48, 0.22)",
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 59, 48, 0.12)",
  },
  stopButtonCompactNavigation: {
    minHeight: controlSizes.secondary,
    minWidth: 78,
  },
  stopButtonText: {
    color: colors.dangerText,
    fontSize: typeScale.md,
    fontWeight: "800",
  },
});
