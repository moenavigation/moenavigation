# Legacy fleet research

## Current source policy: PDFs take priority

On 17 November 2026, the user selected the vessel particulars PDFs as the main source, superseding the earlier consensus-only import below. The seven complete rendered sheets were checked again. Their dimensions, tonnage, IMO numbers, visible build years and flag agree with the earlier import. RANONG MOE now uses the PDF's **72 TEU**, and all six container vessels use **5 reefer plugs** each. No other technical values changed. Missing MOE 4 fields remain absent; DUMAI MOE has no matching sheet and stays unchanged.

All eight recovered original PDFs were copied to `C:\Coding\2026\00-Files\moe-navigation\PDF`: `MOE-LINE-1-PARTICULAR.pdf` through `MOE-LINE-7-PARTICULAR.pdf`, plus `DOC-Document-of-Compliance.pdf`. Every destination file was verified byte-for-byte by SHA-256 against the archived original. The compliance document is retained as a source file; it supplies no additional vessel measurements.

The current mapping in `scripts/data/legacy-vessel-particulars.ts` marks each vessel's primary source as `pdf` and supplies 91 supported particulars in total. The configured CMS database received the seven additional capacity values in a revision-checked transaction with a pre-update backup and system audit events. Exact read-back checks confirmed the saved values, unchanged unrelated content and idempotency. The PDF-policy plan, backup, saved-file manifest and applied report are under `.local/legacy-vessel-pdf-import-2026-11-17/`.

PDF-policy validation: all 11 focused import/seed tests passed. Browser checks verified the nominal and reefer capacities of all eight named vessels in English and Thai across Chromium, Firefox and WebKit (3 cases). The isolated production build, app/import type checks and scoped ESLint passed. The earlier live public-cache refresh remains pending a valid CMS sign-in; no code deployment was made.

## Initial consensus import on 17 November 2026

This section records the earlier import before the user chose PDF precedence; its capacity blanks were subsequently filled as described above.

At the user's request, the consistent legacy particulars were saved to the seven matching current CMS records. Current English/Thai names, URL IDs, categories, photos, copy and ordering were preserved. RANONG MOE was matched to the old MOE LINE 1 sheet by the shared IMO 1091434 and official registration; MOE LINE 2–7 map to the existing MOE 2–7 records. DUMAI MOE has no matching source and was left unchanged.

| Current vessel | LOA / breadth / depth / draft (m) | Nominal TEU | GRT / NRT / DWT / DWCC |
| --- | --- | ---: | --- |
| RANONG MOE | 63.00 / 13.60 / 5.30 / 3.59 | — | 1419 / 741 / 2088 / 1800 |
| MOE 2 | 49.98 / 12.80 / 4.50 / 3.85 | 72 | 835 / 505 / 1590 / 1550 |
| MOE 3 | 49.98 / 12.80 / 4.20 / 3.20 | 72 | 760 / 464 / 1290 / 1250 |
| MOE 4 | 55.00 / 19.00 / 4.00 / — | — | 1329 / — / — / — |
| MOE 5 | 49.98 / 14.80 / 4.92 / 3.52 | 120 | 1163 / 651 / 1800 / 1750 |
| MOE 6 | 49.98 / 14.80 / 4.62 / 3.35 | 120 | 1047 / 592 / 1800 / 1750 |
| MOE 7 | 49.98 / 15.60 / 5.40 / 3.90 | 120 | 1266 / 687 / 2100 / 2050 |
| DUMAI MOE | — / — / — / — | — | — / — / — / — |

All reefer-plug values remain blank: the six container-vessel HTML pages say 3 and their PDFs say 5; the crane and tanker have no supported value. RANONG MOE nominal capacity remains blank because the HTML says 96 TEU and its PDF says 72. MOE 4's missing particulars, including IMO, remain absent; its official registration was not put into the IMO field. Supported IMO numbers, visible build years and bilingual Thai flag-state labels were included. Hidden stale PDF text was not treated as visible source data.

The seven current PDFs were fetched again and their hashes match the visually inspected archive. Fresh detail-page checks confirmed the reviewed technical values. The exact import mapping and per-field blank reasons are in `scripts/data/legacy-vessel-particulars.ts`; the existing seed data uses the same reviewed mapping.

The configured database import added 84 fields in one revision-checked transaction with seven system audit events. A complete pre-import fleet backup and the verified result are under `.local/legacy-vessel-import-2026-11-17/`. Read-back checks confirmed exact saved values, unchanged unrelated fields and DUMAI record, and zero changes on a repeated plan. The import script defaults to a read-only plan and requires its exact hash for writes.

