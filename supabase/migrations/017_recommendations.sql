-- Рекомендации, версия 2 (10 октября). Повторный запуск ничего не ломает.
--   • признаки идеи (posts.feat): слова из разбора ИИ, категории, сложность, время, автор; и как часто признак встречается (feature_df)
--   • вкус человека: что открывал, смотрел, сохранял, повторял, «Сделано», делился, на кого подписан — свежее весит больше (за месяц — вдвое меньше)
--   • умное «Не интересно»: минус тому, что отличает скрытую идею от любимого; повторы — сильнее; «Что не так?» — точный минус
--   • почти такие же, как скрытая, — не показываем; «Не показывать автора» — его идей нет в «Для вас»
--   • пропущенное (показали, не открыл) — ниже; «похожие люди»; у многих получилось — выше, не получилось — ниже
--   • разнообразие: не больше 2 идей одного автора и 3 одной категории подряд; гость — по действиям в этом браузере
--   • «Ещё идеи» — по сходству признаков (similar_posts); поиск — с учётом «получилось»

-- ─── Признаки идеи ──────────────────────────────────────────
-- Слова — как в ai_tags (разбор ИИ), категории — 't:recipes', сложность — 'd:сложно', время — 'tm:долго', автор — 'u:<id>';
-- главное ещё раз — 'm:креветки' (весит вдвое и по нему ищем «почти такие же»), суть — 'i:креветки в сливках'
alter table posts add column if not exists feat text[] not null default '{}';
create index if not exists posts_feat_idx on posts using gin (feat);

create or replace function meta_list(m jsonb, k text) returns text[]
language sql immutable as $$
  select coalesce(array(select lower(btrim(x)) from jsonb_array_elements_text(case when jsonb_typeof(m -> k) = 'array' then m -> k end) x
                        where btrim(x) <> ''), '{}')
$$;

create or replace function post_feat(p_tags text[], p_topics text[], p_meta jsonb, p_author uuid) returns text[]
language sql immutable as $$
  select coalesce(array(select distinct x from unnest(
      array(select lower(btrim(t)) from unnest(coalesce(p_tags, '{}')) t)
      || array(select 't:' || t from unnest(coalesce(p_topics, '{}')) t)
      || case when p_meta ->> 'difficulty' in ('легко', 'средне', 'сложно') then array['d:' || (p_meta ->> 'difficulty')] else '{}' end
      || case when p_meta ->> 'time' in ('быстро', 'около часа', 'долго') then array['tm:' || (p_meta ->> 'time')] else '{}' end
      || case when p_author is not null then array['u:' || p_author::text] else '{}' end
      || array(select 'm:' || x from unnest(meta_list(p_meta, 'main')) x)
      || case when coalesce(btrim(p_meta ->> 'idea'), '') <> '' then array['i:' || lower(btrim(p_meta ->> 'idea'))] else '{}' end
    ) x where x <> '' and x <> 't:'), '{}')
$$;

-- как часто встречается каждый признак ('#all' — сколько всего идей); редкий признак говорит о вкусе больше, чем частый
create table if not exists feature_df (
  f text primary key,
  n int not null default 0
);
alter table feature_df enable row level security;

create or replace function on_post_feat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then
    new.feat := post_feat(new.ai_tags, new.topics, new.ai_meta, new.author_id);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists post_feat on posts;
create trigger post_feat before insert or update of ai_tags, topics, ai_meta, author_id on posts
  for each row execute function on_post_feat();

create or replace function on_post_feat_df() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.feat is not distinct from new.feat then return null; end if;
  if tg_op in ('UPDATE', 'DELETE') then
    update feature_df d set n = d.n - 1 from unnest(old.feat || '#all'::text) as x(ff) where d.f = x.ff;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into feature_df (f, n) select x.ff, 1 from unnest(new.feat || '#all'::text) as x(ff)
      on conflict (f) do update set n = feature_df.n + 1;
  end if;
  return null;
end $$;
drop trigger if exists post_feat_df on posts;
-- «update of feat» сам по себе не срабатывает, когда feat меняет триггер выше, — поэтому слушаем и исходные столбцы
create trigger post_feat_df after insert or delete or update of feat, ai_tags, topics, ai_meta, author_id on posts
  for each row execute function on_post_feat_df();

