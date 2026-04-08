# Template Modularisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break `src/cooklang_kitchen/templates/index.html` (419 lines) into 8 focused partial files using Jinja2 `{% include %}`, with no behaviour or visual changes.

**Architecture:** `index.html` becomes a ~25-line skeleton (`<head>` + `<body>` shell + 8 `{% include %}` calls). Each partial owns exactly one UI region. All Jinja2 context variables and Alpine.js bindings are implicitly shared — no interface changes.

**Tech Stack:** Flask/Jinja2 template engine, Alpine.js (client-side only), Tailwind CSS CDN.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/cooklang_kitchen/templates/index.html` | Skeleton only: `<head>`, `<body>` wrapper, 8 includes |
| Create | `src/cooklang_kitchen/templates/_header.html` | Sticky nav bar |
| Create | `src/cooklang_kitchen/templates/_sidebar.html` | Recipe list, search, admin buttons |
| Create | `src/cooklang_kitchen/templates/_main.html` | Empty state + full recipe article |
| Create | `src/cooklang_kitchen/templates/_shopping.html` | Shopping list aside panel |
| Create | `src/cooklang_kitchen/templates/_timer_dock.html` | Floating timer bar |
| Create | `src/cooklang_kitchen/templates/_modals.html` | Admin editor, translation admin, login modals |
| Create | `src/cooklang_kitchen/templates/_toasts.html` | Toast notification queue |

> `package_data` in `pyproject.toml` already uses `"templates/*.html"` — the new `_*.html` files are covered automatically.

---

## Task 1: Establish smoke-test baseline

**Files:** none changed

- [ ] **Step 1: Install the package in dev mode**

  ```bash
  cd /path/to/cooklang-kitchen
  pip install -e .
  ```

- [ ] **Step 2: Start the dev server**

  ```bash
  flask --app cooklang_kitchen.app:create_app run --debug
  ```

  Expected output includes:
  ```
   * Running on http://127.0.0.1:5000
   * Debug mode: on
  ```

- [ ] **Step 3: Verify the page loads**

  Open `http://127.0.0.1:5000` in a browser.  
  Expected: the full Cooklang Kitchen UI renders — header, sidebar, main area, shopping panel visible.

- [ ] **Step 4: Note baseline**

  This is your reference state. Every subsequent task must produce the same visual output.

---

## Task 2: Extract `_header.html`

**Files:**
- Create: `src/cooklang_kitchen/templates/_header.html`
- Modify: `src/cooklang_kitchen/templates/index.html:90-118`

- [ ] **Step 1: Create `_header.html`**

  Copy lines 90–118 of `index.html` verbatim into a new file:

  ```
  src/cooklang_kitchen/templates/_header.html
  ```

  The file starts with `<header class="sticky top-0 ...">` and ends with `</header>`.

- [ ] **Step 2: Replace the extracted block in `index.html`**

  In `index.html`, delete lines 90–118 and replace with:

  ```html
    {% include '_header.html' %}
  ```

- [ ] **Step 3: Verify**

  Reload `http://127.0.0.1:5000`. Header (logo, theme toggle, language selector, admin and list buttons) must look identical to baseline.

- [ ] **Step 4: Commit**

  ```bash
  git add src/cooklang_kitchen/templates/_header.html \
          src/cooklang_kitchen/templates/index.html
  git commit -m "refactor: extract header into _header.html partial"
  ```

---

## Task 3: Extract `_sidebar.html`

**Files:**
- Create: `src/cooklang_kitchen/templates/_sidebar.html`
- Modify: `src/cooklang_kitchen/templates/index.html`

- [ ] **Step 1: Create `_sidebar.html`**

  Copy the current lines that contain the left `<aside>` from `index.html` verbatim into:

  ```
  src/cooklang_kitchen/templates/_sidebar.html
  ```

  The block starts with `<aside :class="ui.sidebarOpen ...` and ends with `</aside>`.  
  (These are the lines immediately after the drawer backdrop `<div>` and before `<main>`.)

- [ ] **Step 2: Replace in `index.html`**

  Delete the `<aside>…</aside>` block and replace with:

  ```html
      {% include '_sidebar.html' %}
  ```

- [ ] **Step 3: Verify**

  Reload. Sidebar (recipe list, search field, category headers) must be identical to baseline. Toggle the sidebar on mobile viewport — open/close animation must work.

