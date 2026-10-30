# Backend and CMS

The website uses MongoDB for content, administrator accounts, sessions, and
enquiries. Cloudinary stores uploaded media. Public pages read published
content on the server, so their HTML, metadata, sitemap, and detail-page
availability follow the saved CMS content.

The project uses the `mongodb` and `cloudinary` server SDKs. `next-cloudinary`
is not required by this implementation.

## Local configuration

Keep these values in the repository-root `.env.local`:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | The website origin, including its development port; use the verified HTTPS origin when deploying |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB_NAME` | The database used by this website |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary product environment name |
| `CLOUDINARY_API_KEY` | Cloudinary API key used by the server |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret used by the server |
| `CLOUDINARY_FOLDER` | Optional managed media folder; defaults to `moe-navigation` |
| `RESEND_API_KEY` | Optional server key for enquiry notifications |
| `ENQUIRY_EMAIL_FROM` | Optional plain address on the verified sending domain |
| `ENQUIRY_EMAIL_TO` | Optional private notification recipient, separate from the public company email |
| `SITE_CONTENT_APPROVED` | Set `true` only after the owner approves actual public content |
| `SITE_INDEXING_ENABLED` | Explicit indexing switch; production HTTPS and content approval are also required |

MongoDB must support transactions, as MongoDB Atlas and replica sets do.
The database user needs read, write, and index-creation permissions on the
selected database. Allow the local or deployment host to connect through
the database network settings.

Secrets are read by server code. Do not rename secret variables with a
`NEXT_PUBLIC_` prefix. `.env.local` and `.local/` are ignored by Git. Configure
the same environment variables in the deployment host rather than uploading
local credentials files.

## First administrator

Run `npm run backend:check` to verify the supplied connections, then
`npm run backend:setup`. These commands run `scripts/check-backend.mts` and
`scripts/setup-backend.mts`, respectively. The bootstrap
command creates the initial administrator and writes its generated login
details to `.local/cms-access.json`. It does not replace an existing account.
Treat that local file as a password and keep it private.

Start the site with `npm run dev`, then open `/cms`. Sign in with the generated
credentials. Open **Administrators → User settings** at `/cms/users` after the first
sign-in; a new password needs at least 14 characters. Changing it invalidates
the previous sessions and creates a fresh session for this browser. A normal session lasts eight hours.

The bootstrap process creates administrator access and indexes without inserting
website content. The website reads its existing MongoDB content. For an empty
database, follow the reviewed migration below before starting the public site.
Company facts, contact details,
vessel specifications, route availability, and sample articles still require
business review before public launch.

## Content workflow

Use **Pages** to choose an existing website page, then edit its introduction
or one of its text and image areas. Shared content and footer copy are grouped
separately. Collection shortcuts open Fleet, Routes, Projects, Services, or News;
these views retain searchable lists and collection-item creation.

Page and Section editing exposes the copy and images used by the relevant
template. The authenticated CMS API rejects new Page/Section records,
structural changes such as reparenting or reordering, and deletion of these
records. This applies to requests sent outside the visible editor as well.
Trusted setup and reviewed migration remain maintenance operations.

The editor shows unsaved changes, uses accessible discard confirmation, and
links to the saved website page in either language. Company contact details
remain under **Settings → Website details**, with a shortcut from Contact.

Authenticated content reads support three focused views. `GET /api/cms/content?scope=overview`
returns retained Page and Section records plus active counts, recent items,
category suggestions, the next hidden display order for each active type, and
the combined Trash count of retained deleted content, saved images in Trash
(including failed permanent deletions), and retained user accounts visible
to the current role. Operator counts exclude accounts.
`?scope=trash` returns retained
deleted records. Collection lists use `?type=Vessel|Route|Project|Service|News`
with optional literal `q` and cursor filters; each response includes
up to 12 records, a matching total, and a next cursor. Search and counts cover
the full saved collection, not only downloaded rows. The API retains the
legacy `status` filter for maintenance compatibility; the CMS does not use it.
The no-query GET still
returns all retained records for existing maintenance workflows.

Fleet records support optional typed specifications: IMO number, completed
build year, dimensions, deadweight, TEU, bilingual flag state, and bilingual
availability statement. Blank values are not replaced with defaults. The
IMO check digit and numeric boundaries are validated; these checks do not
establish the truth of the business information. See [CMS_GUIDE.md](CMS_GUIDE.md).

1. Choose an existing page area to edit, or add/edit an item in a collection list, and prepare its text in both languages.
2. Choose an existing library image or prepare a JPEG, PNG, or WebP locally.
3. Check the information, then select Save.
4. Review the corresponding public page in both languages.

Saving makes content available immediately across browsers and devices;
there is no separate publication step. The CMS server normalizes every
explicit Save to the internal `Published` value before its retry fingerprint
is calculated, even when a request carries legacy `Draft` metadata. The UI
has no publication controls, badges, filters, or metrics. Historical Draft
records remain unchanged until explicitly saved; trusted maintenance saves
preserve their original status for data migration and recovery.
Detail pages for missing, historical unpublished, or trashed records return
HTTP 404. The sitemap includes available detail pages.

Home, About, Services, Fleet, Routes, Projects, News, Contact, and Privacy
are core pages and remain published. All existing Page and Section records
have fixed placement: their copy and images can be edited, but the CMS cannot
create or delete them or change their structure. Historical Trash restoration
remains available within retention. Collection items can be moved to
Trash and restored for 30 days. After that retention period, MongoDB removes
the record automatically; its background expiry process may run shortly
after the exact deadline. Expired records cannot be restored.

Every change includes the version that was loaded by the editor. If another
tab or administrator has changed the record, the save is rejected with a
conflict instead of overwriting their work. Keep the editor open, copy any
needed text, and load the latest version before applying the change again.

## Images and failed saves

Selecting an image prepares it in the browser and does not upload it.
Preparation keeps the proportions, tries WebP, and retains another supported
format when it is the better result. Upload begins only when saving.

An uploaded image is first staged for that administrator and submission.
Saving content commits all selected main, mobile, and gallery images with
the record in one MongoDB transaction. Sections use the same image rules.
The media library can also save a prepared image for later use.

On failure, keep the editor open and use its retry action. The same submission
identifier is retained so retrying a response lost in transit does not create
another record or upload. Successful uploads are reused while retrying the
database save. A failed save does not show a success confirmation.

After three failed attempts, recovery checks the original submission on the
server. A committed result is recovered as success. A failed submission is
cancelled before only its own unreferenced staged images are removed. The
editor retains text and prepared images; later attempts use a new submission
identifier and re-upload deleted images. Use **Check saved content** or
**Check saved media** to retry recovery. A running upload remains pending;
an unreachable service does not count as a confirmed failed save.

The authenticated `/api/cms/media/submission` endpoint resolves or aborts a
submission. Uploads, saves, and cancellation share a MongoDB transaction lock.
Cancellation is stored durably, so a delayed request cannot save with an
aborted identifier after a server restart. An already committed save remains
authoritative. Late upload responses check cancellation and delete their own
asset, even if cleanup already removed an expired upload reservation. Failed
deletions retain their exact asset identity for a later cleanup retry.

Main images, mobile images, and gallery images follow the same workflow.
Uploads run one at a time and only start after the ordinary fields validate.

Use **Clean unused images** to move unused saved images older than one hour to Trash, remove abandoned uploads, and retry failed deletions. The media shortcut opens `/cms/trash?kind=Image`. The unified list uses `GET /api/cms/trash`; the older `GET /api/cms/media/trash` remains available for compatibility. Saved images have no automatic expiry and remain recoverable until Dev/Admin explicitly deletes them permanently; content and user accounts have a 30-day recovery period.
Cleanup checks main, mobile, and gallery references across all records,
including sections and Trash. Previously committed images remain in the
library until explicitly removed, including images saved through content.
Abandoned uploads have a one-hour grace period; failed deletions can be
retried immediately. Cleanup is manual. **Remove** is blocked while any
content, including Trash, references the image.
The authenticated `GET /api/cms/media/usage?mediaId=...` lookup checks a
single saved image on demand and returns the referencing content records and
their main, mobile, or gallery placements. It includes Trash, consistent with
the Remove protection. Website details have no image fields.

## Website details

Open **Settings → Website details** at `/cms/setting` to manage the English and Thai
company names and office addresses, public phone number, email address, and
HTTPS map link. Save verified information; leave optional contact fields
blank until confirmed. These details feed the public contact page.

Settings use the same version checks as content. **Refresh details** loads
the latest saved version and asks before discarding unsaved settings.

## Existing local content and exports

**Settings → Export data** downloads current content, media references, and
enquiries. It does not include image binaries or administrator accounts;
use the backup and recovery workflow for those.

Older browser-local content remains in its original storage. The client CMS
no longer exposes import, local-data review, or browser-storage cleanup
controls. The legacy helpers remain for trusted maintenance and recovery;
they do not bypass the CMS API's restrictions on new Page/Section records.
Review any required migration against the current server records before
using a maintenance workflow, and preserve recovery copies.

Existing migration receipts use `moe-migration-v1`; exact recovery archives
use `moe-migration-archive-v1`. Do not discard these or overwrite newer
browser edits during recovery. Browser storage belongs to its browser and
origin, including the port, so review each origin separately.

## Website migration and local cleanup

The completed migration contains 58 bilingual records, 15 Cloudinary images,
and the website settings document. It includes page sections, editorial
bodies, mobile imagery, galleries, service icons, port names and map paths.
UI labels and navigation remain in code. Company facts remain illustrative
where they were illustrative before migration.

`npm run backend:migrate` is a dry-run by default. It checks Cloudinary assets,
compares their bytes with the recorded SHA-256 hashes, and reports database
changes, uploads, and local image references. To apply a reviewed plan:

```text
npm run backend:migrate
npm run backend:migrate -- --apply --expected-plan=PASTE_REVIEWED_PLAN_HASH
npm run backend:migrate
```

Review `.local/website-migration-plan.json` and replace
`PASTE_REVIEWED_PLAN_HASH` with the exact `planHash` from that dry-run. If the
plan changes, review a fresh dry-run before applying it.

The final run should report zero changes, zero uploads, and zero local media
references. Existing fields win over the migration snapshot; version checks
reject edits made during migration. Uploads use deterministic public IDs and
do not overwrite existing provider assets. MongoDB content and committed
media metadata are saved together after the uploads are verified. Failed
attempts remove only their own newly uploaded, confirmed-unreferenced assets.

The migration recipe and image fingerprints are under `scripts/data/` and
are never imported into the application. The old runtime seed stores and
`public/images/` copies are removed after verification. A private recovery
snapshot of the previous database content and original images is retained
in `.local/migration-backup-2026-10-23/`. Keep it private. Source images are
needed only if migrating into a Cloudinary environment that does not already
contain these assets. The supplied `Design/` references are preserved.

The download action exports JSON containing content, media metadata,
enquiries, and website settings. This is a data export, not a complete
recoverable backup: it omits
administrator credentials, sessions, configuration secrets, and original
image files, and it does not provide an automatic restore workflow. Store
the export privately because it includes enquiry contact information. For a
portable recovery copy, use the separate encrypted backup CLI described in
[RECOVERY.md](RECOVERY.md). Provider backup policies still need account-owner
verification.

## Enquiries

Submitting the public contact form saves the enquiry in MongoDB after
validation and consent. The CMS inbox shows its name, email, company,
subject, message, language, and received time. Administrators can mark it
New, In progress, or Resolved.

The authenticated inbox list searches all stored messages using a literal,
case-insensitive query across name, email, company, subject, message and ID.
Search and status filters remain applied to each 50-item cursor page. The
response supplies the total matching count, global total and global New count;
counts do not depend on how many messages the browser has loaded. Timestamp
ties use the ID as a stable pagination tie-breaker. Query strings are limited
to 200 characters; unsupported or duplicate parameters and invalid cursors
return 400. Rapid filter changes discard obsolete responses, and failed reads
can be retried without losing the selected filters.

The optional Resend adapter attempts a team notification after the enquiry
has saved. Its result is independent of the public confirmation and inbox
status. Dev and Admin manage up to 50 recipient addresses through the
Notification recipients dialog on Enquiries. The owner will supply the API
key and verified sender later. External email delivery has not been tested.

Any signed-in CMS role can inspect notification state and request an eligible
retry. The first actual attempt freezes the email message, sender, and
recipient. Retries reuse that message and idempotency key, with at most three
attempts inside a 23-hour window. Concurrent sends share a database lease.
**Email accepted** means provider acceptance, not verified inbox delivery.
Missing configuration never removes a saved enquiry. See [EMAIL.md](EMAIL.md)
for setup, safe recovery, and the remaining live acceptance check.

`GET /api/cms/email/status` supplies the Settings checklist and inbox notice.
Its authenticated response contains only missing/invalid/added configuration
checks and a flag; credentials and addresses remain private. Reads never send
email or contact Resend. The notification adapter includes English/Thai HTML
and plain text for new attempts, preserves already-frozen messages, honors
provider cooldowns, and requires review for unsafe retry state or payload
conflicts. `npm run email:check` runs the same configuration checks locally
without database access or provider requests; check the recipient list in the
CMS separately.

`GET/PUT /api/cms/email/recipients` is limited to Dev and Admin. A private
`moe_settings` document stores the revision and list independently of website
details, so encrypted backups retain it and ordinary content exports omit it.
The earlier `ENQUIRY_EMAIL_TO` value is only a fallback before the first CMS
save. A saved empty list pauses notifications without reusing the fallback.
Saves recheck the stored role under the account-management lock, reject stale
revisions, reconcile exact lost-response retries, and append a safe activity
record transactionally. Newly attempted notifications use the whole saved
list in one Resend request; already-attempted retries retain their original
frozen list. Saving recipients does not itself send email.

Local drafts are only a convenience for the visitor's current browser.
Clearing a draft does not delete an enquiry already submitted to the inbox.
The final company privacy policy, support contact, and enquiry retention
policy must be reviewed before public launch.

## Data and access controls

The application uses these collections in the selected database:

| Collection | Stored data |
| --- | --- |
| `moe_content` | Bilingual records, publication state, versions, and Trash expiry |
| `moe_media` | Owned Cloudinary assets, staged submissions, and library state |
| `moe_users` | CMS usernames, roles, salted password hashes, session versions, and account Trash expiry |
| `moe_sessions` | Hashed session tokens and expiry |
| `moe_enquiries` | Contact submissions, consent time, inbox status, notification state, and private frozen delivery envelope |
| `moe_settings` | Separate documents for public company details and private enquiry-notification recipients |
| `moe_logs` | Append-only safe activity events and their one-year expiry |
| `moe_operations` | Recent save results used to make retries idempotent |
| `moe_state` | Durable submission cancellation locks, migration markers, and expiring request counters |

CMS APIs check the current database session. Mutation endpoints also check
the request origin. Session cookies are HttpOnly and SameSite Strict, and
use Secure in production or when the configured website uses HTTPS. Login,
password-change, and contact attempts have database-backed limits. Provider failures return
a generic error rather than exposing credentials or connection strings.

The CMS login also requires a short-lived slide challenge. `GET /api/cms/login/challenge`
issues a two-minute challenge; `POST /api/cms/login` consumes it once before
checking the password. Failed login attempts require a new slide. The slide is
keyboard accessible, but its position is visible to browser clients, so it is
friction against simple scripts rather than a guarantee against AI-assisted
bots. The database-backed username and global login limits remain the primary
protection against repeated password attempts.

No public account registration is provided. This CMS is for authorized
website users. Stored roles are `Dev`, `Admin`, and `Operator`. Legacy accounts
without a role retain Admin access; invalid stored roles receive Operator
permissions. Session reads resolve the current stored role, not a client claim.

Only Dev manages Dev accounts or grants the Dev role. Admin manages Admin and
Operator accounts; Operator only changes its own password. User creation,
username/role edits, password resets, removals, and password changes serialize
through the same transaction lock. Mutations recheck the actor's current
password version and the target's current role. Account edits revoke target
sessions; self-edits renew only the current session. Self-deletion, last-Dev
removal/demotion, and removal of the last active management account are blocked.

`DELETE /api/cms/users` moves the permitted target to 30-day Trash using
`deletedAt` and `purgeAt` dates, increments its password version, and revokes
sessions. Active listings, login, session reads/creation, password changes,
and mutation actors exclude trashed accounts. The unique username remains
reserved until deletion. `POST /api/cms/users/restore` and `/users/remove`
accept `{id,currentPassword}` and recheck current actor/target permissions
under the same lock. Restoration preserves identity, password, and role,
increments the version again, and clears retention dates; old sessions stay
invalid. A TTL index removes expired accounts. Public DTOs omit password hashes.

`GET /api/cms/trash` merges safe projections of content, images, and permitted
accounts into one list. It supports `kind`, literal English/Thai `q`, a scoped
`cursor`, and an exact `item=Kind:id` target. Results contain at most 30 items,
newest first with a stable key tie-breaker, filtered totals, and unfiltered type
counts. Operator responses exclude accounts. Read flags explain protected
actions; mutation endpoints remain authoritative. Images in a failed
`deleting` state with `trashedAt` stay visible for deletion retry. Dashboard
and navigation totals include the same categories according to the actor's role.

`POST /api/cms/content/remove` and `/api/cms/media/remove` require Dev or Admin
and recheck permission inside the deletion transaction. Content deletion only
accepts retained Trash with the expected revision and preserves saved images.
Core pages and pages with linked sections remain protected. Operator media
cleanup skips failed deletions originating in Trash, and submission rollback
cannot delete images carrying a Trash timestamp. Ordinary unfinished upload
cleanup and recoverable image cleanup remain available to every role.

The owner-only local `scripts/provision-dev.mts` provisions the initial `dev`
account with hidden standard input. `--check` is read-only. It never stores a
password file or overwrites an existing account with different credentials.

## User profile photos

Accounts optionally store `avatar` and a separate `profileRevision` (legacy 0).
`POST /api/cms/users/profile` accepts `{id,avatar,submissionId,expectedProfileRevision,currentPassword?}`.
An empty avatar removes the photo. Every role can edit its own photo; other
targets require current-password confirmation and the existing Dev/Admin role
checks. Trashed/expired users cannot be edited. Responses contain the safe
public user DTO, including current photo/revision, and an idempotency replay flag.

The users lock rechecks current permissions. A media-submission lock, staged
upload ownership validation, and a conflict-producing media-document touch
serialize photo saving with cleanup and cancellation. The account update,
image commit, `user.profile_updated` event and seven-day idempotency marker
share one transaction. Credentials/session versions are unchanged. Replay
returns the latest account photo and never overwrites a later save. Photo
URLs are not written to activity events.

Media reference checks include active and retained trashed account photos
across cleanup, abort, Trash and permanent removal. Usage responses expose
only account IDs/names, an optional deletion timestamp and `avatar` placement;
links point to the account's photo dialog or Trash. User Trash thumbnails also
use the stored photo. Existing account creation/credential forms remain
separate from photo saving.

## Activity logs

`GET /api/cms/logs` is authenticated and read-only for every CMS role, including
Dev. It accepts bounded literal `q`, `category`, `action`, and a scoped cursor,
returning up to 30 entries, a matching total, and a next cursor. There are no
log creation, update, deletion, Trash, or restore API methods.

Server-authored events contain an actor snapshot (ID, username, role), a fixed
action/outcome, a safe target identifier/name, and server-generated timestamps.
Strict nested allowlists exclude request bodies, passwords/hashes, session and
upload credentials, private enquiry text, and provider error details. Failed
password sign-ins use an unidentified actor rather than retaining submitted
usernames. Login throttles bound these events; challenge-generation and failed
slide attempts do not create activity entries.

Completed content, account, settings, enquiry-status and image database changes
append their events in the same transaction. Content retry markers prevent
duplicate events for replayed saves. Successful sign-in events are committed
with their sessions, and sign-out logs require an actual session removal.
Notification records describe a request, not confirmed delivery. External image
deletions retain their retry claim until the final database deletion and audit
entry commit together; provider failure entries are best effort if logging
itself is unavailable. Data exports require an audit insert before returning data.

Each event expires one UTC calendar year after its timestamp (February 29
clamps to February 28). Reads exclude `expiresAt <= now` immediately; MongoDB's
TTL index performs permanent removal asynchronously. The versioned index cache
also applies this TTL when an existing development process reloads new code.
The application collection handle exposes insert/read operations only and
blocks aggregation write stages. These are CMS/application restrictions;
direct database administration remains a privileged operation outside CMS roles.
Ordinary exports and content-recovery archives exclude logs, so restoring
website content cannot rewrite history or revive expired records.

## Verification

Run the relevant checks after a change:

```text
npm run typecheck
npm run lint
npm run test:backend
npm run build
npm run test:smoke
```

The unit tests cover input boundaries, bilingual requirements, reserved
addresses, version and submission contracts, contact consent, public
publication filtering, password verification, origin checks, request body
limits, image mappings, route coordinates, and safe browser migration and
recovery. It runs all `tests/*.test.ts`, including vessel specifications,
notification behavior, release gates, and backup archive boundaries; it does
not contact providers. `test:smoke` checks the running public site.

The backend smoke script defaults to checks that do not create content:

```text
node scripts/backend-smoke.mjs http://localhost:3005
```

For the complete workflow, create administrator access and populate an empty
isolated QA database using a reviewed migration:

```text
npm run backend:setup -- --qa
npm run backend:migrate -- --qa
npm run backend:migrate -- --qa --apply --expected-plan=PASTE_REVIEWED_PLAN_HASH
npm run backend:migrate -- --qa
npm run dev:qa
```

Review the QA dry-run before replacing `PASTE_REVIEWED_PLAN_HASH`. Setup alone
does not create content or a media library. The migration needs the original
source images in `public/images/` or
`.local/migration-backup-2026-10-23/images/` when the QA Cloudinary assets do
not already exist. These private sources are not included in a fresh Git
checkout. Existing populated QA environments can be reused.

The QA setup, migration, and server use the configured database name with
`_qa_backend` appended and the `moe-navigation-qa` Cloudinary folder. The QA
server uses port 3006. In another terminal, run:

```text
node scripts/backend-smoke.mjs http://localhost:3006 --allow-write --qa --skip-upload
```

The `--qa` flag reads `.local/cms-access.qa.json`. Alternatively set
`CMS_TEST_USERNAME` and `CMS_TEST_PASSWORD`. Use
`--credentials=path/to/private-test-credentials.json` for a different account
file. The flags choose credentials; configure the running server with its
isolated database and Cloudinary folder separately.

Omit `--skip-upload` to exercise a small real Cloudinary upload, its retry,
and media commit. The complete script creates named QA records and an enquiry,
checks stale changes, publication, bilingual HTML, metadata, the sitemap,
Trash, restore, and logout. It moves its own content records to Trash and
writes the exact created IDs to `.local/backend-smoke-result.json` for precise
cleanup. It does not delete arbitrary records, enquiries, or library assets.

For focused media recovery checks with the QA server running:

```text
npm run test:media:qa
```

This runs `scripts/check-media-workflow.mts --qa` with the required TypeScript
loader and server condition. It forces the isolated database and folder,
tests a small real upload, and simulates late provider responses and failed
deletions. It also checks ownership, protection for saved images, mobile and
gallery references, Trash, and concurrent save and abort. It removes only its own exact
content, media, operations, and submission locks, then writes
`.local/media-workflow-result.json`. Provider access is required.

For focused notification recovery checks:

```text
npm run test:notifications:qa
```

This uses an isolated QA database and a stub email sender. It verifies
concurrent claims, stable payload/idempotency behavior, the three-attempt
limit, the 23-hour retry window, expired processing leases, and missing
configuration. It sends no external email, removes its exact test enquiries,
and writes `.local/notification-check-result.json`.

For the broader API workflow rehearsal, start the isolated QA server and run
`npm run test:api:qa`. It creates a temporary QA account and uniquely tagged
fixtures to test all seven content types, publication, Trash/restore,
conflicting updates, settings, enquiry paging and retries, export privacy,
password rotation, session expiry and logout. It restores the QA settings
snapshot and removes only its own records and account. Avoid simultaneous
QA settings edits. Evidence is saved to `.local/full-test-api-result.json`.

GitHub Actions workflows are not used for this project. Run lint, unit/boundary
tests, Next route type generation, TypeScript checks and the isolated browser
suite locally as described in [TESTING.md](TESTING.md). Remote migrations,
uploads, notification sends and recovery rehearsals remain explicit isolated
checks. Completed local and isolated evidence is summarized in
[VERIFICATION.md](VERIFICATION.md).

An HTTP smoke pass does not establish visual quality. Also check CMS and
public pages at narrow and wide widths, keyboard navigation, editor errors,
image preparation, drawer focus, both languages, and repeated navigation.

## Deployment readiness

Run `npm run release:check` for configuration review or add `-- --live` for
read-only MongoDB/content and Cloudinary checks. The report is written to
`.local/release/readiness.json`; blocking checks return a nonzero exit code.
The command does not deploy, verify DNS ownership, send email, or approve
content. Review [LAUNCH.md](LAUNCH.md) for the remaining hosting and domain
steps, and [CONTENT_APPROVAL.md](CONTENT_APPROVAL.md) for factual review.

The dependency audit on 23 October 2026 reported no production dependency
vulnerabilities. The full audit reports five high findings in the development
lint dependency chain, all stemming from the `braces` nested-pattern denial
of service advisory (`GHSA-vfj7-8cjw-p6xm`). The suggested automatic fix
downgrades `eslint-config-next` to an older major version; it has not been
applied to this Next.js 16 project. Review an upstream compatible fix when
available.

Use the final HTTPS origin and verify access to MongoDB and Cloudinary from
the deployment host. Keep a MongoDB backup policy and Cloudinary recovery
policy appropriate to the business. Local browser drafts are not a backup.
The encrypted CLI backup and isolated restore rehearsal are documented in
[RECOVERY.md](RECOVERY.md); keep its recovery key separate from the archive.

The site retains `noindex, nofollow` and its crawling restriction while
illustrative company content and launch details are under review. Public
deployment and enabling indexing are separate release decisions.


## Provider usage monitor

Dev/Admin can use `/cms/usage` and `GET/POST/PUT /api/cms/usage`. Operator
has no access. The browser receives aggregate readings and safe messages only;
provider credentials and raw provider responses remain on the server.

- MongoDB uses read-only `atlasSize` and `dbStats` commands with a six-second
  deadline. Only the cluster measurement is compared with its cluster allowance;
  this database's size is shown separately. Network usage requires Atlas.
- Cloudinary makes one bounded read-only Admin API usage request, using the
  existing server credentials. Reported shared credits are the primary allowance.
  Stored bytes, delivery, transformations and Admin API requests have their own
  scope/period labels. Storage and delivery are not assigned separate limits when
  they share credits. The provider's last-update date is kept separate from the
  time the CMS checked it.
- Vercel dashboard readings record transfer bytes, CDN requests, a reporting
  label and a server timestamp. Blank readings stay unknown. Optional
  `VERCEL_USAGE_TOKEN` and `VERCEL_USAGE_TEAM_ID` enable the documented Billing
  Charges API for accounts with access. Its measured resource quantities retain
  their units and reporting window; undocumented endpoints and billing costs
  are not used. A saved dashboard reading takes precedence until cleared.

The initial included allowances match the owner's confirmed current plans:
MongoDB cluster storage 512 MiB, Vercel Fast Data Transfer 100 GB and CDN
Requests 1,000,000. Cloudinary limits come from its API. Allowances can be changed
in Monitoring limits without altering any provider plan. Connected Vercel
resource allowances must match their specific SKU, unit and reporting dates;
the CMS does not infer resets or treat missing charges as zero.

State is stored in `moe_state`: revisioned `usage:settings`, ten-minute
provider snapshots with seven-day cache expiry, and sixty-second distributed
provider leases. Cache scopes bind credentials/account and reporting window;
leases bind the account independent of the window. Failed checks preserve the
previous successful reading and retry after sixty seconds. Concurrent refreshes
serve the cached result, and POST/valid PUT share a 20-per-minute per-user budget.
No background polling or additional data collection is scheduled. Monitoring
configuration is operational state and is excluded from content backups;
re-enter custom allowances and dashboard readings after a full restore.

Settings saves recheck the active actor and role under the account lock and
commit an immutable `settings.usage_updated` event in the same transaction.
Changing only allowances preserves the manual reading timestamp. Explicitly
confirming a reading updates that timestamp even if its values are unchanged.
Clearing the saved reading resumes connected reporting when configured.

Provider references: [MongoDB measurement commands](https://www.mongodb.com/docs/atlas/free-tier-commands/),
[Cloudinary usage API](https://cloudinary.com/documentation/admin_api#usage),
and [Vercel Billing Charges API](https://vercel.com/docs/rest-api/billing/list-focus-billing-charges).
