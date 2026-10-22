# Enquiry email notifications

The contact form always saves a valid enquiry to MongoDB first. Email is an optional notification to the website team; it does not determine whether the enquiry was received. The CMS inbox remains the source of truth.

## Current state

The Resend integration and CMS status/retry controls are implemented. The selected recipient is configured privately in the local server environment. The owner will supply the API key and verified sender later. No external notification email has been sent or received as part of verification.

Until configuration is complete, enquiries show **Email not configured** and remain readable in the CMS. Existing enquiries can be retried individually after configuration; there is no automatic bulk send or scheduled retry worker.

## Configure later

Set these server variables in `.env.local` for local use and in the hosting secret store for deployment:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | A Resend API key authorized to send from the intended domain |
| `ENQUIRY_EMAIL_FROM` | A plain email address on the verified sender domain |
| `ENQUIRY_EMAIL_TO` | The single recipient address selected by the owner |

Use plain addresses, without display names or comma-separated recipients. Do not add a `NEXT_PUBLIC_` prefix, commit credentials, or enter the visitor's address as the sender. The visitor's supplied address is used as `Reply-To`.

Resend requires a domain that the owner can verify. Follow the provider's actual DNS instructions; configuring an environment variable does not verify the domain. See [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction). Restart the local server or redeploy after changing its environment.

The public company email in **Account & tools → Website details** is independent of the notification recipient. Changing one does not change the other.

## Delivery and retry behavior

After MongoDB accepts a contact submission, the server schedules one notification attempt using Next.js `after()`. The response to the visitor confirms the saved enquiry. Provider failure does not undo that save.

Each enquiry has a stable idempotency key. Before its first actual provider attempt, the server stores the complete email message, including sender and recipient, and obtains a two-minute database lease. Concurrent requests cannot both claim the same attempt. An interrupted lease becomes retryable after it expires.

There are at most **three provider attempts, including the first**. Retries reuse the original key and frozen message and are allowed only within **23 hours of the first attempt**. Resend retains idempotency keys for 24 hours; the shorter application window avoids sending outside that protection. [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys)

Changing sender or recipient configuration affects notifications that have not begun a provider attempt. It does not redirect an attempted notification. Repairing an API key or verifying the existing sender may allow an eligible retry to succeed. If the frozen address itself needs changing, review the provider history before arranging a new message; do not reset stored attempt metadata blindly.

| CMS state | Meaning and next action |
| --- | --- |
| Email not configured | Required configuration is absent or invalid. No provider attempt is consumed. Configure it, then retry. |
| Email pending | Waiting for an attempt, or an earlier processing lease expired. Retry uses the same request. |
| Sending email | An attempt is in progress. Refresh after it finishes. |
| Email accepted | Resend returned an email ID. Actual recipient delivery has not been independently confirmed. |
| Email failed | Acceptance was rejected or could not be confirmed. Check configuration/provider history and use an eligible retry. |
| Email needs review | The attempt limit or retry window closed. Inspect the provider history before any further send. |

The CMS retry endpoint requires an administrator session, the correct website origin, and an hourly request limit. It never changes the enquiry's New/In progress/Resolved status. The project does not yet process provider delivery webhooks, so it does not label messages as delivered.

## Verification

`npm run test:notifications:qa` exercises concurrency, idempotent retries, attempt limits, the retry window, expired leases, and missing configuration using the isolated QA database and a stub email sender. It sends **no external email**, cleans its exact test enquiries, and writes `.local/notification-check-result.json`.

Once credentials and sender verification are ready, submit one clearly identified test enquiry, confirm the CMS record and provider acceptance, then confirm receipt in the intended inbox (including spam). Mark the test enquiry resolved. This live acceptance check remains outstanding.
