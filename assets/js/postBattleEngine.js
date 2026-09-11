/**
 * postBattleEngine.js — Business logic for the Post-Battle sequence.
 *
 * Provides two simple dice tests:
 *   - Succumb Test:  D6, on 1–2 the fighter suffers a Lasting Injury.
 *   - Escape Test:   D6 + modifier.  Passes on a natural 6 or total ≥ 4.
 *     Modifiers: Draw (−1), Lost (−2), Webbed (−2), Skinblade (+2).
 *
 * Lasting injury resolution, Rogue Doc treatment, and mutation tests
 * reuse LastingInjuriesEngine rather than duplicating logic here.
 *
 * Depends on: dice.js (Dice)
 */

import { Dice } from './dice.js';

export const PostBattleEngine = {

  /**
   * Roll 1D6. On a 1 or 2 the fighter suffers a Lasting Injury.
   * @returns {{ roll: number, succumbed: boolean }}
   */
  rollSuccumb() {
    const roll = Dice.d(6);
    return { roll, succumbed: roll <= 2 };
  },

  /**
   * Roll 2D6 + modifier for the Trading Post Rarity / Illegal item level.
   * To apply a Whisper Merchant after the roll, call applyWhisperMerchant(result).
   * @param {number} modifier - Sum of all applicable modifiers.
   * @returns {{ die1: number, die2: number, effectiveDie1: number, effectiveDie2: number,
   *             modifier: number, diceTotal: number, total: number, whisperMerchant: boolean }}
   */
  rollRarityLevel(modifier) {
    const die1 = Dice.d6();
    const die2 = Dice.d6();
    const diceTotal = die1 + die2;
    const total = diceTotal + modifier;
    return { die1, die2, effectiveDie1: die1, effectiveDie2: die2, modifier, diceTotal, total, whisperMerchant: false };
  },

  /**
   * Apply the Whisper Merchant rule to an existing rarity roll, replacing the
   * lower die with 6. Call after rollRarityLevel when the player reveals a
   * Whisper Merchant.
   * @param {{ die1: number, die2: number, modifier: number }} prevResult
   */
  applyWhisperMerchant(prevResult) {
    const { die1, die2, modifier } = prevResult;
    const effectiveDie1 = die1 <= die2 ? 6 : die1;
    const effectiveDie2 = die1 <= die2 ? die2 : 6;
    const diceTotal = effectiveDie1 + effectiveDie2;
    const total = diceTotal + modifier;
    return { ...prevResult, effectiveDie1, effectiveDie2, diceTotal, total, whisperMerchant: true };
  },

  /**
   * Roll an escape test for a captured fighter.
   * @param {number} modifier - Sum of checked condition modifiers.
   * @returns {{ roll: number, modifier: number, total: number, natural6: boolean, escaped: boolean }}
   */
  rollEscape(modifier) {
    const roll = Dice.d(6);
    const total = roll + modifier;
    const natural6 = roll === 6;
    const escaped = natural6 || total >= 4;
    return { roll, modifier, total, natural6, escaped };
  },

};
