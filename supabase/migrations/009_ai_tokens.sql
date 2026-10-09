-- Клубок, обновление 9: пропуск в ГигаЧат хранится в базе, общий для всех копий функции
-- (иначе каждая проверка картинки заново входит в ГигаЧат — лишние ~0,9 с). Читать и писать может только функция publish.
create table if not exists ai_tokens (
  id text primary key,
  value text not null,
  -- до какого времени действует (мс с 1970 г.)
  exp bigint not null
);
alter table ai_tokens enable row level security;
