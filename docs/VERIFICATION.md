# Verification record

Latest public-language checks: **29 October 2026 (Asia/Bangkok)**. The earlier
release record below was checked on **23 October 2026**. Machine-readable
reports use UTC timestamps. This record distinguishes completed local/isolated
checks from future launch acceptance.

Current public URLs use English at `/` and unprefixed paths, with Thai under
`/th`; legacy `/en` paths redirect to English. Dated evidence below records
the scheme used during that historical run. Current regression commands
and the browser checklist use the new routes.

## Public language migration - 29 October 2026

English uses `/` and unprefixed public paths; Thai uses `/th`. Explicit
switcher selections persist for one year. Fresh homepage entrances restore a
saved Thai choice, while explicit page links retain their URL language. Old
`/en` addresses redirect permanently to English. Public pages retain ISR.

- Typecheck, ESLint, and all 93 unit/boundary tests passed.
- The isolated production build passed. The full browser run passed 135 of
  138 scenarios; its three remaining assertions compared equivalent `%20`
  and `+` query encodings. After correcting only those assertions, all 21
  language scenarios passed across Chromium, Firefox, and WebKit. No runtime
  changes were made between those two runs.
- Checks cover desktop/mobile round trips with queries and anchors, cookie
  persistence across a fresh browser context, legacy redirects, explicit
  deep links, SEO, CMS independence, cached page invalidation, and recovery.
- The read-only saved-site crawl passed 61 routes, 30 image URLs, four expected
  404s, metadata, navigation, redirects, robots, and sitemap. A read-only CMS
  check found no custom `Page` with the newly reserved `th` identifier.
- Desktop and 390px mobile layouts were visually checked in both languages.
  Screenshots and the summary are in `.local/public-language/`.

## Earlier completed checks - 23 October 2026

| Area | Evidence | Result |
| --- | --- | --- |
| Unit and boundary tests | `npm run test:backend` | 65 tests passed, no failures or skips. Includes validation, server guards, CMS migration/recovery, specifications, enquiry idempotency, authentication, release gates, and backup archive boundaries. |
| Lint, types and production builds | `npm run lint`, `npm run typecheck`, `npm run build` | Passed. A separate production build also passed with all MongoDB, Cloudinary and Resend credentials explicitly blank, matching CI's lack of provider credentials. |
| Public route regression | `npm run test:smoke` against development and local production | 61 linked routes, all 15 original Cloudinary images plus 15 responsive deliveries, 4 expected 404 routes, both languages, metadata, robots and sitemap passed. No local content images remain. |
| Public browser workflow | `.local/full-test-browser-result.json` | 72 main-page layout checks across both languages and four widths passed. Navigation, listings, map, gallery, contact and outage/retry workflows passed; normal public/CMS tabs had no warnings or errors. |
| Image delivery measurement | `.local/performance-result.json` | 13 published images totaled 2,720,238 original bytes versus 445,812 bytes at 640px (84% reduction). Three routes measured on the local production server. This is an image payload comparison, not a field performance/Core Web Vitals score. |
| CMS browser workflow | `.local/full-test-browser-result.json` | Draft creation, validation, sequential media uploads, publication in both languages, gallery reordering, discard, Trash/restore, inbox, export, legacy review and authentication passed. |
| API workflow rehearsal | `.local/full-test-api-result.json` | 17 grouped checks passed against isolated MongoDB, including all seven content types, conflicts, retries, pagination, settings and temporary-account session rotation. |
| Notification concurrency/recovery | `.local/notification-check-result.json` | 6 isolated MongoDB checks passed with a stub sender; no external email. Exact test enquiries removed. |
| Media recovery | `.local/full-test-media-result.json` | 13 workflow groups passed with real Cloudinary lifecycle checks and deterministic failure/race simulations. Exact test artifacts removed; all 15 shared library records preserved. |
| Encrypted backup rehearsal | `.local/full-test-recovery-result.json` | Fresh archive restored into an isolated database and separate Cloudinary folder, independently verified, then precisely cleaned. Source document hashes remained unchanged. |

The CMS checks covered page/Section filtering and order, accessible discard confirmation, preservation after Cancel, valid and invalid vessel specifications, zero TEU, private draft previews, two sequential gallery uploads, saved bilingual descriptions, clearing an optional numeric field, enquiry submission, missing-provider retry, and independent enquiry status updates.

Before Save, both selected gallery files remained local and the QA media count stayed at 15. After Save, both Cloudinary images loaded from the reopened editor. The temporary test vessel, enquiry, and two uploaded images were removed after verification. QA returned to 58 content records and 15 shared library records.

Screenshots retained privately:

- `.local/cms-discard-320.png`
- `.local/cms-specs-390.png`
- `.local/cms-enquiry-390.png`
- `.local/cms-vessel-roundtrip-th.png`

The backup rehearsal preserved 58 content records, 15 image records and original images (3,178,074 bytes), one administrator account, one settings record, and zero enquiries. Verification compared restored documents and fetched all 15 restored images to verify their hashes. Only the owned rehearsal database and its exact image copies were cleaned. The initial archive remains. A fresh post-polish archive was then created and independently inspected after the six service-copy updates and privacy-provider explanation; it contains the same record/image counts. See [RECOVERY.md](RECOVERY.md) for both archives, receipts, and separate key-storage steps.

## Prepared, awaiting external acceptance

- Resend notifications are implemented; the owner will supply the provider key and verified sender. External delivery remains untested.
- CI is defined in `.github/workflows/ci.yml`; a successful GitHub Actions run and required-check configuration have not been established by local tests.
- `release:check` produces a read-only readiness report. It does not verify domain ownership, deploy the website, approve business claims, or enable provider backups.
- Hosting, DNS, HTTPS, production environment variables, provider backup policies, and actual enquiry delivery still require their respective account access and verification.
- Company facts, generated/illustrative assets, fleet specifications, route availability, and privacy wording remain subject to approval. Search indexing stays disabled while approval is pending.

The release checker intentionally reports not ready for public launch: the local origin remains localhost, factual company contacts are missing, business-content approval is pending, and email is not configured. `https://moe-navigation.com` is documented as the production origin. All nine core pages, 55 registered image references, MongoDB/Cloudinary connectivity, and zero unfinished uploads passed the read-only live checks.

