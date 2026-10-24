# ShapersOS encrypted system backup - 2026-10-24

Status: PARTIAL BACKUP; DATABASE RESTORATION NOT VERIFIED.
Payload: source/history of 7 GitHub branches and all 18 original advertised refs, both Vercel production sources, 55 Supabase tables / 1016 rows, 21 Auth users, catalog/schema/ACL snapshots, metadata for both Vercel projects, readable environment values, original local .env.local and demo credentials.

Vercel does not return the values of 10 sensitive/Secret variables. Original Supabase OAuth/SMTP and Google Cloud settings/secrets are not fully exported. The encrypted RESTORE.md and manifest.json list all gaps.
GitHub rulesets endpoint was denied (403). Actions artifacts/log content and secret values are not included.

Encrypted archive SHA-256: 3367d9215d4087663ac22472384219496126120d4542e094566b94850811c546
Encryption: AES-256-GCM. Key is not stored in this repository or archive.
Recovery key is stored separately on the owner's original computer in the project's .private/backup-recovery/shapersos-2026-10-24.key.
Keep a separate secure copy of this key. Losing it makes this encrypted backup unrecoverable.

Download the files from this tag and decrypt with Node.js 22+:

    node decrypt.mjs shapersos-backup-2026-10-24.enc PATH_TO_RECOVERY_KEY restored.zip

Verify the ciphertext SHA-256 first. After extraction, follow RESTORE.md and verify sha256sums.json.
Archive validation: encryption round trip, tamper rejection, extraction and 71 file SHA-256 checks PASS.
Restoring into a separate database/hosting environment: NOT VERIFIED.

Backup tags preserve the branch and production commits without changing existing branches or live deployments.
