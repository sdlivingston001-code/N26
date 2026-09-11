/**
 * timer.js — Shared timer utility for tracking time since last roll.
 *
 * Shows a live-updating "Last Run" display with millisecond precision
 * (for the first 5 seconds) then switches to a generic message.
 *
 * Roll history:  Maintains a sliding window of the last 4 roll sets
 * stored as a single JSON key per tool in localStorage:
 *   {
 *     timestamp: <epoch-ms>,
 *     rollHistory: [ [current], [prev1], [prev2], [prev3] ]
 *   }
 *
 * All keys are cleared on page unload (beforeunload) so stale data
 * doesn't persist across sessions.
 *
 * Depends on: icons.js (Icons.timer, Icons.dices, Icons.clockCounterClockwise)
 */

import { Icons } from './icons.js';

export const TimerUtil = {
  intervals: {},
  storageKeys: [],
  storageToContainer: {},

  /**
   * Initialize and display a timer that shows time since last run (with millisecond precision)
   * @param {string} containerId - ID of the element where timer will be displayed
   * @param {string} storageKey - localStorage key to store/retrieve last run time
   */
  init(containerId, storageKey) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Timer container '${containerId}' not found`);
      return;
    }

    // Create timer display element
    const timerDiv = document.createElement("div");
    timerDiv.id = `${containerId}-display`;
    timerDiv.className = "timer-display";
    
    container.appendChild(timerDiv);
    
    // Track storage key for cleanup
    if (!this.storageKeys.includes(storageKey)) {
      this.storageKeys.push(storageKey);
    }
    this.storageToContainer[storageKey] = containerId;

    // Update the display
    this.updateDisplay(storageKey, timerDiv);

    // Set up interval to update every 100ms
    if (this.intervals[storageKey]) {
      clearInterval(this.intervals[storageKey]);
    }
    
    this.intervals[storageKey] = setInterval(() => {
      this.updateDisplay(storageKey, timerDiv);
    }, 100);
  },

  /**
   * Update the timer display
   * @param {string} storageKey - localStorage key
   * @param {HTMLElement} element - Element to update
   */
  updateDisplay(storageKey, element) {
    let stored;
    try {
      const raw = localStorage.getItem(storageKey);
      stored = raw ? JSON.parse(raw) : null;
    } catch (e) {
      stored = null;
    }

    if (!stored || !stored.timestamp) {
      element.innerHTML = `${Icons.timer} <b>Last Run:</b> Never`;
      element.classList.remove('timer-green');
      element.classList.add('timer-grey');
      return;
    }

    const now = Date.now();
    const elapsedMs = now - stored.timestamp;

    let timeHtml;
    if (elapsedMs < 5000) {
      const totalSeconds = Math.floor(elapsedMs / 1000);
      const milliseconds = elapsedMs % 1000;
      timeHtml = `${Icons.timer} <b>Last Run:</b> ${totalSeconds}.${String(milliseconds).padStart(3, '0')} seconds ago`;
      element.classList.remove('timer-grey');
      element.classList.add('timer-green');
    } else {
      timeHtml = `${Icons.timer} <b>Last Run:</b> More than 5 seconds ago`;
      element.classList.remove('timer-green');
      element.classList.add('timer-grey');
    }

    // Append stored rolls — current prominent, previous as compact history
    let rollsHtml = '';
    const history = stored.rollHistory || [];
    const currSet = history[0] && history[0].length ? history[0].join(', ') : null;
    const prevSets = history.slice(1).filter(s => s && s.length).map(s => s.join(', '));

    if (currSet !== null || prevSets.length > 0) {
      let lines = '';
      if (currSet !== null) lines += `<div class="timer-rolls">${Icons.dices} <b>${currSet}</b></div>`;
      if (prevSets.length > 0) lines += `<div class="timer-rolls timer-rolls-prev">${Icons.clockCounterClockwise} ${prevSets.join(' | ')}</div>`;
      rollsHtml = lines;
    }

    element.innerHTML = timeHtml + rollsHtml;
  },

  /**
   * Mark the current time as the last run time
   * @param {string} storageKey - localStorage key to update
   * @param {string[]} rolls - Optional roll strings to display in the timer
   */
  markRun(storageKey, rolls = []) {
    let stored;
    try {
      const raw = localStorage.getItem(storageKey);
      stored = raw ? JSON.parse(raw) : null;
    } catch (e) {
      stored = null;
    }

    const oldHistory = (stored && stored.rollHistory) || [];
    // Shift: prepend new rolls, keep at most 4 entries
    const newHistory = [rolls, ...oldHistory].slice(0, 4);

    localStorage.setItem(storageKey, JSON.stringify({
      timestamp: Date.now(),
      rollHistory: newHistory
    }));
  },

  /**
   * Update stored rolls for a timer and refresh its display.
   * Call this when rolls are determined after markRun was already called.
   * @param {string} storageKey - localStorage key
   * @param {string[]} rolls - Array of roll strings
   */
  recordRolls(storageKey, rolls) {
    if (!rolls || rolls.length === 0) return;

    let stored;
    try {
      const raw = localStorage.getItem(storageKey);
      stored = raw ? JSON.parse(raw) : null;
    } catch (e) {
      stored = null;
    }

    if (!stored) return;
    stored.rollHistory = stored.rollHistory || [];
    stored.rollHistory[0] = rolls;
    localStorage.setItem(storageKey, JSON.stringify(stored));

    const containerId = this.storageToContainer[storageKey];
    if (containerId) {
      const el = document.getElementById(`${containerId}-display`);
      if (el) this.updateDisplay(storageKey, el);
    }
  },

  /**
   * Show a specific timer and hide all others on the page
   * @param {string} containerId - ID of the timer container to show
   */
  showTimer(containerId) {
    // Hide all timer displays
    document.querySelectorAll('[id$="-timer-display"]').forEach(timer => {
      timer.classList.add('hidden');
    });
    
    // Show the specific timer
    const timerDisplay = document.getElementById(`${containerId}-display`);
    if (timerDisplay) {
      timerDisplay.classList.remove('hidden');
    }
  },

  /**
   * Hide a specific timer
   * @param {string} containerId - ID of the timer container to hide
   */
  hideTimer(containerId) {
    const timerDisplay = document.getElementById(`${containerId}-display`);
    if (timerDisplay) {
      timerDisplay.classList.add('hidden');
    }
  },

  /**
   * Setup cleanup handlers to reset timer state when navigating away
   */
  setupPageCleanup() {
    window.addEventListener('beforeunload', () => {
      this.clearAllStorage();
    });
  },

  /**
   * Clear all tracked storage keys
   */
  clearAllStorage() {
    this.storageKeys.forEach(key => {
      localStorage.removeItem(key);
    });
  },

  /**
   * Clean up intervals when no longer needed
   * @param {string} storageKey - localStorage key
   */
  cleanup(storageKey) {
    if (this.intervals[storageKey]) {
      clearInterval(this.intervals[storageKey]);
      delete this.intervals[storageKey];
    }
  }
};
