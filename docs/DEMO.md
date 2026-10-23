# Website experience and content boundaries

The website has a working MongoDB and Cloudinary backend. Its company
examples and generated imagery remain illustrative until the business
provides and verifies the final content. See [BACKEND.md](BACKEND.md) for
configuration, administration, uploads, enquiries, and verification commands.

## Public pages

Thai is the default language at `/`; English uses equivalent paths under
`/en`. The language switch preserves the equivalent page, query string and section anchor.
Public sections include Home, About, Services, Fleet, Routes, Projects,
News, Contact, and Privacy. Services, vessels, projects, news, and additional
published Pages have detail routes.

Services uses a featured capability and supporting entries. Fleet uses
image-led vessel cards; Projects and News have featured and secondary story
layouts. Listings support search and category filters. Fleet, News and Projects
keep these filters in the URL for reloads, sharing, language changes and return
links from detail pages. Search matches English and Thai text together.
The route map similarly keeps the selected route in its URL. Vessel galleries
read their images and bilingual descriptions from MongoDB; a vessel with one image
opens that image without redundant gallery controls.

The CMS stores bilingual titles, descriptions, longer text, image
descriptions, categories, and optional supplied dates. Published records are
read on the server and used consistently by the page, metadata, and sitemap.
The CMS uses one Save action that makes content public immediately. Historical
unpublished records are preserved until explicitly saved. Missing, historical
unpublished, and trashed detail records return HTTP 404.

All nine main Page records remain published and control their page headings,
summaries, and longer copy. Section records control homepage and company
sections, shared calls to action, footer copy, and privacy text. Custom
published Pages have their own routes;
adding a page does not automatically add it to the primary navigation.

Business copy, article bodies, gallery lists, route ports, coordinates, and
media URLs are stored in MongoDB. Public components never fall back to local
seed data or local photography. Missing Sections are omitted; a database
failure reaches the retry screen rather than substituting sample content.
Navigation, field labels, validation messages, and factual preview notices
remain application UI text.

Lower display-order numbers appear first in listings, value groups, and
additional Sections; an omitted order is treated as zero. Equal values retain
the server's identifier order. The migrated records preserve their original
sequence. Established Section identifiers occupy designed template positions.
New Sections append to their selected Page in display order; `shared` Sections
append once before the footer on all public pages. Moving a Section to another
parent removes it from its former page. A draft or trashed Section is hidden.

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

Company phone, email, office details, the final privacy policy, and a business
retention policy still require verification. Website details saved in the CMS
populate bilingual company names, addresses, phone/email links, and the office
map link. The site describes its current
data handling without inventing contact destinations or claiming email
delivery.

## CMS

The English-language CMS at `/cms` requires an administrator sign-in. Its
menu opens as an edge drawer. It provides content search and filters,
bilingual editors, image preparation, publication status, 30-day Trash and
restore, a media library, enquiries, and account tools.

**Account & tools → Website details** manages bilingual company names and
addresses, a public phone number and email, and a map link. The public
contact page uses these saved details; unverified optional fields stay blank.

Image selection stays in the browser until Save. Saved images are uploaded
to Cloudinary and committed with the record. Save errors retain editor input;
retries reuse the submission and any successful upload. Records use versions
to prevent an older editor from overwriting a newer change.

Existing demo data is not silently discarded. **Review local content**
checks the current browser's older `moe-content-v1` data and can import new
type-and-ID combinations through the media upload workflow. Records already
present on the server are compared before cleanup, and the original browser
data can be exported before removal. Browser storage remains specific
to the browser and origin, including its port.

## Routes map

The interactive geographic map supports pointer, touch, and keyboard use.
Visitors can pan, zoom, select published destinations on the map or route list,
and return to the regional overview. Port coordinates and drawn connections
are approximate illustrations, not navigational tracks or live schedules.

Every published Route with origin and destination details plus at least two
coordinate pairs appears on the map. The first and last coordinates locate
the two ports. The CMS manages bilingual port/country names and each
latitude/longitude waypoint. Routes without map data appear as enquiry cards;
geographic paths are not invented. Port tooltips treat saved names as plain text.

Map tiles use OpenStreetMap by default and require internet access. Before
public launch, select a provider appropriate to expected traffic and its
terms. `NEXT_PUBLIC_MAP_TILE_URL` and `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` can
configure a different provider; the OpenStreetMap contributor credit remains
visible.

## Source locations

| File or directory | Responsibility |
| --- | --- |
| `src/lib/content.ts` | Language types, navigation labels, and link helpers |
| `src/lib/cms-legacy.ts` | Explicit older-browser content review and import, with no embedded seed |
| `src/lib/cms-types.ts` | Shared content, media, and enquiry types |
| `src/lib/public-content.ts` | Published record projection for public components |
| `src/lib/public-content-provider.tsx` | Server-provided public content context |
| `src/lib/use-public-content.ts` | Public context access without browser-local content fallback |
| `src/server/` | Database, authentication, validation, content, media, and enquiries |
| `src/app/api/` | Authorized CMS endpoints and contact submission |
| `src/components/CmsDemo.tsx` | CMS interface and local-content import |
| `src/components/Home.tsx` | Homepage sections |
| `src/components/ContentPages.tsx` | Company, service, fleet/gallery, article, and custom Page layouts |
| `src/components/EditorialContent.tsx` | Long-form paragraphs and additional database Sections |
| `src/components/ContactPage.tsx`, `PrivacyPage.tsx` | Contact workflow and database-driven privacy information |
| `src/components/RoutesPage.tsx` | Route selection and saved port details |
| `src/components/InteractiveRouteMap.tsx` | Interactive geographic display of database coordinates |
| `src/app/[[...path]]/page.tsx` | Localized server routes and metadata |
| `src/app/globals.css` | Shared typography, color, controls, and responsive scaling |

## Imagery and factual review

The existing 15 optimized WebP assets were migrated to Cloudinary and registered
in the MongoDB media library. They illustrate fictional vessels and operations;
they do not document the company's actual assets or work. Home keeps separate
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

The MOE mark is a provisional identity. Replace it with approved brand files
when supplied. Review company contacts, ownership and specifications,
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
disallows crawling while sample content and launch details are pending.
Enabling indexing and public deployment require a separate release decision.
