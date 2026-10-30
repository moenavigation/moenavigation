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

Browser regressions run in Chromium, Firefox and WebKit and cover these areas:

| Area | Checked behavior |
| --- | --- |
| Public listings | Fleet, News and Projects search/category filters, empty states, URL state, reload, detail and back links, language switching |
| Mobile navigation and dialogs | Navigation returns to page top, gallery controls, keyboard focus containment and return, horizontal overflow |
| Routes | Keyboard selection, zoom/fit, reload and equivalent Thai route |
| Enquiry form | Validation focus, local recovery, consent reset, failed response after server commit, duplicate-free retry |
| CMS content | Single Save immediately visible in both languages, no publication selector, unsaved-change confirmation, Trash and restore |
| Unified Trash | One list, type dialog, literal search, 30-item pagination, role-scoped totals, content/image/user restoration, safe failed-write reconciliation, retained image deletion retries, keyboard focus, English/Thai layouts |
| Account recovery | Soft deletion disables login and sessions; usernames stay reserved; role and current-password checks protect restoration/permanent deletion; expired and active accounts are rejected; previous sessions never revive |
| Activity logs | All-role read-only APIs, nested secret exclusion, exact expiry filtering and TTL configuration, tied-timestamp paging, literal search, audit-write rollback, save/logout idempotency, legacy usernames, exports, media/enquiry coverage, English/Thai mobile layouts |
| Profile photos | Self/manager permissions, staged ownership, session preservation, revision/replay safety, audit rollback, media cleanup races, active/Trash image references, cancel without upload, retry without duplicate uploads, 12-image library pages, header fallback, English/Thai mobile dialogs |
| Page editing | Page cards, selected-page URLs and history, existing text/image edits, bilingual validation, shared footer, mobile layouts, and server rejection of new pages, new sections, layout changes and deletion |
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

## Expanded role and mobile checks

The complete matrix has a 35-minute global timeout; each case still has its
own bounded timeout.
The broad mobile geometry sweeps run once in Chromium at 320 and 390 pixels
with 430-pixel spot checks. Critical touch dialogs and native touch slider
submission run across all three engines in English and Thai, including a
short 844×390 landscape viewport. Duplicated broad sweeps are explicitly
skipped in the other engines. Screens, dialogs and primary controls are checked
for overflow, clipping, center-hit accessibility, focus return and touch size.

The added role regressions cover allowed Operator collection, fixed-page,
Settings, enquiry and recoverable-image work; unfinished-upload ownership
for every role; late account-edit responses after session expiry; and
settings dismissal while the account list is still loading.

## Local results

- `test-results/results.json`: machine-readable browser results.
- `playwright-report/index.html`: HTML report; view with
  `npx playwright show-report`.
- `test-results/`: failed screenshots/traces plus any explicit visual captures.
- `.local/e2e/result.json` and `.local/e2e/runner.log`: isolated runner status and
  application/test output.

These generated files are ignored by Git. GitHub Actions workflows are not
used for this project. Run `npm run lint`, `npm run test:backend`,
`npx next typegen`, `npm run typecheck` and `npm run test:e2e` locally.
Install all three browser engines once with `npm run test:e2e:install`.
The browser harness performs a production build against its isolated local
database without live provider secrets. Review failed screenshots and traces
in the local results directories.

See [VERIFICATION.md](VERIFICATION.md) for the latest executed results.


## Provider usage regressions

`tests/usage-{mongodb,cloudinary,vercel}.test.ts` cover bounded reads, safe
responses, exact units/scopes, shared credits, reporting windows and malformed
provider responses. `tests/usage-settings.test.ts` covers defaults, unknown
versus zero, balances, finite ratios and reporting-window validation.

`tests/e2e/cms-usage.spec.ts` exercises role/origin checks, atomic audit saves,
revisions, safe metadata, cache binding, concurrent refresh cooldowns, manual
readings and timestamp preservation, form recovery, bilingual layouts and
absence of background polling. Run it through the isolated E2E harness. That
harness strips `VERCEL_USAGE_*` along with the existing provider credentials;
UI usage fixtures are synthetic and must never contact real provider accounts.
