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
credentials. Open **Account & tools → Change password** after the first
sign-in; a new password needs at least 14 characters. Changing it invalidates
the previous sessions. A normal session lasts eight hours.

The bootstrap process creates administrator access and indexes without inserting
website content. The website reads its existing MongoDB content. For an empty
database, follow the reviewed migration below before starting the public site.
Company facts, contact details,
vessel specifications, route availability, and sample articles still require
business review before public launch.

## Content workflow

Use the CMS menu to select Pages, Sections, Fleet, Routes, Projects, Services, or News.
English and Thai titles and descriptions are required. The editor also
supports longer text, image descriptions, categories, and a supplied date
where appropriate.

Use **Find a page and its sections** or a Page's **Manage sections** action
to edit related content in display order. The editor shows unsaved changes,
uses accessible discard confirmation, and links to the saved website page
in either language.

Fleet records support optional typed specifications: IMO number, completed
build year, dimensions, deadweight, TEU, bilingual flag state, and bilingual
availability statement. Blank values are not replaced with defaults. The
IMO check digit and numeric boundaries are validated; these checks do not
establish the truth of the business information. See [CMS_GUIDE.md](CMS_GUIDE.md).

1. Add or edit an item and prepare its text in both languages.
2. Choose an existing library image or prepare a JPEG, PNG, or WebP locally.
3. Check the information, then select Save.
4. Review the corresponding public page in both languages.

Saving makes content available immediately across browsers and devices;
there is no separate publication step. The editor submits Published for
both new and edited records. Historical Draft records remain unchanged until
explicitly saved; their compatibility fields and API support are retained.
Detail pages for missing, historical unpublished, or trashed records return
HTTP 404. The sitemap includes available detail pages.

Home, About, Services, Fleet, Routes, Projects, News, Contact, and Privacy
are core pages: their content can be edited, but
they cannot be unpublished or moved to Trash. Other content can be moved to
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

Use **Clean unfinished uploads** for abandoned uploads and failed deletions.
Cleanup checks main, mobile, and gallery references across all records,
including sections and Trash. Previously committed images remain in the
library until explicitly removed, including images saved through content.
Abandoned uploads have a one-hour grace period; failed deletions can be
retried immediately. Cleanup is manual. **Remove** is blocked while any
content, including Trash, references the image.

## Website details

Open **Account & tools → Website details** to manage the English and Thai
company names and office addresses, public phone number, email address, and
HTTPS map link. Save verified information; leave optional contact fields
blank until confirmed. These details feed the public contact page.

Settings use the same version checks as content. **Refresh details** loads
the latest saved version and asks before discarding unsaved settings.

## Existing local content and exports

Older demo content remains in its original browser storage. Open
**Account & tools → Review local content** to inspect it. The bulk import adds
new type-and-ID combinations only; existing server records are skipped.
Modified existing records appear under **Versions needing review**. Choose
**Review local version** to open one in the editor, review and adjust its
fields, then explicitly save it using the current server revision. Restore
an existing record from Trash before reviewing its local version. Core pages
remain Published. Original browser records are preserved, and prepared local
images upload only when the reviewed or imported record is saved.

The review also includes standalone local media and retained local Trash.
Local Trash requires explicit review as a draft; bulk import never revives
it. Image preparation finishes before import begins. The importer saves media
before records, stops on failure, and retains submission identifiers and retry
counts across reloads in `moe-migration-v1`. Use **Check interrupted import**
before retrying an uncertain result.

**Clear verified local data** fetches current server data and verifies every
retained record and image. It writes an exact recovery archive to
`moe-migration-archive-v1` before clearing the active legacy keys; if archiving
fails, nothing is cleared. **Restore archived browser data** refuses to
replace newer browser data. **Export local data** downloads the active data,
receipts, and any archive. Expired local Trash is excluded from import but
remains in the exact archive. Browser storage belongs to its browser and
origin; another browser or port must be reviewed separately.

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
status. The selected recipient is configured privately, while the owner will
supply the API key and verified sender later. External email delivery has
not been tested.

CMS administrators can inspect notification state and request an eligible
retry. The first actual attempt freezes the email message, sender, and
recipient. Retries reuse that message and idempotency key, with at most three
attempts inside a 23-hour window. Concurrent sends share a database lease.
**Email accepted** means provider acceptance, not verified inbox delivery.
Missing configuration never removes a saved enquiry. See [EMAIL.md](EMAIL.md)
for setup, safe recovery, and the remaining live acceptance check.

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
| `moe_users` | Administrator usernames and salted password hashes |
| `moe_sessions` | Hashed session tokens and expiry |
| `moe_enquiries` | Contact submissions, consent time, inbox status, notification state, and private frozen delivery envelope |
| `moe_settings` | Bilingual company and public contact details |
| `moe_operations` | Recent save results used to make retries idempotent |
| `moe_state` | Durable submission cancellation locks, migration markers, and expiring request counters |

CMS APIs check the current database session. Mutation endpoints also check
the request origin. Session cookies are HttpOnly and SameSite Strict, and
use Secure in production or when the configured website uses HTTPS. Login,
password-change, and contact attempts have database-backed limits. Provider failures return
a generic error rather than exposing credentials or connection strings.

No public account registration is provided. This CMS is for authorized
website administrators.

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

The repository CI workflow performs installation, lint, unit/boundary tests,
Next route type generation, TypeScript checks, and a production build without
provider secrets. It does not run remote migrations, uploads, notification
sends, or recovery rehearsals. Its actual GitHub run and required-check
settings must be verified separately. Completed local and isolated evidence
is summarized in [VERIFICATION.md](VERIFICATION.md).

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
