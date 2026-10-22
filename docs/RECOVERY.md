# Backup and recovery

The CMS JSON export is useful for editing and inspection. For recovery, use the encrypted CLI archive below: it includes database records **and the original Cloudinary image bytes**.

## What is preserved

- `moe_content`, including Draft and Trash records and their deletion dates.
- `moe_media`, with one hash-verified original image for every registered committed asset.
- `moe_users`, including password hashes; account passwords are not exported in plain text.
- `moe_enquiries`, including private notification delivery state.
- `moe_settings` and the source collections' index definitions.

Sessions, request counters, upload leases, old idempotency-operation records and recovery ownership markers are excluded. Environment files, provider API keys, the initial CMS access file and the backup passphrase are never embedded. Signing in again is required after recovery. A new unknown `moe_` collection makes backup creation fail until its policy is added deliberately.

Archives use AES-256-GCM authenticated encryption, a unique salt and IV, and scrypt key derivation. Image SHA-256 checks detect incomplete or changed bytes. BSON dates and numeric values survive the archive. The bounded in-memory CLI limits database records to 64 MiB, original images to 128 MiB total / 25 MiB each, and the archive to 256 MiB encrypted / 512 MiB expanded. Use a streaming/native backup system if the site grows beyond those limits.

## Create and inspect

Use Node 22 and the installed project dependencies. Configure MongoDB and Cloudinary normally in `.env.local`. Finish uploads and resolve leftovers using CMS Cleanup first. Avoid editing content during backup; the command compares all included records again after downloading images and refuses to finish if they changed.

Provide a strong passphrase of at least 20 characters through `BACKUP_PASSPHRASE`, or point `BACKUP_PASSPHRASE_FILE` at a private file. Keep it out of command arguments, logs and Git.

```powershell
$env:BACKUP_PASSPHRASE_FILE = 'D:\Private\moe-backup-passphrase.txt'
npm.cmd run backup:create -- --output=.local/backups/my-backup.moebackup
npm.cmd run backup:inspect -- --archive=.local/backups/my-backup.moebackup
```

Creation refuses to overwrite an existing archive. A small adjacent `.report.json` contains counts and hashes, without customer records or credentials. Copy the encrypted archive to independent storage and keep the passphrase in a **separate** secure store. A backup and key on the same computer are only a local recovery copy. A lost passphrase cannot be recovered by this software.

## Rehearse recovery

Recovery always restores original images to a dedicated Cloudinary recovery folder with `overwrite: false`. It rewrites main, mobile and gallery references in the isolated copy, including images retained by Trash. Existing Cloudinary assets and the active database are not changed.

The target must be empty and named `<source database>_restore_<suffix>`, at most 38 ASCII characters to fit the Atlas database-name limit. Use a short unique suffix; the CLI rejects longer targets before connecting or uploading images. It also rejects the currently configured database as a target. Run a dry run, review its counts, destination and `planHash`, then pass that exact hash:

```powershell
npm.cmd run backup:restore -- --archive=.local/backups/my-backup.moebackup --target-db=moenavigation_restore_trial --receipt=.local/recovery/trial.json
npm.cmd run backup:restore -- --archive=.local/backups/my-backup.moebackup --target-db=moenavigation_restore_trial --receipt=.local/recovery/trial.json --apply --expected-plan=<reviewed-plan-hash>
npm.cmd run backup:verify -- --archive=.local/backups/my-backup.moebackup --target-db=moenavigation_restore_trial --receipt=.local/recovery/trial.json
```

Verification checks the complete restored documents against the expected copy and fetches every restored image to check its original hash. No notifications are sent. No sessions are restored. No TTL indexes are activated during rehearsal, so old Trash cannot disappear before verification. The archive retains the original index definitions for review; the application recreates its current indexes when deliberately connected to an accepted restored database.

The CLI creates an ownership marker before uploads and a receipt before provider writes. If interrupted, preserve both the receipt and archive. Run `backup:cleanup` against that exact attempt, then retry into another empty target. Cleanup refuses unexpected collections, changed restored records, mismatched ownership markers or images referenced by the active application. It never performs a broad Cloudinary prefix deletion.

