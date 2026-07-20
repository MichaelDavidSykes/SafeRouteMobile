import { StyleSheet } from "react-native";

import { colors, radius, spacing, typeScale } from "../../theme";

export const guidanceCardStyles = StyleSheet.create({
  guidanceCard: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceTranslucent,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  guidanceCardCompact: {
    minHeight: 60,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  guidanceCardWarning: {
    borderColor: "rgba(216, 74, 63, 0.28)",
    backgroundColor: colors.dangerSoft,
  },
  guidanceCopy: {
    flex: 1,
    minWidth: 0,
  },
  guidanceTitle: {
    color: colors.ink,
    fontSize: typeScale.lg,
    fontWeight: "800",
  },
  guidanceTitleCompact: {
    fontSize: typeScale.md,
    lineHeight: 19,
  },
  guidanceDangerText: {
    color: colors.dangerText,
  },
  guidanceMeta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "700",
  },
  guidanceRiskMeta: {
    marginTop: 1,
    fontSize: typeScale.xs,
    fontWeight: "800",
  },
  guidanceRiskMetaWarning: {
    color: colors.amberText,
  },
  guidanceRiskMetaInfo: {
    color: colors.infoText,
  },
  guidanceDistance: {
    color: colors.appleBlue,
    fontSize: typeScale.lg,
    fontWeight: "800",
  },
  guidanceDistanceCompact: {
    fontSize: typeScale.md,
  },
  rerouteButton: {
    minWidth: 66,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  rerouteButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  rerouteButtonText: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "800",
  },
});
