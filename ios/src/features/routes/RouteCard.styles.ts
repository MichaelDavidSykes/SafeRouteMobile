import { StyleSheet } from "react-native";

import { colors, radius, spacing, typeScale } from "../../theme";

export const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceTranslucent,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  cardPressed: {
    borderColor: colors.glassBorder,
    backgroundColor: colors.appleBlueSoft,
    transform: [{ scale: 0.985 }],
  },
  cardLoading: {
    opacity: 0.72,
  },
  cardCopy: {
    minWidth: 0,
  },
  routeTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  statusPill: {
    marginTop: 1,
    maxWidth: 76,
    minHeight: 22,
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
    backgroundColor: colors.dangerSoft,
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
    color: colors.dangerText,
  },
  statusTextPlanned: {
    color: colors.infoText,
  },
  routeName: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: typeScale.lg,
    fontWeight: "800",
    lineHeight: 21,
  },
  routeEndpoint: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "700",
  },
  routeSummary: {
    minWidth: 0,
    flex: 1,
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "800",
  },
  routeFooter: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: 4,
  },
  openButton: {
    maxWidth: 84,
    minWidth: 40,
    minHeight: 30,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 4,
    backgroundColor: "transparent",
  },
  openButtonText: {
    maxWidth: 64,
    flexShrink: 1,
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: "800",
    textAlign: "center",
  },
});
