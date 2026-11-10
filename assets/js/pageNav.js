/**
 * pageNav.js — Builds and wires up the navigation drawer (see
 * _includes/page-nav.html) and drives a single-view layout: only the view
 * selected from the drawer is shown.
 *
 * Navigation tree
 *   - Top level: groups (`data-nav-group` / `data-nav-group-title` on a
 *     top-level `.main > details.reference-tables-collapsible` section).
 *     Sections without a group are listed directly.
 *   - Below a section: any `details[data-nav-child]` nested inside it, to
 *     any depth (a child's own nav children are the `data-nav-child`
 *     details whose nearest enclosing `details` is that child).
 *
 * Drawer behaviour
 *   - Every time the drawer is opened it starts again from the top level:
 *     only the group names are shown. Selecting a group, or the
 *     chevron/link of an item that has children, reveals the next level
 *     down; opening one entry collapses its siblings.
 *   - Selecting an item shows its view. If it has children the drawer stays
 *     open so you can keep drilling; if it is a leaf the drawer closes.
 *
 * Views
 *   - A view is one nav node: its own content (including any nav children,
 *     shown as normal collapsibles) under a static heading. Everything else
 *     on the page is hidden (`.nav-off`), and ancestor headers are hidden.
 *   - Links to any nav node id (e.g. Markdown `[text](#movement)`) switch to
 *     that view. The initial view comes from the URL hash. With no (or an
 *     unknown) hash, an optional `[data-nav-holding]` element is shown
 *     instead; if the page has none, the first section is shown.
 *     Back/forward work.
 *
 * The drawer is built once from the rendered page, so every entry (including
 * those generated from YAML data) must be present in the HTML at build time.
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

/**
 * @param {Element} details - A <details> element.
 * @returns {string} Text of its own <summary>.
 */
function titleOf(details) {
  return details.querySelector(':scope > summary').textContent.trim();
}

/**
 * @param {Element} node - A nav node (section or data-nav-child details).
 * @returns {Element[]} Its direct nav children.
 */
