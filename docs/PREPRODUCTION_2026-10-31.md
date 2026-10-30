# Preproduction verification — 31 October 2026

The local automated matrix has passing evidence for **630 unique browser
scenarios** and **249 offline tests**, with no unresolved active test failures.
A mobile receipt-positioning correction passed all **66 affected regressions**
on a fresh production build. The approved live email reached the owner's Inbox.
Production acceptance remains separate: the login slider's bot-verification
limitation, owner content decisions and current recovery arrangements still
need review before sign-off.

## Executed checks

| Check | Result and scope |
| --- | --- |
| Offline tests | 249/249 passed, including roles, sessions, contact validation, notifications, media ownership, recovery formats and release checks. |
| Browser coverage | 630/630 active unique scenarios passed across 39 specifications: Chromium 222, Firefox 204, WebKit 204. Another 36 cases deliberately skip duplicate broad geometry sweeps in Firefox/WebKit. |
| Build and code checks | Isolated production builds, ESLint and TypeScript passed. The harness builds with its own seeded MongoDB replica before testing. |
| Dependency advisory check | `npm audit --omit=dev --json` reported zero vulnerabilities for 37 production dependencies at the time checked. This is not an exhaustive security audit. |
| Deployed public pages | All 64 sitemap URLs returned 200 with the correct language, one primary heading and matching canonical origin/path. All remained noindex. |
| Deployed access boundaries | Ten protected CMS GET APIs rejected unauthenticated requests with 401; four invalid public routes returned 404. |
| Deployed images and static assets | 35 exact, already-emitted Cloudinary image URLs returned 200 with image content types. Site icons responded correctly and a missing static asset returned 404. No new image transformations were requested. |
| Domain and HTTPS | Apex HTTPS, DNS records and security response headers were checked. A later live HEAD request confirmed the WWW host returns 308 to the apex while retaining the Thai path and query. |
| Live data checks | Read-only MongoDB/Cloudinary connectivity succeeded. Nine core pages and 59 registered public image references were found, with no unfinished uploads or retained failed image deletions. |
| Approved live enquiry/email | One labelled enquiry returned 201 and was saved once. Its one notification attempt was accepted by Resend; a read-only lookup then reported `delivered`. HTML/plain text, branded sender and the test label were present. The owner confirmed Inbox receipt. Received authentication headers were not inspected. |
| Resend sender domain | Read-only provider checks report `moe-navigation.com` verified, including DKIM and both sending CNAME records. Open and click tracking are disabled. |
| Usage monitoring | Cloudinary returned usage data. MongoDB returned storage metadata; transfer usage remains unknown. No Vercel API connection or saved dashboard reading is configured. |

The browser coverage includes Dev/Admin/Operator permissions and allowed
workflows; fixed-page editing and collection creation; user editing, password
reset and session revocation; profile images; image libraries and pagination;
unified Trash and restoration; read-only activity logs; enquiry search,
submission and duplicate-safe retries; private notification recipients; exports;
failed-save recovery; refresh cooldowns and stale-response handling. It does
not mean every possible input or every button was repeated under every role.

Mobile checks include English/Thai layouts at 320–430px and short landscape
viewports, touch controls, focus return, scrolling and overflow. Supplemental
checks cover 150% root text, a reduced CSS viewport equivalent to 200% reflow,
and 4800px layouts with declared device-pixel ratio 2 and 40px root text.
These are browser simulations; physical devices, native browser zoom and OS
display scaling were not certified. Settings JSON export and unsaved-text
downloads were downloaded and inspected in all three engines.

## Corrections made during the audit

- Added an exact-host permanent WWW-to-apex redirect. Unit checks and real
  local HTTP requests verify paths, repeated query values, encoded Thai text
  and exclusions for local, preview and unrelated hosts. The final read-only
  live recheck also returned the expected 308. No deployment was performed
  by the testing agent.
- Corrected release reporting to use saved CMS notification recipients,
  preserve an explicitly empty recipient list, distinguish healthy Media Trash
  from unfinished uploads, and report independent provider checks separately.
  Missing optional public contact details now require owner review instead of
  being treated as required schema fields. A configured approval flag is
  reported as a flag, not proof of factual approval. A successful command does
  not certify launch acceptance.
- Corrected a recipient-dialog test to wait for React's scroll-lock cleanup
  while retaining the same unlocked-state assertion and checking focus return.
  Corrected the Thai contact test to query its actual accessible textbox name.
  The motion regression now imports the shared isolation fixtures. Original
  failing reports are retained alongside passing reruns.
