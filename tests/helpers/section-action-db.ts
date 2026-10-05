import type { PGlite } from '@electric-sql/pglite';

/** Small PostgREST adapter for action tests: mutations run against real PGlite RLS/FKs. */
export function actionDb(db: PGlite, writes: { table: string; operation: string; value: unknown }[], rejectEnrollment = false) {
  return { from(table: string) {
    let operation = 'select', value: Record<string, unknown> | Record<string, unknown>[] = {}, fields = '*', single = false, head = false;
    const filters: { key: string; operator: string; value: unknown }[] = [];
    let offset = 0, limit: number | null = null;
    const query = {
      select(columns = '*', options?: { head?: boolean }) { fields = columns; head = !!options?.head; return query; },
      insert(row: typeof value) { operation = 'insert'; value = row; return query; },
      upsert(row: typeof value) { operation = 'upsert'; value = row; return query; },
      update(row: typeof value) { operation = 'update'; value = row; return query; },
      delete() { operation = 'delete'; return query; },
      eq(key: string, val: unknown) { filters.push({ key, operator: '=', value: val }); return query; },
      is(key: string, val: unknown) { filters.push({ key, operator: 'is', value: val }); return query; },
      in(key: string, val: unknown[]) { filters.push({ key, operator: 'in', value: val }); return query; },
      order() { return query; },
      range(from: number, to: number) { offset = from; limit = to - from + 1; return query; },
      limit(n: number) { limit = n; return query; },
      maybeSingle() { single = true; return query; },
      async then(resolve: (value: unknown) => unknown) {
        try {
          if (rejectEnrollment && table === 'section_enrollments' && operation === 'upsert') return resolve({ data: null, error: { code: '42501' } });
          const params: unknown[] = [];
          const bind = (v: unknown) => { params.push(v); return `$${params.length}`; };
          let sql = '';
          if (operation === 'insert' || operation === 'upsert') {
            const rows = Array.isArray(value) ? value : [value], keys = Object.keys(rows[0]);
            sql = `insert into public.${table} (${keys.join(',')}) values ${rows.map(row => `(${keys.map(k => bind(row[k])).join(',')})`).join(',')}`;
            if (operation === 'upsert') sql += ' on conflict (section_id,learner_id) do nothing';
          } else if (operation === 'update') {
            sql = `update public.${table} t set ${Object.entries(value).map(([k, v]) => `${k}=${bind(v)}`).join(',')}`;
          } else if (operation === 'delete') sql = `delete from public.${table} t`;
          else {
            const select = fields.includes('learner:learners')
              ? `t.${table === 'section_enrollments' ? 'id,t.status,' : 'learner_id,'} jsonb_build_object('id',l.id,'display_name',l.display_name,'first_name',l.first_name,'last_name',l.last_name) learner`
              : fields === '*' ? 't.*' : fields.split(',').map(f => `t.${f}`).join(',');
            sql = `select ${select} from public.${table} t`;
            if (fields.includes('learner:learners')) sql += ' join public.learners l on l.id=t.learner_id';
          }
          if (filters.length) sql += ' where ' + filters.map(f => f.operator === 'is' ? `t.${f.key} is null` : f.operator === 'in' ? `t.${f.key} in (${(f.value as unknown[]).map(bind).join(',')})` : `t.${f.key}=${bind(f.value)}`).join(' and ');
          if (operation === 'select' && limit !== null) sql += ` limit ${limit} offset ${offset}`;
          if (operation !== 'select') { writes.push({ table, operation, value }); sql += ' returning *'; }
          const result = await db.query(sql, params);
          return resolve({ data: head ? null : single ? result.rows[0] ?? null : result.rows, count: result.rows.length, error: null });
        } catch (error) { return resolve({ data: null, count: null, error: { code: (error as { code: string }).code } }); }
      },
    };
    return query;
  } };
}
