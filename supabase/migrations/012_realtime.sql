-- Клубок, обновление 12: живые обновления (Supabase Realtime) — сайт узнаёт о новом сразу, без перезагрузки страницы:
-- своя идея скрыта или получила теги после проверки; новые отзывы «Я попробовал» и ответы на них.
-- Кто что видит — по тем же правилам доступа (скрытую идею — только автор). Запускается само из GitHub. Повторный запуск ничего не ломает.
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
