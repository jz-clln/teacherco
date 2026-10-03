# TeacherCo invite access

Teacher accounts start `pending`, including accounts that existed before this migration.
An email-verified pending teacher must redeem one code to become `active`. Suspension
blocks the app, API routes, classroom database access, and storage access. Reactivating
a previously activated account does not require another invitation.

## Database rollout

The implementation is local. No remote migration or Vercel deployment was performed.
Apply the database migration before deploying this application version: the access
guards deliberately fail closed when the new profile fields cannot be read.

1. Back up the target database and confirm the intended Supabase project.
2. Inspect pending migrations:

   ```sh
   supabase migration list
   supabase db push --dry-run
   ```

3. Review `supabase/migrations/0014_invite_access.sql`. Ensure all earlier migrations
   are already applied, or review any that are also pending before proceeding.
4. Apply the reviewed migrations using `supabase db push`, or run the new migration
   in the Supabase SQL editor after its predecessors.
5. Bootstrap the administrator below, then deploy the app to Vercel.

Existing teacher profiles are deliberately **not** grandfathered into active access.
Their classroom records remain stored, but are inaccessible until activation. Plan
the rollout and distribute invitations accordingly. Migration 0014 also adds an
active-access requirement to the existing public RLS tables and `storage.objects`.
Future classroom tables must include an equivalent restrictive policy.

## Supabase Auth configuration

- Enable email/password signup and **Confirm email**. Keep public signup enabled:
  creating an account is allowed, but entering the app requires activation.
- Set Authentication → URL Configuration → Site URL to the real TeacherCo origin,
  e.g. `https://your-teacherco-domain.example`.
- Add your production and authorized local origins to allowed redirect URLs.
- Configure a working email sender/SMTP service for confirmation messages.
- In the **Confirm signup** email template, use the existing token-hash handler:

  ```html
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Verify your email</a>
  ```

After verification, the handler signs out the confirmation session and sends the
teacher to login. Login checks the fresh database access state, then routes to
`/invite`, `/onboarding`, `/today`, or `/suspended`. An unverified session cannot
redeem a code even if email confirmation was accidentally disabled in the dashboard.

## Required environment variables

These already follow the project's existing configuration; no new public secrets or
admin email allowlist are used:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Set them in `.env.local` for development and the appropriate Vercel environments.
The service-role key must never have a `NEXT_PUBLIC_` prefix. It is imported only
through the server-only admin client, after authentication/authorization.

## Bootstrap the owner administrator

Create and verify your own TeacherCo account first. In the trusted Supabase SQL
editor, replace the example email with that account's exact verified email:

```sql
update public.profiles
set role = 'admin', access_status = 'active'
where id = (
  select id from auth.users
  where email = 'REPLACE_WITH_YOUR_VERIFIED_EMAIL'
    and email_confirmed_at is not null
)
returning id, role, access_status;
```

Confirm that exactly your intended account was returned. This is an explicit owner
bootstrap exception; ordinary teacher accounts must redeem an invite. Never set
admin privileges in user-editable Auth metadata or expose this SQL through the app.
Sign in, complete onboarding if necessary, then open **`/admin/invites`**.

The admin page offers paginated codes, access requests, and redemption history.
Generate a code with an optional exact email restriction; copy and share it manually.
Approving a request records a decision only. It does not send email, create a code,
or activate anyone. Disabled unused codes can be reactivated. A used code remains
used after reactivation.

To suspend an account, use trusted SQL with its verified user ID:

```sql
update public.profiles set access_status = 'suspended'
where id = 'REPLACE_WITH_USER_UUID';
```

To restore a previously activated account without another invite:

```sql
update public.profiles p set access_status = 'active'
where p.id = 'REPLACE_WITH_USER_UUID'
  and p.access_status = 'suspended'
  and (p.role = 'admin' or exists (
    select 1 from public.invite_code_redemptions r where r.user_id = p.id
  ));
```

## Security and history

- The code generator uses Node cryptographic randomness, twelve uppercase letters/
  digits, and the format `XXXX-XXXX-XXXX`, excluding `O`, `0`, `I`, and `1`.
- Codes are intentionally plaintext for the admin copy feature. They are not sent
  to browser clients outside the authorized admin page and are not logged by actions.
- Teachers cannot read or mutate codes, requests, or redemption history through
  Supabase directly. All admin actions check the current database role server-side.
