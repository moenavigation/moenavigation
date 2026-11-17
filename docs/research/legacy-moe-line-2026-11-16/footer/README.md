# Footer figures

The requested XPath `/html/body/div[3]/section/div/div/div/section[1]/div/div[2]/div`
on [the legacy homepage](https://www.moe-line.com/) is the four-counter block.
Archived HTML was inspected directly on 17 November 2026. The visible zeroes are
animation starting values; the HTML `data-to-value` attributes contain:

| Legacy label | Reported target value |
| --- | --- |
| Our Fleet | 7 |
| Annual Carried Volume | 15,559 |
| Skilled Crew | 89 |
| Annual Voyages | 1,119 |

The old site's figures do not identify a year or a unit for annual carried volume.
The user subsequently confirmed that all four figures should be visible, using
the source values. The current company has eight saved vessels, including DUMAI
MOE, so the new footer uses **Fleet: 8**, **Annual Carried Volume: 15,559**,
**Skilled Crew: 89**, and **Annual Voyages: 1,119**. No year or volume unit was added.
Blank values can still be used by future editors to hide a statistic.

Edit the four bilingual labels, displayed values, and heading under
CMS → Pages → Shared website content → Footer and statistics. A blank value
hides its item. The existing footer text, contacts, brand and company name are
preserved. Statistics save with the same revision checks, audit and cache refresh
as normal page edits. The new array is optional and belongs only to `shared/footer`.

`scripts/import-footer-statistics.mts` previews the narrow change by default.
Apply requires the exact reviewed plan hash, saves a backup, checks the footer
and vessel revisions, updates only the footer, and verifies that fleet records
and all unrelated footer fields are unchanged. It also repairs the exact earlier
imported defaults (Our Fleet: 8 and the other three values blank) to the approved
four figures and Fleet label. Any independently edited statistic, including an
intentionally empty array, is preserved rather than overwritten. An identical
replay is a no-op.
