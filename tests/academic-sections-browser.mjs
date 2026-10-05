// Opt-in: creates ONE temporary auth account on the verified project; always deletes it.
// Start the production build locally first. Never run against an unverified project.
import { strict as assert } from 'node:assert';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium } from '@playwright/test';
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(url).hostname.split('.')[0];
assert.equal(ref, process.env.SECTIONS_TEST_PROJECT_REF, 'Set the explicitly verified project ref');
assert.equal(readFileSync('supabase/.temp/project-ref', 'utf8').trim(), ref, 'CLI and app targets differ');
const base = process.env.SECTIONS_TEST_URL ?? 'http://127.0.0.1:3316';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use a local production build');
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let userId, browser;
try {
  const email = `sections-${randomUUID()}@teacherco-test.invalid`, password = randomBytes(32).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Temporary Section Test' } });
  assert.ok(!created.error && created.data.user, 'Temporary account creation failed');
  userId = created.data.user.id;
  assert.ok(!(await admin.from('profiles').update({ access_status: 'active', onboarding_completed: true }).eq('id', userId)).error, 'Test profile setup failed');
  const cid = randomUUID();
  assert.ok(!(await admin.from('classes').insert({ id: cid, teacher_id: userId, name: 'Temporary unlinked class', subject: 'Math', grade_level: 'Grade 8', school_year: '2026-2027' })).error, 'Class setup failed');
  const jar = new Map();
  const auth = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: {
    getAll: () => [...jar.values()],
    setAll: cookies => { for (const cookie of cookies) jar.set(cookie.name, cookie); },
  } });
  assert.ok(!(await auth.auth.signInWithPassword({ email, password })).error, 'Sign-in failed');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([...jar.values()].map(c => ({ name: c.name, value: c.value, url: base, sameSite: 'Lax' })));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const routes = ['/today', '/classes', `/classes/${cid}`, ...['learners', 'assessments', 'scores', 'term-grades', 'attendance', 'records', 'records/sync', 'export'].map(p => `/classes/${cid}/${p}`), '/check', '/reports', '/ask', '/settings'];
  for (const route of routes) {
    const response = await page.goto(base + route, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200, `Page status: ${route}`);
    assert.equal(new URL(page.url()).pathname, route, 'Unexpected access redirect');
    assert.doesNotMatch(await page.locator('body').innerText(), /Application error|Something went wrong/i, `Page error: ${route}`);
    assert.equal(errors.length, 0, 'Browser runtime error');
  }
  console.log(`${routes.length} authenticated production pages passed with section_id=null.`);
} finally {
  await browser?.close();
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    assert.ok(!deleted.error, `Temporary account cleanup failed; remove only fixture ${userId}`);
    console.log('Temporary account and class cleaned up.');
  }
}
