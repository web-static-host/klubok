-- Клубок: схема тестовой базы Supabase.
-- Запуск: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Файл можно запускать повторно: в начале он удаляет старые таблицы (все данные в них пропадут).

-- ─── Очистка ────────────────────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists notification_settings, notifications, not_interested, events, admin_log, reports, admins, ai_tokens, image_checks, try_replies, likes, follows, folder_items, folders, tries, posts, profiles cascade;
drop function if exists handle_new_user, bump_post_likes, bump_post_saves, bump_followers, bump_post_tries, track_posts, track, is_admin, admin_check,
  notify_wanted, notify, on_try_notify, on_reply_notify, on_follow_event, on_save_event, on_post_hidden_notify, notifications_digest,
  feed, used_topics, search_posts, profile_summary, tried_posts, my_stats, admin_reports, admin_hidden, admin_refusals, admin_users,
  admin_site_stats, admin_log_list, orphan_images cascade;
drop type if exists post_type, post_topic cascade;

-- ─── Типы ───────────────────────────────────────────────────
create type post_type as enum ('photo', 'recipe', 'hack', 'beforeafter');

-- ─── Профили ────────────────────────────────────────────────
-- У настоящих пользователей id = id входа (auth.users). У тестовых авторов — свой id без входа.
create table profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  bio text not null default '',
  -- два цвета градиента для аватарки без фото
  colors text[] not null default array['#2DD4BF', '#0891B2'],
  avatar_url text,
  followers_count int not null default 0,
  is_demo boolean not null default false,
  -- заблокирован админом: не может публиковать, отвечать, жаловаться
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── Посты ──────────────────────────────────────────────────
-- Вся идея — на картинках (1–10, листаются), текста нет — только название.
-- Картинка — объект { src, ratio } (как тип Img на сайте). type: photo или beforeafter (две картинки рядом).
create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles (id) on delete cascade,
  type post_type not null,
  -- категории (1–5): id из списка на сайте (recipes, baking …) или свои, вписанные автором; topic — первая из них
  topic text not null check (char_length(topic) between 1 and 40),
  topics text[] not null default '{}' check (cardinality(topics) between 1 and 5),
  title text not null check (char_length(title) between 1 and 120),
  images jsonb not null default '[]' check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) between 1 and 10),
  -- скрытые слова для поиска; на сайте не показываются
  tags text[] not null default '{}',
  -- что ИИ увидел на картинках: слова и описание (для поиска и проверки «без людей»), пользователям не видно
  ai_tags text[] not null default '{}',
  ai_text text,
  -- подробная раскладка идеи от ИИ (для поиска и рекомендаций): idea, kind, main, techniques, tools, occasion, style, related, difficulty, time
  ai_meta jsonb,
  -- проверено ли ИИ (если ИИ был недоступен — только быстрые проверки)
  checked_by_ai boolean not null default false,
  -- скрыта: подробная проверка после публикации нашла в тексте на картинке ссылку или мат, или решил модератор; видит только автор (с причиной)
  hidden boolean not null default false,
  hidden_reason text,
  -- кто скрыл: 'ai' или 'moderator'
  hidden_by text,
  -- ТЕСТ: замеры публикации (убрать после тестов)
  publish_timing jsonb,
  -- сколько человек сохранили в свои папки (считает база)
  saves_count int not null default 0,
  tries_count int not null default 0,
  tries_ok_count int not null default 0,
  created_at timestamptz not null default now()
);
create index posts_created_idx on posts (created_at desc);
create index posts_author_idx on posts (author_id, created_at desc);
create index posts_topic_idx on posts (topic, created_at desc);
create index posts_topics_idx on posts using gin (topics);

-- ─── «Я попробовал» ─────────────────────────────────────────
create table tries (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  ok boolean not null,
  text text check (char_length(text) <= 1000),
  img jsonb,
  created_at timestamptz not null default now()
);
create index tries_post_idx on tries (post_id, created_at desc);
create index tries_user_idx on tries (user_id, created_at desc);

-- ─── Папки (видит только владелец) ──────────────────────────
create table folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
create index folders_owner_idx on folders (owner_id, created_at);

-- Сохранение = ссылка на оригинальный пост, не копия.
create table folder_items (
  folder_id uuid not null references folders (id) on delete cascade,
  post_id uuid not null references posts (id) on delete cascade,
  done boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (folder_id, post_id)
);

