// Ember Duel — DOM renderer: the table, the hands, the cards, the banners
// and the end screens. The engine (game.js) owns the state; this file only
// turns it into readable DOM and plays the slide, flip and snap animations.

import { SUITS } from './cards.js';
import { findCreature, legalAttackTargets } from './game.js';

// Inline suit marks: each suit is a colour AND a shape, so a card's suit is
// readable even with the colour gone.
const SUIT_PATHS = {
  flame: '<path d="M12 2 C12 2 6 8 6 13 A6 6 0 0 0 18 13 C18 8 12 2 12 2 Z"/><path d="M12 9 C10.5 11 9.5 12 9.5 14 A2.5 2.5 0 0 0 14.5 14 C14.5 12 13.5 11 12 9 Z" fill="rgba(255,255,255,0.55)"/>',
  shield: '<path d="M12 2 L19 4 V10 C19 15 16 19 12 21 C8 19 5 15 5 10 V4 Z"/><path d="M12 6 L16 7.2 V10 C16 13 14.5 15.5 12 16.8 C9.5 15.5 8 13 8 10 V7.2 Z" fill="rgba(255,255,255,0.45)"/>',
  leaf: '<path d="M20 4 C11 4 5 10 5 19 C14 19 20 13 20 4 Z"/><path d="M5 19 C9 15 13 11 17 7" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.6"/>',
  bolt: '<path d="M13 2 L5 13 H11 L9 22 L19 10 H12 Z"/>',
};

export function suitIcon(suit, size, light) {
  // light = cream fill, for icons sitting on the suit's own dark colour
  // (card art panels, card backs), where the suit colour would vanish.
  // The path key is the suit's icon name, not the suit key (stone -> shield).
  const color = light ? '#f7ecd2' : SUITS[suit].color;
  const paths = SUIT_PATHS[SUITS[suit].icon];
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" aria-label="${SUITS[suit].name} suit">${paths}</svg>`;
}

function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function emberPips(current, max) {
  let pips = '';
  for (let i = 0; i < 10; i += 1) {
    pips += `<span class="pip${i < current ? ' on' : ''}${i < max ? '' : ' locked'}"></span>`;
  }
  return pips;
}

function renderHeroPanel(game, side, ui) {
  const p = game[side];
  const isPlayer = side === 'player';
  const panel = el('div', `hero ${isPlayer ? 'hero-player' : 'hero-rival'}`);
  const name = isPlayer ? 'YOU — Ember Mage' : 'RIVAL — Cinder Mage';
  const armor = p.armor > 0 ? `<span class="armor-badge">${suitIcon('stone', 14)} ${p.armor}</span>` : '';
  panel.innerHTML = `
    <div class="hero-name">${name}</div>
    <div class="hero-life" data-hero="${side}">
      <span class="flame-mark">${suitIcon('flame', 22)}</span>
      <span class="life-number">${p.life}</span>${armor}
    </div>
    <div class="hero-ember">${emberPips(p.ember, p.maxEmber)}<span class="ember-count">${p.ember}/${p.maxEmber} ember</span></div>`;
  const spellTarget = ui.awaitingTarget && ui.awaitingTarget.spellId === 'flame-lash' && !isPlayer;
  const attackTarget = ui.selectedAttacker && ui.attackTargets.includes(`${side}-hero`);
  if (spellTarget || attackTarget) {
    panel.classList.add('targetable');
    panel.addEventListener('click', () => {
      if (ui.awaitingTarget) ui.onTargetPicked(`${side}-hero`);
      else ui.onHeroClicked(`${side}-hero`);
    });
  }
  if (ui.fx.damageHero === side) panel.classList.add('shaken');
  return panel;
}