Local production verification is complete. Public deployment and field measurements remain outstanding. These checks reduce known regressions; they do not establish that the website has no possible bugs.

## Detailed UI review — 23 October 2026

The follow-up UI pass covered the public pages, representative detail pages, navigation, gallery, route map, contact form, privacy notice, recovery pages, and CMS content, media, inbox and account screens.

### Improvements

- Mobile homepage services use wider horizontal cards. Fleet names and categories sit in white panels below photos. News cards stack their images above copy on narrow phones.
- Public search has explicit clear controls, live result counts and filter resets that return keyboard focus to search. Privacy has an expandable topic index.
- Route choices support native radio-button keyboard navigation. Selected-route details and map controls are clearer; page scrolling over the map no longer zooms it.
- Public dialogs keep their close controls visible, restore focus, and ignore selection drags that end on the backdrop. Clearing an enquiry draft requires confirmation and then focuses Name.
- CMS content editors keep Save/Cancel visible while fields scroll. Media searches include counts, empty states and clear controls. Gallery images can move earlier/later with their descriptions. Other long CMS dialogs keep their headers visible; mobile Refresh has a text label.
- Recovery pages use a consistent bilingual layout. Browser review found that the 404 page tried to render the shared shell without its content provider; the standalone 404 now renders correctly and has a localized tab title.

### Verification

| Check | Result |
| --- | --- |
| Final lint and production build, including TypeScript | Passed after the UI changes. |
| Backend regression suite | 44/44 passed, no skips. |
| HTTP route/image regression | 61 linked routes, 30 Cloudinary original/responsive URLs and 4 expected 404 routes passed. |
| Main-page layout matrix | All nine Thai pages at 320, 768 and 1024px, plus all nine English pages at 320px: one primary heading and no horizontal overflow. |
| Additional visual checks | 390px phone, 1440px desktop and 2560px wide-screen samples. Public cards, detail pages, map, gallery and recovery layouts inspected; CMS editor/library checked at 320px and desktop. |
| Public interactions | Search/filter focus, map keyboard/marker selection and controls, gallery next/Escape/focus return, draft cancel/clear, privacy topic anchors, and mobile navigation to page top passed. |
| CMS interactions | Required-field focus from the persistent Save action; search/count/empty/reset/reopen states; gallery order and description pairing; discard/reopen restoration; visible Save/Cancel and sticky media header passed. |
| Browser diagnostics | Final English main-page sweep and fleet check produced no new warnings or errors. |

Repeat the 404 regression in a browser at `/missing-page` and `/th/missing-page`: confirm the localized **Page not found** heading, appropriate home/services links, localized tab title, and no `Public content must be loaded by the page` error. The HTTP smoke check verifies status codes; this browser check also verifies the rendered recovery UI.

Evidence: `.local/ui-review-qa-result.json` and `.local/ui-review-*.png`. Temporary contact text was cleared; unsaved gallery changes were discarded and the original order verified after reopening. This UI pass did not save production content or media. Email delivery, production hosting and company-content approval retain the limitations above.

## Detailed functional review — 23 October 2026

Reviewed public navigation, bilingual listings and details, route selection, contact drafts and submission, CMS editing and recovery, settings, enquiries, authentication, content transactions and media ownership/cleanup boundaries.

### Improvements

- Fleet, News and Project search/category filters persist in the URL, survive reloads and language changes, and carry through detail/back links. Search matches both languages, including the visible translated category labels. Selected map routes also survive reload and language changes.
- The first row of fleet images loads eagerly; a final browser check caught a visible second card being unnecessarily lazy-loaded.
- Normal navigation still resets to page top; browser Back/Forward can restore the earlier scroll position. Language switches preserve live query parameters and section anchors. Modified mobile link clicks keep their normal browser behavior.
- Contact drafts preserve custom subjects and offer an explicit action for a new suggested subject. Unchanged interrupted submissions retain their identifier and original language after reload, and late success cannot clear a newer stored draft. Browser and API email validation share the same rule; localized field errors focus the first invalid input.
- CMS workspace refresh preserves dirty website details and their original revision. Overlapping workspace responses cannot replace newer state. Website links open a new tab; incomplete editor text can be downloaded for recovery. Changing a new draft's type asks before clearing incompatible fields. Image preparation participates in unsaved-work protection.
- An open enquiry can refresh its latest revision and recover from another tab's update. Its authenticated endpoint validates identifiers, excludes private submission/delivery fields, and disables caching.
- Section saves validate their parent Page before committing staged media. Password verification rejects malformed stored hash formats. QA startup explicitly disables external email even if provider credentials are configured later.

### Verification

| Check | Result |
| --- | --- |
| Lint, TypeScript and production build | Passed on the final implementation. |
| Unit/boundary suite | 63 passed, 0 failed or skipped. Includes listing URLs and bilingual search, contact restoration/idempotency/validation, CMS recovery/type changes, content transactions and malformed authentication hashes. |
| Isolated backend integration | 16 checks passed, including authenticated single-enquiry reads, invalid/missing IDs, revision conflicts, private-field filtering and cache controls. No new media upload was needed for this pass; earlier media checks remain recorded above. |
| HTTP regression | 61 linked routes, 30 Cloudinary original/responsive image URLs, 4 expected 404 routes, metadata, robots and sitemap passed. |
| Public browser workflows | Filter → reload → language → detail → back, route persistence/fallback, contact subject preservation/suggestion, invalid-email focus, successful enquiry receipt and cleared draft after reload passed. Privacy anchors survive language switching. Mobile new-page and current-page navigation both return to top. |
| CMS browser workflows | Two-tab enquiry conflict → refresh → save → verify in other tab; dirty settings refresh/cancel/discard; content-type confirmation/cancel; recovery download with incomplete coordinates passed. |
| QA data cleanup | The public browser submission was stored exactly once with zero email attempts. Exact owned integration/browser fixtures removed; QA returned to 58 content records, 15 shared media records and 0 enquiries. |

Private evidence: `.local/backend-smoke-result.json`, `.local/function-browser-qa-result.json` and `.local/function-review-*.png`. The downloaded route recovery JSON was checked for the exact incomplete coordinate text. No production content or media was saved during this pass. Resend delivery and deployment remain pending as described above.

## Full workflow retest — 23 October 2026

