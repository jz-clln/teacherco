# Timed invite access

New invite codes grant either 7 or 30 days, starting at redemption. Codes remain
single-use; unused codes do not have a separate redemption deadline. Active
teachers cannot consume another code before their current access expires.
Suspended accounts cannot renew. Administrators retain access independently of
the teacher deadline.

Migration 0027 adds `profiles.access_expires_at`, code duration, and redemption
expiry snapshots. It allows multiple historical redemptions per teacher while
retaining one redemption per code. Existing activated accounts keep a null
expiry (unlimited); existing unused codes grant 30 days when redeemed. Disabling
or deleting a used code does not revoke its granted access or erase its audit.

Expired accounts retain owner-scoped reads. Restrictive insert/update/delete
policies enforce the deadline for every public RLS table and storage objects.
Mutating RPCs retain active-access checks, including the privileged class-record
import RPC. Renewing locks both the profile and code in one transaction. The
verified account and any exact email restriction must match.

The app shows the deadline and a renewal link, disables editing when the deadline
passes, and blocks mutation requests. The public offline workspace downloads
account-scoped access metadata through `/api/access` and uses the server clock
offset for its local deadline. Missing metadata fails closed for edits. Device
queues and cached records are retained, with synchronization paused until access
is renewed. Clearing or changing a browser cache cannot grant cloud access: the
database always enforces expiry using server time. Offline clock/cache checks
are application controls, not tamper-proof licensing on a user-controlled device.

Renewal requires internet. After redeeming a new code, opening TeacherCo refreshes
the device access metadata and resumes sync. Sign-out removes the account marker;
read-only mode still allows sign-out, record navigation and access renewal.

Validation: `tests/timed-invite-database.test.ts`, `tests/timed-access.test.ts`,
existing invite/action tests, and `node tests/timed-access-browser.mjs` against a
production server use synthetic accounts and do not write production learner data.

Migration 0027 was applied to the linked Supabase Cloud project on 2026-10-13;
local and remote migration histories were verified through 0027. Application
changes still require the normal app deployment.
