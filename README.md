# N26

A static-site tool understanding N26.  
Built with **Jekyll 4** and vanilla JavaScript; hosted on **GitHub Pages**.

---

## Features

| Tool | Page | Description |
|------|------|-------------|
| **Shooting Sequence** | `tools/shooting.html` | Step-by-step ranged-attack roller: selectable weapon profiles/traits and armour/cover presets, Hit → Wound → Save → Damage → Injury dice, ammo/Rapid Fire tracking, Nerve checks. |
| **Rule Summary** | `tools/rules.html` | Interactive, expandable/collapsible quick reference: Game Structure, Model, Status, Conditions, Checks and Tests, Actions, Action Resolution, plus data-driven Weapon Trait and Skill tables. |
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
| `pageNav.js` | Opt-in "Jump to section" slide-out drawer (see `_includes/page-nav.html`): auto-builds one link per top-level `.main > details.reference-tables-collapsible`, using each `<summary>`'s text — no manual link list to maintain. |

### Data flow

```
_data/*.yml  →  Jekyll build  →  data/*.json  →  fetch() at runtime  →  Engine  →  UI
```

YAML data files in `_data/` are compiled to JSON by Jekyll's `jekyll-json` pipeline and served as static files under `data/`. Each tool's `DOMContentLoaded` handler fetches the relevant JSON file(s) and passes data to its engine.

### Markdown-authored prose sections

Long, mostly-prose/procedural reference content (e.g. the Rule Summary page's Game Structure, Checks and Tests, Actions, and Action Resolution sections) is authored as small Markdown files in the `rules_sections` collection (`_rules_sections/*.md`) rather than hand-written HTML. Each file has front matter (`title`, `slug`, optional `parent`/`order`/`collapsible_children`) and is rendered into a `<details>` block via the shared `_includes/rules-section.html` partial — one `{% include %}` call per top-level section. This keeps individual files small and lets contributors write plain Markdown (lists, tables, headings) instead of raw HTML tags, while Jekyll stitches everything into the same single static page at build time (no extra page loads).

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
_includes/page-nav.html  Opt-in "Jump to section" drawer markup (see pageNav.js)
_includes/rules-section.html  Renders one rules_sections collection entry (+ children)
_data/                   YAML source data (weapon profiles, armour saves, weapon traits, etc.)
_rules_sections/         Markdown source for the Rule Summary page's prose sections
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
- **YAML data** — Files under `_data/` (e.g. `weaponProfiles.yml`, `armourSaves.yml`, `weaponTraits.yml`, `skills.yml`, `modelSubtypes.yml`, `statuses.yml`, `conditions.yml`) have a header comment describing their schema/structure — read that first when adding or changing entries.

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
