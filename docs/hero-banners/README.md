# Homepage banner media

The default carousel alternates a DUMAI MOE tanker clip, a dated MOE LINE 3 archive photograph, footage of the MOE LINE 4 crane barge, a DUMAI MOE anchorage photograph and an aerial view of a container terminal. Each silent video has a still poster from its first frame. The crops were checked at 3:1 and 16:9. Reduced-motion visitors can start the videos themselves.

On 25 November 2026 the published carousel used the owner's river approach, river bridge, MOE LINE 3 photograph, Ranong Port, DUMAI MOE and MOE LINE 4 selections, in that order. All five videos have 2560-pixel-wide desktop exports made from their original 4K footage. DUMAI MOE keeps its 2560 × 1152 crop and the other four are 2560 × 1440. At viewport widths up to 700 pixels, the three uploaded clips use 1280 × 720 renditions and the two bundled clips use their existing 1920-pixel versions. The CMS stores one selection per clip.

| Edited video | Owner source | Source interval |
| --- | --- | --- |
| DUMAI MOE | `24.08.26/DJI_20260824114926_0010_D.MP4` | 00:00.8–00:10.8 |
| MOE LINE 4 | `06 Oct 2023/DJI_0292.MP4` | 00:03–00:13 |
| Container terminal | `07 Oct 2023/DJI_0329.MP4` | 00:03–00:13 |

The earlier camera delivery included duplicate files, alternate JPEG edits, flight subtitles and proxy videos. Its March 2025 residential flight was excluded. The public exports omit GPS metadata, flight subtitles and the source audio. The missing `DJI_0324.JPG` was represented by a download-error notice. Source filenames and hashes for all 19 selected stills are in the [media manifest](../../scripts/data/media-manifest.json).

## Earlier optional banners

The homepage uses real company photographs in response to the November 2026 homepage revision brief. Five optional CMS banners have a 3:1 desktop crop and a separately framed 1024 × 576 mobile crop. The following source files identify the exact frames used. Archived paths are relative to `working space/fleet-image-enhancements-2026-11-17/originals/`.

| Vessel | Photograph source |
| --- | --- |
| MOE LINE 3 | `moe-line-3/asdsadsadsa4545.webp`, coastal container operation |
| MOE LINE 4 | Photograph embedded in the client's `ML 4 - PARTICULAR.pdf`, crane barge at the terminal |
| MOE LINE 5 | `moe-line-5/moe-5.webp`, container vessel at sea |
| RANONG MOE | `ranong-moe/ranongmoe.webp`, vessel alongside the quay |
| MOE LINE 7 | `moe-line-7/moe-7new.webp`, laden vessel from the side |

The five original bundled banner addresses resolve to their photographic replacements in saved slide selections. One previously uploaded wider version of the MOE LINE 3 photograph also resolves to its archived original. Custom image and video selections retain their URLs and order.

The client sheets remain the source of particulars for DUMAI MOE and MOE LINE 4, 5 and 6. Eight owner photographs now illustrate DUMAI MOE, replacing the earlier 391 × 253 sheet photograph on the public profile. Four new views of MOE LINE 4 complement its two earlier photographs. The 2023 photographs of MOE LINE 1 and 3 are identified as archive material on About and the homepage.

## Archived October artwork

The following notes and original generation manifest document the former illustrative banners.

Created on 31 October 2026 with the built-in `image_gen` tool, using one generation call for each of five separate images. No API fallback was used.

The images are illustrative, fictional maritime scenes. They are not evidence of Moe Navigation vessel ownership, port ownership, fleet specifications, or service locations.

