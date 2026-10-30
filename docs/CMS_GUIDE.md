# Everyday CMS guide

Open `/cms` on the website and sign in with your CMS account.
Each page view has its own `/cms/...` URL, so you can bookmark it or use the
browser's Back and Forward buttons. The Media library is at `/cms/media`.
Content editors still open as dialogs within the current view.

## Find the right content

- The **Dashboard** shows saved content, pages, new enquiries, Trash, and shortcuts to everyday tasks.
- Open **Pages** and choose the page you recognize, such as Home or About. Edit its page introduction or one of the listed text and image areas.
- Existing content areas are grouped under their page in website order. Shared content, including the footer, has its own group.
- A page's collection shortcut opens its Fleet, Services, Routes, Projects, or News list. Use these lists to manage the individual items shown on that page.
- Contact details are edited in **Settings → Website details**. The Contact page also links to these settings.
- Collection lists search all saved items in English and Thai. Search for an item, then select **Edit**. Each list loads 12 items at a time; **Show more** keeps the search.

## Users and roles

At `/cms/users`, choose **User settings** on your own row to open your personal settings dialog. The header avatar also opens this dialog on the Users page. Every role can change its own password by entering the current password and matching new passwords of at least 14 characters. A successful change keeps this browser signed in and signs out other sessions.

| Role | Manage accounts | Permanently delete Trash items |
| --- | --- | --- |
| Dev | Create, edit, reset passwords, and remove Dev, Admin, and Operator accounts | Yes |
| Admin | Create, edit, reset passwords, and remove Admin and Operator accounts | Yes |
| Operator | Own password only; ordinary website content editing remains available | No |

Only Dev can create another Dev or change a Dev account. **Edit** opens a dialog to change a username or role. Inside it, **Reset password** opens a separate dialog for another permitted user. Canceling or completing a reset returns to the edit dialog and preserves unsaved username/role entries. A reset does not save those entries. Each account change requires your current password. Password resets and changes to usernames or roles sign out the affected account's existing sessions; when editing your own account, the current browser receives a replacement session with the new role. Nobody can delete their own account. The last Dev cannot be removed or demoted, and at least one Dev or Admin must remain. Accounts created before roles were introduced retain Admin access.

**Move to Trash** disables an account immediately and signs it out everywhere. Its username stays reserved. Dev or an authorized Admin can restore it within 30 days from **Trash**, using their current password. Restoration keeps the account's password and role but requires a fresh login. Only Dev can restore or permanently delete a Dev account. User accounts expire after 30 days in Trash.

To set your photo, open **User settings → Change profile photo**, or choose
**Photo** beside your account. Choose a device image or **Browse library**,
then **Save photo**. The library shows 12 images per panel and supports search.
**Remove photo → Save photo** restores your initial. Cancel discards the choice;
device images upload only when you save. A failed save keeps your prepared photo
so you can retry. Changing a photo keeps existing sessions signed in.

Dev can change anyone's photo. Admin can change Admin and Operator photos,
confirming its current password. Photos appear in the user list, settings,
and header, including mobile. Create a new account first, then choose its
**Photo** action. Images used by an account remain protected while that account
is in Trash; image usage links open the account's photo settings or its Trash item.

## One place for removed items

At `/cms/trash`, content, images, and permitted user accounts share one list. Search all removed items by name, or open **Filters**, choose an item type, and select **Apply filters**. **Cancel** leaves the current filter unchanged; **Clear filters** shows everything again. The list loads 30 items at a time, newest first, and **Load more items** keeps your search and filter.

**Restore** returns content or an image to its original list. Restoring an account asks for your current password. **Delete permanently** asks for confirmation and is available only to Dev/Admin, subject to account-role and image-reference protections. Canceling preserves the item. If an image deletion fails, it remains in Trash so deletion can be retried.

Content and user accounts can be recovered for 30 days. Images remain until explicitly deleted permanently. Restore a page before restoring its content areas; shared areas can be restored independently. Images used by other content or content still in Trash remain protected. Enquiries use **New**, **In progress**, and **Resolved** statuses and have no delete action; Settings has no deletable item.

## Activity history

Open **Logs** at `/cms/logs` to see who performed an action, the item involved,
its time, result, and expiry. Search by username or item name, or choose an
**Activity type**. The list loads 30 entries at a time. **Refresh** loads the
latest activity and keeps the current filters.

Logs record sign-ins and sign-outs, password changes, content changes, image
management, account changes, website settings, data exports, enquiry status
changes, and notification requests. A notification request does not confirm
email delivery. Logs begin recording when this feature is enabled; earlier
activity is not reconstructed.

Every role, including Dev, can only view logs. There are no editing, deletion,
or Trash actions. Each entry expires permanently one calendar year after it was
recorded. Passwords and private enquiry text are never included.

## Edit and save

1. Open **Pages**, choose a page, then select **Edit** beside the text or image area you want to update.
2. Update its English and Thai text or choose a replacement image. The editor shows fields used by that area. Longer text accepts plain paragraphs separated by blank lines.
3. Check the information, then select **Save**. Saving makes the content available on the website immediately; there is no separate publication step.
4. Wait for the saved message, then open the website in Thai and English to review it. Unsaved edits remain in the editor until saved.

