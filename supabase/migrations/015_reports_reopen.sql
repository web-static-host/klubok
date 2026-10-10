-- Клубок, обновление 15: на одно и то же можно пожаловаться снова, когда прежнюю жалобу уже рассмотрели
-- (например, человек снова нарушил после «нарушения нет»). Пока жалоба не рассмотрена — повторная не нужна.
-- Запускается само из GitHub. Повторный запуск ничего не ломает.
alter table reports drop constraint if exists reports_reporter_id_target_type_target_id_key;
create unique index if not exists reports_open_once on reports (reporter_id, target_type, target_id) where status = 'open';