-- ─── Ответы на отзывы «Я попробовал» ────────────────────────
-- Обычных комментариев нет: отвечать можно только на отзыв. Отвечать может любой, у автора поста на сайте — метка «автор».
create table try_replies (
  id uuid primary key default gen_random_uuid(),
  try_id uuid not null references tries (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default now()
);
create index try_replies_try_idx on try_replies (try_id, created_at);

-- ─── Проверка картинок (результаты ИИ; только для функции publish) ───
create table image_checks (
  -- путь в хранилище: <id пользователя>/<файл>.jpg
  path text primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  -- проверено по правилам публикаций («без людей»); false — как аватар (люди можно)
  strict boolean not null default true,
  ok boolean not null,
  reasons text[] not null default '{}',
  tags text[] not null default '{}',
  meta jsonb,
  ai_text text,
  by_ai boolean not null default false,
  -- замеры проверки, мс: скачать, вход в ИИ, отправить, ответ ИИ, сохранить, всего
  timing jsonb,
  created_at timestamptz not null default now()
);
-- читать и писать может только функция publish
alter table image_checks enable row level security;

-- ─── Пропуск в ГигаЧат (общий для всех копий функции publish; только для неё) ───
create table ai_tokens (
  id text primary key,
  value text not null,
  exp bigint not null
);
alter table ai_tokens enable row level security;

-- ─── Подписки ───────────────────────────────────────────────
create table follows (
  follower_id uuid not null references profiles (id) on delete cascade,
  following_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on follows (following_id);

-- ─── Счётчики (обновляются сами) ────────────────────────────
-- «в избранном»: сколько разных людей сохранили пост (в любые свои папки)
create function bump_post_saves() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid uuid := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
begin
  update posts p set saves_count = (
    select count(distinct f.owner_id) from folder_items fi join folders f on f.id = fi.folder_id where fi.post_id = pid
  ) where p.id = pid;
  return null;
end $$;
create trigger saves_count after insert or delete on folder_items for each row execute function bump_post_saves();

create function bump_followers() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update profiles set followers_count = followers_count + 1 where id = new.following_id;
  else
    update profiles set followers_count = greatest(followers_count - 1, 0) where id = old.following_id;
  end if;
  return null;
end $$;
create trigger followers_count after insert or delete on follows for each row execute function bump_followers();

create function bump_post_tries() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update posts set tries_count = tries_count + 1, tries_ok_count = tries_ok_count + new.ok::int where id = new.post_id;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    update posts set tries_count = greatest(tries_count - 1, 0), tries_ok_count = greatest(tries_ok_count - old.ok::int, 0)
    where id = old.post_id;
  end if;
  return null;
end $$;
create trigger tries_count after insert or update or delete on tries for each row execute function bump_post_tries();

-- показы, открытия и прочие события для статистики — функция track (ниже, из migrations/013)

-- Счётчики нельзя подделать с сайта: менять разрешено только обычные поля.
revoke update on profiles, posts, tries, folder_items, try_replies from anon, authenticated;
grant update (name, handle, bio, colors, avatar_url) on profiles to authenticated;
grant update (topic, topics, title, images, tags) on posts to authenticated;
grant update (ok, text, img) on tries to authenticated;
grant update (done) on folder_items to authenticated;

-- ─── Новый пользователь → профиль и первая папка ────────────
-- Имя и ник человек вводит при регистрации (сайт заранее проверяет их функцией publish: правила и занятость ника).
-- Если ник вдруг занят или неверный — временный user_123456, его можно сменить в профиле.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  want text := lower(coalesce(new.raw_user_meta_data ->> 'handle', ''));
  nm text := left(btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'name', ''), '\s+', ' ', 'g')), 50);
  h text;
begin
  if want ~ '^[a-z0-9_]{3,30}$' and not exists (select 1 from profiles where handle = want) then
    h := want;
  else
    loop
      h := 'user_' || lpad(floor(random() * 1000000)::int::text, 6, '0');
      exit when not exists (select 1 from profiles where handle = h);
    end loop;
  end if;
  insert into profiles (id, name, handle) values (new.id, coalesce(nullif(nm, ''), h), h);
  insert into folders (owner_id, name) values (new.id, 'Хочу попробовать');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ─── Доступ (RLS): читать могут все, менять — только своё ───
-- Посты, отзывы, ответы и профиль пишутся только через серверную функцию publish (supabase/functions/publish):
-- там проверка правил и ИИ. Поэтому прямых прав на запись в эти таблицы у сайта нет.
alter table profiles enable row level security;
alter table posts enable row level security;
alter table tries enable row level security;
alter table folders enable row level security;
alter table folder_items enable row level security;
alter table follows enable row level security;
alter table try_replies enable row level security;