| Banner | Retired asset address | Dimensions | WebP size |
| --- | --- | --- | --- |
| Open water at sunrise | `/images/hero/01-open-water.webp` | 2172 × 724 | 366,546 bytes |
| Harbor tug | `/images/hero/02-harbor-tug.webp` | 2172 × 724 | 363,504 bytes |
| Blue-hour port | `/images/hero/03-blue-hour-port.webp` | 2172 × 724 | 287,678 bytes |
| Ocean carrier | `/images/hero/04-ocean-carrier.webp` | 2172 × 724 | 459,082 bytes |
| Coastal passage | `/images/hero/05-coastal-passage.webp` | 2172 × 724 | 235,734 bytes |

All sources are exactly 3:1. Their full ship silhouettes and principal subjects fit within the center of the composition. On mobile, a centered 16:9 container with `object-fit: cover` retains 59.259% of the source width and removes 20.370% from each side. The sources require no separate mobile artwork or vertical crop.

All five generated outputs were visually inspected at full width. Main vessels remain within the mobile-safe center. The blue-hour port retains the docked ship and three principal cranes. Surrounding sea, sky, and peripheral port structures form expendable side areas.

The historical generation manifest records the original prompts, source paths, dimensions and file sizes. The public directory contains the verified company banner photos only.

## Homepage and CMS integration

The homepage now starts with a full-width 3:1 banner, with centered headline, description, and actions underneath. At widths up to 700px the banner becomes 16:9 by removing the left and right edges. Motion provides the crossfade and CMS card reordering. The slider shows centered slide indicators, with keyboard navigation, mouse dragging, touch swipes, and reduced-motion preferences. Drag left for the next image or right for the previous image. Hover and dragging pause the timer on still images. Autoplay resumes with a fresh interval when the pointer leaves, including after selecting or dragging a slide; touch interactions resume after release. Keyboard navigation also pauses that timer until focus leaves the slider. Short movements do not change slides, and vertical touch scrolling and pinch zoom remain available. Video banners play silently inline. When a clip finishes, it crossfades directly to the next slide, including from the last slide back to the first. Visitors who prefer reduced motion can choose Play on the poster. When that clip finishes, the next slide appears without animation. Play is also available if the browser blocks autoplay.

Manage the slides at `/cms/slides` (CMS → Homepage slides). The page uses one main column with multiple slide cards per row when space allows. Drag cards within or between rows to reorder, add a device image or video, or choose saved media from the library, and save. Each card shows the full banner thumbnail; open the public homepage to check its mobile crop. The default interval is three seconds and can be adjusted from two to fifteen seconds. Included banners remain available in the image picker after removal. The manager preserves unsaved work during CMS navigation and same-account session recovery.

The homepage record stores the slide list and timing. When it has no saved slides, visitors see the five owner banners described above. The two stills have separately framed 1024 × 576 mobile versions.

## Verification — 31 October 2026

- Backend: 257 tests passed.
- Lint, TypeScript, and production builds passed.
- 75 distinct browser scenarios verified across Chromium, Firefox, and WebKit, using the full affected suite and focused reruns. Coverage includes responsive cropping, three-second and saved-interval autoplay, reduced motion, one/twelve slides, keyboard/touch controls, drag ordering, saves, conflicts, interrupted responses, session recovery, and existing page editing.
- Browser tests used an isolated local database with live provider credentials disabled. English and Thai desktop/mobile screenshots were inspected.
- Local implementation only; no deployment or production content changes were made.

The subsequent CMS layout revision removes the standalone preview panel and uses responsive rows of image cards within one main column. All 27 affected CMS browser scenarios passed across Chromium, Firefox, and WebKit, including horizontal/cross-row dragging and 320px/390px English/Thai layouts. Scoped lint, TypeScript, and the production build also passed.

Review the [desktop homepage](../screenshots/hero-en-desktop-chromium.png), [mobile homepage](../screenshots/hero-en-mobile-390-chromium.png), [desktop slide manager](../screenshots/cms-slides-desktop-chromium.png), and [Thai mobile slide manager](../screenshots/cms-slides-mobile-th-chromium.png). Complete generation prompts are in [manifest.json](manifest.json).
