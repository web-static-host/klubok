-- Клубок: схема тестовой базы Supabase.
-- Запуск: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Файл можно запускать повторно: в начале он удаляет старые таблицы (все данные в них пропадут).

-- ─── Очистка ────────────────────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists image_checks, try_replies, likes, follows, folder_items, folders, tries, posts, profiles cascade;
drop function if exists handle_new_user, bump_post_likes, bump_post_saves, bump_followers, bump_post_tries, track_posts cascade;
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
  -- сколько человек сохранили в свои папки (считает база)
  saves_count int not null default 0,
  -- статистика для автора: показы карточки в ленте и клики по ней (функция track_posts)
  views_count int not null default 0,
  clicks_count int not null default 0,
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

-- показы и клики: сайт присылает пачкой (не больше 100 за раз); напрямую менять счётчики нельзя
create function track_posts(views uuid[] default '{}', clicks uuid[] default '{}') returns void
language sql security definer set search_path = public as $$
  update posts set views_count = views_count + 1 where id = any ((coalesce(views, '{}'::uuid[]))[1:100]);
  update posts set clicks_count = clicks_count + 1 where id = any ((coalesce(clicks, '{}'::uuid[]))[1:100]);
$$;
revoke all on function track_posts(uuid[], uuid[]) from public;
grant execute on function track_posts(uuid[], uuid[]) to anon, authenticated;

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

create policy "посты видны всем" on posts for select using (true);
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
