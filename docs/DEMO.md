# Demo handoff

## Pages and interactions

Thai is the default language at `/`; English uses the same page paths under
`/en`. Public pages cover Home, About, Services, Fleet, Shipping routes,
Projects, News, Contact and Privacy information. Services, vessels, projects
and news have detail pages. The language switch preserves the equivalent
page and query string.

Services uses a featured capability and supporting entries; Fleet uses
image-led vessel cards; Projects and News have separate featured and secondary
story layouts. Detail pages add context for enquiries while keeping unknown
company facts explicitly unverified. The shared MOE mark is a provisional
demo identity; replace it with the approved company logo and brand files when
those are supplied.

Fleet, project and news listings support search and category filters. Vessel
details include thumbnails, previous/next controls and a gallery dialog.
Seeded vessel galleries use different supporting scenes. New browser-created
vessels can open their single image without redundant gallery controls.
Seeded project and news details have distinct illustrative editorial copy;
editing a seeded description in the CMS replaces its sample story.
New or edited news records show no date unless a verified date is supplied
through a future content workflow. CMS categories accept an optional Thai
label, and custom vessel names and categories carry through Thai listings,
details and enquiry links.
The Routes page uses an interactive geographic map. Visitors can pan, zoom,
select a seeded destination on the map or in the route list, and return to
the regional view. The drawn connections and port coordinates are approximate
demo illustrations, not navigational tracks or live schedules.

The contact form validates input and saves an enquiry draft in this browser
only. It never sends an email or contacts an API. Enquiry links prefill the
subject. **Clear draft** removes the stored enquiry.

## CMS workflow

Open `/cms` on the same browser and origin as the public preview. This is an
English-language demo with no login or production access control.

1. Open the drawer to select Pages, Vessels, Services, Projects, News or Routes.
2. Add or edit a record, including English and Thai titles and descriptions.
3. Choose a generated image or prepare a JPEG, PNG or WebP from your device.
4. Select **Draft** or **Published**, then **Save locally**.
5. Open the website preview in the same browser. Published records appear;
   drafts and trashed records are excluded.

Image preparation happens in the browser before saving, tries WebP first,
and preserves proportions. Prepared device images are saved locally, not
uploaded to a media service. The demo accepts files up to 8 MB before
preparation and up to 2 MB after preparation; browser storage capacity can
still limit a save. Failed saves retain the editor input.

Deleted records move to Trash and can be restored for 30 days. Expired
records are excluded on read; the CMS reconciles saved storage on load and
while open. Local media remains available for other records.

Storage is specific to the browser and origin, including the port. It does
not synchronize across devices. Clearing site data removes local edits,
media and drafts; the built-in seed content then returns. Content records
use the `moe-content-v1` storage key; contact drafts use `moe-contact-draft`.

## Content and integration points

| File | Responsibility |
| --- | --- |
| `src/lib/content.ts` | Bilingual seed content, navigation, localized link helpers |
| `src/lib/demo-store.ts` | Demo record contract, local persistence, publication and Trash rules |
| `src/lib/use-demo-content.ts` | Published browser content consumed by public components |
| `src/lib/demo-stories.ts` | Distinct bilingual editorial examples for seeded detail pages |
| `src/components/Home.tsx` | Home sections and seeded Home Page content |
| `src/components/ContentPages.tsx` | Secondary pages, enquiry drafts, galleries and route selection |
| `src/components/InteractiveRouteMap.tsx` | Interactive geographic routes map and seeded port overlays |
| `src/components/CmsDemo.tsx` | Local content editor and media preparation |
| `src/app/[[...path]]/page.tsx` | Localized routes and server metadata |
| `src/app/globals.css` | Shared typography, colors, controls and responsive scaling |

