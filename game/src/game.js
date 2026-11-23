// Ember Duel — game state machine: turns, ember, drawing, playing cards,
// attacking, damage, armor, win and loss. No DOM here: the renderer reads
// this state and the engine only mutates it.

import { buildDeck, cardById } from './cards.js';

export const STARTING_LIFE = 30;
export const MAX_FIELD = 5;
export const MAX_HAND = 10;
export const MAX_EMBER = 10;

let nextUid = 1;

export function shuffle(deck, random) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// A seeded random so screenshot states are exactly reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newPlayer(deck) {
  return {
    life: STARTING_LIFE,
    armor: 0,
    ember: 0,
    maxEmber: 0,
    hand: [],
    deck,
    field: [],
    fatigue: 0,
  };
}

function newCreature(def, sparkBonus) {
  return {
    uid: nextUid,
    defId: def.id,
    name: def.name,
    suit: def.suit,
    attack: def.attack + (sparkBonus || 0),
    health: def.health,
    maxHealth: def.health,
    guard: Boolean(def.guard),
    kindle: Boolean(def.kindle),
    canAttack: false,
    justPlayed: true,
  };
}

export function createGame(random) {
  const rng = random || Math.random;
  return {
    phase: 'title', // title | play | won | lost
    turn: 'player',
    turnCount: 0,
    sparkChainThisTurn: 0,
    player: newPlayer(shuffle(buildDeck(), rng)),
    rival: newPlayer(shuffle(buildDeck(), rng)),
    log: [],
    winner: null,
  };
}

export function otherSide(side) {
  return side === 'player' ? 'rival' : 'player';
}

export function addLog(game, line) {
  game.log.unshift(line);
  if (game.log.length > 40) game.log.length = 40;
}

export function drawCard(game, side) {
  const p = game[side];
  if (p.hand.length >= MAX_HAND) {
    addLog(game, `${side === 'player' ? 'You' : 'Rival'} burn a card: hand is full.`);
    p.deck.shift();
    return null;
  }
  const def = p.deck.shift();
  if (!def) {
    p.fatigue += 1;
    damageSide(game, side, p.fatigue, 'fatigue');
    addLog(game, `${side === 'player' ? 'You' : 'Rival'} draw from an empty deck and take ${p.fatigue} fatigue.`);
    return null;
  }
  p.hand.push(def);
  return def;
}

export function startGame(game) {
  nextUid = 1;
  game.phase = 'play';
  game.turn = 'player';
  game.turnCount = 1;
  game.sparkChainThisTurn = 0;
  for (let i = 0; i < 3; i += 1) {
    drawCard(game, 'player');
    drawCard(game, 'rival');
  }
  beginTurn(game, 'player');
  addLog(game, 'The duel begins. Your turn: draw, spend ember, strike.');
}

export function beginTurn(game, side) {
  const p = game[side];
  game.turn = side;
  if (side === 'player') game.turnCount += 1;
  p.maxEmber = Math.min(MAX_EMBER, p.maxEmber + 1);
  p.ember = p.maxEmber;
  game.sparkChainThisTurn = 0;
  drawCard(game, side);
  for (const c of p.field) {
    c.canAttack = true;
    c.justPlayed = false;
    if (c.kindle) {
      c.attack += 1;
      c.health += 1;
      c.maxHealth += 1;
      addLog(game, `${c.name} kindles: +1/+1.`);
    }
  }
}

export function affordable(game, side, def) {
  return game[side].ember >= def.cost;
}

export function playCard(game, side, handIndex, target) {
  const p = game[side];
  const def = p.hand[handIndex];
  if (!def) return { ok: false, reason: 'no such card' };
  if (game.turn !== side) return { ok: false, reason: 'not your turn' };
  if (!affordable(game, side, def)) return { ok: false, reason: 'not enough ember' };
  if (def.type === 'creature' && p.field.length >= MAX_FIELD) {
    return { ok: false, reason: 'the field is full' };
  }
  if (def.type === 'spell' && def.id === 'flame-lash' && !target) {
    return { ok: false, reason: 'pick a target for Flame Lash' };
  }
  p.ember -= def.cost;
  p.hand.splice(handIndex, 1);
  const sparkBonus = def.suit === 'spark' && game.sparkChainThisTurn > 0 ? 2 : 0;
  if (def.suit === 'spark') game.sparkChainThisTurn += 1;

  if (def.type === 'creature') {
    const creature = newCreature(def, sparkBonus);
    p.field.push(creature);
    if (def.id === 'elderwood-treant') healSide(game, side, 3);
    addLog(game, `${side === 'player' ? 'You play' : 'Rival plays'} ${def.name} (${def.attack + sparkBonus}/${def.health}).`);
    return { ok: true, played: creature };
  }

  // Spells.
  if (def.id === 'flame-lash') {
    addLog(game, `${side === 'player' ? 'You hurl' : 'Rival hurls'} Flame Lash at ${targetLabel(game, target)}.`);
    damageTarget(game, target, 3 + sparkBonus);
  } else if (def.id === 'stone-skin') {
    p.armor += 6;
    addLog(game, `${side === 'player' ? 'You gain' : 'Rival gains'} 6 armor.`);
  } else if (def.id === 'chain-lightning') {
    const foe = game[otherSide(side)];
    const dealt = 2 + (sparkBonus > 0 ? 1 : 0);
    addLog(game, `${side === 'player' ? 'You loose' : 'Rival looses'} Chain Lightning: ${dealt} to every enemy creature.`);
    for (const c of foe.field.slice()) damageCreature(game, otherSide(side), c, dealt);
  } else if (def.id === 'voltaic-surge') {
    drawCard(game, side);
    drawCard(game, side);
    addLog(game, `${side === 'player' ? 'You draw' : 'Rival draws'} 2 cards.`);
  }
  return { ok: true, played: null };
}

