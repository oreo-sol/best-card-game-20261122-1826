// Ember Duel — screenshot states. `?shot=title|table|win|loss&seed=N` renders
// the game straight into a fixed, seeded state for screenshots. Normal play
// never passes a shot query, so this hook changes nothing about the game.

import { cardById } from './cards.js';
import { addLog, beginTurn, createGame, mulberry32 } from './game.js';

function fixedCreature(defId, attack, health, canAttack) {
  const def = cardById(defId);
  return {
    uid: 0, // filled in by the caller
    defId: def.id,
    name: def.name,
    suit: def.suit,
    attack,
    health,
    maxHealth: def.health,
    guard: Boolean(def.guard),
    kindle: Boolean(def.kindle),
    canAttack,
    justPlayed: false,
  };
}

// A rich mid-game table, the same every time for the same seed: both hands
// full, creatures on both sides, life totals that tell a story, ember to
// spend, and a log that reads like a duel in progress.
export function buildTableShot(seed) {
  const rng = mulberry32(seed);
  const game = createGame(rng);
  game.phase = 'play';
  game.turn = 'player';
  game.turnCount = 6;

  const player = game.player;
  player.life = 24;
  player.armor = 3;
  player.maxEmber = 6;
  player.ember = 5;
  player.deck = Array.from({ length: 12 }, () => cardById('ember-imp'));
  player.hand = ['ember-imp', 'flame-lash', 'cinder-wolf', 'pebble-guard', 'voltaic-surge'].map((id) => cardById(id));
  player.field = [
    fixedCreature('cinder-wolf', 3, 3, true),
    fixedCreature('pebble-guard', 1, 3, true),
    fixedCreature('thorn-sprout', 2, 3, true),
  ];

  const rival = game.rival;
  rival.life = 19;
  rival.armor = 0;
  rival.maxEmber = 6;
  rival.ember = 2;
  rival.deck = Array.from({ length: 11 }, () => cardById('ember-imp'));
  rival.hand = [cardById('ember-imp'), cardById('flame-lash'), cardById('briar-hound'), cardById('spark-imp')];
  rival.field = [
    fixedCreature('granite-golem', 3, 5, false),
    fixedCreature('spark-imp', 3, 1, true),
  ];

  let uid = 1;
  for (const c of player.field.concat(rival.field)) {
    c.uid = uid;
    uid += 1;
  }

  addLog(game, 'Cinder Wolf (3/3) hits the rival flame for 3.');
  addLog(game, 'Rival plays Granite Golem (3/6). Guard — it must fall first.');
  addLog(game, 'Thorn Sprout kindles: +1/+1.');
  return game;
}

export function buildWinShot(seed) {
  const game = buildTableShot(seed);
  game.rival.life = 0;
  game.rival.field = [];
  game.phase = 'won';
  game.winner = 'player';
  addLog(game, 'Flame Lash finds the rival flame. The rival flame goes out. Victory!');
  return game;
}

export function buildLossShot(seed) {
  const game = buildTableShot(seed);
  game.player.life = 0;
  game.player.field = [];
  game.phase = 'lost';
  game.winner = 'rival';
  addLog(game, 'Inferno Drake (6/6) strikes your flame for 6. Your flame goes out. Defeat.');
  return game;
}

export function shotFromQuery(query) {
  const params = new URLSearchParams(query);
  const shot = params.get('shot');
  const seed = Number(params.get('seed') || '1');
  if (shot === 'table') return { name: 'table', game: buildTableShot(seed) };
  if (shot === 'win') return { name: 'win', game: buildWinShot(seed) };
  if (shot === 'loss') return { name: 'loss', game: buildLossShot(seed) };
  return { name: 'title', game: null };
}

// Keep beginTurn imported for the boot path that starts a real game.
export { beginTurn };
