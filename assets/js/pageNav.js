/**
 * pageNav.js — Builds and wires up the "Jump to section" navigation
 * drawer (see _includes/page-nav.html) from the page's top-level
 * collapsible reference sections (`.main > details.reference-tables-collapsible`),
 * and drives a single-section view: only the section currently selected
 * from the drawer is shown; every other top-level section is hidden
 * (`display: none` via the `.page-nav-section` / `.active` classes).
 *
 * One link is generated per top-level section, in document order, using
 * its <summary> text as both the label and (slugified) anchor id. This
 * means the drawer's contents never need manual upkeep — adding, removing,
 * or renaming a top-level section on the page automatically updates the
 * drawer on next load.
 *
 * Nested sub-sections inside the visible top-level section keep their
 * normal independent expand/collapse behaviour — only top-level
 * visibility is managed here.
 *
 * Clicking a link shows that section (hiding all others), closes the
 * drawer, scrolls it into view, and updates the URL hash. The initial
 * section shown on load is taken from the URL hash if it matches a
 * section id, otherwise the first section is shown. Browser back/forward
 * (hash changes) are also honoured.
 *
 * No external dependencies.
 */

/**
 * Convert arbitrary heading text into a URL-safe, lowercase, hyphenated id.
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('page-nav-toggle');
  const closeBtn = document.getElementById('page-nav-close');
  const drawer = document.getElementById('page-nav-drawer');
  const backdrop = document.getElementById('page-nav-backdrop');
  const list = document.getElementById('page-nav-list');
  if (!toggle || !drawer || !backdrop || !list) return;

  const sections = Array.from(document.querySelectorAll('.main > details.reference-tables-collapsible'));
  if (sections.length === 0) return;

  const links = [];
  sections.forEach(section => {
    const summary = section.querySelector(':scope > summary');
    if (!summary) return;
    if (!section.id) section.id = slugify(summary.textContent);
    section.classList.add('page-nav-section');

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${section.id}`;
    a.textContent = summary.textContent;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showSection(section.id);
      closeDrawer();
      history.pushState(null, '', `#${section.id}`);
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    li.appendChild(a);
    list.appendChild(li);
    links.push(a);
  });

  /**
   * Show only the section matching targetId; hide all others. Falls back
   * to the first section if targetId doesn't match any known section.
   * @param {string} targetId
   */
  function showSection(targetId) {
    const match = sections.some(section => section.id === targetId);
    const activeId = match ? targetId : sections[0].id;
    sections.forEach(section => {
      const isActive = section.id === activeId;
      section.classList.toggle('active', isActive);
      section.open = isActive;
    });
    links.forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === `#${activeId}`);
    });
  }

  function openDrawer() {
    drawer.classList.add('open');
    backdrop.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', () => {
    if (drawer.classList.contains('open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });
  closeBtn.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });
  window.addEventListener('hashchange', () => {
    showSection(window.location.hash.replace('#', ''));
  });

  showSection(window.location.hash.replace('#', ''));
});
