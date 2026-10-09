// Замеры проверки картинок: последние 25 проверок ИИ — сколько занял каждый шаг (мс).
// В журнал GitHub — только числа, никаких данных пользователей (репозиторий открытый).
const REF = 'exjpqpmfdumjqzgehtpg'
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'select timing from image_checks where timing is not null order by created_at desc limit 25' }),
})
if (!r.ok) throw new Error(`ошибка ${r.status}: ${(await r.text()).slice(0, 300)}`)
const rows = await r.json()
const cols = ['total', 'cold', 'lookup', 'download', 'kb', 'login', 'upload', 'ai', 'tokens_in', 'tokens_out', 'save']
console.log(cols.join('\t'))
for (const { timing } of rows) console.log(cols.map((c) => timing?.[c] ?? '').join('\t'))
if (!rows.length) console.log('замеров пока нет')
