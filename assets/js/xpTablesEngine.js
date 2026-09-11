/**
 * xpTablesEngine.js — Business logic for fighter advancement and skill tables.
 *
 * Handles two types of rolls:
 *   1. Random Advancement — 2D6 roll to determine the type of stat increase.
 *   2. Skill Table Roll   — D6 (or D66) roll on a specific skill table to
 *      pick a random skill (with optional exotic-beast filtering).
 *
 * All table data is loaded from xpTables.json (compiled from _data/xpTables.yml).
 * Uses Dice.isInRange for value-matching against table rows.
 *
 * Depends on: dice.js (Dice)
 */

import { Dice } from './dice.js';

export const XPTablesEngine = {
  xpData: null,

  /**
   * Store the full XP tables data structure.
   * @param {Object} data - Parsed xpTables.json.
   */
  loadXPData(data) {
    this.xpData = data;
  },

  /**
   * Retrieve a named table (e.g. 'advancements_random', 'skill_agility').
   * @param {string} tableName
   * @returns {Object|null}
   */
  getTable(tableName) {
    if (!this.xpData || !this.xpData[tableName]) {
      console.error(`Table not found: ${tableName}`);
      return null;
    }
    return this.xpData[tableName];
  },

  /**
   * Roll dice appropriate for a given table (D6, 2D6, D66, etc.)
   * based on the table's `count` and `sides` properties.
   * @param {string} tableName
   * @returns {{ rolls: number[]|null, total: number }|null}
   */
  rollDiceForTable(tableName) {
    const table = this.getTable(tableName);
    if (!table) return null;
    return Dice.rollFromSpec(table.sides, table.count || 1);
  },

  /**
   * Find the result row whose `values` array contains `roll`.
   * @param {string} tableName
   * @param {number} roll
   * @returns {Object|null}
   */
  findResult(tableName, roll) {
    const table = this.getTable(tableName);
    if (!table || !table.results) return null;
    return Dice.findInTable(table.results, roll);
  },

  /**
   * Roll on the random advancement table (2D6) and return the result.
   * @returns {{ rolls: number[], total: number, result: Object } | { error: string }}
   */
  rollAdvancement() {
    const diceResult = this.rollDiceForTable('advancements_random');
    if (diceResult === null) {
      return { error: 'Failed to roll. Data not loaded.' };
    }

    const { rolls, total } = diceResult;
    const result = this.findResult('advancements_random', total);
    if (!result) {
      return { rolls, total, error: 'No result found for this roll.' };
    }

    return { rolls, total, result };
  },

  /**
   * Roll on a named skill table and return the result.
   * @param {string} skillTableName - e.g. 'skill_agility'
   * @returns {{ tableName: string, rolls: number[], total: number, result: Object } | { error: string }}
   */
  rollSkillTable(skillTableName) {
    const diceResult = this.rollDiceForTable(skillTableName);
    if (diceResult === null) {
      return { error: `Failed to roll ${skillTableName}. Data not loaded.` };
    }

    const { rolls, total } = diceResult;
    const result = this.findResult(skillTableName, total);
    if (!result) {
      return { rolls, total, error: `No result found for roll ${total} in table ${skillTableName}.` };
    }

    return { tableName: skillTableName, rolls, total, result };
  },

  // Test with a specific roll value
  testRoll(rollValue) {
    const roll = parseInt(rollValue);
    if (isNaN(roll)) {
      console.error(`Invalid roll value: ${rollValue}`);
      return null;
    }

    const result = this.findResult('advancements_random', roll);
    if (!result) {
      return {
        roll,
        error: 'No result found for this roll.'
      };
    }

    return {
      roll,
      result
    };
  },

  // Test a skill table directly
  testSkillTable(skillTableName, rollValue = null) {
    if (!this.getTable(skillTableName)) {
      console.error(`Table not found: ${skillTableName}`);
      return { error: `Table not found: ${skillTableName}` };
    }

    // If rollValue specified, test that specific roll
    if (rollValue !== null) {
      const roll = parseInt(rollValue);
      if (isNaN(roll)) {
        console.error(`Invalid roll value: ${rollValue}`);
        return null;
      }

      const result = this.findResult(skillTableName, roll);
      if (!result) {
        return {
          roll,
          error: `No result found for roll ${roll} in table ${skillTableName}.`
        };
      }

      return {
        tableName: skillTableName,
        roll,
        result
      };
    }

    // Otherwise roll normally
    return this.rollSkillTable(skillTableName);
  },

  /**
   * Get all skill table names and formatted display names.
   * @returns {{ id: string, name: string }[]}
   */
  getSkillTables() {
    if (!this.xpData) return [];
    
    return Object.keys(this.xpData)
      .filter(key => key.startsWith('skill_'))
      .map(key => ({
        id: key,
        name: key.replace('skill_', '').replace(/_/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      }));
  }
};
