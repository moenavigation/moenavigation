# Recovered fleet originals

The source files are unchanged. `originals-manifest.json` records source URLs,
current/legacy name mappings, pixel dimensions, local paths and SHA-256 hashes.
It covers 50 distinct source files: 35 mapped to seven current vessels and 15
retained separately as historical or unidentified. These include alternate
full-size crops/renditions; they are grouped into photo families rather than
counted as different camera views. Responsive thumbnails, exact duplicate
files and scaled versions with recovered larger originals are excluded.

| Current vessel | Preferred source in originals/ | Dimensions |
| --- | --- | --- |
| RANONG MOE | ranong-moe/ranongmoe.webp | 1920x1440 |
| MOE 2 | moe-line-2/fleet-moe-2.webp | 1920x1159 |
| MOE 3 | moe-line-3/fleet-moe-3.webp | 1920x1159 |
| MOE 4 | moe-line-4/sld-0233.webp | 1280x720 |
| MOE 5 | moe-line-5/moe-5.webp | 1920x1159 |
| MOE 6 | moe-line-6/moe-6new.webp | 1920x1159 |
| MOE 7 | moe-line-7/nbnb2.webp | 1919x1079 |

The 35 mapped files include six original JPEG streams from the matching
particulars PDFs. The seventh PDF photo is historical MOE LINE 1 and is retained
in `_historical-moe-line-1`, without a confirmed current photographed-hull
assignment. That folder and `_unassigned-vessels` must not be used as a current
vessel photograph without further identity confirmation.

The 3392x3472 MOE 5 bow photographs `banner-0014.webp` and `mewim.webp` were
recovered through the public WordPress original-image metadata. They are useful
for reading the original lettering; they are alternate renditions of the same
photo family.

The full public media library was checked again on 17 November 2026: 159 records,
two pages, with no new IDs or source-URL changes from the archive. The live
`dumai` media search returned no records. No verified DUMAI MOE photograph was
found in the old seven-vessel listing or inspected media; generic ships and
the office's tanker models were not assigned to DUMAI MOE.

See `source-checks/painted-name-audit.json` and `painted-name-crops` for the
source lettering. Painted MOE LINE names must not be replaced by the shorter
current CMS display names. Inspection crops are reference aids, not enhanced
deliverables. No live records, public website assets or generated outputs were
changed during this collection.
