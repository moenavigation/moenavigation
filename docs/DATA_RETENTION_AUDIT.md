# Data retention audit

Checked on 1 November 2026. This records the baseline before the enquiry-retention
change. It distinguishes the source policy from a read-only snapshot of the
configured MongoDB at **06:26 UTC**. Counts change as the website is used.

The database check used direct MongoDB read operations and index inspection.
It did not create indexes, update records, backfill dates, delete data, or send
email. No credentials, customer content, email addresses, or user identifiers
were written to this report.

## Database findings

| Data | Existing policy and live verification |
| --- | --- |
| Enquiries | **Gap being addressed:** both existing enquiries lack expiry dates and there is no enquiry TTL index in this snapshot. Both creation dates are valid and in the past; neither enquiry is over one year old. Notification envelopes and delivery metadata are embedded in the same document, so they follow its retention. |
| Activity logs | One calendar year from the event; a BSON `expiresAt` field and TTL index are present. All **33** stored events have a date expiry. Reads already hide expired events. |
| CMS sessions | **8 hours**; all **1** stored session has a date expiry and the TTL index is present. Reads already reject expired sessions. |
| Content operation receipts | **7 days from BSON `createdAt`**, rather than an `expiresAt` field. All **70** receipts have a valid date field and the 604800-second TTL index is present. |
| Rate limits, CAPTCHA, profile-save receipts | Timed entries in `moe_state`, covered by its `expiresAt` TTL index. CAPTCHA lasts **2 minutes**; rate-limit buckets expire after their bucket's bounded window; profile-save receipts last **7 days**. The snapshot has **4** rate-limit buckets and **2** profile-save receipts, all with date expiries; there are no CAPTCHA rows. |
| Provider usage snapshots and leases | Snapshot storage expires after **7 days**; normal reads refresh after **10 minutes**, with a **1-minute** lease/failure cooldown. Both **2** stored usage snapshots have date expiries; there are no lease rows. |
| Content and users in Trash | **30 days from moving to Trash**, enforced using BSON `purgeAt` and TTL indexes. Neither collection has a trashed record missing its date purge field. Active records are intentionally durable. There are **63** content records and **2** users in total. |
| Saved media | Intentionally durable, including recoverable Media Trash. The snapshot contains **24** committed images and **1** trashed image. There are no unfinished uploads. A blanket media TTL would violate the existing recovery policy and could remove referenced images. |
| Unfinished uploads | No automatic TTL: explicit CMS Cleanup considers unfinished uploads after a **1-hour grace period**, checks references and submission ownership, and retries provider deletion safely. Abandoned uploads can persist until Cleanup is used. |
| Website and recipient settings | Both **2** settings records are intentionally durable. Automatically expiring them would reset site configuration or notification recipients. |
| Singleton state/coordination locks | Intentionally durable, bounded coordination/configuration entries. **2** live entries match the current recognized singleton/settings keys. |
| Media-submission guards | **75** per-submission state rows have no expiry. They prevent cancelled or competing saves from reviving uploads. They can accumulate; introduce a bounded submission/retry policy before safely pruning them. Do not apply a blanket TTL to this collection. |
| Legacy initialization marker | **1** additional expiry-free row is most likely a durable, historical initialization marker. Its fixed named key contains an initialization hint; its only other field is a canonical ISO initialization timestamp from **22 October 2026**. It has no per-submission/user identity or payload structure. Neither current source nor the 19 reachable Git commits contains its exact key. This is a structural inference, not a verified original writer; preserve the bounded single marker rather than treating it as an accumulating ephemeral record. |
| Recovery ownership markers | No recovery collection exists in this configured database. Isolated recovery targets deliberately keep ownership markers until explicit verified rehearsal cleanup; these are not disposable cache entries. |

The snapshot contains no unknown `moe_` collections. `moe_state` has **86** rows:
75 media guards, 8 correctly timed ephemeral rows, 2 recognized durable rows,
and 1 inferred historical initialization marker. The follow-up classification
inspected only key patterns, field names/types, known status/date shapes, and
source/history matches; it exposed no arbitrary stored values or identifiers
and made no database changes.

