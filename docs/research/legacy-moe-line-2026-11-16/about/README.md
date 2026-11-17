# About content review — 17 November 2026

Primary sources: [legacy About in English](https://www.moe-line.com/about-us/) and [Thai](https://www.moe-line.com/th/about-us/). The source names **Moe Container Line**, while the current company name is **Moe Navigation Co.,Ltd.** The draft retains the exact current name in both languages and uses the legacy page for operational themes and photographs.

The draft contains 189 English words across descriptions and the introduction body, with Thai counterparts. It covers marine transport, practical planning, safety priorities, vessel care, onboard work and shoreside coordination. It does not transfer the old entity's founding year, directors, registration, capital, bank, affiliations or certificate. Historical fleet counts, environmental comparisons, cargo-acceptance guarantees and zero-damage/breakdown claims are excluded. People in the pictures are described neutrally; the images do not establish their current employment.

## Narrow maintenance plan

Read-only inspection found `Page:about` at revision 6, `Section:about-intro` at revision 3, mission and vision at revision 1, and values at revision 2. The plan updates the first four records and inserts `about-safety`, `about-maintenance`, `about-crew` and `about-office`. It preserves `about-values`, unrelated fields and all current contact settings. Office details are read from current settings by the frontend. No Routes, Fleet or other collection records are included in the import filter or plan hash.

- Copy and original-image manifest: [legacy-about.ts](../../../../scripts/data/legacy-about.ts).
- Pure planner and edited-field baselines: [legacy-about-import-plan.ts](../../../../scripts/data/legacy-about-import-plan.ts).
- Read-only media preview, with separately reviewed staging: [prepare-legacy-about-media.mts](../../../../scripts/prepare-legacy-about-media.mts).
- Read-only content preview, with separately reviewed transactional application: [import-legacy-about.mts](../../../../scripts/import-legacy-about.mts).

Both scripts default to read-only mode. New media is staged through the existing upload workflow, with a fixed submission identity for retries. Source and Cloudinary delivery hashes must match. The content apply requires the exact reviewed plan hash, checks revisions and staged-image ownership, saves content/media/audit records in one transaction, and verifies exact readback and idempotence. Later edits to targeted fields require review. A canonical BSON Extended JSON backup is written before application; old images are retained.

The reviewed import was applied on 17 November 2026: four updates, four inserts and six image commits, with zero conflicts. Applied plan hash: `2d71f1259b970da63a4301746338e27e3d53f7da45e1302e92abbc10bebc8fd9`. The canonical BSON Extended JSON backup is `.local/legacy-about-import-2026-11-17/before-1794864154408.json`; `.local/legacy-about-import-2026-11-17/applied.json` records exact saved-record verification, preserved current contacts and successful idempotence checks. Deployment and browser verification are separate.

## Original photographs

The hero is an actual background of the legacy About page: its HTML links `post-13.css`, which references `sld-022.webp`. The five other photographs appear as page images. The certificate image `8884-scaled.webp` is excluded.

All six originals contain only a WebP `VP8 ` pixel chunk, with no EXIF, XMP, ICC or IPTC metadata. They are copied without pixel re-encoding. Hashes identify the complete original files, not just decoded pixels.

| Use and source | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| [Hero / sld-022.webp](https://www.moe-line.com/wp-content/uploads/2025/06/sld-022.webp) | 1920 × 1047 | 177,870 | `00ab71ccf564c828bdf3833c28ddcd5795c1d698cca5aea327c13e838555d4b9` |
| [Introduction / sld-015.webp](https://www.moe-line.com/wp-content/uploads/2025/06/sld-015.webp) | 2501 × 2560 | 303,212 | `1e6d0bfd58cd93f29a5fc124e699f3c549e82ee3ef2e00f852a9e209b454bf99` |
| [Safety / sld-026.webp](https://www.moe-line.com/wp-content/uploads/2025/07/sld-026.webp) | 1396 × 1047 | 135,666 | `085176a7434745daf0474d6a9887f41134161890ad6e6189bcbeddff21869c29` |
| [Maintenance / sld-023.webp](https://www.moe-line.com/wp-content/uploads/2025/06/sld-023.webp) | 1396 × 1047 | 107,468 | `255e137219244399ad380a91e6a94db726d30d9f8cc1f0fa6a478295ef3a8a55` |
| [Onboard team / sld-0231.webp](https://www.moe-line.com/wp-content/uploads/2025/08/sld-0231.webp) | 1396 × 1047 | 105,468 | `6c3437091194d9c96da74f1054fe4c1b66782d15ef99f67884cb1d64d52243e4` |
| [Shore coordination / sld-019.webp](https://www.moe-line.com/wp-content/uploads/2025/06/sld-019.webp) | 800 × 608 | 24,602 | `17976bb7b950b5fbc663f4e1dea0c110e30664288972302d3c271063026fba58` |

Original download paths and source evidence remain in [media-inventory.json](../media-inventory.json), [routes-company.json](../routes-company.json), and the ignored archive `.local/legacy-moe-line-2026-11-16`. Prepared media, saved-record inspection, dry-run plan and later apply report are under `.local/legacy-about-import-2026-11-17`.
