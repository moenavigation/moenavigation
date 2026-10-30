# Enquiry email notifications

The contact form always saves a valid enquiry to MongoDB first. Email is an optional notification to the website team; it does not determine whether the enquiry was received. The CMS inbox remains the source of truth.

## Current state

The Resend adapter, bilingual notification template, configuration checklist, individual send/retry controls, and recipient-management dialog are implemented. Dev and Admin can manage recipients from **Enquiries → Notification recipients**. The earlier private server recipient is used as an initial fallback until a CMS list is saved. The owner will supply the API key and verified sender later. No external notification email has been sent or received as part of this preparation.

Until configuration is complete, enquiries remain readable in the CMS. **Settings → Email notifications** shows which server settings are missing, invalid, or added. **Refresh email setup** checks configuration only; it does not send mail or call Resend. Settings being added does not prove that the API key is authorized, the domain is verified, or the destination received mail.

An inbox notice links to the setup checklist. Notification controls use the current setup status rather than relying on an older enquiry's stored configuration state. Existing enquiries can be sent individually after configuration; there is no automatic backlog send, bulk send, scheduled retry worker, or email sent by reading the inbox.

## Configure later

Set these server variables in `.env.local` for local use and in the hosting secret store for deployment:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | A sending-access Resend API key authorized for the intended domain |
| `ENQUIRY_EMAIL_FROM` | A plain email address on the verified sender domain |
| `ENQUIRY_EMAIL_TO` | Optional legacy initial recipient, used only until a CMS recipient list has been saved |

Use plain addresses, without display names or comma-separated recipients. Add multiple recipients as separate entries in the CMS dialog. Do not add a `NEXT_PUBLIC_` prefix, commit credentials, or enter the visitor's address as the sender. The visitor's supplied address is used as `Reply-To`.

1. Add a domain you control in Resend and follow its exact DNS verification instructions. Do not invent DNS values or replace the existing mailbox's records. A server setting alone does not verify a domain. [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction)
2. Create a dedicated API key with **Sending access**, restricted to the selected domain when possible. Store its value only in server secrets. The adapter does not need a full-access key. [Resend API key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key)
3. Add the API key and verified sender. Set the variables separately for each intended hosting environment. Restart the local server or redeploy after changing them.
4. As Dev or Admin, open **Enquiries → Notification recipients**. Add, edit or remove addresses and choose **Save changes**. Changes here take effect without a redeployment.
5. Run `npm run email:check` to check the key and sender locally, then refresh **Settings → Email notifications** for the complete setup including saved recipients. The command prints no keys or email addresses. Exit code `1` means key/sender settings are missing or invalid; `0` means locally valid key/sender settings are present. Recipients must be checked in the CMS. The command does not connect to MongoDB, contact Resend, or send a message.

`NEXT_PUBLIC_SITE_URL` is optional for notification delivery. A valid public HTTPS origin adds an **Open CMS inbox** link to new notification messages. Local HTTP origins do not add this link. The link comes only from this configured origin, never a request's Host header.

The public company email in **Settings → Website details** is independent of the notification recipient. Changing one does not change the other.

## Manage notification recipients

At `/cms/enquiries`, **Notification recipients** opens a single dialog with editable email fields, **Add email**, individual Remove buttons, and **Save changes**. Cancel discards that dialog's draft. Dev and Admin can read and change the list; Operator retains normal inbox and eligible Send/Retry access without access to recipient-management controls or addresses.

