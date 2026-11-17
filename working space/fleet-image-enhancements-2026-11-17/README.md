# Fleet photo enhancements

Open [index.html](index.html) to compare the seven source photographs with
14 selected enhancements. Each image opens at full size for inspecting small
painted lettering. The page works locally; no hosting is required.

The enhanced PNGs are AI-enhanced photographs, not documentary originals.
Original source files remain unchanged. Current vessel display names and
historical painted names are shown separately; no vessel rename is implied.

| Current vessel | Legacy painted identity | Neutral PNG dimensions | Warm PNG dimensions |
| --- | --- | --- | --- |
| RANONG MOE | RANONG MOE | [1448 × 1086](finals/ranong-moe/neutral.png) | [1448 × 1086](finals/ranong-moe/warm.png) |
| MOE 2 | MOE LINE 2 | [1614 × 974](finals/moe-line-2/neutral.png) | [1614 × 974](finals/moe-line-2/warm.png) |
| MOE 3 | MOE LINE 3 | [1614 × 975](finals/moe-line-3/neutral.png) | [1614 × 975](finals/moe-line-3/warm.png) |
| MOE 4 | MOE LINE 4 | [1672 × 941](finals/moe-line-4/neutral.png) | [1672 × 941](finals/moe-line-4/warm.png) |
| MOE 5 | MOE LINE 5 | [1614 × 975](finals/moe-line-5/neutral.png) | [1614 × 975](finals/moe-line-5/warm.png) |
| MOE 6 | MOE LINE 6 | [1614 × 975](finals/moe-line-6/neutral.png) | [1614 × 975](finals/moe-line-6/warm.png) |
| MOE 7 | MOE LINE 7 | [1672 × 940](finals/moe-line-7/neutral.png) | [1673 × 940](finals/moe-line-7/warm.png) |

Dimensions above are the actual saved pixel dimensions. The source inventory
contains 50 source files, including alternate crops/renditions: 35 files
mapped to seven vessels and 15 historical/unidentified files retained
separately. They are not 50 different camera views.

DUMAI MOE remains without a verified original photograph from the old website.
No replacement vessel or invented photograph was supplied for it.

- [Original source manifest](originals-manifest.json): URLs, mappings, dimensions and hashes.
- [Final enhancement manifest](final-manifest.json): the selected 14 files and output hashes.
- [Full generation prompts](generation-log.json): prompts and generated source paths, including superseded drafts.
- [PNG metadata checks](metadata-qa.json): generated-file metadata and decode verification.
- [Painted-name references](source-checks/painted-name-audit.json): verified character references and source crops.
- [Source collection notes](ORIGINALS.md): provenance and unassigned-source limits.

Metadata cleaning applies only to the generated final PNGs. Their decoded pixels
were verified unchanged from the selected generated inputs. Source originals
were not cleaned or re-encoded. No website assets, CMS records or database data
were changed by this delivery.
