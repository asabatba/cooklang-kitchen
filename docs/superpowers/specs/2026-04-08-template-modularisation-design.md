# Template Modularisation Design

**Date:** 2026-04-08  
**Status:** Approved  
**Goal:** Break `index.html` (419 lines) into navigable partial files using Jinja2 `{% include %}`.

---

## Motivation

The single `index.html` is hard to navigate. The prior "modularize!" commit (Feb 2026) already extracted CSS → `app.css` and JS → `app.js`; this spec completes the pattern for the HTML layer.

---

## Approach

Flat `{% include %}` partials. `index.html` becomes a ~20-line skeleton. All context variables (Jinja2 and Alpine.js) remain implicitly shared — no interface changes needed. Partials are prefixed with `_` to signal they are not standalone pages.

No subdirectory is introduced; all files live flat in `templates/`.

---

## File Layout

```
src/cooklang_kitchen/templates/
  index.html           ← skeleton: <head>, <body> wrapper, 8 includes
  _header.html         ← sticky nav bar (theme toggle, language, admin, list buttons)
  _sidebar.html        ← recipe list, category headers, search input, admin buttons
  _main.html           ← empty state + active recipe (title, meta, notes, ingredients, method, source viewer)
  _shopping.html       ← shopping list aside panel
  _timer_dock.html     ← floating timer bar (active + completed timers)
  _modals.html         ← admin recipe editor, translation admin, login modal (all 3)
  _toasts.html         ← toast notification queue
```

---

## `index.html` Shell (target state)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- meta, theme-init script, Google Fonts, custom <style>, Tailwind CDN, app.js, Alpine CDN -->
</head>
<body class="min-h-screen bg-gradient-to-br ...">
  <div x-data="kitchenApp()" x-init="init()" class="min-h-screen">
    {% include '_header.html' %}
    <div x-show="ui.sidebarOpen || ui.cartOpen" x-cloak
         @click="closeDrawers()"
         class="fixed inset-0 z-30 ... xl:hidden"></div>
    <div class="mx-auto grid max-w-[1600px] ...">
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

The drawer backdrop (`x-show="ui.sidebarOpen || ui.cartOpen"`) stays in `index.html` — it is structural glue between the sidebar and shopping drawers, not part of either panel.

---

## Partial Boundaries

| File | Approx. lines | Content |
|------|--------------|---------|
| `_header.html` | ~30 | `<header>` tag and all its contents |
| `_sidebar.html` | ~55 | Left `<aside>` tag and all its contents |
| `_main.html` | ~150 | `<main>` tag: loading/error states, empty state, full recipe article |
| `_shopping.html` | ~50 | Right `<aside>` tag and all its contents |
| `_timer_dock.html` | ~40 | `<section x-show="hasAnyTimers">` |
| `_modals.html` | ~100 | Three modal `<div>` wrappers |
| `_toasts.html` | ~8 | Toast `<section>` |
| `index.html` | ~20 | Shell only |

---

## Constraints

- **No behaviour changes.** This is a pure structural refactor. No Jinja2 variables, Alpine.js bindings, or CSS classes change.
- **No subdirectory.** All files flat in `templates/`. A subfolder adds path overhead with no gain at this scale.
- **`web.py` unchanged.** `render_template("index.html", ...)` continues to work as-is; Flask resolves `{% include %}` paths relative to the template loader root.
- **Jinja2 context sharing.** All partials share the parent render context (`app_config`, etc.) automatically — no arguments needed.

---

## Implementation Steps

1. Create `_header.html` — extract `<header>…</header>` from `index.html`
2. Create `_sidebar.html` — extract left `<aside>…</aside>`
3. Create `_main.html` — extract `<main>…</main>`
4. Create `_shopping.html` — extract right `<aside>…</aside>`
5. Create `_timer_dock.html` — extract `<section x-show="hasAnyTimers">…</section>`
6. Create `_modals.html` — extract the three modal `<div>` blocks
7. Create `_toasts.html` — extract the toast `<section>`
8. Replace extracted content in `index.html` with `{% include '_*.html' %}` calls
9. Verify: Flask serves the page correctly; no visual or functional regression
