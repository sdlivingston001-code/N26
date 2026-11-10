# N26

A static-site tool understanding N26.  
Built with **Jekyll 4** and vanilla JavaScript; hosted on **GitHub Pages**.

---

## Features

| Tool | Page | Description |
|------|------|-------------|
| **Shooting Sequence** | `tools/shooting.html` | Step-by-step ranged-attack roller: selectable weapon profiles/traits and armour/cover presets, Hit → Wound → Save → Damage → Injury dice, ammo/Rapid Fire tracking, Nerve checks. |
| **Rule Summary** | `tools/rules.html` | Interactive quick reference with a grouped, drill-down burger menu: Resolve (game structure, checks, actions, movement, shooting, close combat, recovery/nerve tests…) and Reference (model types, conditions, statuses, skills, weapon traits). |
| **Icon Dictionary** | `tools/icons.html` | Developer reference grid of all Phosphor icons used in the app. |

---

## Architecture

### Engine / UI separation

Every tool follows a strict **Engine + UI** pattern:

- **Engine** (`*Engine.js`) — Pure logic: dice rolls, table lookups, data transforms. No DOM access.
- **UI** (`*UI.js`) — DOM rendering, event binding, and orchestration. Calls the engine for results.

Shared modules used across tools:

| Module | Purpose |
|--------|---------|
| `dice.js` | Core dice rolling (`d6`, `2d6`, `d66`, card-draw), shared `isInRange()` utility. |
| `timer.js` | Per-page roll timer with 4-deep history, persisted in `localStorage`. |
| `icons.js` | ~33 inline SVG icons (Phosphor Bold); all use `currentColor` for CSS inheritance. |
| `dataLoader.js` | `fetchJSON()` helper — cache-busted `fetch()` wrapper for `data/*.json`. |
| `uiUtils.js` | `animatedReplace()`/`delay()` helpers for result-box transitions. |
| `main.js` | Auto-applies `.btn` class to `<button>` elements and wires up collapsible click-to-close. |
| `pageNav.js` | Opt-in slide-out navigation drawer (see `_includes/page-nav.html`) with a single-view layout: builds a drill-down menu (groups > sections > nested `data-nav-child` entries, any depth) from the page's top-level `.main > details.reference-tables-collapsible` — no manual link list to maintain. |

### Data flow

```
_data/*.yml  →  Jekyll build  →  data/*.json  →  fetch() at runtime  →  Engine  →  UI
```

YAML data files in `_data/` are compiled to JSON by Jekyll's `jekyll-json` pipeline and served as static files under `data/`. Each tool's `DOMContentLoaded` handler fetches the relevant JSON file(s) and passes data to its engine. (The Rule Summary page is the exception: it renders its YAML at build time with Liquid, so it fetches nothing.)

### Rule Summary sections (one repeatable structure)

Every section of the Rule Summary page is a small Markdown file in the `rules` collection (`_rules/`). **The folder layout is the whole hierarchy:**

```
_rules/<group>/<section>.md             top-level section in a group
_rules/<group>/<section>/<child>.md     child of that section (any depth)
```

`tools/rules.html` never needs editing: it loops over the groups in `_data/rulesGroups.yml` (currently **Reference** and **Resolve**; each `id` must match a folder under `_rules/`) and `_includes/rules-tree.html` renders everything at build time, recursing into child folders.

Front matter is just:

| Key | Use |
|-----|-----|
| `title` | Heading shown for the section. |
| `order` | Sort position among its siblings. |

To add a section, create a Markdown file in the right folder (lists, tables and headings; Liquid includes work too). Group, parent and anchor id all come from the path.

**Navigation:** the burger menu (`pageNav.js`) shows one view at a time and drills down one level at a time. Every time it is opened it starts again at the top level, showing only the group names (Reference, Resolve); choosing one reveals its sections, and any section with children has a chevron revealing the next level (e.g. Reference → Skills → Agility → Catfall). Opening an entry collapses its siblings. Choosing an item shows it; items with children keep the menu open so you can keep drilling, leaves close it. A view shows one node's content under a static heading (its own children appear as collapsibles).

