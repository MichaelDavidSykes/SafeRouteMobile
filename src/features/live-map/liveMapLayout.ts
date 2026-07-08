export type LiveMapDensity = 'regular' | 'compact';
export type LiveMapPlatform = 'ios' | 'android' | 'web';

interface LiveMapLayoutOptions {
  height: number;
  platform?: LiveMapPlatform | string;
  width: number;
}

export interface LiveMapOverlayLayout {
  alertChipWidth: number;
  compact: boolean;
  density: LiveMapDensity;
  edgePadding: {
    bottom: number;
    left: number;
    right: number;
    top: number;
  };
  guidanceBottom: number;
  guidanceDistanceVisible: boolean;
  guidanceTitleLines: number;
  isCompact: boolean;
  mapControlsDirection: 'column' | 'row';
  mapControlsTop: number;
  sheetBottomPadding: number;
  showRouteEndpoints: boolean;
  showRouteSubtitle: boolean;
}

const COMPACT_HEIGHT_THRESHOLD = 700;
const COMPACT_WIDTH_THRESHOLD = 360;

export function resolveLiveMapOverlayLayout({
  height,
  platform = 'ios',
  width
}: LiveMapLayoutOptions): LiveMapOverlayLayout {
  const normalizedHeight = Number.isFinite(height) && height > 0 ? height : 812;
  const normalizedWidth = Number.isFinite(width) && width > 0 ? width : 375;
  const isCompact = normalizedHeight <= COMPACT_HEIGHT_THRESHOLD || normalizedWidth <= COMPACT_WIDTH_THRESHOLD;
  const ios = platform === 'ios';

  if (isCompact) {
    return {
      alertChipWidth: 150,
      compact: true,
      density: 'compact',
      edgePadding: { top: 172, right: 44, bottom: 286, left: 36 },
      guidanceBottom: 314,
      guidanceDistanceVisible: normalizedWidth > 340,
      guidanceTitleLines: 2,
      isCompact: true,
      mapControlsDirection: 'row',
      mapControlsTop: ios ? 152 : 166,
      sheetBottomPadding: ios ? 14 : 10,
      showRouteEndpoints: false,
      showRouteSubtitle: normalizedHeight > 640
    };
  }

  return {
    alertChipWidth: 170,
    compact: false,
    density: 'regular',
    edgePadding: { top: 188, right: 72, bottom: 336, left: 44 },
    guidanceBottom: 386,
    guidanceDistanceVisible: true,
    guidanceTitleLines: 1,
    isCompact: false,
    mapControlsDirection: 'column',
    mapControlsTop: 196,
    sheetBottomPadding: ios ? 24 : 14,
    showRouteEndpoints: false,
    showRouteSubtitle: true
  };
}
