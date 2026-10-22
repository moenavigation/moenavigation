# Everyday CMS guide

Open `/cms` on the website and sign in with your administrator account.

## Find the right content

- Use **Menu** to open Pages, Sections, Fleet, Services, Routes, Projects, News, Enquiries, Media library, Trash, or Account & tools.
- Under Content, **Find a page and its sections** narrows the list to that page and its related sections. Sections appear in display order.
- On a Page row, **Manage sections** opens only that page's sections. **Shared across pages** contains sections used throughout the website.
- Search accepts English and Thai titles, categories, identifiers, and parent page identifiers.
- Choose **All content** to clear the filters.

## Edit and save

1. Choose **Edit** or **Create content**.
2. Enter both English and Thai titles and summaries. Detailed content accepts plain paragraphs separated by blank lines.
3. Check the information, then select **Save**. Saving makes the content available on the website immediately; there is no separate publication step.
4. Wait for the saved message, then open the website in Thai and English to review it. Unsaved edits remain in the editor until saved.

Core pages stay available. A Section belongs to one page or the shared area. New sections appear in display order; existing template sections retain their designed placement. Historical Draft records are kept unchanged until you open and save them. A section needs an available parent page to appear publicly.

The editor labels unsaved changes. Closing it asks whether to discard them; **Cancel** keeps the editor and prepared images intact. Closing or refreshing the whole browser may also show the browser's standard unsaved-change warning.

**Download unsaved text** saves a recovery copy of the current text and image references, including unfinished route coordinates. Prepared device-image files are not included. The CMS brand and **View website** links open a new tab so the editor stays open.

When changing the type of a new unsaved item, the CMS asks before clearing incompatible vessel specifications or route fields. Cancel keeps those fields; confirming keeps shared titles, copy and images. Existing saved records retain their type. New and edited Sections must belong to an available Page or the shared area.

## Website details

Use **Account & tools → Website details** for company names and contact information. **Refresh workspace** updates lists while preserving unsaved website details. **Refresh details** loads the current saved version and asks before replacing edits. If another tab has saved newer details, refresh and review them before trying your change again.

## Vessel specifications

Fleet entries include an optional **Vessel specifications** panel. Enter approved values for IMO number, completed build year, length overall, beam, draft, deadweight, container capacity, flag state, and availability statement.

- Leave unknown values blank. No specification values are generated automatically.
- IMO numbers use seven digits without the `IMO` prefix. The check digit is validated; passing this check does not verify that the number belongs to this vessel.
- Dimensions are metres, deadweight is tonnes, and container capacity is whole TEU.
- Flag state and availability statements need both English and Thai text.
- Availability is editorial text, not live tracking or a guaranteed booking.

The current IMO number format is documented by the [International Maritime Organization](https://www.imo.org/en/ourwork/iiis/pages/imo-identification-number-schemes.aspx).

## Images

1. Select a library image or choose a device image.
2. Device images are prepared locally. The preview says **Ready to upload**; selecting an image does not upload it.
3. Add meaningful image descriptions in both languages. Home supports a separate mobile hero image; Fleet entries support up to 12 gallery images.
4. Select Save. Prepared images upload sequentially, then the content and image URLs save together.

If an upload fails, your text and prepared images remain available. Retry uploads only after checking the error. If saving has an uncertain outcome, use **Check saved content** before trying again. Successful uploads are reused; unreferenced files from an unsuccessful submission are removed only after its save outcome is resolved.

The Media library's **Clean unfinished uploads** action handles confirmed unused uploads after its grace period. Content and Trash references remain protected. Removing an image from an editor does not delete its saved library copy.

## Enquiries

Open **Enquiries** to read a message, reply through your email application, and update its status to **New**, **In progress**, or **Resolved**.

**Search all enquiries** searches the entire stored inbox by name, email, company, subject, message or reference ID, including older messages that have not been loaded. English, Thai and punctuation are supported. Combine search with **Enquiry status**; **Showing X of Y enquiries** reports the loaded and total matching counts. **Load more enquiries** keeps the current filters. The menu's New count covers the whole inbox. **Clear filters** returns to all messages.

Use **Refresh enquiry** inside the message to load its latest status and notification details. If another tab changed it, the CMS rejects the stale update; refresh the enquiry, review its current status, then make your change again.

Enquiries are stored in MongoDB independently of email notifications. The notification panel reports its current state:

- **Email not configured:** a provider key, verified sender, or recipient is missing. Enquiries still remain in the CMS.
- **Email pending / Email failed:** **Retry notification** is available while fewer than three attempts have been used.
- **Sending email:** wait for processing to finish, then use **Refresh enquiry**.
- **Email accepted:** the provider accepted the message; this is not proof of inbox delivery.
- **Email needs review:** inspect the provider before sending again. Uncertain outcomes outside the 23-hour retry window require review to avoid duplicates.

Live email requires Resend access, a verified sender, and the configured recipient. Until those requirements are supplied, use the CMS inbox as the source of truth.

The sender and recipient are fixed when the first email attempt begins, so retries use the same message destination and provider idempotency key. Changes to those addresses apply to new notifications. Repairing the provider key or verifying the existing sender can still make an eligible retry succeed.

## Trash and recovery

Deleting content moves it to Trash for 30 days. Open **Trash → Restore** to recover it. Images needed by Trash are protected. Expired Trash is permanently removed by database retention.

**Account & tools → Export data** downloads content, media references, and enquiries. That export does not include image files or administrator accounts; use the separate backup and recovery workflow for a full recovery.

**Review local content** is only for earlier browser-based data. Review changed versions before importing. **Clear verified local data** checks current server copies, saves a browser archive, and then clears active legacy storage. Restore the archive only when you need to review it again.