- [ ] **Step 4: Commit**

  ```bash
  git add src/cooklang_kitchen/templates/_sidebar.html \
          src/cooklang_kitchen/templates/index.html
  git commit -m "refactor: extract sidebar into _sidebar.html partial"
  ```

---

## Task 4: Extract `_main.html`

**Files:**
- Create: `src/cooklang_kitchen/templates/_main.html`
- Modify: `src/cooklang_kitchen/templates/index.html`

- [ ] **Step 1: Create `_main.html`**

  Copy the `<main>…</main>` block verbatim into:

  ```
  src/cooklang_kitchen/templates/_main.html
  ```

  The block starts with `<main class="min-h-[calc(100vh-58px)] ...` and ends with `</main>`.

- [ ] **Step 2: Replace in `index.html`**

  ```html
      {% include '_main.html' %}
  ```

- [ ] **Step 3: Verify**

  Reload. Click a recipe in the sidebar — title, ingredients, method steps with amber circle numbers, source viewer toggle must all render correctly.

- [ ] **Step 4: Commit**

  ```bash
  git add src/cooklang_kitchen/templates/_main.html \
          src/cooklang_kitchen/templates/index.html
  git commit -m "refactor: extract main content into _main.html partial"
  ```

---

## Task 5: Extract `_shopping.html`

**Files:**
- Create: `src/cooklang_kitchen/templates/_shopping.html`
- Modify: `src/cooklang_kitchen/templates/index.html`

- [ ] **Step 1: Create `_shopping.html`**

  Copy the right `<aside>…</aside>` block verbatim into:

  ```
  src/cooklang_kitchen/templates/_shopping.html
  ```

  The block starts with `<aside :class="ui.cartOpen ...` and ends with `</aside>`.

- [ ] **Step 2: Replace in `index.html`**

  ```html
      {% include '_shopping.html' %}
  ```

- [ ] **Step 3: Close the grid `<div>` in `index.html`**

  The `</div>` that closes the three-column grid wrapper must remain in `index.html`, immediately after the include. Confirm it is still present after the replacement:

  ```html
      {% include '_sidebar.html' %}
      {% include '_main.html' %}
      {% include '_shopping.html' %}
    </div>
  ```

- [ ] **Step 4: Verify**

  Reload. Check a recipe's checkbox — it should appear in the shopping list aside. Export buttons (Copy, .txt, .md) must be visible when items are selected.

- [ ] **Step 5: Commit**

  ```bash
  git add src/cooklang_kitchen/templates/_shopping.html \
          src/cooklang_kitchen/templates/index.html
  git commit -m "refactor: extract shopping list into _shopping.html partial"
  ```

---

## Task 6: Extract `_timer_dock.html`

**Files:**
- Create: `src/cooklang_kitchen/templates/_timer_dock.html`
- Modify: `src/cooklang_kitchen/templates/index.html`

- [ ] **Step 1: Create `_timer_dock.html`**

  Copy the `<section x-show="hasAnyTimers" …>…</section>` block verbatim into:

  ```
  src/cooklang_kitchen/templates/_timer_dock.html
  ```

- [ ] **Step 2: Replace in `index.html`**

  ```html
    {% include '_timer_dock.html' %}
  ```

- [ ] **Step 3: Verify**

  Reload. Open a recipe that has a timer step, click "Start Timer" — the timer dock must appear at the bottom of the viewport with the countdown running.

- [ ] **Step 4: Commit**

  ```bash
  git add src/cooklang_kitchen/templates/_timer_dock.html \
          src/cooklang_kitchen/templates/index.html
  git commit -m "refactor: extract timer dock into _timer_dock.html partial"
  ```

---

## Task 7: Extract `_modals.html`

**Files:**
- Create: `src/cooklang_kitchen/templates/_modals.html`
- Modify: `src/cooklang_kitchen/templates/index.html`

- [ ] **Step 1: Create `_modals.html`**

  Copy all three modal `<div>` blocks verbatim into:

  ```
  src/cooklang_kitchen/templates/_modals.html
  ```

  The three blocks, in order:
  - `<div x-show="ui.adminModalOpen" …>…</div>` — recipe editor
  - `<div x-show="ui.translationModalOpen" …>…</div>` — translation admin
  - `<div x-show="ui.loginModalOpen" …>…</div>` — login

  There is no wrapper element — the file contains three sibling `<div>` elements.

- [ ] **Step 2: Replace in `index.html`**

  ```html
    {% include '_modals.html' %}
  ```

