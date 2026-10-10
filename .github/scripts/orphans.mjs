// Уборка ничейных картинок: функция publish удаляет файлы, на которые не ссылается ни идея, ни отзыв, ни аватарка (действие admin-orphans).
// В журнал GitHub — только число удалённых (репозиторий открытый).
const REF = 'exjpqpmfdumjqzgehtpg'
const r = await fetch(`https://${REF}.supabase.co/functions/v1/publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-admin-token': process.env.SUPABASE_ACCESS_TOKEN },
  body: JSON.stringify({ action: 'admin-orphans' }),
})
const v = await r.json().catch(() => ({}))
if (!v.ok) throw new Error(`ошибка ${r.status}`)
console.log(`удалено ничейных картинок: ${v.removed}`)
