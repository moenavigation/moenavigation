# Company content approval

Use the CMS to enter approved material. Leave unknown facts blank or clearly provisional. Generated copy and visuals can establish the draft design, but do not establish company identity, ownership, certifications, fleet particulars or active shipping schedules.

The owner chose to keep the current Project, News, and Route entries visible
while approved records and photographs are gathered. Their published copy now
discusses planning topics, general articles, and port-pair enquiries without
claiming completed company projects, actual news events, or scheduled routes.
Generated vessel imagery remains identified in alternative text. The map's
accessible description states that its lines are approximate and are not
navigation guidance; the route details ask visitors to confirm availability.
This interim publication is not factual approval or permission to enable
search indexing.

| Area | Material or decision needed | Acceptance |
| --- | --- | --- |
| Company identity | Approved English/Thai company name, logo and short introduction | Spelling and legal/trading identity checked by owner |
| Contact | Office address in both languages, business telephone, public email, correct map location | Each contact method tested; private notification recipient need not be public |
| Services | Actual services, operating scope, process and enquiry requirements | No unsupported capabilities, certifications or guarantees |
| Fleet | Approved vessel names/photos and available IMO, year, dimensions, capacity, flag and availability | Each supplied figure has a verified source; unavailable fields remain blank |
| Routes | Actual origin/destination scope and service status | Port-pair enquiries avoid timetables; route details require confirmation and the map's accessible description identifies approximate lines |
| Projects | Approved client references, scope, dates and permitted photographs | Permission to publish and factual review complete |
| News | Real article text, dates, author/approval where appropriate | No generated historical events presented as fact |
| Photography | Owner-supplied or licensed photos; generated concepts identified appropriately | No generated vessel/port implied to be the company's real asset |
| Privacy | Actual company/contact, data collected, purpose, access, retention and service providers | Owner reviews against actual practices and applicable requirements |
| Thai/English | Equivalent meaning, names, units and contact details | Human review for business meaning and spelling |

## CMS editing workflow

1. Find the relevant Page, Section, Vessel, Service, Route, Project or News record.
2. Enter both languages and prepare images locally. Use descriptive alternative text.
3. Check the information before selecting Save. Saving makes the content public immediately. Uploads start on Save; success appears only after images and data are saved together.
4. Review the page in both languages and at a narrow width. Test links and the enquiry destination.
5. Save any corrections. Use Trash for removal when restoration may be needed.
6. Approve the entire public site before setting the launch/indexing flags. Make a fresh encrypted backup after a substantial content update.

The user supplied `https://moe-navigation.com/` as the intended domain and `poomtawee@outlook.com` as the temporary notification destination. Real company details and assets are still awaiting owner verification.

On 30 October 2026, the generic bilingual Project, News, Route and related page
copy was saved to the existing MongoDB records through the CMS API. IDs,
publication status, media, ordering and mapped coordinates were preserved.
The exact pre-change CMS records are backed up locally at
`.local/production-copy/full-live-before.json`; this file is not deployed.
Replace the interim text and images with approved material through the CMS
when the owner supplies it.

## Draft material prepared on 23 October 2026

Six bilingual Service body drafts explain what a customer should include in an enquiry: vessel services, bunkering, logistics support, ship management, marine consulting and marine support. Each sets a useful discussion scope without inventing company history, staff qualifications, fleet particulars, supplier stock, rates or active schedules. Existing titles, summaries, images and publication status are preserved. The site remains noindex until business approval.

The service endings were tightened to practical scope, availability and quotation checks; internal approval disclaimers are kept out of the customer instructions. The existing `privacy-4` section also explains the actual optional notification flow through Resend and the team's designated email provider, with enquiries remaining saved in the CMS even if email is disabled or fails. Its previous description was preserved, and no retention period was invented. Exact previous records and verification reports are retained privately under `.local/service-copy`.

Draft inputs live in `scripts/data/service-copy-drafts.ts`. To review changes before applying them, run `node --import tsx scripts/apply-service-copy.mts`. Apply only the displayed plan with `--apply --expected-plan=<hash>`. The script backs up the exact six previous records under `.local/service-copy`, checks revisions in one transaction, and verifies that no unrelated fields or record counts changed. Re-running it after a successful update makes no duplicate records or needless revisions. Do not replay it over later editorial changes without reviewing the new plan.

The SVG in `public/brand` is traced from the supplied `Moe Logo - 2026.png`, preserving its red/navy lettering and waves. It replaces the previous draft identity throughout the site and CMS, including loading screens and browser icons. No generated vessel or project photograph has been added as evidence of actual company assets.

## Client fleet information received on 29 October 2026

The client supplied eight vessel names and types: ระนองโม, โม2, โม3, โม5, โม6 and โม7 are container vessels; โม4 is a crane vessel; Dumai Moe is a tanker. These replace the earlier provisional classifications. Existing vessel URLs stay unchanged, and the new entries use `moe-line-4` and `dumai-moe`. The Thai names follow the supplied spelling, including the untranslated name Dumai Moe.

The confirmed seed data lives in `scripts/data/client-fleet.ts` and is shared by the initial migration and isolated browser fixtures. No actual vessel photographs, dimensions, capacities, IMO numbers, flag, build year or operating availability were supplied; technical particulars remain blank. Fleet cards and galleries use explicitly labeled illustrative imagery, combining retained maritime assets with five optimized WebP illustrations for MOE 3, MOE 4, MOE 6, MOE 7 and Dumai Moe. Image selection follows each confirmed vessel type, and bilingual alternative text identifies every image as illustrative rather than a photograph of the named vessel. Replace these illustrations with client photos when supplied. Further CMS edits remain authoritative: the initial migration preserves existing field values rather than overwriting later editorial changes.
