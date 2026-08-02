---
id: 003
title: Harden the admin surface
status: closed
type: grilling
assignee: arnau
blocked_by: []
implemented: true
---

## Question

Three related findings about the admin/auth surface, worth deciding together since they trade off against each other and against "this is a personal, low-traffic app":

1. **Default-open admin.** `verify_password()` in [src/cooklang_kitchen/auth.py](../../../src/cooklang_kitchen/auth.py) returns `True` (i.e. "authenticated") whenever no password file exists yet. `admin_required` then lets every request through. Combined with the CapRover deployment instructions in [README.md](../../../README.md), which don't call out setting a password as a required step before exposing the app publicly, a fresh deploy with no `cooklang-kitchen set-password` run is a fully open admin interface (create/edit/delete recipes, trigger paid Gemini translation calls) to anyone who finds the URL.
2. **No login rate limiting.** `POST /api/auth/login` in [api/auth.py](../../../src/cooklang_kitchen/api/auth.py) has no attempt throttling or lockout — a password can be brute-forced without any friction.
3. **No CSRF token on state-changing endpoints.** Recipe create/update/delete and translation-update endpoints rely solely on the session cookie (`SESSION_COOKIE_SAMESITE=Lax` by default, which blocks cross-site POST in modern browsers — so this is a smaller risk than it first looks, but still worth a conscious decision rather than an accident).

Decide: should the default-open-when-unset behavior change (e.g. require a password before admin routes work at all, or make the README/CLI nag about it), is rate limiting worth adding now, and is the SameSite=Lax mitigation considered sufficient for CSRF or should an explicit token be added anyway? Write up the chosen approach(es) as implementable specs.

## Answer

Context established during grilling: the app **is** deployed and publicly reachable (CapRover), and the deployed instance **already has** an admin password set — so finding 1 is a latent risk (e.g. on a fresh redeploy or volume reset), not an active exposure today. All three decisions below were made with that in mind.

### 1. Fail closed when no password is configured

Change `admin_required` (and the login flow) so **no password configured → admin actions are refused**, instead of silently authenticated.

- In [src/cooklang_kitchen/auth.py](../../../src/cooklang_kitchen/auth.py):
  - `admin_required`: when `get_password_hash()` is `None`, return `503` with a clear message, e.g. `{"error": "Admin password not configured. Run cooklang-kitchen set-password to enable admin actions."}`, instead of letting the request through.
  - `verify_password()`: when no hash exists, return `False` instead of `True` — login itself should fail closed too, not just downstream `admin_required` checks.
- In [src/cooklang_kitchen/api/auth.py](../../../src/cooklang_kitchen/api/auth.py) `login()`: surface the "not configured" case distinctly from "wrong password" (e.g. check `get_password_hash() is None` first and return 503 with the same message as above) so the login UI can show something more useful than "Wrong password."
- No behavior change for prod (password already set there). Local/fresh dev now requires running `cooklang-kitchen set-password` once before admin features work — acceptable, matches the CLI's existing `set-password` command.
- Consider a one-line README callout near the CapRover deployment section noting `set-password` should be run as part of first deploy (not required by this ticket's scope, but worth doing alongside).

### 2. Rate limit `POST /api/auth/login`

Add a simple in-process throttle — no new dependency.

- New small module (e.g. `src/cooklang_kitchen/rate_limit.py`) holding an in-memory dict keyed by `request.remote_addr`: list of failed-attempt timestamps (or a count + window-start).
- Suggested policy: lock out after 5 failed attempts within 5 minutes; return `429` with a `Retry-After` header while locked out. Reset the counter on a successful login.
- Known/accepted limitation: state is per-process, so with gunicorn's `--workers 2` the effective limit is per-worker (up to ~2x the nominal threshold across the two workers), and it resets on restart/redeploy. Acceptable for this app's threat model (single shared admin password, low traffic) — a shared store (Redis etc.) would be overkill here.
- Applies only to `POST /api/auth/login`.

### 3. CSRF: no token, SameSite=Lax accepted as sufficient

No code change. Decision recorded so this isn't rediscovered as an unaddressed gap later: `SESSION_COOKIE_SAMESITE=Lax` (the default in [config.py](../../../src/cooklang_kitchen/config.py)) already blocks cross-site POST/PUT/DELETE requests made via fetch/XHR in all modern browsers, which covers the actual attack surface (this app's state-changing endpoints are JSON APIs called via `fetch`, not HTML form posts). Adding a token would be defense-in-depth with little payoff for a single-admin personal app — explicitly out of scope for now. Revisit only if `SESSION_COOKIE_SAMESITE` is ever changed away from `Lax`.

### Implementation (done)

- [src/cooklang_kitchen/auth.py](../../../src/cooklang_kitchen/auth.py): `verify_password()` returns `False` (not `True`) when no password is configured; `admin_required` returns `503` when no password is configured, `401` when one is configured but the session isn't authenticated.
- [src/cooklang_kitchen/api/auth.py](../../../src/cooklang_kitchen/api/auth.py): `login()` checks the rate limiter first (`429` + `Retry-After` when locked out), then returns a distinct `503` when no password is configured, before falling through to the existing wrong-password `403` path. Records failures/successes against `request.remote_addr`.
- [src/cooklang_kitchen/rate_limit.py](../../../src/cooklang_kitchen/rate_limit.py) (new): in-process, per-key (IP) failure tracker — 5 failed attempts / 5 minute window. Per-process state, as accepted in the decision above.
- [src/cooklang_kitchen/app.py](../../../src/cooklang_kitchen/app.py): added `ProxyFix(app.wsgi_app, x_for=1)` — required for the rate limiter to see real client IPs behind CapRover's nginx reverse proxy instead of the proxy's own IP for every request. Not called out explicitly in the original decision but necessary for it to function correctly in this app's actual deployment target.
- [src/cooklang_kitchen/static/js/app.js](../../../src/cooklang_kitchen/static/js/app.js): `toggleAdmin()` and `init()` no longer treat "no password set" as an auto-admin shortcut (that matched the old fail-open backend behavior) — they now prompt to run `set-password` instead. `submitLogin()` surfaces the actual server error message (distinguishes wrong-password / not-configured / rate-limited) instead of always showing "Wrong password."
- Verified manually end-to-end against the dev server: `POST /api/auth/login` and `POST /api/recipes` both return `503` with no password configured; login succeeds after `set-password`; 6 consecutive wrong-password attempts return `403` five times then `429` on the 6th, with `Retry-After` set. `node --check` confirms `app.js` is still syntactically valid. No automated test suite exists yet to codify this (see [008](008-test-suite-strategy.md)).
