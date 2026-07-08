import { StyleSheet } from "react-native";

import { colors, controlSizes, radius, spacing, typeScale } from "../../theme";

export const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceTranslucent,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
  },
  cardLoading: {
    opacity: 0.72,
  },
  cardCopy: {
    minWidth: 0,
  },
  routeTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  statusPill: {
    marginTop: 1,
    minHeight: 22,
    justifyContent: "center",
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
    fontSize: typeScale.xs,
    fontWeight: "800",
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
    marginTop: spacing.xs,
    color: colors.inkSoft,
    fontSize: typeScale.xs,
    fontWeight: "800",
  },
  openButton: {
    minWidth: 56,
    minHeight: controlSizes.compact,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
  },
  openButtonText: {
    color: colors.surface,
    fontSize: typeScale.xs,
    fontWeight: "800",
  },
});
