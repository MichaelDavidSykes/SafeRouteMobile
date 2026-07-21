import type { LatLng } from 'react-native-maps';

export type RouteAvoidRectangle = {
  label?: string | null;
  maxLatitude: number;
  maxLongitude: number;
  minLatitude: number;
  minLongitude: number;
};

export function normalizeRouteAvoidRectangles(
  rectangles: readonly RouteAvoidRectangle[]
): RouteAvoidRectangle[] {
  return rectangles
    .filter((rectangle) =>
      Number.isFinite(rectangle?.minLatitude) &&
      Number.isFinite(rectangle?.maxLatitude) &&
      Number.isFinite(rectangle?.minLongitude) &&
      Number.isFinite(rectangle?.maxLongitude) &&
      rectangle.maxLatitude > rectangle.minLatitude &&
      rectangle.maxLongitude > rectangle.minLongitude &&
      rectangle.minLatitude >= -90 &&
      rectangle.maxLatitude <= 90 &&
      rectangle.minLongitude >= -180 &&
      rectangle.maxLongitude <= 180
    )
    .slice(0, 10);
}

export function routeIntersectsAvoidRectangles(
  coordinates: readonly LatLng[],
  rectangles: readonly RouteAvoidRectangle[]
): boolean {
  if (!rectangles.length) {
    return false;
  }

  return rectangles.some((rectangle) => coordinates.some((coordinate, index) => {
    if (coordinateInsideRectangle(coordinate, rectangle)) {
      return true;
    }
    const next = coordinates[index + 1];
    return Boolean(next && segmentIntersectsRectangle(coordinate, next, rectangle));
  }));
}

function coordinateInsideRectangle(
  coordinate: LatLng,
  rectangle: RouteAvoidRectangle
): boolean {
  return (
    coordinate.latitude >= rectangle.minLatitude &&
    coordinate.latitude <= rectangle.maxLatitude &&
    coordinate.longitude >= rectangle.minLongitude &&
    coordinate.longitude <= rectangle.maxLongitude
  );
}

function segmentIntersectsRectangle(
  start: LatLng,
  end: LatLng,
  rectangle: RouteAvoidRectangle
): boolean {
  const segmentMinLatitude = Math.min(start.latitude, end.latitude);
  const segmentMaxLatitude = Math.max(start.latitude, end.latitude);
  const segmentMinLongitude = Math.min(start.longitude, end.longitude);
  const segmentMaxLongitude = Math.max(start.longitude, end.longitude);
  if (
    segmentMaxLatitude < rectangle.minLatitude ||
    segmentMinLatitude > rectangle.maxLatitude ||
    segmentMaxLongitude < rectangle.minLongitude ||
    segmentMinLongitude > rectangle.maxLongitude
  ) {
    return false;
  }

  const rectangleCorners: LatLng[] = [
    { latitude: rectangle.minLatitude, longitude: rectangle.minLongitude },
    { latitude: rectangle.minLatitude, longitude: rectangle.maxLongitude },
    { latitude: rectangle.maxLatitude, longitude: rectangle.maxLongitude },
    { latitude: rectangle.maxLatitude, longitude: rectangle.minLongitude }
  ];
  return rectangleCorners.some((corner, index) =>
    lineSegmentsIntersect(start, end, corner, rectangleCorners[(index + 1) % 4])
  );
}

function lineSegmentsIntersect(a: LatLng, b: LatLng, c: LatLng, d: LatLng): boolean {
  const orientation = (p: LatLng, q: LatLng, r: LatLng) =>
    (q.longitude - p.longitude) * (r.latitude - p.latitude) -
    (q.latitude - p.latitude) * (r.longitude - p.longitude);
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  return (
    ((first <= 0 && second >= 0) || (first >= 0 && second <= 0)) &&
    ((third <= 0 && fourth >= 0) || (third >= 0 && fourth <= 0))
  );
}