Save between zero and 50 distinct plain addresses. Duplicate detection ignores letter case. An empty saved list pauses notifications and never falls back to `ENQUIRY_EMAIL_TO`; enquiries still save normally. New notifications send one message addressed to everyone on the list, so recipients can see the other addresses. [Resend recipient support](https://resend.com/docs/api-reference/emails/send-email)

The list is stored privately in MongoDB as a separate `moe_settings` document (`enquiry-email-recipients`). It is independent of public website details, included in encrypted full backups, and excluded from ordinary content exports. Saves recheck the current stored actor's role and password version, reject stale revisions, and append a transactional activity entry without email addresses. An exact retry after a lost save response returns the already-saved revision without creating another log entry. A conflicting edit preserves the draft and offers **Load latest list**, which explicitly replaces unsaved changes.

Saving the list does not send mail or start a backlog. Changes apply to notifications whose first attempt has not started. Already-attempted notifications retain their exact original recipient list when retried, because changing an idempotent request could cause conflicts or duplicates. A saved empty list also pauses eligible retries until recipients are configured again.

## Notification message

The application formats the sender as `MOE Navigation <configured-address>`;
keep `ENQUIRY_EMAIL_FROM` as a plain address. For the owner's confirmed domain,
the intended value is `notifications@moe-navigation.com`, once that domain is
verified for sending. The SMTP subject is a neutral English/Thai notification
label with the MOE name and a short server-generated reference. Visitor text
does not enter the From name or SMTP subject; the visitor's full subject stays
in the HTML and plain-text body, and Reply-To remains their validated address.

The 600px fluid email puts the subject, sender and Message section before the
full reference/date metadata. Presentation tables, inline styles and an Outlook
layout fallback make it less dependent on web-page CSS support. Font sizes in
this standalone email intentionally use inline pixels rather than website CSS
variables, which email clients may discard. Long ASCII tokens have HTML-only
break opportunities; the plain-text content and original addresses remain
unchanged. There are no external images, fonts, attachments, tracking pixels,
scripts or hidden preview blocks added by the template. The inbox button also
shows its actual configured HTTPS destination below it.

New attempts include a readable HTML message and a plain-text alternative, localized to the enquiry's English or Thai language. They contain the enquiry reference, received time, sender name/email, company, subject, and message. Received time uses readable Bangkok/Thailand time with an explicit timezone label. The HTML supports narrow mobile screens. Visitor-provided content is escaped in HTML, and the subject cannot inject email headers. The saved server-side recipients receive the message; replying goes to the visitor through `Reply-To`. This flow does not send an acknowledgement to the visitor. [Resend send-email fields](https://resend.com/docs/api-reference/emails/send-email)

Templates are stored with the first actual attempt. Existing frozen messages, including earlier plain-text-only messages, are reused unchanged on retry; a template update does not change an attempted request's payload.

## Inbox placement

Template changes cannot guarantee that an email reaches the inbox. Before
live acceptance, verify the sending domain's SPF/DKIM and DMARC alignment,
use a consistent sender address, and keep the recipient list limited to staff
who need these notifications. Keep production links on the configured
`https://moe-navigation.com` origin. A neutral subject and clear message are
design choices that keep these notifications recognizable; they are not a
spam-filter bypass. [Resend deliverability guidance](https://resend.com/guides/email/deliverability/avoid-gmail-spam-folder)

For this transactional sender, leave **open tracking** and **click tracking**
off in the Resend domain's settings. These are provider domain settings; the
adapter does not try to control them through undocumented per-message fields.
The absence of a tracking pixel in our source does not prove that tracking is
disabled in the provider account. No provider settings were changed by the
template review. [Resend tracking settings](https://resend.com/docs/dashboard/domains/tracking)

Local previews check English/Thai layout, accessibility structure, long inputs
and missing-CSS fallback. They do not emulate every Gmail/Outlook rendering
engine, prove DNS authentication, inspect the final provider-generated MIME,
or confirm recipient delivery. The later live test should inspect SPF/DKIM/
DMARC results in received headers, Reply-To behavior, layout, links, and inbox
versus spam placement for the intended recipient mail systems.

## Delivery and retry behavior

After MongoDB accepts a contact submission, the server schedules one notification attempt using Next.js `after()`. The response to the visitor confirms the saved enquiry. Provider failure does not undo that save.

Each enquiry has a stable idempotency key. Before its first actual provider attempt, the server stores the complete email message, including sender and recipient, and obtains a two-minute database lease. Concurrent requests cannot both claim the same attempt. An interrupted lease becomes retryable after it expires.

There are at most **three provider attempts, including the first**. Retries reuse the original key and frozen message and are allowed only within **23 hours of the first attempt**. Resend retains idempotency keys for 24 hours; the shorter application window avoids sending outside that protection. [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys)

The provider request and response body share a 12-second deadline. Responses have a size limit, redirects are rejected, and provider error details remain private. Rate-limit responses and requests still being processed record a bounded cooldown. Repeated clicks during that cooldown do not consume another attempt. A provider idempotency-payload conflict requires review rather than an automatic retry. Exhausted, expired, or malformed attempted-delivery metadata is displayed as needing review without sending from a read request.

Changing sender or recipient configuration affects notifications that have not begun a provider attempt. It does not redirect an attempted notification. Repairing an API key or verifying the existing sender may allow an eligible retry to succeed. If the frozen address itself needs changing, review the provider history before arranging a new message; do not reset stored attempt metadata blindly.

| CMS state | Meaning and next action |
| --- | --- |
| Email not configured | Required configuration was absent or invalid. No provider attempt was consumed. Check the current setup, then use Send notification when available. |
| Email pending | Waiting for an attempt, or an earlier processing lease expired. Retry uses the same request. |
| Sending email | An attempt is in progress. Refresh after it finishes. |
| Email accepted | Resend returned an email ID. Actual recipient delivery has not been independently confirmed. |
| Email failed | Acceptance was rejected or could not be confirmed. Check configuration/provider history, wait out any cooldown, and use an eligible retry. |
| Email needs review | An attempt limit, retry window, payload conflict, or unsafe delivery metadata prevents retries. Inspect the provider history before arranging any further send. |

Any authenticated Dev, Admin, or Operator may inspect setup status and request an eligible notification from the inbox. Sending requires the correct website origin and is limited to 30 requests per account per hour. The UI also blocks concurrent clicks, disables sending until current setup is available, and respects provider cooldowns. A never-attempted enquiry uses **Send notification**; a later eligible attempt uses **Retry notification**. This never changes the enquiry's New/In progress/Resolved status. There are no provider delivery webhooks, so **Email accepted** is not a delivered receipt.

`GET /api/cms/email/status` returns only provider name, a configuration flag, and missing/invalid/added checks. It requires a current authenticated session, rejects query parameters, never returns credential values or addresses, and never contacts the provider. It is read-only; mutation methods are not supported.

## Verification

`npm run test:backend` includes offline notification/configuration/template tests and in-memory delivery tests. Browser coverage uses the isolated loopback MongoDB harness and stubbed email setup/send responses; credentials are stripped by the harness. These checks do not send external email or write to live provider accounts. See [TESTING.md](TESTING.md) and [VERIFICATION.md](VERIFICATION.md).

The older `test:notifications:qa` script changes the database name but still uses the configured MongoDB host. It is not the isolated offline harness and is unnecessary for connecting Resend. It was not run during this preparation.

Once credentials and domain verification are ready, submit one clearly identified test enquiry. Confirm its CMS record, **Email accepted**, provider history, and actual receipt in the selected inbox (including spam). Reply once to verify the visitor's Reply-To address, then mark the test enquiry resolved. A successful setup checklist alone does not complete this acceptance check.

On 31 October 2026, the owner explicitly approved one live enquiry labelled
**MOE production test — no action required**. The deployed endpoint returned
201, exactly one enquiry was saved and one notification attempt was accepted.
A read-only Resend email lookup returned `delivered`. The provider copy had the
MOE Navigation sender, HTML and plain text, and the test label. The test record
remains in CMS; no recipient configuration was changed. The owner confirmed
**Arrived in Inbox**. Resend's domain API also reports the domain and sending
DNS records verified, with open/click tracking disabled. Received-message
authentication headers and Reply-To behavior still require mailbox verification;
this one result does not certify other recipients. Safe evidence is in
`.local/release/preproduction-20261031/live-email-test.json`; see the
[full preproduction report](PREPRODUCTION_2026-10-31.md).
