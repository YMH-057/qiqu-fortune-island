import assert from "node:assert/strict";
import { getTileGraphDistance } from "@monopoly/shared";
import { makeSkillCard, skillCardTemplates } from "../server/src/data/skillCards";
import { useSkillCard } from "../server/src/game/actions";
import { MAX_PROPERTY_LEVEL } from "../server/src/game/economy";
import { makeTestGame } from "./test-fixtures";

function card(code: (typeof skillCardTemplates)[number]["code"], seed: string) {
  const template = skillCardTemplates.find((item) => item.code === code);
  assert.ok(template, `missing skill template ${code}`);
  return makeSkillCard(template, seed);
}

function setCurrentPlayer(game: ReturnType<typeof makeTestGame>, playerId: string) {
  game.turnOrder = ["P1", "P2"];
  game.currentTurnIndex = game.turnOrder.indexOf(playerId);
  game.phase = "waitingRoll";
}

function testSharedTileDistanceMatchesAdjacentBoardNodes() {
  const game = makeTestGame();
  const from = game.tiles.find((tile) => (tile.next?.length ?? 0) > 0);
  const to = from?.next?.[0];
  assert.ok(from);
  assert.ok(to);
  assert.equal(getTileGraphDistance(game.tiles, from.id, to), 1);
}

function testReleasePermitCanBeUsedWhileAnotherPlayerHasTheTurn() {
  const game = makeTestGame();
  const detained = game.players.find((player) => player.id === "P2");
  assert.ok(detained);
  setCurrentPlayer(game, "P1");
  detained.skipTurns = 2;
  detained.statusEffects.push({ id: "hospital-test", type: "hospital", turns: 2 });
  const permit = card("releasePermit", "release-test");
  detained.skillCards.push(permit);

  const outcome = useSkillCard(game, detained.id, { skillId: permit.id });

  assert.equal(outcome.ok, true);
  assert.equal(detained.skipTurns, 0);
  assert.equal(detained.statusEffects.some((effect) => effect.type === "hospital"), false);
  assert.equal(detained.skillCards.some((item) => item.id === permit.id), false);
}

function testReleasePermitIsNotConsumedWithoutDetention() {
  const game = makeTestGame();
  const player = game.players.find((item) => item.id === "P1");
  assert.ok(player);
  setCurrentPlayer(game, player.id);
  const permit = card("releasePermit", "unused-release-test");
  player.skillCards.push(permit);

  const outcome = useSkillCard(game, player.id, { skillId: permit.id });

  assert.equal(outcome.ok, false);
  assert.ok(player.skillCards.some((item) => item.id === permit.id));
}

function testExclusiveNextMoveCardsCannotConsumeEachOther() {
  const game = makeTestGame();
  const player = game.players.find((item) => item.id === "P1");
  assert.ok(player);
  setCurrentPlayer(game, player.id);
  const remote = card("remoteDice", "remote-test");
  const precise = card("preciseStep", "precise-test");
  player.skillCards.push(remote, precise);

  assert.equal(useSkillCard(game, player.id, { skillId: remote.id, value: 6 }).ok, true);
  const preciseOutcome = useSkillCard(game, player.id, { skillId: precise.id });

  assert.equal(preciseOutcome.ok, false);
  assert.ok(player.skillCards.some((item) => item.id === precise.id));
  assert.ok(player.statusEffects.some((effect) => effect.type === "remoteDice"));
}

function testRenovationTeamIsNotConsumedForAnInvalidProperty() {
  const game = makeTestGame();
  const player = game.players.find((item) => item.id === "P1");
  const tile = game.tiles.find((item) => item.type === "property");
  assert.ok(player);
  assert.ok(tile);
  setCurrentPlayer(game, player.id);
  player.properties.push(tile.id);
  game.properties[tile.id] = {
    tileId: tile.id,
    ownerId: player.id,
    level: MAX_PROPERTY_LEVEL,
    isMortgaged: false
  };
  const renovation = card("renovationTeam", "renovation-test");
  player.skillCards.push(renovation);

  const outcome = useSkillCard(game, player.id, { skillId: renovation.id, targetTileId: tile.id });

  assert.equal(outcome.ok, false);
  assert.ok(player.skillCards.some((item) => item.id === renovation.id));
  assert.equal(game.properties[tile.id]?.level, MAX_PROPERTY_LEVEL);
}

function testPropertyInsuranceBlocksAPropertyDestructionSkill() {
  const game = makeTestGame();
  const attacker = game.players.find((item) => item.id === "P1");
  const owner = game.players.find((item) => item.id === "P2");
  const tile = game.tiles
    .filter((item) => item.type === "property")
    .find((item) => getTileGraphDistance(game.tiles, attacker?.currentTileId ?? "", item.id) <= 8);
  assert.ok(attacker);
  assert.ok(owner);
  assert.ok(tile);
  setCurrentPlayer(game, attacker.id);
  owner.properties = [tile.id];
  Object.assign(game.properties[tile.id]!, {
    ownerId: owner.id,
    level: 3,
    isMortgaged: false,
    insuranceTurns: 3
  });
  const demolition = card("demolishCard", "insured-demolition-test");
  attacker.skillCards.push(demolition);

  const outcome = useSkillCard(game, attacker.id, { skillId: demolition.id, targetTileId: tile.id });

  assert.equal(outcome.ok, true);
  assert.equal(game.properties[tile.id]?.level, 3);
  assert.equal(game.properties[tile.id]?.insuranceTurns, 0);
  assert.match(outcome.skillMessage?.message ?? "", /保险/);
  assert.equal(attacker.skillCards.some((item) => item.id === demolition.id), false);
}

testReleasePermitCanBeUsedWhileAnotherPlayerHasTheTurn();
testSharedTileDistanceMatchesAdjacentBoardNodes();
testReleasePermitIsNotConsumedWithoutDetention();
testExclusiveNextMoveCardsCannotConsumeEachOther();
testRenovationTeamIsNotConsumedForAnInvalidProperty();
testPropertyInsuranceBlocksAPropertyDestructionSkill();

console.log("Skill rule tests passed.");
