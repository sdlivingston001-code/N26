/**
 * scenarioUI.js — Rendering for the scenario reference page.
 *
 * Renders a full scenario from the structured YAML/JSON data using
 * existing CSS classes from style.css wherever possible.
 *
 * Depends on: scenarioEngine.js, dataLoader.js
 */

import { ScenarioEngine } from './scenarioEngine.js';
import { fetchJSON } from '../dataLoader.js';

export const ScenarioUI = {

  _select: null,
  _display: null,

  /**
   * Initialise the UI: load data, build dropdown, wire events.
   * @param {string} dataUrl      - URL to data/scenarios.json
   * @param {string} defaultsUrl  - URL to data/scenario_defaults.json
   */
  init(dataUrl, defaultsUrl) {
    this._select  = document.getElementById('scenario-select');
    this._display = document.getElementById('scenario-display');

    const loads = [fetchJSON(dataUrl)];
    if (defaultsUrl) loads.push(fetchJSON(defaultsUrl));

    Promise.all(loads)
      .then(([data, defaults]) => {
        ScenarioEngine.load(data);
        if (defaults) ScenarioEngine.loadDefaults(defaults);
        this._buildDropdown();
        this._select.addEventListener('change', () => this._onSelect());
      })
      .catch(() => {
        this._display.innerHTML = '<div class="error-box">Error loading scenario data.</div>';
      });
  },

  // ── Dropdown ────────────────────────────────────────────────────────────────

  _buildDropdown() {
    const scenarios = ScenarioEngine.getSortedScenarios();
    this._select.innerHTML =
      '<option value="">— Select a scenario —</option>' +
      scenarios.map(s =>
        `<option value="${s.id}">${s.number ? s.number + '. ' : ''}${s.name}</option>`
      ).join('');
  },

  _onSelect() {
    const id = this._select.value;
    if (!id) {
      this._display.innerHTML = '';
      return;
    }
    const scenario = ScenarioEngine.getById(id);
    if (!scenario) {
      this._display.innerHTML = '<div class="error-box">Scenario not found.</div>';
      return;
    }
    this._render(scenario);
  },

  // ── Master renderer ─────────────────────────────────────────────────────────

  _render(s) {
    const parts = [
      this._renderHeader(s),
      this._renderBattleType(s.battle_type),
      this._renderSimpleSection('Battlefield',  this._battlefieldText(s.battlefield)),
      this._renderSimpleSection('Crews',        this._crewsText(s.crews)),
      this._renderDeployment(s.deployment),
      this._renderGangTactics(s.gang_tactics),
      this._renderSimpleSection('Ending the Battle', s.ending?.condition ?? ''),
      this._renderVictory(s.victory),
      this._renderRewards(s.rewards),
      this._renderSpecialRules(s.special_rules),
    ].filter(Boolean);

    this._display.innerHTML = parts.join('');
  },

  // ── Section helpers ─────────────────────────────────────────────────────────

  _renderHeader(s) {
    const battleTypeBadge = s.battle_type?.type
      ? `<span class="text-keyword" style="margin-left:0.75rem;font-size:0.85em;">${this._titleCase(s.battle_type.type)}</span>`
      : '';
    return `
      <div class="section-divider">
        <h2 style="margin:0;">${s.number ? `<span class="text-muted" style="margin-right:0.4rem;">${s.number}.</span>` : ''}${s.name}${battleTypeBadge}</h2>
      </div>`;
  },

  _renderSimpleSection(title, body) {
    if (!body) return '';
    return this._collapsible(title, `<p style="margin:0;">${body}</p>`);
  },

  _renderBattleType(bt) {
    if (!bt) return '';
    const restrictions = (bt.restrictions ?? [])
      .map(r => `<li>${r}</li>`)
      .join('');
    const body = restrictions
      ? `<ul style="margin:0.5rem 0 0; padding-left:1.5rem;">${restrictions}</ul>`
      : '';
    return this._collapsible('Battle Type', body);
  },

  _battlefieldText(bf) {
    if (!bf) return '';
    return ScenarioEngine.resolve('battlefield.setup', bf.setup);
  },

  _crewsText(crews) {
    if (!crews) return '';
    const lines = [
      `<b>Method:</b> ${crews.method} (${crews.dice})`,
    ];
    if (crews.reinforcements_deck) {
      lines.push(ScenarioEngine.getText('crews.reinforcements_deck_note'));
    }
    return '<p style="margin:0;">' + lines.join('<br>') + '</p>';
  },

  _renderDeployment(dep) {
    if (!dep?.steps?.length) return '';
    const steps = dep.steps
      .map((step, i) => `<li style="margin-bottom:0.5rem;">${step}</li>`)
      .join('');
    return this._collapsible('Deployment', `<ol style="margin:0.5rem 0 0; padding-left:1.5rem;">${steps}</ol>`);
  },

  _renderGangTactics(gt) {
    if (!gt) return '';
    const rows = [];
    rows.push(`<p style="margin:0 0 0.5rem;"><b>Default:</b> ${ScenarioEngine.resolve('gang_tactics.default', gt.default)}</p>`);
    if (gt.per_round) {
      rows.push(`<p style="margin:0 0 0.5rem;"><span class="text-trigger">At the ${gt.per_round.trigger}</span>, each player randomly determines a gang tactic.</p>`);
    }
    if (gt.underdog) {
      rows.push(`<div class="info-box warning-box" style="margin:0.5rem 0 0;">
        <b>Underdog:</b> ${gt.underdog.note}
        (per full <b>${gt.per_credits} credits</b> difference, during pre-battle step 7)
      </div>`);
    }
    return this._collapsible('Gang Tactics', rows.join(''));
  },

  _renderVictory(v) {
    if (!v) return '';
    const body = `
      <div class="info-box" style="background:#d4edda;border-color:#28a745;color:#155724;margin-bottom:0.5rem;">
        <b>Victory:</b> ${v.winner}
      </div>
      <div class="info-box recovery-box">
        <b>Draw:</b> ${v.draw}
      </div>`;
    return this._collapsible('Victory', body);
  },

  _renderRewards(rewards) {
    if (!rewards) return '';
    const parts = [];

    if (rewards.credits?.length) {
      const rows = rewards.credits.map(r =>
        `<tr><td>${r.condition}</td><td><b>${r.roll}</b> → ${r.target}</td></tr>`
      ).join('');
      parts.push(`
        <h4 style="margin:0.5rem 0 0.25rem;">Credits</h4>
        <table class="mb-10">
          <thead><tr><th>Condition</th><th>Reward</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`);
    }

    if (rewards.experience?.length) {
      const rows = rewards.experience.map(r =>
        `<tr><td>${r.condition}${r.note ? `<br><span class="text-muted">${r.note}</span>` : ''}</td><td><b>${r.roll} XP</b></td></tr>`
      ).join('');
      parts.push(`
        <h4 style="margin:0.5rem 0 0.25rem;">Experience</h4>
        <table class="mb-10">
          <thead><tr><th>Condition</th><th>XP</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`);
    }

    if (rewards.reputation?.length) {
      const rows = rewards.reputation.map(r => {
        const changes = (r.changes ?? []).map(c =>
          `<span class="${c.amount.toString().startsWith('-') ? 'text-danger' : ''}" style="display:block;">${c.gang}: <b>${c.amount} Rep</b></span>`
        ).join('');
        return `<tr><td>${r.condition}</td><td>${changes}</td></tr>`;
      }).join('');
      parts.push(`
        <h4 style="margin:0.5rem 0 0.25rem;">Reputation</h4>
        <table>
          <thead><tr><th>Condition</th><th>Change</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`);
    }

    return this._collapsible('Rewards', parts.join(''));
  },

  _renderSpecialRules(rules) {
    if (!rules) return '';

    const sections = Object.values(rules).map(rule => {
      const actionBadge = rule.action
        ? ` <span class="text-keyword">${rule.action.name} (${rule.action.type})</span>`
        : '';
      const triggerHtml = rule.trigger_note
        ? `<p style="margin:0 0 0.5rem;">${rule.trigger_note}</p>`
        : rule.trigger
          ? `<p style="margin:0 0 0.5rem;"><span class="text-trigger">${this._titleCase(rule.trigger)}</span></p>`
          : '';
      const effectHtml = rule.effect
        ? `<p style="margin:0;">${rule.effect}</p>`
        : rule.description
          ? `<p style="margin:0;">${rule.description}</p>`
          : '';
      const bonusHtml = rule.bonus
        ? `<div class="info-box income-box mt-5">
            <b>+${rule.bonus.modifier}</b> to ${rule.bonus.tests.join(' and ')} tests for friendly fighters within <b>${rule.bonus.range}${rule.bonus.range_unit}</b>.
           </div>`
        : '';
      const depHtml = rule.deployment
        ? `<p style="margin:0.5rem 0 0;">${rule.deployment}</p>`
        : '';

      return `
        <details class="reference-tables-collapsible" open>
          <summary><strong>${rule.name}${actionBadge}</strong></summary>
          <div style="padding:0.5rem 0;">
            ${triggerHtml}${effectHtml}${bonusHtml}${depHtml}
          </div>
        </details>`;
    }).join('');

    return this._collapsible('Special Rules', sections, true);
  },

  // ── Generic collapsible wrapper ─────────────────────────────────────────────

  _collapsible(title, body, open = false) {
    if (!body) return '';
    return `
      <details class="reference-tables-collapsible"${open ? ' open' : ''}>
        <summary><strong>${title}</strong></summary>
        <div style="padding:0.5rem 0 0.75rem;">
          ${body}
        </div>
      </details>`;
  },

  // ── Utilities ───────────────────────────────────────────────────────────────

  _titleCase(str) {
    return str.replace(/\b\w/g, c => c.toUpperCase());
  },
};