Validation: 351 backend tests and 30 Chromium/Firefox/WebKit browser cases passed, including both languages, five screen widths, missing-value display and CMS persistence. Production-build and focused lint/type checks passed. Code was not deployed. The attempted live-cache refresh could not authenticate with the saved CMS credentials (HTTP 401); browser session inspection then stopped because Computer Use could not verify the current browser URL. A valid CMS sign-in is still required for the live-cache refresh.

Research date: 16 November 2026. This is a source inventory for the current Moe Navigation project, not a current fleet register or an instruction to overwrite CMS data. The old website identifies its operator as Moe Container Line; the relationship to the current Moe Navigation entity needs to stay explicit.

`fleet-data.json` retains the seven legacy vessel records, their source URLs, all recovered technical fields and the primary photo link. Values are published claims from the old website, not independently checked vessel certificates. Source decimal precision and missing values are preserved.

## What was recovered

| Legacy vessel heading | IMO / official registration | Nominal TEU | LOA × breadth (m) | DWT | Built |
| --- | --- | ---: | --- | ---: | --- |
| RANONG MOE | IMO 1091434 / 5300-02061 | 96 | 63.00 × 13.60 | 2,088 | 2010, Thailand |
| MOE LINE 2 | IMO 8359184 / 660000333 | 72 | 49.98 × 12.80 | 1,590 | 2008, China |
| MOE LINE 3 | IMO 8359172 / 660000765 | 72 | 49.98 × 12.80 | 1,290 | 2011, China |
| MOE LINE 4 | Official 4800-00377; no IMO supplied | — | 55.00 × 19.00 | — | 1988, Japan |
| MOE LINE 5 | IMO 1042457 / 670000335 | 120 | 49.98 × 14.80 | 1,800 | 2009, China |
| MOE LINE 6 | IMO 1042469 / 670000953 | 120 | 49.98 × 14.80 | 1,800 | 2006, China |
| MOE LINE 7 | IMO 1065837 / 670001551 | 120 | 49.98 × 15.60 | 2,100 | 2003, China |

The individual detail pages add registration, call sign, MMSI where supplied, class wording, build country/year, LBP, DWCC, engine and generator models, consumption at stated RPM, speed and tank capacities. These are the most useful additions beyond the basic listing. MOE LINE 4 instead has crane and generator details, four anchor points, four winches and a published 200 tons SWL.

The legacy composition is six container vessels plus one crane barge, seven listed vessels in total. It is not seven container vessels. The listing locates the crane at TCT Terminal 12 and mentions feeder connections with Laem Chabang, Bangkok, Mae Klong, Samut Sakhon and Bang Pakong. Those mentions are coverage context, not a complete published schedule or verified route geometry. The current project has newer fleet material, including DUMAI MOE, which is absent from this old list and must be preserved.

## Important conflicts and limits

- RANONG MOE is the page heading, while its general-details name is MOE LINE 1. Match by stable identifiers and review the historical name; do not create two vessels from these names.
- The homepage's historical paragraph calls the first MOE LINE 1 a 72 TEU vessel. RANONG MOE's listing and detail say 96 TEU. A historical configuration or editing error is possible; the source does not settle it.
- The recovered MOE LINE 1 particulars PDF, visibly dated 12.11.24, also states 72 TEU. All six container-vessel PDFs state **five reefer plugs**, while the six matching HTML vessel details and listing entries state **three**. Neither source alone settles the current configuration.
- MOE LINE 4's PDF identifies a Mitsubishi S6A2 MPTA 470PS **crane engine** and **two** Airman SDG 125 S 235 KVA generators. HTML labels the Mitsubishi as GEN 1 and lists one Airman as GEN 2. The PDF is a useful source for correcting that equipment classification after review.
- The fleet listing and recovered details agree on the shared dimensions, nominal capacities, reefers and tonnage. Detail-only LBP and machinery still need normal operational review.
- MOE LINE 4's official registration must not be stored in an IMO field. It has no published draft, DWT, container capacity, call sign or MMSI in the recovered detail.
- `TG` and the MOE LINE 5 phrase `TG ( DANGEROUS GOOD )` are retained as written; do not expand them into a current certification or unrestricted dangerous-goods acceptance claim.
- GRT/NRT are the source's labels. Confirm certificate terminology before converting them to GT/NT; tonnage and deadweight are different quantities.
- Fuel consumption at one stated engine RPM does not support a comparative emissions claim. The source does not clarify whether engine consumption is per engine or combined.
- Listed 7-knot speeds and 200-ton SWL are legacy specification values, not guaranteed passage times or approved lifting plans.
- Footer statistic counters appear as zero or partial animation values in text extraction. The direct HTML supplies animation targets of 7 vessels, 15,559 annual carried volume, 89 skilled crew and 1,119 annual voyages. The reporting year, carried-volume unit and evidence are not supplied, so keep these as legacy-published figures pending confirmation.

