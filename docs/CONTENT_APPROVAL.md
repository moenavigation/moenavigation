# Company content approval

Use the CMS to enter approved material. Confirm company identity, ownership, certifications, fleet particulars and operating schedules against their sources. Leave information pending confirmation blank or clearly provisional.

The Project and News entries describe planning topics and general articles.
Routes show port pairs useful for enquiries. The map labels its lines as
approximate, and the route details ask visitors to confirm availability.
Pictures illustrating these pages come from the client’s vessel particulars
and the company’s documented photo archive. A specific project or event
requires its own evidence and permission to publish.
Search indexing requires separate launch approval.

| Area | Material or decision needed | Acceptance |
| --- | --- | --- |
| Company identity | Approved English/Thai company name, logo and short introduction | Spelling and legal/trading identity checked by owner |
| Contact | Office address in both languages, business telephone, public email, correct map location | Each contact method tested; private notification recipient need not be public |
| Services | Actual services, operating scope, process and enquiry requirements | No unsupported capabilities, certifications or guarantees |
| Fleet | Approved vessel names/photos and available IMO, year, dimensions, capacity, flag and availability | Each supplied figure has a verified source; unavailable fields remain blank |
| Routes | Actual origin/destination scope and service status | Port-pair enquiries avoid timetables; route details require confirmation and the map's accessible description identifies approximate lines |
| Projects | Approved client references, scope, dates and permitted photographs | Permission to publish and factual review complete |
| News | Real article text, dates, author/approval where appropriate | No generated historical events presented as fact |
| Photography | Authentic, approved photographs of the company, its fleet and operations | Verify the source, match the photograph to its subject and describe the visible scene in Thai and English |
| Privacy | Actual company/contact, data collected, purpose, access, retention and service providers | Owner reviews against actual practices and applicable requirements |
| Thai/English | Equivalent meaning, names, units and contact details | Human review for business meaning and spelling |

## Company photograph sources and migration

The current media manifest identifies 28 photographs used for initial content. Fourteen show the fleet, five come from the earlier About-page review, and nine additional archive photographs show the office, crew, vessels and port operations. The nine archive WebPs retain their original pixels. Each manifest entry records its SHA-256, size and dimensions. The nine newer entries also include the original company-site URL. [Media manifest](../scripts/data/media-manifest.json) · [Archived company media inventory](research/legacy-moe-line-2026-11-16/media-library.json)

Existing CMS records can point to earlier illustrations. The website and CMS map recognized images to their reviewed photographs and bilingual descriptions. To persist the replacements, first preview the affected records with `node --conditions=react-server --import tsx scripts/import-real-photos.mts`. Use `--stage` to upload the verified replacement files, then rerun the preview and review its plan hash. Apply that staged plan with `--apply --expected-plan=<reviewed hash>`. The script verifies delivered file hashes, saves a backup under `.local/real-photo-import`, checks record revisions and moves the retired library items to Trash. Refresh the public cache and review both language versions after applying. [Photo migration](../scripts/import-real-photos.mts)

## CMS editing workflow

1. Find the relevant Page, Section, Vessel, Service, Route, Project or News record.
2. Enter both languages and prepare images locally. Use descriptive alternative text.
3. Check the information before selecting Save. Saving makes the content public immediately. Uploads start on Save; success appears only after images and data are saved together.
4. Review the page in both languages and at a narrow width. Test links and the enquiry destination.
5. Save any corrections. Use Trash for removal when restoration may be needed.
6. Approve the entire public site before setting the launch/indexing flags. Make a fresh encrypted backup after a substantial content update.

The user supplied `https://moe-navigation.com/` as the intended domain and `poomtawee@outlook.com` as the temporary notification destination. The owner reviews contact details and service claims before launch.

On 30 October 2026, the generic bilingual Project, News, Route and related page
copy was saved to the existing MongoDB records through the CMS API. IDs,
publication status, media, ordering and mapped coordinates were preserved.
The exact pre-change CMS records are backed up locally at
`.local/production-copy/full-live-before.json`; this file is not deployed.
New case studies and articles can replace the interim planning copy through the CMS when the owner supplies them.

## Draft material prepared on 23 October 2026

