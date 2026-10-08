-- Клубок, обновление 4: имя и ник вводятся при регистрации, поля «Город» больше нет.
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Сначала обновите функцию publish.

create or replace function handle_new_user() returns trigger
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
alter table profiles drop column if exists city;
