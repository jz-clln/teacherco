import {chooseOption} from './helpers/custom-select-browser.mjs';
// Opt-in browser/remote smoke. All writes belong to one temporary auth account.
import { strict as assert } from 'node:assert';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium, expect } from '@playwright/test';
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, ref = new URL(url).hostname.split('.')[0];
assert.equal(ref, process.env.SECTIONS_TEST_PROJECT_REF, 'Explicitly verify the intended project first');
assert.equal(readFileSync('supabase/.temp/project-ref', 'utf8').trim(), ref);
const base = process.env.SECTIONS_TEST_URL ?? 'http://127.0.0.1:3326';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const output = 'test-results/section-setup'; mkdirSync(output, { recursive: true });
let userId, browser;
async function checked(promise, label) { const result = await promise; assert.ok(!result.error, `${label}: ${result.error?.code ?? 'failed'}`); return result.data; }
try {
  const email = `section-ui-${randomUUID()}@teacherco-test.invalid`, password = randomBytes(32).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ok(!created.error && created.data.user, 'Temporary user creation'); userId = created.data.user.id;
  await checked(admin.from('profiles').update({ access_status: 'active', onboarding_completed: true }).eq('id', userId), 'profile');
  const math = randomUUID(), science = randomUUID(), incompatible = randomUUID(), anaA = randomUUID(), anaB = randomUUID(), ben = randomUUID(), assessment = randomUUID();
  await checked(admin.from('classes').insert([
    { id: math, teacher_id: userId, name: 'Mathematics class with a longer descriptive classroom name', subject: 'Mathematics', grade_level: 'Grade 8', school_year: '2026–2027', school_id: '123' },
    { id: science, teacher_id: userId, name: 'Science class', subject: 'Science', grade_level: 'Grade 8', school_year: 'SY 2026–2027', school_id: '123' },
    { id: incompatible, teacher_id: userId, name: 'Different grade', subject: 'English', grade_level: 'Grade 9', school_year: '2026-2027', school_id: '123' },
  ]), 'classes');
  await checked(admin.from('learners').insert([{ id: anaA, teacher_id: userId, first_name: 'Ana', last_name: 'Cruz', display_name: 'Ana Cruz' }, { id: anaB, teacher_id: userId, first_name: 'Ana', last_name: 'Cruz', display_name: 'Ana Cruz' }, { id: ben, teacher_id: userId, first_name: 'Ben', last_name: 'De los Santos with a long family name', display_name: 'Ben De los Santos with a long family name' }]), 'learners');
  await checked(admin.from('class_enrollments').insert([{ class_id: math, learner_id: anaA }, { class_id: math, learner_id: ben }, { class_id: science, learner_id: anaB }]), 'rosters');
  await checked(admin.from('assessments').insert({ id: assessment, class_id: math, title: 'Existing activity', kind: 'mixed', source: 'manual', total_points: 10 }), 'assessment');
  await checked(admin.from('submissions').insert({ assessment_id: assessment, learner_id: anaA, score: 8, max_score: 10 }), 'score');
  await checked(admin.from('attendance_entries').insert({ class_id: math, learner_id: anaA, attendance_date: '2026-10-05', status: 'present' }), 'attendance');
  const before = await checked(admin.rpc('class_record_snapshot', { p_class_id: math }), 'snapshot');
  const jar = new Map();
  const auth = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll: () => [...jar.values()], setAll: cookies => { for (const c of cookies) jar.set(c.name, c); } } });
  assert.ok(!(await auth.auth.signInWithPassword({ email, password })).error, 'Sign-in');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([...jar.values()].map(c => ({ name: c.name, value: c.value, url: base, sameSite: 'Lax' })));
  const page = await context.newPage(), runtimeErrors = [];
  page.on('pageerror', e => runtimeErrors.push(e.message));
  async function visit(path) {
    const response = await page.goto(base + path, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200, path);
    await expect(page.getByText('Could not load this Section', { exact: true })).toHaveCount(0);
    assert.equal(runtimeErrors.length, 0, 'Runtime error');
  }
  async function confirm(label) { const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); await dialog.getByRole('button', { name: label, exact: true }).click(); await expect(dialog).not.toBeVisible({ timeout: 20000 }); }
  async function screenshot(name, width = 390) { await page.setViewportSize({ width, height: 900 }); await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true }); }
  await visit('/classes');
  await page.getByRole('navigation', { name: 'Classes and Sections' }).getByRole('link', { name: 'Sections', exact: true }).click();
  await expect(page.getByText('Organize classes by their learner group')).toBeVisible();
  await screenshot('empty');
  await page.getByRole('link', { name: 'New Section', exact: true }).click();
  await page.getByLabel('Section name', { exact: true }).fill('Rizal');
  await page.getByLabel('Grade level', { exact: true }).fill('Grade 8');
  await page.getByLabel('School year', { exact: true }).fill('2026-2027');
  await page.getByLabel('School ID (optional)', { exact: true }).fill('123');
  await page.getByLabel('I am the adviser of this Section').check();
  await page.getByRole('button', { name: 'Create Section', exact: true }).click({ clickCount: 2 });
  await page.waitForURL(/\/sections\/[a-f0-9-]{36}$/, { timeout: 20000 });
  const sectionId = new URL(page.url()).pathname.split('/').at(-1), sectionPath = `/sections/${sectionId}`;
  let rows = await checked(admin.from('sections').select('*').eq('teacher_id', userId), 'created Sections');
  assert.equal(rows.length, 1); assert.equal(rows[0].is_adviser, true);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  const sectionName = 'Rizal Afternoon — learners from the community and nearby barangays';
  await page.getByLabel('Section name', { exact: true }).fill(sectionName);
  await page.getByLabel('School name (optional)', { exact: true }).fill('San Roque National High School — Community Learning Extension and Academic Programs');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForURL(base + sectionPath);
  // Adviser-only learner creation, before any class is linked.
  await page.getByRole('link', { name: 'Add learner', exact: true }).click();
  await page.getByRole('button', { name: 'Create new learner', exact: true }).click();
  await page.getByLabel('First name', { exact: true }).fill('Zoe');
  await page.getByLabel('Last name', { exact: true }).fill('Reyes');
  await page.getByRole('button', { name: 'Create and add learner', exact: true }).click(); await confirm('Create and add');
  await expect(page.getByText('Learner created and added to the Section.', { exact: true })).toBeVisible();
  async function linkClass(subject) {
    await visit(sectionPath + '/classes/link');
    await expect(page.getByText('Grade level does not match.', { exact: true })).toBeVisible();
    const row = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: new RegExp(`^${subject} ·`) }) });
    await row.getByRole('button', { name: 'Link class', exact: true }).click(); await confirm('Link class');
    await page.waitForURL(base + sectionPath + '/classes');
  }
  await linkClass('Mathematics');
  assert.deepEqual(await checked(admin.rpc('class_record_snapshot', { p_class_id: math }), 'snapshot after link'), before);
  await visit(`/classes/${math}`);
  await expect(page.getByRole('link', { name: `Grade 8 - ${sectionName}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Change or unlink Section', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await visit(sectionPath + '/learners/add');
  await page.getByLabel('Search learners', { exact: true }).fill('Ana');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const mathLearner = page.getByRole('listitem').filter({ hasText: 'Mathematics class with' });
  await mathLearner.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Add selected (1)', exact: true }).click(); await confirm('Add learners');
  await expect(page.getByText('Selected learners added to the Section.', { exact: true })).toBeVisible();
  await linkClass('Science');
  await visit(sectionPath + '/learners/add');
  await page.getByRole('button', { name: 'Add from linked class', exact: true }).click();
  await chooseOption(page.getByLabel('Choose linked class', { exact: true }),science);
  await page.getByRole('button', { name: 'Load learners', exact: true }).click();
  await page.getByRole('listitem').filter({ hasText: 'Ana Cruz' }).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Add selected (1)', exact: true }).click(); await confirm('Add learners');
  await expect(page.getByRole('heading', { name: 'Possible duplicate', exact: true })).toBeVisible();
  assert.equal((await checked(admin.from('section_enrollments').select('id').eq('section_id', sectionId).eq('learner_id', anaB), 'unconfirmed duplicate')).length, 0);
  await screenshot('duplicate-warning', 320);
  await page.getByRole('button', { name: 'Keep separate', exact: true }).click();
  await expect(page.getByText('Selected learners added to the Section.', { exact: true })).toBeVisible();
  rows = await checked(admin.from('section_enrollments').select('learner_id').eq('section_id', sectionId), 'members');
  assert.ok(rows.some(r => r.learner_id === anaA) && rows.some(r => r.learner_id === anaB));
  await visit(sectionPath + '/learners');
  const zoe = page.getByRole('listitem').filter({ hasText: 'Zoe Reyes' });
  await zoe.getByRole('button', { name: 'Remove', exact: true }).click(); await confirm('Remove');
  await expect(zoe).toHaveCount(0);
  await page.getByLabel('Show inactive learners', { exact: true }).check();
  await zoe.getByRole('button', { name: 'Reactivate', exact: true }).click(); await confirm('Reactivate');
  await expect(zoe.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
  await chooseOption(page.getByLabel('Linked class', { exact: true }),math);
  await page.getByRole('button', { name: 'Compare learners', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'In both · 1', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Only in Section · 2', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Only in Mathematics · 1', exact: true })).toBeVisible();
  for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Roster overflow at ${width}`);
    await screenshot('roster-comparison', width);
  }
  await visit(sectionPath + '/edit');
  await page.getByLabel('Grade level', { exact: true }).fill('Grade 9');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('conflicts'); await screenshot('context-error', 320);
  // All main Section surfaces, including long labels, at every requested width.
  for (const path of ['/sections', sectionPath, sectionPath + '/classes', sectionPath + '/classes/link', sectionPath + '/learners/add', sectionPath + '/edit', '/sections/new', `/classes/${math}/section`]) {
    await visit(path);
    for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} overflow at ${width}`);
      if (width < 768) {
        const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
        await expect(nav.getByRole('link')).toHaveCount(5);
        await expect(nav.getByRole('link', { name: 'Classes', exact: true })).toHaveAttribute('aria-current', 'page');
      }
    }
  }
  await visit(sectionPath);
  await page.getByText('More Section actions', { exact: true }).click();
  await expect(page.getByText('This Section still has linked classes. Unlink them before deleting the Section.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Archive Section', exact: true }).click(); await confirm('Archive Section');
  await expect(page.getByRole('button', { name: 'Reactivate Section', exact: true })).toBeVisible();
  assert.equal((await checked(admin.from('classes').select('section_id,status').eq('id', math), 'archived links'))[0].section_id, sectionId);
  await page.getByRole('button', { name: 'Reactivate Section', exact: true }).click(); await confirm('Reactivate Section');
  await visit(sectionPath + '/classes');
  for (const subject of ['Mathematics', 'Science']) {
    await page.getByRole('listitem').filter({ has: page.getByRole('link', { name: new RegExp(`^${subject}`) }) }).getByRole('button', { name: 'Unlink', exact: true }).click(); await confirm('Unlink');
  }
  assert.deepEqual(await checked(admin.rpc('class_record_snapshot', { p_class_id: math }), 'final class snapshot'), before);
  assert.equal((await checked(admin.from('class_record_sync_versions').select('id').eq('class_id', math), 'sync versions')).length, 0);
  await visit(sectionPath); await page.getByText('More Section actions', { exact: true }).click();
  await page.getByLabel(`Type “${sectionName}” to confirm`, { exact: true }).fill(sectionName);
  await page.getByRole('button', { name: 'Delete Section', exact: true }).click(); await confirm('Delete Section');
  await page.waitForURL(base + '/sections');
  assert.equal((await checked(admin.from('sections').select('id').eq('id', sectionId), 'deleted Section')).length, 0);
  assert.equal((await checked(admin.from('learners').select('id').eq('teacher_id', userId), 'retained learners')).length, 4);
  assert.equal(runtimeErrors.length, 0);
  console.log('Section CRUD, adviser-only learner, exact-ID roster changes, duplicate review, comparison, archive/reactivate, safe deletion and link/unlink passed against the verified remote project.');
  console.log('Nine Section/class-link surfaces passed 320, 360, 390, 430, 768, 1024 and 1440px checks. Five mobile destinations retained. Class snapshot, scores, attendance and revision unchanged.');
} finally {
  await browser?.close();
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    assert.ok(!deleted.error, `Cleanup failed for temporary fixture ${userId}`);
    console.log('Temporary test account and all remaining fixture data removed.');
  }
}
