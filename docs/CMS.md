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

Edit existing accounts in a dialog. Offer another account's password reset
inside that edit workflow, using a separate dialog that preserves the unsaved
username and role when it closes. Keep personal password changes in User
settings. Retain current-password confirmation and existing role protections.

Let every role change its own profile photo without changing credentials or
ending sessions. Dev can change any account photo; Admin can change Admin and
Operator photos after confirming its password. Keep photos optional, with an
initial fallback. Choose from the image library (12 per panel) or prepare a
device photo; upload only on Save. Commit the account/photo reference and audit
entry together, retain failed-save input, and reconcile uncertain responses.
Protect photos referenced by active or trashed accounts from media cleanup.

Use one Save action for content. A successful save makes it available on the
website immediately, without a draft/publish or approval stage. Keep unsaved
changes recoverable and report success only after data and media are saved.
Preserve historical unpublished records until the user explicitly saves them.
Keep publication labels, badges, filters, and metrics out of the CMS;
show saved content counts and update dates instead. Enquiry statuses remain.

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
values. Show the current CMS language first in expandable bilingual text
cards, followed by Pictures. Suggest existing vessel types or categories
without restricting clients to those suggestions or overwriting the other
language. Projects and News support dates displayed with the content.

Keep longer text, vessel specifications, additional vessel photos, and route
map/port details in optional expandable panels. Closing panels must preserve
all unsaved fields. Route maps use separate latitude/longitude inputs for
each known point, retaining existing intermediate points, their precision,
and their order unless explicitly edited. These form changes do not replace
the existing save, validation, upload, or recovery rules.

Use one Trash list for removed content, saved images, and user accounts,
with search and a type-selection dialog. Read and filter the entire Trash
on the server, returning bounded pages. Keep action permissions on the server.

Content and user accounts remain recoverable for 30 days, then expire.
Trashed accounts cannot sign in; revoke their sessions immediately, reserve
their usernames, and keep old sessions invalid after restoration. Account
restoration and permanent deletion require the actor's password and the same
target-role permissions as account management. Saved images remain recoverable
until explicitly deleted permanently. Keep failed image deletions visible for
retry and protect referenced images. Restore a page before its content areas;
shared content areas do not require a parent page. Enquiries use statuses and
Settings edits a fixed record; neither currently exposes a delete action.

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
