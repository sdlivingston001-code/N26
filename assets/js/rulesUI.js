/**
 * rulesUI.js — Renders the dynamic, data-driven sections of the Rule
 * Summary page (tools/rules.html): Status, Conditions, the Model section's
 * Fighter/Vehicle Subtypes, the Weapon Trait Reference Table, and the
 * Skill Table. All five are fetched from compiled JSON (built from
 * _data/statuses.yml, _data/conditions.yml, _data/modelSubtypes.yml,
 * _data/weaponTraits.yml, and _data/skills.yml). Status and Conditions
 * render as table rows; the other three render as nested
 * <details class="reference-tables-collapsible"> elements so every entry
 * is independently expandable/collapsible.
 *
 * Depends on: dataLoader.js (fetchJSON)
 */

import { fetchJSON } from './dataLoader.js';

export const RulesUI = {
  /**
   * Fetch status, conditions, model subtype, weapon trait, and skill data
   * and render all five reference tables.
   * @param {string} statusesUrl - Path to /data/statuses.json.
   * @param {string} conditionsUrl - Path to /data/conditions.json.
   * @param {string} modelSubtypesUrl - Path to /data/modelSubtypes.json.
   * @param {string} weaponTraitsUrl - Path to /data/weaponTraits.json.
   * @param {string} skillsUrl - Path to /data/skills.json.
   */
  async init(statusesUrl, conditionsUrl, modelSubtypesUrl, weaponTraitsUrl, skillsUrl) {
    try {
      const [statusesData, conditionsData, modelData, traitsData, skillsData] = await Promise.all([
        fetchJSON(statusesUrl),
        fetchJSON(conditionsUrl),
        fetchJSON(modelSubtypesUrl),
        fetchJSON(weaponTraitsUrl),
        fetchJSON(skillsUrl),
      ]);
      this.renderNameEffectTable(statusesData, 'statuses', 'rules-statuses-container', 'Status');
      this.renderNameEffectTable(conditionsData, 'conditions', 'rules-conditions-container', 'Condition');
      this.renderModelSubtypes(modelData);
      this.renderWeaponTraits(traitsData);
      this.renderSkills(skillsData);
    } catch (err) {
      console.error('Failed to load rule summary data:', err);
      const containers = ['rules-statuses-container', 'rules-conditions-container', 'rules-model-subtypes-container', 'rules-weapon-traits-container', 'rules-skills-container'];
      containers.forEach(id => {
        const container = document.getElementById(id);
        if (container) container.innerHTML = '<div class="error-box">Error loading reference data.</div>';
      });
    }
  },

  /**
   * Renders a flat {name, effect} entry map as a two-column table.
   * Shared by Status and Conditions, which have an identical shape.
   * @param {Object} data - Parsed JSON with a single top-level key holding the entry map.
   * @param {string} dataKey - The top-level key to read entries from (e.g. "statuses").
   * @param {string} containerId - The DOM id of the container to render into.
   * @param {string} headerLabel - The label for the first table column (e.g. "Status").
   */
  renderNameEffectTable(data, dataKey, containerId, headerLabel) {
    const container = document.getElementById(containerId);
    if (!container || !data || !data[dataKey]) return;
    const rows = Object.values(data[dataKey]).map(entry =>
      `<tr><td>${entry.name}</td><td>${entry.effect}</td></tr>`
    ).join('');
    container.innerHTML = `
      <table>
        <thead><tr><th>${headerLabel}</th><th>Effect</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  /**
   * @param {{model_subtypes: Object}} data - Parsed modelSubtypes.json, grouped by Fighter/Vehicle.
   */
  renderModelSubtypes(data) {
    const container = document.getElementById('rules-model-subtypes-container');
    if (!container || !data || !data.model_subtypes) return;
    container.innerHTML = Object.values(data.model_subtypes).map(group => {
      const subtypesHtml = Object.values(group.subtypes || {}).map(subtype =>
        `<details class="reference-tables-collapsible"><summary>${subtype.name}</summary>${subtype.description}</details>`
      ).join('');
      return `<details class="reference-tables-collapsible"><summary>${group.name}</summary>${group.description || ''}${subtypesHtml}</details>`;
    }).join('');
  },

  /**
   * @param {{weapon_traits: Object}} data - Parsed weaponTraits.json.
   */
  renderWeaponTraits(data) {
    const container = document.getElementById('rules-weapon-traits-container');
    if (!container || !data || !data.weapon_traits) return;
    container.innerHTML = Object.values(data.weapon_traits).map(trait =>
      `<details class="reference-tables-collapsible"><summary>${trait.name}</summary>${trait.description}</details>`
    ).join('');
  },

  /**
   * @param {{skills: Object}} data - Parsed skills.json, grouped by category.
   */
  renderSkills(data) {
    const container = document.getElementById('rules-skills-container');
    if (!container || !data || !data.skills) return;
    container.innerHTML = Object.values(data.skills).map(category => {
      const skillsHtml = Object.values(category.skills || {}).map(skill =>
        `<details class="reference-tables-collapsible"><summary>${skill.name}</summary>${skill.description}</details>`
      ).join('');
      return `<details class="reference-tables-collapsible"><summary>${category.name}</summary>${skillsHtml}</details>`;
    }).join('');
  },
};
