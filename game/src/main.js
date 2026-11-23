// Ember Duel — boot and turn controller: wires clicks and keys to the
// engine, runs the rival's turn one readable move at a time, and swaps the
// title screen, the table and the end screens.

import { planRivalAttacks, planRivalPlays, rivalIntentLine } from './ai.js';
import {
  attack, beginTurn, canEndTurn, createGame, findCreature,
  legalAttackTargets, playCard, startGame,
} from './game.js';
import { hideEndOverlay, renderTable, renderTitleScreen, showEndOverlay } from './render.js';
import { shotFromQuery } from './shots.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let game = createGame();
let ui = null;

function refresh(bannerText) {
  ui.bannerText = bannerText;
  renderTable(game, ui);
}

function finishIfOver() {
  if (game.phase === 'won' || game.phase === 'lost') {
    refresh(game.phase === 'won' ? 'Victory — the rival flame goes out.' : 'Defeat — your flame goes out.');
    showEndOverlay(game, ui);
    return true;
  }
  return false;
}

function playHandCard(index) {
  const def = game.player.hand[index];
  if (!def) return;
  if (game.turn !== 'player' || ui.busy || game.phase !== 'play') return;
  if (game.player.ember < def.cost) {
    refresh(`Not enough ember for ${def.name} (${def.cost}).`);
    return;
  }
  if (def.type === 'creature') {
    const result = playCard(game, 'player', index);
    if (!result.ok) {
      refresh(result.reason);
      return;
    }
    ui.fx.playedUid = result.played.uid;
    ui.selectedHandIndex = null;
    refresh(`${def.name} enters the table.`);
    finishIfOver();
    return;
  }
  // Spells: Flame Lash needs a target, the others resolve at once.
  if (def.id === 'flame-lash') {
    ui.selectedHandIndex = index;
    ui.awaitingTarget = { spellId: 'flame-lash', handIndex: index };
    refresh('Flame Lash — pick a target: a creature, or the rival flame.');
    return;
  }
  const result = playCard(game, 'player', index);
  if (!result.ok) {
    refresh(result.reason);
    return;
  }
  ui.selectedHandIndex = null;
  refresh(`${def.name} resolves.`);
  finishIfOver();
}

function pickTarget(targetUid) {
  if (!ui.awaitingTarget) return;
  const { handIndex } = ui.awaitingTarget;
  const def = game.player.hand[handIndex];
  ui.awaitingTarget = null;
  ui.selectedHandIndex = null;
  if (!def) return;
  const result = playCard(game, 'player', handIndex, targetUid);
  if (!result.ok) {
    refresh(result.reason);
    return;
  }
  ui.fx.damageUid = typeof targetUid === 'number' ? targetUid : null;
  ui.fx.damageHero = targetUid === 'rival-hero' ? 'rival' : null;
  ui.fx.damageAmount = 3;
  refresh(`Flame Lash hits ${targetUid === 'rival-hero' ? 'the rival flame' : 'its target'} for 3.`);
  finishIfOver();
}

function clickCreature(uid, side) {
  if (game.turn !== 'player' || ui.busy || game.phase !== 'play') return;
  // Flame Lash waiting for a target: any rival creature will do.
  if (ui.awaitingTarget && side === 'rival') {
    pickTarget(uid);
    return;
  }
  // Attacking: a selected attacker plus a legal target resolves the attack.
  if (ui.selectedAttacker && side === 'rival') {
    const targets = legalAttackTargets(game, ui.selectedAttacker);
    if (targets.includes(uid)) {
      resolveAttack(ui.selectedAttacker, uid);
      return;
    }
  }
  if (side !== 'player') return;
  const creature = findCreature(game, uid);
  if (!creature) return;
  if (!creature.canAttack) {
    refresh(`${creature.name} is still catching its breath — it attacks next turn.`);
    return;
  }
  ui.selectedAttacker = ui.selectedAttacker === uid ? null : uid;
  const targets = legalAttackTargets(game, uid);
  ui.attackTargets = targets;
  refresh(targets.length > 0
    ? `${creature.name} is ready — pick a target. Guards must fall first.`
    : `${creature.name} has nothing to hit.`);
}

function resolveAttack(attackerUid, targetUid) {
  const attacker = findCreature(game, attackerUid);
  const result = attack(game, attackerUid, targetUid);
  ui.selectedAttacker = null;
  ui.attackTargets = [];
  if (!result.ok) {
    refresh(result.reason);
    return;
  }
  ui.fx.attackerUid = attacker.uid;
  ui.fx.damageUid = typeof targetUid === 'number' ? targetUid : null;
  ui.fx.damageHero = targetUid === 'player-hero' || targetUid === 'rival-hero' ? targetUid.replace('-hero', '') : null;
  ui.fx.damageAmount = attacker.attack;
  refresh(`${attacker.name} strikes.`);
  finishIfOver();
}

