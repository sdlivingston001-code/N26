/**
 * uiUtils.js — Shared UI utility helpers.
 *
 * Provides reusable DOM helpers for animated result replacement across all tool pages.
 */

/**
 * Replace a container's contents with new content, showing a "Cogitating..."
 * placeholder for 1 second before inserting the new content.
 * Skips the delay if the container is currently empty (first roll).
 *
 * @param {HTMLElement}        container  - The container element to update.
 * @param {HTMLElement|string} newContent - New content: a DOM element or HTML string.
 */
export function animatedReplace(container, newContent) {
  return new Promise(resolve => {
    const insert = () => {
      container.innerHTML = '';
      if (newContent instanceof Element) {
        container.appendChild(newContent);
      } else {
        container.innerHTML = newContent;
      }
      resolve();
    };

    container.innerHTML = '<div class="roll-cogitating">Cogitating...</div>';
    setTimeout(insert, 600);
  });
}

/**
 * Returns a Promise that resolves after `ms` milliseconds.
 * Use after animatedReplace to let the result-box pop-in animation
 * finish before secondary follow-on buttons are shown.
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Move all `.mutation-check-section` elements from sourceContainer into
 * targetContainer, forcing the pop-in animation to restart cleanly in
 * their new position with staggered delays.
 */
export function moveMutationSections(sourceContainer, targetContainer) {
  sourceContainer.querySelectorAll('.mutation-check-section').forEach((el, i) => {
    el.classList.remove('pop-in');
    el.style.display = '';
    el.style.animationDelay = `${i * 150}ms`;
    targetContainer.appendChild(el);
    void el.offsetWidth; // force reflow so animation restarts in the new parent
    el.classList.add('pop-in');
  });
}
