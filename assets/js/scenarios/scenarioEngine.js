/**
 * scenarioEngine.js — Data access and helpers for scenario reference pages.
 *
 * Stores the loaded scenarios object and provides sorted scenario list access.
 *
 * Depends on: nothing (pure data helpers)
 */

export const ScenarioEngine = {

  /** @type {object|null} Raw parsed scenarios JSON (keyed by file id) */
  _data: null,

  /** @type {object|null} Parsed scenario_defaults JSON */
  _defaults: null,

  /**
   * Load and store scenario data.
   * @param {object} data - Parsed scenarios JSON from data/scenarios.json
   */
  load(data) {
    this._data = data;
  },

  /**
   * Load canonical default text for common sub-element values.
   * @param {object} defaults - Parsed scenario_defaults JSON
   */
  loadDefaults(defaults) {
    this._defaults = defaults;
  },

  /**
   * Resolve a token value to its canonical display text.
   * Navigates _defaults using a dot-separated path, then looks up `value`.
   * Returns `value` unchanged if no match is found.
   *
   * @param {string} path  - Dot-separated key path (e.g. 'battlefield.setup')
   * @param {string} value - Token to look up (e.g. 'standard')
   * @returns {string}
   */
  resolve(path, value) {
    if (!this._defaults || value == null) return value ?? '';
    const node = path.split('.').reduce((o, k) => o?.[k], this._defaults);
    return (node && typeof node[value] === 'string') ? node[value] : value;
  },

  /**
   * Retrieve a fixed-text block from _defaults by dot-separated path.
   * Returns an empty string if the path does not exist.
   *
   * @param {string} path - Dot-separated key path (e.g. 'crews.reinforcements_deck_note')
   * @returns {string}
   */
  getText(path) {
    if (!this._defaults) return '';
    return path.split('.').reduce((o, k) => o?.[k], this._defaults) ?? '';
  },

  /**
   * Return scenarios sorted by their `number` field.
   * @returns {object[]} Array of scenario objects with id injected.
   */
  getSortedScenarios() {
    if (!this._data) return [];
    return Object.entries(this._data)
      .map(([id, scenario]) => ({ ...scenario, id }))
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  },

  /**
   * Return a single scenario by id.
   * @param {string} id
   * @returns {object|null}
   */
  getById(id) {
    if (!this._data || !this._data[id]) return null;
    return { ...this._data[id], id };
  },
};
