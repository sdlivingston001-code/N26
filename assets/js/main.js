/**
 * main.js — Global page initialisation.
 *
 * Loaded on every page via the default layout.  Applies one behaviour:
 *
 * 1. Auto-adds the `.btn` class to every <button> so they inherit the
 *    shared button styling without each page needing to set it.
 *
 * No external dependencies.
 */

// Apply base button styles to all buttons on every page
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('button').forEach(button => {
    button.classList.add('btn');
  });

  // Flash buttons grey on click, then fade back to their original colour
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    btn.classList.remove('btn-clicked');
    void btn.offsetWidth; // force reflow so animation restarts if clicked again mid-flash
    btn.classList.add('btn-clicked');
    setTimeout(() => btn.classList.remove('btn-clicked'), 2500); // matches btn-click-flash duration
  });
});
