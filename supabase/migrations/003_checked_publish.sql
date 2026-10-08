-- Клубок, обновление 3: всё, что пишут пользователи, — только через проверку (функция publish).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Данные не теряются.
-- Важно: сначала создайте функцию publish (Edge Functions), иначе публиковать будет нельзя.

alter table posts add column if not exists checked_by_ai boolean not null default false;

-- прямой записи с сайта больше нет: посты, отзывы, ответы, профиль сохраняет функция publish после проверки
drop policy if exists "свой профиль" on profiles;
drop policy if exists "свой пост: создать" on posts;
drop policy if exists "свой пост: изменить" on posts;
drop policy if exists "своя попытка: создать" on tries;
drop policy if exists "своя попытка: изменить" on tries;
drop policy if exists "свой ответ: создать" on try_replies;
