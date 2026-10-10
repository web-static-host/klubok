-- Ничейные картинки: загрузили в форму, но не опубликовали (отказ ИИ, передумали, убрали из формы), или аккаунта уже нет.
-- Список отдаёт эта функция, удаляет функция publish (действие admin-orphans) раз в сутки — .github/workflows/orphans.yml.
-- Сайту недоступна: только сервер (service_role). Повторный запуск ничего не ломает.
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