function renderHandCard(game, def, index, ui) {
  const suit = SUITS[def.suit];
  const card = el('div', `card suit-${def.suit}`);
  const canPlay = game.turn === 'player' && !ui.busy && game.player.ember >= def.cost;
  if (!canPlay) card.classList.add('unplayable');
  if (ui.selectedHandIndex === index) card.classList.add('selected');
  const stats = def.type === 'creature'
    ? `<div class="card-stats"><span class="atk">${def.attack}</span><span class="hp">${def.health}</span></div>`
    : `<div class="card-stats spell-tag">SPELL</div>`;
  const tags = [];
  if (def.guard) tags.push('Guard');
  if (def.kindle) tags.push('Kindle');
  if (def.sparkChain) tags.push('Spark chain');
  card.innerHTML = `
    <div class="card-cost">${def.cost}</div>
    <div class="card-name">${def.name}</div>
    <div class="card-art" style="background:${suit.dark}">${suitIcon(def.suit, 44, true)}</div>
    <div class="card-text">${def.text}</div>
    ${tags.length ? `<div class="card-tags">${tags.join(' · ')}</div>` : ''}
    ${stats}`;
  card.addEventListener('click', () => ui.onHandCardClicked(index));
  return card;
}

function renderCreatureCard(game, creature, side, ui) {
  const suit = SUITS[creature.suit];
  const card = el('div', `card creature suit-${creature.suit}`);
  const mine = side === 'player';
  const canAttack = mine && game.turn === 'player' && !ui.busy && creature.canAttack;
  if (!creature.canAttack) card.classList.add('sleeping');
  if (creature.guard) card.classList.add('guard');
  if (ui.selectedAttacker === creature.uid) card.classList.add('selected');
  const spellTarget = ui.awaitingTarget && ui.awaitingTarget.spellId === 'flame-lash' && side === 'rival';
  const attackTarget = ui.selectedAttacker && ui.attackTargets.includes(creature.uid);
  if (spellTarget || attackTarget) card.classList.add('targetable');
  if (ui.fx.playedUid === creature.uid) card.classList.add('just-played');
  if (ui.fx.attackerUid === creature.uid) card.classList.add('lunging');
  card.innerHTML = `
    <div class="card-name">${creature.name}</div>
    <div class="card-art" style="background:${suit.dark}">${suitIcon(creature.suit, 40, true)}</div>
    ${creature.guard ? '<div class="card-tags">Guard</div>' : ''}
    ${creature.kindle ? '<div class="card-tags">Kindle</div>' : ''}
    <div class="card-stats"><span class="atk">${creature.attack}</span><span class="hp">${creature.health}</span></div>`;
  card.addEventListener('click', () => ui.onCreatureClicked(creature.uid, side));
  if (ui.fx.damageUid === creature.uid) {
    const float = el('span', 'dmg-float', `-${ui.fx.damageAmount}`);
    card.appendChild(float);
  }
  return card;
}

function renderCardBack() {
  return el('div', 'card-back', `<span class="back-mark">${suitIcon('flame', 30, true)}</span>`);
}

