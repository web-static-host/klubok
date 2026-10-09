-- Клубок, обновление 11 (ТЕСТ): замеры публикации — сколько заняли проверка текста, картинок и запись. Убрать после тестов.
alter table posts add column if not exists publish_timing jsonb;
