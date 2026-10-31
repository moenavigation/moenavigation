# Homepage banner artwork

Created on 31 October 2026 with the built-in `image_gen` tool, using one generation call for each of five separate images. No API fallback was used.

The images are illustrative, fictional maritime scenes. They are not evidence of Moe Navigation vessel ownership, port ownership, fleet specifications, or service locations.

| Banner | Public asset | Dimensions | WebP size |
| --- | --- | --- | --- |
| Open water at sunrise | `/images/hero/01-open-water.webp` | 2172 × 724 | 324,744 bytes |
| Harbor tug | `/images/hero/02-harbor-tug.webp` | 2172 × 724 | 322,340 bytes |
| Blue-hour port | `/images/hero/03-blue-hour-port.webp` | 2172 × 724 | 261,014 bytes |
| Ocean carrier | `/images/hero/04-ocean-carrier.webp` | 2172 × 724 | 408,470 bytes |
| Coastal passage | `/images/hero/05-coastal-passage.webp` | 2172 × 724 | 204,504 bytes |

All sources are exactly 3:1. Their full ship silhouettes and principal subjects fit within the center of the composition. On mobile, a centered 16:9 container with `object-fit: cover` retains 59.259% of the source width and removes 20.370% from each side. The sources require no separate mobile artwork or vertical crop.

All five generated outputs were visually inspected at full width. Main vessels remain within the mobile-safe center. The blue-hour port retains the docked ship and three principal cranes. Surrounding sea, sky, and peripheral port structures form expendable side areas.

Original PNGs are preserved under `output/hero-banners/originals/`. The public WebP copies were converted with `sharp`, quality 88, without resize, crop, compositing, or color changes. `manifest.json` contains the complete prompts, source paths, dimensions, file sizes, and suggested English/Thai alt text. `prepare-assets.mjs` records the reproducible format-conversion step.

## Homepage and CMS integration

The homepage now starts with a full-width 3:1 banner, with centered headline, description, and actions underneath. At widths up to 700px the banner becomes 16:9 by removing the left and right edges. Motion provides the crossfade and CMS card reordering. The slider supports pause/play, previous/next, slide indicators, keyboard navigation, touch gestures, and reduced-motion preferences.

Manage the images at `/cms/slides` (CMS → Homepage slides). The page uses one main column with multiple image cards per row when space allows. Drag cards within or between rows to reorder, upload an image or choose from the library, and save. Each card shows the full banner thumbnail; open the public homepage to check its mobile crop. The default interval is three seconds and can be adjusted from two to fifteen seconds. Included banners remain available in the image picker after removal. The manager preserves unsaved work during CMS navigation and same-account session recovery.

The slide list and timing are stored on the existing homepage record. Missing slide settings use the five included images, so existing home copy is preserved and no migration or live-data write is required.

## Verification — 31 October 2026

- Backend: 257 tests passed.
- Lint, TypeScript, and production builds passed.
- 75 distinct browser scenarios verified across Chromium, Firefox, and WebKit, using the full affected suite and focused reruns. Coverage includes responsive cropping, three-second and saved-interval autoplay, reduced motion, one/twelve slides, keyboard/touch controls, drag ordering, saves, conflicts, interrupted responses, session recovery, and existing page editing.
- Browser tests used an isolated local database with live provider credentials disabled. English and Thai desktop/mobile screenshots were inspected.
- Local implementation only; no deployment or production content changes were made.

The subsequent CMS layout revision removes the standalone preview panel and uses responsive rows of image cards within one main column. All 27 affected CMS browser scenarios passed across Chromium, Firefox, and WebKit, including horizontal/cross-row dragging and 320px/390px English/Thai layouts. Scoped lint, TypeScript, and the production build also passed.

Review the [desktop homepage](../screenshots/hero-en-desktop-chromium.png), [mobile homepage](../screenshots/hero-en-mobile-390-chromium.png), [desktop slide manager](../screenshots/cms-slides-desktop-chromium.png), and [Thai mobile slide manager](../screenshots/cms-slides-mobile-th-chromium.png). Complete generation prompts are in [manifest.json](manifest.json).