function navChildren(node) {
  return Array.from(node.querySelectorAll('details[data-nav-child]'))
    .filter(d => d.parentElement.closest('details') === node);
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

  const holding = document.querySelector('[data-nav-holding]');
  const links = new Map();       // node id -> drawer <a>
  const nodeItems = new Map();   // node id -> drawer <li>
  let lastPath = [];

  sections.forEach(section => {
    if (!section.id) section.id = slugify(titleOf(section));
    section.classList.add('page-nav-section');
  });

  /**
   * Stop a view's own heading (and any top-level heading) from toggling.
   * Safe to call repeatedly as new nodes appear.
   */
  function bindSummaries() {
    const nodes = [...sections, ...document.querySelectorAll('.main details[data-nav-child]')];
    nodes.forEach(node => {
      if (node.dataset.navBound) return;
      node.dataset.navBound = 'true';
      node.querySelector(':scope > summary').addEventListener('click', (e) => {
        if (node.classList.contains('page-nav-section') || node.classList.contains('nav-view')) {
          e.preventDefault();
        }
      });
    });
  }

  /**
   * @param {HTMLElement} li - A drawer item or group.
   * @returns {{button: Element|null, sub: HTMLElement|null}}
   */
  function controlsOf(li) {
    return {
      button: li.querySelector(':scope > .page-nav-group-toggle, :scope > .page-nav-row > .page-nav-expand'),
      sub: li.querySelector(':scope > ul'),
    };
  }

  /**
   * Show or hide an item's next level. Hiding also resets everything below.
   * @param {HTMLElement} li
   * @param {boolean} open
   */
  function setOpen(li, open) {
    const { button, sub } = controlsOf(li);
    if (!sub) return;
    sub.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (!open) li.querySelectorAll('li').forEach(inner => {
      const controls = controlsOf(inner);
      if (controls.sub) {
        controls.sub.hidden = true;
        controls.button.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /**
   * Open or close an item, collapsing its siblings when opening.
   * @param {HTMLElement} li
   * @param {boolean} open
   */
  function toggleExclusive(li, open) {
    if (open) {
      Array.from(li.parentElement.children).forEach(sibling => {
        if (sibling !== li) setOpen(sibling, false);
      });
    }
    setOpen(li, open);
  }

  /**
   * Build a drawer link for a nav node.
   * @param {Element} el
   * @returns {HTMLAnchorElement}
   */
  function makeLink(el) {
    const a = document.createElement('a');
    a.href = `#${el.id}`;
    a.textContent = titleOf(el);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showView(el.id);
      if (navChildren(el).length > 0) {
        toggleExclusive(nodeItems.get(el.id), true);
      } else {
        closeDrawer();
      }
      history.pushState(null, '', `#${el.id}`);
    });
    links.set(el.id, a);
    return a;
  }

  /**
   * Build the drawer item for a nav node, recursing into its children.
   * @param {Element} el
   * @returns {HTMLLIElement}
   */
  function buildNode(el) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'page-nav-row';
    row.appendChild(makeLink(el));
    li.appendChild(row);
    nodeItems.set(el.id, li);

    const children = navChildren(el);
    if (children.length > 0) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'page-nav-expand';
      button.setAttribute('aria-label', `Show ${titleOf(el)} sub-sections`);
      const sub = document.createElement('ul');
      children.forEach(child => sub.appendChild(buildNode(child)));
      row.appendChild(button);
      li.appendChild(sub);
      setOpen(li, false);
      button.addEventListener('click', () => toggleExclusive(li, sub.hidden));
    }
    return li;
  }

  /** (Re)build the whole drawer list from the current DOM. */
  function buildNav() {
    list.replaceChildren();
    links.clear();
    nodeItems.clear();

    const groups = [];
    sections.forEach(section => {
      const key = section.dataset.navGroup || '';
      let group = groups.find(g => g.key === key);
      if (!group) {
        group = { key, title: section.dataset.navGroupTitle || '', sections: [] };
        groups.push(group);
      }
      group.sections.push(section);
    });

    groups.forEach(group => {
      if (!group.title) {
        group.sections.forEach(section => list.appendChild(buildNode(section)));
        return;
      }
      const li = document.createElement('li');
      li.className = 'page-nav-group';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'page-nav-group-toggle';
      button.textContent = group.title;
      const sub = document.createElement('ul');
      group.sections.forEach(section => sub.appendChild(buildNode(section)));
      li.appendChild(button);
      li.appendChild(sub);
      setOpen(li, false);
      button.addEventListener('click', () => toggleExclusive(li, sub.hidden));
      list.appendChild(li);
    });
  }

  /**
   * Show the view for targetId (a nav node, or anything nested inside one).
   * Falls back to the first section if targetId matches nothing.
   * @param {string} targetId
   * @param {{scroll?: boolean}} [options]
   */
  function showView(targetId, { scroll = true } = {}) {
    document.querySelectorAll('.nav-off, .nav-view, .nav-path').forEach(el => el.classList.remove('nav-off', 'nav-view', 'nav-path'));
    lastPath.forEach(el => {
      if (el.tagName === 'DETAILS' && !el.classList.contains('page-nav-section')) el.open = false;
    });

    const target = targetId ? document.getElementById(targetId) : null;
    const topLevel = target ? sections.find(section => section.contains(target)) : null;

    // No view selected: show the holding page (if the page has one)
    if (!topLevel && holding) {
      sections.forEach(section => {
        section.classList.remove('active');
        section.open = false;
      });
      holding.hidden = false;
      lastPath = [];
      links.forEach(a => a.classList.remove('active'));
      return;
    }
    if (holding) holding.hidden = true;

    const active = topLevel || sections[0];
    const viewEl = topLevel
      ? target.closest('details[data-nav-child], .page-nav-section')
      : active;
    const deepTarget = topLevel && viewEl !== target ? target : null;

    sections.forEach(section => {
      const isActive = section === active;
      section.classList.toggle('active', isActive);
      section.open = isActive;
    });

    // Path from the view up to its section: open it, hide everything beside it
    const path = [];
    for (let el = viewEl; el; el = el.parentElement) {
      path.push(el);
      if (el === active) break;
    }
    path.forEach(el => {
      el.classList.add('nav-path');
      if (el.tagName === 'DETAILS') el.open = true;
    });
    path.slice(1).forEach(ancestor => {
      Array.from(ancestor.children).forEach(child => {
        if (!path.includes(child)) child.classList.add('nav-off');
      });
    });
    viewEl.classList.add('nav-view');
    lastPath = path;

    if (deepTarget) {
      for (let el = deepTarget; el && el !== viewEl; el = el.parentElement) {
        if (el.tagName === 'DETAILS') el.open = true;
      }
    }

    links.forEach((a, id) => a.classList.toggle('active', id === viewEl.id));
    if (scroll) {
      (deepTarget || viewEl).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /** Open the drawer, always starting again from the top level (groups only). */
  function openDrawer() {
    Array.from(list.children).forEach(item => setOpen(item, false));
    drawer.scrollTop = 0;
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
    showView(window.location.hash.replace('#', ''));
  });

  bindSummaries();
  buildNav();
  showView(window.location.hash.replace('#', ''), { scroll: false });
});
