/**
 * scenario_MeatForTheGrinderUI.js — Front-end for the Meat for the Grinder
 * scenario tool.
 *
 * Renders:
 *   - Scavenged weapon roller (2D6 with animated result box)
 *   - Full weapon profiles table with stat blocks
 *   - 2D6 roll reference table
 *   - Collapsible weapon-trait and fighter-skill reference sections
 *
 * Depends on: dice.js, icons.js, timer.js,
 *             scenario_MeatForTheGrinderEngine.js
 */

import { TimerUtil } from '../timer.js';
import { scenario_MeatForTheGrinderEngine } from './scenario_MeatForTheGrinderEngine.js';
import { fetchJSON } from '../dataLoader.js';
import { SkillsRenderer } from '../skillsRenderer.js';
import { animatedReplace } from '../uiUtils.js';

export const scenario_MeatForTheGrinderUI = {
  /**
   * Load scenario/traits/skills data, wire up events/timer, and render the
   * weapon profile table, roll reference table, and (if available)
   * weapon-trait and fighter-skill reference sections.
   * @param {string} jsonPath - Path to scenario_MeatForTheGrinder.json.
   * @param {string} [traitsJsonPath] - Optional path to weaponTraits.json.
   * @param {string} [skillsJsonPath] - Optional path to fighterSkills.json.
   * @returns {Promise<void>}
   */
  async init(jsonPath, traitsJsonPath, skillsJsonPath) {
    try {
      const [data, traitsData, skillsData] = await Promise.all([
        fetchJSON(jsonPath),
        traitsJsonPath ? fetchJSON(traitsJsonPath).catch(() => null) : null,
        skillsJsonPath ? fetchJSON(skillsJsonPath).catch(() => null) : null
      ]);

      scenario_MeatForTheGrinderEngine.loadData(data);
      this.bindEvents();
      this.initTimer();
      this.renderWeaponTable(data);
      this.renderRollTable(data);

      if (traitsData) {
        this.renderWeaponTraits(traitsData);
      }

      if (skillsData) {
        this.renderFighterSkills(skillsData);
      }
    } catch (err) {
      console.error(err);
      const container = document.getElementById('scavenged-weapons-results');
      if (container) container.innerHTML = '<div class="error-box">Error loading scavenged weapons data.</div>';
    }
  },

  /** Wire the "Roll Scavenged Weapon" button. */
  bindEvents() {
    const button = document.getElementById('roll-scavenged-weapon');
    if (button) button.addEventListener('click', () => this.doRoll());
  },

  /** Initialize the "time since last run" display for this tool. */
  initTimer() {
    TimerUtil.init('page-roll-info', 'scenario_MeatForTheGrinderLastRun');
    TimerUtil.setupPageCleanup();
  },

  /**
   * Normalize a weapon profile so its stat block (RngS/RngL/Str/AP/etc.) is
   * always at the top level, whether the YAML nested it under a sub-key
   * (e.g. multi-profile weapons) or defined it directly on the profile.
   * @param {Object} profile - A single weapon profile entry.
   * @returns {Object} The profile with stats flattened to the top level.
   */
  getProfileStats(profile) {
    if (profile.RngS !== undefined || profile.RngL !== undefined) return profile;
    for (const [key, val] of Object.entries(profile)) {
      if (key !== 'name' && typeof val === 'object' && val !== null) {
        return { name: profile.name, ...val };
      }
    }
    return profile;
  },

  /**
   * Render the 2D6 scavenged-weapon roll reference table.
   * @param {Object} data - Scenario data with scavenged_weapon_roll.
   */
  renderRollTable(data) {
    const container = document.getElementById('roll-table-container');
    if (!container || !data.scavenged_weapon_roll) return;

    const { results } = data.scavenged_weapon_roll;
    const rows = Object.values(results).map(entry => {
      const rollStr = Array.isArray(entry.values) ? entry.values.join(', ') : entry.values;
      return `<tr><td>${rollStr}</td><td><b>${entry.name}</b></td></tr>`;
    }).join('');

    container.innerHTML = `
      <h3>Scavenged Weapon (2D6)</h3>
      <table>
        <thead><tr><th>Roll</th><th>Weapon</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  },

  /** Render collapsible weapon-trait descriptions. */
  renderWeaponTraits(traitsData) {
    const container = document.getElementById('weapon-traits-container');
    if (!container || !traitsData || !traitsData.weapon_traits) return;

    container.innerHTML = Object.values(traitsData.weapon_traits).map(trait =>
      `<details class="reference-tables-collapsible">
        <summary>${trait.name}</summary>
        ${trait.description}
      </details>`
    ).join('');
  },

  /**
   * Render the fighter-skills reference section, restricted to the skills
   * relevant to this scenario (True Grit, Iron Jaw, Unstoppable).
   * @param {Object} skillsData - Parsed fighterSkills.json.
   */
  renderFighterSkills(skillsData) {
    const container = document.getElementById('fighter-skills-container');
    SkillsRenderer.renderSkills(skillsData, container, ['True Grit', 'Iron Jaw', 'Unstoppable']);
  },

  /**
   * Render the full scavenged-weapon profiles table, including multi-profile
   * weapons (grouped with header/first/mid/last row styling) via `getProfileStats()`.
   * @param {Object} data - Scenario data with `scavenged_weapon_table`.
   */
  renderWeaponTable(data) {
    const container = document.getElementById('weapon-profiles-table');
    if (!container) return;

    const table = data.scavenged_weapon_table;
    if (!table) return;

    const cols = ['Name', 'Rng S', 'Rng L', 'Acc S', 'Acc L', 'Str', 'AP', 'Dam', 'AM', 'Traits'];
    const statKeys = ['name', 'RngS', 'RngL', 'AccS', 'AccL', 'Str', 'AP', 'Dam', 'AM', 'Traits'];

    let rows = '';
    for (const [weaponId, weapon] of Object.entries(table)) {
      const profiles = Object.values(weapon);
      const isMulti = profiles.length > 1;
      profiles.forEach((profile, i) => {
        let cls = '';
        if (isMulti) {
          if (i === 0) cls = 'group-first';
          else if (i === profiles.length - 1) cls = 'group-last';
          else cls = 'group-mid';
        }
        if (profile.header) {
          rows += `<tr${cls ? ` class="${cls}"` : ''}><td colspan="${statKeys.length}" class="weapon-group-header">${profile.name}</td></tr>`;
          return;
        }
        const stats = this.getProfileStats(profile);
        rows += `<tr${cls ? ` class="${cls}"` : ''}>`;
        for (const key of statKeys) {
          const val = stats[key] !== undefined ? stats[key] : '-';
          rows += `<td>${val}</td>`;
        }
        rows += '</tr>';
      });
    }

    container.innerHTML = `
      <table class="weapon-profiles-table">
        <thead>
          <tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  /** Roll 2D6 on the scavenged weapon table, record it in the run timer, and display the result. */
  doRoll() {
    const container = document.getElementById('scavenged-weapons-results');
    if (!container) return;

    const { rolls, total, result, error } = scenario_MeatForTheGrinderEngine.roll();

    if (typeof TimerUtil !== 'undefined') {
      const rollStrings = rolls ? [`2D6: ${rolls.join(' + ')} = ${total}`] : [];
      TimerUtil.markRun('scenario_MeatForTheGrinderLastRun', rollStrings);
    }

    if (error) {
      container.innerHTML = `<div class="error-box">${error}</div>`;
      return;
    }

    const colour = result.colour || 'grey';
    const effectHtml = result.fixedeffect
      ? `<div class="result-effect">${result.fixedeffect}</div>`
      : '';

    const div = document.createElement('div');
    div.className = `result-box result-box-${colour} mt-20`;
    div.innerHTML = [
      `<div class="result-heading result-name"><b>${result.name}</b></div>`,
      effectHtml,
    ].filter(Boolean).join('');

    animatedReplace(container, div);
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};