/**
 * lootCasketEngine.js — Business logic for the Loot Casket tool.
 *
 * Opens loot caskets via two methods:
 *   - Smash Open:  rolls D6 then subtracts 1 (minimum 1), so the effective
 *     range is shifted down, making better results harder to get.
 *   - Bypass Lock:  rolls D6 with no penalty.
 *
 * Results can include:
 *   - Direct income (roll Xd6 × multiplier credits)
 *   - A nested table roll (drugs, ammo, fancy loot, servo skulls)
 *   - A reroll instruction (the engine auto-loops until a non-reroll result)
 *
 * The nested-table system is recursive: a nested result can itself point to
 * another nested table (e.g. fancy loot → servo skull → specific skull type).
 *
 * Depends on: dice.js (Dice)
 */

import { Dice } from './dice.js';

export const LootCasketEngine = {
  lootData: null,

  /**
   * Store the full loot casket data (all tables).
   * @param {Object} data - Parsed lootCasket.json.
   */
  loadLootData(data) {
    this.lootData = data;
  },

  getTable(tableName) {
    if (!this.lootData || !this.lootData[tableName]) {
      console.error(`Table not found: ${tableName}`);
      return null;
    }
    return this.lootData[tableName];
  },

  /**
   * Roll the appropriate die for a table (D6, D3, D66, etc.).
   * @param {string} tableName
   * @returns {number|null}
   */
  rollDiceForTable(tableName) {
    const table = this.getTable(tableName);
    if (!table) return null;
    return Dice.rollFromSpec(table.sides).total;
  },

  findResult(tableName, roll) {
    const table = this.getTable(tableName);
    if (!table || !table.results) return null;
    return Dice.findInTable(table.results, roll);
  },

  /**
   * Process an income sub-rule attached to a loot result.
   * Rolls Xd(sides) × multiplier to determine credit amount.
   * @param {Object} incomeRule - { schema, sides, multiplier }
   * @returns {{ roll: number, amount: number, ... }|null}
   */
  processIncome(incomeRule) {
    if (!incomeRule) return null;

    const { schema, sides, multiplier } = incomeRule;
    
    // Roll the dice
    const roll = sides ? Dice.d(sides) : 0;
    const amount = roll * (multiplier || 1);

    return {
      schema,
      roll,
      sides,
      multiplier,
      amount
    };
  },

  /**
   * Interpret a random-effect value from a loot result.
   * Returns 'reroll', 'pending_roll' (awaiting user click), or 'unknown'.
   * @param {string|null} randomeffect
   * @returns {{ type: string, ... }|null}
   */
  processRandomEffect(randomeffect) {
    if (!randomeffect) return null;

    // Handle reroll case
    if (randomeffect === 'reroll') {
      return { type: 'reroll', message: 'Reroll this result' };
    }

    // Handle nested table rolls - don't auto-roll, return pending state for user to click
    if (this.lootData[randomeffect]) {
      return {
        type: 'pending_roll',
        tableName: randomeffect,
        tableData: this.getTable(randomeffect)
      };
    }

    return { type: 'unknown', value: randomeffect };
  },

  /**
   * Roll a nested table, automatically re-rolling on 'reroll' results
   * until a concrete result is found (with a 100-iteration safety limit).
   * @param {string} tableName - e.g. 'd66drugs', 'd6fancy'
   * @returns {Object} { tableName, roll, result, randomEffect, rerollHistory }
   */
  rollNestedTable(tableName) {
    const maxRerolls = 100; // Safety limit
    let attempts = 0;
    let rerollHistory = [];
    let roll, result, randomEffect;

    // Keep rolling until we get a non-reroll result
    do {
      roll = this.rollDiceForTable(tableName);
      if (roll === null) {
        return {
          error: `Failed to roll ${tableName}. Data not loaded.`
        };
      }

      result = this.findResult(tableName, roll);
      if (!result) {
        return {
          roll,
          error: `No result found for roll ${roll} in table ${tableName}.`
        };
      }

      // Process nested random effects
      randomEffect = this.processRandomEffect(result.randomeffect);

      // If it's a reroll, track it and loop again
      if (randomEffect && randomEffect.type === 'reroll') {
        rerollHistory.push({
          roll: roll,
          name: result.name
        });
        attempts++;

        // Safety check to prevent infinite loops
        if (attempts >= maxRerolls) {
          return {
            error: `Too many rerolls (${maxRerolls}) for ${tableName}. Stopping.`
          };
        }
      }
    } while (randomEffect && randomEffect.type === 'reroll');

    return {
      tableName,
      roll,
      result,
      randomEffect,
      rerollHistory: rerollHistory.length > 0 ? rerollHistory : null
    };
  },

  /**
   * Smash open a loot casket (D6 − 1, minimum 1).
   * The reduction makes higher-value results less likely.
   * @returns {Object} Loot result with rawRoll, adjusted roll, and contents.
   */
  smashOpenLootCasket() {
    const rawRoll = this.rollDiceForTable('loot_casket_roll');
    if (rawRoll === null) {
      return { error: 'Failed to roll. Data not loaded.' };
    }
    const roll = Math.max(1, rawRoll - 1);
    const result = this.findResult('loot_casket_roll', roll);
    if (!result) {
      return { rawRoll, roll, error: 'No result found for this roll.' };
    }
    const incomeResult = result.income ? this.processIncome(result.income) : null;
    const randomEffect = this.processRandomEffect(result.randomeffect);
    return { rawRoll, roll, result, incomeResult, randomEffect };
  },

  /**
   * Open a loot casket by bypassing the lock (D6, no penalty).
   * @returns {Object} Loot result with roll and contents.
   */
  openLootCasketBypass() {
    const roll = this.rollDiceForTable('loot_casket_roll');
    if (roll === null) {
      return {
        error: 'Failed to roll. Data not loaded.'
      };
    }

    const result = this.findResult('loot_casket_roll', roll);
    if (!result) {
      return {
        roll,
        error: 'No result found for this roll.'
      };
    }

    // Process income if present
    const incomeResult = result.income ? this.processIncome(result.income) : null;

    // Process random effects if present
    const randomEffect = this.processRandomEffect(result.randomeffect);

    return {
      roll,
      result,
      incomeResult,
      randomEffect
    };
  },

  // Test with a specific roll value
  testRoll(rollValue) {
    const roll = parseInt(rollValue);
    if (isNaN(roll)) {
      console.error(`Invalid roll value: ${rollValue}`);
      return null;
    }

    const result = this.findResult('loot_casket_roll', roll);
    if (!result) {
      return {
        roll,
        error: 'No result found for this roll.'
      };
    }

    const incomeResult = result.income ? this.processIncome(result.income) : null;
    const randomEffect = this.processRandomEffect(result.randomeffect);

    return {
      roll,
      result,
      incomeResult,
      randomEffect
    };
  },

  // Test a nested table directly
  testNestedTable(tableName, rollValue = null) {
    if (!this.getTable(tableName)) {
      console.error(`Table not found: ${tableName}`);
      return { error: `Table not found: ${tableName}` };
    }

    // If rollValue specified, test that specific roll (no auto-reroll)
    if (rollValue !== null) {
      const roll = parseInt(rollValue);
      if (isNaN(roll)) {
        console.error(`Invalid roll value: ${rollValue}`);
        return null;
      }

      const result = this.findResult(tableName, roll);
      if (!result) {
        return {
          roll,
          error: `No result found for roll ${roll} in table ${tableName}.`
        };
      }

      const randomEffect = this.processRandomEffect(result.randomeffect);

      return {
        tableName,
        roll,
        result,
        randomEffect
      };
    }

    // Otherwise use the automatic reroll logic
    return this.rollNestedTable(tableName);
  },

  // Resolve a specific table (useful for testing or specific UI interactions)
  rollTable(tableName) {
    const roll = this.rollDiceForTable(tableName);
    if (roll === null) {
      return {
        error: `Failed to roll ${tableName}. Data not loaded.`
      };
    }

    const result = this.findResult(tableName, roll);
    if (!result) {
      return {
        roll,
        error: `No result found for roll ${roll} in table ${tableName}.`
      };
    }

    // Process random effects if present
    const randomEffect = this.processRandomEffect(result.randomeffect);

    return {
      tableName,
      roll,
      result,
      randomEffect
    };
  }
};
