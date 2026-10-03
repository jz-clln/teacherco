// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
let sequence = 1000;
beforeAll(async () => {
  db = new PGlite();
  // Minimal Supabase infrastructure. The feature migration itself runs unchanged.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, full_name text, onboarding_completed boolean default false);
    alter table public.profiles enable row level security;
    create policy own_profile on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
    create table public.classes(id uuid primary key default gen_random_uuid(), teacher_id uuid references auth.users(id));
    alter table public.classes enable row level security;
    create policy own_class on public.classes for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
    create table storage.objects(id uuid primary key default gen_random_uuid(), owner_id uuid);
    alter table storage.objects enable row level security;
    create policy own_object on storage.objects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    grant all on all tables in schema public, storage to authenticated, service_role;
  `);
  await db.exec(readFileSync("supabase/migrations/0014_invite_access.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

async function user(status = "pending", verified = true, email?: string) {
  const id = randomUUID();
  await db.query("insert into auth.users values ($1, $2, $3)", [id, email ?? `${id}@example.com`, verified ? new Date().toISOString() : null]);
  await db.query("insert into public.profiles(id, access_status) values ($1, $2)", [id, status]);
  return id;
}
async function code(options: { active?: boolean; email?: string } = {}) {
  const value = `ABCD-EFGH-${sequence++}`;
  await db.query("insert into public.invite_codes(code,is_active,email_restriction) values ($1,$2,$3)", [value, options.active ?? true, options.email ?? null]);
  return value;
}
async function redeem(id: string, value: string) {
  return (await db.query<{ ok: boolean }>("select public.redeem_invite_code($1,$2) as ok", [id, value])).rows[0].ok;
}
async function asTeacher(id: string, fn: () => Promise<void>) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec("set role authenticated");
  try { await fn(); } finally { await db.exec("reset role"); }
}

describe("invite database security and transactions", () => {
  it("activates a verified pending user and records both redemption timestamps", async () => {
    const id = await user(); const value = await code();
    expect(await redeem(id, value)).toBe(true);
    const result = await db.query<{ access_status: string; redeemed_by: string; same_time: boolean }>(`
      select p.access_status, c.redeemed_by, c.redeemed_at = r.redeemed_at as same_time
      from public.profiles p join public.invite_codes c on c.redeemed_by=p.id
      join public.invite_code_redemptions r on r.invite_code_id=c.id where p.id=$1`, [id]);
    expect(result.rows[0]).toEqual({ access_status: "active", redeemed_by: id, same_time: true });
  });
  it("never redeems the same code twice", async () => {
    const value = await code();
    expect(await redeem(await user(), value)).toBe(true);
    expect(await redeem(await user(), value)).toBe(false);
  });
  it("never consumes two codes for one user, even if an administrator resets the status", async () => {
    const id = await user(); const first = await code(); const second = await code();
    expect(await redeem(id, first)).toBe(true);
    await db.query("update public.profiles set access_status='pending' where id=$1", [id]);
    expect(await redeem(id, second)).toBe(false);
    expect((await db.query<{ redeemed_at: string | null }>("select redeemed_at from public.invite_codes where code=$1", [second])).rows[0].redeemed_at).toBeNull();
  });
  it("rejects disabled codes and supports reactivation of unused codes", async () => {
    const id = await user(); const value = await code({ active: false });
    expect(await redeem(id, value)).toBe(false);
    await db.query("update public.invite_codes set is_active=true where code=$1", [value]);
    expect(await redeem(id, value)).toBe(true);
  });
  it("matches restricted email exactly, including case", async () => {
    const value = await code({ email: "Teacher@example.com" });
    expect(await redeem(await user("pending", true, "teacher@example.com"), value)).toBe(false);
    expect(await redeem(await user("pending", true, "Teacher@example.com"), value)).toBe(true);
  });
  it("rejects malformed, missing, and differently cased codes without consuming anything", async () => {
    const id = await user(); const value = await code();
    for (const bad of [value.toLowerCase(), value.replaceAll("-", ""), ` ${value}`, value.replace("-", "--"), "ZZZZ-ZZZZ-ZZZZ"]) expect(await redeem(id, bad)).toBe(false);
    expect(await redeem(id, value)).toBe(true);
  });
  it("rejects unverified, missing, and suspended accounts", async () => {
    const value = await code();
    expect(await redeem(await user("pending", false), value)).toBe(false);
    expect(await redeem(await user("suspended"), value)).toBe(false);
    expect(await redeem(randomUUID(), value)).toBe(false);
  });
  it("allows only one success for concurrent redemption requests", async () => {
    const first = await user(); const second = await user(); const value = await code();
    const results = await Promise.all([redeem(first, value), redeem(second, value)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.query("select * from public.invite_code_redemptions where code=$1", [value])).rows).toHaveLength(1);
  });
  it("allows only one success for concurrent codes submitted by the same user", async () => {
    const id = await user(); const first = await code(); const second = await code();
    expect((await Promise.all([redeem(id, first), redeem(id, second)])).filter(Boolean)).toHaveLength(1);
  });
  it("rolls back code, history, and profile changes when any write fails", async () => {
    const id = await user(); const value = await code();
    await db.exec(`create function public.test_fail_activation() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end $$;
      create trigger test_fail_activation before update on public.profiles for each row execute function public.test_fail_activation();`);
    try { await expect(redeem(id, value)).rejects.toThrow("forced failure"); }
    finally { await db.exec("drop trigger test_fail_activation on public.profiles; drop function public.test_fail_activation()"); }
    expect((await db.query<{ redeemed_at: string | null }>("select redeemed_at from public.invite_codes where code=$1", [value])).rows[0].redeemed_at).toBeNull();
    expect((await db.query("select * from public.invite_code_redemptions where user_id=$1", [id])).rows).toHaveLength(0);
    expect((await db.query<{ access_status: string }>("select access_status from public.profiles where id=$1", [id])).rows[0].access_status).toBe("pending");
  });
  it("preserves history and activation after permanent code deletion", async () => {
    const id = await user(); const value = await code();
    await redeem(id, value);
    await db.query("delete from public.invite_codes where code=$1", [value]);
    const history = (await db.query<{ code: string; invite_code_id: string | null }>("select * from public.invite_code_redemptions where user_id=$1", [id])).rows[0];
    expect(history.code).toBe(value); expect(history.invite_code_id).toBeNull();
    expect((await db.query<{ access_status: string }>("select access_status from public.profiles where id=$1", [id])).rows[0].access_status).toBe("active");
    expect(await redeem(id, await code())).toBe(false);
  });
  it("blocks browser listing, creation, deletion, history access, and RPC redemption", async () => {
    const id = await user("active");
    await asTeacher(id, async () => {
      for (const sql of ["select * from public.invite_codes", "insert into public.invite_codes(code) values ('AAAA-BBBB-CCCC')", "delete from public.invite_codes", "select * from public.invite_code_redemptions", "select * from public.access_requests"]) await expect(db.exec(sql)).rejects.toThrow(/permission denied/);
      await expect(redeem(id, "AAAA-BBBB-CCCC")).rejects.toThrow(/permission denied/);
    });
  });
  it("blocks self-activation, self-promotion, and profile deletion", async () => {
    const id = await user();
    await asTeacher(id, async () => {
      await expect(db.query("update public.profiles set access_status='active' where id=$1", [id])).rejects.toThrow("Protected profile fields");
      await expect(db.query("update public.profiles set role='admin' where id=$1", [id])).rejects.toThrow("Protected profile fields");
      expect((await db.query("delete from public.profiles where id=$1 returning id", [id])).rows).toHaveLength(0);
      await db.query("update public.profiles set full_name='Teacher' where id=$1", [id]);
    });
  });
  it("gates owned classroom records and stored files on verified active access", async () => {
    for (const [status, verified, allowed] of [["pending", true, false], ["active", true, true], ["suspended", true, false], ["active", false, false]] as const) {
      const id = await user(status, verified);
      await db.query("insert into public.classes(teacher_id) values ($1)", [id]);
      await db.query("insert into storage.objects(owner_id) values ($1)", [id]);
      await asTeacher(id, async () => {
        expect((await db.query("select * from public.classes")).rows).toHaveLength(allowed ? 1 : 0);
        expect((await db.query("select * from storage.objects")).rows).toHaveLength(allowed ? 1 : 0);
        if (!allowed) await expect(db.query("insert into public.classes(teacher_id) values ($1)", [id])).rejects.toThrow(/row-level security/);
      });
    }
  });
});
