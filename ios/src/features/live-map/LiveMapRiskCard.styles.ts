import { StyleSheet } from "react-native";

import { colors, radius, spacing, typeScale } from "../../theme";

export const riskCardStyles = StyleSheet.create({
  riskCard: {
    position: "absolute",
    right: 12,
    left: 12,
    minHeight: 86,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  riskCardCompact: {
    minHeight: 80,
    paddingVertical: spacing.xs,
  },
  riskCardPressed: {
    transform: [{ scale: 0.992 }],
  },
  riskIconTile: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: radius.card,
  },
  riskIconTileHigh: {
    backgroundColor: colors.dangerSoft,
  },
  riskIconTileMedium: {
    backgroundColor: colors.amberSoft,
  },
  riskIconTileLow: {
    backgroundColor: colors.infoSoft,
  },
  riskCopy: {
    flex: 1,
    minWidth: 0,
  },
  riskTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  riskTitleCopy: {
    flex: 1,
    minWidth: 0,
  },
  riskEyebrow: {
    maxWidth: "100%",
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "800",
  },
  riskTitle: {
    marginTop: 1,
    color: colors.ink,
    fontSize: typeScale.md,
    fontWeight: "800",
  },
  riskDistance: {
    maxWidth: 116,
    flexShrink: 1,
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "800",
    textAlign: "right",
  },
  riskChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  riskChip: {
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  riskChipHigh: {
    backgroundColor: colors.dangerSoft,
  },
  riskChipMedium: {
    backgroundColor: colors.amberSoft,
  },
  riskChipLow: {
    backgroundColor: colors.infoSoft,
  },
  riskChipText: {
    fontSize: typeScale.xs,
    fontWeight: "800",
  },
  riskAreaChip: {
    backgroundColor: colors.control,
  },
  riskAreaChipText: {
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "800",
  },
  riskTextHigh: {
    color: colors.dangerText,
  },
  riskTextMedium: {
    color: colors.amberText,
  },
  riskTextLow: {
    color: colors.infoText,
  },
  riskCardHigh: {
    borderColor: colors.dangerSoft,
  },
  riskCardMedium: {
    borderColor: colors.amberSoft,
  },
  riskCardLow: {
    borderColor: colors.infoSoft,
  },
});
