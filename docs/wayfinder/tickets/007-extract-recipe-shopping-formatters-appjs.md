---
id: 007
title: Extract shared recipe/shopping-list formatter logic in app.js
status: open
type: task
assignee: null
blocked_by: []
---

## Question

In [src/cooklang_kitchen/static/js/app.js](../../../src/cooklang_kitchen/static/js/app.js), `recipeToText()` and `recipeToMarkdown()` build near-identical output (title, description, metadata, ingredients, method) with only line-prefix/heading-syntax differences. Same pattern for `shoppingToText()` and `shoppingToMarkdown()`. Write up the extraction as a small implementable spec: a shared line-builder parameterized by format (plain vs markdown), or a small format-adapter object (`{heading, listItem, ...}`) consumed by one function per artifact type.