export function targetLabel(game, target) {
  if (!target) return 'nothing';
  if (target === 'player-hero') return 'your flame';
  if (target === 'rival-hero') return 'the rival flame';
  const creature = findCreature(game, target);
  return creature ? creature.name : 'a creature';
}

export function findCreature(game, uid) {
  return game.player.field.concat(game.rival.field).find((c) => c.uid === uid) || null;
}

export function creatureSide(game, uid) {
  if (game.player.field.some((c) => c.uid === uid)) return 'player';
  if (game.rival.field.some((c) => c.uid === uid)) return 'rival';
  return null;
}

export function legalAttackTargets(game, attackerUid) {
  const side = creatureSide(game, attackerUid);
  if (!side || game.turn !== side) return [];
  const attacker = findCreature(game, attackerUid);
  if (!attacker || !attacker.canAttack) return [];
  const foe = game[otherSide(side)];
  const guards = foe.field.filter((c) => c.guard);
  const targets = guards.length > 0 ? guards : foe.field;
  return targets.map((c) => c.uid).concat(guards.length > 0 ? [] : [`${otherSide(side)}-hero`]);
}

export function attack(game, attackerUid, targetUid) {
  const side = creatureSide(game, attackerUid);
  const attacker = findCreature(game, attackerUid);
  if (!side || !attacker || !attacker.canAttack) return { ok: false, reason: 'that creature cannot attack' };
  const targets = legalAttackTargets(game, attackerUid);
  if (!targets.includes(targetUid)) return { ok: false, reason: 'that target is guarded' };
  attacker.canAttack = false;
  if (targetUid === 'player-hero' || targetUid === 'rival-hero') {
    const heroSide = targetUid === 'player-hero' ? 'player' : 'rival';
    addLog(game, `${attacker.name} strikes ${heroSide === 'player' ? 'your' : 'the rival'} flame for ${attacker.attack}.`);
    damageSide(game, heroSide, attacker.attack, 'attack');
    return { ok: true, attacker, target: targetUid };
  }
  const defender = findCreature(game, targetUid);
  addLog(game, `${attacker.name} (${attacker.attack}/${attacker.health}) hits ${defender.name} (${defender.attack}/${defender.health}).`);
  damageCreature(game, creatureSide(game, targetUid), defender, attacker.attack);
  damageCreature(game, side, attacker, defender.attack);
  return { ok: true, attacker, target: targetUid };
}

export function damageCreature(game, side, creature, amount) {
  creature.health -= amount;
  if (creature.health <= 0) {
    const field = game[side].field;
    const i = field.indexOf(creature);
    if (i !== -1) field.splice(i, 1);
    addLog(game, `${creature.name} shatters.`);
  }
}

export function damageSide(game, side, amount, source) {
  const p = game[side];
  let left = amount;
  if (p.armor > 0) {
    const soaked = Math.min(p.armor, left);
    p.armor -= soaked;
    left -= soaked;
  }
  p.life -= left;
  if (p.life <= 0) {
    p.life = 0;
    endDuel(game, otherSide(side), source);
  }
}

export function damageTarget(game, target, amount) {
  if (target === 'player-hero') damageSide(game, 'player', amount, 'spell');
  else if (target === 'rival-hero') damageSide(game, 'rival', amount, 'spell');
  else {
    const side = creatureSide(game, target);
    const creature = findCreature(game, target);
    if (side && creature) damageCreature(game, side, creature, amount);
  }
}

export function healSide(game, side, amount) {
  const p = game[side];
  p.life = Math.min(STARTING_LIFE, p.life + amount);
}

export function endDuel(game, winner, source) {
  if (game.phase !== 'play') return;
  game.phase = winner === 'player' ? 'won' : 'lost';
  game.winner = winner;
  addLog(game, winner === 'player' ? 'The rival flame goes out. Victory!' : 'Your flame goes out. Defeat.');
}

export function canEndTurn(game) {
  return game.phase === 'play' && game.turn === 'player';
}
