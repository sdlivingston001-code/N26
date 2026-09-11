/**
 * campaignViewerUI.js — Front-end for the Campaign Viewer tool.
 *
 * Displays Munda Manager campaign data fetched by CampaignViewerEngine:
 *   - Campaign overview (name, type, status)
 *   - Campaign statistics (gangs, members, wealth, territories)
 *   - Gang leaderboard sorted by rating with medal icons
 *   - Territory control map (owned + available)
 *   - Validation sections comparing API gang-types and territory names
 *     against local data files to catch mismatches
 *
 * Also manages a cache-age timer (updates every second) and enforces
 * the 15-minute cooldown before allowing another API call.
 *
 * Depends on: icons.js, campaignViewerEngine.js
 */

import { Icons } from './icons.js';
import { CampaignViewerEngine } from './campaignViewerEngine.js';
import { fetchJSON } from './dataLoader.js';

export const CampaignViewerUI = {
  containerId: null,
  refreshButton: null,
  timerContainer: null,
  timerInterval: null,
  lastRefreshTime: null,
  localTerritories: null,
  localGangs: null,
  campaignIdInput: null,

  /**
   * Wire the campaign-ID input and refresh button, load local
   * territories/gangs data (used for validation sections), and start the
   * cache-age timer display.
   * @param {string} containerId - Element ID to render campaign data into.
   * @param {string} loadButtonId - Element ID of the "Load"/"Refresh" button.
   * @param {string} timerContainerId - Element ID for the cache-age timer text.
   * @param {string} campaignIdInputId - Element ID of the campaign ID `<input>`.
   * @returns {Promise<void>}
   */
  async init(containerId, loadButtonId, timerContainerId, campaignIdInputId) {
    this.containerId = containerId;
    this.refreshButton = document.getElementById(loadButtonId);
    this.timerContainer = document.getElementById(timerContainerId);
    this.campaignIdInput = document.getElementById(campaignIdInputId);

    if (this.refreshButton) {
      this.refreshButton.addEventListener('click', () => this.setCampaignId());
    }

    if (this.campaignIdInput) {
      // Load current campaign ID
      this.campaignIdInput.value = CampaignViewerEngine.getCampaignId();

      // Allow Enter key to load
      this.campaignIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.setCampaignId();
        }
      });
    }

    // Load local territories and gangs data for validation
    await this.loadLocalTerritories();
    await this.loadLocalGangs();

    // Initialize timer display
    this.initTimer();
  },

  /**
   * Validate and persist the campaign ID from the input field (via
   * `CampaignViewerEngine.setCampaignId()`), then trigger a refresh.
   * Alerts the user if the field is empty or not a valid UUID.
   */
  setCampaignId() {
    const newId = this.campaignIdInput.value.trim();
    if (!newId) {
      alert('Please enter a valid campaign ID');
      return;
    }
    if (!CampaignViewerEngine.setCampaignId(newId)) {
      alert('Invalid campaign ID format. Please enter a valid UUID (e.g. e2785818-5736-4c50-bfb2-d243953541f8)');
      return;
    }
    this.refresh();
  },

  /**
   * Fetch and store `data/gangs.json` for the gang-type validation section.
   * Sets `this.localGangs` to `[]`-shaped array data, or leaves it unset on failure.
   * @returns {Promise<void>}
   */
  async loadLocalGangs() {
    try {
      const baseUrl = window.location.pathname.includes('/BadCredit/') ? '/BadCredit' : '';
      this.localGangs = await fetchJSON(`${baseUrl}/data/gangs.json`);
      // Convert to array if needed
      if (!Array.isArray(this.localGangs)) {
        this.localGangs = Object.entries(this.localGangs).map(([id, data]) => ({
          id,
          ...data
        }));
      }
      console.log('CampaignViewerUI: Loaded local gangs:', this.localGangs.length);
    } catch (error) {
      console.warn('CampaignViewerUI: Failed to load gangs.json');
    }
  },

  /**
   * Fetch and store `data/territories.json` for the territory-mapping
   * validation section. Sets `this.localTerritories` to array data, or
   * leaves it unset on failure.
   * @returns {Promise<void>}
   */
  async loadLocalTerritories() {
    try {
      const baseUrl = window.location.pathname.includes('/BadCredit/') ? '/BadCredit' : '';
      this.localTerritories = await fetchJSON(`${baseUrl}/data/territories.json`);
      // Convert to array if needed
      if (!Array.isArray(this.localTerritories)) {
        this.localTerritories = Object.entries(this.localTerritories).map(([id, data]) => ({
          id,
          ...data
        }));
      }
      console.log('CampaignViewerUI: Loaded local territories:', this.localTerritories.length);
    } catch (error) {
      console.warn('CampaignViewerUI: Failed to load territories.json');
    }
  },

  /** Start a 1-second interval updating the cache-age/cooldown timer display. */
  initTimer() {
    if (!this.timerContainer) return;

    // Update timer display every second
    this.updateTimerDisplay();
    this.timerInterval = setInterval(() => {
      this.updateTimerDisplay();
    }, 1000);
  },

  /**
   * Update the timer text to show either the remaining rate-limit cooldown
   * (and disable the refresh button) or how long ago data was last fetched.
   */
  updateTimerDisplay() {
    if (!this.timerContainer) return;

    const cacheTime = localStorage.getItem(CampaignViewerEngine.cacheTimeKey);
    if (!cacheTime) {
      this.timerContainer.innerHTML = '<span class="timer-grey">⏱️ Never fetched</span>';
      return;
    }

    const age = Date.now() - parseInt(cacheTime);
    const timeRemaining = CampaignViewerEngine.getTimeUntilNextFetch();

    if (timeRemaining > 0) {
      // Still in cooldown
      const minutes = Math.floor(timeRemaining / 60000);
      const seconds = Math.floor((timeRemaining % 60000) / 1000);
      this.timerContainer.innerHTML = `<span class="text-danger">⏱️ Next refresh available in ${minutes}:${seconds.toString().padStart(2, '0')}</span>`;
      
      if (this.refreshButton) {
        this.refreshButton.disabled = true;
        this.refreshButton.style.opacity = '0.5';
      }
    } else {
      // Can refresh
      const minutes = Math.floor(age / 60000);
      const seconds = Math.floor((age % 60000) / 1000);
      this.timerContainer.innerHTML = `<span class="timer-green">⏱️ Last fetched ${minutes}:${seconds.toString().padStart(2, '0')} ago</span>`;
      
      if (this.refreshButton) {
        this.refreshButton.disabled = false;
        this.refreshButton.style.opacity = '1';
      }
    }
  },

  /**
   * Fetch campaign data (cached or fresh, per the engine's cooldown logic)
   * and render it, or show a rate-limit/error message.
   * @returns {Promise<void>}
   */
  async loadAndDisplay() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Show loading state
    container.innerHTML = `<div class="info-box">${Icons.hourglass} Loading campaign data...</div>`;

    // Fetch data
    const result = await CampaignViewerEngine.fetchCampaignData();

    if (!result.success) {
      if (result.rateLimited) {
        container.innerHTML = `<div class="info-box yellow">${Icons.hourglass} ${result.error}</div>`;
      } else {
        container.innerHTML = `<div class="error-box">❌ Error: ${result.error}</div>`;
      }
      return;
    }

    // Display data
    this.displayCampaignData(container, result.fromCache);
    this.lastRefreshTime = Date.now();
    
    // Update refresh button
    if (this.refreshButton) {
      this.refreshButton.innerHTML = `${Icons.rotateCcw} Refresh Data`;
    }

    // Update timer
    this.updateTimerDisplay();
  },

  /**
   * Force-refresh campaign data from the API (bypassing the cache), after
   * checking the 15-minute cooldown. Shows a loading state, then renders
   * the result or an error/rate-limit message.
   * @returns {Promise<void>}
   */
  async refresh() {
    // Check if we can refresh
    const timeRemaining = CampaignViewerEngine.getTimeUntilNextFetch();
    if (timeRemaining > 0) {
      const minutes = Math.ceil(timeRemaining / 60000);
      alert(`Please wait ${minutes} more minute(s) before refreshing to respect Munda Manager's rate limits.`);
      return;
    }

    if (this.refreshButton) {
      this.refreshButton.disabled = true;
      this.refreshButton.innerHTML = `${Icons.hourglass} Refreshing...`;
    }

    // Force refresh
    const container = document.getElementById(this.containerId);
    if (container) {
      container.innerHTML = `<div class="info-box">${Icons.hourglass} Fetching fresh data from Munda Manager...</div>`;
    }

    const result = await CampaignViewerEngine.fetchCampaignData(true);

    if (!result.success) {
      if (result.rateLimited) {
        if (container) {
          container.innerHTML = `<div class="info-box yellow">⏳ ${result.error}</div>`;
        }
      } else {
        if (container) {
          container.innerHTML = `<div class="error-box">❌ Error: ${result.error}</div>`;
        }
      }
      if (this.refreshButton) {
        this.refreshButton.disabled = false;
        this.refreshButton.innerHTML = `${Icons.rotateCcw} Refresh Data`;
      }
      return;
    }

    this.displayCampaignData(container, result.fromCache);
    this.updateTimerDisplay();

    if (this.refreshButton) {
      this.refreshButton.innerHTML = `${Icons.rotateCcw} Refresh Data`;
    }
  },

  /**
   * Render every campaign data section into `container`: cache notice,
   * overview, stats, gang leaderboard, territory control, and (if local
   * data loaded) the territory/gang mapping validation sections.
   * @param {HTMLElement} container - Element to render all sections into.
   * @param {boolean} [fromCache=false] - Whether the data came from the local cache (shows a notice banner).
   */
  displayCampaignData(container, fromCache = false) {
    container.innerHTML = '';

    // Show cache status
    if (fromCache) {
      const cacheNotice = document.createElement('div');
      cacheNotice.className = 'info-box mb-15';
      cacheNotice.innerHTML = `${Icons.save} <b>Showing cached data</b> (to respect Munda Manager's rate limits)`;
      container.appendChild(cacheNotice);
    }

    // Campaign Overview
    const campaignInfo = CampaignViewerEngine.getCampaignInfo();
    if (campaignInfo) {
      container.appendChild(this.createCampaignOverview(campaignInfo));
    }

    // Campaign Statistics
    const stats = CampaignViewerEngine.getCampaignStats();
    container.appendChild(this.createStatsSection(stats));

    // Gangs Leaderboard
    container.appendChild(this.createGangsLeaderboard());

    // Territory Distribution
    container.appendChild(this.createTerritorySection());

    // Territory Validation (if local data loaded)
    console.log('CampaignViewerUI: localTerritories available?', !!this.localTerritories);
    if (this.localTerritories) {
      console.log('CampaignViewerUI: Adding territory validation section');
      container.appendChild(this.createTerritoryValidationSection());
    } else {
      console.log('CampaignViewerUI: Skipping territory validation - no local territories loaded');
    }

    // Gang Validation (if local data loaded)
    console.log('CampaignViewerUI: localGangs available?', !!this.localGangs);
    if (this.localGangs) {
      console.log('CampaignViewerUI: Adding gang validation section');
      container.appendChild(this.createGangValidationSection());
    } else {
      console.log('CampaignViewerUI: Skipping gang validation - no local gangs loaded');
    }
  },

  /**
   * @param {Object} campaignInfo - `{ campaign_name, campaign_type_name, status }` from the engine.
   * @returns {HTMLDivElement} Section with campaign name heading and a type/status info box.
   */
  createCampaignOverview(campaignInfo) {
    const section = document.createElement('div');
    section.className = 'mb-20';

    const title = document.createElement('h2');
    title.textContent = campaignInfo.campaign_name || 'Campaign';
    title.className = 'mb-10';
    section.appendChild(title);

    const infoBox = document.createElement('div');
    infoBox.className = 'result-box result-box-blue mb-15';
    infoBox.innerHTML = `
      <b>Type:</b> ${campaignInfo.campaign_type_name || 'Unknown'}<br>
      <b>Status:</b> ${campaignInfo.status || 'Unknown'}
    `;
    section.appendChild(infoBox);

    return section;
  },

  /**
   * @param {Object} stats - Aggregated stats from `CampaignViewerEngine.getCampaignStats()`.
   * @returns {HTMLDivElement} Section listing gang/member/wealth/territory totals.
   */
  createStatsSection(stats) {
    const section = document.createElement('div');
    section.className = 'mb-20';

    const title = document.createElement('h3');
    title.textContent = 'Campaign Statistics';
    title.className = 'mb-10';
    section.appendChild(title);

    const statsBox = document.createElement('div');
    statsBox.className = 'result-box result-box-green';
    statsBox.innerHTML = `
      <b>Total Gangs:</b> ${stats.total_gangs}<br>
      <b>Total Members:</b> ${stats.total_members}<br>
      <b>Average Gang Rating:</b> ${stats.average_rating}<br>
      <b>Total Wealth:</b> ${stats.total_wealth} credits<br>
      <b>Owned Territories:</b> ${stats.total_owned_territories}<br>
      <b>Available Territories:</b> ${stats.total_available_territories}
    `;
    section.appendChild(statsBox);

    return section;
  },

  /**
   * @returns {HTMLDivElement} Section listing every gang sorted by rating, with medal icons for the top 3.
   */
  createGangsLeaderboard() {
    const section = document.createElement('div');
    section.className = 'mb-20';

    const title = document.createElement('h3');
    title.textContent = 'Gang Leaderboard (by Rating)';
    title.className = 'mb-10';
    section.appendChild(title);

    const gangs = CampaignViewerEngine.getGangsByRating();

    gangs.forEach((gang, index) => {
      const gangBox = document.createElement('div');
      gangBox.className = 'result-box mb-10';
      gangBox.style.borderLeft = `5px solid ${gang.colour || '#000000'}`;
      
      const rank = index + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
      
      gangBox.innerHTML = `
        <div class="flex-center" style="justify-content: space-between; align-items: start;">
          <div>
            <b>${medal} ${gang.name}</b><br>
            <span class="text-muted">${gang.type} • Owner: ${gang.owner}</span>
          </div>
          <div class="text-right">
            <b>Rating:</b> ${gang.rating}<br>
            <b>Wealth:</b> ${gang.wealth}<br>
            <b>Territories:</b> ${gang.territory_count || 0}
          </div>
        </div>
      `;
      section.appendChild(gangBox);
    });

    return section;
  },

  /**
   * @returns {HTMLDivElement} Section listing controlled territories (with owning gang) and unclaimed territories.
   */
  createTerritorySection() {
    const section = document.createElement('div');
    section.className = 'mb-20';

    const title = document.createElement('h3');
    title.textContent = 'Territory Control';
    title.className = 'mb-10';
    section.appendChild(title);

    const territories = CampaignViewerEngine.getAllTerritories();

    // Owned territories
    if (territories.owned.length > 0) {
      const ownedTitle = document.createElement('h4');
      ownedTitle.textContent = 'Controlled Territories';
      ownedTitle.className = 'mb-10 mt-15';
      section.appendChild(ownedTitle);

      territories.owned.forEach(territory => {
        const territoryBox = document.createElement('div');
        territoryBox.className = 'result-box result-box-grey mb-10';
        territoryBox.style.borderLeft = `5px solid ${territory.gang_colour || '#000000'}`;
        
        territoryBox.innerHTML = `
          <b>${territory.name}</b>
          ${territory.ruined ? ' <span class="text-danger">(Ruined)</span>' : ''}<br>
          <span class="text-muted">Controlled by: ${territory.gang_name} (${territory.gang_type})</span>
        `;
        section.appendChild(territoryBox);
      });
    }

    // Available territories
    if (territories.available.length > 0) {
      const availableTitle = document.createElement('h4');
      availableTitle.textContent = `Available Territories (${territories.available.length})`;
      availableTitle.className = 'mb-10 mt-15';
      section.appendChild(availableTitle);

      const availableBox = document.createElement('div');
      availableBox.className = 'info-box';
      
      const territoryNames = territories.available
        .filter(t => !t.owning_gangs || t.owning_gangs.length === 0)
        .map(t => t.ruined ? `${t.name} (Ruined)` : t.name)
        .join(', ');
      
      availableBox.innerHTML = `<b>Unclaimed:</b> ${territoryNames || 'None'}`;
      section.appendChild(availableBox);
    }

    return section;
  },

  /**
   * Compare API territory names against `this.localTerritories` (via
   * `CampaignViewerEngine.validateTerritoryMappings()`) and render a
   * summary plus lists of valid/unmapped territories, to catch data drift
   * between Munda Manager and this repo's territories.yml.
   * @returns {HTMLDivElement}
   */
  createTerritoryValidationSection() {
    const section = document.createElement('div');
    section.className = 'mb-20';

    const title = document.createElement('h3');
    title.textContent = 'Territory Mapping Validation';
    title.className = 'mb-10';
    section.appendChild(title);

    const validation = CampaignViewerEngine.validateTerritoryMappings(this.localTerritories);

    // Summary box
    const summaryBox = document.createElement('div');
    summaryBox.className = validation.allValid ? 'result-box result-box-green mb-15' : 'result-box result-box-yellow mb-15';
    summaryBox.innerHTML = `
      <b>Validation Summary:</b><br>
      ${Icons.circleCheck} Valid Mappings: ${validation.valid.length}<br>
      ${validation.invalid.length > 0 ? `${Icons.warning} Invalid Mappings: ${validation.invalid.length}<br>` : ''}
      <b>Total Territories Checked:</b> ${validation.totalChecked}
    `;
    section.appendChild(summaryBox);

    // Show invalid mappings if any
    if (validation.invalid.length > 0) {
      const invalidTitle = document.createElement('h4');
      invalidTitle.textContent = 'Unmapped Territories';
      invalidTitle.className = 'mb-10 text-danger';
      section.appendChild(invalidTitle);

      const invalidBox = document.createElement('div');
      invalidBox.className = 'info-box yellow mb-15';
      const invalidList = validation.invalid.map(t => t.apiName).join(', ');
      invalidBox.innerHTML = `<b>These API territories have no matching local ID:</b><br>${invalidList}`;
      section.appendChild(invalidBox);
    }

    // Show valid mappings
    if (validation.valid.length > 0) {
      const validTitle = document.createElement('h4');
      validTitle.textContent = 'Valid Territory Mappings';
      validTitle.className = 'mb-10';
      section.appendChild(validTitle);

      const validBox = document.createElement('div');
      validBox.className = 'info-box mb-15 scrollable-box';
      const mappingList = validation.valid
        .map(t => `<span class="monospace">${t.apiName} → ${t.territoryId}</span>`)
        .join('<br>');
      validBox.innerHTML = mappingList;
      section.appendChild(validBox);
    }

    return section;
  },

  /**
   * Compare API gang types against `this.localGangs` (via
   * `CampaignViewerEngine.validateGangMappings()`) and render a summary
   * plus lists of valid/unmapped gang types, to catch data drift between
   * Munda Manager and this repo's gangs.yml.
   * @returns {HTMLDivElement}
   */
  createGangValidationSection() {
    const section = document.createElement('div');
    section.className = 'mb-20';

    const title = document.createElement('h3');
    title.textContent = 'Gang Type Mapping Validation';
    title.className = 'mb-10';
    section.appendChild(title);

    const validation = CampaignViewerEngine.validateGangMappings(this.localGangs);

    // Summary box
    const summaryBox = document.createElement('div');
    summaryBox.className = validation.allValid ? 'result-box result-box-green mb-15' : 'result-box result-box-yellow mb-15';
    summaryBox.innerHTML = `
      <b>Validation Summary:</b><br>
      ${Icons.circleCheck} Valid Mappings: ${validation.valid.length}<br>
      ${validation.invalid.length > 0 ? `${Icons.warning} Invalid Mappings: ${validation.invalid.length}<br>` : ''}
      <b>Total Gangs Checked:</b> ${validation.totalChecked}
    `;
    section.appendChild(summaryBox);

    // Show invalid mappings if any
    if (validation.invalid.length > 0) {
      const invalidTitle = document.createElement('h4');
      invalidTitle.textContent = 'Unmapped Gang Types';
      invalidTitle.className = 'mb-10 text-danger';
      section.appendChild(invalidTitle);

      const invalidBox = document.createElement('div');
      invalidBox.className = 'info-box yellow mb-15';
      const invalidList = validation.invalid.map(g => g.apiType).join(', ');
      invalidBox.innerHTML = `<b>These API gang types have no matching local ID:</b><br>${invalidList}`;
      section.appendChild(invalidBox);
    }

    // Show valid mappings
    if (validation.valid.length > 0) {
      const validTitle = document.createElement('h4');
      validTitle.textContent = 'Valid Gang Type Mappings';
      validTitle.className = 'mb-10';
      section.appendChild(validTitle);

      const validBox = document.createElement('div');
      validBox.className = 'info-box mb-15 scrollable-box';
      const mappingList = validation.valid
        .map(g => `<span class="monospace">${g.apiType} → ${g.gangId}</span>`)
        .join('<br>');
      validBox.innerHTML = mappingList;
      section.appendChild(validBox);
    }

    return section;
  }
};
