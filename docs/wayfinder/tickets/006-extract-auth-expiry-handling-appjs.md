---
id: 006
title: Extract shared 401/session-expiry handling in app.js
status: open
type: task
assignee: null
blocked_by: []
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
