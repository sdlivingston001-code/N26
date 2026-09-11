/**
 * lastingInjuriesEngine.js — Business logic for lasting injuries, rogue-doc
 * treatment, and chaos-gang mutation testing.
 *
 * Supports five injury modes loaded from lastingInjuries.yml:
 *   - standard_lasting_injuries       — D66 house-rules table
 *   - standard_lasting_injuries_core  — D66 core-rules table
 *   - ironman_lasting_injuries        — D6 simplified table
 *   - spyrer_hunting_rig_glitches     — D66 Spyrer equipment table
 *   - spyrer_hunting_rig_glitches_core
 *
 * Key behaviours:
 *   - "Multiple Injuries" results recursively roll D3 additional injuries
 *     (with safe-guards against infinite loops and excluded result IDs).
 *   - Rogue Doc treatment comes in two variants: Trading Post (with a
 *     randomly-rolled credit cost) and Hanger-on (free but less reliable).
 *   - "Stabilised" treatment outcomes roll a lasting injury from the
 *     standard table, excluding certain results.
 *   - Chaos gangs can convert eligible injuries into mutations via a D6
 *     test with optional modifiers.
 *
 * Depends on: dice.js (Dice)
 */

import { Dice } from './dice.js';

export const LastingInjuriesEngine = {
  injuriesData: null,
  currentMode: 'standard_lasting_injuries',

  /**
   * Store the full injury data structure (all modes + rogue doc + mutations).
   * @param {Object} injuriesData - Parsed lastingInjuries.json.
   */
  loadInjuries(injuriesData) {
    this.injuriesData = injuriesData;
  },

  /**
   * Switch to a named injury mode.
   * @param {string} mode - Key matching a top-level entry in the data.
   */
  setMode(mode) {
    if (this.injuriesData && this.injuriesData[mode]) {
      this.currentMode = mode;
    } else {
      console.error(`Invalid mode: ${mode}`);
    }
  },

  getCurrentModeData() {
    if (!this.injuriesData || !this.injuriesData[this.currentMode]) {
      return null;
    }
    return this.injuriesData[this.currentMode];
  },

  /**
   * Roll dice and return the total for the current mode.
   * @returns {number|null}
   */
  rollDice() {
    const modeData = this.getCurrentModeData();
    if (!modeData) return null;
    return Dice.rollFromSpec(modeData.sides).total;
  },

  findInjury(roll) {
    const modeData = this.getCurrentModeData();
    if (!modeData || !modeData.results) return null;
    return Dice.findInTable(modeData.results, roll);
  },

  /**
   * Resolve D3 additional injuries, excluding results that would
   * cause infinite recursion (captured, multiple_injuries, etc.).
   * @param {number} count - How many valid injuries to generate.
   * @returns {Object[]} Array of { roll, injury, randomRoll, additionalInjuries }.
   */
  resolveMultipleInjuries(count) {
    const excludedIds = ['captured', 'multiple_injuries', 'memorable_death', 'critical_injury', 'out_cold'];
    const injuries = [];
    const maxAttempts = 100; // Prevent infinite loops to generate required number of eligible injuries 
    let attempts = 0;

    while (injuries.length < count && attempts < maxAttempts) {
      attempts++;
      const roll = this.rollDice();
      const injury = this.findInjury(roll);
      
      if (injury && !excludedIds.includes(injury.id)) {
        const { randomRoll, additionalInjuries } = this.processRandomEffects(injury);
        injuries.push({
          roll,
          injury,
          randomRoll,
          additionalInjuries
        });
      }
    }

    return injuries;
  },

  resolveMultipleGlitches(count) {
    const excludedIds = ['multiple_glitches'];
    const glitches = [];
    const maxAttempts = 100;
    let attempts = 0;

    while (glitches.length < count && attempts < maxAttempts) {
      attempts++;
      const roll = this.rollDice();
      const injury = this.findInjury(roll);

      if (injury && !excludedIds.includes(injury.id)) {
        const { randomRoll, additionalInjuries } = this.processRandomEffects(injury);
        glitches.push({
          roll,
          injury,
          randomRoll,
          additionalInjuries
        });
      }
    }

    return glitches;
  },

  /**
   * Process random sub-effects attached to an injury (e.g. D3 XP gain,
   * D3 multiple injuries, D3 multiple glitches).
   * @param {Object} injury
   * @returns {{ randomRoll: Object|null, additionalInjuries: Object[]|null }}
   */
  processRandomEffects(injury) {
    if (!injury || !injury.randomeffect) {
      return { randomRoll: null, additionalInjuries: null };
    }

    let randomRoll = null;
    let additionalInjuries = null;

    if (injury.randomeffect === 'd3xpgain') {
      randomRoll = { type: 'd3', value: Dice.d(3) };
    } else if (injury.randomeffect === 'd3multipleinjuries') {
      const count = Dice.d(3);
      randomRoll = { type: 'd3', value: count };
      additionalInjuries = this.resolveMultipleInjuries(count);
    } else if (injury.randomeffect === 'd3multipleglitches') {
      const count = Dice.d(3);
      randomRoll = { type: 'd3', value: count };
      additionalInjuries = this.resolveMultipleGlitches(count);
    }

    return { randomRoll, additionalInjuries };
  },

  /**
   * Roll a D6 and resolve a lasting injury from the current mode.
   * @returns {Object} { roll, injury, randomRoll, additionalInjuries }
   */
  resolveInjury() {
    const roll = this.rollDice();
    return this.processInjury(roll);
  },

  // Test with a specific roll value
  testRoll(rollValue) {
    const roll = parseInt(rollValue);
    if (isNaN(roll)) {
      console.error(`Invalid roll value: ${rollValue}`);
      return null;
    }
    return this.processInjury(roll);
  },

  // Process an injury result (used by both resolveInjury and testRoll)
  processInjury(roll) {
    if (roll === null) {
      return {
        roll: 'Error',
        injury: {
          name: 'Error',
          fixedeffect: 'Failed to roll dice. Data not loaded.',
          randomeffect: null
        },
        randomRoll: null,
        additionalInjuries: null
      };
    }

    const injury = this.findInjury(roll);
    const { randomRoll, additionalInjuries } = this.processRandomEffects(injury);
    
    return {
      roll,
      injury: injury || {
        name: 'Unknown',
        fixedeffect: 'No injury found for this roll.',
        randomeffect: null
      },
      randomRoll,
      additionalInjuries
    };
  },

  /**
   * Roll for a stabilised injury (Trading Post Rogue Doc outcome).
   * Uses the standard_lasting_injuries table, excluding captured /
   * critical_injury / memorable_death so the result is always a
   * survivable lasting injury.
   * @returns {{ roll: number, injury: Object }|null}
   */
  resolveStabilisedInjury(stabilisedTable = 'standard_lasting_injuries') {
    const excludedIds = ['captured', 'critical_injury', 'memorable_death'];
    const maxAttempts = 100;
    let attempts = 0;

    // Temporarily switch to the requested table
    const originalMode = this.currentMode;
    this.currentMode = stabilisedTable;

    while (attempts < maxAttempts) {
      attempts++;
      const roll = Dice.d66();
      const injury = this.findInjury(roll);
      
      if (injury && !excludedIds.includes(injury.id)) {
        // Restore original mode
        this.currentMode = originalMode;
        return {
          roll,
          injury
        };
      }
    }

    // Restore original mode
    this.currentMode = originalMode;
    return null;
  },

  /**
   * Resolve a Rogue Doc treatment attempt.
   * @param {'trading_post_rogue_doc'|'hanger_on_rogue_doc'} mode
   * @param {number|null} [precalculatedCost] - Pass a pre-rolled cost to avoid
   *   re-rolling (UI shows cost first, then resolves if player proceeds).
   * @returns {{ cost: number|null, roll: number, outcome: Object, stabilisedInjury: Object|null }}
   */
  resolveRogueDoc(mode, precalculatedCost = null) {
    const modeData = this.injuriesData[mode];
    if (!modeData) {
      return {
        cost: null,
        roll: 'Error',
        outcome: {
          name: 'Error',
          fixedeffect: 'Invalid rogue doc mode',
          colour: 'grey'
        },
        stabilisedInjury: null
      };
    }

    // Use precalculated cost if provided, otherwise calculate
    let cost = precalculatedCost;
    if (cost === null && modeData.cost) {
      cost = this.calculateRogueDocCost(mode).total;
    }

    // Roll for treatment result
    const roll = Dice.d(modeData.sides);
    const outcome = this.findOutcome(roll, modeData.results);

    // If stabilised, roll an injury from the table declared in the rogue doc mode data
    const stabilisedTable = modeData.stabilised_injury_table || 'standard_lasting_injuries';
    let stabilisedInjury = null;
    if (outcome && outcome.randomeffect === 'stabilisedinjury') {
      stabilisedInjury = this.resolveStabilisedInjury(stabilisedTable);
      
      if (stabilisedInjury) {
        const { randomRoll, additionalInjuries } = this.processRandomEffects(stabilisedInjury.injury);
        stabilisedInjury.randomRoll = randomRoll;
        stabilisedInjury.additionalInjuries = additionalInjuries;
      }
    }

    return {
      cost,
      roll,
      outcome: outcome || {
        name: 'Unknown',
        fixedeffect: 'No outcome found for this roll.',
        colour: 'grey'
      },
      stabilisedInjury
    };
  },

  /**
   * Calculate the credit cost for Trading Post Rogue Doc treatment.
   * Cost formula: roll `count` dice of `sides` sides, multiply total, add flat amount.
   * @param {string} mode
   * @returns {number|null}
   */
  calculateRogueDocCost(mode, gangId = null) {
    if (!this.injuriesData) {
      console.error('Injuries data not loaded');
      return null;
    }
    const modeData = this.injuriesData[mode];
    if (!modeData || !modeData.cost) {
      console.error(`Mode data not found for: ${mode}`);
      return null;
    }

    const costConfig = (gangId && modeData.gangCostOverrides?.[gangId]) || modeData.cost;
    const rolls = [];
    for (let i = 0; i < costConfig.count; i++) {
      rolls.push(Dice.d(costConfig.sides));
    }
    const total = (rolls.reduce((a, b) => a + b, 0) * costConfig.multiplier) + costConfig.addition;
    return { total, rolls, costConfig };
  },

  findOutcome(roll, results) {
    return Dice.findInTable(results, roll);
  },

  /**
   * Check if an injury ID can be converted to a chaos mutation.
   * @param {string} injuryId
   * @returns {boolean}
   */
  isMutationEligible(injuryId) {
    const mutData = this.injuriesData?.mutation_exceptions;
    if (!mutData) return false;
    return !!mutData.mutations[injuryId];
  },

  /**
   * Roll a D6 mutation test with optional modifier checkboxes.
   * Succeeds on total >= threshold (default 6+).
   * @param {string[]} modifierIds - IDs of checked modifier checkboxes.
   * @returns {{ roll: number, bonus: number, total: number, success: boolean }|null}
   */
  rollMutationTest(modifierIds) {
    const mutData = this.injuriesData?.mutation_exceptions;
    if (!mutData) return null;
    const roll = Dice.d(6);
    const bonus = modifierIds.reduce((sum, id) => {
      const mod = mutData.test.modifiers.find(m => m.id === id);
      return sum + (mod ? mod.value : 0);
    }, 0);
    const total = roll + bonus;
    return {
      roll,
      bonus,
      total,
      success: total >= mutData.test.threshold
    };
  },

  getMutation(injuryId) {
    const mutData = this.injuriesData?.mutation_exceptions;
    if (!mutData) return null;
    return mutData.mutations[injuryId] || null;
  },

  getMutationModifiers() {
    return this.injuriesData?.mutation_exceptions?.test?.modifiers || [];
  },

  isCyberteknikaEligible(injuryId) {
    const cybData = this.injuriesData?.cyberteknika_exceptions;
    if (!cybData) return false;
    return (cybData.included_injuries || []).includes(injuryId);
  },

  rollCyberteknikaTest(modifierIds = []) {
    const cybData = this.injuriesData?.cyberteknika_exceptions;
    if (!cybData) return null;
    const roll = Dice.d(6);
    const bonus = modifierIds.reduce((sum, id) => {
      const mod = (cybData.test.modifiers || []).find(m => m.id === id);
      return sum + (mod ? mod.value : 0);
    }, 0);
    const total = roll + bonus;
    return {
      roll,
      bonus,
      total,
      success: total >= cybData.test.threshold
    };
  },

  getCyberteknikaModifiers() {
    return this.injuriesData?.cyberteknika_exceptions?.test?.modifiers || [];
  }
};
