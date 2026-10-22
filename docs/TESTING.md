# Repeatable browser regression tests

## Run locally

Use Node.js 22 and install the project's dependencies, then install the three
browser engines once:

```sh
npm ci
npm run test:e2e:install
npm run test:e2e
```

The first run also downloads the pinned MongoDB 8.2.6 vendor binary into
`.local/e2e/mongodb`. Internet access is needed for these initial downloads.
The application checks themselves use local fixtures and stub external images,
map tiles and upload responses. On Linux, install browser system libraries with
`npx playwright install --with-deps chromium firefox webkit`.

Pass Playwright filters through the runner for a focused rerun:

```sh
npm run test:e2e -- --project=chromium tests/e2e/inbox.spec.ts
```

Use this runner rather than starting Playwright directly. It creates the
isolated database and application that the fixture safety checks require.

## Isolation and cleanup

- A fresh local MongoDB replica set runs on loopback with the fixed database
  name `moenavigation_e2e` and a per-run ownership marker. Each test resets only
  the named fixture collections after checking the URI, database and marker.
- The fixture contains synthetic administrator access, illustrative website
  content, synthetic media and 130 enquiries. It does not copy live enquiries,
  passwords or provider assets.
- The runner explicitly clears provider credentials, including names found in
  local environment files, before building or starting Next. Live MongoDB,
  Cloudinary and Resend credentials are not used.
- The production build uses `.next-e2e`, preserving `.next` and the normal
  preview on port 3005. The runner restores `next-env.d.ts` after generation.
- Ports **3010 and 3011** must be free. An HTTPS proxy at
  `https://127.0.0.1:3010` forwards to the local Next server on 3011 so tests use
  the real production Secure-cookie login. Its short-lived certificate is
  trusted only by the test browsers; the operating system trust store is not
  changed.
- Workers run sequentially to keep fixture resets and mutations deterministic.
  The runner stops its app, proxy and replica set and removes its owned database
  directory at completion. Downloaded binaries and the isolated build stay
  cached for later runs.

## Coverage

The same 15 workflow cases run in Chromium, Firefox and WebKit:

| Area | Checked behavior |
| --- | --- |
| Public listings | Fleet, News and Projects search/category filters, empty states, URL state, reload, detail and back links, language switching |
| Mobile navigation and dialogs | Navigation returns to page top, gallery controls, keyboard focus containment and return, horizontal overflow |
| Routes | Keyboard selection, zoom/fit, reload and equivalent Thai route |
| Enquiry form | Validation focus, local recovery, consent reset, failed response after server commit, duplicate-free retry |
| CMS content | Single Save immediately visible in both languages, no publication selector, unsaved-change confirmation, Trash and restore |
| CMS images | No upload before Save, sequential preparation/upload, partial failure recovery, preserved descriptions, idempotent save after a lost response |
| Entire inbox | Old Thai records beyond the first page, literal punctuation, all searchable fields, exact totals, combined status/search, 111 matching timestamp-tied records across three pages |
| Inbox resilience | Revision conflicts, detail refresh, status changes, global New count, slow obsolete responses, failed search and failed next-page retry, enquiry updates during initial content loading |
| Inbox boundaries | Authentication, private delivery fields, query/cursor validation and no-store responses |

The upload case simulates the provider-facing upload endpoint and inserts
synthetic staged media into the owned database. Final content transactions,
media ownership/reference checks and uncertain-save recovery use the real app.
It does not establish live Cloudinary delivery. Email is disabled; a saved
enquiry must report `not_configured` with zero delivery attempts.

The separate API, live-provider media and notification rehearsal commands remain
documented in [BACKEND.md](BACKEND.md). Browser regressions complement the pure
unit/boundary suite (`npm run test:backend`); they do not replace those checks.

## Results and CI

- `test-results/results.json`: machine-readable browser results.
- `playwright-report/index.html`: HTML report; view with
  `npx playwright show-report`.
- `test-results/`: failed screenshots/traces plus any explicit visual captures.
- `.local/e2e/result.json` and `.local/e2e/runner.log`: isolated runner status and
  application/test output.

These generated files are ignored by Git. CI runs lint, unit tests, route type
generation, TypeScript and production build, then installs all three engines
and runs the same isolated browser suite. Failed browser artifacts are retained
for seven days. It uses no live provider secrets. A workflow file in the
repository is configuration; a remote CI result is only established after it
runs on GitHub.

See [VERIFICATION.md](VERIFICATION.md) for the latest executed results.