```powershell
npm.cmd run backup:cleanup -- --archive=.local/backups/my-backup.moebackup --target-db=moenavigation_restore_trial --receipt=.local/recovery/trial.json
npm.cmd run backup:cleanup -- --archive=.local/backups/my-backup.moebackup --target-db=moenavigation_restore_trial --receipt=.local/recovery/trial.json --apply --expected-plan=<reviewed-plan-hash>
```

Cleanup removes only that owned rehearsal database and its exact verified image IDs. The encrypted backup, key and proof receipt remain. If ownership cannot be proven after a very early interruption, stop and inspect the isolated target manually; do not use a blanket delete.

## Actual recovery and provider settings

After an incident, restore and verify an isolated copy first. Review expired Trash, reset sessions by signing in, keep notification credentials disabled while reviewing restored enquiries, and confirm the website in a private environment. Only then deliberately change deployment configuration to the accepted restored database. The CLI has no command that overwrites the live database or promotes a rehearsal automatically.

MongoDB connection credentials do not establish whether Atlas backups are enabled. The account owner must verify the cluster's available backup plan, retention and restore permissions in Atlas. Check Cloudinary backup/version settings separately. Those provider features complement this portable archive; this task has not changed either provider's billing plan or backup policy.

## Completed rehearsal — 23 October 2026

- Backup: `.local/backups/moe-full-2026-10-23.moebackup`.
- Archive SHA-256: `be8ffcaedaced454f76d1b814e3ece761a2cc42ba573cd72d36e1b6e8ee2e488`.
- Preserved and restored: 58 content records, 15 image records/originals (3,178,074 bytes), 1 CMS account, 1 settings record, 0 enquiries.
- A separate verification command re-read all restored documents and re-fetched all 15 images successfully.
- The isolated database and its exact 15 recovery image copies were removed after verification. Proof receipt: `.local/recovery/rehearsal-2026-10-23.json` (`status: cleaned`).
- The temporary generated key is in `.local/recovery/passphrase.txt`. Move a copy to a separate private store; never commit it or include it with a shared archive.

The original archive captures the site before the later draft-brand/content work. A fresh archive was created after the service copy was polished and optional enquiry-email processing was added to the privacy section:

- Post-polish archive: `.local/backups/moe-full-2026-10-23-post-polish.moebackup`.
- SHA-256: `a2d11e87c121e811f75f1afdc9ba20205b55992c1d4d337adde1d1e5691f3570`.
- Counts: 58 content records, 15 originals (3,178,074 bytes), 1 account, 1 settings record and 0 enquiries.
- Creation verified the records were unchanged while images were fetched; a separate `backup:inspect` run verified archive authentication, structure and all original image hashes.
- The existing private recovery key was reused. Both archives are preserved. The completed isolated restore rehearsal applies to this unchanged recovery implementation; the later archive was not subjected to a second provider-write rehearsal.

### Full workflow retest — 23 October 2026

- Fresh archive: `.local/backups/moe-full-test-20261022t204752-026251.moebackup`, SHA-256 `9dcbae4857db3651d8fc9a7715b794a6da3128fd291c5b6f63091a904ea2b9f8`.
- Creation, inspection, isolated restore, independent document/image verification and exact owned cleanup all completed. Counts were 58 content records, 15 images (3,178,074 original bytes), 1 account, 1 settings record and 0 enquiries.
- Final read-only checks confirmed all source collection hashes were unchanged, the rehearsal database was empty and all 15 exact recovery image IDs were absent. The archive and existing private key remain preserved.
- Receipt: `.local/recovery/moe-full-test-20261022t204752-026251.json` (`status: cleaned`). Full evidence: `.local/full-test-recovery-result.json`.
- The rehearsal exposed and fixed the Atlas target-name limit and the installed Cloudinary SDK's nested missing-asset response during cleanup retries. After completed cleanup, a repeated cleanup correctly refuses to run because the database ownership marker has been removed.

References: [Cloudinary upload behavior](https://cloudinary.com/documentation/image_upload_api_reference), [MongoDB snapshot read concern](https://www.mongodb.com/docs/manual/reference/read-concern/), [Cloudinary backups and versions](https://cloudinary.com/documentation/backups_and_version_management).
