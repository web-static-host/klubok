// Тестовые пользователи (klubok.test.*@example.com): создать, сдвинуть даты для проверки сводки, удалить всё тестовое.
// Трогает только эти адреса. Ключ сервиса берётся по ключу доступа Supabase и сразу скрывается в журнале.
const REF = 'exjpqpmfdumjqzgehtpg'
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
const ids = async () => (await sql(`select id from auth.users where email in (${EMAILS})`)).map((r) => r.id)

const op = process.env.OP
if (op === 'create') {
  let hash = process.env.HASH ?? ''
  if (!/^\$2[aby]\$\d\d\$.{53}$/.test(hash)) throw new Error('нужна bcrypt-запись пароля')
  hash = hash.replace(/^\$2b\$/, '$2a$')
  let made = 0, had = 0
  for (const u of USERS) {
    const [old] = await sql(`select id from auth.users where email = '${u.email}'`)
    if (old) {
      await sql(`update auth.users set encrypted_password = '${hash}', email_confirmed_at = coalesce(email_confirmed_at, now()) where id = '${old.id}'`)
      had++
      continue
    }
    // как при обычной регистрации с подтверждённой почтой: пользователь + способ входа «почта»; профиль и папку создаст база (триггер)
    await sql(`
      with u as (
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '${u.email}', '${hash}', now(),
          '{"provider":"email","providers":["email"]}', '${JSON.stringify({ name: u.name, handle: u.handle })}', now(), now())
        returning id
      )
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', '${u.email}', 'email_verified', true), 'email', now(), now(), now() from u`)
    made++
  }
  // пустые строки вместо NULL в служебных полях (иначе вход по паролю спотыкается)
  await sql(`do $$ declare c text; begin
    for c in select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users'
      and data_type in ('character varying', 'text') and is_nullable = 'YES'
      and column_name in ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change', 'email_change_token_current',
                          'phone_change', 'phone_change_token', 'reauthentication_token') loop
      execute format('update auth.users set %I = coalesce(%I, '''') where email in (${EMAILS.replace(/'/g, "''")})', c, c);
    end loop; end $$`)
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
  // картинки тестовых пользователей удаляются заранее их же входом (функцией publish и хранилищем) — здесь только записи в базе
  const list = await ids()
  if (!list.length) {
    console.log('тестовых пользователей нет')
    process.exit(0)
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
    delete from auth.users where id in (${inList});
  `)
  const [left] = await sql(`select count(*)::int as n from auth.users where email in (${EMAILS})`)
  const [files] = await sql(`select count(*)::int as n from storage.objects where bucket_id = 'images' and split_part(name, '/', 1) in (${list.map((x) => `'${x}'`).join(',')})`)
  console.log(`удалено пользователей: ${list.length - left.n}, осталось: ${left.n}, картинок в их папках осталось: ${files.n}`)
} else {
  throw new Error('op: create | backdate | cleanup')
}
