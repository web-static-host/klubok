-- Клубок, обновление 7: до 5 категорий у идеи, счётчик «в избранном», показы и клики; лайки убраны.
-- Запускается само из GitHub (.github/workflows/supabase.yml). Повторный запуск ничего не ломает.

-- ─── Несколько категорий (1–5). topic — первая из них (для старого кода и сортировки) ───
alter table posts add column if not exists topics text[] not null default '{}';
update posts set topics = array[topic] where cardinality(topics) = 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'posts_topics_check') then
    alter table posts add constraint posts_topics_check check (cardinality(topics) between 1 and 5);
  end if;
end $$;
create index if not exists posts_topics_idx on posts using gin (topics);

-- ─── «В избранном»: сколько человек сохранили идею в свои папки (человек считается один раз) ───
alter table posts add column if not exists saves_count int not null default 0;
create or replace function bump_post_saves() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid uuid := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
begin
  update posts p set saves_count = (
    select count(distinct f.owner_id) from folder_items fi join folders f on f.id = fi.folder_id where fi.post_id = pid
  ) where p.id = pid;
  return null;
end $$;
drop trigger if exists saves_count on folder_items;
create trigger saves_count after insert or delete on folder_items for each row execute function bump_post_saves();
update posts p set saves_count = (
  select count(distinct f.owner_id) from folder_items fi join folders f on f.id = fi.folder_id where fi.post_id = p.id
);

-- ─── Показы в ленте и клики (статистика для автора) ───
alter table posts add column if not exists views_count int not null default 0;
alter table posts add column if not exists clicks_count int not null default 0;
-- сайт присылает пачкой: какие карточки увидели и какие открыли (не больше 100 за раз)
create or replace function track_posts(views uuid[] default '{}', clicks uuid[] default '{}') returns void
language sql security definer set search_path = public as $$
  update posts set views_count = views_count + 1 where id = any ((coalesce(views, '{}'::uuid[]))[1:100]);
  update posts set clicks_count = clicks_count + 1 where id = any ((coalesce(clicks, '{}'::uuid[]))[1:100]);
$$;
revoke all on function track_posts(uuid[], uuid[]) from public;
grant execute on function track_posts(uuid[], uuid[]) to anon, authenticated;

-- ─── Лайков больше нет ───
drop table if exists likes cascade;
drop function if exists bump_post_likes() cascade;
alter table posts drop column if exists likes_count;