Navigation children come from child files, and also from data-driven includes (see below): `rules-skills.html` and `rules-subtypes.html` link from their section to each group (skill groups, Fighter/Vehicle subtypes), and each group is its own menu page (link-only: `rules-entry.html`'s `link_only` option hides a child in its parent's view, shown only when selected). Every skill is also its own menu entry and view (e.g. `skills-agility-catfall`). `rules-traits.html` gives plain collapsibles inside its section. Group order in the menu follows `_data/rulesGroups.yml`.

**Linking between sections:** a top-level section's id is its file name and a child's id is `<parent id>-<file name>` (e.g. `actions-engaged`). Any Markdown can link to either, e.g. `[Recovery Tests](#recovery-tests)`; the page switches to the right view.

**Embedding YAML-driven content (build time):** a section's Markdown includes one of `rules-skills.html`, `rules-subtypes.html` or `rules-traits.html`, which render `_data/skills.yml`, `_data/modelSubtypes.yml` and `_data/weaponTraits.yml` through the shared `rules-entry.html` (one collapsible block; its `body` is run through `markdownify`, so descriptions can be Markdown or HTML). Nothing is fetched at runtime, so the menu is built from final HTML. Only `weaponTraits` and `weaponProfiles` are also published as JSON (`data/*.json`), for the Shooting tool. Statuses and Conditions are plain Markdown tables in their section files.

---

## Development

### Prerequisites

- **Ruby** (with Bundler)
- **Jekyll 4.3+** (`gem install jekyll`)

### Local server

```bash
bundle install
bundle exec jekyll serve --livereload
```

The site will be available at `http://localhost:4000//`.

### Project structure

```
_config.yml              Jekyll configuration (baseurl, collections, plugins)
_layouts/default.html    Master HTML layout (head, body wrapper, bottom-bar)
_includes/bottom-bar.html  Sticky icon navigation bar
_includes/page-nav.html  Opt-in navigation drawer markup (see pageNav.js)
_includes/rules-tree.html  Recursively renders _rules/ folders (sections + children)
_includes/rules-entry.html  One collapsible block; used by rules-skills/-subtypes/-traits.html
_data/                   YAML source data (weapon profiles, armour saves, weapon traits, etc.)
_rules/                  Markdown source for the Rule Summary; folders = hierarchy
assets/
  css/style.css          Master stylesheet (24 numbered sections)
  js/                    All JavaScript modules (engine/UI pairs + shared)
data/                    Build output: compiled JSON from _data/
tools/                   Tool HTML pages (one per feature)
index.md                 Landing page with links to all tools
```

### Cache-busting

All `<script>` and `<link>` tags in the layout append `?v={{ site.time | date: '%s' }}` so browsers always fetch the latest assets after a deploy.

### Documentation conventions

- **JavaScript** — All Engine and UI modules use JSDoc: a file-level header block (description, key behaviors, `Depends on:`) plus per-method `@param`/`@returns` blocks. Follow this style for any new module or method.
- **YAML data** — Files under `_data/` (e.g. `weaponProfiles.yml`, `armourSaves.yml`, `weaponTraits.yml`, `skills.yml`, `modelSubtypes.yml`, `rulesGroups.yml`) have a header comment describing their schema/structure — read that first when adding or changing entries.

### Known limitations

- **Naming conventions are mixed by design**: YAML/JSON data uses `snake_case` keys (matching Necromunda source-book terminology), while JavaScript uses `camelCase`. This boundary is intentional and not something to "fix" — don't rename data keys to match JS style.
- **Error handling is intentionally minimal** at `fetch()`/JSON-parse boundaries — this is a personal dev tool used at the table, not a production service, so failures are logged/shown inline rather than exhaustively guarded against.
- **Never write literal `{{ }}` / `{% %}` Liquid syntax inside an `_includes/*.html` file's own documentation comment** (even just as an example) — Liquid evaluates it regardless of HTML-comment context, and because Jekyll's `{% assign %}` scope leaks across sequential sibling `{% include %}` calls on the same page, a literal example like `{{ section.content }}` placed before that variable is (re)assigned will render the *previous* include call's stale value. Describe usage in prose instead.

---

## Tech Stack

- **Jekyll 4.3** — Static site generator
- **Vanilla JavaScript (ES6+)** — No frameworks or build tools
- **GitHub Pages** — Hosting and deployment
- **Phosphor Icons** — Inline SVG icon set