create policy "профили видны всем" on profiles for select using (true);

create policy "посты видны всем, скрытые — только автору" on posts for select using (not hidden or author_id = auth.uid());
create policy "свой пост: удалить" on posts for delete to authenticated using (author_id = auth.uid());

create policy "попытки видны всем" on tries for select using (true);
create policy "своя попытка: удалить" on tries for delete to authenticated using (user_id = auth.uid());

create policy "свои папки" on folders for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "содержимое своих папок" on folder_items for all to authenticated
  using (exists (select 1 from folders f where f.id = folder_id and f.owner_id = auth.uid()))
  with check (exists (select 1 from folders f where f.id = folder_id and f.owner_id = auth.uid()));

create policy "подписки видны всем" on follows for select using (true);
create policy "своя подписка: создать" on follows for insert to authenticated with check (follower_id = auth.uid());
create policy "своя подписка: удалить" on follows for delete to authenticated using (follower_id = auth.uid());

create policy "ответы видны всем" on try_replies for select using (true);
create policy "свой ответ: удалить" on try_replies for delete to authenticated using (user_id = auth.uid());

-- ─── Хранилище фото ─────────────────────────────────────────
-- Папка images: смотреть могут все, загружать — только в свою подпапку <id пользователя>/…, до 5 МБ, только картинки.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "фото: загрузка в свою папку" on storage.objects;
drop policy if exists "фото: удаление своих" on storage.objects;
create policy "фото: загрузка в свою папку" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "фото: удаление своих" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── Уже зарегистрированные пользователи ────────────────────
-- При повторном запуске файла профили пересоздаются для всех, кто уже входил.
insert into profiles (id, name, handle)
select u.id, 'user_' || left(replace(u.id::text, '-', ''), 12), 'user_' || left(replace(u.id::text, '-', ''), 12)
from auth.users u
on conflict (id) do nothing;
insert into folders (owner_id, name)
select p.id, 'Хочу попробовать' from profiles p
where not p.is_demo and not exists (select 1 from folders f where f.owner_id = p.id);

-- живые обновления (Realtime): идеи, отзывы, ответы — см. migrations/012_realtime.sql
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['posts', 'tries', 'try_replies'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ════ Жалобы, админка, статистика, лента «Для вас», уведомления — как migrations/013_moderation_stats_feed.sql ════
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
  created_at timestamptz not null default now()
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

-- ════ Исправления после проверки под тестовыми пользователями — как migrations/014_test_fixes.sql ════
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

-- ════ Повторная жалоба после рассмотрения — как migrations/015_reports_reopen.sql ════
alter table reports drop constraint if exists reports_reporter_id_target_type_target_id_key;
create unique index if not exists reports_open_once on reports (reporter_id, target_type, target_id) where status = 'open';

-- ════ Ничейные картинки — как migrations/016_orphan_images.sql ════
create or replace function orphan_images(p_hours int default 48, p_limit int default 1000)
returns setof text
language sql stable security definer set search_path = public, storage
as $$
  with used as (
    select substr(x ->> 'src', strpos(x ->> 'src', '/object/public/images/') + 22) as p
      from posts, jsonb_array_elements(images) x
    union
    select substr(x ->> 'thumb', strpos(x ->> 'thumb', '/object/public/images/') + 22)
      from posts, jsonb_array_elements(images) x where x ? 'thumb'
    union
    select substr(img ->> 'src', strpos(img ->> 'src', '/object/public/images/') + 22)
      from tries where img ? 'src'
    union
    select substr(avatar_url, strpos(avatar_url, '/object/public/images/') + 22)
      from profiles where avatar_url like '%/object/public/images/%'
  )
  select o.name
    from storage.objects o
   where o.bucket_id = 'images'
     and o.name not like 'demo/%'
     and not exists (select 1 from used where used.p = o.name)
     -- в форме картинка может пролежать до публикации — даём двое суток; у удалённых аккаунтов — сразу
     and (o.created_at < now() - make_interval(hours => greatest(p_hours, 24))
          or not exists (select 1 from profiles pr where pr.id::text = split_part(o.name, '/', 1)))
   order by o.created_at
   limit least(greatest(p_limit, 1), 1000)
$$;
revoke all on function orphan_images(int, int) from public, anon, authenticated;
grant execute on function orphan_images(int, int) to service_role;