-- заполнить для уже опубликованных и пересчитать частоты (повторный запуск даёт то же самое)
alter table posts disable trigger post_feat_df;
update posts set feat = post_feat(ai_tags, topics, ai_meta, author_id)
  where feat is distinct from post_feat(ai_tags, topics, ai_meta, author_id);
alter table posts enable trigger post_feat_df;
delete from feature_df;
insert into feature_df (f, n) select f, count(*) from posts, unnest(feat || '#all'::text) f group by f;

-- ─── «Не интересно»: и у гостя (по номеру браузера), и «Что не так?» ───
-- viewer — id вошедшего или 'a:<номер браузера>'; reason: null — не сказал, 'feature' — признак (feature), 'seen' — уже видел
alter table not_interested add column if not exists viewer text;
alter table not_interested add column if not exists reason text;
alter table not_interested add column if not exists feature text;
update not_interested set viewer = user_id::text where viewer is null;
alter table not_interested drop constraint if exists not_interested_pkey;
alter table not_interested alter column user_id drop not null;
alter table not_interested alter column viewer set not null;
create unique index if not exists not_interested_viewer_post on not_interested (viewer, post_id);
-- записывать — только через not_interested_set (иначе можно было бы вписать «не интересно» в чужую ленту); смотреть и удалять — своё
drop policy if exists "своё «не интересно»" on not_interested;
drop policy if exists "своё «не интересно»: видеть" on not_interested;
drop policy if exists "своё «не интересно»: удалить" on not_interested;
create policy "своё «не интересно»: видеть" on not_interested for select to authenticated
  using (user_id = auth.uid() and viewer = auth.uid()::text);
create policy "своё «не интересно»: удалить" on not_interested for delete to authenticated
  using (user_id = auth.uid() and viewer = auth.uid()::text);

-- события по зрителю (лента гостя)
create index if not exists events_viewer_idx on events (viewer, created_at);