- The redemption RPC is executable only by `service_role`. The server supplies the
  authenticated user ID; email and confirmation state are read from `auth.users`.
- A profile row lock serializes redemptions for one user. A code row lock serializes
  competing claims on one code. Unique history constraints provide another guard.
  Code consumption, history insertion, and profile activation happen in one SQL
  transaction. Any failing write rolls the transaction back.
- Code matching and email restrictions are case-sensitive. Spaces, absent hyphens,
  and extra characters are not normalized into a valid submission. Typed letters
  receive hyphens; malformed pasted content is rejected, including overlong pastes.
- Deleting a code removes its live row permanently. History keeps its code/email
  snapshot and timestamp with a nullable foreign key. Deleting a code never revokes
  access or lets the same user redeem another invitation. Used historical code strings
  are skipped by the generator.
- Authenticated page/API responses are not cached by the service worker. Previously
  downloaded records or previously issued file URLs cannot be recalled by a route guard.
- Existing auth cookies remain in use; this feature adds no new cookie mechanism.

## Automated checks

```sh
npm run test:invites
npm run typecheck
npm run lint
npm run build
```

The invite-specific Vitest config uses native config loading and thread workers so
the tests can run in the Windows sandbox without a config-bundler child process.
PGlite is a development-only embedded PostgreSQL engine. Tests execute the actual
migration against isolated Supabase-like schemas; they never use production data.
They cover activation, duplicate user/code claims, concurrent submitted calls,
disabled codes, exact email restrictions, malformed/case-mismatched codes, email
verification, rollback, deletion history, profile privilege protection, RLS,
server-side admin authorization, routing, and form/network states.

PGlite serializes work on its embedded connection. Its concurrent-call tests check
single-success semantics but do not replace a real multi-session lock test. Before
production rollout, run two simultaneous redemption requests from separate verified
test accounts in a staging Supabase project against the same unused code. Exactly
one must succeed; only one history row and one activated account must result. Repeat
with two different codes submitted by one user; only one code may be consumed.

## Manual acceptance checklist

- [ ] Signup shows the verification page and the email link returns to login.
- [ ] Pending users land on `/invite` after login and after closing/reopening the app.
- [ ] A pending direct visit to `/today`, a classroom route, or an API is blocked.
- [ ] Typing adds hyphens without uppercasing; pasted missing/extra hyphens fail.
- [ ] Every invalid, unavailable, disabled, used, or wrong-email code shows exactly
      `Invalid or unavailable invite code.`
- [ ] A valid code shows `Access activated`, then opens onboarding.
- [ ] An active onboarded user visiting `/invite` is sent to `/today`.
- [ ] A suspended user cannot bypass the blocked page with another code or API call.
- [ ] Non-admin page visits and direct admin action calls cannot access code operations.
- [ ] Admin generation, copy, disable, reactivate, and confirmed deletion work.
- [ ] Redeemed email/time remain in history after deleting the code.
- [ ] A submitted access request appears in admin; approving it grants no access.
- [ ] Supabase direct browser requests cannot read codes or change access status/role.
- [ ] The staging multi-session concurrency checks above allow exactly one success.

## Files

Created:

- `supabase/migrations/0014_invite_access.sql`
- `src/lib/auth/access-policy.ts`, `src/lib/auth/access-guard.ts`
- `src/lib/supabase/admin.ts`
- `src/features/invites/{types,validation,code-generator,actions}.ts`
- `src/features/invites/components/{access-card,invite-form,request-form,admin-controls}.tsx`
- `src/app/invite/page.tsx`, `src/app/request-access/page.tsx`
- `src/app/suspended/page.tsx`, `src/app/verify-email/page.tsx`
- `src/app/admin/invites/{page,loading,error}.tsx`
- `tests/invite-{database,access,actions}.test.ts`, `tests/invite-form.test.tsx`
- `vitest.invites.config.mts`, this setup guide

Modified:

- `src/lib/supabase/proxy.ts` — route and API access enforcement
- `src/app/(dashboard)/layout.tsx` — shared app access guard
- `src/app/onboarding/page.tsx`, `src/features/onboarding/actions.ts` — active-only onboarding
- `src/features/auth/actions.ts`, `src/app/auth/confirm/route.ts` — signup/verification/login routing
- `src/app/sw.ts` — no cached authenticated navigation/API responses
- `package.json`, `package-lock.json` — server-only marker, PostgreSQL test dependency, invite test script

Suggested commit: `Add invite-only access and admin code management`
