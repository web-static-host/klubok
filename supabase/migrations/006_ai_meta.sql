-- Клубок, обновление 6: подробная раскладка идеи от ИИ (для поиска и будущих рекомендаций).
-- Запуск: Supabase → SQL Editor → вставить весь файл → Run. Запускать ДО обновления функции publish.

-- раскладка поста: идея, вид, главное, способы, инструменты, повод, стиль, похожие темы, сложность, время
alter table posts add column if not exists ai_meta jsonb;
-- то же для каждой проверенной картинки
alter table image_checks add column if not exists meta jsonb;
