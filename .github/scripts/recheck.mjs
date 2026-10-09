// Перепроверка одной идеи: функция publish разбирает её картинки заново (действие admin-recheck).
// В журнал GitHub — только «скрыта / нет» и замеры, никаких текстов и причин (репозиторий открытый).
const REF = 'exjpqpmfdumjqzgehtpg'
const r = await fetch(`https://${REF}.supabase.co/functions/v1/publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-admin-token': process.env.SUPABASE_ACCESS_TOKEN },
  body: JSON.stringify({ action: 'admin-recheck', post: process.env.POST_ID }),
})
const v = await r.json()
if (!v.ok) throw new Error(`ошибка ${r.status}`)
console.log(`была скрыта: ${v.was_hidden}, теперь скрыта: ${v.hidden}, всего: ${v.total} мс`)
const cols = ['ai', 'tokens_out', 'text_ai', 'text_out']
console.log('картинка\t' + cols.join('\t'))
v.images.forEach((t, i) => console.log(`${i + 1}\t` + cols.map((c) => t[c] ?? '').join('\t')))
