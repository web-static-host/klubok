-- Клубок, обновление 13: жалобы и админка, подробная статистика автора, лента «Для вас» по интересам,
-- «Не интересно», уведомления с настройками, подгрузка порциями (лента, поиск, профиль — запросами к базе).
-- Запускается само из GitHub (.github/workflows/supabase.yml). Повторный запуск ничего не ломает.

-- ─── Администраторы ─────────────────────────────────────────
-- Кто админ — только в этой таблице; сайт её не читает, проверяют функции базы и функция publish.
create table if not exists admins (
  user_id uuid primary key references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table admins enable row level security;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;
revoke all on function is_admin() from public;
grant execute on function is_admin() to anon, authenticated;

-- первый админ — владелец (аккаунт «Неделя вкуса»)
insert into admins (user_id) select id from profiles where handle = 'nedelya_vkusa' and not is_demo on conflict do nothing;

-- ─── Блокировка: заблокированный не может публиковать, отвечать, жаловаться ───
alter table profiles add column if not exists blocked boolean not null default false;
-- менять может только функция publish (обычных прав на это поле у сайта нет)
revoke update on profiles from anon, authenticated;
grant update (name, handle, bio, colors, avatar_url) on profiles to authenticated;

-- ─── Кто скрыл идею: ИИ ('ai') или модератор ('moderator') ───
alter table posts add column if not exists hidden_by text;
update posts set hidden_by = 'ai' where hidden and hidden_by is null;

-- ─── Жалобы ─────────────────────────────────────────────────
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles (id) on delete cascade,
  -- на что: идея, отзыв «Я попробовал», ответ на отзыв, профиль
  target_type text not null check (target_type in ('post', 'try', 'reply', 'profile')),
  target_id uuid not null,
  -- abuse — мат и оскорбления, people — люди на картинке, ads — реклама и ссылки, danger — опасное, spam, stolen — «это моя картинка», other
  reason text not null check (reason in ('abuse', 'people', 'ads', 'danger', 'spam', 'stolen', 'other')),
  comment text check (char_length(comment) <= 500),
  -- «это моя картинка»: где она опубликована раньше
  link text check (char_length(link) <= 500),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  resolved_by uuid references profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index if not exists reports_target_idx on reports (target_type, target_id);
create index if not exists reports_status_idx on reports (status, created_at desc);
alter table reports enable row level security;
drop policy if exists "свои жалобы: видеть" on reports;
drop policy if exists "жалоба: создать" on reports;
create policy "свои жалобы: видеть" on reports for select to authenticated using (reporter_id = auth.uid());
create policy "жалоба: создать" on reports for insert to authenticated
  with check (
    reporter_id = auth.uid() and status = 'open' and resolved_by is null and resolved_at is null
    and not exists (select 1 from profiles where id = auth.uid() and blocked)
  );

-- ─── Журнал действий админов ────────────────────────────────
create table if not exists admin_log (
  id bigserial primary key,
  admin_id uuid references profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists admin_log_created_idx on admin_log (created_at desc);
alter table admin_log enable row level security;

-- ─── События для статистики и ленты «Для вас» ──────────────
-- Пишутся только функцией track (с сайта) и триггерами (сохранения, подписки). Читают — только функции статистики.
-- viewer — кто: id вошедшего или случайный номер браузера ('a:…'), чтобы считать разных людей; кто именно — автору не показывается.
create table if not exists events (
  id bigserial primary key,
  -- view — карточку показали, open — открыли идею, slide — долистали до картинки (value — номер), dwell — секунд на странице идеи,
  -- share — «Поделиться», profile — открыли профиль, follow_post — подписались со страницы идеи,
  -- save / unsave — человек сохранил / убрал из всех папок, done / undone — «Сделано», follow / unfollow — подписка на автора
  kind text not null,
  post_id uuid references posts (id) on delete cascade,
  -- чьё: автор идеи или владелец профиля
  owner_id uuid references profiles (id) on delete cascade,
  viewer text,
  user_id uuid references profiles (id) on delete set null,
  -- откуда: home, search, following, profile, more, folder, post, link
  source text,
  -- телефон (mobile) или компьютер (desktop)
  device text,
  value int,
  created_at timestamptz not null default now()
);
create index if not exists events_owner_idx on events (owner_id, created_at);
create index if not exists events_post_idx on events (post_id, created_at);
create index if not exists events_user_idx on events (user_id, created_at) where user_id is not null;
alter table events enable row level security;

-- сайт присылает пачкой (до 200 событий); свои действия на своём не считаются
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
    k := e ->> 'k';
    if k is null or k not in ('view', 'open', 'slide', 'dwell', 'share', 'profile', 'follow_post') then continue; end if;
    pid := null;
    own := null;
    begin
      pid := nullif(e ->> 'p', '')::uuid;
      if pid is null and k = 'profile' then own := nullif(e ->> 'u', '')::uuid; end if;
      val := least(greatest(coalesce(nullif(e ->> 'v', '')::numeric, 0), 0), 36000)::int;
    exception when others then
      continue;
    end;
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

-- старые вкладки сайта ещё зовут track_posts — пишем в события (показ и открытие из ленты)
create or replace function track_posts(views uuid[] default '{}', clicks uuid[] default '{}') returns void
language sql security definer set search_path = public as $$
  select track(
    coalesce((select jsonb_agg(jsonb_build_object('k', 'view', 'p', v, 's', 'home')) from unnest((coalesce(views, '{}'::uuid[]))[1:100]) v), '[]'::jsonb)
    || coalesce((select jsonb_agg(jsonb_build_object('k', 'open', 'p', c, 's', 'home')) from unnest((coalesce(clicks, '{}'::uuid[]))[1:100]) c), '[]'::jsonb)
  )
$$;
revoke all on function track_posts(uuid[], uuid[]) from public;
grant execute on function track_posts(uuid[], uuid[]) to anon, authenticated;

-- показы и клики теперь считаются по событиям; счётчики в идее больше не нужны (их видели все)
alter table posts drop column if exists views_count;
alter table posts drop column if exists clicks_count;

-- ─── «Не интересно» ─────────────────────────────────────────
create table if not exists not_interested (
  user_id uuid not null references profiles (id) on delete cascade,
  post_id uuid not null references posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table not_interested enable row level security;
drop policy if exists "своё «не интересно»" on not_interested;
create policy "своё «не интересно»" on not_interested for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Уведомления ────────────────────────────────────────────
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  -- кому
  user_id uuid not null references profiles (id) on delete cascade,
  -- tried — повторили вашу идею, reply — ответили на ваш отзыв (или на отзыв к вашей идее), follower — новый подписчик,
  -- saved — сохранили идею, saves_daily — сводка сохранений за день, hidden / restored / removed — решение по вашей идее,
  -- report_done — жалобу рассмотрели
  kind text not null,
  -- кто сделал (нет — система или модератор)
  actor_id uuid references profiles (id) on delete set null,
  post_id uuid references posts (id) on delete set null,
  try_id uuid references tries (id) on delete set null,
  -- подробности: название идеи, причина, число сохранений, итог жалобы…
  data jsonb not null default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
alter table notifications enable row level security;
drop policy if exists "свои уведомления: видеть" on notifications;
drop policy if exists "свои уведомления: прочитать" on notifications;
drop policy if exists "свои уведомления: удалить" on notifications;
create policy "свои уведомления: видеть" on notifications for select to authenticated using (user_id = auth.uid());
create policy "свои уведомления: прочитать" on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "свои уведомления: удалить" on notifications for delete to authenticated using (user_id = auth.uid());
revoke update on notifications from anon, authenticated;
grant update (read) on notifications to authenticated;

-- какие уведомления присылать; saves: each — каждое сохранение, daily — сводкой за день, off — не присылать
create table if not exists notification_settings (
  user_id uuid primary key references profiles (id) on delete cascade,
  tried boolean not null default true,
  reply boolean not null default true,
  follower boolean not null default true,
  saves text not null default 'daily' check (saves in ('each', 'daily', 'off')),
  moderation boolean not null default true,
  -- по какой день (не включая) уже прислана сводка сохранений
  saves_digest_at date
);
alter table notification_settings enable row level security;
drop policy if exists "свои настройки уведомлений" on notification_settings;
create policy "свои настройки уведомлений" on notification_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on notification_settings from anon, authenticated;
grant update (tried, reply, follower, saves, moderation) on notification_settings to authenticated;

-- включено ли у человека уведомление такого вида (нет строки настроек — всё включено, сохранения — сводкой)
create or replace function notify_wanted(p_user uuid, p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p_kind
      when 'tried' then s.tried
      when 'reply' then s.reply
      when 'follower' then s.follower
      when 'saved' then s.saves = 'each'
      when 'moderation' then s.moderation
      else true end
    from notification_settings s where s.user_id = p_user
  ), p_kind <> 'saved')
$$;

create or replace function notify(p_user uuid, p_kind text, p_actor uuid, p_post uuid, p_try uuid, p_data jsonb, p_setting text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if not notify_wanted(p_user, coalesce(p_setting, p_kind)) then return; end if;
  insert into notifications (user_id, kind, actor_id, post_id, try_id, data)
  values (p_user, p_kind, p_actor, p_post, p_try, coalesce(p_data, '{}'::jsonb));
end $$;
revoke all on function notify(uuid, text, uuid, uuid, uuid, jsonb, text) from public;

-- повторили идею
create or replace function on_try_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select author_id, title into p from posts where id = new.post_id;
  perform notify(p.author_id, 'tried', new.user_id, new.post_id, new.id, jsonb_build_object('title', p.title, 'ok', new.ok));
  return null;
end $$;
drop trigger if exists try_notify on tries;
create trigger try_notify after insert on tries for each row execute function on_try_notify();

-- ответ на отзыв: автору отзыва и автору идеи
create or replace function on_reply_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select tr.user_id, tr.post_id, p.author_id, p.title into t from tries tr join posts p on p.id = tr.post_id where tr.id = new.try_id;
  if t.user_id is null then return null; end if;
  perform notify(t.user_id, 'reply', new.user_id, t.post_id, new.try_id,
    jsonb_build_object('title', t.title, 'text', left(new.text, 140), 'mine', true));
  if t.author_id is distinct from t.user_id then
    perform notify(t.author_id, 'reply', new.user_id, t.post_id, new.try_id,
      jsonb_build_object('title', t.title, 'text', left(new.text, 140), 'mine', false));
  end if;
  return null;
end $$;
drop trigger if exists reply_notify on try_replies;
create trigger reply_notify after insert on try_replies for each row execute function on_reply_notify();

-- подписки: уведомление и событие для статистики
create or replace function on_follow_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into events (kind, owner_id, viewer, user_id) values ('follow', new.following_id, new.follower_id::text, new.follower_id);
    perform notify(new.following_id, 'follower', new.follower_id, null, null, '{}'::jsonb);
  else
    insert into events (kind, owner_id, viewer, user_id) values ('unfollow', old.following_id, old.follower_id::text, old.follower_id);
  end if;
  return null;
end $$;
drop trigger if exists follow_event on follows;
create trigger follow_event after insert or delete on follows for each row execute function on_follow_event();

-- сохранения в папки: событие (человек считается один раз, сколько бы папок ни было) и уведомление «сохранили»
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
    insert into events (kind, post_id, owner_id, viewer, user_id) values ('unsave', pid, p.author_id, who::text, who);
  elsif new.done is distinct from old.done then
    insert into events (kind, post_id, owner_id, viewer, user_id)
    values (case when new.done then 'done' else 'undone' end, pid, p.author_id, who::text, who);
  end if;
  return null;
end $$;
drop trigger if exists save_event on folder_items;
create trigger save_event after insert or update or delete on folder_items for each row execute function on_save_event();

-- идею скрыли или вернули (ИИ или модератор) — автору
create or replace function on_post_hidden_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.hidden and not old.hidden then
    perform notify(new.author_id, 'hidden', null, new.id, null,
      jsonb_build_object('title', new.title, 'reason', new.hidden_reason, 'by', coalesce(new.hidden_by, 'ai')), 'moderation');
  elsif old.hidden and not new.hidden then
    perform notify(new.author_id, 'restored', null, new.id, null, jsonb_build_object('title', new.title), 'moderation');
  end if;
  return null;
end $$;
drop trigger if exists post_hidden_notify on posts;
create trigger post_hidden_notify after update of hidden on posts for each row execute function on_post_hidden_notify();

-- сводка сохранений за прошедшие дни (для тех, у кого «сводкой»): сайт зовёт, когда открывает уведомления
create or replace function notifications_digest() returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s record;
  today date := (now() at time zone 'Europe/Moscow')::date;
  d date;
  n int;
  titles jsonb;
begin
  if uid is null then return; end if;
  insert into notification_settings (user_id, saves_digest_at) values (uid, today) on conflict (user_id) do nothing;
  select * into s from notification_settings where user_id = uid for update;
  if s.saves <> 'daily' then
    update notification_settings set saves_digest_at = today where user_id = uid;
    return;
  end if;
  d := greatest(coalesce(s.saves_digest_at, today), today - 14);
  while d < today loop
    select count(*), coalesce(jsonb_agg(distinct p.title), '[]'::jsonb) into n, titles
    from events e join posts p on p.id = e.post_id
    where e.owner_id = uid and e.kind = 'save' and (e.created_at at time zone 'Europe/Moscow')::date = d;
    if n > 0 then
      insert into notifications (user_id, kind, data, created_at)
      values (uid, 'saves_daily', jsonb_build_object('date', d, 'count', n, 'titles', titles),
              ((d + 1)::timestamp at time zone 'Europe/Moscow'));
    end if;
    d := d + 1;
  end loop;
  update notification_settings set saves_digest_at = today where user_id = uid;
end $$;
revoke all on function notifications_digest() from public;
grant execute on function notifications_digest() to authenticated;

-- ─── Лента «Для вас» ────────────────────────────────────────
-- В каждых 10 идеях: 7 — по интересам (что человек открывал, долго смотрел, листал, сохранял, повторял; «не интересно» — минус),
-- 2 — свежее и популярное, 1 — случайное (чтобы находить новое). Гостю и новичку — 9 свежих и популярных и 1 случайная.
-- p_seed — один на заход: порядок случайных не меняется при подгрузке следующих порций.
create or replace function feed(p_seed text default '', p_offset int default 0, p_limit int default 30, p_topic text default null)
returns setof posts
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  sig as (
    select e.post_id, sum(case e.kind
        when 'open' then 1
        when 'dwell' then least(e.value, 180) / 45.0
        when 'slide' then 0.3
        when 'save' then 4
        when 'share' then 3
        when 'follow_post' then 3
        when 'unsave' then -2
        else 0 end) as w
    from events e, me
    where me.uid is not null and e.user_id = me.uid and e.post_id is not null and e.created_at > now() - interval '120 days'
    group by e.post_id
    union all select t.post_id, 5 from tries t, me where t.user_id = me.uid
    union all select n.post_id, -8 from not_interested n, me where n.user_id = me.uid
  ),
  sig1 as (select post_id, sum(w) as w from sig group by post_id),
  tags as (
    select t, sum(s.w) as w
    from sig1 s join posts p on p.id = s.post_id, lateral unnest(p.ai_tags || p.topics) as t
    group by t
  ),
  cand as (
    select p.* from posts p, me
    where not p.hidden
      and (me.uid is null or p.author_id <> me.uid)
      and (p_topic is null or p_topic = any (p.topics))
      and not exists (select 1 from not_interested n where n.user_id = me.uid and n.post_id = p.id)
  ),
  scored as (
    select c.id,
      -- уже знакомое (открывал, сохранял, повторял) в «по интересам» не повторяем
      case when exists (select 1 from sig1 s where s.post_id = c.id) then 0
           else coalesce((select sum(tg.w) from tags tg where tg.t = any (c.ai_tags || c.topics)), 0) end as interest,
      ln(1 + c.saves_count * 2 + c.tries_count * 3) + 3.0 / (1 + extract(epoch from now() - c.created_at) / 86400 / 4) as pop,
      md5(c.id::text || coalesce(p_seed, '')) as rnd
    from cand c
  ),
  ranked as (
    select id, interest,
      row_number() over (partition by interest > 0 order by interest desc, pop desc) - 1 as ri,
      row_number() over (order by pop desc, rnd) - 1 as rp,
      row_number() over (order by rnd) - 1 as rr
    from scored
  ),
  has as (select exists (select 1 from scored where interest > 0) as yes),
  pos as (
    select r.id, least(
      case when r.interest > 0 then (r.ri / 7) * 10 + r.ri % 7 end,
      case when h.yes then (r.rp / 2) * 10 + 7 + r.rp % 2 else (r.rp / 9) * 10 + r.rp % 9 end,
      r.rr * 10 + 9
    ) as k
    from ranked r, has h
  )
  select p.* from pos join posts p on p.id = pos.id
  order by pos.k, p.created_at desc
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 60)
$$;
revoke all on function feed(text, int, int, text) from public;
grant execute on function feed(text, int, int, text) to anon, authenticated;

-- категории, в которых есть идеи (таблетки над лентой)
create or replace function used_topics() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(t order by n desc, t), '{}')
  from (select t, count(*) as n from posts, unnest(topics) as t where not hidden group by t) x
$$;
revoke all on function used_topics() from public;
grant execute on function used_topics() to anon, authenticated;

-- ─── Поиск ──────────────────────────────────────────────────
-- p_topics — id категорий, чьё название подходит под запрос (названия знает сайт)
create or replace function search_posts(p_q text, p_topics text[] default '{}', p_offset int default 0, p_limit int default 30)
returns setof posts
language sql stable security definer set search_path = public as $$
  with q as (select '%' || replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat)
  select p.* from posts p join profiles a on a.id = p.author_id, q
  where not p.hidden and length(q.pat) > 2 and (
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

-- ─── Профиль: цифры и «Повторил» ────────────────────────────
create or replace function profile_summary(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'posts', (select count(*) from posts where author_id = p_user and (not hidden or author_id = auth.uid())),
    'repeated', (select coalesce(sum(tries_count), 0) from posts where author_id = p_user and not hidden)
  )
$$;
revoke all on function profile_summary(uuid) from public;
grant execute on function profile_summary(uuid) to anon, authenticated;

create or replace function tried_posts(p_user uuid, p_offset int default 0, p_limit int default 30) returns setof posts
language sql stable security definer set search_path = public as $$
  select p.* from posts p
  join (select post_id, max(created_at) as at from tries where user_id = p_user group by post_id) t on t.post_id = p.id
  where not p.hidden
  order by t.at desc
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 60)
$$;
revoke all on function tried_posts(uuid, int, int) from public;
grant execute on function tried_posts(uuid, int, int) to anon, authenticated;

-- ─── Статистика автора ──────────────────────────────────────
-- Только своё: по одной идее (p_post) или по всем; за p_days дней. Кто именно смотрел — не показывается, только числа.
create or replace function my_stats(p_post uuid default null, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  since timestamptz;
  tz text := 'Europe/Moscow';
  res jsonb;
begin
  if uid is null then raise exception 'нужно войти'; end if;
  if p_post is not null and not exists (select 1 from posts where id = p_post and author_id = uid) then
    raise exception 'это не ваша идея';
  end if;
  since := date_trunc('day', now() at time zone tz) at time zone tz - make_interval(days => greatest(least(coalesce(p_days, 30), 3650), 1) - 1);

  with ev as (
    select * from events
    where owner_id = uid and created_at >= since and (p_post is null or post_id = p_post)
  ),
  t as (
    select tr.* from tries tr join posts p on p.id = tr.post_id
    where p.author_id = uid and tr.user_id <> uid and tr.created_at >= since and (p_post is null or p.id = p_post)
  ),
  r as (
    select rp.* from try_replies rp join tries tr on tr.id = rp.try_id join posts p on p.id = tr.post_id
    where p.author_id = uid and rp.user_id <> uid and rp.created_at >= since and (p_post is null or p.id = p_post)
  ),
  days as (
    select generate_series((since at time zone tz)::date, (now() at time zone tz)::date, interval '1 day')::date as d
  )
  select jsonb_build_object(
    'since', (since at time zone tz)::date,
    'totals', jsonb_build_object(
      'views', (select count(*) from ev where kind = 'view'),
      'viewers', (select count(distinct viewer) from ev where kind = 'view'),
      'opens', (select count(*) from ev where kind = 'open'),
      'openers', (select count(distinct viewer) from ev where kind = 'open'),
      'dwell_avg', (select coalesce(round(avg(value)), 0) from ev where kind = 'dwell' and value > 0),
      'dwell_median', (select coalesce(percentile_cont(0.5) within group (order by value), 0) from ev where kind = 'dwell' and value > 0),
      'saves', (select count(*) from ev where kind = 'save'),
      'unsaves', (select count(*) from ev where kind = 'unsave'),
      'done', (select count(*) from ev where kind = 'done'),
      'shares', (select count(*) from ev where kind = 'share'),
      'profile_visits', (select count(*) from ev where kind = 'profile'),
      'follows_from_post', (select count(*) from ev where kind = 'follow_post'),
      'tries', (select count(*) from t),
      'tries_ok', (select count(*) from t where ok),
      'tries_photo', (select count(*) from t where img is not null),
      'replies', (select count(*) from r)
    ),
    -- по всему профилю (только когда смотрим все идеи)
    'profile', case when p_post is null then jsonb_build_object(
      'followers', (select followers_count from profiles where id = uid),
      'follows', (select count(*) from ev where kind = 'follow'),
      'unfollows', (select count(*) from ev where kind = 'unfollow'),
      'visits', (select count(*) from ev where kind = 'profile'),
      'visitors', (select count(distinct viewer) from ev where kind = 'profile')
    ) end,
    'by_source', (
      select coalesce(jsonb_object_agg(s, jsonb_build_object('views', v, 'opens', o)), '{}'::jsonb) from (
        select coalesce(source, 'other') as s, count(*) filter (where kind = 'view') as v, count(*) filter (where kind = 'open') as o
        from ev where kind in ('view', 'open') group by 1
      ) x
    ),
    'by_device', (
      select coalesce(jsonb_object_agg(dv, jsonb_build_object('views', v, 'opens', o)), '{}'::jsonb) from (
        select coalesce(device, 'other') as dv, count(*) filter (where kind = 'view') as v, count(*) filter (where kind = 'open') as o
        from ev where kind in ('view', 'open') group by 1
      ) x
    ),
    -- сколько разных людей дошли до картинки №… (1 — все, кто открыл)
    'slides', (
      select coalesce(jsonb_agg(jsonb_build_object('n', n, 'people', c) order by n), '[]'::jsonb) from (
        select n, count(distinct viewer) as c from (
          select viewer, 1 as n from ev where kind = 'open'
          union all
          select viewer, g as n from ev, generate_series(2, least(value, 10)) as g where kind = 'slide' and value >= 2
        ) z group by n
      ) y
    ),
    'by_day', (
      select jsonb_agg(jsonb_build_object(
        'd', days.d,
        'views', (select count(*) from ev where kind = 'view' and (created_at at time zone tz)::date = days.d),
        'opens', (select count(*) from ev where kind = 'open' and (created_at at time zone tz)::date = days.d),
        'saves', (select count(*) from ev where kind = 'save' and (created_at at time zone tz)::date = days.d),
        'tries', (select count(*) from t where (created_at at time zone tz)::date = days.d),
        'follows', (select count(*) from ev where kind = 'follow' and (created_at at time zone tz)::date = days.d)
      ) order by days.d) from days
    ),
    'by_hour', (
      select jsonb_agg(jsonb_build_object('h', h, 'views', (select count(*) from ev where kind in ('view', 'open')
        and extract(hour from created_at at time zone tz) = h)) order by h)
      from generate_series(0, 23) as h
    ),
    -- по идеям (только когда смотрим все)
    'posts', case when p_post is null then (
      select coalesce(jsonb_agg(x order by (x ->> 'views')::int desc, x ->> 'created_at' desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', p.id, 'title', p.title, 'images', p.images, 'hidden', p.hidden, 'created_at', p.created_at,
          'views', (select count(*) from ev where ev.post_id = p.id and kind = 'view'),
          'opens', (select count(*) from ev where ev.post_id = p.id and kind = 'open'),
          'saves', (select count(*) from ev where ev.post_id = p.id and kind = 'save'),
          'tries', (select count(*) from t where t.post_id = p.id),
          'saves_total', p.saves_count, 'tries_total', p.tries_count
        ) as x
        from posts p where p.author_id = uid
      ) y
    ) end
  ) into res;
  return res;
end $$;
revoke all on function my_stats(uuid, int) from public;
grant execute on function my_stats(uuid, int) to authenticated;

-- ─── Админка: чтение (пишет функция publish) ────────────────
create or replace function admin_check() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'нет доступа' using errcode = '42501'; end if;
end $$;
revoke all on function admin_check() from public;
grant execute on function admin_check() to authenticated;

-- жалобы, сгруппированные по тому, на что жалуются; с тем, на что жалуются
create or replace function admin_reports(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  perform admin_check();
  select coalesce(jsonb_agg(g order by (g ->> 'last') desc), '[]'::jsonb) into res from (
    select jsonb_build_object(
      'type', r.target_type, 'id', r.target_id,
      'count', count(*),
      'first', min(r.created_at), 'last', max(r.created_at),
      'reasons', jsonb_agg(jsonb_build_object('reason', r.reason, 'comment', r.comment, 'link', r.link, 'at', r.created_at,
        'reporter', jsonb_build_object('id', rp.id, 'name', rp.name, 'handle', rp.handle)) order by r.created_at),
      'target', case r.target_type
        when 'post' then (select jsonb_build_object('title', p.title, 'images', p.images, 'hidden', p.hidden, 'hidden_reason', p.hidden_reason,
            'author', jsonb_build_object('id', a.id, 'name', a.name, 'handle', a.handle, 'blocked', a.blocked))
          from posts p join profiles a on a.id = p.author_id where p.id = r.target_id)
        when 'try' then (select jsonb_build_object('text', t.text, 'img', t.img, 'ok', t.ok, 'post_id', t.post_id, 'title', p.title,
            'author', jsonb_build_object('id', a.id, 'name', a.name, 'handle', a.handle, 'blocked', a.blocked))
          from tries t join posts p on p.id = t.post_id join profiles a on a.id = t.user_id where t.id = r.target_id)
        when 'reply' then (select jsonb_build_object('text', x.text, 'post_id', t.post_id, 'title', p.title,
            'author', jsonb_build_object('id', a.id, 'name', a.name, 'handle', a.handle, 'blocked', a.blocked))
          from try_replies x join tries t on t.id = x.try_id join posts p on p.id = t.post_id join profiles a on a.id = x.user_id
          where x.id = r.target_id)
        when 'profile' then (select jsonb_build_object('name', a.name, 'handle', a.handle, 'bio', a.bio, 'avatar_url', a.avatar_url,
            'blocked', a.blocked, 'author', jsonb_build_object('id', a.id, 'name', a.name, 'handle', a.handle, 'blocked', a.blocked))
          from profiles a where a.id = r.target_id)
      end
    ) as g
    from reports r join profiles rp on rp.id = r.reporter_id
    where r.status = coalesce(p_status, 'open')
    group by r.target_type, r.target_id
  ) x;
  return res;
end $$;
revoke all on function admin_reports(text) from public;
grant execute on function admin_reports(text) to authenticated;

-- скрытые идеи (ИИ или модератором)
create or replace function admin_hidden() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  perform admin_check();
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'images', p.images, 'reason', p.hidden_reason,
      'by', coalesce(p.hidden_by, 'ai'), 'created_at', p.created_at,
      'author', jsonb_build_object('id', a.id, 'name', a.name, 'handle', a.handle, 'blocked', a.blocked)) order by p.created_at desc), '[]'::jsonb)
  into res from posts p join profiles a on a.id = p.author_id where p.hidden;
  return res;
