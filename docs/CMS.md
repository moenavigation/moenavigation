# CMS

For projects with a CMS, build navigation as a hamburger-triggered drawer
from the start.

Use Dev, Admin, and Operator roles. Only Dev can create or manage Dev accounts.
Dev can manage all roles; Admin can create, edit, remove, and reset passwords
for Admin and Operator accounts. Operator retains ordinary CMS content work
and its own password settings. No role may delete its own account. Preserve
at least one Dev once provisioned and at least one Dev or Admin overall.
Only Dev and Admin may permanently delete retained Trash items, including accounts;
keep core pages and referenced images protected. Enforce permissions against
the current stored account, and revoke sessions when account access changes.

Usernames are fixed after account creation; show them read-only and reject
renaming in the API. Edit existing accounts' roles in a dialog. Offer another
account's password reset inside that workflow, using a separate dialog that
preserves the unsaved role when it closes. Keep personal password changes in
User settings. Retain current-password confirmation and existing role protections.
Present users as responsive cards with profile photos, roles, and account actions.
Use dialogs for Add user and Move to Trash, and one page-level Refresh button
that reloads the user list. Preserve failed input and clear passwords on closing.
Offer accessible show/hide controls on every password field in the Users flow.
Keep profile-photo settings inside Add/Edit user and personal User settings,
with no separate Photo action on user cards. A new account may choose its photo
before creation; upload only on Add user and commit the account and photo together.
Preserve the parent form when opening or cancelling the nested photo picker.

Let every role change its own profile photo without changing credentials or
ending sessions. Dev can change any account photo; Admin can change Admin and
Operator photos after confirming its password. Keep photos optional, with an
initial fallback. Choose from the image library (12 per panel) or prepare a
device photo; upload only on Save. Commit the account/photo reference and audit
entry together, retain failed-save input, and reconcile uncertain responses.
Protect photos referenced by active or trashed accounts from media cleanup.
Show saved profile photos consistently in the header, navigation drawer, user
cards, settings, and user Trash rows. Contain the full photo and use initials
when no photo is set or the image cannot load.

Use one Save action for content. A successful save makes it available on the
website immediately, without a draft/publish or approval stage. Keep unsaved
changes recoverable and report success only after data and media are saved.
Preserve historical unpublished records until the user explicitly saves them.
Keep publication labels, badges, filters, and metrics out of the CMS;
show saved content counts and update dates instead. Enquiry statuses remain.

Dismiss temporary confirmation and information notifications after five seconds.
Each new notification starts a fresh timer, including repeated messages. Retain
manual dismissal and keep task progress, validation, and recovery information
visible while it is needed.

Opening a New enquiry moves it to In progress after the update is saved.
Preserve In progress and Resolved statuses when reopening, and offer status
selection pills in enquiry details with clear save errors and conflict recovery.

Keep the dashboard focused on work needing action: show the latest five New
or In progress enquiries, a compact service-status summary with check times,
and equal-width cards for New enquiries, Trash, Web settings, and Attention.
Attention opens a larger searchable, filtered review of missing bilingual
text used by each page or collection, main collection images, and absent
vessel details. Treat these as
suggestions; preserve optional fields and open the existing editor for changes.
Keep counts exact across all matching saved content and paginate the review.
Use actual connection checks for database and image storage; distinguish email
configuration from verified delivery, and show unavailable or unknown honestly.

Manage homepage banners at `/cms/slides`, using a single-column page with
responsive rows of draggable image cards and keyboard reorder controls.
Cards show the 3:1 banner thumbnail; open the homepage to review its centered
16:9 mobile crop. Default rotation is three seconds; editors can
adjust it from two to fifteen seconds. Keep slide images and their descriptions
separate from the homepage introduction. Preserve unsaved slide edits across
CMS navigation and protect saved slide images from cleanup.

Organize page editing around recognizable website pages and their existing
content areas. Let clients edit the copy and images those areas use without
exposing technical identifiers or layout settings. Existing Page and Section
records are fixed: block creation, deletion, reparenting, and reordering in
the CMS interface and API. Preserve historical Trash restoration. Collection
items such as vessels, services, routes, projects, and news retain their own
lists and creation workflow. Keep legacy browser imports in trusted
maintenance workflows rather than client settings.

Give each collection its own Add/Edit dialog with fields relevant to that
item type. Generate new website identifiers automatically on the first save;
preserve existing identifiers and addresses. Keep type, identifier, display
order, and raw icon controls out of these forms while retaining their saved
values. Services offer a visual icon selector using the same icons shown on
the website; preserve existing icon values until the editor chooses a replacement.
Show the current CMS language first in expandable bilingual text
cards, followed by Pictures. Suggest existing vessel types or categories
without restricting clients to those suggestions or overwriting the other
language. Projects and News support dates displayed with the content.

