const RISK_DETAIL_DRAG_START_DISTANCE = 6;
const RISK_DETAIL_DISMISS_DISTANCE = 72;
const RISK_DETAIL_DISMISS_FLICK_DISTANCE = 20;
const RISK_DETAIL_DISMISS_VELOCITY = 0.85;

interface RiskDetailDragGesture {
  translationX: number;
  translationY: number;
  velocityY?: number;
}

export function shouldStartRiskDetailDismissGesture({
  translationX,
  translationY,
}: RiskDetailDragGesture): boolean {
  return (
    translationY > RISK_DETAIL_DRAG_START_DISTANCE &&
    translationY > Math.abs(translationX)
  );
}

export function shouldDismissRiskDetailGesture({
  translationY,
  velocityY = 0,
}: RiskDetailDragGesture): boolean {
  return (
    translationY >= RISK_DETAIL_DISMISS_DISTANCE ||
    (
      translationY >= RISK_DETAIL_DISMISS_FLICK_DISTANCE &&
      velocityY >= RISK_DETAIL_DISMISS_VELOCITY
    )
  );
}