Ran a fresh production-build rehearsal using the isolated QA database and Cloudinary folder. External email was disabled throughout. The earlier review sections above remain historical records; the Completed checks table reflects this latest pass.

### Issues found and fixed

- Public and CMS dialogs allowed Tab or Shift+Tab to leave at their boundary. Shared focus containment now wraps within the active dialog and respects nested confirmations. Gallery, editor and discard-dialog keyboard flows were retested in the production build.
- Backup restore accepted database names longer than Atlas supports. The recovery tool now rejects names exceeding 38 ASCII bytes before any provider writes, with a regression test.
- Recovery cleanup missed the Cloudinary SDK's nested 404 error shape. It now recognizes already-removed assets while continuing to reject authentication, rate-limit and server failures; regression tests cover both error shapes.
- Data-outage pages lacked a meaningful localized browser title. They now include Thai/English recovery titles and noindex metadata. The Thai home link was corrected to `/` during that run; its current locale URL is `/th`.

### Coverage and evidence

| Workflow | Actual verification |
| --- | --- |
| Build and static checks | Final lint, TypeScript and 65 unit/boundary tests passed. Normal production build passed. A separate build in `.next-ci` explicitly blanked every MongoDB, Cloudinary and email credential and passed, including 19/19 generated static pages. Existing `.next` output was preserved. Evidence: `.local/full-test-ci-build-result.json`. |
| Content and authentication APIs | 17 groups: all seven content types, private drafts, bilingual publication, invalid data, revision conflicts, idempotent retries, parent availability, Trash/restore/expiry, settings snapshot restoration, safe exports, authentication/origin/body guards, temporary-account password rotation, expired sessions and logout. `npm run test:api:qa` repeats this isolated rehearsal against the QA server at port 3006. |
| Enquiry APIs and notification logic | Consent/text/email validation, honeypots, concurrent duplicate submissions, per-email throttling, private-field exclusion and 61 same-timestamp pagination fixtures passed. Six notification concurrency/recovery checks passed with a stub sender; no external email was sent. |
| Media lifecycle | 13 groups: MIME/size/signature validation, upload/retry, staging ownership, submission binding, commit/replay, late responses, save/cancel races, rollback retry, expiry cleanup and protection of referenced main/mobile/gallery/Trash images. Normal lifecycle used real Cloudinary; deterministic stubs exercised provider failure and race branches. |
| Browser content lifecycle | Required-field focus and invalid IMO rejection preserved prepared files. Two images stayed local until Save, uploaded sequentially, survived draft reopen and appeared publicly after publication. Gallery order retained bilingual descriptions. Clearing an optional numeric field and saving zero TEU worked. Draft and Trash content rendered public 404 pages; Restore made the record visible again. |
| Browser CMS operations | Unsaved Cancel/discard, nested dialog focus, enquiry search/status, unconfigured-email retry, sanitized JSON export, empty legacy import controls, interrupted-import check, invalid login, valid login and logout passed. Legacy helper logic is unit-tested; this pass did not re-import the already-migrated production dataset. |
| Public workflows | News and Project search/category/empty/reset/detail/back flows, bilingual filter persistence, gallery keyboard navigation, map radio keyboard/marker/zoom/fit controls, route persistence, mobile menu focus/Escape, page-top navigation and translated privacy anchors passed. |
| Responsive coverage | Nine main pages × two languages × four viewport widths (actual widths 320, 768, 1441 and 2560): no horizontal overflow, one primary heading, localized title/language, image alt attributes and labelled visible fields. Additional CMS and public interaction checks used 320px and approximately 390px layouts. These are browser viewport checks, not physical-device certification. |
| Outage and retry | An isolated server ran with MongoDB unavailable: Thai/English error screens remained usable, and Try again recovered after reconnection. Submitting a filled contact form during the outage preserved all inputs and showed a safe error; retry after recovery stored exactly one enquiry and cleared the draft. Expected server-render errors were confined to the intentional outage tab. |
| Public HTTP regression | After fixture cleanup, 61 linked routes, 30 original/responsive image URLs, four expected 404 routes, localized metadata/navigation, robots and sitemap passed. No local content-image references remain. |
| Backup and restore | Fresh encrypted archive `.local/backups/moe-full-test-20261022t204752-026251.moebackup` preserved 58 records, 15 original images (3,178,074 bytes), one account, one settings record and zero enquiries. Restore and independent document/image-hash verification passed. Exact restored resources were cleaned and all five source collection hashes stayed unchanged. See [RECOVERY.md](RECOVERY.md). |
| Cleanup | Removed only owned API, media, restore and browser fixtures. Both browser enquiries existed once with zero notification attempts. Cloudinary confirmed the two browser-uploaded images absent after deletion. QA returned to 58 content records, 15 media records, zero enquiries and its one original administrator; unrelated records and settings were unchanged. Evidence: `.local/full-test-browser-cleanup.json`. |

Normal CMS and public browser tabs recorded no warnings or errors. The production data was preserved. External email delivery, actual hosted HTTPS/DNS, a GitHub Actions run, provider-managed backup schedules, company-content approval and real-user performance still require the external acceptance described above. A passing test suite is evidence for these exercised paths, not a guarantee that every possible defect has been eliminated.

## Tasks 1 and 4: permanent browser tests and full inbox search — 23 October 2026

Implemented the two requested tasks and the owner's immediate-save requirement.
The CMS now has one **Save** action: newly saved or edited content is immediately
available publicly. The publication selector is removed. Historical unpublished
records are preserved until explicitly saved. Earlier draft/publication checks
above describe the previous UI and are retained as historical evidence.

Inbox queries now search all stored enquiries by name, email, company, subject,
message or ID. Search and status filters apply on the server, with exact matching
totals, global totals and the global New count. Cursor pagination retains the
filters and stable ordering. The client cancels obsolete reads, rejects stale
responses and preserves filters when retrying failures.

### Executed checks