The seeded Page IDs `home`, `about` and `services` update their corresponding
public sections. A new Page record needs a route and rendering integration
before it appears. New vessel, service, project and news IDs use the existing
detail-page route structure.
Unavailable detail IDs show a localized in-page state. Since the demo CMS
stores new records only in the browser, the server cannot distinguish every
new record from an unknown ID to return an HTTP 404; revisit this when
content moves to server persistence.

The seeded route IDs `laem-chabang-singapore`, `laem-chabang-port-klang` and
`laem-chabang-tanjung-priok` connect to the map. Additional published Route
records appear as enquiry cards; custom geographic paths are not invented.

When API details are supplied, replace the local store behind the shared
content contract with authorized server persistence. Connect contact
submission and media upload through server-side validation, keeping
credentials on the server. MongoDB and Cloudinary are the preferred project
defaults, pending the actual requirements. Production authentication,
retention, backup and media cleanup still need implementation.

Server-rendered metadata and the sitemap currently use seed content;
browser-only CMS changes do not rewrite them. Move content reads to the
server when connecting the production CMS. `NEXT_PUBLIC_SITE_URL` controls
the metadata base and defaults to `http://localhost:3005`. Set the real site
URL and review indexing rules before launch.

## Imagery

The 15 optimized WebP assets live in `public/images/`. They illustrate
fictional vessels and operations, rather than documenting this company.
Keep this distinction when replacing them with verified company media.
Home uses distinct images for its fleet, port connection and news feature;
other page crops are tuned to their layout without altering the source files.

- `docs/generated-images.json`: prompts, source references and optimization
  details for the thirteen service, fleet, operations and gallery images.
- `docs/hero-prompts.json`: prompts and source references for the desktop
  and portrait Home hero images.

The map uses OpenStreetMap standard tiles and displays its required
attribution. Tile delivery requires internet access and is a best-effort
external service. Before production launch, choose a suitable tile provider
for expected traffic and configure its URL and attribution under its terms.
Set `NEXT_PUBLIC_MAP_TILE_URL` and `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` if a
different tile service is chosen; the default is the OpenStreetMap standard
tile endpoint. The OpenStreetMap contributor credit remains visible.
The supplied `Design/` files remain design references rather than public
website images.

## Verification and remaining setup

The latest production build and production smoke check passed. The smoke
check covered **61 linked routes, 15 local images and 4 invalid routes**, plus
document languages, headings, localized metadata, shared navigation,
robots and sitemap. Re-run the commands in the README after changes;
HTTP smoke checks do not replace browser interaction and responsive review.
Browser review also covered the Routes map on desktop and at 390px and 320px,
including loaded tiles, attribution, Thai and English labels, route selection,
zoom, regional overview and keyboard marker activation. No horizontal
overflow was observed at 320px. Responsive browser review covered public
pages and the CMS at 320px, 390px, 768px and 1440px, with additional desktop
checks at 1920px. A 720px constrained viewport checked the layout at the
effective width of a 1440px window zoomed to 200%; native browser zoom was
not exercised. Thai and English page headings, mobile drawer focus, gallery
Escape behavior, filters, and the CMS create → publish → public preview →
draft flow were checked. New news and vessel records were verified in Thai,
including category filters and the absence of a fabricated news date. The
temporary QA records were returned to draft. Contact validation announces
errors and focuses the first invalid field. The mobile map leaves all seeded
port markers clear of its notice and allows page scrolling over the map.
Reduced-motion behavior follows the inspected CSS rules but was not emulated
in the browser.

The local image audit found 15 WebP assets between 117 and 265 KiB; the Home
hero uses a separate 177 KiB portrait image on narrow screens. This checks
asset weight and rendered behavior, not real-user Core Web Vitals. Measure
those again on the eventual production host and network.

Before launch, provide and verify company contact details, vessel ownership
and specifications, service scope, route availability, projects and news.
Connect authentication, database, media and contact delivery, and replace
the demo privacy notice with a policy that reflects the actual services.
All demo pages currently request **noindex, nofollow**, and `robots.txt`
disallows crawling.
