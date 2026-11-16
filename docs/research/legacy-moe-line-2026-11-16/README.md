# Legacy Moe Line content and website improvement plan

Reviewed on 16 November 2026. The most useful material for Moe Navigation is the vessel photography, technical particulars, named port connections, and operational images. Preserve the current eight-vessel fleet, company identity, newer homepage copy, and current contact details while reviewing the older records.

## Recovered sources

The archive contains 35 public HTML pages: 17 English corporate, fleet and route pages, their 17 Thai equivalents, and one default WordPress demonstration post. The public collections contain five main pages, seven vessel profiles and five route profiles. The demonstration post has no business value.

The public media library contains 159 records: 120 raster images, 26 SVG images, eight PDFs and five MP4 videos. Linked pages initially exposed only 22 original images. The library adds vessel photos, operational photographs, route maps, seven vessel specification sheets, and a two-page compliance document that the visible detail-page links did not expose.

All 245 discovered media URLs, including 86 responsive image variants, downloaded successfully. They total 1,491,118,257 bytes, about 1.49 GB; the videos account for most of the storage. Media-library presence establishes availability on the old host, not ownership, current use, depicted identity or permission to publish for a different legal entity.

| Saved material | Location |
| --- | --- |
| Page URLs, retrieval times and snapshot paths | [page-inventory.json](page-inventory.json) |
| Seven normalized vessel profiles | [fleet/fleet-data.json](fleet/fleet-data.json) |
| Fleet summary and reuse guidance | [fleet/README.md](fleet/README.md) |
| Seven PDF comparisons and discrepancies | [fleet/pdf-particulars.json](fleet/pdf-particulars.json) |
| Compliance document and annual endorsement inspection | [fleet/doc-inspection.json](fleet/doc-inspection.json) |
| Five routes, corporate profile and contact evidence | [routes-company.json](routes-company.json) |
| Every public media-library item | [media-library.json](media-library.json) |
| Download URLs, local paths, file sizes and hashes | [media-inventory.json](media-inventory.json) |
| HTML counter values, contact links and metadata observations | [additional-findings.json](additional-findings.json) |
| Current production comparison | [current-site-comparison.json](current-site-comparison.json) |
| Candidate legacy URL destinations | [legacy-url-map.json](legacy-url-map.json) |

Original HTML, readable text, parsed tables, media binaries, PDF text and PDF renders are under `C:\Coding\2026\moenavigation\.local\legacy-moe-line-2026-11-16`. These working files are excluded from Git. `media-overview.jpg` previews the 22 original page images; `media-library-overview-1.jpg` through `media-library-overview-4.jpg` preview all 120 raster library images. The videos are archived and inventoried; their full contents have not been reviewed.

## Improvements to prioritize

| Priority | Improvement | Current website and suitable destination |
| --- | --- | --- |
| 1 | Replace illustrative vessel imagery with correctly identified photographs | The live Fleet page lists eight vessels and still labels its imagery as illustrative. Review the seven old profile photos and additional library angles. Keep Dumai Moe, which is absent from the old site. Use the normal image-library save workflow and bilingual alternative text. |
| 1 | Add useful vessel specifications | All eight live vessel pages show specifications pending verification. Existing `vesselSpecs` supports IMO, build year, LOA, beam, draft, DWT, TEU and flag. Recover additional registration, depth, GRT/NRT, reefer, machinery, consumption and tank facts in the vessel body initially. Resolve the source conflicts below first. |
| 1 | Review the five historical route pairs against the current business | The live site presents three illustrative regional port pairs. The old site's five pairs are different and offer more relevant historical domestic/coastal detail. Preserve current record identities; use confirmed routes with enquiry actions and indicative passage information. |
| 2 | Expand About with concrete history and operations | The current homepage already mentions 2022 and shared founding roots with SSOT Group. Add detail to About after confirming which history belongs to Moe Navigation versus Moe Container Line. Use the existing About introduction, mission, vision, values and body fields. |
| 2 | Add credible operational photography | The library includes crew, bridge, maintenance, safety activity, crane operations, office and vessel images. Confirm the people, locations and rights. Generic or unidentified people photographs should not be presented as current employees. |
| 2 | Review a compliance document for a trust section | A scanned Document of Compliance is available, but it names Moe Container Line. Its annual endorsement page is blank in the archived copy. Obtain the correct entity's current document and endorsements before making a certification claim. |
| 2 | Preserve and reconcile contact information | The current production site already has telephone, address and `md.assist@moe-navigation.com`. The old phone/address overlap, while a legacy icon links to `kamon@ssotgroup.com`. Keep the current contact information authoritative until a change is confirmed. |
| 3 | Consolidate bilingual copy and legacy URL handling | Complete Thai prose, standardize port spelling, use equivalent technical units, and map old WordPress paths to relevant current pages. Old-domain redirects also require control of the old host. |
| 3 | Add dated, attributable business metrics when available | The old counter targets are seven vessels, 15,559 annual carried volume, 89 skilled crew and 1,119 annual voyages. The reporting year is absent and the volume unit is unspecified. They are leads for confirmation, not current homepage statistics. |

