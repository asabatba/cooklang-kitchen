---
id: 006
title: Extract shared 401/session-expiry handling in app.js
status: closed
type: task
assignee: arnau
blocked_by: []
implemented: true
---

## Question

In [src/cooklang_kitchen/static/js/app.js](../../../src/cooklang_kitchen/static/js/app.js), four methods — `loadMissingTranslations()`, `runTranslationUpdate()`, `saveRecipe()`, `deleteRecipe()` — each repeat the same block on a 401 response:

```js
this.adminMode = false;
this.authStatus.logged_in = false;
this.setAdminModePreference(false);
this.toast('Session expired - please log in again');
```

(with `closeTranslationsAdmin()` added in the two translation methods). Write up the extraction as a small implementable spec: a single `handleAuthExpired()` (or a `fetchJSON` wrapper that checks for 401 and calls it) that all four call sites use instead of repeating the block.

## Answer

A plain `handleAuthExpired()` method (not a `fetchJSON` wrapper — `fetchJSON` is used for non-admin requests too, where a 401 doesn't mean session expiry, so baking the check in there would be wrong).

### Implementation (done)

- [src/cooklang_kitchen/static/js/app.js](../../../src/cooklang_kitchen/static/js/app.js): added `handleAuthExpired()` right after `checkAuth()`, containing the 4-line shared block. All four call sites (`loadMissingTranslations`, `runTranslationUpdate`, `saveRecipe`, `deleteRecipe`) now call it; the two translation methods still call `closeTranslationsAdmin()` alongside it (that part isn't shared with the other two, so it stays at the call site rather than being folded into the shared method).
- Verified: `node --check` confirms valid syntax; diff review confirms each extracted call site is byte-identical in behavior to before, just deduplicated (no logic changes, pure mechanical extraction).