Six bilingual Service body drafts explain what a customer should include in an enquiry: vessel services, bunkering, logistics support, ship management, marine consulting and marine support. Each sets a useful discussion scope without inventing company history, staff qualifications, fleet particulars, supplier stock, rates or active schedules. Existing titles, summaries, images and publication status are preserved. The site remains noindex until business approval.

The service endings were tightened to practical scope, availability and quotation checks; internal approval disclaimers are kept out of the customer instructions. The existing `privacy-4` section also explains the actual optional notification flow through Resend and the team's designated email provider, with enquiries remaining saved in the CMS even if email is disabled or fails. Its previous description was preserved, and no retention period was invented. Exact previous records and verification reports are retained privately under `.local/service-copy`.

Draft inputs live in `scripts/data/service-copy-drafts.ts`. To review changes before applying them, run `node --import tsx scripts/apply-service-copy.mts`. Apply only the displayed plan with `--apply --expected-plan=<hash>`. The script backs up the exact six previous records under `.local/service-copy`, checks revisions in one transaction, and verifies that no unrelated fields or record counts changed. Re-running it after a successful update makes no duplicate records or needless revisions. Do not replay it over later editorial changes without reviewing the new plan.

The SVG in `public/brand` is traced from the supplied `Moe Logo - 2026.png`, preserving its red/navy lettering and waves. It replaces the previous draft identity throughout the site and CMS, including loading screens and browser icons. No generated vessel or project photograph has been added as evidence of actual company assets.

## Client fleet information received on 29 October 2026

On 24 November 2026 the client updated the six numbered vessel names to MOE LINE 2 through MOE LINE 7 in English and โมไลน์ 2 through โมไลน์ 7 in Thai. This applies to vessel names on the website and in the CMS. The two individually named vessels are RANONG MOE and DUMAI MOE.

The client supplied eight vessel names and types: ระนองโม, โม2, โม3, โม5, โม6 and โม7 are container vessels; โม4 is a crane vessel; Dumai Moe is a tanker. These replace the earlier provisional classifications. Existing vessel URLs stay unchanged, and the new entries use `moe-line-4` and `dumai-moe`. The Thai names follow the supplied spelling, including the untranslated name Dumai Moe.

The October list supplied names and types. Subsequent vessel pages, source photographs and client particulars supplement it. The initial migration and isolated browser fixtures share the fleet records in `scripts/data/client-fleet.ts`.

## Client revision received on 24 November 2026

The client sheets are the primary particulars for MOE LINE 4, MOE LINE 5, MOE LINE 6 and DUMAI MOE. Reviewed values, bilingual technical text, filenames and SHA-256 hashes are in `scripts/data/current-pdf-vessel-particulars.ts`. The CMS vessel editor supports the sheet's vessel type, identity, class, machinery, performance, tanks, cargo handling, load lines and mooring equipment. Technical fields stay editable after import. Onboard contacts, insurance providers and corporate registration details are outside the public particulars.

MOE LINE 5 lists “2009, CHINA” and MOE LINE 6 lists “2006, CHINA”. Both also have a second BUILT row showing 2008 without a country. Use the first country-qualified year for each ship, corroborated by its earlier vessel particulars. Both sheets specify four reefer plugs. MOE LINE 4 has a 200-tonne crane and gives no IMO number. DUMAI MOE has ten cargo tanks totaling 3,330 m³ at 100% capacity. Keep its general deadweight of 3,526 tonnes distinct from the summer load-line figure of 3,526.32 tonnes.

Dry-run the four-sheet import with `node --conditions=react-server --import tsx scripts/import-legacy-vessel-particulars.mts --current-pdfs`. Review the field differences in `.local/current-vessel-pdf-import-2026-11-24/plan.json`. To apply that specific plan, supply `--apply --expected-plan=<reviewed hash>` to the same command. It backs up the four original records and verifies the changes in a revision-checked transaction. Refresh the public cache after applying. The legacy website import excludes these four vessel identities.

The homepage brief supplies Thai and English chartering copy. It describes crew arrangements and vessel operations management throughout a charter. Independent management services and the proposed operating-principle statements require company confirmation before public release. Alice is reviewing the existing route information.
