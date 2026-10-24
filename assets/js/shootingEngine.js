/**
 * shootingEngine.js — Business logic for the Shooting Sequence tool.
 *
 * Implements the four-step ranged-attack sequence (Declare the Shot,
 * Measure Range, Make the Hit Roll, Resolve Hits), plus the supporting
 * sub-systems: Rapid Fire/Firepower dice, Ammo checks, Stray Shots, and
 * Cool (Nerve) checks.
 *
 * Depends on: dice.js (Dice)
 */

import { Dice } from './dice.js';

/**
 * Parse a "X+" threshold string (or plain number) into its numeric
 * threshold. Returns null for missing/"-" values.
 * @param {string|number|null} value
 * @returns {number|null}
 */
function parseThreshold(value) {
  if (value === null || value === undefined || value === '-' || value === '') return null;
  if (typeof value === 'number') return value;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

/**
 * Extract the X value from a "Rapid Fire (X)" trait string.
 * @param {string[]} traits
 * @returns {number|null}
 */
function parseRapidFireX(traits) {
  const trait = (traits || []).find(t => t.startsWith('Rapid Fire'));
  if (!trait) return null;
  const match = trait.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 1;
}

/**
 * Extract the X+ threshold from an "Ammo(X+)" trait string.
 * @param {string[]} traits
 * @returns {number|null}
 */
function parseAmmoThreshold(traits) {
  const trait = (traits || []).find(t => t.startsWith('Ammo'));
  if (!trait) return null;
  const match = trait.match(/\(([^)]+)\)/);
  return match ? parseThreshold(match[1]) : null;
}

