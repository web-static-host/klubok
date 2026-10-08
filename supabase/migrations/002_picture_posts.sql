-- Клубок, обновление 2: посты только из картинок, ответы на отзывы.
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Данные не теряются.
-- (Для новой базы этот файл не нужен — всё уже есть в schema.sql.)

-- посты: описания, рецепта и шагов больше нет; скрытые поля для ИИ
alter table posts drop column if exists text, drop column if exists recipe, drop column if exists steps;
alter table posts add column if not exists ai_tags text[] not null default '{}';
alter table posts add column if not exists ai_text text;
update posts set type = 'photo' where type in ('recipe', 'hack');
alter table posts drop constraint if exists posts_images_count;
alter table posts add constraint posts_images_count check (jsonb_array_length(images) between 1 and 10);
revoke update on posts from anon, authenticated;
grant update (topic, title, images, tags) on posts to authenticated;

-- у своего поста «Я попробовал» нажать нельзя
drop policy if exists "своя попытка: создать" on tries;
create policy "своя попытка: создать" on tries for insert to authenticated
  with check (user_id = auth.uid() and not exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid()));

-- ответы на отзывы «Я попробовал»
create table if not exists try_replies (
  id uuid primary key default gen_random_uuid(),
  try_id uuid not null references tries (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists try_replies_try_idx on try_replies (try_id, created_at);
alter table try_replies enable row level security;
drop policy if exists "ответы видны всем" on try_replies;
drop policy if exists "свой ответ: создать" on try_replies;
drop policy if exists "свой ответ: удалить" on try_replies;
create policy "ответы видны всем" on try_replies for select using (true);
create policy "свой ответ: создать" on try_replies for insert to authenticated with check (user_id = auth.uid());
create policy "свой ответ: удалить" on try_replies for delete to authenticated using (user_id = auth.uid());
revoke update on try_replies from anon, authenticated;
