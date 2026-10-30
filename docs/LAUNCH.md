# Launch preparation

## Current decisions

- Intended domain supplied by the owner: **https://moe-navigation.com/**.
- Dev and Admin manage the private enquiry-notification recipient list in CMS Enquiries. The legacy server recipient is only a fallback before the first saved list; an empty saved list pauses mail.
- Public deployment is not performed by the implementation workflow. DNS ownership, hosting access and production settings still require verification.
- Draft branding and copy may be prepared, but generated material does not verify company facts. Keep search indexing disabled until the owner approves the actual public content.

## Read-only readiness check

```powershell
npm.cmd run release:check
npm.cmd run release:check -- --live
```

The live option uses direct read-only MongoDB queries and one Cloudinary authentication ping. It does not initialize indexes, migrate, upload, clean up data or send email. It checks the saved private CMS recipient list, while reporting only its count and setup state. A configuration-only run cannot establish the effective recipients.

The report is saved to `.local/release/readiness.json`; blocking checks return a nonzero exit code. `automatedChecksPassed` describes the checks in that invocation. `ready` remains false because the tool cannot attest the external deployment, recovery and email-receipt evidence listed in `requiresExternalVerification`. An exit code of zero is not launch approval. Local origin/runtime results do not establish the deployed site's settings.

English and Thai company names are required. Public office addresses, phone and email are optional: missing values require owner confirmation, not a technical release block. Leave unconfirmed fields blank. The owner may choose the enquiry form and a verified phone number without displaying a public email address; notification recipients remain separate and private.

The local browser-test harness performs its production build after seeding an isolated loopback MongoDB database. The browser tests run against that same build without live provider credentials.

## Hosting and domain

1. Select the authorized hosting project (Vercel is the preferred project default) and connect the correct repository/branch.
2. Use the Next.js framework preset and Node 22. Run `npm ci` and `npm run build`; this CMS needs a Node/server runtime, not static export.
3. Set production variables from `.env.example` using the hosting secret store. Use the final HTTPS origin and the dedicated project database/media folder. Keep API keys server-side.
   For the chosen domain, set `NEXT_PUBLIC_SITE_URL=https://moe-navigation.com` in production. Keep the local value at `http://localhost:3005` so CMS origin checks match local requests.
4. Keep preview environments isolated from live writes. Use a dedicated preview database/folder and no production email recipient/provider credentials.
5. Verify domain ownership, DNS configuration, canonical host choice and HTTPS certificates. Check that HTTP and any alternate host redirect to the chosen canonical origin without a loop.
6. Confirm MongoDB network rules, database user permissions and Cloudinary configuration from the deployed environment. Check upload limits and timeouts against the hosting plan.
7. Run the existing public smoke check against the deployed preview; run mutation tests only against its explicitly isolated QA database.

## Troubleshooting a production render failure

If Vercel logs report `MongoDB database name is missing or invalid.`, check **Settings → Environment Variables → Production**:

- Set `MONGODB_DB_NAME` to the database containing this site's content. The existing project database is `moenavigation`; enter the value without quotes or surrounding whitespace.
- Set `MONGODB_URI` privately from the working configuration. `.env.local` is local-only and is not uploaded to Vercel.
- Redeploy after saving environment changes; an existing deployment keeps its previous environment.
- Verify `/`, `/th`, and a content detail page in both languages on the new deployment. Also confirm an old `/en` link redirects to its unprefixed English equivalent and a remembered Thai choice returns to `/th` from the homepage entrance. React error #441 is a production server-render error; the corresponding server log identifies its cause.

The static `/favicon.ico` and `/icon.svg` assets should respond without MongoDB. Missing asset filenames should return 404 instead of attempting a content query. Do not point the app at a new empty database or use fallback content to conceal a configuration failure.

## Content and indexing

Complete [CONTENT_APPROVAL.md](CONTENT_APPROVAL.md), then set both server flags deliberately:

```dotenv
SITE_CONTENT_APPROVED=true
SITE_INDEXING_ENABLED=true
```

The runtime additionally requires production mode, a public HTTPS origin, and either no `VERCEL_ENV` or `VERCEL_ENV=production`. Preview deployments stay noindex. Until approval, keep both flags false.

The current Project, News, and Route examples remain visible by owner choice
with generic wording. They do not establish completed work, reported events,
or confirmed sailings. The 31 October 2026 read-only audit reached MongoDB and
Cloudinary and found all nine core pages. Sender configuration and one legacy
fallback recipient are present. One approved test enquiry was saved once and
Resend reported its notification delivered; the owner confirmed Inbox receipt.
Received authentication headers and Reply-To behavior still require inspection.
Eight vessels without specifications, provisional wording and the optional
public email still need owner review. The local origin remains localhost;
the deployed canonical origin is correct. See the
[preproduction report](PREPRODUCTION_2026-10-31.md) for executed checks and
remaining acceptance. Keep indexing off until the public content is approved.

Inspect actual deployed `/robots.txt`, `/sitemap.xml`, Thai/English canonicals, hreflang, page titles, descriptions, sharing images, and CMS noindex behavior. Submit the sitemap to the owner's search-console account only after the approved launch. The flags express the owner's approval; they cannot independently prove the accuracy of business claims or ownership of a domain.

The public smoke check expects noindex by default. After approved indexing is enabled, use `npm run test:smoke -- https://moe-navigation.com --indexed` to check the production policy while ensuring the CMS stays noindex.

## Enquiries and operational checks

- Configure `RESEND_API_KEY` and the plain `ENQUIRY_EMAIL_FROM`, then save recipients in **Enquiries → Notification recipients** as Dev or Admin. `ENQUIRY_EMAIL_TO` is only a fallback before the first saved CMS list. Verify the sender with the provider; recipients alone cannot enable delivery.
- Send one clearly identified test enquiry, verify it is saved in the CMS and received by the intended inbox, then resolve that test record.
- Test provider failure in an isolated environment: saved enquiries must remain accessible, retries must be bounded and duplicates controlled.
- Review access, change the initial CMS password, and keep initial access files out of deployed assets.
- Create a current encrypted backup and confirm its key is held separately. Verify actual provider backup policies and retention; see [RECOVERY.md](RECOVERY.md).
- Confirm which hosting/error-log service the owner will use and who receives actionable alerts. Local structured logging is not an independently monitored alert service.

## Automated checks

GitHub Actions workflows are not used for this project. Run `npm run lint`, `npm run test:backend`, `npx next typegen`, `npm run typecheck` and `npm run test:e2e` locally before release. Install the browser engines once with `npm run test:e2e:install`. The browser harness builds and tests the application using an isolated local database; see [TESTING.md](TESTING.md).

Do not require the removed `Application checks` workflow's `verify` job for pull requests. If an existing branch rule requires it, remove that requirement in repository settings. Local checks do not establish that production hosting has run successfully.

## Final acceptance

Check both languages on narrow/mobile and desktop layouts: navigation and browser history, service/vessel/project details, route selection/zoom, galleries, contact validation/success, CMS save and immediate public updates, upload retry/cleanup, Trash and restoration. Measure production loading behavior and fix observed issues; avoid promising performance scores without a deployed measurement.

Document the deployed URL, deployment revision, checks, backup location, remaining owner decisions and rollback steps before enabling public indexing.