Relevant source: `src/server/db.ts`, `enquiries.ts`, `enquiry-notifications.ts`,
`auth.ts`, `audit.ts`, `content.ts`, `users.ts`, `media.ts`, `usage.ts`,
`settings.ts`, `enquiry-recipients.ts`, and `scripts/recovery.mts`.

## Browser storage, caches, and copies

- **Contact drafts have no timed expiry.** `moe-contact-draft` in localStorage
  contains the visitor's name, email, company, subject, message and submission
  identity. It is removed after a confirmed successful matching submission or
  when the input is cleared. Consider a clear draft-expiry policy and a visible
  discard action; preserve uncertain-submission recovery when adding one.
- Remembered login usernames and the CMS language preference remain until
  changed or browser storage is cleared. They are intentional preferences;
  passwords/session tokens are not stored there.
- Legacy browser content, media migration receipts, and the recovery archive
  have no timed expiry. This preserves unsynced content and recoverability;
  clear them only through the existing verified migration/archive process.
- The public language cookie expires after **365 days**. The CMS session cookie
  expires after **8 hours**.
- Public content caches revalidate after **24 hours** and are explicitly
  invalidated after successful CMS changes. Dashboard service checks cache for
  **1 minute** in process. These are cache lifetimes, not source-data deletion.
- Encrypted backup files and recovery receipts have no automatic expiry. A
  database TTL does not erase older copies inside an archive. Define a separate
  backup-retention policy with recovery needs in mind.
- Already delivered notification emails, recipient inbox copies, and provider
  backups/logs are outside this application's MongoDB retention. Their settings
  and deletion schedules were not verified or changed by this audit.

Relevant source: `src/lib/contact-draft.ts`, `src/components/ContactPage.tsx`,
`CmsLoginForm.tsx`, `src/lib/cms-locale.tsx`, `cms-legacy.ts`, `public-locale.ts`,
`src/server/public-cache.ts`, `dashboard.ts`, and `docs/RECOVERY.md`.

## Safe introduction of enquiry expiry

New enquiries should receive a server-assigned BSON expiry one calendar year
after creation. Status changes, notification retries, moving to Trash, and
restoring must not restart that year. Reads must enforce the boundary even
while MongoDB's asynchronous TTL cleanup is pending. Trash should remain
recoverable only until the earlier applicable permanent-deletion deadline.

For existing records, review a dry-run showing missing/invalid dates and how
many proposed deadlines are already past. Preserve a recovery copy before
applying a backfill that could make records immediately eligible for deletion.
Never introduce startup code that silently stamps past
deadlines onto old records and lets TTL delete them. An idempotent backfill
should update only the reviewed missing-date records, preserve existing valid
deadlines, and require a deliberate policy for malformed or already overdue
legacy records. The two records in this snapshot are valid and younger than
one year; no live backfill was performed during this audit.

Recovery archives include enquiry documents and BSON dates. Rehearsal restore
deliberately does not activate TTL indexes, allowing restored expired data to
be reviewed before a deliberate promotion. Review overdue enquiries and
backfill legacy dates before activating the production retention policy on a
restored database; keep email sending disabled during that review.

## Completed rollout on 1 November 2026

The reviewed migration added future BSON expiry and cleanup dates to both
existing enquiries. Message content, status, and revisions were preserved.
The enquiry `purgeAt` TTL index is active with `expireAfterSeconds: 0`.
Verification found 2 retained enquiries, no missing or invalid expiry dates,
no already-expired enquiries, and no remaining migration candidates. No
enquiries were deleted during this rollout.

New enquiries receive the same one-year policy automatically. Enquiry details
shows expiry and Move to Trash; the shared Trash supports revision-protected
restoration and Dev/Admin permanent deletion. Manual Trash recovery is capped
at 30 days and the original one-year deadline. The remaining findings above
need their own retention decisions.
