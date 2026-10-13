-- Existing activated accounts keep their access. New redemptions are time-limited.
alter table public.profiles add column access_expires_at timestamptz;
alter table public.invite_codes add column duration_days integer not null default 30 check (duration_days in (7,30));
alter table public.invite_code_redemptions drop constraint invite_code_redemptions_user_id_key;
alter table public.invite_code_redemptions add column duration_days integer check (duration_days in (7,30)), add column access_expires_at timestamptz;

create or replace function public.guard_profile_access_fields()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('postgres','supabase_admin','service_role') then
  if tg_op='INSERT' then
   if new.access_status<>'pending' or new.role<>'teacher' or new.access_expires_at is not null then raise exception 'Protected profile fields'; end if;
  elsif new.access_status is distinct from old.access_status or new.role is distinct from old.role or new.access_expires_at is distinct from old.access_expires_at then raise exception 'Protected profile fields'; end if;
 end if;
 return new;
end; $$;

create function public.has_read_access() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=auth.uid() and p.access_status='active' and u.email_confirmed_at is not null);
$$;
revoke all on function public.has_read_access() from public,anon;
grant execute on function public.has_read_access() to authenticated;
create or replace function public.has_active_access() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=auth.uid() and p.access_status='active' and u.email_confirmed_at is not null and (p.role='admin' or p.access_expires_at is null or p.access_expires_at>now()));
$$;

-- Keep existing ownership/read policies, then enforce expiry on every mutation.
do $$ declare p record; t record; clause text; begin
 for p in select * from pg_policies where schemaname in ('public','storage') and (coalesce(qual,'') like '%has_active_access%' or coalesce(with_check,'') like '%has_active_access%') loop
  clause='';
  if p.qual is not null then clause=clause||' using ('||replace(p.qual,'has_active_access','has_read_access')||')'; end if;
  if p.with_check is not null then clause=clause||' with check ('||replace(p.with_check,'has_active_access','has_read_access')||')'; end if;
  execute format('alter policy %I on %I.%I%s',p.policyname,p.schemaname,p.tablename,clause);
 end loop;
 for t in select schemaname,tablename from pg_tables where rowsecurity and (schemaname='public' or (schemaname='storage' and tablename='objects')) loop
  execute format('create policy access_insert on %I.%I as restrictive for insert to authenticated with check ((select public.has_active_access()))',t.schemaname,t.tablename);
  execute format('create policy access_update on %I.%I as restrictive for update to authenticated using ((select public.has_active_access())) with check ((select public.has_active_access()))',t.schemaname,t.tablename);
  execute format('create policy access_delete on %I.%I as restrictive for delete to authenticated using ((select public.has_active_access()))',t.schemaname,t.tablename);
 end loop;
 -- Read-only report snapshots remain viewable. Mutating RPCs keep active checks.
 execute replace(pg_get_functiondef('public.report_card_generation_snapshot(uuid,uuid)'::regprocedure),'public.has_active_access()','public.has_read_access()');
 -- This service-role import RPC must also enforce the user's expiry itself.
 execute replace(pg_get_functiondef('public.apply_class_record_sync(uuid,uuid,uuid,bigint,jsonb,jsonb)'::regprocedure),$find$p.access_status='active'$find$, $replace$p.access_status='active' and (p.role='admin' or p.access_expires_at is null or p.access_expires_at>now())$replace$);
end; $$;

create or replace function public.redeem_invite_code(p_user_id uuid,p_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_profile public.profiles%rowtype; v_email text; v_verified timestamptz; v_code public.invite_codes%rowtype; v_now timestamptz:=now(); v_expires timestamptz;
begin
 select * into v_profile from public.profiles where id=p_user_id for update;
 if not found or v_profile.access_status='suspended' then return false; end if;
 if v_profile.access_status='active' and (v_profile.role='admin' or v_profile.access_expires_at is null or v_profile.access_expires_at>v_now) then return false; end if;
 select email,email_confirmed_at into v_email,v_verified from auth.users where id=p_user_id;
 if v_verified is null or v_email is null or p_code is null or p_code collate "C" !~ '^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$' then return false; end if;
 select * into v_code from public.invite_codes where code=p_code collate "C" for update;
 if not found or not v_code.is_active or v_code.redeemed_at is not null then return false; end if;
 if v_code.email_restriction is not null and v_code.email_restriction<>v_email collate "C" then return false; end if;
 v_expires=v_now+make_interval(days=>v_code.duration_days);
 update public.invite_codes set redeemed_by=p_user_id,redeemed_at=v_now where id=v_code.id;
 insert into public.invite_code_redemptions(invite_code_id,user_id,code,redeemed_email,redeemed_at,duration_days,access_expires_at) values(v_code.id,p_user_id,v_code.code,v_email,v_now,v_code.duration_days,v_expires);
 update public.profiles set access_status='active',access_expires_at=v_expires where id=p_user_id;
 return true;
end; $$;
