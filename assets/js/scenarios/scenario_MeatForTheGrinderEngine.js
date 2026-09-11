/**
 * scenario_MeatForTheGrinderEngine.js — Business logic for the
 * "Meat for the Grinder" scenario tool.
 *
 * Rolls 2D6 on the scavenged-weapon table to determine what weapon
 * a conscript fighter receives.  Table data is loaded from
 * scenario_MeatForTheGrinder.json.
 *
 * Depends on: dice.js (Dice)
 */

import { Dice } from '../dice.js';

export const scenario_MeatForTheGrinderEngine = {
  data: null,

  /**
   * Store the scenario data (weapon roll table + weapon profiles).
   * @param {Object} data - Parsed scenario_MeatForTheGrinder.json.
   */
  loadData(data) {
    this.data = data;
  },

  /**
   * Roll 2D6 on the scavenged-weapon table.
   * @returns {{ rolls: number[], total: number, result: Object } | { error: string }}
   */
  roll() {
    const table = this.data && this.data.scavenged_weapon_roll;
    if (!table) return { error: 'Data not loaded.' };

    const rolls = Dice.rollMany(table.count, null, table.sides);
    const total = Dice.sum(rolls);
    const result = this.findResult(total);

    if (!result) return { rolls, total, error: `No result found for roll ${total}.` };

    return { rolls, total, result };
  },

  /**
   * Find the weapon-table entry matching a given roll total.
   * @param {number} roll
   * @returns {Object|null}
   */
  findResult(roll) {
    const table = this.data && this.data.scavenged_weapon_roll;
    if (!table || !table.results) return null;
    return Dice.findInTable(table.results, roll);
  }
};