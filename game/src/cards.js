// Ember Duel — card catalogue.
// Four suits, told apart by colour AND shape: Flame (red, flame), Stone
// (slate blue, shield), Thorn (green, leaf), Spark (gold, bolt). Every card
// is an original Ember Duel card: no names, art or text borrowed from any
// other game.

export const SUITS = {
  flame: { name: 'Flame', color: '#d23c2a', dark: '#8f1f14', icon: 'flame' },
  stone: { name: 'Stone', color: '#5b7a99', dark: '#33475c', icon: 'shield' },
  thorn: { name: 'Thorn', color: '#4a9e4d', dark: '#2c5c2e', icon: 'leaf' },
  spark: { name: 'Spark', color: '#d9a400', dark: '#8a6a00', icon: 'bolt' },
};

// A card definition. Creatures carry attack/health; spells carry an effect
// the game engine resolves. guard = must be attacked before the hero.
// kindle = grows +1/+1 at the start of its owner's turn. sparkChain = this
// card is stronger when another Spark card was already played this turn.
export const CARDS = [
  { id: 'ember-imp', name: 'Ember Imp', suit: 'flame', cost: 1, type: 'creature', attack: 2, health: 1, text: 'A quick spark with a bite.' },
  { id: 'flame-lash', name: 'Flame Lash', suit: 'flame', cost: 2, type: 'spell', text: 'Deal 3 damage to any target.' },
  { id: 'cinder-wolf', name: 'Cinder Wolf', suit: 'flame', cost: 3, type: 'creature', attack: 3, health: 3, text: 'It hunts where the fire ran.' },
  { id: 'inferno-drake', name: 'Inferno Drake', suit: 'flame', cost: 6, type: 'creature', attack: 6, health: 6, text: 'The sky itself catches fire.' },
  { id: 'pebble-guard', name: 'Pebble Guard', suit: 'stone', cost: 1, type: 'creature', attack: 1, health: 3, guard: true, text: 'Guard. Small, stubborn, in the way.' },
  { id: 'granite-golem', name: 'Granite Golem', suit: 'stone', cost: 4, type: 'creature', attack: 3, health: 6, guard: true, text: 'Guard. It has never once hurried.' },
  { id: 'stone-skin', name: 'Stone Skin', suit: 'stone', cost: 2, type: 'spell', text: 'Gain 6 armor. Armor soaks damage first.' },
  { id: 'thorn-sprout', name: 'Thorn Sprout', suit: 'thorn', cost: 1, type: 'creature', attack: 1, health: 2, kindle: true, text: 'Kindle: grows +1/+1 at the start of your turn.' },
  { id: 'briar-hound', name: 'Briar Hound', suit: 'thorn', cost: 2, type: 'creature', attack: 2, health: 2, text: 'Fast through the brambles.' },
  { id: 'elderwood-treant', name: 'Elderwood Treant', suit: 'thorn', cost: 5, type: 'creature', attack: 4, health: 5, text: 'Heal 3 when played.' },
  { id: 'spark-imp', name: 'Spark Imp', suit: 'spark', cost: 1, type: 'creature', attack: 1, health: 1, sparkChain: true, text: 'Spark chain: +2 attack if another Spark was played this turn.' },
  { id: 'chain-lightning', name: 'Chain Lightning', suit: 'spark', cost: 3, type: 'spell', text: 'Deal 2 damage to all enemy creatures.' },
  { id: 'voltaic-surge', name: 'Voltaic Surge', suit: 'spark', cost: 2, type: 'spell', text: 'Draw 2 cards.' },
];

export function cardById(id) {
  return CARDS.find((c) => c.id === id);
}

// One 20-card deck: the same mix for both duelists, shuffled at game start.
const DECK_LIST = [
  'ember-imp', 'ember-imp',
  'flame-lash', 'flame-lash',
  'cinder-wolf', 'cinder-wolf',
  'inferno-drake',
  'pebble-guard', 'pebble-guard',
  'granite-golem',
  'stone-skin',
  'thorn-sprout', 'thorn-sprout',
  'briar-hound', 'briar-hound',
  'elderwood-treant',
  'spark-imp', 'spark-imp',
  'chain-lightning',
  'voltaic-surge',
];

export function buildDeck() {
  return DECK_LIST.map((id) => cardById(id));
}
