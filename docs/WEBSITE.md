# Website experience and content boundaries

The website has a working MongoDB and Cloudinary backend. The client supplied
eight vessel names and types; project examples, generated vessel imagery, and
other unverified company details remain illustrative until the business
confirms the final content. See [BACKEND.md](BACKEND.md) for
configuration, administration, uploads, enquiries, and verification commands.

## Interim published content

Existing Project, News, and Route records remain public while approved
materials are gathered. Their generic descriptions avoid claiming completed
company projects, reported events, live schedules, or confirmed service
availability. The records and images are still illustrative, and route lines
are approximate rather than navigation guidance. Replace them through the CMS
when verified material is supplied. Their continued visibility does not
approve the content for indexing.

## Public pages

English is the default public language at `/` and unprefixed paths; Thai
uses equivalent paths under `/th`. The language switch preserves the
equivalent page, query string and section anchor. A public-language cookie
remembers explicit switcher selections for one year: a saved Thai preference temporarily
redirects a new homepage visit from `/` to `/th`, while explicit deep links
keep their requested language. Legacy `/en` URLs permanently redirect to the
corresponding unprefixed English URLs. Preference redirects are private and
uncached; public content continues to use the existing rendered-page cache.
Public sections include Home, About, Services, Fleet, Routes, Projects,
News, Contact, and Privacy. Services, vessels, projects, news, and additional
published Pages have detail routes.

Services uses a featured capability and supporting entries. Fleet uses
image-led vessel cards; Projects and News have featured and secondary story
layouts. Listings support search and category filters. Fleet, News and Projects
keep these filters in the URL for reloads, sharing, language changes and return
links from detail pages. Search matches English and Thai text together.
Home and Routes share an interactive map and route list using the same published
CMS route data. Home keeps its selection within the page; `/routes` keeps the
selected route in its URL for reloads and language changes. The homepage waits
until the map approaches the viewport before loading the map library and tiles.
Vessel galleries read their images and bilingual descriptions from MongoDB; a
vessel with one image opens that image without redundant gallery controls.

The CMS stores bilingual titles, descriptions, longer text, image
descriptions, categories, and optional supplied dates. Published records are
read on the server and used consistently by the page, metadata, and sitemap.
Public pages are generated on their first visit and cached. Public database
reads share a cached published snapshot, with a daily refresh as a fallback.
Successful CMS saves, Trash/restore, website-detail updates and recovered saves
expire this cache immediately; the next request rebuilds the affected output.
Both languages, metadata, sitemap and previously missing URLs refresh together.
The CMS route, authentication and enquiry APIs remain dynamic and private.

Each public page receives only its required records. Listing cards omit long
bodies, galleries and vessel specifications; detail views retain them. Browser
filters and language links keep their query state after hydration, while the
cached HTML already contains the main content for readers and search engines.
Public links load destinations when selected, avoiding automatic downloads of
every visible menu or card destination in the background.

After a direct database import/restore outside the CMS API, refresh published
content with a same-origin, administrator-authenticated POST to `/api/cms/cache`
or clear the deployment's data and route caches. A normal CMS save also refreshes
them. Use Next's persistent cache support in production (Vercel provides it);
multiple self-hosted instances need a shared cache/invalidation configuration.

The CMS uses one Save action that makes content public immediately. Historical
unpublished records are preserved until explicitly saved. Missing, historical
unpublished, and trashed detail records return HTTP 404.

All nine main Page records remain published and control their page headings,
summaries, and longer copy. Section records control homepage and company
sections, shared calls to action, footer copy, and privacy text. Existing
custom published Pages retain their own routes. CMS users edit the copy and
images of existing Pages and Sections; they cannot create or delete these
records, reparent them, or change their layout order.

Business copy, article bodies, gallery lists, route ports, coordinates, and
media URLs are stored in MongoDB. Public components never fall back to local
seed data or local photography. Missing Sections are omitted. Cached published
content can continue to serve during a database outage; an uncached read failure
reaches the retry screen rather than substituting sample content.
Navigation, field labels, validation messages, and factual preview notices
remain application UI text.

Lower display-order numbers appear first in listings, value groups, and
additional Sections; an omitted order is treated as zero. Equal values retain
the server's identifier order. The migrated records preserve their original
sequence. Established Section identifiers occupy designed template positions.
Additional Sections render under their saved parent; generic `shared` Sections
render once before the footer on all public pages. CMS editing preserves
these relationships and positions. A historical unpublished or trashed
Section stays hidden until explicitly saved or restored.

