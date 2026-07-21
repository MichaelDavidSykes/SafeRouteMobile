export interface LoginViewportLayoutOptions {
  height: number;
  platform?: string;
  width: number;
}

export interface LoginViewportLayout {
  compact: boolean;
  keyboardVerticalOffset: number;
}

const IOS_COMPACT_HEIGHT = 700;
const IOS_COMPACT_WIDTH = 360;
const OTHER_COMPACT_HEIGHT = 660;
const OTHER_COMPACT_WIDTH = 340;

export function resolveLoginViewportLayout({
  height,
  platform = 'ios',
  width
}: LoginViewportLayoutOptions): LoginViewportLayout {
  const normalizedHeight = Number.isFinite(height) && height > 0 ? height : IOS_COMPACT_HEIGHT;
  const normalizedWidth = Number.isFinite(width) && width > 0 ? width : IOS_COMPACT_WIDTH;
  const shortestSide = Math.min(normalizedHeight, normalizedWidth);
  const isIos = platform === 'ios';

  return {
    compact: isIos
      ? normalizedHeight < IOS_COMPACT_HEIGHT || shortestSide < IOS_COMPACT_WIDTH
      : normalizedHeight < OTHER_COMPACT_HEIGHT || shortestSide < OTHER_COMPACT_WIDTH,
    keyboardVerticalOffset: isIos ? 12 : 0
  };
}