Pages and their content areas are already arranged for the website. You can edit their copy and images, but cannot add, delete, move, or rearrange page elements. Technical identifiers and layout settings are kept out of the editor. Saved records and their existing placement are preserved. Historical unpublished content stays unchanged until you explicitly edit and save it.

Fleet, Services, Routes, Projects, and News use separate collection lists. These lists allow new items where needed; adding an item does not add a new layout element to a page.

The editor labels unsaved changes. Closing it asks whether to discard them; **Cancel** keeps the editor and prepared images intact. Closing or refreshing the whole browser may also show the browser's standard unsaved-change warning.

**Download unsaved text** saves a recovery copy of the current text and image references, including unfinished route coordinates. Prepared device-image files are not included. The CMS brand and **View website** links open a new tab so the editor stays open.

## Add or edit collection items

Open the appropriate list, then choose **Add vessel**, **Add route**, **Add project**, **Add service**, or **Add news**. Editing a saved item opens its corresponding **Edit** dialog. The CMS sets a new item's website address automatically when you first save it. Existing addresses stay unchanged. Item type, address identifiers, display order, and icon settings are managed by the website and are not editing controls.

The text card for your current CMS language opens first. Expand the other language card to enter its translation. Both languages need a title and summary. Collapsing a card keeps your unsaved text.

- Fleet items include **Vessel type**; Projects and News include **Category**. Suggestions come from existing items, and you can also type a new value. Choosing or typing in one language does not overwrite the other language.
- **Pictures** appears below the main text, with the main image and its descriptions in both languages.
- Open **Detailed content** inside either language card for longer copy. Services, Projects, and News also have an optional content heading.
- Projects and News include a **Publication date** field.
- **Vessel specifications**, **More photos**, and **Route map and ports** start collapsed. Open them when you need those details. Saved values remain intact while these panels are closed.

Choose **Save** when the item is ready. The same upload, unsaved-change, and recovery behavior applies as for page content.

## Website details

Use **Settings → Website details** at `/cms/setting` for company names and contact information. The previous `/cms/account` URL redirects here. **Refresh workspace** updates lists while preserving unsaved website details. The button pauses briefly after each use to prevent repeated refreshes; if an area fails, the CMS names it and keeps the last loaded information visible. **Refresh details** loads the current saved version and asks before replacing edits. If another tab has saved newer details, refresh and review them before trying your change again.

## Vessel specifications

Fleet entries include an optional **Vessel specifications** panel. Enter approved values for IMO number, completed build year, length overall, beam, draft, deadweight, container capacity, flag state, and availability statement.

- Leave unknown values blank. No specification values are generated automatically.
- IMO numbers use seven digits without the `IMO` prefix. The check digit is validated; passing this check does not verify that the number belongs to this vessel.
- Dimensions are metres, deadweight is tonnes, and container capacity is whole TEU.
- Flag state and availability statements need both English and Thai text.
- Availability is editorial text, not live tracking or a guaranteed booking.

