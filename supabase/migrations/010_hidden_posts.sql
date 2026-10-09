-- Клубок, обновление 10: идея может быть скрыта — если подробная проверка после публикации нашла в тексте на картинке ссылку или мат.
-- Скрытую видит только автор (с причиной). Запускается само из GitHub. Повторный запуск ничего не ломает.
alter table posts add column if not exists hidden boolean not null default false;
alter table posts add column if not exists hidden_reason text;

drop policy if exists "посты видны всем" on posts;
drop policy if exists "посты видны всем, скрытые — только автору" on posts;
create policy "посты видны всем, скрытые — только автору" on posts for select
  using (not hidden or author_id = auth.uid());
