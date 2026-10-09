// Обновления базы: запускает новые файлы supabase/migrations/*.sql по порядку, каждый — один раз.
// Что уже запущено — в таблице klubok_admin.migrations (схема не видна сайту).
// Обновления 002–005 владелец запускал вручную — при первом запуске они отмечаются как сделанные.
// В журнал GitHub пишутся только имена файлов и ошибки — никаких данных из базы (репозиторий открытый).
import { readdirSync, readFileSync } from 'node:fs'

const REF = 'exjpqpmfdumjqzgehtpg'
const DIR = 'supabase/migrations'
const BASELINE = '005'
const token = process.env.SUPABASE_ACCESS_TOKEN

async function sql(query) {
  const r = await fetch(`${process.env.SUPABASE_API ?? 'https://api.supabase.com'}/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`ошибка ${r.status}: ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : []
}
const lit = (s) => `'${s.replace(/'/g, "''")}'`

await sql(`create schema if not exists klubok_admin;
  create table if not exists klubok_admin.migrations (name text primary key, applied_at timestamptz not null default now());`)
const files = readdirSync(DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()
let done = new Set((await sql('select name from klubok_admin.migrations')).map((r) => r.name))
if (done.size === 0) {
  const base = files.filter((f) => f.slice(0, 3) <= BASELINE)
  if (base.length) await sql(`insert into klubok_admin.migrations (name) values ${base.map((f) => `(${lit(f)})`).join(', ')} on conflict do nothing`)
  console.log('Отмечены как уже сделанные вручную:', base.join(', ') || 'нет')
  done = new Set(base)
}
const todo = files.filter((f) => !done.has(f))
if (!todo.length) console.log('Новых обновлений нет')
for (const f of todo) {
  const body = readFileSync(`${DIR}/${f}`, 'utf8')
  await sql(`begin;\n${body}\n;insert into klubok_admin.migrations (name) values (${lit(f)});\ncommit;`)
  console.log('Запущено:', f)
}