The current IMO number format is documented by the [International Maritime Organization](https://www.imo.org/en/ourwork/iiis/pages/imo-identification-number-schemes.aspx).

## Route maps and ports

In a route's editor, open **Route map and ports** below Pictures. Enter the origin and destination port names and countries in Thai and English. Port information is optional for a route without a map.

Open **Map setup** to edit the route's points. **Set up map points** provides origin and destination rows, each with separate **Latitude** and **Longitude** fields. Use known coordinates. A mapped route needs both ports and at least an origin and destination point; add intermediate points only where the route needs them, up to 100 points in total.

Existing points keep their saved values and order unless you edit, add, or remove them. Updating a route's text or images does not replace its intermediate points. Closing the map panels preserves unfinished coordinate edits along with the rest of the editor.

## Images

1. Select a library image or choose a device image.
2. Device images are prepared locally. The preview says **Ready to upload**; selecting an image does not upload it.
3. Add meaningful image descriptions in both languages. Home supports a separate mobile hero image; Fleet entries support up to 12 gallery images inside **More photos**.
4. Select Save. Prepared images upload sequentially, then the content and image URLs save together.

If an upload fails, your text and prepared images remain available. Retry uploads only after checking the error. If saving has an uncertain outcome, use **Check saved content** before trying again. Successful uploads are reused; unreferenced files from an unsuccessful submission are removed only after its save outcome is resolved.

Open **Media library** at `/cms/media` to upload reusable images and search all saved images, including older images that have not been loaded yet. It shows 30 images per panel. Use **Used** on an image card to see the saved content and Trash items that reference it before removing it. Select a content entry to open its editor. A Trash entry opens the matching item in Trash; restore it to open its editor. Image pickers in content dialogs search the same complete library and show 12 images per panel. Choose **Add an image** to open the upload dialog. Choosing a device image prepares a preview and editable name; **Save image** starts the upload and closes the dialog after a successful save. Closing the dialog or moving between CMS pages in the same tab preserves the prepared image and name.

The Media library's **Clean unused images** action moves saved images with no content usage to **Trash → Images** at `/cms/trash` after a one-hour grace period. It also removes abandoned uploads and retries failed deletions. Images referenced by active content or content in Trash remain protected. Open **Trash → Images** to restore an image or explicitly delete it permanently. Saved images stay there until an administrator permanently deletes them. An image card's **Trash** action moves one unused image to the same Images section. Removing an image from an editor does not delete its saved library copy.

## Enquiries

Open **Enquiries** to read a message, reply through your email application, and update its status to **New**, **In progress**, or **Resolved**.

Dev and Admin can choose **Notification recipients** to add, edit or remove the people who receive enquiry emails. Each address has its own field; use **Add email** for another person, then **Save changes**. Up to 50 distinct addresses are supported. Cancel leaves the saved list unchanged. Saving an empty list pauses email notifications while enquiries continue saving in the inbox. Everyone on the list receives the same message and can see the other addresses. Changes apply to new notification attempts; a retry keeps its original recipients. Saving this list does not send an email. Operator can use the inbox and eligible notifications but cannot manage the recipient list.

**Search all enquiries** searches the entire stored inbox by name, email, company, subject, message or reference ID, including older messages that have not been loaded. English, Thai and punctuation are supported. Combine search with **Enquiry status**; **Showing X of Y enquiries** reports the loaded and total matching counts. **Load more enquiries** keeps the current filters. The menu's New count covers the whole inbox. **Clear filters** returns to all messages.

Use **Refresh enquiry** inside the message to load its latest status and notification details. If another tab changed it, the CMS rejects the stale update; refresh the enquiry, review its current status, then make your change again.

Enquiries are stored in MongoDB independently of email notifications. The notification panel reports its current state:

- **Email not configured:** server settings were missing or invalid. Open **Settings → Email notifications** for the current checklist. Enquiries still remain in the CMS.
- **Email pending / Email failed:** after setup is available, a message with no earlier attempt offers **Send notification**. Later eligible attempts offer **Retry notification**, up to three attempts within 23 hours. Wait for any displayed cooldown before retrying.
- **Sending email:** wait for processing to finish, then use **Refresh enquiry**.
- **Email accepted:** the provider accepted the message; this is not proof of inbox delivery.
- **Email needs review:** inspect the provider before sending again. Uncertain outcomes outside the 23-hour retry window require review to avoid duplicates.

Live email requires Resend access, a verified sender, and the configured recipient. Until those requirements are supplied, use the CMS inbox as the source of truth.

The **Email notifications** checklist is available to every signed-in role. **Refresh email setup** checks the server settings without sending mail. **Settings added** means the required values have been supplied in a valid format; the provider still needs to accept the key and verified sender. Keys and email addresses are never displayed in this checklist. Setup errors are shown separately from missing settings. A developer adds credentials through server configuration, then restarts or redeploys; there are no credential fields in the CMS. See [EMAIL.md](EMAIL.md) for connection steps.

The sender and recipient are fixed when the first email attempt begins, so retries use the same message destination and provider idempotency key. Changes to those addresses apply to new notifications. Repairing the provider key or verifying the existing sender can still make an eligible retry succeed.

## Trash and recovery

The unified list described above contains removed content, images, and permitted accounts. Core pages are protected, and a page with linked content areas cannot be permanently deleted. Pages and their content areas cannot be newly moved to Trash through the CMS; historical Trash records can still be restored. Saved library images are preserved when deleting content. Operator can restore content and images, but cannot manage removed accounts or permanently delete items.

**Settings → Export data** downloads content, media references, and enquiries. That export does not include image files or administrator accounts; use the separate backup and recovery workflow for a full recovery.

Earlier browser-based content is preserved for maintenance and recovery. Import and browser-storage cleanup are not part of the client settings screen; ask the website maintainer to review older data before using it.


## Data usage

Dev and Admin can open **Data usage** at `/cms/usage` to check Vercel, MongoDB
and Cloudinary. Each card shows what is used, the allowance, and what remains
when both figures are available. Unknown means a reading is missing; it does
not mean zero. Over-limit amounts are shown explicitly. Check each card's scope
and dates, as providers count different resources and reporting periods.

MongoDB storage and Cloudinary usage are read through the existing server
connections. Use **Update Vercel reading** to copy Fast Data Transfer and
CDN Requests from your Vercel dashboard, with its reporting period. Leave any
unknown number blank. Save records when you checked the readings. To resume
a connected Vercel API, select **Clear saved reading** and save; automatic
readings appear only when the server connection is available.

**Monitoring limits** changes only the allowances used on this page. It does
not change the provider plan or billing. Leave an unknown allowance blank;
zero means no allowance. Changing a limit does not update the age of a saved
reading. Cloudinary uses the allowance its API reports.

Readings are cached for ten minutes, and **Refresh usage** has a sixty-second
cooldown shared by provider checks. Refresh does not update the numbers you
entered manually. Each provider's reporting time remains visible. Unsaved
entries are kept after a failure or conflict so you can review and retry.
