/**
 * lootCasketUI.js — Front-end for the Loot Casket tool.
 *
 * Renders:
 *   - Smash / Bypass buttons
 *   - Animated result boxes with nested-table drill-down buttons
 *   - Reroll history badges
 *   - Income calculation display
 *   - Collapsible reference tables for all loot sub-tables
 *
 * Exposes `testLootCasket(roll)` and `testNestedTable(name, roll)` to
 * the console for developer testing.
 *
 * Depends on: dice.js, icons.js, timer.js, lootCasketEngine.js
 */

import { Icons } from './icons.js';
import { TimerUtil } from './timer.js';
import { LootCasketEngine } from './lootCasketEngine.js';
import { fetchJSON } from './dataLoader.js';
import { animatedReplace } from './uiUtils.js';

export const LootCasketUI = {
  lootData: null,

  /**
   * Load loot table data, wire up events/timer, and render the reference
   * tables. Also exposes `testLootCasket(roll)` and `testNestedTable(name, roll)`
   * on `window` for console testing.
   * @param {string} jsonPath - Path to lootCasket.json.
   * @returns {Promise<void>}
   */
  async init(jsonPath) {
    try {
      this.lootData = await fetchJSON(jsonPath);
      LootCasketEngine.loadLootData(this.lootData);

      this.bindEvents();
      this.initTimer();
      this.renderReferenceTables();

      // Expose test functions to window for console testing
      window.testLootCasket = (roll) => {
        const result = LootCasketEngine.testRoll(roll);
        if (result) {
          this.displayLootCasketResult(result);
          console.log('Test loot casket result for roll ' + roll + ':', result);
        }
      };

      window.testNestedTable = (tableName, roll = null) => {
        const result = LootCasketEngine.testNestedTable(tableName, roll);
        if (result && !result.error) {
          const container = document.getElementById('loot-casket-results');
          if (container) {
            container.innerHTML = `<div class="mt-20"><h3 class="mb-15">Testing: ${tableName}</h3></div>`;
            const mainContainer = container.querySelector('div');
            if (result.rerollHistory && result.rerollHistory.length > 0) {
              const rerollDiv = document.createElement('div');
              rerollDiv.className = 'info-casket reroll-history-casket';
              rerollDiv.innerHTML = `${Icons.rotateCcw} <b>Rerolled:</b> ${result.rerollHistory.map(r => `${r.name} (${r.roll})`).join(', ')}`;
              mainContainer.appendChild(rerollDiv);
            }
            mainContainer.appendChild(this.createResultBox(result.result, result.roll, result.tableName));
            if (result.randomEffect) this.displayNestedEffect(result.randomEffect, mainContainer);
          }
          console.log('Test nested table result:', result);
        } else if (result && result.error) {
          console.error(result.error);
        }
      };

      console.log('%c🎁 Loot Casket Testing Enabled', 'color: #FFD700; font-weight: bold; font-size: 14px;');
      console.log('Use: testlootCasket(roll) - e.g., testlootCasket(4)');
      console.log('Use: testNestedTable(tableName, roll) - e.g., testNestedTable("d66drugs", 11) or testNestedTable("d3skull")');
    } catch (err) {
      console.error(err);
      const container = document.getElementById("loot-casket-container");
      if (container) {
        container.innerHTML = '<div class="error-box">Error loading loot casket data.</div>';
      }
    }
  },

  /** Render collapsible reference tables for the main loot casket roll and every nested sub-table (drugs, ammo, fancy loot, servo skull). */
  renderReferenceTables() {
    const container = document.getElementById('loot-table-container');
    if (!container || !this.lootData) return;

    const tableOrder = [
      { key: 'loot_casket_roll', title: 'Loot Casket (D6)' },
      { key: 'd66drugs',      title: 'Drugs Cache (D66)' },
      { key: 'd6ammo',        title: 'Ammo Stash (D6)' },
      { key: 'd6fancy',       title: 'Fancy Loot (D6)' },
      { key: 'd3skull',       title: 'Servo Skull (D3)' },
    ];

    container.innerHTML = tableOrder.map(({ key, title }) => {
      const tableData = this.lootData[key];
      if (!tableData || !tableData.results) return '';

      const rows = Object.values(tableData.results).map(entry => {
        const colour = entry.colour || 'grey';
        const rollStr = Array.isArray(entry.values) ? entry.values.join(', ') : entry.values;
        return `<tr class="row-${colour}">
          <td>${rollStr}</td>
          <td><b>${entry.name}</b></td>
          <td>${entry.fixedeffect || '&mdash;'}</td>
        </tr>`;
      }).join('');

      return `
        <details class="reference-tables-collapsible">
          <summary>${title}</summary>
          <table class="mt-10">
            <thead><tr><th>Roll</th><th>Result</th><th>Effect</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </details>`;
    }).join('');
  },

  /** Wire the "Smash Open" and "Bypass Lock" buttons. */
  bindEvents() {
    const smashBtn = document.getElementById("resolve-loot-casket-smash");
    if (smashBtn) {
      smashBtn.addEventListener("click", () => this.openLootCasketSmash());
    }
    const bypassBtn = document.getElementById("resolve-loot-casket-bypass");
    if (bypassBtn) {
      bypassBtn.addEventListener("click", () => this.openLootCasketBypass());
    }
  },

  /** Initialize the "time since last run" display for this tool. */
  initTimer() {
    if (typeof TimerUtil !== 'undefined') {
      TimerUtil.init('page-roll-info', 'lootCasketLastRun');
      TimerUtil.setupPageCleanup();
    }
  },

  /**
   * Build a colored result box for a loot table entry (main table or a
   * nested sub-table).
   * @param {Object} result - Table entry (`name`, optional `fixedeffect`, `colour`).
   * @param {number} roll - The roll that produced this result (unused directly, kept for signature symmetry with callers).
   * @param {string|null} [tableName=null] - Nested table key, if this result came from a sub-table.
   * @param {number|null} [rawRoll=null] - Pre-adjustment roll (e.g. before the Smash Open -1 penalty), shown as "raw → adjusted" if different.
   * @returns {HTMLDivElement}
   */
  createResultBox(result, roll, tableName = null, rawRoll = null) {
    const colour = result.colour || "grey";
    const table = tableName ? this.lootData[tableName] : this.lootData.loot_casket_roll;
    const sides = table && table.sides;
    const diceType = sides === "d66" ? "D66" : `D${typeof sides === 'number' ? sides : parseInt(sides)}`;
    const rollDisplay = (rawRoll !== null && rawRoll !== undefined && rawRoll !== roll)
      ? `${rawRoll} &rarr; ${roll}`
      : roll;

    const div = document.createElement("div");
    div.className = `result-box result-box-${colour}`;
    div.innerHTML = `
      <div class="result-heading result-name"><b>${result.name}</b></div>
      ${result.fixedeffect ? `<div class="result-effect">${result.fixedeffect}</div>` : ''}
    `;
    return div;
  },

  /**
   * Build an info box describing an income roll and its credit total.
   * @param {Object} incomeResult - `{ sides, roll, multiplier, amount }` from the engine.
   * @returns {HTMLDivElement}
   */
  createIncomeBox(incomeResult) {
    const incomeDiv = document.createElement("div");
    incomeDiv.className = "info-box income-box";
    incomeDiv.style.animation = 'result-pop-in 0.2s ease-out both';

    const rollInfo = incomeResult.sides 
      ? `D${incomeResult.sides} Roll: <b>${incomeResult.roll}</b>`
      : '';
    
    const calculation = incomeResult.multiplier > 1 
      ? ` × ${incomeResult.multiplier} = <b>${incomeResult.amount} credits</b>`
      : ` = <b>${incomeResult.amount} credits</b>`;

    incomeDiv.innerHTML = `💰 <b>Income:</b> ${rollInfo}${calculation}`;
    
    return incomeDiv;
  },

  /**
   * Recursively render a nested-table effect: a reroll notice, a
   * "Roll the dice" button for a pending nested roll, or (once rolled) the
   * nested result box plus any further-nested effect beneath it.
   * @param {Object} randomEffect - `{ type: 'reroll'|'pending_roll'|'nested_table', ... }`.
   * @param {HTMLElement} parentDiv - Element to append the rendered effect to.
   */
  displayNestedEffect(randomEffect, parentDiv) {
    if (!randomEffect) return;

    if (randomEffect.type === 'reroll') {
      const div = document.createElement("div");
      div.className = "info-box reroll-box";
      div.innerHTML = `${Icons.rotateCcw} <b>Reroll:</b> This result requires a reroll.`;
      parentDiv.appendChild(div);
      return;
    }

    if (randomEffect.type === 'pending_roll') {
      const buttonContainer = document.createElement("div");
      buttonContainer.className = "nested-content mt-15";
      buttonContainer.style.animation = 'result-pop-in 0.2s ease-out both';
      buttonContainer.innerHTML = `<button class="btn">Roll the dice</button>`;
      buttonContainer.querySelector('button').addEventListener('click', () => {
        this.rollNestedTable(randomEffect.tableName, buttonContainer);
      });
      parentDiv.appendChild(buttonContainer);
    }

    if (randomEffect.type === 'nested_table' && randomEffect.result) {
      const nestedContainer = document.createElement("div");
      nestedContainer.className = "nested-content";
      nestedContainer.style.animation = 'result-pop-in 0.2s ease-out both';
      if (randomEffect.rerollHistory && randomEffect.rerollHistory.length > 0) {
        const rerollDiv = document.createElement("div");
        rerollDiv.className = "info-box reroll-history-box";
        rerollDiv.style.animation = 'result-pop-in 0.2s ease-out both';
        rerollDiv.innerHTML = `${Icons.rotateCcw} <b>Rerolled:</b> ${randomEffect.rerollHistory.map(r => `${r.name} (${r.roll})`).join(", ")}`;
        nestedContainer.appendChild(rerollDiv);
      }
      nestedContainer.appendChild(this.createResultBox(randomEffect.result, randomEffect.roll, randomEffect.tableName));
      if (randomEffect.nestedEffect) {
        this.displayNestedEffect(randomEffect.nestedEffect, nestedContainer);
      }
      parentDiv.appendChild(nestedContainer);
    }
  },

  /**
   * Roll a pending nested table (triggered by clicking "Roll the dice"),
   * record the roll(s) in the run timer, and replace the button with the
   * result (including any reroll history and further nesting).
   * @param {string} tableName - Key of the nested table to roll on.
   * @param {HTMLElement} containerDiv - Element whose contents get replaced with the result.
   */
  rollNestedTable(tableName, containerDiv) {
    const result = LootCasketEngine.rollNestedTable(tableName);

    if (result.error) {
      containerDiv.innerHTML = `<div class="error-box">${result.error}</div>`;
      return;
    }

    if (typeof TimerUtil !== 'undefined') {
      const table = this.lootData && this.lootData[result.tableName];
      const sides = table && table.sides;
      const diceType = sides === 'd66' ? 'D66' : `D${typeof sides === 'number' ? sides : parseInt(sides)}`;
      const nestedRolls = [];
      if (result.rerollHistory) {
        result.rerollHistory.forEach(r => nestedRolls.push(`${diceType} (rerolled): ${r.roll}`));
      }
      nestedRolls.push(`${diceType}: ${result.roll}`);
      try {
        const stored = localStorage.getItem('lootCasketLastRun_rolls');
        const existingRolls = stored ? JSON.parse(stored) : [];
        TimerUtil.recordRolls('lootCasketLastRun', [...existingRolls, ...nestedRolls]);
      } catch (e) {
        TimerUtil.recordRolls('lootCasketLastRun', nestedRolls);
      }
    }

    containerDiv.innerHTML = "";

    if (result.rerollHistory && result.rerollHistory.length > 0) {
      const rerollDiv = document.createElement("div");
      rerollDiv.className = "info-box reroll-history-box";
      rerollDiv.style.animation = 'result-pop-in 0.2s ease-out both';
      rerollDiv.innerHTML = `${Icons.rotateCcw} <b>Rerolled:</b> ${result.rerollHistory.map(r => `${r.name} (${r.roll})`).join(", ")}`;
      containerDiv.appendChild(rerollDiv);
    }

    containerDiv.appendChild(this.createResultBox(result.result, result.roll, result.tableName));

    if (result.randomEffect) {
      this.displayNestedEffect(result.randomEffect, containerDiv);
    }
  },

  /** Roll the "Smash Open" method (D6 - 1, min 1), record it in the run timer, and display the result. */
  openLootCasketSmash() {
    const lootResult = LootCasketEngine.smashOpenLootCasket();
    if (typeof TimerUtil !== 'undefined') {
      const rolls = [];
      if (lootResult.rawRoll !== undefined) rolls.push(`D66: ${lootResult.roll} (reduced from ${lootResult.rawRoll})`);
      else if (lootResult.roll !== undefined) rolls.push(`D66: ${lootResult.roll}`);
      if (lootResult.incomeResult && lootResult.incomeResult.roll !== undefined) rolls.push(`Income: ${lootResult.incomeResult.roll}`);
      rolls.unshift('[Smash]');
      TimerUtil.markRun('lootCasketLastRun', rolls);
    }
    this.displayLootCasketResult(lootResult);
  },

  /** Roll the "Bypass Lock" method (plain D6, no penalty), record it in the run timer, and display the result. */
  openLootCasketBypass() {
    const lootResult = LootCasketEngine.openLootCasketBypass();
    if (typeof TimerUtil !== 'undefined') {
      const rolls = [];
      if (lootResult.roll !== undefined) rolls.push(`D66: ${lootResult.roll}`);
      if (lootResult.incomeResult && lootResult.incomeResult.roll !== undefined) rolls.push(`Income: ${lootResult.incomeResult.roll}`);
      rolls.unshift('[Bypass]');
      TimerUtil.markRun('lootCasketLastRun', rolls);
    }
    this.displayLootCasketResult(lootResult);
  },

  /**
   * Render the full loot casket result: main result box, income box (if
   * any), and any nested-table effect chain.
   * @param {Object} lootResult - Result from `LootCasketEngine.smashOpenLootCasket()` or `.openLootCasketBypass()`.
   */
  displayLootCasketResult(lootResult) {
    const resultsContainer = document.getElementById("loot-casket-results");
    if (!resultsContainer) return;

    if (lootResult.error) {
      resultsContainer.innerHTML = `<div class="error-box">${lootResult.error}</div>`;
      return;
    }

    const mainContainer = document.createElement("div");
    mainContainer.className = "mt-20";
    mainContainer.innerHTML = '<h3 class="mb-15">Loot Casket Contents:</h3>';
    mainContainer.appendChild(this.createResultBox(lootResult.result, lootResult.roll, null, lootResult.rawRoll));

    if (lootResult.incomeResult) {
      mainContainer.appendChild(this.createIncomeBox(lootResult.incomeResult));
    }

    if (lootResult.randomEffect) {
      this.displayNestedEffect(lootResult.randomEffect, mainContainer);
    }

    animatedReplace(resultsContainer, mainContainer);
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};