Current implementation references: `src/lib/cms-types.ts`, `src/components/CmsCollectionFields.tsx`, `src/components/ContentPages.tsx`, `src/components/RouteExplorer.tsx`, `src/server/settings.ts`, `scripts/data/client-fleet.ts`, and `docs/CONTENT_APPROVAL.md`.

The public website reads saved database content. Editing seed files alone would not update production, and the initial migration deliberately preserves existing fields. A later content update should compare the actual saved records, preserve their IDs and revisions, and use the existing CMS or a reviewed maintenance import. Existing Page and Section records remain fixed.

## Vessel material

The old list contains six container vessels and one crane barge. The current client-supplied list additionally includes Dumai Moe, a tanker. Keep the newer names and Thai spellings: the old `MOE LINE 2` profile corresponds to the current `MOE 2` candidate, for example, rather than a reason to rename the current record.

| Legacy profile | HTML nominal TEU | HTML LOA and beam in metres | HTML DWT |
| --- | ---: | --- | ---: |
| RANONG MOE | 96 | 63.00 and 13.60 | 2,088 |
| MOE LINE 2 | 72 | 49.98 and 12.80 | 1,590 |
| MOE LINE 3 | 72 | 49.98 and 12.80 | 1,290 |
| MOE LINE 4 | Not supplied | 55.00 and 19.00 | Not supplied |
| MOE LINE 5 | 120 | 49.98 and 14.80 | 1,800 |
| MOE LINE 6 | 120 | 49.98 and 14.80 | 1,800 |
| MOE LINE 7 | 120 | 49.98 and 15.60 | 2,100 |

These are attributed HTML values. RANONG MOE's historical capacity differs in the PDF. The crane is described as stationary at TCT Terminal 12, with a 200-ton SWL; confirm its current location and operating configuration. Its official registration is not an IMO number. The complete JSON retains the fields and missing values separately.

All seven English/Thai vessel table pairs agree. The transcription was checked against 195 detail fields and 62 listing fields. The seven PDFs were also rendered and visually compared; text extraction alone contained hidden duplicate fragments that were excluded from the interpreted data.

## Historical routes