## Contact and privacy

The public contact form validates in the browser and on the server. After
consent and successful submission, the enquiry is stored in MongoDB and
appears in the authenticated CMS inbox. Retrying the same submission does
not create duplicate enquiries. Failed requests keep the visitor's input
available for another attempt.

A restored draft keeps its custom subject when a service link suggests a
different one; **Use this subject** applies the suggestion explicitly. The
browser retains the same submission identifier for an unchanged draft after
an interrupted request, so retrying after reload or a language change remains
safe. Consent must be checked again after restoring a draft.

Enquiries are delivered to the CMS inbox. No email notification provider is
connected. Local drafts remain a browser convenience and are distinct from
submitted enquiries; clearing a draft does not delete a submitted message.

The company name, office address, and phone number supplied by the owner are
saved in Website details. The public email and office map link remain
unconfigured; the final privacy policy and a business retention policy still
require verification. Website details saved in the CMS populate bilingual
company names, addresses, phone/email links, and the office map link. The site
describes its current data handling without inventing contact destinations or
claiming email delivery.

## CMS

The Thai/English CMS at `/cms` requires an administrator sign-in. The Dashboard
uses `/cms` and shows a website overview with task shortcuts. Pages, Fleet,
Routes, Projects, Services and News use their matching `/cms/<view>` paths.
Pages presents page cards; selecting one shows its introduction and existing
text/image areas in website order. Shared/footer content has a separate group.
Sections are managed within this page workflow; `/cms/sections` is removed.
Collection links on relevant pages open their searchable item lists, where
adding collection items remains available. Enquiries, Trash and Settings use
`/cms/enquiries`, `/cms/trash` and `/cms/setting`; the media library uses
`/cms/media`, and Administrators uses `/cms/users`. The former `/cms/account`
URL redirects to `/cms/setting`. These URLs support direct loading, refresh and browser history
while preserving unsaved workspace state during in-app navigation. Content
editors remain dialogs within the current view.

Thai is the default; the language selector remembers the choice in this browser.
Switching the interface language preserves open editors and unsaved input.
English and Thai website content remain separate editable fields. Its
menu opens as an edge drawer. It provides searchable collection lists,
bilingual editors, image preparation, 30-day Trash and restore, a media
library, enquiries, website settings, and administrator tools. Page editors
hide technical identifiers and structural settings and expose the copy and
image fields used by their template. Pages and Sections cannot be newly
deleted through the CMS, while historical Trash restoration remains available.

**Settings → Website details** manages bilingual company names and
addresses, a public phone number and email, and a map link. The public
contact page uses these saved details; unverified optional fields stay blank.
Settings also contains content export. The Contact page's CMS view links to
Website details for company contact changes.
Personal password changes live in the **User settings** dialog at `/cms/users`,
opened from the signed-in administrator's row or the header avatar.

Image selection stays in the browser until Save. Saved images are uploaded
to Cloudinary and committed with the record. Save errors retain editor input;
retries reuse the submission and any successful upload. Records use versions
to prevent an older editor from overwriting a newer change.

Earlier browser-local data is preserved, but local import and cleanup controls
are not exposed in client settings. Legacy helpers remain for trusted
maintenance and recovery. Browser storage remains specific to the browser
and origin, including its port; any maintenance review must preserve existing
server data and recovery archives.

## Routes map

The interactive geographic map supports pointer, touch, and keyboard use.
Visitors can pan, zoom, select published destinations on the map or route list,
and refit the selected route. Port coordinates and drawn connections
are approximate illustrations, not navigational tracks or live schedules.

Every published Route with origin and destination details plus at least two
coordinate pairs appears in the route finder. Search matches both languages,
port names, and countries; visitors can filter by origin and destination.
Results show six connections per page. The map shows those destinations and
the selected connection, keeping markers bounded as the collection grows.
Connections sharing destination coordinates use one marker with a route
chooser. The selected route's details remain separate from the results, and
the mobile finder includes a shortcut to its map. On `/routes`, the selected
route, search, filters, and result page survive reloads and language changes.

