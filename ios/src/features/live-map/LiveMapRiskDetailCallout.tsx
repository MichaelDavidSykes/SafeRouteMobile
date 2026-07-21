import { useEffect, useMemo, useState, type RefObject } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import MapView, { type Point } from "react-native-maps";

import { uiTestIds } from "../../testing/uiTestIds";
import type { RiskZone } from "./liveMapTypes";
import {
  createRiskZoneDetailPresentation,
  type RouteRiskProximity,
} from "./routeRisk";
import { resolveRiskCalloutPlacement } from "./liveMapRiskDetailPlacement";

const CALLOUT_ESTIMATED_HEIGHT = 164;

export function LiveMapRiskDetailCallout({
  mapRef,
  onDismiss,
  proximity,
  zone,
}: {
  mapRef: RefObject<MapView | null>;
  onDismiss: () => void;
  proximity?: RouteRiskProximity | null;
  zone: RiskZone;
}) {
  const viewport = useWindowDimensions();
  const [anchorPoint, setAnchorPoint] = useState<Point>({
    x: viewport.width / 2,
    y: viewport.height * 0.32,
  });
  const [calloutHeight, setCalloutHeight] = useState(CALLOUT_ESTIMATED_HEIGHT);
  const presentation = useMemo(
    () => createRiskZoneDetailPresentation({ proximity: proximity || null, zone }),
    [proximity, zone],
  );

  useEffect(() => {
    let active = true;
    const resolveAnchor = async () => {
      try {
        const point = await mapRef.current?.pointForCoordinate(zone.coordinate);
        if (active && point) {
          setAnchorPoint(point);
        }
      } catch {
        // The compact fallback remains visible while the native map settles.
      }
    };

    void resolveAnchor();
    const retryTimer = setTimeout(() => void resolveAnchor(), 120);
    return () => {
      active = false;
      clearTimeout(retryTimer);
    };
  }, [mapRef, zone.coordinate.latitude, zone.coordinate.longitude, viewport.height, viewport.width]);

  const placement = resolveRiskCalloutPlacement({
    anchorPoint,
    calloutHeight,
    viewportHeight: viewport.height,
    viewportWidth: viewport.width,
  });

  const handleLayout = (event: LayoutChangeEvent) => {
    const measuredHeight = event.nativeEvent.layout.height;
    if (measuredHeight > 0 && Math.abs(measuredHeight - calloutHeight) > 1) {
      setCalloutHeight(measuredHeight);
    }
  };

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.overlay]}>
      <View
        pointerEvents="none"
        style={[
          styles.connector,
          {
            height: placement.connectorLength,
            left: placement.connectorLeft,
            top: placement.connectorTop,
            transform: [{ rotate: `${placement.connectorRotationDegrees}deg` }],
          },
        ]}
      />
      <View
        accessible
        accessibilityLabel={presentation.accessibilityLabel}
        testID={uiTestIds.liveMapRiskDetail}
        style={[
          styles.callout,
          {
            left: placement.left,
            top: placement.top,
            width: placement.width,
          },
        ]}
        onLayout={handleLayout}
      >
        <Text numberOfLines={1} style={styles.eyebrow}>Risk area</Text>
        <Text numberOfLines={2} style={styles.title}>{presentation.title}</Text>
        <Text numberOfLines={2} style={styles.body}>{presentation.body}</Text>
        <Text numberOfLines={2} style={styles.meta}>{presentation.metaLabel}</Text>
        <Text numberOfLines={1} style={styles.clearance}>{presentation.clearanceLabel}</Text>
        <Pressable
          accessibilityLabel="Close risk details"
          accessibilityRole="button"
          hitSlop={8}
          testID={uiTestIds.liveMapRiskDetailDismiss}
          style={({ pressed }) => [
            styles.dismiss,
            pressed ? styles.dismissPressed : null,
          ]}
          onPress={onDismiss}
        >
          <Text numberOfLines={1} style={styles.dismissText}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 50,
    elevation: 50,
  },
  connector: {
    position: "absolute",
    width: 1.5,
    zIndex: 39,
    backgroundColor: "rgba(248,250,252,0.82)",
  },
  callout: {
    position: "absolute",
    zIndex: 40,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 18,
    backgroundColor: "rgba(8,11,15,0.94)",
  },
  eyebrow: {
    color: "rgba(226,232,240,0.72)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    marginTop: 4,
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19,
  },
  body: {
    marginTop: 6,
    color: "rgba(226,232,240,0.78)",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  meta: {
    marginTop: 8,
    color: "rgba(226,232,240,0.9)",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
    textTransform: "uppercase",
  },
  clearance: {
    marginTop: 6,
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "800",
  },
  dismiss: {
    minHeight: 32,
    alignSelf: "flex-start",
    justifyContent: "center",
    marginTop: 5,
    paddingRight: 12,
  },
  dismissPressed: {
    opacity: 0.62,
  },
  dismissText: {
    color: "#8cc8ff",
    fontSize: 11,
    fontWeight: "900",
  },
});