function clickHero(targetUid) {
  if (game.turn !== 'player' || ui.busy || game.phase !== 'play') return;
  if (ui.awaitingTarget) {
    pickTarget(targetUid);
    return;
  }
  if (ui.selectedAttacker) {
    const targets = legalAttackTargets(game, ui.selectedAttacker);
    if (targets.includes(targetUid)) resolveAttack(ui.selectedAttacker, targetUid);
  }
}

async function runRivalTurn() {
  ui.busy = true;
  ui.bannerText = rivalIntentLine(game);
  refresh(ui.bannerText);
  await sleep(900);

  // Plays, one card at a time, so each move is readable.
  for (const plan of planRivalPlays(game)) {
    if (game.phase !== 'play') break;
    const index = game.rival.hand.indexOf(plan.def);
    if (index === -1) continue;
    if (plan.def.id === 'flame-lash') {
      const target = game.player.life <= 3 ? 'player-hero'
        : (game.player.field.slice().sort((a, b) => b.attack - a.attack)[0] || {}).uid || 'player-hero';
      const result = playCard(game, 'rival', index, target);
      if (result.ok) {
        ui.fx.damageUid = typeof target === 'number' ? target : null;
        ui.fx.damageHero = target === 'player-hero' ? 'player' : null;
        ui.fx.damageAmount = 3;
      }
    } else {
      const result = playCard(game, 'rival', index);
      if (result.ok && result.played) ui.fx.playedUid = result.played.uid;
    }
    refresh(`Rival plays ${plan.def.name}.`);
    await sleep(800);
    if (finishIfOver()) return;
  }

  // Attacks, one creature at a time.
  for (const plan of planRivalAttacks(game)) {
    if (game.phase !== 'play') break;
    const attacker = findCreature(game, plan.attackerUid);
    if (!attacker || !attacker.canAttack) continue;
    const result = attack(game, plan.attackerUid, plan.targetUid);
    if (result.ok) {
      ui.fx.attackerUid = plan.attackerUid;
      ui.fx.damageUid = typeof plan.targetUid === 'number' ? plan.targetUid : null;
      ui.fx.damageHero = plan.targetUid === 'player-hero' ? 'player' : null;
      ui.fx.damageAmount = attacker.attack;
      refresh(`Rival ${attacker.name} ${plan.reason}.`);
      await sleep(800);
      if (finishIfOver()) return;
    }
  }

  beginTurn(game, 'player');
  ui.busy = false;
  refresh('Your turn — draw, spend ember, strike.');
}

function endTurn() {
  if (!canEndTurn(game) || ui.busy) return;
  ui.selectedHandIndex = null;
  ui.selectedAttacker = null;
  ui.awaitingTarget = null;
  beginTurn(game, 'rival');
  runRivalTurn();
}

function startNewGame() {
  game = createGame();
  hideEndOverlay();
  document.getElementById('title-screen').hidden = true;
  document.getElementById('table').hidden = false;
  startGame(game);
  ui.busy = false;
  refresh('Your turn — play a card, then strike.');
}

function boot() {
  ui = {
    busy: false,
    bannerText: '',
    selectedHandIndex: null,
    selectedAttacker: null,
    awaitingTarget: null,
    attackTargets: [],
    fx: { playedUid: null, attackerUid: null, damageUid: null, damageAmount: 0, damageHero: null },
    onHandCardClicked: (index) => playHandCard(index),
    onCreatureClicked: (uid, side) => clickCreature(uid, side),
    onHeroClicked: (targetUid) => clickHero(targetUid),
    onTargetPicked: (targetUid) => pickTarget(targetUid),
    onEndTurn: () => endTurn(),
    onPlayPressed: () => startNewGame(),
    onPlayAgain: () => startNewGame(),
  };

  const shot = shotFromQuery(window.location.search);
  if (shot.name !== 'title') {
    // Screenshot mode: the fixed state, animations off, no input.
    game = shot.game;
    document.body.classList.add('shot');
    document.getElementById('title-screen').hidden = true;
    document.getElementById('table').hidden = false;
    ui.busy = true;
    const banner = game.phase === 'won' ? 'Victory — the rival flame goes out.'
      : game.phase === 'lost' ? 'Defeat — your flame goes out.'
      : 'Your turn — play a card, then strike.';
    refresh(banner);
    if (game.phase === 'won' || game.phase === 'lost') showEndOverlay(game, ui);
    return;
  }

  renderTitleScreen(ui);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'e' || event.key === 'E') endTurn();
    if (event.key === 'Escape') {
      ui.selectedHandIndex = null;
      ui.selectedAttacker = null;
      ui.awaitingTarget = null;
      if (game.phase === 'play') refresh('Your turn — play a card, then strike.');
    }
  });
}

boot();
