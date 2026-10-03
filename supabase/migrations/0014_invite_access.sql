-- Invite-only access. Existing accounts also start pending; bootstrap the owner manually.
alter table public.profiles
  add column access_status text not null default 'pending'
    check (access_status in ('pending', 'active', 'suspended')),
  add column role text not null default 'teacher' check (role in ('teacher', 'admin'));

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text collate "C" unique not null check (code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  email_restriction text collate "C",
  is_active boolean not null default true,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  check (email_restriction is null or (length(email_restriction) between 3 and 254 and email_restriction = btrim(email_restriction)))
);

create table public.invite_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_code_id uuid unique references public.invite_codes(id) on delete set null,
  user_id uuid unique references auth.users(id) on delete set null,
  -- Snapshots preserve the audit trail even after a code or account is removed.
  code text not null,
  redeemed_email text not null,
  redeemed_at timestamptz not null default now()
);

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  email text not null check (length(email) between 3 and 254),
  message text check (length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;
alter table public.invite_code_redemptions enable row level security;
alter table public.access_requests enable row level security;
revoke all on public.invite_codes, public.invite_code_redemptions, public.access_requests from anon, authenticated;
grant all on public.invite_codes, public.invite_code_redemptions, public.access_requests to service_role;
-- No browser policies: all operations go through authenticated server actions.

create function public.guard_profile_access_fields()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if tg_op = 'INSERT' then
      if new.access_status <> 'pending' or new.role <> 'teacher' then
        raise exception 'Protected profile fields';
      end if;
    elsif new.access_status is distinct from old.access_status or new.role is distinct from old.role then
      raise exception 'Protected profile fields';
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_profile_access before insert or update on public.profiles
  for each row execute function public.guard_profile_access_fields();
create policy "profiles cannot be deleted by clients" on public.profiles
  as restrictive for delete to authenticated using (false);

-- A SECURITY DEFINER avoids recursion when used in RLS. It only reveals the caller's state.
create function public.has_active_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = auth.uid() and p.access_status = 'active' and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.has_active_access() from public, anon;
grant execute on function public.has_active_access() to authenticated;

-- Add a restrictive gate alongside existing ownership policies, including score RPCs
-- (which are SECURITY INVOKER). Profiles remain readable for the access check.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
    and tablename not in ('profiles', 'invite_codes', 'invite_code_redemptions', 'access_requests')
    and rowsecurity
  loop
    execute format('create policy "active teacher access" on public.%I as restrictive for all to authenticated using ((select public.has_active_access())) with check ((select public.has_active_access()))', t.tablename);
  end loop;
end;
$$;
create policy "active teacher storage access" on storage.objects as restrictive for all to authenticated
  using ((select public.has_active_access())) with check ((select public.has_active_access()));

create function public.redeem_invite_code(p_user_id uuid, p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_email text;
  v_verified timestamptz;
  v_code public.invite_codes%rowtype;
  v_now timestamptz := now();
begin
  -- Serialize requests by this user before locking a code; concurrent requests cannot
  -- consume two different codes for the same account.
  select p.access_status, u.email, u.email_confirmed_at into v_status, v_email, v_verified
    from public.profiles p join auth.users u on u.id = p.id
    where p.id = p_user_id for update of p;
  if not found or v_status <> 'pending' or v_verified is null or v_email is null then return false; end if;
  if exists (select 1 from public.invite_code_redemptions where user_id = p_user_id) then return false; end if;
  if p_code is null or p_code collate "C" !~ '^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$' then return false; end if;
  -- Lock and recheck the row after waiting. Exactly one transaction can claim it.
  select * into v_code from public.invite_codes where code = p_code collate "C" for update;
  if not found then return false; end if;
  if not v_code.is_active or v_code.redeemed_at is not null then return false; end if;
  if v_code.email_restriction is not null and v_code.email_restriction <> v_email collate "C" then return false; end if;

  update public.invite_codes set redeemed_by = p_user_id, redeemed_at = v_now where id = v_code.id;
  insert into public.invite_code_redemptions(invite_code_id, user_id, code, redeemed_email, redeemed_at)
    values (v_code.id, p_user_id, v_code.code, v_email, v_now);
  update public.profiles set access_status = 'active' where id = p_user_id;
  return true;
  -- Any constraint/write failure aborts the entire statement and transaction.
end;
$$;
revoke all on function public.redeem_invite_code(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_invite_code(uuid, text) to service_role;
