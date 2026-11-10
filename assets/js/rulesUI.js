/**
 * rulesUI.js — Fills in the data-driven parts of the Rule Summary page
 * (tools/rules.html).
 *
 * Any Markdown section in _rules_sections/ can embed compiled YAML data by
 * including a placeholder element:
 *
 *   <div data-rules-source="statuses"></div>
 *
 * The `data-rules-source` value is both the name of the JSON file to fetch
 * (`<dataBase><source>.json`, built from `_data/<source>.yml`) and the key of
 * the renderer in RENDERERS below. Optional extra `data-rules-*` attributes
 * are passed to the renderer (e.g. `data-rules-group="Fighter"`).
 *
 * Adding `data-rules-nav` to a placeholder makes each block it renders an
 * entry in the navigation drawer (one level deeper than the enclosing
 * section) and its own view; without it the blocks are plain collapsibles.
 *
 * To add a new data-driven block: add `_data/<source>.yml`, a
 * `data/<source>.json` passthrough, one RENDERERS entry, and drop the
 * placeholder into a section's Markdown.
 *
 * Depends on: dataLoader.js (fetchJSON)
 */

import { fetchJSON } from './dataLoader.js';

/**
 * @param {string} text
 * @returns {string} URL-safe, lowercase, hyphenated id fragment.
 */
function slugify(text) {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * @param {string} summary - Heading text.
 * @param {string} body - Inner HTML.
 * @param {string} [navId] - If given, the block gets this id and becomes an
 *   entry in the navigation drawer (see pageNav.js).
 * @returns {string} A nested collapsible block.
 */
function collapsible(summary, body, navId) {
  const attrs = navId ? ` id="${navId}" data-nav-child` : '';
  return `<details class="reference-tables-collapsible"${attrs}><summary>${summary}</summary>${body}</details>`;
}

/**
 * Builds a collapsible-block factory for a placeholder. If the placeholder
 * has `data-rules-nav`, each block becomes a drawer entry with the id
 * "<enclosing section id>-<slugified name>"; otherwise it is a plain
 * collapsible.
 * @param {HTMLElement} el - The placeholder element.
 * @returns {function(string, string): string}
 */
function blockFactory(el) {
  const parentId = el.hasAttribute('data-rules-nav') ? el.closest('details').id : null;
  return (name, body) => collapsible(name, body, parentId ? `${parentId}-${slugify(name)}` : undefined);
}

/**
 * Renders a flat {name, effect} entry map as a two-column table.
 * @param {Object} entries - Entry map from the parsed JSON.
 * @param {string} headerLabel - Label for the first column.
 * @returns {string}
 */
function nameEffectTable(entries, headerLabel) {
  const rows = Object.values(entries).map(entry =>
    `<tr><td>${entry.name}</td><td>${entry.effect}</td></tr>`
  ).join('');
  return `<table><thead><tr><th>${headerLabel}</th><th>Effect</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * Source name -> function(data, element) returning the HTML to inject.
 */
const RENDERERS = {
  statuses: (data) => nameEffectTable(data.statuses, 'Status'),

  conditions: (data) => nameEffectTable(data.conditions, 'Condition'),

  // One group (e.g. Fighter) of subtypes: its intro text, then each subtype.
  modelSubtypes: (data, el) => {
    const group = data.model_subtypes[el.dataset.rulesGroup];
    if (!group) return '<div class="error-box">Unknown subtype group.</div>';
    const block = blockFactory(el);
    const subtypes = Object.values(group.subtypes || {}).map(subtype =>
      block(subtype.name, subtype.description)
    ).join('');
    return `${group.description || ''}${subtypes}`;
  },

  weaponTraits: (data, el) => {
    const block = blockFactory(el);
    return Object.values(data.weapon_traits).map(trait =>
      block(trait.name, trait.description)
    ).join('');
  },

  skills: (data, el) => {
    const block = blockFactory(el);
    const groupKey = el.dataset.rulesGroup;
    const categories = groupKey ? [data.skills[groupKey]] : Object.values(data.skills);
    return categories.filter(Boolean).map(category =>
      Object.values(category.skills || {}).map(skill =>
        block(skill.name, skill.description)
      ).join('')
    ).join('');
  },
};

export const RulesUI = {
  /**
   * Find every `[data-rules-source]` placeholder on the page, fetch each
   * distinct JSON source once, and render into the placeholders.
   * @param {string} dataBase - URL prefix of the compiled JSON files (ending in "/").
   */
  async init(dataBase) {
    const placeholders = Array.from(document.querySelectorAll('[data-rules-source]'));
    const sources = [...new Set(placeholders.map(el => el.dataset.rulesSource))];

    const loaded = {};
    await Promise.all(sources.map(async source => {
      try {
        loaded[source] = await fetchJSON(`${dataBase}${source}.json`);
      } catch (err) {
        console.error(`Failed to load rules data "${source}":`, err);
      }
    }));

    placeholders.forEach(el => {
      const render = RENDERERS[el.dataset.rulesSource];
      const data = loaded[el.dataset.rulesSource];
      el.innerHTML = render && data
        ? render(data, el)
        : '<div class="error-box">Error loading reference data.</div>';
    });

    // Lets pageNav.js pick up any newly rendered drawer entries
    document.dispatchEvent(new CustomEvent('rules:rendered'));
  },
};
