/**
 * skillsRenderer.js — Shared fighter skill display components.
 *
 * Provides reusable helpers for rendering fighter skill reference sections
 * from the fighterSkills JSON data.
 *
 * Used by any tool page that needs to display a subset (or all) of the
 * standard skill reference entries.
 *
 * Depends on: nothing (pure DOM helpers)
 */

export const SkillsRenderer = {

  /**
   * Render fighter skill entries into a container element.
   *
   * @param {object} skillsData     - Parsed fighterSkills JSON (expects skillsData.fighter_skills).
   * @param {HTMLElement} container - The DOM element to render into.
   * @param {string[]|null} filter  - Optional array of skill names to include. Null renders all.
   */
  renderSkills(skillsData, container, filter = null) {
    if (!container || !skillsData || !skillsData.fighter_skills) return;

    const allSkills = Object.values(skillsData.fighter_skills)
      .flatMap(category => Object.values(category));

    const skills = filter
      ? allSkills.filter(skill => filter.includes(skill.name))
      : allSkills;

    container.innerHTML = skills.map(skill => {
      const description = skill.description.replace(`<b>${skill.name}:</b> `, '');
      return `<details class="reference-tables-collapsible">
        <summary>${skill.name}</summary>
        ${description}
      </details>`;
    }).join('');
  },

  /**
   * Render fighter skills grouped by category with headings.
   *
   * @param {object} skillsData     - Parsed fighterSkills JSON.
   * @param {HTMLElement} container - The DOM element to render into.
   * @param {string[]|null} filter  - Optional array of skill names to include. Null renders all.
   */
  renderSkillsByCategory(skillsData, container, filter = null) {
    if (!container || !skillsData || !skillsData.fighter_skills) return;

    container.innerHTML = Object.entries(skillsData.fighter_skills).map(([category, skills]) => {
      const entries = filter
        ? Object.values(skills).filter(skill => filter.includes(skill.name))
        : Object.values(skills);

      if (entries.length === 0) return '';

      return `<h3>${category}</h3>` + entries.map(skill => {
        const description = skill.description.replace(`<b>${skill.name}:</b> `, '');
        return `<details class="reference-tables-collapsible">
          <summary>${skill.number}. ${skill.name}</summary>
          ${description}
        </details>`;
      }).join('');
    }).join('');
  },

  /**
   * Render all fighter skills grouped by category, always expanded (no collapsibles).
   *
   * @param {object} skillsData     - Parsed fighterSkills JSON.
   * @param {HTMLElement} container - The DOM element to render into.
   */
  renderSkillsExpanded(skillsData, container) {
    if (!container || !skillsData || !skillsData.fighter_skills) return;

    container.innerHTML = Object.entries(skillsData.fighter_skills).map(([category, skills]) => {
      const skillsHtml = Object.values(skills).map(skill => {
        const description = skill.description.replace(`<b>${skill.name}:</b> `, '');
        return `<div class="reference-tables-collapsible">
          <strong>${skill.number}. ${skill.name}</strong>
          ${description}
        </div>`;
      }).join('');

      return `<details class="reference-tables-collapsible" open>
        <summary><strong>${category}</strong></summary>
        ${skillsHtml}
      </details>`;
    }).join('');
  }

};