| Check | Actual result |
| --- | --- |
| Unit and boundary tests | **73 passed**, zero failed or skipped. Includes literal Thai/English search, query/cursor validation, request cancellation and page merging. |
| Static checks | Full ESLint, TypeScript and `git diff --check` passed. |
| Isolated production build | `.next-e2e` build passed with the owned loopback MongoDB replica set and real provider credentials disabled. Generated 19/19 static pages. |
| Complete browser suite | **45 passed, zero failed, skipped or flaky**: 15 workflows in Chromium, Firefox and WebKit, in approximately 93 seconds. Evidence: `.local/e2e/full-20261023/test-results/results.json`. |
| Final contact-dialog change | Rebuilt the final source and reran the contact workflow in all three engines: **3 passed**, zero failed, skipped or flaky. Covers cancellation focus, interrupted submission, reload and duplicate-free retry. Evidence: `.local/e2e/contact-final-20261023/test-results/results.json`. |
| Responsive inbox | All three engines exercised search/status controls at **320px and 1280px**, including long lists without horizontal overflow. Screenshots were visually reviewed. Captures are under `.local/e2e/full-20261023/test-results/inbox-inbox-searches-older-6735c-ld-across-the-full-database-<browser>/`. |
| Immediate Save and media recovery | New content appeared in both languages after one Save. Unsaved discard/Cancel, Trash/restore, sequential image uploads, partial upload failure and a lost successful-save response passed. Retrying created one record and reused successful uploads. |
| Full inbox and resilience | Found old Thai messages beyond page two; literal punctuation and all six searchable fields worked. 111 same-timestamp matches paginated without duplicate or missing IDs. Status conflicts, refresh, accurate global counts, obsolete responses and search/next-page retries passed. |
| Cleanup and existing preview | The runner stopped its owned replica set, Next server and HTTPS proxy and removed its UUID database directory. `.local/e2e/runs` is empty. Existing port-3005 fleet and CMS previews returned HTTP 200; the development preview remains available. |

### Issues found and fixed

- Enquiry status/detail refresh no longer cancels an unrelated initial content,
  media or settings load. A delayed-response regression exercises this race.
- WebKit pointer activation does not always focus a button before opening a
  dialog. The gallery and contact clear-draft dialog now pass their explicit
  opener to the shared Dialog component. Escape/cancellation restores that
  control; confirmed contact clearing still focuses Name.
- Test selectors were corrected to target the intended accessible controls.
  Mobile viewport setup now happens when creating the browser context, avoiding
  a Firefox-on-Windows timeout while resizing an empty page.

The permanent runner, browser projects and CI workflow are documented in
[TESTING.md](TESTING.md). This pass used synthetic enquiries and staged media in
a fresh local database. The upload provider boundary was simulated; final
content transactions and save recovery used the real application. No live
MongoDB data, Cloudinary assets or external email were changed. GitHub Actions
is configured but has not been executed remotely during this task.

## 2026-10-30 — Client page editing

Replaced the mixed page/section table with page cards and existing editable areas, with a separate shared/footer group and direct links to collection lists and Settings. Page/Section editors expose only applicable text and picture fields. CMS API saves reject new pages/sections and structural changes, and reject moving existing pages/sections to Trash. Historical restoration and trusted maintenance remain available. Collection entries retain their existing creation workflows.

Validation completed locally:

- Production build, full ESLint, TypeScript and `git diff --check` passed.
- All 110 backend/unit tests passed, including fixed-layout restrictions and optional images on pages whose layouts do not display them.
- Initial full Chromium run passed 84 of 89 cases. Four new editor tests had an incorrectly scoped helper; one existing inbox regression exposed disabled dashboard navigation during a background refresh. Both issues were fixed.
- Focused dashboard, page editor, content/media recovery and inbox regression suite: 51 passed across Chromium, Firefox and WebKit. The final editor polish was then rebuilt and checked again: 18 passed across the three engines.
- Browser checks include bilingual saves immediately reflected on public pages, preserving identity/layout/images, page history and reload, footer-only fields, hidden-language validation, historically moved sections, API rejection without changing saved records, and English/Thai mobile overflow. Desktop and mobile screenshots were visually reviewed.

JSON evidence is retained under `.local/e2e/page-management-20261030/`: `initial-chromium-results.json`, `cross-browser-results.json`, and `final-editor-results.json`. Final screenshots are under `test-results/cms-pages-*/`. The runner used a disposable local database with synthetic media and no real provider credentials; its owned services and database directories were cleaned up. No deployment was performed.

## 2026-10-30 — Simpler collection editors

Vessels, routes, projects, services and news now open item-specific Add/Edit dialogs. The bilingual forms prioritize title, summary, applicable category and pictures. Longer content, vessel specifications, route ports/map points and extra vessel photos are expandable. Existing categories are suggested without restricting custom values. Publication dates remain editable for both projects and news.

Technical identifiers, content-type selection, manual display order and raw icon choices are hidden. New addresses are allocated at the first Save and retained throughout retries and subsequent title edits; existing identities and hidden saved metadata remain intact. New items receive a display order after existing items, within the supported limit. Route points use labeled latitude/longitude rows, retain existing precision and intermediate points, and require complete valid input before saving.

Validation completed locally:

- Production build, full ESLint, TypeScript and `git diff --check` passed; all 116 backend/unit tests passed.
- The initial focused Chromium run passed 14/15 tests and exposed duplicate photo uploads when a title changed after a lost successful-save response. Recovery now reuses only photo URLs confirmed in the committed record, retains the item identity, and gives the subsequent text save its own retry count.
- The collection, language, dashboard, page-editor and content-recovery suite passed 72 tests across Chromium, Firefox and WebKit. After the final retry-count and fingerprint adjustment, six save/discard/Trash/media-recovery checks passed again across all three engines, including two lost successful responses with a title edit between them.
- Browser coverage includes real creation of all five item types, duplicate non-Latin names, preserving hidden metadata/categories/specifications/route points, nested optional-field validation, mapped-route edits, bilingual content, and all five forms at 320px in English and Thai. Desktop and mobile screenshots were visually reviewed.

JSON results are retained under `.local/e2e/collection-editing-20261030/`: `initial-chromium-results.json`, `cross-browser-results.json`, and `final-save-recovery-results.json`. Tests used isolated synthetic data; no live data or external media provider was changed. No deployment was performed.

## 2026-10-30 — CMS users and role permissions

Added Dev, Admin and Operator roles, with server-enforced account management and permanent Trash deletion permissions. Existing accounts without a role retain Admin access. Only Dev can manage Dev accounts; Admin manages Admin and Operator accounts; Operator retains content management and personal password settings. Every role is prevented from deleting itself. The last Dev and last management account are protected from demotion. Account changes revoke existing sessions and use transactional permission checks to prevent concurrent changes from bypassing the rules.