end $$;
revoke all on function admin_hidden() from public;
grant execute on function admin_hidden() to authenticated;

-- отказы ИИ при загрузке картинок (чтобы видеть его ошибки)
create or replace function admin_refusals(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  perform admin_check();
  select coalesce(jsonb_agg(x order by (x ->> 'created_at') desc), '[]'::jsonb) into res from (
    select jsonb_build_object('path', c.path, 'reasons', c.reasons, 'strict', c.strict, 'by_ai', c.by_ai, 'created_at', c.created_at,
      'user', jsonb_build_object('id', a.id, 'name', a.name, 'handle', a.handle, 'blocked', a.blocked)) as x
    from image_checks c join profiles a on a.id = c.user_id
    where not c.ok order by c.created_at desc limit least(greatest(p_limit, 1), 500)
  ) y;
  return res;
end $$;
revoke all on function admin_refusals(int) from public;
grant execute on function admin_refusals(int) to authenticated;

-- пользователи: поиск по имени и нику (пусто — новые)
create or replace function admin_users(p_q text default '') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
  pat text := '%' || lower(btrim(coalesce(p_q, ''))) || '%';
begin
  perform admin_check();
  select coalesce(jsonb_agg(x order by (x ->> 'created_at') desc), '[]'::jsonb) into res from (
    select jsonb_build_object('id', a.id, 'name', a.name, 'handle', a.handle, 'bio', a.bio, 'avatar_url', a.avatar_url,
      'blocked', a.blocked, 'is_demo', a.is_demo, 'created_at', a.created_at, 'followers', a.followers_count,
      'admin', exists (select 1 from admins ad where ad.user_id = a.id),
      'posts', (select count(*) from posts p where p.author_id = a.id),
      'hidden', (select count(*) from posts p where p.author_id = a.id and p.hidden),
      'tries', (select count(*) from tries t where t.user_id = a.id),
      'reports_against', (select count(*) from reports r where
          (r.target_type = 'profile' and r.target_id = a.id)
          or (r.target_type = 'post' and r.target_id in (select id from posts where author_id = a.id))
          or (r.target_type = 'try' and r.target_id in (select id from tries where user_id = a.id))
          or (r.target_type = 'reply' and r.target_id in (select id from try_replies where user_id = a.id))),
      'reports_by', (select count(*) from reports r where r.reporter_id = a.id),
      'refusals', (select count(*) from image_checks c where c.user_id = a.id and not c.ok)
    ) as x
    from profiles a
    where pat = '%%' or lower(a.name) like pat or a.handle like pat
    order by a.created_at desc limit 100
  ) y;
  return res;
end $$;
revoke all on function admin_users(text) from public;
grant execute on function admin_users(text) to authenticated;

-- общая статистика сайта по дням
create or replace function admin_site_stats(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz text := 'Europe/Moscow';
  since date := (now() at time zone tz)::date - (greatest(least(coalesce(p_days, 30), 3650), 1) - 1);
  res jsonb;
begin
  perform admin_check();
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'users', (select count(*) from profiles where not is_demo),
      'posts', (select count(*) from posts),
      'hidden', (select count(*) from posts where hidden),
      'tries', (select count(*) from tries),
      'replies', (select count(*) from try_replies),
      'reports_open', (select count(*) from reports where status = 'open'),
      'blocked', (select count(*) from profiles where blocked)
    ),
    'by_day', (select jsonb_agg(jsonb_build_object(
        'd', d,
        'signups', (select count(*) from profiles where not is_demo and (created_at at time zone tz)::date = d),
        'posts', (select count(*) from posts where (created_at at time zone tz)::date = d),
        'tries', (select count(*) from tries where (created_at at time zone tz)::date = d),
        'replies', (select count(*) from try_replies where (created_at at time zone tz)::date = d),
        'reports', (select count(*) from reports where (created_at at time zone tz)::date = d),
        'visitors', (select count(distinct viewer) from events where (created_at at time zone tz)::date = d),
        'active', (select count(distinct user_id) from events where user_id is not null and (created_at at time zone tz)::date = d),
        'views', (select count(*) from events where kind = 'view' and (created_at at time zone tz)::date = d),
        'refusals', (select count(*) from image_checks where not ok and (created_at at time zone tz)::date = d)
      ) order by d) from generate_series(since, (now() at time zone tz)::date, interval '1 day') as g(d0), lateral (select g.d0::date as d) dd)
  ) into res;
  return res;
end $$;
revoke all on function admin_site_stats(int) from public;
grant execute on function admin_site_stats(int) to authenticated;

create or replace function admin_log_list(p_limit int default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  perform admin_check();
  select coalesce(jsonb_agg(x order by (x ->> 'id')::bigint desc), '[]'::jsonb) into res from (
    select jsonb_build_object('id', l.id, 'action', l.action, 'target_type', l.target_type, 'target_id', l.target_id, 'note', l.note,
      'created_at', l.created_at, 'admin', jsonb_build_object('id', a.id, 'name', a.name, 'handle', a.handle)) as x
    from admin_log l left join profiles a on a.id = l.admin_id
    order by l.id desc limit least(greatest(p_limit, 1), 1000)
  ) y;
  return res;
end $$;
revoke all on function admin_log_list(int) from public;
grant execute on function admin_log_list(int) to authenticated;

-- ─── Живые обновления: ещё уведомления ──────────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
