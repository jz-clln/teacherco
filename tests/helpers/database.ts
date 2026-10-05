import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

export async function migrate(db: PGlite, from = 1, through = 16) {
  for (const file of readdirSync("supabase/migrations").sort()) {
    const n = Number(file.slice(0, 4));
    if (n < from || n > through) continue;
    // PGlite bundles gen_random_uuid, but not the pgcrypto extension.
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8").replace("create extension if not exists pgcrypto;", ""));
  }
}

export async function database(through = 16) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key, name text, public boolean);
    create table storage.objects(id uuid, bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
  // Match Supabase default grants BEFORE migrations, so their explicit revokes are tested.
  await migrate(db, 1, through);
  return db;
}
