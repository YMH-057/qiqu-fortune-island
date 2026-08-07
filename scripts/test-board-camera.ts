import assert from "node:assert/strict";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DEFAULT_FOLLOW_SCALE,
  getBoardViewBox,
  pointToViewportPercent
} from "../client/src/game/boardCamera";

function testOverviewUsesTheOriginalFullBoard() {
  assert.deepEqual(getBoardViewBox("overview", { x: 500, y: 360 }, DEFAULT_FOLLOW_SCALE), {
    x: 0,
    y: 0,
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT
  });
}

function testFollowCameraCentersTheLocalPlayer() {
  const viewBox = getBoardViewBox("follow", { x: 500, y: 360 }, DEFAULT_FOLLOW_SCALE);
  const point = pointToViewportPercent({ x: 500, y: 360 }, viewBox);
  assert.equal(Math.round(point.left), 50);
  assert.equal(Math.round(point.top), 50);
  assert.ok(viewBox.width < BOARD_WIDTH);
  assert.ok(viewBox.height < BOARD_HEIGHT);
}

function testFollowCameraClampsAtBoardEdges() {
  const topLeft = getBoardViewBox("follow", { x: 0, y: 0 }, DEFAULT_FOLLOW_SCALE);
  const bottomRight = getBoardViewBox("follow", { x: BOARD_WIDTH, y: BOARD_HEIGHT }, DEFAULT_FOLLOW_SCALE);
  assert.equal(topLeft.x, 0);
  assert.equal(topLeft.y, 0);
  assert.equal(bottomRight.x + bottomRight.width, BOARD_WIDTH);
  assert.equal(bottomRight.y + bottomRight.height, BOARD_HEIGHT);
}

function testFollowCameraMatchesPortraitViewport() {
  const portraitAspect = 390 / 607;
  const viewBox = getBoardViewBox("follow", { x: 500, y: 360 }, DEFAULT_FOLLOW_SCALE, portraitAspect);
  assert.ok(Math.abs(viewBox.width / viewBox.height - portraitAspect) < 0.001);
  assert.ok(viewBox.width < BOARD_WIDTH * DEFAULT_FOLLOW_SCALE);
  assert.equal(Math.round(pointToViewportPercent({ x: 500, y: 360 }, viewBox).left), 50);
}

testOverviewUsesTheOriginalFullBoard();
testFollowCameraCentersTheLocalPlayer();
testFollowCameraClampsAtBoardEdges();
testFollowCameraMatchesPortraitViewport();

console.log("Board camera tests passed.");
