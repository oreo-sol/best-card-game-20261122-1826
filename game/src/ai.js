// Ember Duel — the rival AI. It plays by a readable plan the player can
// see coming and counter: it guards when it is hurt, it answers your
// biggest creature, it goes for your flame when it smells a win, and it
// says what it is about to do before it does it.

import { legalAttackTargets } from './game.js';

function handValue(game, def) {
  // How much the rival wants this card right now, 0..10.
  const rival = game.rival;
  const you = game.player;
  if (def.id === 'stone-skin') return rival.life <= 15 ? 9 : 3;
  if (def.id === 'flame-lash') {
    const biggest = you.field.reduce((m, c) => Math.max(m, c.attack), 0);
    if (rival.life + 0 >= 0 && you.life <= 3) return 10; // lethal
    if (biggest >= 4) return 8; // answer the threat
    return 4;
  }
  if (def.id === 'chain-lightning') return you.field.length >= 2 ? 9 : 2;
  if (def.id === 'voltaic-surge') return rival.hand.length <= 2 ? 8 : 2;
  if (def.guard) return rival.life <= 18 ? 8 : 5;
  if (def.type === 'creature') return 5 + Math.min(3, def.attack);
  return 5;
}

// Pick the rival's plays for this turn, best first, while it can afford them.
export function planRivalPlays(game) {
  const plays = [];
  let ember = game.rival.ember;
  const hand = game.rival.hand.slice();
  const scored = hand
    .map((def, i) => ({ def, i, value: handValue(game, def) }))
    .sort((a, b) => b.value - a.value);
  for (const pick of scored) {
    if (pick.def.cost > ember) continue;
    if (pick.def.type === 'creature' && game.rival.field.length + plays.filter((p) => p.def.type === 'creature').length >= 5) continue;
    if (pick.def.id === 'flame-lash' && pick.value < 8) continue; // hold the lash
    if (pick.def.id === 'chain-lightning' && pick.value < 8) continue; // hold the storm
    plays.push({ def: pick.def, handIndex: pick.i });
    ember -= pick.def.cost;
  }
  return plays;
}

// Pick one attack per creature that can attack, in the order the rival
// thinks: answer a guard first, trade up when it wins the trade, otherwise
// go straight for your flame — and go face when it is lethal.
export function planRivalAttacks(game) {
  const attacks = [];
  for (const creature of game.rival.field.filter((c) => c.canAttack)) {
    const targets = legalAttackTargets(game, creature.uid);
    if (targets.length === 0) continue;
    const guards = game.player.field.filter((c) => c.guard);
    if (guards.length > 0) {
      const guard = guards.slice().sort((a, b) => b.health - a.health)[0];
      attacks.push({ attackerUid: creature.uid, targetUid: guard.uid, reason: 'breaks your guard' });
      continue;
    }
    if (creature.attack >= game.player.life) {
      attacks.push({ attackerUid: creature.uid, targetUid: 'player-hero', reason: 'goes for the win' });
      continue;
    }
    const prey = game.player.field
      .filter((c) => c.attack >= 3 && c.health <= creature.attack && creature.health > c.attack)
      .sort((a, b) => b.attack - a.attack)[0];
    if (prey) {
      attacks.push({ attackerUid: creature.uid, targetUid: prey.uid, reason: `trades into your ${prey.name}` });
    } else {
      attacks.push({ attackerUid: creature.uid, targetUid: 'player-hero', reason: 'strikes your flame' });
    }
  }
  return attacks;
}

// One line the table shows while the rival is thinking, so its plan is
// readable before it lands.
export function rivalIntentLine(game) {
  const plays = planRivalPlays(game);
  const attacks = planRivalAttacks(game);
  if (plays.length === 0 && attacks.length === 0) return 'The rival holds its ember and passes.';
  const parts = [];
  if (plays.length > 0) parts.push(`plays ${plays.map((p) => p.def.name).join(', ')}`);
  if (attacks.length > 0) parts.push(`strikes ${attacks.length} time${attacks.length > 1 ? 's' : ''}`);
  return `The rival ${parts.join(' and ')}.`;
}
