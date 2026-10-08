-- Клубок: схема тестовой базы Supabase.
-- Запуск: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Файл можно запускать повторно: в начале он удаляет старые таблицы (все данные в них пропадут).

-- ─── Очистка ────────────────────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists likes, follows, folder_items, folders, tries, posts, profiles cascade;
drop function if exists handle_new_user, bump_post_likes, bump_followers, bump_post_tries cascade;
drop type if exists post_type, post_topic cascade;

-- ─── Типы ───────────────────────────────────────────────────
create type post_type as enum ('photo', 'recipe', 'hack', 'beforeafter');
create type post_topic as enum ('recipes', 'hacks', 'home', 'crafts', 'garden');

-- ─── Профили ────────────────────────────────────────────────
-- У настоящих пользователей id = id входа (auth.users). У тестовых авторов — свой id без входа.
create table profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  bio text not null default '',
  city text,
  -- два цвета градиента для аватарки без фото
  colors text[] not null default array['#2DD4BF', '#0891B2'],
  avatar_url text,
  followers_count int not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── Посты ──────────────────────────────────────────────────
-- Картинка — объект { src?, seed?, tag?, ratio } (как тип Img на сайте).
create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles (id) on delete cascade,
  type post_type not null,
  topic post_topic not null,
  title text not null check (char_length(title) between 1 and 120),
  text text not null default '',
  images jsonb not null default '[]' check (jsonb_typeof(images) = 'array'),
  -- рецепт: { time, servings, difficulty, ingredients[], steps[] }
  recipe jsonb,
  -- шаги лайфхака: [{ text, img? }]
  steps jsonb,
  tags text[] not null default '{}',
  likes_count int not null default 0,
  tries_count int not null default 0,
  tries_ok_count int not null default 0,
  created_at timestamptz not null default now()
);
create index posts_created_idx on posts (created_at desc);
create index posts_author_idx on posts (author_id, created_at desc);
create index posts_topic_idx on posts (topic, created_at desc);

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

-- ─── Подписки и лайки ───────────────────────────────────────
create table follows (
  follower_id uuid not null references profiles (id) on delete cascade,
  following_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on follows (following_id);

create table likes (
  user_id uuid not null references profiles (id) on delete cascade,
  post_id uuid not null references posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- ─── Счётчики (обновляются сами) ────────────────────────────
create function bump_post_likes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update posts set likes_count = likes_count + 1 where id = new.post_id;
  else
    update posts set likes_count = greatest(likes_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
create trigger likes_count after insert or delete on likes for each row execute function bump_post_likes();

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

-- Счётчики нельзя подделать с сайта: менять разрешено только обычные поля.
revoke update on profiles, posts, tries, folder_items from anon, authenticated;
grant update (name, handle, bio, city, colors, avatar_url) on profiles to authenticated;
grant update (topic, title, text, images, recipe, steps, tags) on posts to authenticated;
grant update (ok, text, img) on tries to authenticated;
grant update (done) on folder_items to authenticated;

-- ─── Новый пользователь → профиль и первая папка ────────────
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  h text;
begin
  if char_length(base) < 3 then base := 'user'; end if;
  base := left(base, 24);
  h := base;
  while exists (select 1 from profiles where handle = h) loop
    h := base || '_' || floor(random() * 10000)::int;
  end loop;
  insert into profiles (id, name, handle) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', base), h);
  insert into folders (owner_id, name) values (new.id, 'Хочу попробовать');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ─── Доступ (RLS): читать могут все, менять — только своё ───
alter table profiles enable row level security;
alter table posts enable row level security;
alter table tries enable row level security;
alter table folders enable row level security;
alter table folder_items enable row level security;
alter table follows enable row level security;
alter table likes enable row level security;

create policy "профили видны всем" on profiles for select using (true);
create policy "свой профиль" on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "посты видны всем" on posts for select using (true);
create policy "свой пост: создать" on posts for insert to authenticated with check (author_id = auth.uid());
create policy "свой пост: изменить" on posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "свой пост: удалить" on posts for delete to authenticated using (author_id = auth.uid());

create policy "попытки видны всем" on tries for select using (true);
create policy "своя попытка: создать" on tries for insert to authenticated with check (user_id = auth.uid());
create policy "своя попытка: изменить" on tries for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "своя попытка: удалить" on tries for delete to authenticated using (user_id = auth.uid());

create policy "свои папки" on folders for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "содержимое своих папок" on folder_items for all to authenticated
  using (exists (select 1 from folders f where f.id = folder_id and f.owner_id = auth.uid()))
  with check (exists (select 1 from folders f where f.id = folder_id and f.owner_id = auth.uid()));

create policy "подписки видны всем" on follows for select using (true);
create policy "своя подписка: создать" on follows for insert to authenticated with check (follower_id = auth.uid());
create policy "своя подписка: удалить" on follows for delete to authenticated using (follower_id = auth.uid());

create policy "лайки видны всем" on likes for select using (true);
create policy "свой лайк: создать" on likes for insert to authenticated with check (user_id = auth.uid());
create policy "свой лайк: удалить" on likes for delete to authenticated using (user_id = auth.uid());

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
