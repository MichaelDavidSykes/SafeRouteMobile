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
  guidanceTop: number;
  guidanceDistanceVisible: boolean;
  guidanceTitleLines: number;
  isCompact: boolean;
  mapControlsDirection: 'column' | 'row';
  mapControlsTop: number;
  sheetBottomPadding: number;
  showRouteEndpoints: boolean;
  showRouteSubtitle: boolean;
}

interface LiveMapControlsTopOptions {
  guidanceVisible: boolean;
  layout: LiveMapOverlayLayout;
  safeAreaTop: number;
}

const COMPACT_HEIGHT_THRESHOLD = 700;
const COMPACT_WIDTH_THRESHOLD = 360;
const GUIDANCE_CARD_TOP_GAP = 8;
const GUIDANCE_CONTROLS_GAP = 10;
const REGULAR_GUIDANCE_CARD_HEIGHT = 74;
const COMPACT_GUIDANCE_CARD_HEIGHT = 62;

export function resolveLiveMapControlsTop({
  guidanceVisible,
  layout,
  safeAreaTop,
}: LiveMapControlsTopOptions) {
  if (!guidanceVisible) {
    return layout.mapControlsTop;
  }

  const normalizedSafeAreaTop = Number.isFinite(safeAreaTop)
    ? Math.max(0, safeAreaTop)
    : 0;
  const guidanceTop = Math.max(
    layout.guidanceTop,
    normalizedSafeAreaTop + GUIDANCE_CARD_TOP_GAP,
  );
  const guidanceHeight = layout.isCompact
    ? COMPACT_GUIDANCE_CARD_HEIGHT
    : REGULAR_GUIDANCE_CARD_HEIGHT;

  return Math.max(
    layout.mapControlsTop,
    guidanceTop + guidanceHeight + GUIDANCE_CONTROLS_GAP,
  );
}

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
      edgePadding: { top: 136, right: 44, bottom: 286, left: 36 },
      guidanceTop: ios ? 8 : 16,
      guidanceDistanceVisible: normalizedWidth > 340,
      guidanceTitleLines: 2,
      isCompact: true,
      mapControlsDirection: 'row',
      mapControlsTop: ios ? 72 : 80,
      sheetBottomPadding: ios ? 14 : 10,
      showRouteEndpoints: false,
      showRouteSubtitle: normalizedHeight > 640
    };
  }

  return {
    alertChipWidth: 170,
    compact: false,
    density: 'regular',
    edgePadding: { top: 156, right: 72, bottom: 336, left: 44 },
    guidanceTop: ios ? 12 : 20,
    guidanceDistanceVisible: true,
    guidanceTitleLines: 2,
    isCompact: false,
    mapControlsDirection: 'column',
    mapControlsTop: ios ? 88 : 96,
    sheetBottomPadding: ios ? 24 : 14,
    showRouteEndpoints: false,
    showRouteSubtitle: true
  };
}
