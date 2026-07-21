import { StyleSheet } from "react-native";

import { colors, radius, spacing, typeScale } from "../../theme";

export const riskCardStyles = StyleSheet.create({
  riskCard: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    minHeight: 68,
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
  riskCardCompact: {
    minHeight: 62,
    paddingVertical: spacing.xs,
  },
  riskCardPressed: {
    transform: [{ scale: 0.992 }],
  },
  riskCopy: {
    flex: 1,
    minWidth: 0,
  },
  riskEyebrow: {
    maxWidth: "100%",
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "900",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  riskTitle: {
    marginTop: 1,
    color: colors.ink,
    fontSize: typeScale.md,
    fontWeight: "900",
  },
  riskMeta: {
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "800",
  },
  riskDistance: {
    maxWidth: 128,
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "900",
    textAlign: "right",
  },
  riskCardHigh: {
    borderColor: "rgba(216, 74, 63, 0.34)",
  },
  riskCardMedium: {
    borderColor: "rgba(243, 163, 43, 0.38)",
  },
  riskCardLow: {
    borderColor: "rgba(92, 141, 246, 0.34)",
  },
});
