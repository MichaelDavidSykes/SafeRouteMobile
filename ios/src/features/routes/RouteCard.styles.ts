import { StyleSheet } from "react-native";

import { colors, radius, spacing, typeScale } from "../../theme";

export const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardBody: {
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    backgroundColor: colors.surface,
  },
  cardBodyPressed: {
    backgroundColor: colors.quiet,
  },
  cardCopy: {
    minWidth: 0,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 13,
  },
  routeTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  statusPill: {
    maxWidth: 88,
    minHeight: 24,
    flexShrink: 0,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  statusReady: {
    backgroundColor: colors.safeSoft,
  },
  statusLive: {
    backgroundColor: colors.appleBlueSoft,
  },
  statusPlanned: {
    backgroundColor: colors.infoSoft,
  },
  statusText: {
    maxWidth: 68,
    fontSize: typeScale.xs,
    fontWeight: "800",
    textAlign: "center",
  },
  statusTextReady: {
    color: colors.safeText,
  },
  statusTextLive: {
    color: colors.appleBlue,
  },
  statusTextPlanned: {
    color: colors.infoText,
  },
  routeName: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
  },
  routeEndpoint: {
    marginTop: 5,
    color: colors.muted,
    fontSize: 13.5,
    fontWeight: "400",
    lineHeight: 18,
  },
  updatedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 9,
  },
  routeSummary: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  routeSummaryMetric: {
    minWidth: 0,
    flexShrink: 1,
    color: colors.inkSoft,
    fontSize: 13.5,
    fontWeight: "600",
  },
  summarySeparator: {
    width: 4,
    height: 4,
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: "#c7c7cc",
  },
  riskSummary: {
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  riskDot: {
    width: 7,
    height: 7,
    flexShrink: 0,
    borderRadius: radius.pill,
  },
  riskDotHigh: {
    backgroundColor: colors.danger,
  },
  riskDotMedium: {
    backgroundColor: colors.amber,
  },
  riskDotLow: {
    backgroundColor: colors.info,
  },
  riskText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600",
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
  routeFooter: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    overflow: "hidden",
    borderTopWidth: 0.5,
    borderTopColor: colors.borderSoft,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
    backgroundColor: colors.surface,
  },
  updatedLabel: {
    minWidth: 0,
    flex: 1,
    color: colors.inkSoft,
    fontSize: 12.5,
    fontWeight: "600",
  },
  footerDetailAction: {
    minWidth: 0,
    minHeight: 50,
    flex: 1,
    justifyContent: "center",
    paddingLeft: 18,
  },
  footerDetailActionPressed: {
    backgroundColor: colors.quiet,
  },
  openButton: {
    minWidth: 64,
    minHeight: 50,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 18,
    backgroundColor: colors.surface,
  },
  openButtonPressed: {
    backgroundColor: colors.appleBlueSoft,
  },
  openButtonLoading: {
    opacity: 0.72,
  },
  openButtonText: {
    color: colors.appleBlue,
    fontSize: typeScale.md,
    fontWeight: "700",
    textAlign: "center",
  },
});