The first and last coordinates locate the two ports. The CMS manages bilingual
port/country names and each latitude/longitude waypoint. Routes without map
data appear as enquiry cards; geographic paths are not invented. Port tooltips
treat saved names as plain text. Published route data is still sent in the page
snapshot; collections with thousands of routes or large coordinate payloads
should be profiled before adding server search and on-demand route details.

Map tiles use OpenStreetMap by default and require internet access. Before
public launch, select a provider appropriate to expected traffic and its
terms. `NEXT_PUBLIC_MAP_TILE_URL` and `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` can
configure a different provider; the OpenStreetMap contributor credit remains
visible.

## Source locations

| File or directory | Responsibility |
| --- | --- |
| `src/lib/content.ts` | Language types, navigation labels, and link helpers |
| `src/lib/cms-legacy.ts` | Retained older-browser data helpers for trusted maintenance and recovery |
| `src/lib/cms-types.ts` | Shared content, media, and enquiry types |
| `src/lib/public-content.ts` | Published record projection for public components |
| `src/lib/public-content-provider.tsx` | Server-provided public content context |
| `src/lib/use-public-content.ts` | Public context access without browser-local content fallback |
| `src/server/` | Database, authentication, validation, content, media, and enquiries |
| `src/app/api/` | Authorized CMS endpoints and contact submission |
| `src/components/CmsWorkspace.tsx` | Dashboard, page content editing, collection lists, and CMS tools |
| `src/components/Home.tsx` | Homepage sections |
| `src/components/ContentPages.tsx` | Company, service, fleet/gallery, article, and custom Page layouts |
| `src/components/EditorialContent.tsx` | Long-form paragraphs and additional database Sections |
| `src/components/ContactPage.tsx`, `PrivacyPage.tsx` | Contact workflow and database-driven privacy information |
| `src/components/RoutesPage.tsx` | Route selection and saved port details |
| `src/components/InteractiveRouteMap.tsx` | Interactive geographic display of database coordinates |
| `src/app/[[...path]]/page.tsx` | Localized server routes and metadata |
| `src/app/globals.css` | Shared typography, color, controls, and responsive scaling |

## Imagery and factual review

The original 15 optimized WebP assets were migrated to Cloudinary and registered
in the MongoDB media library. Five later generated vessel illustrations are
included in `scripts/data/media-manifest.json` and the fleet migration recipe;
verify their committed media records in each target environment. These images
illustrate vessel types and operations; they do not document the company's
actual vessels or work. Home keeps separate
desktop and portrait hero URLs in its Page record, preserving the mobile crop.
The Home hero and connection image have separate bilingual caption fields;
categories stay separate from image captions. Vessel records store supporting
gallery images. The supplied `Design/` files
are design references.

- `generated-images.json` records service, fleet, operations, and gallery
  image prompts and preparation details.
- `hero-prompts.json` records desktop and portrait hero prompts.
- The original illustrative article bodies now live in the corresponding
  Project and News records. Local seed datasets and editorial fallback modules
  have been removed from the application.

The site and CMS use an SVG traced from the client-supplied
`Moe Logo - 2026.png`, preserving the original lettering and waves. Confirm
final brand approval alongside company contacts, ownership and specifications,
service scope, route availability, projects, and news before launch.

## Release checks

### Loading states

Public pages validate their published record before streaming a branded loading
screen while the remaining content loads. This preserves HTTP 404 responses for
missing and trashed records. `NavigationLink` uses Next's actual pending state
for navigation feedback; the header stays usable while the covered content is
temporarily inert. The destination determines the loading language.

The CMS has separate session and first-workspace loading screens. Later refreshes
keep existing content and unsaved fields visible; inbox queries and empty media
loads use skeleton panels. Request failures leave loading and show the existing
recovery controls. Indicators have no artificial delay or percentage, announce
their status, and disable animation for reduced-motion preferences.

The loading browser tests hold real requests to inspect these intermediate
states, release them to check recovery, and save desktop/mobile screenshots.

Run the checks in the README and backend guide after changes. Verify actual
browser workflows as well as HTTP tests: navigation from a scrolled page,
both languages, narrow layouts, the CMS drawer and editor, image preparation,
save failures, media selection, contact validation, and inbox updates.

The site continues to request **noindex, nofollow**, and `robots.txt`
disallows crawling while illustrative content and launch details are pending.
Enabling indexing and public deployment require a separate release decision.
