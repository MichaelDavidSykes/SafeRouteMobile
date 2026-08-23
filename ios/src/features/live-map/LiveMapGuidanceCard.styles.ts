import { StyleSheet } from "react-native";

import { colors, radius, spacing, typeScale } from "../../theme";

export const guidanceCardStyles = StyleSheet.create({
  guidanceCard: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
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
    minHeight: 52,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  guidanceCardWarning: {
    borderColor: "rgba(216, 74, 63, 0.28)",
    backgroundColor: colors.dangerSoft,
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    backgroundColor: colors.controlStrong,
  },
  backButtonPressed: {
    backgroundColor: colors.control,
    transform: [{ scale: 0.96 }],
  },
  guidanceCopy: {
    flex: 1,
    minWidth: 0,
  },
  guidanceTitle: {
    color: colors.ink,
    fontSize: typeScale.md,
    fontWeight: "800",
    lineHeight: 20,
  },
  guidanceTitleCompact: {
    fontSize: typeScale.sm,
    lineHeight: 18,
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
    fontSize: typeScale.md,
    fontWeight: "800",
  },
  guidanceDistanceCompact: {
    fontSize: typeScale.sm,
  },
  guidanceActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