Validation completed locally:

- All 126 backend/unit tests passed. TypeScript, focused ESLint, production builds and `git diff --check` passed.
- The first affected Chromium run passed 29 of 31 checks across roles, users, media Trash, image usage and CMS routing. The two failures identified a role-select label association issue. Explicit label associations fixed it.
- The final role/account Chromium run passed all 16 checks, including the added content Trash confirmation/cancellation test. Eight focused form, responsive, password-reset and permanent-delete checks passed in Firefox and WebKit.
- API checks cover every role, legacy and invalid roles, unauthorized promotion, Dev protection, self deletion, password resets, session revocation, self-demotion, concurrent last-Dev demotions, and cleanup/submission bypass attempts. Content deletion rejects active records, stale revisions, core pages and pages with linked sections. Confirmed deletion preserves saved library images.
- English desktop (1280px) and Thai mobile (360px) user-management screenshots were visually reviewed. Keyboard focus containment and password clearing in personal settings passed in all three browsers.

Final result JSON and screenshots are retained under `.local/e2e/cms-roles-20261030/`. Browser tests used isolated synthetic data and disabled real external provider credentials. After verification, the explicitly requested `dev` account was created in the configured project database with the Dev role and its supplied password hash verified. No plaintext password was written to the repository or printed by the provisioning script. Other live accounts and content were preserved. No deployment was performed.

## 2026-10-30 — Unified Trash and account recovery

Combined `/cms/trash` into one list for content, images and permitted user accounts. A reversible type-selection dialog and literal English/Thai search operate over all retained items on the server, with 30-item cursor pages and role-aware totals. Existing media usage links still locate the exact removed item and return restored content to its editor. The media shortcut selects the Images filter.

Account removal now disables access immediately and moves the account to 30-day Trash. Usernames remain reserved during retention; restoring an account preserves its password and role while keeping old sessions invalid. Restore and permanent deletion require the acting user's current password and the existing Dev/Admin target-role rules. Active accounts, expired items, self-removal and removal of the last active privileged account remain protected. No user credentials enter Trash responses.

The coverage review also corrected hidden image deletion retries and section restoration without an available parent page. Shared sections remain independently recoverable. Saved image cleanup moves eligible unused images to Trash, while incomplete upload rollback remains a temporary-upload cleanup operation. Enquiries have status updates only, and Settings edits a fixed record; neither exposes a deletion action. Images retain their existing manual permanent-deletion policy, while content and accounts expire after 30 days.

Validation completed locally:

- All 137 unit/backend tests passed; TypeScript, focused ESLint, production builds and `git diff --check` passed.
- The first affected Chromium run passed 41 of 42 checks across Dashboard, users, roles, routing, media usage, save behavior and unified Trash. The sole failure was an old assertion matching the restored item's name inside its success notice; the assertion now checks row absence.
- All 24 targeted Trash checks passed across Chromium, Firefox and WebKit, including mixed-type search and pagination, permission-scoped counts, account access revocation/restoration, expiry, username reservation, parent-page protection, failed provider deletion retries, uncertain successful-response reconciliation without a repeated write, dialog cancellation and focus recovery.
- Two final Chromium checks passed after ensuring account and image removal refresh navigation totals immediately.
- English desktop and Thai mobile list/filter layouts were visually reviewed. The mobile filter keeps its actions visible while the options scroll; keyboard focus, cancellation, and translated control labels were exercised.

Result JSON and screenshots are retained under `.local/e2e/unified-trash-20261030/`. These checks used isolated synthetic data with real external provider credentials disabled. No live account or content was trashed or permanently deleted by this verification. No deployment was performed.

## 2026-10-30 — Read-only CMS activity logs

Added `/cms/logs` with username/item search, activity-category filters, 30-entry cursor pages, result counts, timestamps, outcomes, and expiry dates. Every authenticated CMS role can read safe log entries; no role, including Dev, has a create/edit/delete/Trash/restore API or control for logs. The application log-collection handle exposes append/read operations and blocks aggregation write stages.

Entries cover sign-ins/sign-outs, own-password changes, account creation/edit/reset/Trash/restore/permanent deletion, content lifecycle changes, committed images (including content-form uploads), image Trash/restore/deletion/cleanup, enquiry status and notification requests, website settings, and data exports. Denied password sign-ins use an unidentified actor. Passwords/hashes, session or upload credentials, private enquiry text, request bodies, and provider error details are excluded. Notification events describe requests rather than confirmed delivery.

Each entry receives a server-generated expiry one UTC calendar year after its timestamp; leap days clamp to February 28. Expired records disappear from both API results and totals immediately. MongoDB TTL removes the stored records asynchronously. The versioned index cache applies the new TTL to existing development processes after hot reload. Content recovery archives explicitly exclude `moe_logs`, preserving append-only history and preventing expired records from being reintroduced through restoration; the website backup policy continues to recognize every application collection.

Validation completed locally:

- All 148 unit/backend tests passed, including leap-year expiry, strict event schemas, safe projections, cursor/query validation, append-only handles, and concurrent/hot-reload index initialization. The recovery tests passed again after the explicit log-exclusion policy change.
- TypeScript, focused ESLint, production builds and `git diff --check` passed.
- The initial affected Chromium suite passed 43/43 checks across logs, users, roles, routing and unified Trash.
- Final log coverage passed 24/24 checks across Chromium, Firefox and WebKit. Tests cover immutable/all-role APIs, expired entries/TTL configuration, secret-field exclusion, timestamp ties, literal English/Thai search, pagination, save retries, content-form image commits, concurrent logout idempotency, legacy email-style usernames, safe export events, all activity categories, notification requests, and read-only mobile layouts.
- An isolated collection validator deliberately rejected a log insert. The associated content save and its retry marker both rolled back; retry succeeded once after the validator was removed. This proves successful content changes cannot silently bypass required auditing.
- English desktop and Thai mobile viewport screenshots were visually reviewed. No horizontal overflow was found.

Results and screenshots are retained under `.local/e2e/activity-logs-20261030/`. All browser checks used isolated synthetic data with real external provider credentials disabled. No live records were edited or deleted by verification. No deployment was performed. Direct privileged database administration remains outside CMS role permissions.

## 2026-10-30 — User profile photos