## Reuse in the current website

1. Match existing records by IMO or official registration, preserving current names, slugs, photos, approved Thai copy and additional vessels.
2. Add an expandable technical specification section, grouped into identity, dimensions, cargo capacity/tonnage, machinery and tanks. Crane records should show crane specifications instead of empty container fields.
3. Keep an immediately scannable card with vessel type, nominal TEU or crane capacity, LOA, DWT where available and a named enquiry action.
4. Use vessel-specific enquiry context so the contact form starts with the selected vessel; let the client confirm availability, reefer requirements and dangerous-goods acceptance.
5. Use the seven legacy images as a recovery source only after checking the current higher-quality assets, rights and actual vessel identity. Do not replace newer gallery photos automatically.
6. Provide reviewed bilingual specification downloads from approved current data. Seven existing one-page ship-particulars PDFs were recovered through the public media API; reconcile their 2024 values and conflicts before reusing them. Their discovery URLs, version dates and comparisons are recorded in `pdf-particulars.json`.

## Sources and coverage

- English and Thai listings: <https://www.moe-line.com/fleet-list/> and <https://www.moe-line.com/th/fleet-list/>.
- All seven detail URL pairs are recorded in `fleet-data.json`.
- Both listings and all fourteen individual detail pages were fetched directly with HTTP 200 on the research date and retained in `.local/legacy-moe-line-2026-11-16/records`, with corresponding HTML and readable text in the same archive. This resolves the earlier web-tool cache misses and English RANONG MOE timeout.
- A final comparison checked all 195 unique technical fields in this JSON against the direct detail tables, with no substantive discrepancies. Some source equipment strings contain repeated spaces; this JSON normalizes that whitespace. RANONG MOE's direct English and Thai details both still omit MMSI and LBP.
- The English and Thai technical table arrays are identical for all seven vessels. The two listing table arrays are also identical; all 62 listing table fields agree with their corresponding detail tables after whitespace and label-case normalization. Thai pages translate section labels while retaining the technical table labels and values in English.
- All seven primary photo links appear in their direct page snapshots and were downloaded with HTTP 200. Local paths, hashes and file sizes are recorded in the parent `media-inventory.json`; the archive holds the files under `.local/legacy-moe-line-2026-11-16/assets`.
- No `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.csv` or `.zip` document links were found in any of the seven English detail-page link sets. This is a link inventory of the fetched pages, not an exhaustive search of the old host.
- The subsequent public-media-library inspection recovered **seven** PDFs named `MOE-LINE-1-PARTICULAR.pdf` through `MOE-LINE-7-PARTICULAR.pdf`, all downloaded with HTTP 200. Every PDF has one page. All seven were text-extracted and the complete Poppler-rendered pages visually inspected; the interpreted differences are in `pdf-particulars.json`. The rendered pages are retained under `.local/legacy-moe-line-2026-11-16/pdfs`.
- These particulars are visibly dated 5 June 2024 and 11-13 November 2024. Their legal footer supplies **Moe Container Line Co.,Ltd.**, Thailand register number **0105565067684**, and a longer Bang Bon office address. This does not establish that the current Moe Navigation legal entity has the same registration.
- Some PDF text layers contain invisible remnants such as `BUILT 2008` for vessels whose rendered built years are 2011, 2009, 2006 and 2003. Visual review confirms the visible years agree with HTML; the stray text is recorded as an extraction artifact and is not imported as another specification.

Primary public detail sources: [RANONG MOE](https://www.moe-line.com/th/fleet-list/ranong-moe/), [MOE LINE 2](https://www.moe-line.com/fleet-list/moe-line-2/), [MOE LINE 3](https://www.moe-line.com/fleet-list/moe-line-3/), [MOE LINE 4](https://www.moe-line.com/fleet-list/moe-line-4/), [MOE LINE 5](https://www.moe-line.com/fleet-list/moe-line-5/), [MOE LINE 6](https://www.moe-line.com/fleet-list/moe-line-6/), [MOE LINE 7](https://www.moe-line.com/fleet-list/moe-line-7/).
