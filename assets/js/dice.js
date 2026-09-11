/**
 * dice.js — Core dice-rolling and card-drawing utilities.
 *
 * Provides standard tabletop dice (d6, d66, dN), Necromunda-specific
 * firepower and injury dice, batch rolling, card draws from a 54-card
 * deck, and the shared `isInRange` helper used by every engine to
 * match a roll against a YAML values array, and the `rollFromSpec` /
 * `findInTable` helpers that eliminate boilerplate in every engine.
 *
 * No external dependencies.
 */

export const Dice = {

  // ──────────────────────────────────────────────
  //  Basic dice
  // ──────────────────────────────────────────────

  /** @returns {number} Random integer 1–6. */
  d6() {
    return Math.floor(Math.random() * 6) + 1;
  },

  /**
   * Roll a die with `n` sides.
   * @param {number} n - Number of sides (e.g. 3, 6, 8, 66).
   * @returns {number} Random integer 1–n.
   */
  d(n) {
    return Math.floor(Math.random() * n) + 1;
  },

  /**
   * Necromunda-style D66 roll — two separate D6 results combined as
   * tens + units (range 11–66, never producing digits > 6).
   * This is NOT the same as rolling a 66-sided die.
   * @returns {number} A value like 11, 12, … 16, 21, … 66.
   */
  d66() {
    return this.d6() * 10 + this.d6();
  },

  // ──────────────────────────────────────────────
  //  Necromunda-specific dice
  // ──────────────────────────────────────────────

  /**
   * Firepower dice — used for rapid-fire weapons.
   * Maps a D6 result to number of hits and whether an ammo check
   * is required (on a roll of 6).
   * @returns {{ roll: number, shots: number, jam: boolean, label: string }}
   */
  d6_firepower() {
    const table = {
      1: { shots: 1, jam: false, label: "One hit" },
      2: { shots: 1, jam: false, label: "One hit" },
      3: { shots: 2, jam: false, label: "Two hits" },
      4: { shots: 2, jam: false, label: "Two hits" },
      5: { shots: 3, jam: false, label: "Three hits" },
      6: { shots: 1, jam: true,  label: "One hit and Ammo check" }
    };

    const roll = this.d6();
    return { roll, ...table[roll] };
  },

  /**
   * Injury dice — maps a D6 result to Flesh Wound / Serious Injury /
   * Out of Action.
   * @returns {{ roll: number, result: string }}
   */
  d6_injury() {
    const table = {
      1: { result: "Flesh wound" },
      2: { result: "Flesh wound" },
      3: { result: "Serious injury" },
      4: { result: "Serious injury" },
      5: { result: "Serious injury" },
      6: { result: "Out of action" }
    };

    const roll = this.d6();
    return { roll, ...table[roll] };
  },

  // ──────────────────────────────────────────────
  //  Batch rolling & analysis helpers
  // ──────────────────────────────────────────────

  /**
   * Roll `n` dice and return the results as an array.
   *
   * @param {number}   n         - How many dice to roll.
   * @param {Function} [diceFunc=null] - Custom dice function (e.g. `Dice.d6_firepower`).
   *   When null, rolls a plain `d(sides)`.
   * @param {number}   [sides=6] - Sides per die (only used when `diceFunc` is null).
   * @returns {Array} Array of individual roll results.
   *
   * @example Dice.rollMany(3);                    // 3d6
   * @example Dice.rollMany(2, null, 8);           // 2d8
   * @example Dice.rollMany(3, Dice.d6_firepower); // 3 firepower dice
   */
  rollMany(n, diceFunc = null, sides = 6) {
    const rolls = [];
    for (let i = 0; i < n; i++) {
      if (diceFunc) {
        rolls.push(diceFunc.call(this));
      } else {
        rolls.push(this.d(sides));
      }
    }
    return rolls;
  },

  /**
   * Count how many entries in `rolls` equal `value`.
   * @param {number[]} rolls
   * @param {number}   value
   * @returns {number}
   */
  countValue(rolls, value) {
    return rolls.filter(roll => roll === value).length;
  },

  /**
   * Sum an array of numeric rolls.
   * @param {number[]} rolls
   * @returns {number}
   * @example Dice.sum(Dice.rollMany(2, null, 6)) // 2D6 total
   */
  sum(rolls) {
    return rolls.reduce((total, r) => total + r, 0);
  },

  /**
   * Check if any value appears more than once in `rolls`.
   * Used by the territory duplicate-event trigger.
   * @param {number[]} rolls
   * @returns {boolean}
   */
  hasDuplicates(rolls) {
    const seen = new Set();
    for (const roll of rolls) {
      if (seen.has(roll)) {
        return true;
      }
      seen.add(roll);
    }
    return false;
  },

  // ──────────────────────────────────────────────
  //  Table-lookup helper (shared across all engines)
  // ──────────────────────────────────────────────

  /**
   * Check whether `roll` falls inside a YAML `values` array.
   *
   * The `values` array can contain:
   * - plain numbers:   `[1]`, `[11, 12, 13]`
   * - range strings:   `["2-3"]`, `["14-66"]`
   * - numeric strings: `["5"]`
   *
   * This centralises the range-matching logic formerly duplicated in
   * every engine (xpTablesEngine, lastingInjuriesEngine, lootCasketEngine,
   * scenario_MeatForTheGrinderEngine).
   *
   * @param {number}              roll   - The rolled value to test.
   * @param {(number|string)[]}   values - Accepted values / ranges from data YAML.
   * @returns {boolean} True if the roll matches any entry.
   */
  isInRange(roll, values) {
    for (const value of values) {
      if (typeof value === 'number') {
        if (roll === value) return true;
      } else if (typeof value === 'string' && value.includes('-')) {
        const [min, max] = value.split('-').map(Number);
        if (roll >= min && roll <= max) return true;
      } else {
        const num = Number(value);
        if (!isNaN(num) && roll === num) return true;
      }
    }
    return false;
  },

  // ──────────────────────────────────────────────
  //  Composite helpers (shared across all engines)
  // ──────────────────────────────────────────────

  /**
   * Roll dice from a YAML-style data spec (sides string/number, optional count).
   * Handles the special 'd66' case automatically.
   *
   * @param {string|number} sides - Number of sides, or 'd66' for Necromunda D66.
   * @param {number} [count=1]    - How many dice to roll (ignored for d66).
   * @returns {{ rolls: number[]|null, total: number }}
   */
  rollFromSpec(sides, count = 1) {
    if (sides === 'd66') {
      return { rolls: null, total: this.d66() };
    }
    const n = typeof sides === 'number' ? sides : parseInt(sides);
    if (count <= 1) {
      const total = this.d(n);
      return { rolls: [total], total };
    }
    const rolls = this.rollMany(count, null, n);
    return { rolls, total: this.sum(rolls) };
  },

  /**
   * Find the first matching result in a table's results object by roll value.
   * Converts an `{ id: data }` results object into an array, then checks
   * `isInRange` on each entry.
   *
   * @param {Object} results - Results object from data YAML (keyed by id).
   * @param {number} roll    - The rolled value to match.
   * @returns {Object|null} The matched entry (with `id` attached), or null.
   */
  findInTable(results, roll) {
    if (!results) return null;
    for (const [id, data] of Object.entries(results)) {
      if (this.isInRange(roll, data.values)) {
        return { id, ...data };
      }
    }
    return null;
  },

  // ──────────────────────────────────────────────
  //  Card draws (54-card deck)
  // ──────────────────────────────────────────────

  /**
   * Draw `count` random cards from a standard 54-card deck
   * (52 suited cards + 2 jokers).
   *
   * Each card object contains:
   * - `rank`    – "A", "2"–"10", "J", "Q", "K", or "Joker"
   * - `suit`    – "♠", "♥", "♦", "♣", or "🃏"
   * - `value`   – numeric value (Ace = 14, face = 11–13, Joker = 0)
   * - `display` – HTML string with coloured suit symbol
   *
   * Set `Dice.forceJoker = true` before calling to always draw jokers
   * (useful for testing the Gambling Den territory event).
   *
   * @param {number} [count=1]
   * @returns {Object[]} Array of card objects.
   */
  drawCards(count = 1) {
    const suits  = ['♠', '♥', '♦', '♣'];
    const ranks  = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const values = [14, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const suitColors = { '♠': 'black', '♥': 'red', '♦': 'red', '♣': 'black' };

    // Build full 54-card deck
    const fullDeck = [];
    for (const suit of suits) {
      for (let i = 0; i < ranks.length; i++) {
        const color = suitColors[suit];
        fullDeck.push({
          rank: ranks[i],
          suit: suit,
          value: values[i],
          display: `${ranks[i]}<span style="color: ${color};">${suit}</span>`
        });
      }
    }

    // Two jokers (value 0)
    const joker = {
      rank: 'Joker', suit: '🃏', value: 0,
      display: 'a <span style="color: #9c27b0; font-weight: bold;">🎭 JOKER</span>'
    };
    fullDeck.push(joker);
    fullDeck.push({ ...joker });

    // Testing override
    if (this.forceJoker) {
      return Array(count).fill(joker);
    }

    // Draw random cards (with replacement — deck is conceptually reshuffled)
    const cards = [];
    for (let i = 0; i < count; i++) {
      const randomIndex = Math.floor(Math.random() * fullDeck.length);
      cards.push(fullDeck[randomIndex]);
    }
    return cards;
  }
};