Added profile photos to `/cms/users` through each row's Photo action and User settings. The photo dialog supports prepared device images, a searchable library with 12 images per panel, preview, removal, cancellation and Save. Uploads begin only on Save. Photos appear in account rows, personal settings and the header, including mobile, with an initial fallback.

Every role can change its own photo. Other-account changes retain current-password confirmation and the Dev/Admin target-role policy. Photo updates have a separate revision and idempotent operation, preserving passwords and all current sessions. The account change, staged image commit and immutable audit entry share one transaction. Failed saves keep prepared/staged input; uncertain successful responses reconcile without another upload. Conflicting edits preserve the selected photo for explicit review and retry. Late responses after session expiry cannot restore stale workspace user state.

Media reference checks now protect account photos, including retained accounts in Trash, across cleanup, submission cancellation, image Trash and permanent deletion. Used links open the matching account or Trash item, and account Trash thumbnails show the photo. Backups validate and remap account-photo references, and recovery cleanup protects photos still used by accounts. Legacy accounts and archives without photos remain supported.

Validation completed locally:

- All 163 unit/backend tests passed, including profile permissions, session preservation, staging ownership, revisions/replay, audit rollback, media references and backup remapping. TypeScript, focused ESLint, production builds and diff checks passed.
- The initial affected Chromium suite passed 40/41 across users, roles, Trash, media usage, logs and profile photos. It exposed the existing mobile rule hiding the header avatar; the account button now remains available on small screens.
- The first corrected profile suite passed 24/24 checks across Chromium, Firefox and WebKit. Final review then added conflict-recovery and expired-session/late-response regressions. The final expanded suite passed 30/30 across all three browsers.
- Browser tests cover cancel without upload, upload/database failure retries, reusing staged files, lost successful responses, all role combinations, active/Trash references, cleanup races, idempotency, library pagination, profile removal/fallback, and English/Thai responsive dialogs. Desktop and mobile screenshots were visually reviewed.

Evidence is retained under `.local/e2e/user-profile-20261030/`. Tests used isolated synthetic accounts and media with real provider credentials disabled. No live account photos or provider images were changed by verification. No deployment was performed.


## 2026-10-30 — Provider data usage

Added `/cms/usage` for Dev/Admin with English/Thai provider cards, used and
remaining figures, overage bars, precise scope/period labels, provider reporting
times, console links, and monitoring-limit dialogs. Unknown figures stay
unknown and explicit zero stays zero. MongoDB cluster storage is separate from
this database's size; Cloudinary's reported shared credits remain the primary
allowance. Plan wording is neutral.

MongoDB and Cloudinary use existing server credentials for bounded read-only
checks. Vercel has no monitoring credentials configured in this workspace, so
its working path is a dashboard-reading dialog with recorded time and reporting
label. Optional server configuration supports its documented Billing Charges
API where accessible. Saved manual readings can be cleared to resume connected
reporting. Monitoring-limit edits preserve the reading's time; explicitly
checking unchanged readings updates it.

Snapshots cache for ten minutes. Account-wide sixty-second leases prevent
concurrent checks and reporting-window changes from bypassing the cooldown.
The UI blocks repeated refreshes and the API enforces a shared POST/valid-PUT
budget of 20 requests per user per minute. Credential/reporting scopes bind cache
entries. Settings require the current active Dev/Admin role, revision checks and
an atomic immutable audit event. Failed or uncertain saves retain input and
reconcile with saved state before another attempt.

Validation completed locally:

- All 202 backend/unit tests passed. Full ESLint, TypeScript, production builds
  and whitespace checks passed.
- The combined browser matrix ran 96 checks: 94 passed and two WebKit focus-return
  assertions failed. The affected media-upload and usage-dialog buttons now
  explicitly focus their opener before showing the dialog. The final focused
  rerun passed 9/9 checks across Chromium, Firefox and WebKit. Across the matrix
  and corrected rerun, all 33 usage, 24 activity-log and 39 routing checks are
  covered. The final build and TypeScript checks passed.
- Browser coverage includes current-role/origin access, null versus zero, invalid
  settings, stale revisions, audit-write rollback, safe metadata, cache binding,
  cross-user cooldowns, the twenty-first refresh rejection, shared settings
  request limits, manual-reading removal, timestamp preservation, cancel/retry,
  explicit conflict review, lost-success reconciliation, in-flight refresh guards
  and absence of background polling.
- Desktop English and narrow Thai page/dialog screenshots were visually reviewed
  in all three browser engines. Layouts have no horizontal overflow or clipping;
  raw user-entered reporting labels remain unchanged.
- One read-only live Cloudinary usage request and MongoDB metadata probe
  confirmed adapter access. Browser tests used synthetic readings and isolated
  accounts with real provider credentials disabled. No live content, media,
  user accounts or provider plans were changed by verification.

Evidence is retained under `.local/e2e/provider-usage-20261030/`, including the
initial matrix and the final focused verification. No deployment was performed.


## 2026-10-30–31 — Full workflow, role and mobile audit

Ran the complete existing browser matrix with isolated synthetic data, reviewed
server authorization and UI state paths, and expanded the regressions for
mobile touch controls and all three CMS roles. Existing uncommitted project
work was preserved.

### Corrections

- User-management responses now belong to a mounted session lifetime. Late
  account edits cannot restore an expired workspace, restart a roster read, or
  apply stale callbacks after navigation. Roster reads retain bounded timeouts.
- User settings can close through its close button, Cancel, or Escape while
  unrelated roster data loads. Password submission keeps its own busy and
  duplicate-submission guard. Body scrolling and focus restore correctly with
  nested profile dialogs and session expiry.
- Operator cleanup only permanently removes its own unfinished uploads.
  Dev/Admin can clean foreign unfinished uploads after a fresh role check
  under the account lock. References, active submission leases, and recoverable
  shared saved-image Trash remain protected.
- Content, page-area, recent-item, media-usage, enquiry and confirmation
  openers explicitly focus their trigger, preserving WebKit/touch focus return.
- The CMS menu button now keeps the shared 44-pixel minimum width on mobile,
  including 320-pixel screens. The logo, language control and account avatar
  remain on the same row.
