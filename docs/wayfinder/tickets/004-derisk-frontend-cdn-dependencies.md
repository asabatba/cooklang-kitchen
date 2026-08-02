---
id: 004
title: De-risk frontend CDN dependencies
status: open
type: grilling
assignee: null
blocked_by: []
---

## Question

[templates/index.html](../../../src/cooklang_kitchen/templates/index.html) loads two dependencies from CDN in production (not just dev):

1. `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4` — this is Tailwind's "Play CDN" / in-browser JIT build. Checked against Tailwind's own docs (via context7): it is explicitly "meant for development purposes only" — every page load re-runs the JIT compiler in the browser instead of shipping a pre-built stylesheet.
2. `https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js` — pinned only to major version `3.x.x`, so any 3.y.z release (including breaking minor/patch changes) is pulled automatically on next page load. Neither script tag has a Subresource Integrity (SRI) hash, so a compromised or unavailable CDN can silently break or replace the app's JS/CSS.

Decide: introduce a real Tailwind build step (Tailwind CLI, per official recommendation) as part of the Docker build, and/or pin Alpine to an exact version with an SRI hash, and/or vendor both locally. Given the Dockerfile ([Dockerfile](../../../Dockerfile)) already does a `pip install` build step, adding a Node-based CSS build stage is a real (if small) infra change — weigh that against just pinning+SRI as a lower-effort interim fix. Write up the chosen approach as an implementable spec.
