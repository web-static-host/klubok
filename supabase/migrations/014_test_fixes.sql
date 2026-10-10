-- Клубок, обновление 14: исправления по итогам проверки под тестовыми пользователями (10 октября).
-- Запускается само из GitHub. Повторный запуск ничего не ломает.

-- 1. Служебные функции — только для базы. Supabase по умолчанию разрешает сайту вызывать любые функции
--    (отдельно для anon и authenticated), поэтому «revoke from public» мало: иначе любой мог прислать кому угодно уведомление.
do $$
declare f text;
begin
  foreach f in array array[
    'notify(uuid, text, uuid, uuid, uuid, jsonb, text)', 'notify_wanted(uuid, text)', 'admin_check()',
    'on_try_notify()', 'on_reply_notify()', 'on_follow_event()', 'on_save_event()', 'on_post_hidden_notify()',
    'bump_post_saves()', 'bump_followers()', 'bump_post_tries()', 'handle_new_user()'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end $$;

-- 2. Настройки уведомлений: сайт сохраняет их «вставить или обновить» — нужно право обновлять и user_id (своё — проверяет доступ)
grant update (user_id, tried, reply, follower, saves, moderation) on notification_settings to authenticated;

-- 3. Сохранения: убрали идею сразу из нескольких папок одним действием — «убрали» считается один раз
create or replace function on_save_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who uuid;
  pid uuid := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  fid uuid := case when tg_op = 'DELETE' then old.folder_id else new.folder_id end;
  p record;
begin
  select owner_id into who from folders where id = fid;
  select author_id, title into p from posts where id = pid;
  if who is null or p.author_id is null or who = p.author_id then return null; end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from folder_items fi join folders f on f.id = fi.folder_id
               where fi.post_id = pid and f.owner_id = who and fi.folder_id <> fid) then return null; end if;
    insert into events (kind, post_id, owner_id, viewer, user_id) values ('save', pid, p.author_id, who::text, who);
    perform notify(p.author_id, 'saved', who, pid, null, jsonb_build_object('title', p.title));
  elsif tg_op = 'DELETE' then
    if exists (select 1 from folder_items fi join folders f on f.id = fi.folder_id
               where fi.post_id = pid and f.owner_id = who) then return null; end if;
    -- в этом же действии уже записали (удаляли несколько строк сразу)
    if exists (select 1 from events where kind = 'unsave' and post_id = pid and viewer = who::text and created_at = now()) then return null; end if;
    insert into events (kind, post_id, owner_id, viewer, user_id) values ('unsave', pid, p.author_id, who::text, who);
  elsif new.done is distinct from old.done then
    insert into events (kind, post_id, owner_id, viewer, user_id)
    values (case when new.done then 'done' else 'undone' end, pid, p.author_id, who::text, who);
  end if;
  return null;
end $$;
revoke all on function on_save_event() from public, anon, authenticated;

-- 4. Поиск: от двух букв (одна буква находила почти всё)
create or replace function search_posts(p_q text, p_topics text[] default '{}', p_offset int default 0, p_limit int default 30)
returns setof posts
language sql stable security definer set search_path = public as $$
  with q as (select '%' || replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
                    char_length(btrim(coalesce(p_q, ''))) >= 2 as ok)
  select p.* from posts p join profiles a on a.id = p.author_id, q
  where q.ok and not p.hidden and (
    lower(p.title) like q.pat
    or p.topics && coalesce(p_topics, '{}')
    or exists (select 1 from unnest(p.tags || p.ai_tags || p.topics) as t where lower(t) like q.pat)
    or lower(coalesce(p.ai_text, '')) like q.pat
    or lower(a.name) like q.pat
  )
  order by (lower(p.title) like q.pat) desc, p.saves_count desc, p.created_at desc
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 60)
$$;
revoke all on function search_posts(text, text[], int, int) from public;
grant execute on function search_posts(text, text[], int, int) to anon, authenticated;

-- 5. Время на странице идеи — не больше 30 минут за раз, номер картинки — не больше 10 (накрутку обрезаем)
create or replace function track(p_events jsonb, p_anon text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  who text := coalesce(uid::text, 'a:' || left(regexp_replace(coalesce(p_anon, ''), '[^a-zA-Z0-9-]', '', 'g'), 40));
  e jsonb;
  k text;
  pid uuid;
  own uuid;
  val int;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then return; end if;
  for e in select x from jsonb_array_elements(p_events) with ordinality as t(x, n) where n <= 200 loop
    if jsonb_typeof(e) <> 'object' then continue; end if;
    k := e ->> 'k';
    if k is null or k not in ('view', 'open', 'slide', 'dwell', 'share', 'profile', 'follow_post') then continue; end if;
    pid := null;
    own := null;
    begin
      pid := nullif(e ->> 'p', '')::uuid;
      if pid is null and k = 'profile' then own := nullif(e ->> 'u', '')::uuid; end if;
      val := greatest(coalesce(nullif(e ->> 'v', '')::numeric, 0), 0)::int;
    exception when others then
      continue;
    end;
    val := case k when 'dwell' then least(val, 1800) when 'slide' then least(val, 10) else least(val, 36000) end;
    if pid is not null then
      select author_id into own from posts where id = pid;
    elsif own is not null and not exists (select 1 from profiles where id = own) then
      own := null;
    end if;
    if own is null then continue; end if;
    if uid is not null and own = uid then continue; end if;
    insert into events (kind, post_id, owner_id, viewer, user_id, source, device, value)
    values (k, pid, own, who, uid, left(e ->> 's', 20), left(e ->> 'd', 10), val);
  end loop;
end $$;
revoke all on function track(jsonb, text) from public;
grant execute on function track(jsonb, text) to anon, authenticated;
