---
id: 007
title: Extract shared recipe/shopping-list formatter logic in app.js
status: closed
type: task
assignee: arnau
blocked_by: []
implemented: true
---

## Question

In [src/cooklang_kitchen/static/js/app.js](../../../src/cooklang_kitchen/static/js/app.js), `recipeToText()` and `recipeToMarkdown()` build near-identical output (title, description, metadata, ingredients, method) with only line-prefix/heading-syntax differences. Same pattern for `shoppingToText()` and `shoppingToMarkdown()`. Write up the extraction as a small implementable spec: a shared line-builder parameterized by format (plain vs markdown), or a small format-adapter object (`{heading, listItem, ...}`) consumed by one function per artifact type.

## Answer

Format-adapter objects, one shared builder function per artifact type (not one builder for both artifact types — recipe and shopping outputs don't share enough structure to be worth forcing together).

While designing the adapters, found the two formats aren't purely a syntax swap: the shopping list's text format has a `"For: ..."` label that the markdown format omits entirely (just italicized names, no label) — a genuine content difference, not just markup. Preserved exactly as-is rather than "fixing" the asymmetry, since that's outside this ticket's scope.

### Implementation (done)

- [src/cooklang_kitchen/static/js/app.js](../../../src/cooklang_kitchen/static/js/app.js): added `RECIPE_TEXT_FORMAT`/`RECIPE_MARKDOWN_FORMAT` adapters (`heading`, `subtitle`, `metaLine`, `sectionHeading`, `listItem`, `numberedItem`) consumed by one `formatRecipeArtifact(data, fmt)`; `SHOPPING_TEXT_FORMAT`/`SHOPPING_MARKDOWN_FORMAT` adapters (`heading`, `subtitle`, `listItem`) consumed by one `formatShoppingArtifact(data, fmt)`. `recipeToText`/`recipeToMarkdown`/`shoppingToText`/`shoppingToMarkdown` are now one-line wrappers.
- One deliberate behavior change, not a regression: the old `recipeToMarkdown()` built its heading as `` `# ${data.title}` `` with no fallback (unlike the text version's `(data.title || '').toUpperCase()`), so a falsy title would literally render `"# undefined"`. The shared `formatRecipeArtifact` uses `fmt.heading(data.title || '')` for both formats, so this can't happen in either format now. Can't occur in practice today (the backend always requires and provides a title), so this is a latent-bug fix, not a functional change to observed behavior.
- Verified: wrote a standalone equivalence script reconstructing the exact old implementations and diffing their output against the new shared-builder versions across recipes with/without description, metadata, and ingredients, and shopping lists with/without a recipe list and with empty quantities — all byte-identical except the confirmed `"# undefined"` fix. `node --check` confirms valid syntax.