- Updated stale header/translated-label assertions and removed an unnecessary
  interception reconfiguration while Firefox thumbnails load. Mobile geometry
  checks now wait for completed drawer movement and allow subpixel rounding
  while retaining strict bounds, center-hit and touch-size assertions.
  Firefox touch-emulation viewport resize commands stalled in this environment.
  Viewports are now configured before page creation; Firefox portrait and
  landscape run in independent contexts, while Chromium/WebKit retain live
  rotation. Native touch, navigation, geometry and focus checks remain covered.
- Increased the bounded browser-matrix timeout to 35 minutes and the CI job
  allowance to 45 minutes so the expanded suite can complete with setup/builds.

### Role coverage

| Workflow | Dev | Admin | Operator |
| --- | --- | --- | --- |
| Manage Dev accounts | Allowed | Blocked | Blocked |
| Manage Admin/Operator accounts | Allowed | Allowed | Blocked |
| Delete own account | Blocked | Blocked | Blocked |
| Change own password/profile photo | Allowed | Allowed | Allowed |
| Edit fixed Page/Section text and images | Allowed | Allowed | Allowed |
| Create, reorder, reparent or delete fixed Page/Section elements | Blocked | Blocked | Blocked |
| Add/edit collections and recover content/images | Allowed | Allowed | Allowed |
| Edit Settings and enquiries | Allowed | Allowed | Allowed |
| Permanently delete retained Trash items | Allowed | Allowed | Blocked |
| Clean own unfinished uploads | Allowed | Allowed | Allowed |
| Clean others' unfinished uploads | Allowed | Allowed | Blocked |
| Read retained activity logs | Allowed | Allowed | Allowed |
| Edit/delete activity logs | Blocked | Blocked | Blocked |
| Read/configure Data usage | Allowed | Allowed | Blocked |

Account actions retain current-password, target-role, last-privileged-account
and session-version checks. Permanent deletion retains core-page and image
reference protections. The positive Operator regression saves and recovers
all five collection types, edits existing fixed content, updates website
settings and enquiries, and restores a shared saved image.

### Executed checks

- All 202 unit/backend tests, full ESLint and TypeScript passed. Production
  builds passed through the isolated browser harness.
- Full baseline: 480 cases across Chromium, Firefox and WebKit; 472 passed.
  Six failures were stale expectations, one was a Firefox test-interception
  race, and one exposed the settings-dismissal/loading issue corrected above.
- Expanded mobile rerun: 28/28 Chromium cases passed, covering English/Thai
  public templates and CMS views for every role at 320/390 pixels, 430-pixel
  spot checks, and 360×640 plus 844×390 native-touch dialog/slider journeys.
- Combined final evidence: 552 unique active browser scenarios have passing
  results (Chromium 196, Firefox 178, WebKit 178), with 36 intentional
  duplicated-sweep skips and zero unresolved cases. This combines the complete
  baseline and corrected affected reruns; it is not one fresh 552-case run.
  The final affected coverage includes Chromium 80/80 plus 2/2 landscape,
  Firefox 52 functional plus 8/8 dialog/login and 4/4 public viewport cases,
  and WebKit 64/64 active cases with 18 duplicate-sweep skips.
- Visually reviewed representative baseline mobile layouts across engines and all 14 new
  role/account screenshots, including 320-pixel headers and long Thai forms.
  New public/library/landscape-dialog coverage also checks geometry, scroll
  reachability and native touch; those passing cases do not all save PNGs.

The login slider's target is visible to browser scripts, so it remains
automatable. Single-use challenges and username/global attempt limits are
enforced; these checks do not establish strong bot verification. This limitation
is also described in the backend documentation.

Browser tests use owned local MongoDB fixtures and simulated external image,
map and upload responses. They do not establish live Cloudinary deletion,
email delivery, Vercel access or physical-device behavior. No live content,
provider assets, accounts, plans or credentials were changed. All test-owned
processes and database directories were cleaned up. No deployment was performed.

Reports, screenshots and failure/correction evidence are retained under
`.local/e2e/full-audit-20261030/`.


## 2026-10-31 — User edit and password-reset dialogs

On `/cms/users`, Edit now opens a bounded, scrollable dialog for the selected
account. Reset password is inside that dialog and opens its own native dialog.
The Edit draft remains mounted across reset cancellation and success; resetting
changes only the password, while username/role still require Save changes.
Personal password changes remain in User settings. Add user and account Trash
confirmation retain their existing layout and behavior.

Both dialogs retain role/target protections, actor-password confirmation,
strong replacement-password validation, duplicate-submit guards, and expired-
session callback protection. Reset fields clear when closed. Focus returns to
the appropriate enabled opener after cancellation or a completed save; nested
expiry restores background scrolling. English/Thai copy and centered row
actions are preserved. Native invalid-field focus is centered inside the dialog
to avoid its sticky heading in short WebKit landscape viewports.

Validation: 102 unique affected browser cases have passing evidence across
Chromium, Firefox and WebKit (34 per engine), combining the initial affected
runs and focused corrected rerun. The final expanded dialog suite passed 18/18
with the focused-field visibility assertion unchanged. Checks cover canceled
writes, preserved drafts, role restrictions, wrong current passwords, failed
reset recovery, single successful reset writes, revoked target sessions, nested
expiry, focus/scroll restoration, English desktop and Thai 360×640/844×390
native-touch layouts. The initial WebKit landscape occlusion was corrected
before the final pass. ESLint, TypeScript, production builds and whitespace
checks passed. Desktop/mobile screenshots were visually reviewed.

Evidence: `.local/e2e/user-edit-dialogs-20261031/`. Browser checks used isolated
synthetic accounts with real provider credentials disabled. All owned test
resources were cleaned up. No live accounts/data or deployment were changed.

## 2026-10-31 — Enquiry email connection preparation

Settings now includes an English/Thai **Email notifications** checklist, with
an inbox shortcut and configuration-aware Send/Retry controls. The read-only
authenticated status API returns only missing/invalid/added checks, never
keys or addresses. Missing or unavailable setup blocks sending. Setup refresh
has synchronous in-flight protection, cancellation, a timeout and cooldown;
it never sends mail or polls the provider. Failed checks retain clearly
labelled previous results without enabling notification actions.

