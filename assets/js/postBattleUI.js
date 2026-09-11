/**
 * postBattleUI.js — Front-end for the Post-Battle sequence page.
 *
 * Renders sections for each step a player might perform after a battle:
 *   - Succumb test (D6, triggers lasting injury on failure)
 *   - Lasting injury resolution (delegates to LastingInjuriesEngine)
 *   - Escape test with condition modifiers
 *   - Ransom — captured fighters suffer a lasting injury
 *   - Critical injury treatment (Rogue Doc with cost/refuse)
 *   - Chaos mutation test (identical panel to LastingInjuriesUI)
 *
 * Exposes `testInjury(roll)` to console for developer testing.
 *
 * Depends on: dice.js, icons.js, timer.js, postBattleEngine.js,
 *             lastingInjuriesEngine.js, injuryRenderer.js
 */

import { Icons } from './icons.js';
import { TimerUtil } from './timer.js';
import { PostBattleEngine } from './postBattleEngine.js';
import { LastingInjuriesEngine } from './lastingInjuriesEngine.js';
import { InjuryRenderer } from './injuryRenderer.js';
import { fetchJSON } from './dataLoader.js';
import { animatedReplace, delay, moveMutationSections } from './uiUtils.js';

export const PostBattleUI = {

  /**
   * Load injury data for use by the Succumb/Ransom/Critical Injury
   * sections, wire up events/timer, and expose `testInjury(roll)` on
   * `window` for console testing.
   * @param {string} jsonPath - Path to lastingInjuries.json.
   * @returns {Promise<void>}
   */
  async init(jsonPath) {
    try {
      const data = await fetchJSON(jsonPath);
      LastingInjuriesEngine.loadInjuries(data);

      this.bindEvents();
      this.initTimers();

      window.testInjury = (roll) => {
        const result = LastingInjuriesEngine.testRoll(roll);
        if (result) {
          this.displayInjuryResult(result, 'pb-injury-results');
          console.log('Test result for roll ' + roll + ':', result);
        }
      };

      console.log('%c💉 Injury Testing Enabled', 'color: #c71585; font-weight: bold; font-size: 14px;');
      console.log('Use: testInjury(roll) - e.g., testInjury(11) for D66 modes or testInjury(6) for Ironman mode');
    } catch (err) {
      console.error(err);
    }
  },

  /**
   * Wire every button/selector on the post-battle sequence page: injury
   * mode selector, succumb roll, injury resolve, escape roll, ransom
   * injury, critical injury treatment, Trading Post rarity roll, and the
   * mutually-exclusive "Draw"/"Lost" capture checkboxes.
   */
  bindEvents() {
    // Mode selector → update LastingInjuriesEngine
    const modeSelector = document.getElementById('pb-injury-mode');
    if (modeSelector) {
      modeSelector.addEventListener('change', (e) => {
        LastingInjuriesEngine.setMode(e.target.value);
        ['pb-injury-cyberteknika', 'pb-ransom-injury-cyberteknika', 'pb-critical-injury-cyberteknika'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.innerHTML = '';
        });
      });
    }

    // Roll D6 to Succumb button
    const rollBtn = document.getElementById('pb-roll-succumb');
    if (rollBtn) {
      rollBtn.addEventListener('click', () => this.onRollSuccumb());
    }

    // Resolve Lasting Injury button
    const resolveBtn = document.getElementById('pb-resolve-injury');
    if (resolveBtn) {
      resolveBtn.addEventListener('click', () => this.onResolveInjury());
    }

    // Roll to Escape button
    const escapeBtn = document.getElementById('pb-roll-escape');
    if (escapeBtn) {
      escapeBtn.addEventListener('click', () => this.onRollEscape());
    }

    // Ransom lasting injury button (always visible)
    const ransomBtn = document.getElementById('pb-resolve-ransom-injury');
    if (ransomBtn) {
      ransomBtn.addEventListener('click', () => this.onResolveRansomInjury());
    }

    // Critical injury treatment button
    const criticalBtn = document.getElementById('pb-resolve-critical-injury');
    if (criticalBtn) {
      criticalBtn.addEventListener('click', () => this.onResolveCriticalInjury());
    }

    // Trading Post rarity / illegal level roll
    const rarityBtn = document.getElementById('pb-roll-rarity');
    if (rarityBtn) {
      rarityBtn.addEventListener('click', () => this.onRollRarityLevel());
    }

    // Draw / Lost are mutually exclusive
    const drawBox = document.getElementById('pb-cap-draw');
    const lostBox = document.getElementById('pb-cap-lost');
    if (drawBox && lostBox) {
      drawBox.addEventListener('change', () => { if (drawBox.checked) lostBox.checked = false; });
      lostBox.addEventListener('change', () => { if (lostBox.checked) drawBox.checked = false; });
    }
  },

  /** Initialize the "time since last run" display and register cleanup on page navigation. */
  initTimers() {
    TimerUtil.init('page-roll-info', 'postBattleLastRun');
    TimerUtil.setupPageCleanup();
  },

  /**
   * Read all Trading Post modifier inputs (leader, champions, savvy,
   * reputation, underhive), roll 2D6 + modifier via `PostBattleEngine`,
   * record it in the run timer, display the result, and show an
   * "Apply Whisper Merchant" button to reroll one die as a 6.
   * @returns {Promise<void>}
   */
  async onRollRarityLevel() {
    const alignment = document.getElementById('pb-tp-alignment')?.value ?? 'lawabiding';
    const leader     = document.getElementById('pb-tp-leader')?.checked ?  2 : 0;
    const champions  = parseInt(document.getElementById('pb-tp-champions')?.value  || '0', 10);
    const savvy      = parseInt(document.getElementById('pb-tp-savvy')?.value      || '0', 10);
    const rep        = parseInt(document.getElementById('pb-tp-rep')?.value        || '0', 10);
    const repMod     = Math.floor(rep / 10);
    const underhive  = parseInt(document.getElementById('pb-tp-underhive')?.value  || '0', 10) * 2;
    const modifier   = leader + champions + savvy + repMod + underhive;

    const result = PostBattleEngine.rollRarityLevel(modifier);
    result.alignment = alignment;
    this._lastRarityResult = result;

    const whisperContainer = document.getElementById('pb-rarity-whisper');
    if (whisperContainer) whisperContainer.innerHTML = '';

    if (typeof TimerUtil !== 'undefined') {
      const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
      const isLawAbiding = alignment === 'lawabiding';
      TimerUtil.markRun('postBattleLastRun', [
        `[Trading Post] 2D6: [${result.die1}, ${result.die2}]`,
        `Mod: ${modStr}`,
        isLawAbiding ? `Rare: ${result.total} / Illegal: ${result.total - 4}` : `Total: ${result.total}`,
      ]);
    }

    const container = document.getElementById('pb-rarity-results');
    if (!container) return;
    await animatedReplace(container, this._buildRarityResultDiv(result));

    if (whisperContainer) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary pop-in mt-20';
      btn.textContent = 'Apply Whisper Merchant';
      btn.addEventListener('click', () => {
        btn.disabled = true;
        this.onApplyWhisperMerchant();
        btn.remove();
      });
      whisperContainer.appendChild(btn);
    }
  },

  /**
   * Apply the Whisper Merchant bonus (replace the lower die with a 6) to
   * the last rarity roll, record the adjustment in the run timer, and
   * re-render the result.
   */
  onApplyWhisperMerchant() {
    if (!this._lastRarityResult) return;
    const result = PostBattleEngine.applyWhisperMerchant(this._lastRarityResult);
    this._lastRarityResult = result;

    if (typeof TimerUtil !== 'undefined') {
      const d1Label = result.effectiveDie1 !== result.die1 ? `${result.effectiveDie1}*` : `${result.die1}`;
      const d2Label = result.effectiveDie2 !== result.die2 ? `${result.effectiveDie2}*` : `${result.die2}`;
      const modStr  = result.modifier >= 0 ? `+${result.modifier}` : `${result.modifier}`;
      const isLawAbiding = result.alignment === 'lawabiding';
      TimerUtil.recordRolls('postBattleLastRun', [
        `[+Whisper] 2D6: [${d1Label}, ${d2Label}]`,
        `Mod: ${modStr}`,
        isLawAbiding ? `Rare: ${result.total} / Illegal: ${result.total - 4}` : `Total: ${result.total}`,
      ]);
    }

    const container = document.getElementById('pb-rarity-results');
    if (!container) return;
    animatedReplace(container, this._buildRarityResultDiv(result));
  },

  /**
   * @param {Object} result - Rarity roll result from `PostBattleEngine.rollRarityLevel()`/`.applyWhisperMerchant()`.
   * @returns {HTMLDivElement} Result box showing dice, modifier, and rare/illegal totals.
   */
  _buildRarityResultDiv(result) {
    const d1Html = result.whisperMerchant && result.effectiveDie1 !== result.die1
      ? `<b>${result.effectiveDie1}*</b>` : `${result.effectiveDie1}`;
    const d2Html = result.whisperMerchant && result.effectiveDie2 !== result.die2
      ? `<b>${result.effectiveDie2}*</b>` : `${result.effectiveDie2}`;
    const modStr      = result.modifier >= 0 ? `+${result.modifier}` : `${result.modifier}`;
    const whisperNote = result.whisperMerchant
      ? ' <span style="font-size:0.85em;">(*Whisper Merchant)</span>' : '';

    const isLawAbiding = result.alignment === 'lawabiding';
    const heading = isLawAbiding
      ? `Rare: ${result.total} &nbsp;&ndash;&ndash;&nbsp; Illegal: ${result.total - 4}`
      : `Rarity / Illegal Level: ${result.total}`;

    const box = document.createElement('div');
    box.className = 'result-box result-box-blue result-box-primary mt-20';
    box.innerHTML = `
      <h3 class="result-heading mt-0 mb-0">${heading}</h3>
      <div class="result-effect mt-10">2D6: [${d1Html}, ${d2Html}] ${modStr} = ${result.total}${whisperNote}</div>
    `;
    return box;
  },

  /**
   * Read the capture-condition checkboxes (draw, lost, webbed, skinblade),
   * roll the escape test via `PostBattleEngine`, record it in the run
   * timer, and display the outcome (escaped / captured).
   */
  onRollEscape() {
    const draw      = document.getElementById('pb-cap-draw')?.checked     ? -1 : 0;
    const lost      = document.getElementById('pb-cap-lost')?.checked     ? -2 : 0;
    const webbed    = document.getElementById('pb-cap-webbed')?.checked   ? -2 : 0;
    const skinblade = document.getElementById('pb-cap-skinblade')?.checked ?  2 : 0;
    const modifier  = draw + lost + webbed + skinblade;

    const { roll, total, natural6, escaped } = PostBattleEngine.rollEscape(modifier);

    if (typeof TimerUtil !== 'undefined') {
      const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
      const timerRolls = [`[Escape] D6: ${roll}`, `Mod: ${modStr}`, `Total: ${total}`];
      if (natural6) timerRolls.push('Natural 6!');
      TimerUtil.markRun('postBattleLastRun', timerRolls);
    }

    const container = document.getElementById('pb-escape-results');
    if (!container) return;

    let colour, heading;

    if (natural6) {
      colour  = 'green';
      heading = 'Natural 6 — Fighter Escapes!';
    } else if (escaped) {
      colour  = 'green';
      heading = '4+ Fighter Escapes!';
    } else {
      colour  = 'red';
      heading = '3- Fighter is Captured';
    }

    const div = document.createElement('div');
    div.className = `result-box result-box-${colour} result-box-primary mt-20`;
    div.innerHTML = `<h3 class="result-heading mt-0 mb-0">${heading}</h3>`;
    animatedReplace(container, div);
  },

  /**
   * Roll the Succumb test, record it in the run timer, display the
   * outcome, and show/hide the "Resolve Lasting Injury" button based on
   * whether the fighter succumbed.
   * @returns {Promise<void>}
   */
  async onRollSuccumb() {
    const { roll, succumbed } = PostBattleEngine.rollSuccumb();

    if (typeof TimerUtil !== 'undefined') {
      TimerUtil.markRun('postBattleLastRun', [`[Succumb] D6: ${roll}`]);
    }

    const succumbResults = document.getElementById('pb-succumb-results');
    const resolveBtn = document.getElementById('pb-resolve-injury');
    const injuryResults = document.getElementById('pb-injury-results');

    // Clear previous injury result whenever we re-roll succumb
    if (injuryResults) injuryResults.innerHTML = '';
    const cyberteknikaResults = document.getElementById('pb-injury-cyberteknika');
    if (cyberteknikaResults) cyberteknikaResults.innerHTML = '';

    if (succumbResults) {
      const colour = succumbed ? 'red' : 'green';
      const label = succumbed
        ? `2- Suffer a Lasting Injury!`
        : `3+ Okay, no lasting injury.`;
      const div = document.createElement('div');
      div.className = `result-box result-box-${colour}`;
      div.textContent = label;
      await animatedReplace(succumbResults, div);
    }

    // Show/hide the Resolve Lasting Injury button
    if (resolveBtn) {
      resolveBtn.style.display = succumbed ? '' : 'none';
    }
  },

  /** Roll a lasting injury for a succumbed fighter, record it in the run timer, and display the result in the main injury panel. */
  onResolveInjury() {
    const result = LastingInjuriesEngine.resolveInjury();

    if (typeof TimerUtil !== 'undefined' && result) {
      const modeData = LastingInjuriesEngine.getCurrentModeData();
      const sides = modeData && modeData.sides;
      const diceLabel = sides === 'd66' ? 'D66' : `D${sides}`;
      TimerUtil.markRun('postBattleLastRun', this.buildInjuryRolls(result, diceLabel, '[Lasting Injury]'));
    }

    this.displayInjuryResult(result, 'pb-injury-results', 'pb-injury-cyberteknika', 'pb-injury-mutation');
  },

  /** Roll a lasting injury for a ransomed/captured fighter, record it in the run timer, and display the result in the ransom injury panel. */
  onResolveRansomInjury() {
    const result = LastingInjuriesEngine.resolveInjury();

    if (typeof TimerUtil !== 'undefined' && result) {
      const modeData = LastingInjuriesEngine.getCurrentModeData();
      const sides = modeData && modeData.sides;
      const diceLabel = sides === 'd66' ? 'D66' : `D${sides}`;
      TimerUtil.markRun('postBattleLastRun', this.buildInjuryRolls(result, diceLabel, '[Ransom]'));
    }

    this.displayInjuryResult(result, 'pb-ransom-injury-results', 'pb-ransom-injury-cyberteknika', 'pb-ransom-injury-mutation');
  },

  /**
   * Flatten a resolved injury result into a list of roll-history strings
   * for the run timer (main roll, any type-specific random-effect roll,
   * and any additional injuries).
   * @param {Object} result - Result from `LastingInjuriesEngine.resolveInjury()`.
   * @param {string} diceLabel - 'D6' or 'D66', matching the current injury mode.
   * @param {string} [prefix=''] - Optional label prefix (e.g. '[Ransom]').
   * @returns {string[]} Roll descriptions for the timer history.
   */
  buildInjuryRolls(result, diceLabel, prefix = '') {
    const firstRoll = prefix ? `${prefix} ${diceLabel}: ${result.roll}` : `${diceLabel}: ${result.roll}`;
    const rolls = [firstRoll];

    if (result.randomRoll) {
      if (result.injury.randomeffect === 'd3xpgain') {
        rolls.push(`D3 XP: ${result.randomRoll.value}`);
      } else if (result.injury.randomeffect === 'd3multipleinjuries') {
        rolls.push(`D3 injuries: ${result.randomRoll.value}`);
      } else if (result.injury.randomeffect === 'd3multipleglitches') {
        rolls.push(`D3 glitches: ${result.randomRoll.value}`);
      }
    }

    if (result.additionalInjuries && result.additionalInjuries.length > 0) {
      result.additionalInjuries.forEach((injResult, i) => {
        rolls.push(`${diceLabel} #${i + 1}: ${injResult.roll}`);
        if (injResult.randomRoll && injResult.injury.randomeffect === 'd3xpgain') {
          rolls.push(`D3 XP: ${injResult.randomRoll.value}`);
        }
      });
    }

    return rolls;
  },

  /**
   * Handle the "Resolve Critical Injury" button: if the selected Rogue Doc
   * mode has a credit cost, show the cost-confirmation panel first;
   * otherwise resolve treatment immediately (free Hanger-on variant).
   */
  onResolveCriticalInjury() {
    if (typeof TimerUtil !== 'undefined') {
      TimerUtil.markRun('postBattleLastRun', ['[Critical Injury]']);
    }

    const modeSelector = document.getElementById('pb-rogue-doc-mode');
    const mode = modeSelector ? modeSelector.value : 'trading_post_rogue_doc';
    const gangSelector = document.getElementById('pb-rogue-doc-gang');
    const gangId = gangSelector?.checked ? 'genestealer_cult' : null;

    const modeData = LastingInjuriesEngine.injuriesData?.[mode];
    if (modeData?.cost) {
      this.showCriticalInjuryCost(mode, gangId);
    } else {
      const result = LastingInjuriesEngine.resolveRogueDoc(mode);
      this.displayCriticalRogueDocResult(result);
    }
  },

  /**
   * Roll and display the Rogue Doc treatment cost, with buttons to proceed
   * (pay and resolve treatment) or refuse (fighter dies).
   * @param {string} mode - Rogue Doc variant key (e.g. 'trading_post_rogue_doc').
   * @param {string|null} [gangId=null] - Gang-specific cost override key (e.g. 'genestealer_cult'), or null.
   */
  showCriticalInjuryCost(mode, gangId = null) {
    const costResult = LastingInjuriesEngine.calculateRogueDocCost(mode, gangId);
    const container = document.getElementById('pb-critical-injury-results');
    if (!container) return;

    if (costResult === null) {
      container.innerHTML = '<div class="error-box">Error: Injury data not loaded. Please refresh the page.</div>';
      return;
    }

    const { total: cost, rolls, costConfig } = costResult;
    const rollLabel = `${costConfig.count}D${costConfig.sides}: [${rolls.join(', ')}]`;

    if (typeof TimerUtil !== 'undefined') {
      TimerUtil.recordRolls('postBattleLastRun', ['[Critical Injury]', `Cost: ${cost} credits (${rollLabel})`]);
    }

    const costDiv = document.createElement('div');
    costDiv.className = 'cost-box';
    costDiv.innerHTML = `
      <h2>Treatment Cost</h2>
      <h1>${cost} credits</h1>
      <p class="text-base mb-20">Do you want to proceed with treatment?</p>
      <div class="flex-center">
        <button id="pb-proceed-critical-treatment" class="btn btn-success">Proceed with Treatment</button>
        <button id="pb-refuse-critical-treatment" class="btn btn-danger">Refuse Treatment</button>
      </div>
    `;

    costDiv.querySelector('#pb-proceed-critical-treatment').addEventListener('click', () => {
      const result = LastingInjuriesEngine.resolveRogueDoc(mode, cost);
      result.costRolls = rolls;
      this.displayCriticalRogueDocResult(result);
    });
    costDiv.querySelector('#pb-refuse-critical-treatment').addEventListener('click', () => {
      this.displayCriticalFighterDeath();
    });

    animatedReplace(container, costDiv);
  },

  /** Render the "Fighter Dies" outcome shown when treatment is refused, clearing any leftover cyberteknika/mutation check panels. */
  displayCriticalFighterDeath() {
    const container = document.getElementById('pb-critical-injury-results');
    if (!container) return;

    const cyberteknikaContainer = document.getElementById('pb-critical-injury-cyberteknika');
    if (cyberteknikaContainer) cyberteknikaContainer.innerHTML = '';
    const mutContainer = document.getElementById('pb-critical-injury-mutation');
    if (mutContainer) mutContainer.innerHTML = '';

    const div = document.createElement('div');
    div.className = 'death-box';
    div.innerHTML = `
      <h2 class="mt-0">${Icons.skull} Fighter Dies ${Icons.skull}</h2>
      <p class="text-base mb-0">Without medical treatment, the fighter succumbs to their injuries and dies.<br><br>You recover their equipment (except armour).</p>
    `;
    animatedReplace(container, div);
  },

  /**
   * Animate in the Rogue Doc treatment result (via `InjuryRenderer`),
   * record all associated rolls in the run timer, then reveal the
   * cyberteknika test button and move any mutation-check sections into
   * their own panel.
   * @param {Object} result - Result from `LastingInjuriesEngine.resolveRogueDoc()`.
   * @returns {Promise<void>}
   */
  async displayCriticalRogueDocResult(result) {
    const container = document.getElementById('pb-critical-injury-results');
    if (!container) return;

    // Clear secondary check buttons immediately so they don't linger during cogitation
    const cybContainer = document.getElementById('pb-critical-injury-cyberteknika');
    if (cybContainer) cybContainer.innerHTML = '';
    const mutContainer = document.getElementById('pb-critical-injury-mutation');
    if (mutContainer) mutContainer.innerHTML = '';

    await InjuryRenderer.renderRogueDocResult(result, container);
    if (typeof TimerUtil !== 'undefined') {
      TimerUtil.recordRolls('postBattleLastRun', this.buildCriticalRogueDocRolls(result));
    }
    await delay(350);

    if (result.stabilisedInjury) {
      InjuryRenderer.renderCyberteknikaButtons(result.stabilisedInjury, document.getElementById('pb-critical-injury-cyberteknika'));
    }

    if (mutContainer) {
      await delay(350);
      moveMutationSections(container, mutContainer);
    }
  },

  /**
   * Flatten a Rogue Doc treatment result into roll-history strings for the
   * run timer (cost roll, treatment roll, and any stabilised-injury rolls).
   * @param {Object} result - Result from `LastingInjuriesEngine.resolveRogueDoc()`.
   * @returns {string[]}
   */
  buildCriticalRogueDocRolls(result) {
    const rolls = ['[Critical Injury]'];
    if (result.cost !== null && result.cost !== undefined) {
      const costRollStr = result.costRolls ? ` (${result.costRolls.length}D6: [${result.costRolls.join(', ')}])` : '';
      rolls.push(`Cost: ${result.cost} credits${costRollStr}`);
    }
    rolls.push(`D6: ${result.roll}`);
    if (result.stabilisedInjury) {
      rolls.push(`Stabilised D66: ${result.stabilisedInjury.roll}`);
      if (result.stabilisedInjury.randomRoll) {
        rolls.push(`${result.stabilisedInjury.randomRoll.type.toUpperCase()}: ${result.stabilisedInjury.randomRoll.value}`);
      }
      if (result.stabilisedInjury.additionalInjuries) {
        result.stabilisedInjury.additionalInjuries.forEach((inj, i) => {
          rolls.push(`Stabilised Additional ${i + 1}: ${inj.roll}`);
        });
      }
    }
    return rolls;
  },

  /**
   * Shared renderer for both the main Lasting Injury panel and the Ransom
   * injury panel: animates in the result box, then reveals the
   * cyberteknika test button and moves any mutation-check sections into
   * their own panel.
   * @param {Object} result - Result from `LastingInjuriesEngine.resolveInjury()`.
   * @param {string} [containerId='pb-injury-results'] - Element ID to render the result into.
   * @param {?string} [cyberteknikaContainerId=null] - Element ID for the cyberteknika test button, if applicable.
   * @param {?string} [mutationContainerId=null] - Element ID to move mutation-check sections into, if applicable.
   * @returns {Promise<void>}
   */
  async displayInjuryResult(result, containerId = 'pb-injury-results', cyberteknikaContainerId = null, mutationContainerId = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Clear secondary check buttons immediately so they don't linger during cogitation
    if (cyberteknikaContainerId) {
      const cybContainer = document.getElementById(cyberteknikaContainerId);
      if (cybContainer) cybContainer.innerHTML = '';
    }
    const mutContainer = mutationContainerId ? document.getElementById(mutationContainerId) : null;
    if (mutContainer) mutContainer.innerHTML = '';

    if (!result || !result.injury) {
      await animatedReplace(container, '<div class="error-box">Failed to resolve injury.</div>');
      return;
    }
    const colour = result.injury.colour || 'grey';
    const isGlitchMode = ['spyrer_hunting_rig_glitches', 'spyrer_hunting_rig_glitches_core'].includes(LastingInjuriesEngine.currentMode);
    const nameText = colour === 'black' ? `${Icons.skull} ${result.injury.name} ${Icons.skull}` : result.injury.name;
    const box = document.createElement('div');
    box.className = `result-box result-box-${colour} result-box-primary mt-20`;
    box.innerHTML = [
      `<h3 class="result-heading mt-0 mb-0">${nameText}</h3>`,
      result.injury.fixedeffect ? `<div class="result-effect mt-10">${result.injury.fixedeffect}</div>` : '',
      result.randomRoll && result.injury.randomeffect === 'd3xpgain'
        ? `<div class="mt-15">Gain ${result.randomRoll.value} XP!</div>` : '',
    ].filter(Boolean).join('');
    const wrapper = document.createElement('div');
    wrapper.appendChild(box);
    InjuryRenderer.appendInjuryResultContent(result, box, wrapper, { isGlitchMode });
    await animatedReplace(container, wrapper);
    await delay(350);

    if (cyberteknikaContainerId) {
      InjuryRenderer.renderCyberteknikaButtons(result, document.getElementById(cyberteknikaContainerId));
    }

    if (mutContainer) {
      await delay(350);
      moveMutationSections(container, mutContainer);
    }
  },

};