-- кто смотрит: вошедший — его id, гость — 'a:<номер браузера>' (как в track)
create or replace function viewer_key(p_anon text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(auth.uid()::text,
    nullif('a:' || left(regexp_replace(coalesce(p_anon, ''), '[^a-zA-Z0-9-]', '', 'g'), 40), 'a:'))
$$;
revoke all on function viewer_key(text) from public, anon, authenticated;

-- «получилось у повторивших» от −1 (почти у всех не получилось) до +1; чем больше отзывов, тем увереннее
create or replace function post_success(p_tries int, p_ok int) returns float
language sql immutable as $$
  select ((coalesce(p_ok, 0) + 1.0) / (coalesce(p_tries, 0) + 2) - 0.5) * 2 * (coalesce(p_tries, 0) / (coalesce(p_tries, 0) + 3.0))
$$;

-- популярность (примерно от −4 до 12): сохранения, «получилось», свежесть и доля «получилось» (у многих не получилось — ниже новой идеи без отзывов)
drop function if exists post_pop(posts);
create or replace function post_pop(p_saves int, p_tries int, p_ok int, p_created timestamptz) returns float
language sql stable as $$
  select ln(1 + greatest(p_saves, 0) * 2 + greatest(p_ok, 0) * 4)
    + 3.0 / (1 + extract(epoch from now() - p_created) / 86400 / 4)
    + 4 * post_success(p_tries, p_ok)
$$;

-- ─── Вкус человека ──────────────────────────────────────────
-- Сигналы по идеям (до p_cutoff — чтобы порции одной ленты не прыгали): вес (свежее — больше), сколько раз карточку показали, трогал ли
create or replace function taste_signals(p_who text, p_cutoff timestamptz)
returns table (post_id uuid, w float, views int, touched boolean)
language sql stable security definer set search_path = public as $$
  with s as (
    select e.post_id,
      case e.kind
        when 'open' then 1
        when 'dwell' then least(e.value, 180) / 45.0
        when 'slide' then 0.3
        when 'save' then 4
        when 'unsave' then -2
        when 'done' then 5
        when 'undone' then -5
        when 'share' then 3
        when 'follow_post' then 3
        else 0 end * power(0.5, extract(epoch from now() - e.created_at) / 86400 / 30) as w,
      (e.kind = 'view')::int as v,
      e.kind <> 'view' as t
    from events e
    where p_who is not null and e.viewer = p_who and e.post_id is not null
      and e.created_at > now() - interval '180 days' and e.created_at <= p_cutoff
    union all
    select t.post_id, 5 * power(0.5, extract(epoch from now() - t.created_at) / 86400 / 30), 0, true
    from tries t where p_who !~ '^a:' and t.user_id::text = p_who and t.created_at <= p_cutoff
  )
  select post_id, sum(w), sum(v)::int, bool_or(t) from s group by post_id
$$;
revoke all on function taste_signals(text, timestamptz) from public, anon, authenticated;

-- Что нравится: признаки понравившихся идей (каждая делит свой вес на свои признаки) + авторы, на кого подписан
create or replace function taste_likes(p_who text, p_cutoff timestamptz)
returns table (f text, w float)
language sql stable security definer set search_path = public as $$
  select f, sum(w) from (
    select f, s.w / sqrt(greatest(cardinality(p.feat), 1)) as w
    from taste_signals(p_who, p_cutoff) s join posts p on p.id = s.post_id, unnest(p.feat) f
    where s.w > 0
    union all
    select 'u:' || following_id, 3 from follows where p_who !~ '^a:' and follower_id::text = p_who
  ) x group by f
$$;
revoke all on function taste_likes(text, timestamptz) from public, anon, authenticated;

-- Итоговый вкус: «нравится» минус «не интересно».
--   Не сказал почему — минус признакам скрытой идеи, но тем меньше, чем больше признак нравится (общее с любимым почти не трогаем);
--   скрыл несколько идей с одним признаком — минус растёт быстрее числа скрытых. Ответ «Что не так?» — отдельно (taste_exact).
create or replace function taste(p_who text, p_cutoff timestamptz)
returns table (f text, w float)
language sql stable security definer set search_path = public as $$
  with likes as (select * from taste_likes(p_who, p_cutoff)),
  ni as (
    select n.reason, n.feature, p.feat from not_interested n join posts p on p.id = n.post_id
    where p_who is not null and n.viewer = p_who
  ),
  vague as (select f, count(*)::float as n from ni, unnest(ni.feat) f where ni.reason is null group by f)
  select f, sum(w) from (
    select f, w from likes
    union all
    select v.f, -1.5 * power(v.n, 1.5) * (1 - coalesce(l.w, 0) / (coalesce(l.w, 0) + 1)) from vague v left join likes l using (f)
  ) x group by f
$$;
revoke all on function taste(text, timestamptz) from public, anon, authenticated;

-- Ответы «Что не так?»: признак и сколько раз его назвали. В ленте каждый раз — вдвое с лишним реже (множитель 0,4 за раз)
create or replace function taste_exact(p_who text)
returns table (f text, n int)
language sql stable security definer set search_path = public as $$
  select feature, count(*)::int from not_interested
  where p_who is not null and viewer = p_who and reason = 'feature' and feature is not null group by feature
$$;
revoke all on function taste_exact(text) from public, anon, authenticated;

-- ─── Лента «Для вас» ────────────────────────────────────────
-- В каждых 10: 7 — по вкусу (признаки + «похожие люди»), 2 — популярное и свежее, 1 — случайное. Без вкуса — 9 популярных и 1 случайная.
-- p_anon — номер браузера гостя; p_age — сколько секунд назад загружена первая порция (порции одной ленты считаются на тот момент).
drop function if exists feed(text, int, int, text);
create or replace function feed(p_seed text default '', p_offset int default 0, p_limit int default 30, p_topic text default null,
                                p_anon text default null, p_age int default null)
returns setof posts
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  who text := viewer_key(p_anon);
  cutoff timestamptz := now() - make_interval(secs => least(greatest(coalesce(p_age, 0), 0), 86400));
  need int := greatest(p_offset, 0) + least(greatest(p_limit, 1), 60);
  ids uuid[];
  au uuid[];
  tp text[];
  used boolean[];
  res uuid[] := '{}';
  ra uuid[] := '{}';
  rt text[] := '{}';
  total int;
  first int := 1;
  pick int;
  seen int;
  j int;
begin
  with
  sig as (select * from taste_signals(who, cutoff)),
  wt as (select * from taste(who, cutoff)),
  ex as (select * from taste_exact(who)),
  allp as (select (n)::float as n from feature_df where f = '#all'),
  ni as (
    select n.post_id, n.reason, n.feature, p.author_id,
      (select x from unnest(p.feat) x where left(x, 2) = 'i:' limit 1) as idea,
      array(select x from unnest(p.feat) x where left(x, 2) = 'm:') as main
    from not_interested n join posts p on p.id = n.post_id
    where who is not null and n.viewer = who
  ),
  -- «Не показывать этого автора»
  banned as (select substr(f, 3)::uuid as a from ex where f ~ '^u:[0-9a-f-]{36}$'),
  -- «похожие люди»: кто сохранял или повторял то же, что вы, — и что ещё они сохраняли
  likes_of as (
    select f.owner_id as u, fi.post_id from folder_items fi join folders f on f.id = fi.folder_id
    union
    select t.user_id, t.post_id from tries t
  ),
  my_pos as (select post_id from sig where w >= 3),
  peers as (
    select l.u, count(*) as o from likes_of l join my_pos m using (post_id)
    where l.u::text is distinct from who group by l.u order by count(*) desc limit 50
  ),
  peer_n as (select l.u, count(*) as n from likes_of l join peers using (u) group by l.u),
  collab as (
    select l.post_id, sum(pe.o / sqrt(pn.n)) as cs
    from likes_of l join peers pe using (u) join peer_n pn using (u) group by l.post_id
  ),
  -- скрытые без «уже видел»: суть и главное (для «почти таких же»)
  nid as (select row_number() over () as k, idea, main from ni where reason is distinct from 'seen'),
  nidw as (select k, word, cardinality(main) as sz from nid, unnest(main) as m(word) where cardinality(main) >= 2),
  cand as (
    select p.id, p.author_id, p.topic, p.created_at, p.feat, p.saves_count, p.tries_count, p.tries_ok_count,
      (select x from unnest(p.feat) x where left(x, 2) = 'i:' limit 1) as idea,
      array(select x from unnest(p.feat) x where left(x, 2) = 'm:') as main
    from posts p
    where not p.hidden
      and (uid is null or p.author_id <> uid)
      and (p_topic is null or p_topic = any (p.topics))
      and not exists (select 1 from ni where ni.post_id = p.id)
      and not exists (select 1 from banned b where b.a = p.author_id)
  ),
  -- почти такая же, как скрытая: та же суть или почти то же главное (≥ 60 % общих, не меньше 2) — не показываем
  dup as (
    select c.id from cand c join nid on nullif(nid.idea, '') is not null and nid.idea = c.idea
    union
    select c.id from cand c cross join lateral unnest(c.main) as cw(word) join nidw on nidw.word = cw.word
    where cardinality(c.main) >= 2
    group by c.id, nidw.k, nidw.sz, cardinality(c.main)
    having count(*) >= greatest(2, ceil(0.6 * least(nidw.sz, cardinality(c.main))))
  ),
  cand2 as (select c.* from cand c where not exists (select 1 from dup where dup.id = c.id)),
  -- вкус по признакам (редкие признаки весят больше) и ответы «Что не так?» — одним проходом
  fx as (
    select c.id,
      sum(wt.w * ln(1 + (select n from allp) / greatest(coalesce(d.n, 1), 1))) as content,
      sum(ex.n) as exn
    from cand2 c cross join lateral unnest(c.feat) x
    left join wt on wt.f = x left join ex on ex.f = x left join feature_df d on d.f = x and wt.f is not null
    where wt.f is not null or ex.f is not null
    group by c.id
  ),
  scored as (
    select c.id, c.author_id, c.topic, c.created_at,
      coalesce(s.w, 0) as known,
      coalesce(s.touched, false) as touched,
      -- показали, а не открыл — каждый такой раз ниже
      1.0 / (1 + 0.5 * case when coalesce(s.touched, false) then 0 else coalesce(s.views, 0) end) as skip,
      (coalesce(fx.content, 0) / sqrt(greatest(cardinality(c.feat), 1)) + 2 * ln(1 + coalesce(co.cs, 0)))
        * (1 + 0.5 * post_success(c.tries_count, c.tries_ok_count)) as interest,
      post_pop(c.saves_count, c.tries_count, c.tries_ok_count, c.created_at) as pop,
      -- ответы «Что не так?»: за каждый совпавший — ×0,4
      power(0.4, coalesce(fx.exn, 0)) as dis,
      md5(c.id::text || coalesce(p_seed, '')) as rnd
    from cand2 c left join sig s on s.post_id = c.id left join collab co on co.post_id = c.id left join fx on fx.id = c.id
  ),
  -- популярное — по очереди из разных категорий (лучшее каждой), чтобы новичок быстрее нашёл своё
  scored2 as (
    select s.*,
      row_number() over (partition by s.topic
        order by (s.pop + least(s.interest, 0) + 6) * s.skip * s.dis * case when s.touched then 0.5 else 1 end desc, s.rnd) as tr
    from scored s
  ),
  ranked as (
    select s.*,
      -- уже знакомое (открывал, сохранял) в «по вкусу» не повторяем; явно не нравится или уже сохранял/повторял — в самый конец
      (s.known >= 3 or s.interest < -1 or s.dis < 0.1) as bury,
      s.interest > 0.05 and not s.touched as fits,
      row_number() over (partition by s.interest > 0.05 and not s.touched order by s.interest * s.skip * s.dis desc, s.pop desc, s.rnd) - 1 as ri,
      row_number() over (order by s.tr, md5(s.topic || coalesce(p_seed, '')), s.rnd) - 1 as rp,
      row_number() over (order by s.rnd) - 1 as rr
    from scored2 s
  ),
  has as (select exists (select 1 from ranked where fits and not bury) as yes),
  pos as (
    select r.id, r.author_id, r.topic, r.created_at,
      least(
        case when r.fits then (r.ri / 7) * 10 + r.ri % 7 end,
        case when h.yes then (r.rp / 2) * 10 + 7 + r.rp % 2 else (r.rp / 9) * 10 + r.rp % 9 end,
        r.rr * 10 + 9
      ) + case when r.bury then 1000000000 else 0 end as k
    from ranked r, has h
  )
  select array_agg(id order by k, created_at desc), array_agg(author_id order by k, created_at desc), array_agg(topic order by k, created_at desc)
    into ids, au, tp
  from pos;

  total := coalesce(cardinality(ids), 0);
  if total = 0 then return; end if;
  used := array_fill(false, array[total]);

  -- разнообразие: не больше 2 идей одного автора и 3 одной категории подряд (ищем подходящую среди ближайших 30)
  while cardinality(res) < least(need, total) loop
    while first <= total and used[first] loop first := first + 1; end loop;
    pick := null;
    seen := 0;
    j := first;
    while j <= total and seen < 30 loop
      if not used[j] then
        seen := seen + 1;
        if not (cardinality(ra) >= 2 and ra[cardinality(ra)] = au[j] and ra[cardinality(ra) - 1] = au[j])
           and not (cardinality(rt) >= 3 and rt[cardinality(rt)] = tp[j] and rt[cardinality(rt) - 1] = tp[j] and rt[cardinality(rt) - 2] = tp[j]) then
          pick := j;
          exit;
        end if;
      end if;
      j := j + 1;
    end loop;
    pick := coalesce(pick, first);
    used[pick] := true;
    res := res || ids[pick];
    ra := ra || au[pick];
    rt := rt || tp[pick];
  end loop;

  return query
    select p.* from unnest(res[greatest(p_offset, 0) + 1 : need]) with ordinality as u(id, n)
    join posts p on p.id = u.id order by u.n;
end $$;
revoke all on function feed(text, int, int, text, text, int) from public;
grant execute on function feed(text, int, int, text, text, int) to anon, authenticated;

-- ─── «Не интересно» с сайта ─────────────────────────────────
-- p_on = false — вернуть; без p_feature — скрыть и получить варианты «Что не так?»; p_feature — ответ ('seen' — уже видел, иначе признак идеи).
-- Варианты: 2 самых «отличающих» слова (редкие и не из любимого), первая категория, «сложно», «долго», автор.
create or replace function not_interested_set(p_post uuid, p_on boolean default true, p_feature text default null, p_anon text default null)
returns text[]
language plpgsql security definer set search_path = public as $$
declare
  who text := viewer_key(p_anon);
  p posts;
  opts text[];
begin
  if who is null then raise exception 'нет зрителя'; end if;
  select * into p from posts where id = p_post;
  if p.id is null then return '{}'; end if;
  if not coalesce(p_on, true) then
    delete from not_interested where viewer = who and post_id = p_post;
    return '{}';
  end if;
  if p_feature is null then
    insert into not_interested (viewer, user_id, post_id) values (who, auth.uid(), p_post)
      on conflict (viewer, post_id) do nothing;
    with likes as (select * from taste_likes(who, now())),
    allp as (select n::float as n from feature_df where f = '#all'),
    words as (
      select x as f from unnest(p.feat) x
      left join likes l on l.f = x left join feature_df d on d.f = x
      where x !~ '^(t|d|tm|u|m|i):' and char_length(x) <= 40
      order by ln(1 + (select n from allp) / greatest(coalesce(d.n, 1), 1)) * (1 - coalesce(l.w, 0) / (coalesce(l.w, 0) + 1)) desc, x
      limit 2
    )
    select array(select f from words)
      || array(select 't:' || p.topics[1] where p.topics[1] is not null)
      || array(select 'd:сложно' where 'd:сложно' = any (p.feat))
      || array(select 'tm:долго' where 'tm:долго' = any (p.feat))
      || array(select 'u:' || p.author_id::text where p.author_id::text is distinct from auth.uid()::text)
      into opts;
    return opts;
  end if;
  if p_feature = 'seen' then
    update not_interested set reason = 'seen', feature = null where viewer = who and post_id = p_post;
  elsif p_feature = any (p.feat) then
    update not_interested set reason = 'feature', feature = p_feature where viewer = who and post_id = p_post;
  else
    raise exception 'неверный ответ';
  end if;
  return '{}';
end $$;
revoke all on function not_interested_set(uuid, boolean, text, text) from public;
grant execute on function not_interested_set(uuid, boolean, text, text) to anon, authenticated;

-- ─── «Ещё идеи» под идеей: похожие по признакам (редкие общие — важнее), потом популярные ───
create or replace function similar_posts(p_post uuid, p_offset int default 0, p_limit int default 30, p_anon text default null)
returns setof posts
language sql stable security definer set search_path = public as $$
  with src as (select feat from posts where id = p_post),
  allp as (select n::float as n from feature_df where f = '#all'),
  who as (select viewer_key(p_anon) as v)
  select p.* from posts p
  where p.id <> p_post and not p.hidden
    and not exists (select 1 from not_interested n, who where n.viewer = who.v and n.post_id = p.id)
  order by
    coalesce((select sum(ln(1 + (select n from allp) / greatest(d.n, 1)))
              from unnest(p.feat) x join src on x = any (src.feat) left join feature_df d on d.f = x), 0)
      / sqrt(greatest(cardinality(p.feat), 1) * greatest((select cardinality(feat) from src), 1))
      + 0.05 * post_pop(p.saves_count, p.tries_count, p.tries_ok_count, p.created_at) desc,
    p.created_at desc
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 60)
$$;
revoke all on function similar_posts(uuid, int, int, text) from public;
grant execute on function similar_posts(uuid, int, int, text) to anon, authenticated;

-- ─── Поиск: при равенстве — где чаще получилось и сохраняли ───
create or replace function search_posts(p_q text, p_topics text[] default '{}', p_offset int default 0, p_limit int default 30)
returns setof posts
language sql stable security definer set search_path = public as $$
  with q as (select '%' || replace(replace(replace(lower(btrim(coalesce(p_q, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat)
  select p.* from posts p join profiles a on a.id = p.author_id, q
  where not p.hidden and char_length(btrim(coalesce(p_q, ''))) >= 2 and (
    lower(p.title) like q.pat
    or p.topics && coalesce(p_topics, '{}')
    or exists (select 1 from unnest(p.tags || p.ai_tags || p.topics) as t where lower(t) like q.pat)
    or lower(coalesce(p.ai_text, '')) like q.pat
    or lower(a.name) like q.pat
  )
  order by (lower(p.title) like q.pat) desc, post_pop(p.saves_count, p.tries_count, p.tries_ok_count, p.created_at) desc, p.created_at desc
  offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 60)
$$;
revoke all on function search_posts(text, text[], int, int) from public;
grant execute on function search_posts(text, text[], int, int) to anon, authenticated;
