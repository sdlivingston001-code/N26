/**
 * injuryRenderer.js — Shared injury display components.
 *
 * Provides reusable DOM-building helpers for rendering injury results,
 * status warnings (Convalescence / Into Recovery), and cascading
 * additional-injury panels.
 *
 * Used by both LastingInjuriesUI (standalone injuries page) and
 * PostBattleUI (post-battle sequence page) to keep rendering logic
 * consistent across all places where injury results are shown.
 *
 * Depends on: icons.js (Icons.warning, Icons.hospital)
 */

import { Icons } from './icons.js';
import { LastingInjuriesEngine } from './lastingInjuriesEngine.js';
import { animatedReplace } from './uiUtils.js';

/** Animation stagger delays (ms). */
const STAGGER_MS = 150;
const ADDITIONAL_STAGGER_MS = 180;

export const InjuryRenderer = {

  /** Static warning messages used for convalescence / recovery badges. */

  MESSAGES: {
    convalescence: "This fighter cannot make <b>Post Battle Actions</b> (but will be available for the next battle as normal).",
    recovery: "This fighter goes <b>into recovery</b>. They cannot make Post Battle Actions AND they miss the next battle."
  },

  /**
   * Create a styled warning box for convalescence or recovery.
   * @param {'convalescence'|'recovery'} type
   * @param {string} message - HTML text to display.
   * @returns {HTMLDivElement}
   */
  createWarningBox(type, message) {
    const configs = {
      convalescence: { className: "warning-box", icon: Icons.warning, label: "Convalescence" },
      recovery:      { className: "recovery-box", icon: Icons.hospital, label: "Into Recovery" }
    };
    const config = configs[type];
    const div = document.createElement("div");
    div.className = config.className;
    div.innerHTML = `${config.icon} <b>${config.label}:</b> ${message}`;
    return div;
  },

  /**
   * Appends convalescence / recovery warning boxes to a parent element
   * when the injury has the corresponding flag set.
   * @param {Object}      injury   - Injury data object from the engine.
   * @param {HTMLElement}  parentEl - DOM node to append warnings to.
   */
  appendStatusWarnings(injury, parentEl) {
    if (injury.intoRecovery === 1) {
      parentEl.appendChild(this.createWarningBox("recovery", this.MESSAGES.recovery));
    } else if (injury.convalescence === 1) {
      parentEl.appendChild(this.createWarningBox("convalescence", this.MESSAGES.convalescence));
    }
  },

  /**
   * Format a random-effect value for inline display (e.g. "Gain 2 XP!").
   * @param {string|null} randomeffect - Effect key from injury data.
   * @param {{ type: string, value: number }|null} randomRoll - Roll result.
   * @returns {string}
   */
  formatRandomEffect(randomeffect, randomRoll) {
    if (!randomRoll) return randomeffect;
    if (randomeffect === 'd3xpgain') return `Gain ${randomRoll.value} XP!`;
    return randomeffect;
  },

  /**
   * Return a human-readable label for reference-table display.
   * @param {string|null} randomeffect
   * @returns {string|null}
   */
  formatRandomEffectLabel(randomeffect) {
    if (!randomeffect) return null;
    if (randomeffect === 'd3xpgain') return 'Gain D3 XP.';
    if (randomeffect === 'd3multipleinjuries') return 'Suffer D3 Lasting Injuries (ignoring Captured, Multiple Injuries, Memorable Death, Critical Injury, or Out Cold).';
    if (randomeffect === 'd3multipleglitches') return 'Suffer D3 Hunting Rig glitches (ignoring Multiple Glitches).';
    if (randomeffect === 'stabilisedinjury') return 'Roll a Lasting Injury on the selected table.';
    return randomeffect;
  },

  /**
   * Create a colour-coded result box for a single injury.
   * @param {Object}      injury     - Injury data with name, fixedeffect, randomeffect.
   * @param {string}      colour     - CSS colour key (green/blue/yellow/red/purple/grey/black).
   * @param {string|null} [rollInfo]  - Optional HTML showing the dice roll.
   * @param {Object|null} [randomRoll] - Optional random sub-roll result.
   * @returns {HTMLDivElement}
   */
  createInjuryBox(injury, colour, rollInfo = null, randomRoll = null) {
    const injDiv = document.createElement("div");
    injDiv.className = `result-box result-box-${colour || 'grey'}`;
    injDiv.innerHTML = [
      rollInfo ? `<div class="result-roll-info text-small mb-5">${rollInfo}</div>` : '',
      `<div class="result-heading result-name"><b>${injury.name}</b></div>`,
      injury.fixedeffect ? `<div class="result-effect">${injury.fixedeffect}</div>` : '',
      injury.randomeffect && injury.randomeffect !== 'd3multipleinjuries' && randomRoll
        ? `<div class="result-effect mt-10">${this.formatRandomEffect(injury.randomeffect, randomRoll)}</div>` : '',
    ].filter(Boolean).join('');
    return injDiv;
  },

  /**
   * Render a list of cascading additional injuries (e.g. from "D3 Multiple Injuries").
   * Each sub-injury gets a staggered pop-in animation delay.
   * @param {Object[]|null} injuries             - Array of { injury, roll, randomRoll } objects.
   * @param {HTMLElement}    parentDiv            - DOM node to append the sub-injuries to.
   * @param {string}         [rollLabelFormat='Roll'] - Prefix for roll labels.
   * @param {boolean}        [suppressConvalescence=false] - Suppress convalescence warning when a
   *   recovery warning will be shown elsewhere (e.g. primary injury or outcome carries intoRecovery).
   */
  displayAdditionalInjuries(injuries, parentDiv, rollLabelFormat = 'Roll', suppressConvalescence = false) {
    if (!injuries || injuries.length === 0) return;

    const additionalContainer = document.createElement("div");
    additionalContainer.className = "additional-injuries-container";

    const additionalTitle = document.createElement("h4");
    additionalContainer.appendChild(additionalTitle);

    let hasConvalescence = false;
    let hasRecovery = false;

    injuries.forEach((injuryResult, index) => {
      const injColour = injuryResult.injury.colour || "grey";
      const rollLabel = rollLabelFormat === 'D66'
        ? `<b>D66 Roll:</b> ${injuryResult.roll}`
        : `<b>${rollLabelFormat} ${index + 1}:</b> ${injuryResult.roll}`;

      const injDiv = this.createInjuryBox(injuryResult.injury, injColour, rollLabel, injuryResult.randomRoll);
      if (index > 0) injDiv.classList.add('mt-10');
      injDiv.style.animationDelay = `${(index + 1) * ADDITIONAL_STAGGER_MS}ms`;
      additionalContainer.appendChild(injDiv);

      if (injuryResult.injury.convalescence === 1) hasConvalescence = true;
      if (injuryResult.injury.intoRecovery === 1) hasRecovery = true;
    });

    if (hasRecovery) {
      additionalContainer.appendChild(this.createWarningBox("recovery", this.MESSAGES.recovery));
    } else if (hasConvalescence && !suppressConvalescence) {
      additionalContainer.appendChild(this.createWarningBox("convalescence", this.MESSAGES.convalescence));
    }

    parentDiv.appendChild(additionalContainer);
  },

  /**
   * Create a collapsible mutation-check button section for a single injury.
   * When clicked, expands into a D6 roll panel with modifier checkboxes.
   * @param {Object} injury - Injury data with id and name.
   * @returns {HTMLDivElement}
   */
  createMutationCheckSection(injury) {
    const section = document.createElement('div');
    section.className = 'mutation-check-section pop-in mt-20';
    section.style.display = 'none';

    const mutation = LastingInjuriesEngine.getMutation(injury.id);

    const btn = document.createElement('button');
    btn.className = 'btn btn-chaos';
    btn.innerHTML = `Corpse Grinder Cult, Helot Chaos Cults, or Chaos Corrupted:<br>${injury.name}${mutation ? ` \u2014 ${mutation.name} Mutation` : ''}`;
    btn.addEventListener('click', () => {
      section.innerHTML = '';
      section.appendChild(this.buildMutationTestPanel(injury));
    });

    section.appendChild(btn);
    return section;
  },

  /**
   * Build the expanded mutation test panel (modifiers + D6 roll).
   * @param {Object} injury - Injury data with id and name.
   * @returns {HTMLDivElement}
   */
  buildMutationTestPanel(injury) {
    const modifiers = LastingInjuriesEngine.getMutationModifiers();
    const panel = document.createElement('div');
    panel.className = 'mutation-test-panel';

    const modifierItems = modifiers.map(mod => `
      <div class="territory-item">
        <label>
          <input type="checkbox" value="${mod.id}">
          +${mod.value} ${mod.label}
        </label>
      </div>`).join('');

    panel.innerHTML = `
      <h3 class="mt-0">Mutation Test <span class="text-muted text-small">(${injury.name})</span></h3>
      <p class="text-base">Roll a D6. On a <b>6+</b> the injury becomes a mutation instead.</p>
      <div class="mutation-modifiers mb-15">${modifierItems}</div>
      <button class="btn btn-chaos roll-mutation-btn">Roll D6</button>
      <div class="mutation-roll-result-container"></div>
    `;

    panel.querySelector('.roll-mutation-btn').addEventListener('click', () => {
      const checked = Array.from(panel.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value);
      const testResult = LastingInjuriesEngine.rollMutationTest(checked);
      const mutation = LastingInjuriesEngine.getMutation(injury.id);
      const resultContainer = panel.querySelector('.mutation-roll-result-container');

      const bonusText = testResult.bonus > 0 ? ` +${testResult.bonus}` : '';
      const totalText = testResult.bonus > 0 ? ` = ${testResult.total}` : '';

      if (testResult.success) {
        const mutBox = this.createInjuryBox(mutation, 'purple');
        mutBox.classList.add('mt-10');
        resultContainer.innerHTML = `<div class="mutation-roll-result mutation-success">D6: ${testResult.roll}${bonusText}${totalText} &mdash; Mutation! Apply this instead:</div>`;
        resultContainer.appendChild(mutBox);

        const spawnNote = LastingInjuriesEngine.injuriesData?.mutation_exceptions?.chaos_spawn?.note;
        if (spawnNote) {
          const spawnDiv = document.createElement('div');
          spawnDiv.className = 'chaos-spawn-note mt-10';
          spawnDiv.innerHTML = `<b>Chaos Spawn:</b> ${spawnNote}`;
          resultContainer.appendChild(spawnDiv);
        }
      } else {
        resultContainer.innerHTML = `<div class="mutation-roll-result mutation-fail">D6: ${testResult.roll}${bonusText}${totalText} &mdash; No Mutation. Apply injury as normal.</div>`;
      }

      panel.querySelector('.roll-mutation-btn').disabled = true;
      panel.querySelectorAll('input[type=checkbox]').forEach(cb => cb.disabled = true);
    });

    return panel;
  },

  // ── Private helpers ─────────────────────────────────────────────────────

  // Determines which convalescence badges to suppress so that only one
  // recovery warning is shown regardless of how many injuries carry it.
  // outerHasRecovery covers e.g. an outcome-level intoRecovery flag.
  _resolveRecoverySuppressions(primaryInjury, additionalInjuries, outerHasRecovery = false) {
    const primaryHasRecovery = primaryInjury?.intoRecovery === 1;
    const additionalHasRecovery = (additionalInjuries || []).some(a => a.injury?.intoRecovery === 1);
    return {
      suppressAdditionalConvalescence: primaryHasRecovery || outerHasRecovery,
      primaryForWarnings: (additionalHasRecovery || outerHasRecovery) && !primaryHasRecovery
        ? { ...primaryInjury, convalescence: 0 }
        : primaryInjury,
    };
  },

  // Filter a flat array of injury objects to those eligible for a mutation check.
  _getMutationEligible(injuries) {
    return injuries.filter(inj => inj && inj.id && LastingInjuriesEngine.isMutationEligible(inj.id));
  },

  // Append hidden, staggered mutation-check sections to a container.
  _appendMutationSections(eligibleInjuries, container) {
    eligibleInjuries.forEach((inj, i) => {
      const section = this.createMutationCheckSection(inj);
      section.style.animationDelay = `${(i + 1) * STAGGER_MS}ms`;
      container.appendChild(section);
    });
  },

  // ── Public API ───────────────────────────────────────────────────────────

  // Appends additional injuries, status warnings, glitch count, and mutation checks
  // to an already-created injury box.
  // injuryBox        – the primary result-box element (additional injuries + warnings go here)
  // mutationContainer – the element that receives sibling mutation check sections
  appendInjuryResultContent(result, injuryBox, mutationContainer, { isGlitchMode = false } = {}) {
    const { suppressAdditionalConvalescence, primaryForWarnings } = this._resolveRecoverySuppressions(
      result.injury,
      result.additionalInjuries
    );

    this.displayAdditionalInjuries(
      result.additionalInjuries, injuryBox,
      isGlitchMode ? 'Glitch' : 'Roll',
      suppressAdditionalConvalescence
    );
    this.appendStatusWarnings(primaryForWarnings, injuryBox);

    if (isGlitchMode) {
      const allInjuries = [result.injury, ...(result.additionalInjuries || []).map(i => i.injury)];
      const glitchCount = allInjuries.filter(i => i.glitch === 1).length;
      if (glitchCount > 0) {
        const countDiv = document.createElement('div');
        countDiv.className = 'glitch-count-note mt-10';
        countDiv.innerHTML = `${Icons.zap} <b>${glitchCount} glitch${glitchCount !== 1 ? 'es' : ''} generated</b>`;
        injuryBox.appendChild(countDiv);
      }
    } else {
      const allInjuries = [result.injury, ...(result.additionalInjuries || []).map(a => a.injury)];
      this._appendMutationSections(this._getMutationEligible(allInjuries), mutationContainer);
    }
  },

  // Builds the complete rogue-doc result DOM subtree without animating.
  _buildRogueDocWrapper(result) {
    const colour = result.outcome.colour || 'grey';
    const resultDiv = document.createElement('div');
    resultDiv.className = `result-box result-box-${colour} result-box-primary mt-20`;
    resultDiv.innerHTML = [
      `<h2 class="result-heading text-capitalize mt-0">${result.outcome.name}</h2>`,
      result.outcome.fixedeffect ? `<div class="result-effect mt-10">${result.outcome.fixedeffect}</div>` : ''
    ].filter(Boolean).join('');

    if (result.outcome.randomeffect === 'stabilisedinjury' && result.stabilisedInjury) {
      const injColour = result.stabilisedInjury.injury.colour || 'grey';
      const injuryContainer = document.createElement('div');
      injuryContainer.className = 'additional-injuries-container';
      injuryContainer.appendChild(
        this.createInjuryBox(
          result.stabilisedInjury.injury, injColour,
          `<b>D66 Roll:</b> ${result.stabilisedInjury.roll}`,
          result.stabilisedInjury.randomRoll
        )
      );
      resultDiv.appendChild(injuryContainer);

      const outcomeHasRecovery = result.outcome.intoRecovery === 1 && colour !== 'black';
      const { suppressAdditionalConvalescence, primaryForWarnings } = this._resolveRecoverySuppressions(
        result.stabilisedInjury.injury,
        result.stabilisedInjury.additionalInjuries,
        outcomeHasRecovery
      );
      this.displayAdditionalInjuries(
        result.stabilisedInjury.additionalInjuries, resultDiv, 'D66',
        suppressAdditionalConvalescence
      );
      this.appendStatusWarnings(primaryForWarnings, resultDiv);
    }

    // Outcome-level intoRecovery (YAML-driven; used by core-mode rogue doc outcomes)
    if (result.outcome.intoRecovery === 1 && colour !== 'black') {
      const stabilisedHasRecovery = result.stabilisedInjury && (
        result.stabilisedInjury.injury?.intoRecovery === 1 ||
        (result.stabilisedInjury.additionalInjuries || []).some(a => a.injury?.intoRecovery === 1)
      );
      if (!stabilisedHasRecovery) {
        resultDiv.appendChild(this.createWarningBox('recovery', this.MESSAGES.recovery));
      }
    }

    const wrapper = document.createElement('div');
    wrapper.appendChild(resultDiv);

    const isGlitchMode = ['spyrer_hunting_rig_glitches', 'spyrer_hunting_rig_glitches_core']
      .includes(typeof LastingInjuriesEngine !== 'undefined' ? LastingInjuriesEngine.currentMode : '');
    if (!isGlitchMode && result.stabilisedInjury) {
      const allInjuries = [
        result.stabilisedInjury.injury,
        ...(result.stabilisedInjury.additionalInjuries || []).map(a => a.injury)
      ];
      this._appendMutationSections(this._getMutationEligible(allInjuries), wrapper);
    }

    return wrapper;
  },

  // Renders a complete rogue-doc result into containerEl, replacing its contents.
  renderRogueDocResult(result, containerEl) {
    return animatedReplace(containerEl, this._buildRogueDocWrapper(result));
  },

  // Renders a cyberteknika test result into container (replaces its contents with cogitating → result).
  renderCyberteknikaResult(injury, cybName, container) {
    const result = LastingInjuriesEngine.rollCyberteknikaTest();
    if (!result) return;

    const cybData = LastingInjuriesEngine.injuriesData?.cyberteknika_exceptions;
    const threshold = cybData?.test?.threshold ?? 4;
    const statusText = result.success ? `Pass (${threshold}+)` : 'Fail';
    const comment = result.success
      ? (cybData?.test?.pass_comment || '')
      : (cybData?.test?.fail_comment || '');
    const bonusText = result.bonus > 0 ? ` + ${result.bonus} = ${result.total}` : '';

    return animatedReplace(container, `
      <div class="result-box result-box-blue mt-20">
        <h3 class="result-heading mt-0 mb-0">${injury.name} &#x2192; ${cybName} Archaeo-Cyberteknika</h3>
        <div class="result-effect mt-10"><b>${statusText}</b> &mdash; D6: ${result.roll}${bonusText}</div>
        ${comment ? `<div class="mt-10">${comment}</div>` : ''}
      </div>
    `);
  },

  // Builds Van Saar Archaeo-Cyberteknika roll buttons into container for any eligible injuries in result.
  renderCyberteknikaButtons(result, container) {
    if (!container) return;
    container.innerHTML = '';

    const mode = LastingInjuriesEngine.currentMode;
    const incompatibleModes = ['spyrer_hunting_rig_glitches', 'spyrer_hunting_rig_glitches_core', 'ironman_lasting_injuries'];
    if (incompatibleModes.includes(mode)) return;

    const cybData = LastingInjuriesEngine.injuriesData?.cyberteknika_exceptions;
    if (!cybData) return;

    const allInjuries = [result.injury, ...(result.additionalInjuries || []).map(i => i.injury)];
    const eligible = allInjuries.filter(inj => LastingInjuriesEngine.isCyberteknikaEligible(inj?.id));

    eligible.forEach((injury, i) => {
      const cybName = cybData.cyberteknika?.[injury.id]?.name || 'Archaeo-Cyberteknika';
      const resultDiv = document.createElement('div');
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary pop-in mt-20';
      btn.style.animationDelay = `${i * 150}ms`;
      btn.innerHTML = `Van Saar: <br>${injury.name} &#x2014; ${cybName} Archaeo-Cyberteknika`;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await this.renderCyberteknikaResult(injury, cybName, resultDiv);
        btn.remove();
      });
      container.appendChild(btn);
      container.appendChild(resultDiv);
    });
  }

};