Keep longer text, vessel specifications, additional vessel photos, and route
map/port details in optional expandable panels. Closing panels must preserve
all unsaved fields. Route maps use separate latitude/longitude inputs for
each known point, retaining existing intermediate points, their precision,
and their order unless explicitly edited. These form changes do not replace
the existing save, validation, upload, or recovery rules.

Each route point can import coordinates from a Google Maps pin link in a
separate dialog. Extract automatically, preview before applying, and retain
the rest of the unsaved route. Accept supported full and short share links;
ask for a precise pin or manual coordinates when a link is ambiguous.
Use the selected pin's `!3d` latitude and `!4d` longitude when the link retains
an older search point in a separate context section; do not choose a pair only
because it appears first or last. Keep conflicting or malformed pins rejected.
Provide Google Maps links for every valid point in the editor, public map, and generated
route preview. Keep origin and destination markers visible; intermediate markers
blend into the route line until hovered, focused by keyboard, or selected on touch.

Offer an Edit points on map dialog in Map setup. Let users drag existing points,
place missing points or add intermediate points on the map, and edit the selected point's coordinates by
keyboard. Keep changes local until Apply, preserve untouched coordinate text
and point order, and discard dialog changes on Cancel, Escape, or outside click.
Apply updates the route draft; the normal Save action persists it.

Offer Generate sea route in Map setup when both endpoints are valid. Generate
an approximate maritime-network path, check it against mapped land, and preview
it before replacing intermediate points. Keep endpoint values and the rest of
the draft unchanged; only normal Save publishes it. Try to avoid land first;
if no clear path is found, allow the best available network route with a visible
land-contact note and the normal preview/apply actions. Allow cancellation/retry,
preserve input on failures, and reject unsupported paths rather than inventing
straight-line shortcuts. Label the result for website illustration and review,
not navigation. Keep datasets and routing calculations on the server.
Connect endpoints to positions on existing shipping-network segments rather than
rejecting a nearby route solely because its stored graph vertices are far apart.

Use one Trash list for removed content, saved images, user accounts, and enquiries,
with search and a type-selection dialog. Read and filter the entire Trash
on the server, returning bounded pages. Keep action permissions on the server.

Content and user accounts remain recoverable for 30 days, then expire.
Trashed accounts cannot sign in; revoke their sessions immediately, reserve
their usernames, and keep old sessions invalid after restoration. Account
restoration and permanent deletion require the actor's password and the same
target-role permissions as account management. Saved images remain recoverable
until explicitly deleted permanently. Keep failed image deletions visible for
retry and protect referenced images. Restore a page before its content areas;
shared content areas do not require a parent page. Enquiries expire one UTC
calendar year after receipt, including historical records; clamp February 29
to February 28. Enquiry details offers Move to Trash. Trashed enquiries remain
recoverable for up to 30 days, capped by their original one-year deadline;
restoration preserves their status and original expiry. Apply revision checks,
transactional audit events, and the usual Dev/Admin-only permanent deletion.
Exclude expired enquiries from reads and writes immediately, without waiting
for MongoDB TTL cleanup. Settings edits a fixed record and has no delete action.

Let Dev and Admin manage enquiry-notification recipients from a dialog on
Enquiries, with simple add/edit/remove fields and one Save action. Keep the
list private and separate from public contact details. Validate distinct
addresses and respect the provider's recipient limit; an empty saved list
pauses email while enquiries continue saving. Operator retains ordinary
inbox and eligible notification access. Preserve the original message and
recipients on retries, and audit revision-checked recipient changes without
including addresses in the log.

Keep a read-only activity log at `/cms/logs`. All CMS roles, including Dev,
may read it but cannot add, edit, delete, move, or restore log entries. The
dashboard shows the latest five entries from this same log and links to its
full searchable history, keeping one consistent activity record. The dashboard
filter dialog offers All activities, Data changes, User activity, and Enquiry
activity. Selecting an option applies it immediately and closes the dialog;
Escape preserves the current choice. Full Logs carries the selected group
and retains detailed search and category filters. The
server appends safe event records for CMS security and important administrative
activity. Save changes and their audit records together in database transactions.
Give each record a server-assigned expiry one calendar year after creation;
exclude expired records immediately and permanently remove them through database
retention. Never store passwords, hashes, tokens, upload credentials, request
bodies, or private enquiry messages in activity logs. Preserve logs independently
of ordinary content exports and Trash restoration.


Keep provider usage at `/cms/usage` accessible to Dev and Admin. Show used,
remaining, allowance, scope and reporting time without treating unknown values
as zero. Use neutral plan wording. Cloudinary reads its reported shared-credit
allowance; MongoDB distinguishes the whole cluster from this database. Vercel
supports a saved dashboard reading or an optional server-side API connection.
Keep monitoring allowances independent of provider billing. Protect refreshes
with cached snapshots, account-wide provider cooldowns and request limits;
audit revision-checked configuration changes atomically.
