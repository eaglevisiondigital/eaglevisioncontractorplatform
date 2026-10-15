import { createTestDatabase } from '../tests/database/engine.ts';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { format } from 'prettier';
const db = createTestDatabase();
try {
  await db.exec(readFileSync('tests/database/bootstrap.sql', 'utf8'));
  for (const file of readdirSync('supabase/migrations').sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  const enums = (
    await db.query(
      "select t.typname, array_agg(e.enumlabel::text order by e.enumsortorder) labels from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' group by t.typname",
    )
  ).rows;
  function type(pg) {
    if (pg.endsWith('[]')) return `(${type(pg.slice(0, -2))})[]`;
    const e = enums.find(
      (e) => e.typname === pg || `public.${e.typname}` === pg,
    );
    if (e) return e.labels.map((v) => JSON.stringify(v)).join(' | ');
    if (
      [
        'uuid',
        'text',
        'timestamp with time zone',
        'character varying',
        'bytea',
        'date',
      ].includes(pg)
    )
      return 'string';
    if (
      ['integer', 'bigint', 'smallint', 'numeric', 'double precision'].includes(
        pg,
      )
    )
      return 'number';
    if (pg === 'boolean') return 'boolean';
    if (pg === 'jsonb' || pg === 'json') return 'Json';
    if (pg === 'void') return 'undefined';
    throw new Error(`Unmapped database type: ${pg}`);
  }
  const columns = (
    await db.query(`select c.relname,a.attname,format_type(a.atttypid,a.atttypmod) typ,a.attnotnull,a.atthasdef
 from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
 where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`)
  ).rows;
  const tables = [...new Set(columns.map((c) => c.relname))];
  let out =
    '// Generated from a disposable PostgreSQL catalog after applying committed migrations.\n// Run npm run types:generate; do not hand-edit. Hosted schema verification is separate.\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\nexport interface Database { public: { Tables: {\n';
  for (const table of tables) {
    const cols = columns.filter((c) => c.relname === table);
    out += `${JSON.stringify(table)}: {\n`;
    for (const mode of ['Row', 'Insert', 'Update'])
      out += `${mode}: {${cols.map((c) => `${JSON.stringify(c.attname)}${mode === 'Update' || (mode === 'Insert' && (!c.attnotnull || c.atthasdef)) ? '?' : ''}: ${type(c.typ)}${c.attnotnull ? '' : ' | null'};`).join('\n')}};\n`;
    out += 'Relationships: []; };\n';
  }
  out += '}; Views: {[_ in never]: never}; Functions: {\n';
  const functions = (
    await db.query(
      `select p.proname,p.proargnames names,(select json_agg(format_type(v,null)) from unnest(p.proargtypes) v) types,p.pronargdefaults defaults,format_type(p.prorettype,null) result from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prorettype<>'trigger'::regtype order by proname`,
    )
  ).rows;
  for (const f of functions)
    out += `${JSON.stringify(f.proname)}: {Args: {${(f.names ?? []).map((n, i) => `${JSON.stringify(n)}${i >= f.names.length - f.defaults ? '?' : ''}: ${type(f.types[i])} | null;`).join('')}}; Returns: ${type(f.result)};};\n`;
  out +=
    '}; Enums: {' +
    enums
      .map((e) => `${JSON.stringify(e.typname)}:${type(e.typname)};`)
      .join('') +
    '}; CompositeTypes: {[_ in never]: never};};}\n';
  out = out.replaceAll('Args: {}', 'Args: Record<string, never>');
  out = await format(out, { parser: 'typescript', singleQuote: true });
  const path = 'src/lib/database.types.ts';
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== out)
      throw new Error('Database types drift: run npm run types:generate');
  } else writeFileSync(path, out);
} finally {
  await db.close();
}