- [ ] **Step 3: Verify**

  Reload. Click Admin → admin modal must open with title/category/source fields. Close it. Click the theme toggle — unrelated UI must still respond correctly (modals don't affect it). If a password is set, test the login flow.

- [ ] **Step 4: Commit**

  ```bash
  git add src/cooklang_kitchen/templates/_modals.html \
          src/cooklang_kitchen/templates/index.html
  git commit -m "refactor: extract modals into _modals.html partial"
  ```

---

## Task 8: Extract `_toasts.html`

**Files:**
- Create: `src/cooklang_kitchen/templates/_toasts.html`
- Modify: `src/cooklang_kitchen/templates/index.html`

- [ ] **Step 1: Create `_toasts.html`**

  Copy the `<section class="pointer-events-none …">…</section>` block verbatim into:

  ```
  src/cooklang_kitchen/templates/_toasts.html
  ```

- [ ] **Step 2: Replace in `index.html`**

  ```html
    {% include '_toasts.html' %}
  ```

- [ ] **Step 3: Verify**

  Reload. Copy a recipe (click the Copy button on an active recipe) — a toast notification should appear briefly at the bottom of the screen.

- [ ] **Step 4: Commit**

  ```bash
  git add src/cooklang_kitchen/templates/_toasts.html \
          src/cooklang_kitchen/templates/index.html
  git commit -m "refactor: extract toasts into _toasts.html partial"
  ```

---

## Task 9: Final cleanup and verification

**Files:**
- Modify: `src/cooklang_kitchen/templates/index.html`

- [ ] **Step 1: Confirm `index.html` skeleton**

  The final `index.html` should look like this in its entirety:

  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cooklang Kitchen</title>
    <style>[x-cloak]{display:none!important;}</style>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'DM Sans', system-ui, sans-serif; }
      html body .font-serif { font-family: 'Playfair Display', Georgia, serif; }
      html { color-scheme: light; }
      html.dark { color-scheme: dark; }
      /* ... (grain, step-num, scrollbar, animation styles) ... */
    </style>
    <script>/* theme-init IIFE */</script>
    <script>window.__APP_CONFIG__ = {{ app_config|tojson }};</script>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <script src="{{ url_for('static', filename='js/app.js') }}" defer></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
  </head>
  <body class="min-h-screen bg-gradient-to-br from-stone-50 via-amber-50/40 to-orange-50/60 text-stone-900 antialiased dark:from-[#130f09] dark:via-[#1b1510] dark:to-[#110d08] dark:text-stone-100">
    <div x-data="kitchenApp()" x-init="init()" class="min-h-screen">
      {% include '_header.html' %}
      <div x-show="ui.sidebarOpen || ui.cartOpen" x-cloak @click="closeDrawers()"
           class="fixed inset-0 z-30 bg-stone-950/35 backdrop-blur-sm xl:hidden dark:bg-black/55"></div>
      <div class="mx-auto grid max-w-[1600px] grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        {% include '_sidebar.html' %}
        {% include '_main.html' %}
        {% include '_shopping.html' %}
      </div>
      {% include '_timer_dock.html' %}
      {% include '_modals.html' %}
      {% include '_toasts.html' %}
    </div>
  </body>
  </html>
  ```

  Verify your actual file matches this structure. The `<head>` content (styles, scripts) stays in `index.html` — it is not extracted.

- [ ] **Step 2: Count lines**

  ```bash
  wc -l src/cooklang_kitchen/templates/index.html
  ```

  Expected: ≤ 95 lines (head is ~87 lines; shell adds ~8 more).

- [ ] **Step 3: Count template files**

  ```bash
  ls src/cooklang_kitchen/templates/
  ```

  Expected: `index.html  _header.html  _sidebar.html  _main.html  _shopping.html  _timer_dock.html  _modals.html  _toasts.html`

- [ ] **Step 4: Full smoke test**

  With the dev server running:
  1. Page loads at `http://127.0.0.1:5000` — no 500 errors in terminal
  2. Recipe list populated in sidebar
  3. Click a recipe — title, ingredients, method render correctly
  4. Check a recipe checkbox — shopping list updates
  5. Theme toggle switches light/dark mode
  6. Toast appears when copying a recipe

- [ ] **Step 5: Final commit**

  Only needed if any cleanup changes were made to `index.html` in this task.

  ```bash
  git add src/cooklang_kitchen/templates/index.html
  git commit -m "refactor: finalize index.html skeleton after partial extraction"
  ```
