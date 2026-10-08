-- Временно разрешает загрузить тестовые картинки в хранилище (папка images/demo).
-- Запустить ОДИН раз перед загрузкой. Закрывается само, когда запускаете seed.sql.
drop policy if exists "временно: загрузка демо-картинок" on storage.objects;
create policy "временно: загрузка демо-картинок" on storage.objects for insert to anon
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = 'demo');
