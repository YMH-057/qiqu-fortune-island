export const BOARD_WIDTH = 1000;
export const BOARD_HEIGHT = 720;
export const DEFAULT_FOLLOW_SCALE = 0.56;
export const MIN_FOLLOW_SCALE = 0.38;
export const MAX_FOLLOW_SCALE = 0.82;

export type BoardCameraMode = "follow" | "overview";
export type BoardPoint = { x: number; y: number };
export type BoardViewBox = { x: number; y: number; width: number; height: number };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampFollowScale(scale: number): number {
  return clamp(scale, MIN_FOLLOW_SCALE, MAX_FOLLOW_SCALE);
}

export function getBoardViewBox(
  mode: BoardCameraMode,
  focus: BoardPoint,
  followScale: number,
  viewportAspect = BOARD_WIDTH / BOARD_HEIGHT
): BoardViewBox {
  if (mode === "overview") {
    return { x: 0, y: 0, width: BOARD_WIDTH, height: BOARD_HEIGHT };
  }
  const scale = clampFollowScale(followScale);
  const boardAspect = BOARD_WIDTH / BOARD_HEIGHT;
  const safeAspect = Number.isFinite(viewportAspect) && viewportAspect > 0 ? viewportAspect : boardAspect;
  const width = safeAspect >= boardAspect ? BOARD_WIDTH * scale : BOARD_HEIGHT * scale * safeAspect;
  const height = safeAspect >= boardAspect ? (BOARD_WIDTH * scale) / safeAspect : BOARD_HEIGHT * scale;
  return {
    x: clamp(focus.x - width / 2, 0, BOARD_WIDTH - width),
    y: clamp(focus.y - height / 2, 0, BOARD_HEIGHT - height),
    width,
    height
  };
}

export function pointToViewportPercent(point: BoardPoint, viewBox: BoardViewBox): { left: number; top: number } {
  return {
    left: ((point.x - viewBox.x) / viewBox.width) * 100,
    top: ((point.y - viewBox.y) / viewBox.height) * 100
  };
}

export function cameraMagnification(mode: BoardCameraMode, followScale: number): number {
  return mode === "overview" ? 1 : 1 / clampFollowScale(followScale);
}