// Rebuild the whole table from the game state. ui.fx marks the one thing
// that just happened so it animates; render consumes the marks.
export function renderTable(game, ui) {
  const table = document.getElementById('table');
  table.innerHTML = '';

  const top = el('div', 'row rival-row');
  top.appendChild(renderHeroPanel(game, 'rival', ui));
  const rivalHand = el('div', 'hand rival-hand');
  for (let i = 0; i < game.rival.hand.length; i += 1) rivalHand.appendChild(renderCardBack());
  rivalHand.appendChild(el('div', 'deck-count', `${game.rival.deck.length} in deck`));
  top.appendChild(rivalHand);
  table.appendChild(top);

  const rivalField = el('div', 'field rival-field');
  for (const c of game.rival.field) rivalField.appendChild(renderCreatureCard(game, c, 'rival', ui));
  if (game.rival.field.length === 0) rivalField.appendChild(el('div', 'field-empty', 'Rival field — empty'));
  table.appendChild(rivalField);

  const mid = el('div', 'mid-strip');
  const banner = el('div', 'banner', ui.bannerText || (game.turn === 'player' ? 'Your turn — play a card, then strike.' : 'Rival turn…'));
  mid.appendChild(banner);
  const log = el('div', 'log');
  for (const line of game.log.slice(0, 3)) log.appendChild(el('div', 'log-line', line));
  mid.appendChild(log);
  table.appendChild(mid);

  const playerField = el('div', 'field player-field');
  for (const c of game.player.field) playerField.appendChild(renderCreatureCard(game, c, 'player', ui));
  if (game.player.field.length === 0) playerField.appendChild(el('div', 'field-empty', 'Your field — play a creature to hold the line'));
  table.appendChild(playerField);

  const bottom = el('div', 'row player-row');
  bottom.appendChild(renderHeroPanel(game, 'player', ui));
  const hand = el('div', 'hand player-hand');
  game.player.hand.forEach((def, i) => hand.appendChild(renderHandCard(game, def, i, ui)));
  bottom.appendChild(hand);
  const controls = el('div', 'controls');
  const endBtn = el('button', 'end-turn', 'End Turn <span class="key-hint">[E]</span>');
  endBtn.disabled = ui.busy || game.turn !== 'player' || game.phase !== 'play';
  endBtn.addEventListener('click', () => ui.onEndTurn());
  controls.appendChild(endBtn);
  controls.appendChild(el('div', 'deck-count', `${game.player.deck.length} in deck · turn ${game.turnCount}`));
  bottom.appendChild(controls);
  table.appendChild(bottom);

  ui.fx = { playedUid: null, attackerUid: null, damageUid: null, damageAmount: 0, damageHero: null };
}

export function renderTitleScreen(ui) {
  const screen = document.getElementById('title-screen');
  screen.innerHTML = `
    <div class="title-kicker">A DUEL OF EMBER MAGES</div>
    <h1 class="title-name">EMBER DUEL</h1>
    <div class="title-suits">
      <span>${suitIcon('flame', 26)} Flame</span>
      <span>${suitIcon('stone', 26)} Stone</span>
      <span>${suitIcon('thorn', 26)} Thorn</span>
      <span>${suitIcon('spark', 26)} Spark</span>
    </div>
    <p class="title-rules">Both flames start at 30. Spend ember to play cards, strike with your
    creatures, and put the rival flame out. Guards must fall first. Sparks chain:
    play two Sparks in one turn and the second hits harder.</p>
    <button class="play-button" id="play-button">PLAY</button>
    <p class="title-hint">Click a card to play it · click your creature, then a target, to attack · E ends your turn</p>`;
  screen.querySelector('#play-button').addEventListener('click', () => ui.onPlayPressed());
}

export function showEndOverlay(game, ui) {
  const overlay = document.getElementById('end-overlay');
  const won = game.phase === 'won';
  overlay.className = won ? 'end-overlay win' : 'end-overlay loss';
  overlay.innerHTML = `
    <div class="end-burst"></div>
    <h2 class="end-title">${won ? 'VICTORY' : 'DEFEAT'}</h2>
    <p class="end-line">${won ? 'The rival flame goes out. The table is yours.' : 'Your flame goes out. The rival keeps the table.'}</p>
    <p class="end-score">Your flame ${game.player.life} — Rival flame ${game.rival.life} · ${game.turnCount} turns</p>
    <button class="play-button" id="again-button">PLAY AGAIN</button>`;
  overlay.hidden = false;
  overlay.querySelector('#again-button').addEventListener('click', () => ui.onPlayAgain());
  document.getElementById('table').classList.add('dimmed');
}

export function hideEndOverlay() {
  const overlay = document.getElementById('end-overlay');
  overlay.hidden = true;
  overlay.className = 'end-overlay';
  document.getElementById('table').classList.remove('dimmed');
}

// What the player can legally hit with the selected attacker, so the
// renderer can light the targets up.
export function attackTargetsFor(game, attackerUid) {
  return legalAttackTargets(game, attackerUid);
}

export function creatureName(game, uid) {
  const c = findCreature(game, uid);
  return c ? c.name : 'a creature';
}
