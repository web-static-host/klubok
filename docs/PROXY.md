# Проброс к Supabase через российский сервер

Зачем: провайдеры в России душат Cloudflare, через который работает Supabase, — из браузера всё грузится по 10+ секунд.
Браузер ходит на российский сервер, а сервер — в Supabase (между серверами связь нормальная).

## 1. Настройка nginx на сервере

**Одной командой** (по SSH на сервере):

```bash
curl -fsSL https://raw.githubusercontent.com/web-static-host/klubok/main/server/setup-nginx.sh | sudo bash
```

Скрипт `server/setup-nginx.sh`: сохраняет копию `/etc/nginx` в `/root/nginx-backup-<дата>`; в файле сайта заменяет блоки «# Клубок: …» одной строкой
`include /etc/nginx/klubok-locations.conf;`; пишет `/etc/nginx/klubok-locations.conf` (проброс, Realtime, картинки) и
`/etc/nginx/conf.d/klubok-cache.conf` (место для картинок и постоянные соединения с Supabase — `upstream supabase_api … keepalive`);
проверяет `nginx -t` и перезагружает nginx. Не принял — возвращает всё как было. Повторный запуск ничего не ломает. Блоки других проектов не трогает.

Что получается (для справки):
- `/api/` → Supabase через постоянные соединения (без нового рукопожатия на каждый запрос);
- `/api/realtime/` → живые обновления;
- `/api/storage/v1/object/public/` → картинки запоминаются на сервере на 30 дней, браузер тоже хранит их у себя (`Cache-Control: public, max-age=2592000, immutable`), в ответе `X-Cache: HIT/MISS`.

Картинки на сайте не меняются (у каждой новой — своё имя), поэтому запоминать их надолго безопасно. Удалённая картинка может ещё до 30 дней открываться по прямой ссылке из запомненного.

Проверка: `curl -sI https://ВАШ-ДОМЕН/api/storage/v1/object/public/images/demo/101.jpg` дважды — во второй раз `X-Cache: HIT`.

10–12 октября: без запоминания (заголовка `X-Cache` не было, браузеру уходило `no-cache`) каждая картинка каждый раз шла в Supabase, часть «висела» серой.
Сайт теперь сам перезапрашивает зависшую на экране картинку через 6 с и через 12 с берёт её напрямую из Supabase (`Picture` в `src/components/ui.tsx`).

## 2. Сайт

В `.env` проекта: `VITE_API_URL=https://ВАШ-ДОМЕН/api` (сейчас: `https://klubok-api.213-171-29-161.sslip.io/api`) → коммит в `main` → сайт сам пересоберётся.
Адреса картинок в базе остаются адресами Supabase; сайт сам показывает их через проброс (`src/supabase.ts`: `viaApi`, `canonical`).
