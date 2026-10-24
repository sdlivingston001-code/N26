/**
 * shootingUI.js — Front-end for the Shooting Sequence tool.
 *
 * Walks through the four-step ranged-attack sequence:
 *   1. Declare the Shot   — weapon profile selector.
 *   2. Measure Range      — Short/Long range band selection, cover lookup.
 *   3. Make the Hit Roll  — BS test, natural 1/6 rules, Rapid Fire /
 *                           Firepower dice, Ammo checks, Stray Shots.
 *   4. Resolve Hits       — Wound roll, Save roll (cover, Invulnerable,
 *                           no-save traits), Inflict Damage, and Injury
 *                           dice (Lethality) when Wounds hit 0.
 *
 * Also provides a simple Cool check roller for Nerve tests.
 *
 * Depends on: dice.js, icons.js, timer.js, shootingEngine.js, dataLoader.js, uiUtils.js
 */

import { Icons } from './icons.js';
import { TimerUtil } from './timer.js';
import { ShootingEngine } from './shootingEngine.js';
import { fetchJSON } from './dataLoader.js';
import { animatedReplace } from './uiUtils.js';

export const ShootingUI = {
  currentProfile: null,
  currentRangeInfo: null,
  weaponTraitsData: null,

  /**
   * Load weapon/trait data, wire up events/timer, and render the
   * initial weapon selector + reference tables.
   * @param {string} weaponsJsonPath
   * @param {string} traitsJsonPath
   * @returns {Promise<void>}
   */
  async init(weaponsJsonPath, traitsJsonPath) {
    try {
      const [weaponsData, traitsData] = await Promise.all([
        fetchJSON(weaponsJsonPath),
        traitsJsonPath ? fetchJSON(traitsJsonPath).catch(() => null) : null,
      ]);

      ShootingEngine.loadWeapons(weaponsData);
      this.weaponTraitsData = traitsData;

      this.populateWeaponSelector();
      this.bindEvents();
      this.initTimer();
      this.renderWeaponTraits();
      this.renderWeaponTable();

      this.onWeaponChange();
      this.updateRangeDisplay();
    } catch (err) {
      console.error(err);
      const container = document.getElementById('sh-weapon-stats');
      if (container) container.innerHTML = '<div class="error-box">Error loading shooting data.</div>';
    }
  },

  initTimer() {
    TimerUtil.init('page-roll-info', 'shootingLastRun');
    TimerUtil.setupPageCleanup();
  },

  /** Populate the weapon-profile <select> from ShootingEngine.getWeaponOptions(). */
  populateWeaponSelector() {
    const select = document.getElementById('sh-weapon-preset');
    if (!select) return;
    const options = ShootingEngine.getWeaponOptions();
    select.innerHTML = options.map(opt =>
      `<option value="${opt.id}">${opt.category}: ${opt.profile.name}</option>`
    ).join('');
  },

  bindEvents() {
    document.getElementById('sh-weapon-preset')?.addEventListener('change', () => this.onWeaponChange());
    document.getElementById('sh-range-band')?.addEventListener('change', () => this.updateRangeDisplay());
    document.getElementById('sh-target-cover')?.addEventListener('change', () => this.updateRangeDisplay());
    document.getElementById('sh-roll-hit')?.addEventListener('click', () => this.onRollHit());
    document.getElementById('sh-roll-wound')?.addEventListener('click', () => this.onRollWound());
    document.getElementById('sh-invuln-check')?.addEventListener('change', () => this.onInvulnChange());
    document.getElementById('sh-roll-save')?.addEventListener('click', () => this.onRollSave());
    document.getElementById('sh-inflict-damage')?.addEventListener('click', () => this.onInflictDamage());
    document.getElementById('sh-roll-nerve')?.addEventListener('click', () => this.onRollNerve());
  },

  formatRange(v) {
    if (v === null || v === undefined) return '-';
    if (v === 'T') return 'Template';
    return `${v}"`;
  },

  // ── Step 1: Declare the Shot ────────────────────────────────────────

  /** Handle a weapon-profile selection change: update state, stats, traits, and Rapid Fire/Gas controls. */
  onWeaponChange() {
    const select = document.getElementById('sh-weapon-preset');
    if (!select || !select.value) return;
    this.currentProfile = ShootingEngine.getProfile(select.value);
    this.renderWeaponStats();
    this.updateRangeDisplay();

    const rapidFireX = ShootingEngine.parseRapidFireX(this.currentProfile.traits);
    const wrap = document.getElementById('sh-rapidfire-wrap');
    const input = document.getElementById('sh-firepower-count');
    if (wrap && input) {
      if (rapidFireX) {
        wrap.style.display = '';
        input.max = rapidFireX;
        if (parseInt(input.value, 10) > rapidFireX || !input.value) input.value = 1;
      } else {
        wrap.style.display = 'none';
      }
    }

    const hasGas = (this.currentProfile.traits || []).includes('Gas');
    const noSaveCheckbox = document.getElementById('sh-no-save');
    if (noSaveCheckbox) {
      noSaveCheckbox.checked = hasGas;
      noSaveCheckbox.disabled = hasGas;
    }

    ['sh-hit-results', 'sh-wound-results', 'sh-save-results', 'sh-damage-results', 'sh-injury-results'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
  },

  /** Render the read-only weapon stat block + trait chips for the selected profile. */
  renderWeaponStats() {
    const container = document.getElementById('sh-weapon-stats');
    if (!container || !this.currentProfile) return;
    const p = this.currentProfile;
    const traits = (p.traits || []).join(', ') || '&mdash;';
    const isTemplate = (p.traits || []).includes('Template');
    const ammoThreshold = ShootingEngine.parseAmmoThreshold(p.traits);
    container.innerHTML = `
      <table class="weapon-profiles-table">
        <thead><tr><th>Rng S</th><th>Rng L</th><th>Str</th><th>AP</th><th>Ammo</th><th>Lethality</th></tr></thead>
        <tbody><tr>
          <td>${isTemplate ? 'Template' : this.formatRange(p.short_range)}</td>
          <td>${isTemplate ? 'Template' : this.formatRange(p.long_range)}</td>
          <td>${p.strength}</td>
          <td>${p.ap ? p.ap : '-'}</td>
          <td>${ammoThreshold ? `${ammoThreshold}+` : '-'}</td>
          <td>${p.lethality}</td>
        </tr></tbody>
      </table>
      <p class="text-base mt-10"><b>Traits:</b> ${traits}</p>
    `;
  },

  // ── Step 2: Measure Range ───────────────────────────────────────────

  /** Recompute the range band/cover modifier from the selected range band and refresh the display. */
  updateRangeDisplay() {
    const container = document.getElementById('sh-range-result');
    if (!container || !this.currentProfile) return;

    const band = document.getElementById('sh-range-band')?.value || 'short';
    const inCover = document.getElementById('sh-target-cover')?.checked;
    this.currentRangeInfo = ShootingEngine.computeRangeBand(this.currentProfile, band);

    const bandLabels = { template: 'Template (always in range)', short: 'Short Range', long: 'Long Range' };
    const coverText = inCover ? ` | Cover Save bonus: +${this.currentRangeInfo.coverMod}` : '';

    container.innerHTML = `<p class="text-base"><b>${bandLabels[this.currentRangeInfo.band]}</b>${coverText}</p>`;
  },

  // ── Step 3: Make the Hit Roll ────────────────────────────────────────

  /** Roll to Hit: handles out-of-range auto-miss, natural 1/6, Rapid Fire/Firepower dice, and Ammo checks. */
  async onRollHit() {
    const container = document.getElementById('sh-hit-results');
    if (!container || !this.currentProfile || !this.currentRangeInfo) return;

    const bsTarget = parseInt(document.getElementById('sh-bs')?.value || '4', 10);
    const result = ShootingEngine.rollHit({
      bsTarget,
      inRange: this.currentRangeInfo.inRange,
    });

    const rapidFireX = ShootingEngine.parseRapidFireX(this.currentProfile.traits);
    const firepowerCount = rapidFireX ? parseInt(document.getElementById('sh-firepower-count')?.value || '1', 10) : 0;
    let firepowerResult = null;
    if (result.hit && firepowerCount > 0) {
      firepowerResult = ShootingEngine.rollFirepower(firepowerCount);
    }

    const ammoResult = result.autoMiss ? null : ShootingEngine.resolveAmmo(this.currentProfile, firepowerResult);

    const rollStrings = [];
    if (result.autoMiss) {
      rollStrings.push('Out of range — automatic miss');
    } else {
      rollStrings.push(`Hit roll: ${result.roll}${result.natural1 ? ' (natural 1)' : ''}${result.natural6 ? ' (natural 6)' : ''} — ${result.hit ? 'HIT' : 'MISS'}`);
      if (firepowerResult) rollStrings.push(`Firepower: [${firepowerResult.rolls.map(r => r.roll).join(', ')}] = ${firepowerResult.totalShots} hits`);
    }
    TimerUtil.markRun('shootingLastRun', rollStrings);

    const div = document.createElement('div');
    div.className = `result-box ${result.hit ? 'result-box-green' : 'result-box-red'}`;

    let html = '';
    if (result.autoMiss) {
      html += `<div class="result-heading result-name">${Icons.warning} Out of Range</div><div class="result-effect">The target is beyond this weapon's Long range — the attack automatically misses.</div>`;
    } else {
      const rollNote = result.natural1 ? ' (Natural 1 — always misses)' : result.natural6 ? ' (Natural 6 — always hits)' : ` (vs ${bsTarget}+)`;
      html += `<div class="result-roll-info text-small mb-5">D6: ${result.roll}${rollNote}</div>`;
      html += `<div class="result-heading result-name"><b>${result.hit ? 'HIT!' : 'Miss'}</b></div>`;
      if (firepowerResult) {
        html += `<div class="result-effect">Firepower dice: [${firepowerResult.rolls.map(r => r.roll).join(', ')}] &rarr; <b>${firepowerResult.totalShots} Hit(s)</b> to resolve.</div>`;
      }
    }
    div.innerHTML = html;

    await animatedReplace(container, div);

    if (ammoResult && ammoResult.checked) {
      container.appendChild(this.buildAmmoResultBox(ammoResult));
    } else if (ammoResult && ammoResult.note) {
      const note = document.createElement('div');
      note.className = 'text-small text-muted mt-10 pop-in';
      note.textContent = ammoResult.note;
      container.appendChild(note);
    }

    if (!result.hit && !result.autoMiss && document.getElementById('sh-arbitrator-stray')?.checked) {
      container.appendChild(this.buildStrayShotControl());
    }
  },

  buildAmmoResultBox(ammoResult) {
    const box = document.createElement('div');
    box.className = `result-box mt-10 pop-in ${ammoResult.jammed ? 'result-box-red' : ammoResult.outOfAmmo ? 'result-box-yellow' : 'result-box-grey'}`;
    let text;
    if (ammoResult.jammed) {
      text = `${Icons.warning} <b>Weapon Jammed!</b> It cannot be used again this battle.`;
    } else if (ammoResult.outOfAmmo) {
      text = `${Icons.warning} <b>Out of Ammo.</b> A Reload action is needed before this weapon can be used again.`;
    } else {
      text = `${Icons.circleCheck} Ammo check passed.`;
    }
    const rollInfo = ammoResult.symbols !== undefined
      ? `Ammo symbols rolled: ${ammoResult.symbols}`
      : `D6: ${ammoResult.roll} vs ${ammoResult.threshold}+`;
    box.innerHTML = `<div class="result-roll-info text-small mb-5">${rollInfo}</div><div class="result-effect">${text}</div>`;
    return box;
  },

  buildStrayShotControl() {
    const wrap = document.createElement('div');
    wrap.className = 'mt-15 pop-in';
    wrap.innerHTML = `
      <p class="text-base mb-5"><b>Arbitrator's Toolkit — Stray Shots:</b> roll for each model within 1" of the line of fire, starting with the closest to the attacker.</p>
      <button class="sh-roll-stray-btn">Roll Stray Shot</button>
      <div class="sh-stray-results mt-10"></div>
    `;
    wrap.querySelector('.sh-roll-stray-btn').addEventListener('click', () => {
      const result = ShootingEngine.rollStrayShot();
      const box = document.createElement('div');
      box.className = `result-box ${result.hit ? 'result-box-red' : 'result-box-grey'} pop-in mt-5`;
      box.innerHTML = `D6: ${result.roll} — ${result.hit ? '<b>HIT!</b>' : 'Misses — move to the next model.'}`;
      wrap.querySelector('.sh-stray-results').appendChild(box);
    });
    return wrap;
  },

  // ── Step 4: Resolve Hits ────────────────────────────────────────────

  async onRollWound() {
    const container = document.getElementById('sh-wound-results');
    if (!container || !this.currentProfile) return;

    const tough = parseInt(document.getElementById('sh-toughness')?.value || '3', 10);
    const result = ShootingEngine.rollWound(this.currentProfile.strength, tough);

    TimerUtil.recordRolls('shootingLastRun', [`Wound roll: ${result.roll} vs ${result.threshold}+`]);

    const div = document.createElement('div');
    div.className = `result-box ${result.wounded ? 'result-box-green' : 'result-box-grey'}`;
    div.innerHTML = `<div class="result-roll-info text-small mb-5">D6: ${result.roll} (needed ${result.threshold}+)</div>
      <div class="result-heading result-name"><b>${result.wounded ? 'Wounded!' : 'No Wound'}</b></div>`;
    await animatedReplace(container, div);
  },

  onInvulnChange() {
    const checked = document.getElementById('sh-invuln-check')?.checked;
    const invulnValue = document.getElementById('sh-invuln-value');
    if (invulnValue) invulnValue.disabled = !checked;
  },

  async onRollSave() {
    const container = document.getElementById('sh-save-results');
    if (!container || !this.currentProfile) return;

    const invulnerable = document.getElementById('sh-invuln-check')?.checked;
    const noSave = document.getElementById('sh-no-save')?.checked;
    const saveTarget = invulnerable
      ? parseInt(document.getElementById('sh-invuln-value')?.value || '0', 10)
      : (document.getElementById('sh-save')?.value ? parseInt(document.getElementById('sh-save').value, 10) : null);
    const inCover = document.getElementById('sh-target-cover')?.checked;
    const coverMod = inCover ? (this.currentRangeInfo?.coverMod || 0) : 0;

    const result = ShootingEngine.rollSave({
      saveTarget,
      ap: this.currentProfile.ap || 0,
      coverMod,
      invulnerable,
      noSave,
    });

    const saveRollLabel = result.noSave ? 'No Save allowed' : result.saveTarget === null ? 'No Save characteristic' : `Save roll: ${result.roll}`;
    TimerUtil.recordRolls('shootingLastRun', [saveRollLabel]);

    const div = document.createElement('div');
    let html;
    if (result.noSave) {
      div.className = 'result-box result-box-red';
      html = `<div class="result-heading result-name"><b>No Save Allowed</b></div><div class="result-effect">This Hit cannot be saved against.</div>`;
    } else if (result.saveTarget === null) {
      div.className = 'result-box result-box-red';
      html = `<div class="result-heading result-name"><b>No Save Characteristic</b></div><div class="result-effect">This model has no applicable Save.</div>`;
    } else {
      div.className = `result-box ${result.saved ? 'result-box-green' : 'result-box-red'}`;
      const modText = invulnerable ? ' (Invulnerable — ignores AP & Cover)' : ` (AP ${this.currentProfile.ap || 0}, Cover +${coverMod})`;
      const rollNote = result.autoFail ? ' (Natural 1/2 — always fails)' : '';
      html = `<div class="result-roll-info text-small mb-5">D6: ${result.roll} &rarr; ${result.total}${modText}${rollNote} vs ${result.saveTarget}+</div>
        <div class="result-heading result-name"><b>${result.saved ? 'Saved!' : 'Failed Save'}</b></div>`;
    }
    div.innerHTML = html;
    await animatedReplace(container, div);
  },

  async onInflictDamage() {
    const container = document.getElementById('sh-damage-results');
    const injuryContainer = document.getElementById('sh-injury-results');
    if (!container || !this.currentProfile) return;

    const woundsInput = document.getElementById('sh-wounds-remaining');
    const before = parseInt(woundsInput?.value || '1', 10);
    const dam = this.currentProfile.dam || 1; // schema has no per-weapon Damage value; assume 1
    const after = Math.max(0, before - dam);
    if (woundsInput) woundsInput.value = after;

    const div = document.createElement('div');
    div.className = 'result-box result-box-blue';
    div.innerHTML = `<div class="result-effect">Wounds: ${before} &rarr; <b>${after}</b> (Damage ${dam})</div>`;
    await animatedReplace(container, div);

    if (after <= 0) {
      const lethality = this.currentProfile.lethality || 1;
      const injuries = ShootingEngine.rollInjuryDice(lethality);
      const colourMap = { Injured: 'yellow', 'Serious Injury': 'red', 'Out of Action': 'black' };
      const iconMap = { Injured: Icons.warning, 'Serious Injury': Icons.hospital, 'Out of Action': Icons.skull };

      const wrap = document.createElement('div');
      wrap.className = 'mt-15 pop-in';
      wrap.innerHTML = `<p class="text-base mb-5"><b>Roll ${lethality} Injury ${lethality > 1 ? 'dice' : 'die'} — select which result to apply:</b></p>`;
      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.gap = '0.5rem';
      btnRow.style.flexWrap = 'wrap';
      injuries.forEach((inj, i) => {
        const btn = document.createElement('button');
        btn.className = `result-box result-box-${colourMap[inj.label]}`;
        btn.style.cursor = 'pointer';
        btn.style.flex = '1 1 auto';
        btn.innerHTML = `<div class="result-roll-info text-small mb-5">D6: ${inj.roll}</div><div class="result-heading">${iconMap[inj.label]} <b>${inj.label}</b></div>`;
        btn.addEventListener('click', () => {
          btnRow.querySelectorAll('button').forEach(b => b.style.outline = '');
          btn.style.outline = '3px solid #333';
          const chosen = document.createElement('div');
          chosen.className = 'result-box result-box-purple mt-10 pop-in';
          chosen.innerHTML = `Applied result: <b>${inj.label}</b>`;
          const existing = wrap.querySelector('.sh-injury-chosen');
          if (existing) existing.remove();
          chosen.classList.add('sh-injury-chosen');
          wrap.appendChild(chosen);
        });
        btnRow.appendChild(btn);
      });
      wrap.appendChild(btnRow);
      injuryContainer.innerHTML = '';
      injuryContainer.appendChild(wrap);
    } else {
      injuryContainer.innerHTML = '';
    }
  },

  async onRollNerve() {
    const container = document.getElementById('sh-nerve-results');
    if (!container) return;
    const cool = parseInt(document.getElementById('sh-cool')?.value || '7', 10);
    const result = ShootingEngine.rollCoolCheck(cool);

    const div = document.createElement('div');
    div.className = `result-box ${result.passed ? 'result-box-green' : 'result-box-red'}`;
    div.innerHTML = `<div class="result-roll-info text-small mb-5">D6: ${result.roll} vs ${result.threshold}+</div>
      <div class="result-heading result-name"><b>${result.passed ? 'Nerve Held' : 'Suppressed!'}</b></div>`;
    await animatedReplace(container, div);
  },

  // ── Reference tables ────────────────────────────────────────────────

  renderWeaponTraits() {
    const container = document.getElementById('sh-weapon-traits-container');
    if (!container || !this.weaponTraitsData || !this.weaponTraitsData.weapon_traits) return;
    container.innerHTML = Object.values(this.weaponTraitsData.weapon_traits).map(trait =>
      `<details class="reference-tables-collapsible"><summary>${trait.name}</summary>${trait.description}</details>`
    ).join('');
  },

  renderWeaponTable() {
    const container = document.getElementById('sh-weapon-table-container');
    if (!container) return;
    const options = ShootingEngine.getWeaponOptions();
    const rows = options.map(opt => {
      const p = opt.profile;
      const isTemplate = (p.traits || []).includes('Template');
      const ammoThreshold = ShootingEngine.parseAmmoThreshold(p.traits);
      return `<tr>
        <td>${opt.category}</td>
        <td><b>${p.name}</b></td>
        <td>${isTemplate ? 'Template' : this.formatRange(p.short_range)}</td>
        <td>${isTemplate ? 'Template' : this.formatRange(p.long_range)}</td>
        <td>${p.strength}</td>
        <td>${p.ap ? p.ap : '-'}</td>
        <td>${ammoThreshold ? `${ammoThreshold}+` : '-'}</td>
        <td>${p.lethality}</td>
        <td>${(p.traits || []).join(', ') || '-'}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <table class="weapon-profiles-table">
        <thead><tr><th>Category</th><th>Name</th><th>Rng S</th><th>Rng L</th><th>Str</th><th>AP</th><th>Ammo</th><th>Lethality</th><th>Traits</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },
};
