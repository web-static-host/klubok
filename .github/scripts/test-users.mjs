// Тестовые пользователи (klubok.test.*@example.com): создать, сдвинуть даты для проверки сводки, удалить всё тестовое.
// Трогает только эти адреса. Ключ сервиса берётся по ключу доступа Supabase и сразу скрывается в журнале.
const REF = 'exjpqpmfdumjqzgehtpg'
const URL_ = `https://${REF}.supabase.co`
const T = process.env.SUPABASE_ACCESS_TOKEN
const USERS = [
  { email: 'klubok.test.a@example.com', name: 'Тест Автор', handle: 'test_author', admin: true },
  { email: 'klubok.test.b@example.com', name: 'Тест Зритель', handle: 'test_viewer' },
  { email: 'klubok.test.c@example.com', name: 'Тест Нарушитель', handle: 'test_bad' },
]
const EMAILS = USERS.map((u) => `'${u.email}'`).join(',')

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 300)}`)
  return r.json()
}
async function serviceKey() {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${T}` } })
  const keys = await r.json()
  const k = keys.find((x) => x.name === 'service_role')?.api_key ?? keys.find((x) => x.type === 'secret')?.api_key
  if (!k) throw new Error('нет ключа сервиса')
  console.log(`::add-mask::${k}`)
  return k
}
const ids = async () => (await sql(`select id from auth.users where email in (${EMAILS})`)).map((r) => r.id)

const op = process.env.OP
if (op === 'create') {
  let hash = process.env.HASH ?? ''
  if (!/^\$2[aby]\$\d\d\$.{53}$/.test(hash)) throw new Error('нужна bcrypt-запись пароля')
  hash = hash.replace(/^\$2b\$/, '$2a$')
  const key = await serviceKey()
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  let made = 0, had = 0
  for (const u of USERS) {
    const [old] = await sql(`select id from auth.users where email = '${u.email}'`)
    if (old) {
      // уже есть — обновляем пароль
      const r = await fetch(`${URL_}/auth/v1/admin/users/${old.id}`, { method: 'PUT', headers: h, body: JSON.stringify({ password_hash: hash, email_confirm: true }) })
      if (!r.ok) throw new Error(`обновить: ${r.status} ${(await r.text()).slice(0, 200)}`)
      had++
      continue
    }
    const r = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ email: u.email, password_hash: hash, email_confirm: true, user_metadata: { name: u.name, handle: u.handle } }),
    })
    if (!r.ok) throw new Error(`создать: ${r.status} ${(await r.text()).slice(0, 200)}`)
    made++
  }
  await sql(`insert into admins (user_id) select p.id from profiles p join auth.users a on a.id = p.id where a.email = '${USERS[0].email}' on conflict do nothing`)
  const [c] = await sql(`select count(*)::int as n from profiles p join auth.users a on a.id = p.id where a.email in (${EMAILS})`)
  console.log(`создано: ${made}, уже было: ${had}, профилей: ${c.n}, админ: 1`)
} else if (op === 'backdate') {
  // проверка сводки сохранений: сохранения автора — «вчера», сводка — давно не присылалась
  const [a] = await sql(`select id from auth.users where email = '${USERS[0].email}'`)
  const r1 = await sql(`with u as (update events set created_at = created_at - interval '1 day' where owner_id = '${a.id}' and kind = 'save' returning 1) select count(*)::int as n from u`)
  await sql(`insert into notification_settings (user_id, saves, saves_digest_at) values ('${a.id}', 'daily', current_date - 3)
             on conflict (user_id) do update set saves = 'daily', saves_digest_at = current_date - 3`)
  console.log(`сдвинуто сохранений: ${r1[0].n}`)
} else if (op === 'cleanup') {
  const list = await ids()
  if (!list.length) {
    console.log('тестовых пользователей нет')
    process.exit(0)
  }
  const key = await serviceKey()
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  // картинки в их папках
  let files = 0
  for (const id of list) {
    const r = await fetch(`${URL_}/storage/v1/object/list/images`, { method: 'POST', headers: h, body: JSON.stringify({ prefix: id, limit: 1000 }) })
    const items = r.ok ? await r.json() : []
    const paths = items.map((x) => `${id}/${x.name}`)
    if (paths.length) {
      await fetch(`${URL_}/storage/v1/object/images`, { method: 'DELETE', headers: h, body: JSON.stringify({ prefixes: paths }) })
      files += paths.length
    }
  }
  const inList = list.map((x) => `'${x}'`).join(',')
  await sql(`
    delete from reports where reporter_id in (${inList})
      or (target_type = 'profile' and target_id in (${inList}))
      or (target_type = 'post' and target_id in (select id from posts where author_id in (${inList})))
      or (target_type = 'try' and target_id in (select id from tries where user_id in (${inList}) or post_id in (select id from posts where author_id in (${inList}))))
      or (target_type = 'reply' and target_id in (select id from try_replies where user_id in (${inList})));
    delete from admin_log where admin_id in (${inList}) or target_id in (${inList})
      or target_id in (select id from posts where author_id in (${inList}));
    delete from events where user_id in (${inList}) or viewer in (${list.map((x) => `'${x}'`).join(',')}) or owner_id in (${inList});
    delete from admins where user_id in (${inList});
    delete from profiles where id in (${inList});
  `)
  for (const id of list) await fetch(`${URL_}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: h })
  const [left] = await sql(`select count(*)::int as n from auth.users where email in (${EMAILS})`)
  console.log(`удалено пользователей: ${list.length - left.n}, картинок: ${files}, осталось: ${left.n}`)
} else {
  throw new Error('op: create | backdate | cleanup')
}