New notification attempts use escaped English/Thai HTML and plain text,
readable Bangkok-time dates, mobile viewport metadata and a configured public
HTTPS inbox link when available. Existing frozen payloads remain unchanged.
The adapter bounds the entire provider operation to 12 seconds and responses
to 16 KiB, rejects redirects, honors bounded Retry-After cooldowns, and requires
review for payload conflicts or unsafe/exhausted/expired retry state. Reads
project review state without writing or sending. Provider acceptance remains
distinct from actual inbox delivery.

Browser testing exposed a same-turn double-click race in Send notification.
A synchronous request guard now prevents the second POST, and cancellation,
controller identity and session-lifetime checks prevent late results from
updating the workspace. The regression passes in all three engines. Existing
inbox/loading tests were narrowed to the enquiry counter after the new setup
notice introduced an additional accessible status region.

Validation: **223/223 offline backend tests**, including **25 email tests**;
**41 unique affected browser scenarios** with passing evidence: 18 new email
checks across Chromium, Firefox and WebKit, 22 Chromium inbox/public-workflow/
log checks, and one related loading check. ESLint, TypeScript and the isolated
production build passed. Desktop/mobile Settings and enquiry-dialog screenshots
were reviewed in English/Thai. Synthetic email previews at 320, 360 and 640
pixels confirm readable text and no horizontal overflow; mail-client-specific
rendering still needs the later live acceptance check.

`npm run email:check` safely reported a missing API key and sender, with the
private recipient already added. Its exit code 1 is expected until those
settings are supplied. No secret values were printed or edited. Browser/build
checks used the owned temporary loopback MongoDB with provider credentials
disabled. No live data, provider assets, accounts, external emails or deployment
were changed. Owned test processes, replicas and run directories were cleaned.

Evidence: `.local/e2e/enquiry-email-20261031/verification-summary.json` and its
initial/corrected browser reports; `.local/email-preview-20261031/` contains
synthetic HTML/plain text, screenshots and viewport measurements. Connection
instructions and the remaining live acceptance steps are in [EMAIL.md](EMAIL.md).

## 2026-10-31 — Multiple enquiry-notification recipients

`/cms/enquiries` now has a **Notification recipients** button for Dev and
Admin. Its native dialog supports adding, editing and removing plain email
addresses with one Save action, Cancel, focus restoration and scroll locking.
It supports up to 50 distinct addresses; an explicitly empty saved list
pauses mail without falling back to the earlier environment recipient.
English/Thai copy explains that the same message goes to all saved recipients
and that earlier notification retries retain their original recipient list.

The private list lives in a separate `moe_settings` document, preserving
encrypted-backup coverage while ordinary website settings and content exports
exclude it. Authenticated Dev/Admin GET and origin-checked PUT APIs enforce
validation, fresh stored role/session version, transactional audit records,
revision conflicts and idempotent lost-response retries. Operator cannot
read or edit recipient addresses and retains normal inbox/notification access.
Readiness checks use the saved list; saving invalidates an older in-flight
setup check. Public contact submission schedules its background delivery when
the key/sender settings are present, allowing a CMS list to replace the old
single environment recipient. Existing frozen single-recipient envelopes
remain compatible and unchanged during retries.

Validation: **229/229 offline backend tests** passed, including 31 notification/
recipient cases. **58 unique browser scenarios** have passing evidence: 18 new
recipient cases and 18 existing email cases across Chromium/Firefox/WebKit,
plus 22 Chromium inbox/public-contact/activity-log regressions. The strengthened
recipient rerun passed 18/18 after screenshot review caught focused-field
occlusion by the footer on short mobile landscape screens; new fields now
scroll into full view. Tests also cover cancel without writes, saved edits and
removal, role changes after login, duplicates/limits/origin rejection, concurrent
revision conflicts, single audit entries on retries, empty-list pause, private
exports, failed-save draft retention, double clicks and ignored-cancellation
responses after session expiry. English desktop and Thai 360×640/844×390
screenshots were reviewed. ESLint, TypeScript, whitespace checks and the
isolated production builds passed.

Evidence is retained under `.local/e2e/enquiry-recipients-20261031/`, including
the first run's corrected test locator, the email matrix, final recipient
screenshots and regression reports. Tests used temporary loopback MongoDB and
disabled provider credentials. No live recipient list, environment secrets,
external emails or deployment were changed. All owned test resources were
cleaned up. Live delivery still awaits the API key and verified sender.

## 2026-10-31 — Enquiry email structure and appearance review

New notification attempts now use a fixed MOE Navigation display name and a
neutral localized SMTP subject with a short server reference. Visitor subject
text stays in the escaped HTML/plain-text body. The email uses a fluid 600px
table layout, inline fonts/styles, an Outlook-width fallback, semantic headings,
full-width sender and message content, and reference/date metadata at the end.
The validated inbox destination is visible below its button. No external images,
fonts, attachments, scripts, hidden preview blocks or tracking resources are
added by the app. HTML-only break opportunities preserve long ASCII tokens
when CSS is removed without changing plain text, Thai graphemes or href values.
The generated sender is validated alongside legacy plain senders; already-frozen
plain-text and HTML retry envelopes are preserved byte-for-byte.

Validation: **235/235 offline tests** passed, including **34 focused email and
delivery tests** (recipient-schema tests also remain in the full suite). The
largest maximum-valid-field HTML fixture is 42,248 UTF-8 bytes against a 65,536
byte regression budget. **13 Chromium email/public-workflow browser checks**
and the isolated production build passed. Twenty synthetic English/Thai previews
cover normal and long inputs at 320/360/640px plus fully CSS-stripped fallbacks
at 320/640px; all have no horizontal overflow. Normal message content starts
about 104px earlier on 320px screens. Desktop/mobile screenshots and accessibility
outlines were reviewed. Text contrast is at least 5.34:1 for the tested palette.
ESLint, TypeScript and whitespace checks passed.

Preview evidence: `.local/email-review-20261031/baseline/` and `final/`. Browser
reports and the build lifecycle are retained in `browser-checks/` alongside the
verification summary. The tests used synthetic data, an owned loopback MongoDB
and disabled provider credentials; owned test processes/directories were cleaned.
No external email, provider configuration, live data, environment secrets or
deployment changed. Static previews do not certify Outlook/Gmail rendering,
authentication or inbox delivery. SPF/DKIM/DMARC verification, provider tracking
settings and a received-message header/inbox check remain the live acceptance
steps described in [EMAIL.md](EMAIL.md).
