# MOE Navigation

A responsive maritime corporate website with a bilingual public site and
an authenticated CMS. Built with Next.js App Router, TypeScript, CSS Modules,
Lucide icons, MongoDB, and Cloudinary. The visual design follows the supplied
references in `Design/`.

## Run locally

Install dependencies and fill the repository-root `.env.local` using
`.env.example` as the variable reference. Then run:

```sh
npm install
npm run backend:check
npm run backend:setup
npm run dev
```

Open [http://localhost:3005](http://localhost:3005). Thai pages use `/`, English
pages use `/en`, and the CMS is at `/cms`. First setup creates an
administrator and writes initial credentials to the ignored
`.local/cms-access.json`. Change the password in **Account & tools** after
signing in. Re-running setup preserves existing accounts and content.
Setup creates access controls only; it does not repopulate the website with
local demo content. The connected database is the source of website content.
For an empty database, use the reviewed migration in
[docs/BACKEND.md](docs/BACKEND.md#website-migration-and-local-cleanup) before
starting the public site.

MongoDB must support transactions. Read [docs/BACKEND.md](docs/BACKEND.md)
for configuration, content workflows, uploads, enquiries, and QA setup.
Editors can use [docs/CMS_GUIDE.md](docs/CMS_GUIDE.md) for daily tasks.

For a production build locally:

```sh
npm run build
npm run start
```

Both normal servers use port **3005**. Stop development before starting
production on that port. In PowerShell, use `npm.cmd` if the `npm` script
shim is blocked.

## Validate

```sh
npm run typecheck
npm run lint
npm run test:backend
npm run build
```

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for the current validation record.
`npm run test:performance -- http://localhost:3005` records public response timings
and actual responsive image payloads without changing content.

With the site running, use another terminal for public route verification:

```sh
npm run test:smoke
```

The script accepts another URL, for example
`npm run test:smoke -- http://localhost:3006`.

To create an isolated QA environment, first create access and review its
migration plan. Setup alone does not create content or a media library:

```sh
npm run backend:setup -- --qa
npm run backend:migrate -- --qa
npm run backend:migrate -- --qa --apply --expected-plan=PASTE_REVIEWED_PLAN_HASH
npm run backend:migrate -- --qa
npm run dev:qa
```

Review `.local/website-migration-plan.json` and replace
`PASTE_REVIEWED_PLAN_HASH` with that dry-run's exact hash before applying it.
The migration needs the original private image sources if the QA Cloudinary
assets do not already exist; see the backend guide. Existing populated QA
environments can be reused.

With the QA server running, use another terminal:

```sh
npm run test:backend:smoke -- http://localhost:3006 --allow-write --qa
npm run test:media:qa
npm run test:notifications:qa
```

QA uses a separate database and Cloudinary folder. The backend smoke creates
temporary content, one enquiry, and a small uploaded image, moving its content
to Trash and recording exact IDs in `.local/backend-smoke-result.json` for
cleanup. The focused media check tests cancellation, late responses, and image
protection, then removes its own exact artifacts and writes
`.local/media-workflow-result.json`. See the backend guide before using write
mode against another server.

The notification QA command uses the isolated database and a stub sender;
it sends no external email and removes its exact test enquiries. CI in
`.github/workflows/ci.yml` runs installation, lint, unit tests, generated route
types, TypeScript, a build, and Chromium/Firefox/WebKit regressions without
provider credentials. Run `npm run test:e2e:install` once, then
`npm run test:e2e` locally. See [docs/TESTING.md](docs/TESTING.md) for isolation,
coverage and reports. Live uploads,
migrations, email delivery, and recovery rehearsals remain explicit isolated
checks. See [docs/VERIFICATION.md](docs/VERIFICATION.md) for recorded evidence.

## Current functionality and launch boundaries

CMS edits persist in MongoDB and appear across browsers. It supports
bilingual content with immediate visibility after Save, 30-day Trash and restore,
Cloudinary media, an enquiry inbox, and administrator account controls.
Company names and verified public contact details are editable in the CMS.
Page sections, article bodies, vessel galleries, mobile hero images, and
route ports/coordinates are stored in MongoDB. All 15 original website
images are hosted in Cloudinary; public pages have no local content fallback.
Optional vessel specifications are editable and appear publicly only when
supplied; unknown values remain blank. Page/Section filters and bilingual
published-page links make content easier to find and review.
Uploads begin on save, and conflicting edits are rejected. Retry recovery
checks uncertain saves before cancelling their unfinished uploads. Durable
cancellation locks prevent late saves, while committed images and images
referenced by Trash remain protected. Public HTML,
metadata, the sitemap, and detail-page 404 responses follow published data.

Contact submissions are delivered to the CMS inbox. Optional Resend email
notifications, status reporting, and bounded retries are prepared. The
recipient is stored privately; the owner will supply the API key and verified
sender later. No external email delivery has been tested. See
[docs/EMAIL.md](docs/EMAIL.md). Previous browser-local content can be reviewed and imported
without overwriting matching server records. Verified local data can be
cleared only after a recovery archive is written; restoring that archive
refuses to replace newer browser edits.

`npm run backend:migrate` checks the one-time migration recipe against both
providers without changing remote data. See the backend guide for applying
a reviewed plan, verifying migration completion, and recovery copies.

## Backup and release preparation

The encrypted backup CLI includes database records and original Cloudinary
images. It supports inspection, isolated restore, independent verification,
and ownership-checked rehearsal cleanup. A restore rehearsal has passed;
see [docs/RECOVERY.md](docs/RECOVERY.md) before using `backup:create`,
`backup:inspect`, `backup:restore`, `backup:verify`, or `backup:cleanup`.
Keep the archive and recovery key in separate secure storage.

```sh
npm run release:check
npm run release:check -- --live
```

The live readiness check only reads configuration, database content, and
provider connectivity. It writes `.local/release/readiness.json` and does not
deploy, send email, or enable indexing. Follow [docs/LAUNCH.md](docs/LAUNCH.md)
for hosting, the intended domain, approval, and deployed acceptance checks.

## Content approval

Photography and business examples remain illustrative. Company contacts,
vessel specifications, route availability, projects, news, and the final
privacy policy require confirmation before public launch. The site remains
**noindex, nofollow**. Map connections are approximate illustrations and must
not be used for navigation; map tiles require internet access.

See [docs/DEMO.md](docs/DEMO.md) for the public experience, sample-content
boundaries, and source locations. Project instructions remain in `AGENTS.md`
and the other documents in `docs/`.
