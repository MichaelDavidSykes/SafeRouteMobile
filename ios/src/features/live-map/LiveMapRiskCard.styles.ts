import { StyleSheet } from "react-native";

import { colors, radius } from "../../theme";

export const riskCardStyles = StyleSheet.create({
  riskCard: {
    position: "absolute",
    right: 12,
    left: 12,
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  riskCardCompact: {
    minHeight: 60,
    paddingVertical: 8,
  },
  routeAlertCard: {
    minHeight: 60,
    paddingVertical: 8,
    borderRadius: radius.card,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  riskCardPressed: {
    transform: [{ scale: 0.992 }],
  },
  riskIconTile: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: radius.card,
  },
  routeAlertIconTile: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
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
    alignItems: "center",
    gap: 6,
  },
  riskEyebrow: {
    marginTop: 2,
    maxWidth: "100%",
    color: colors.muted,
    fontSize: 10.5,
    fontWeight: "600",
  },
  riskTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19,
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