- Added enlarged-text, display, download and actual HTTP redirect regressions.
  Final screenshot review also identified a floating contact button covering
  part of a narrow-screen success reference. The success card now takes focus
  without native edge scrolling, then centers immediately with fixed-control
  and safe-area scroll margins. All 66 affected public-contact, inbox, display
  and redirect regressions passed in all three engines; final Chromium/WebKit
  screenshots show the complete reference unobstructed. This last UI correction
  is local and was not deployed by the testing agents.

## Remaining production acceptance

1. **Received authentication headers and wider email acceptance:** the configured sender uses
   `moe-navigation.com`; one legacy fallback recipient is effective until a CMS
   list is saved. Public DKIM, sending CNAME and DMARC records are present.
   Following explicit owner approval, one labelled production enquiry was saved
   once and Resend reported its notification delivered after one attempt. The
   owner subsequently confirmed **Arrived in Inbox**. Resend also reports the
   sender domain and sending DNS records verified, with tracking disabled.
   Received-message SPF/DKIM/DMARC results and Reply-To behavior were not inspected;
   one mailbox result does not certify every mail system. See [EMAIL.md](EMAIL.md).
   Provider delivery means the receiving server accepted the email, rather than
   proving a particular folder, as described by
   [Resend's delivery guide](https://resend.com/guides/email/users-never-got-login-code).
   The labelled test remains in CMS for review.
2. **Login bot protection:** the existing slide is single-use and rate-limited,
   but its API returns the target position to the client. A script can solve
   it directly; it does not establish that the visitor is human. Strong bot
   verification remains unresolved. Functional login tests passing must not
   be described as proof of bot resistance.
3. **Owner content decisions:** eight vessels have no populated specifications
   and eight records contain provisional wording. Review verified facts and
   retain truthful illustrative labels where appropriate. The public company
   email is blank; choosing the enquiry form and verified phone instead is
   permitted. Public contact details and private mail recipients are separate.
4. **Recovery operations:** confirm a current encrypted archive, a separately
   secured recovery key and provider retention policies. Recovery format and
   boundary tests passed, but no new live backup/restore rehearsal was performed
   in this audit. See [RECOVERY.md](RECOVERY.md).
5. **Indexing and deployment acceptance:** the deployed site currently remains
   noindex and robots disallows crawling. Enable indexing only after the owner
   approves launch. Local `NEXT_PUBLIC_SITE_URL` remains localhost for correct
   local origin checks; this is not evidence of a deployed origin problem.
   The complete browser matrix tests the local production build, while the
   deployed checks were read-only smoke checks. Exact deployed revision,
   physical-device use and authenticated deployed workflows were not attested.
6. **Usage setup:** connect Vercel usage or record its dashboard values when
   ready. Atlas network figures still require the provider dashboard. Unknown
   usage is not treated as zero.

## Evidence and boundaries

The per-case passing-run map is
`.local/e2e/preproduction-20261031/verification-summary.json`. It deduplicates
browser, file and complete test title; it does not add repeated passes to the
total. The original full run passed 605 cases, skipped 36 and had one
test-settling failure. The first supplemental run passed 42 and had three
Thai-selector failures. Corrected focused reruns establish passing coverage;
the earlier failures remain visible in their original reports.
The final affected run is preserved in `display-final/` and passed 66/66.
`final-integrity.json` confirms tested source/configuration hashes stayed
unchanged and `next-env.d.ts` was restored byte-for-byte to its pre-run state.

Build manifests are retained: the full build preceded the redirect correction,
and subsequent fresh builds include it. All isolated runs strip provider
credentials, use synthetic data in owned loopback services and record cleanup
of their owned processes/database directories. The original motion case lacked
the shared network fixture; its corrected version passed in all three engines.
No live provider credentials were used by the browser runs.

Read-only live evidence is under
`.local/release/preproduction-20261031/`: `readiness-live.json`,
`public-check.json`, `domain-check.json`, `redirects-assets.json`,
`canonical-live-recheck.json`, `sender-domain-check.json`, `usage-check.json`
and `dependency-audit.json`. `live-email-test.json` records the separately
approved single live submission and safe provider status without addresses or
credentials. `resend-domain-check.json` records provider verification/tracking;
`mailbox-confirmation.json` records the owner's Inbox confirmation separately
from the automated provider snapshot. The initial public canonical analysis is retained
separately; the corrected analysis treats the apex URL and its trailing-slash
form as the same root. The live readiness snapshot predates the optional-contact
policy correction and therefore labels its missing email as blocked; current
code treats that optional field as review. The original snapshot was not
rewritten. Public response timings are diagnostics, not Core Web Vitals.

Live checks were read-only except the one explicitly approved labelled enquiry
and its normal background notification. No other live content, accounts,
recipient list, provider assets, DNS or environment secrets were edited by the
testing agents. No deployment or commit was performed by them. These checks
cover the observed workspace and time of each report; owner changes or later
deployments require their own verification.