export const ShootingEngine = {
  weaponData: null,

  /** @param {Object} data - Parsed weaponProfiles.json. */
  loadWeapons(data) {
    this.weaponData = data;
  },

  /**
   * Flatten the flat `weapons` list into a list of selectable options.
   * @returns {{ id: string, category: string, profile: Object }[]}
   */
  getWeaponOptions() {
    if (!this.weaponData || !Array.isArray(this.weaponData.weapons)) return [];
    return this.weaponData.weapons.map(profile => ({ id: profile.name, category: profile.category, profile }));
  },

  /** @param {string} id - Weapon name, used as its unique identifier. */
  getProfile(id) {
    return (this.weaponData?.weapons || []).find(w => w.name === id) || null;
  },

  parseThreshold,
  parseRapidFireX,
  parseAmmoThreshold,

  /**
   * Determine the range band for a shot and its resulting Cover modifier
   * (Save roll). Template weapons (the "Template" trait) are always
   * Template band regardless of the selected band. This schema has no
   * Accuracy characteristic, so there is no Hit roll modifier by range.
   * @param {Object} profile - Weapon profile.
   * @param {'short'|'long'} band - Range band selected by the player.
   * @returns {{ band: 'template'|'short'|'long', inRange: boolean, coverMod: number }}
   */
  computeRangeBand(profile, band) {
    if ((profile.traits || []).includes('Template')) {
      return { band: 'template', inRange: true, coverMod: 1 };
    }
    if (band === 'long') {
      return { band: 'long', inRange: true, coverMod: 2 };
    }
    return { band: 'short', inRange: true, coverMod: 1 };
  },

  /**
   * Make a Hit roll. A natural 1 always misses and a natural 6 always
   * hits, regardless of modifiers. An out-of-range shot auto-misses
   * without rolling.
   * @param {{ bsTarget: number, inRange: boolean }} params
   * @returns {{ roll: number|null, hit: boolean, natural1: boolean, natural6: boolean, autoMiss: boolean }}
   */
  rollHit({ bsTarget, inRange }) {
    if (!inRange) {
      return { roll: null, hit: false, natural1: false, natural6: false, autoMiss: true };
    }
    const roll = Dice.d6();
    if (roll === 1) return { roll, hit: false, natural1: true, natural6: false, autoMiss: false };
    if (roll === 6) return { roll, hit: true, natural1: false, natural6: true, autoMiss: false };
    return { roll, hit: roll >= bsTarget, natural1: false, natural6: false, autoMiss: false };
  },

  /**
   * Roll one or more Firepower dice for a Rapid Fire (X) weapon.
   * @param {number} count - Number of Firepower dice to roll (1 to X).
   * @returns {{ rolls: Object[], totalShots: number, ammoSymbols: number }}
   */
  rollFirepower(count) {
    const rolls = Dice.rollMany(count, Dice.d6_firepower);
    const totalShots = rolls.reduce((sum, r) => sum + r.shots, 0);
    const ammoSymbols = rolls.filter(r => r.jam).length;
    return { rolls, totalShots, ammoSymbols };
  },

  /**
   * Resolve an Ammo check for a weapon after it has been fired.
   * - Plentiful weapons always pass automatically.
   * - Rapid Fire weapons use the ammo-symbol count from their Firepower
   *   dice (an "Ammo(X+)" trait adds one automatic symbol).
   * - Other weapons with an "Ammo(X+)" trait roll a plain D6 vs threshold.
   * - Weapons with neither trait never need an Ammo check.
   * @param {Object} profile - Weapon profile.
   * @param {{ ammoSymbols: number }|null} [firepowerResult] - Result from rollFirepower, if applicable.
   * @returns {{ checked: boolean, outOfAmmo: boolean, jammed: boolean, roll?: number, threshold?: number, symbols?: number, note?: string }}
   */
  resolveAmmo(profile, firepowerResult = null) {
    const traits = profile.traits || [];
    if (traits.includes('Plentiful')) {
      return { checked: false, outOfAmmo: false, jammed: false, note: 'Plentiful — Ammo check automatically passed.' };
    }

    const hasRapidFire = traits.some(t => t.startsWith('Rapid Fire'));
    const ammoThreshold = parseAmmoThreshold(traits);
    const hasAmmoTrait = ammoThreshold !== null;

    if (hasRapidFire && firepowerResult) {
      const symbols = firepowerResult.ammoSymbols + (hasAmmoTrait ? 1 : 0);
      return { checked: true, symbols, outOfAmmo: symbols >= 1, jammed: symbols >= 2 };
    }

    if (hasAmmoTrait) {
      const roll = Dice.d6();
      return { checked: true, roll, threshold: ammoThreshold, outOfAmmo: roll < ammoThreshold, jammed: false };
    }

    return { checked: false, outOfAmmo: false, jammed: false };
  },

  /**
   * Determine the Wound roll threshold for a given Strength vs Toughness.
   * @param {number} str
   * @param {number} tough
   * @returns {number} D6 threshold required to Wound.
   */
  woundThreshold(str, tough) {
    if (str >= tough * 2) return 2;
    if (str > tough) return 3;
    if (str === tough) return 4;
    if (str * 2 <= tough) return 6;
    return 5;
  },

  /**
   * Make a Wound roll.
   * @param {number} str - Weapon Strength.
   * @param {number} tough - Target Toughness.
   * @returns {{ roll: number, threshold: number, wounded: boolean }}
   */
  rollWound(str, tough) {
    const threshold = this.woundThreshold(str, tough);
    const roll = Dice.d6();
    return { roll, threshold, wounded: roll >= threshold };
  },

  /**
   * Make a Save roll. A natural 1 or 2 is always a failure regardless of
   * modifiers. Invulnerable saves ignore AP and Cover modifiers. `noSave`
   * forces an automatic failure (e.g. the Gas trait).
   * @param {{ saveTarget: number|null, ap: number, coverMod: number, invulnerable: boolean, noSave: boolean }} params
   * @returns {{ roll: number|null, total: number|null, saveTarget: number|null, saved: boolean, autoFail: boolean, noSave: boolean }}
   */
  rollSave({ saveTarget, ap, coverMod, invulnerable, noSave }) {
    if (noSave) {
      return { roll: null, total: null, saveTarget, saved: false, autoFail: false, noSave: true };
    }
    if (saveTarget === null || saveTarget === undefined) {
      return { roll: null, total: null, saveTarget: null, saved: false, autoFail: false, noSave: false };
    }
    const roll = Dice.d6();
    if (roll <= 2) {
      return { roll, total: roll, saveTarget, saved: false, autoFail: true, noSave: false };
    }
    const total = invulnerable ? roll : roll + (ap || 0) + (coverMod || 0);
    return { roll, total, saveTarget, saved: total >= saveTarget, autoFail: false, noSave: false };
  },

  /**
   * Roll a number of Injury dice equal to a weapon's Lethality, mapping
   * each D6 result to the ruleset's Injured/Serious Injury/Out of Action
   * wording (1–2 Injured, 3–5 Serious Injury, 6 Out of Action).
   * @param {number} lethality
   * @returns {{ roll: number, label: string }[]}
   */
  rollInjuryDice(lethality) {
    const labelMap = { 'Flesh wound': 'Injured', 'Serious injury': 'Serious Injury', 'Out of action': 'Out of Action' };
    return Dice.rollMany(lethality, Dice.d6_injury).map(r => ({ roll: r.roll, label: labelMap[r.result] || r.result }));
  },

  /**
   * Arbitrator's Toolkit: Stray Shots. Roll a D6 for a model at risk of
   * being caught in the line of fire; 1–3 it is Hit, 4–6 it is missed.
   * @returns {{ roll: number, hit: boolean }}
   */
  rollStrayShot() {
    const roll = Dice.d6();
    return { roll, hit: roll <= 3 };
  },

  /**
   * Roll a generic Cool check (used for Nerve checks and the Arbitrator's
   * Toolkit Target Priority rule).
   * @param {number} cool - Cool characteristic threshold (e.g. 6 for "6+").
   * @returns {{ roll: number, threshold: number, passed: boolean }}
   */
  rollCoolCheck(cool) {
    const roll = Dice.d6();
    return { roll, threshold: cool, passed: roll >= cool };
  },
};
