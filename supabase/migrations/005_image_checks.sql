-- Клубок, обновление 5: картинки проверяются сразу после загрузки, результат запоминается.
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run.

create table if not exists image_checks (
  -- путь в хранилище: <id пользователя>/<файл>.jpg
  path text primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  -- проверено по правилам публикаций («без людей»); false — как аватар (люди можно)
  strict boolean not null default true,
  ok boolean not null,
  reasons text[] not null default '{}',
  tags text[] not null default '{}',
  ai_text text,
  by_ai boolean not null default false,
  created_at timestamptz not null default now()
);
-- читать и писать может только функция publish
alter table image_checks enable row level security;
