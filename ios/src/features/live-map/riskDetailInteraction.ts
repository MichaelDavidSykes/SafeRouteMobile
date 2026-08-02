const RISK_DETAIL_DRAG_START_DISTANCE = 6;
const RISK_DETAIL_DISMISS_DISTANCE = 72;
const RISK_DETAIL_DISMISS_FLICK_DISTANCE = 20;
const RISK_DETAIL_DISMISS_VELOCITY = 0.85;
const RISK_DETAIL_STAGE_DISTANCE = 58;
const RISK_DETAIL_STAGE_FLICK_DISTANCE = 18;
const RISK_DETAIL_STAGE_VELOCITY = 0.72;

export type RiskDetailSheetStage = 'default' | 'expanded';
export type RiskDetailSheetGestureAction =
  | 'collapse'
  | 'dismiss'
  | 'expand'
  | 'restore';

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

export function shouldStartRiskDetailSheetGesture({
  translationX,
  translationY,
}: RiskDetailDragGesture): boolean {
  return (
    Math.abs(translationY) > RISK_DETAIL_DRAG_START_DISTANCE
    && Math.abs(translationY) > Math.abs(translationX)
  );
}

export function resolveRiskDetailSheetGesture(
  stage: RiskDetailSheetStage,
  {
    translationY,
    velocityY = 0,
  }: RiskDetailDragGesture
): RiskDetailSheetGestureAction {
  if (stage === 'expanded') {
    return isPositiveStageTransition(translationY, velocityY)
      ? 'collapse'
      : 'restore';
  }

  if (isNegativeStageTransition(translationY, velocityY)) {
    return 'expand';
  }
  if (
    shouldDismissRiskDetailGesture({
      translationX: 0,
      translationY,
      velocityY
    })
  ) {
    return 'dismiss';
  }
  return 'restore';
}

function isPositiveStageTransition(
  translationY: number,
  velocityY: number
): boolean {
  return translationY >= RISK_DETAIL_STAGE_DISTANCE
    || (
      translationY >= RISK_DETAIL_STAGE_FLICK_DISTANCE
      && velocityY >= RISK_DETAIL_STAGE_VELOCITY
    );
}

function isNegativeStageTransition(
  translationY: number,
  velocityY: number
): boolean {
  return translationY <= -RISK_DETAIL_STAGE_DISTANCE
    || (
      translationY <= -RISK_DETAIL_STAGE_FLICK_DISTANCE
      && velocityY <= -RISK_DETAIL_STAGE_VELOCITY
    );
}
