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
