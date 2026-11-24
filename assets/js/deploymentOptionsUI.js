/**
 * deploymentOptionsUI.js — Front-end for the Gang Deployment Options page.
 *
 * Populates a <select> with every entry from deploymentOptions.json and, on
 * change, shows that option's diagram (assets/images/deployment/<image>)
 * plus its rules description.
 *
 * Depends on: dataLoader.js
 */

import { fetchJSON } from './dataLoader.js';

export const DeploymentOptionsUI = {
  options: [],
  imageBasePath: '',

  /**
   * Load deployment-option data and populate the selector. No option is
   * shown by default — the diagram/description only appear once the user
   * picks one.
   * @param {string} jsonPath - Path to deploymentOptions.json.
   * @param {string} imageBasePath - Base path for deployment images (no trailing slash).
   * @returns {Promise<void>}
   */
  async init(jsonPath, imageBasePath) {
    this.imageBasePath = imageBasePath;
    try {
      const data = await fetchJSON(jsonPath);
      this.options = Object.entries(data.deployment_options || {})
        .map(([id, opt]) => ({ id, ...opt }))
        .sort((a, b) => a.order - b.order);

      this.populateSelector();
      this.bindEvents();
    } catch (err) {
      console.error(err);
      const container = document.getElementById('dep-display');
      if (container) container.innerHTML = '<div class="error-box">Error loading deployment data.</div>';
    }
  },

  /** Populate the deployment-option <select> with a blank placeholder plus every loaded option. */
  populateSelector() {
    const select = document.getElementById('dep-select');
    if (!select) return;
    const placeholder = '<option value="" selected>Select a deployment option…</option>';
    select.innerHTML = placeholder + this.options.map(opt =>
      `<option value="${opt.id}">${opt.name}</option>`
    ).join('');
  },

  bindEvents() {
    document.getElementById('dep-select')?.addEventListener('change', e => this.render(e.target.value));
  },

  /** Render the diagram and rules description for the given option id, or clear the display if id is blank. */
  render(id) {
    const container = document.getElementById('dep-display');
    if (!container) return;

    if (!id) {
      container.innerHTML = '';
      return;
    }

    const option = this.options.find(opt => opt.id === id);
    if (!option) return;

    container.innerHTML = `
      <figure style="width:80%;margin:0 auto;text-align:center;background-color:#f8f9fa;border:1px solid #dee2e6;border-radius:8px;padding:16px;box-sizing:border-box;">
        <img src="${this.imageBasePath}/${option.image}" alt="${option.name}" style="width:100%;height:auto;display:block;">
      </figure>
      <div style="width:80%;margin:15px auto 0;text-align:center;">${option.description}</div>
    `;
  },
};