The following figures are published on the [old route overview](https://www.moe-line.com/trading-routes/). They describe historical source content; they do not establish current availability, a sailing schedule, cargo acceptance, exact terminals or navigable geometry.

| Port pair described by endpoint rows | Distance in nautical miles | Sailing hours on overview | Capacity on overview |
| --- | ---: | --- | --- |
| Laem Chabang and Bangkok | 58 | 8–10 | 72–120 TEU |
| Laem Chabang and Surat Thani | 261 | 34–36; detail page says 8–10 | 72–120 TEU |
| Laem Chabang and Songkhla | 361 | 52–54 | 72–120 TEU |
| Ranong and Yangon | 459 | 65 | 72–120 TEU |
| Laem Chabang and Sihanoukville | 248 | 31–33 | 72–120 TEU |

The Surat Thani and Songkhla headings say BKK/LCB, but their endpoint rows specify Laem Chabang. Do not apply these figures to a separate Bangkok-origin service without confirmation. Ranong–Yangon and Laem Chabang–Sihanoukville cross national borders even though the old category calls them coastal routes.

Unused library maps also depict Laem Chabang connections with Mae Klong, Samut Sakhon and Bang Pakong, plus a Ranong–Chittagong connection. These are additional historical leads from `map1.jpg`, `map2.jpg`, `map4.jpg`, and `map9.jpg`; they have no accompanying confirmed timetable or capacity record. Their schematic lines should not be imported as route coordinates.

## Facts to reconcile before reuse

| Issue | Source observations | Consequence |
| --- | --- | --- |
| Company identity | Legacy pages, documents and registration 0105565067684 name Moe Container Line; current project names Moe Navigation | Preserve the current legal identity and verify the relationship before transferring legal history, directors, capital, affiliates or certificates. |
| Fleet count | Old site has seven vessels; current supplied fleet has eight including Dumai Moe | Keep all current vessels. |
| RANONG MOE history | Heading says RANONG MOE; detail and historical PDF say MOE LINE 1 with the same IMO/official registration | Match carefully; this is not proof of a legal rename. |
| RANONG MOE capacity | HTML says 96 TEU; homepage history and November 2024 PDF say 72 TEU | Retain both source observations until the current configuration is confirmed. |
| Reefer plugs | All six container HTML profiles say three; all six specification PDFs say five | Confirm each vessel before publishing the number. |
| Crane equipment | PDF distinguishes one Mitsubishi crane engine and two Airman generators; HTML labels machinery differently | Use the reviewed current equipment list. |
| Surat Thani sailing time | Both language overviews say 34–36 hours; both detail pages say 8–10 hours | Avoid publishing either as an agreed current passage time. |
| Map destination | Three links select Moe Container Line at 13.6679674, 100.4202937; another selects SSOT Group at 13.6685763, 100.4198339 | Preserve the selected pin coordinates, not the different map viewport coordinates; confirm Moe Navigation's intended location. |
| Compliance | DC-67-038 names Moe Container Line, issued 21 October 2024, printed end date 20 October 2029 subject to periodic verification; annual endorsement lines are blank in the supplied copy | The archived copy does not establish current compliance or a certificate for Moe Navigation. |
| Environmental and service guarantees | Comparative shipping/rail/truck graphic, zero damage/breakdowns wording and broad DG/bulk claims lack a stated methodology or current operating conditions | Use specific supported practices; avoid numerical environmental comparisons or guarantees until substantiated. |

The old site's home and About mission statements differ. Its Thai pages retain some English paragraphs and headings, and some Thai text needs proofreading. Preserve meaning through a fresh bilingual editorial pass instead of copying every paragraph literally.

The live current site already publishes `02 427 5905`, `md.assist@moe-navigation.com` and its Bang Bon office address. Keep those current settings. The older HTML's `kamon@ssotgroup.com` is an additional historical contact candidate, not a replacement email.

## Scope of the website comparison

Thirteen current production pages were retrieved successfully from `https://moe-navigation.com/`: Home, Fleet, Routes, About, Contact and all eight vessel detail pages. Every vessel detail states that specifications await verification and availability awaits confirmation. The comparison also inspected the repository's content models and publishing behavior. It did not read private CMS data or change production content. The live homepage and contact information are ahead of the seed files, so future work should start with the saved content rather than overwrite it with older defaults. Current Thai pages were not independently reviewed in this comparison; all corresponding legacy Thai corporate, vessel and route pages were captured.

Primary legacy sources: [Home](https://www.moe-line.com/), [About](https://www.moe-line.com/about-us/), [Fleet](https://www.moe-line.com/fleet-list/), [Routes](https://www.moe-line.com/trading-routes/), [Contact](https://www.moe-line.com/contact-us/), and their Thai equivalents. Individual source and download URLs are retained in the linked JSON files.
