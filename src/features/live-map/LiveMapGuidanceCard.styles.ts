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
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: radius.xl,
    backgroundColor: "rgba(17, 17, 19, 0.94)",
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
    backgroundColor: "rgba(150, 49, 38, 0.94)",
  },
  guidanceCopy: {
    flex: 1,
    minWidth: 0,
  },
  guidanceTitle: {
    color: colors.surface,
    fontSize: typeScale.lg,
    fontWeight: "800",
  },
  guidanceTitleCompact: {
    fontSize: typeScale.md,
    lineHeight: 19,
  },
  guidanceMeta: {
    marginTop: 2,
    color: "rgba(255, 255, 255, 0.72)",
    fontSize: typeScale.xs,
    fontWeight: "700",
  },
  guidanceDistance: {
    color: colors.surface,
    fontSize: typeScale.lg,
    fontWeight: "800",
  },
  guidanceDistanceCompact: {
    fontSize: typeScale.md,
  },
});
