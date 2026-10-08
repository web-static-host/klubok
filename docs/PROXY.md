# Проброс к Supabase через российский сервер

Зачем: провайдеры в России душат Cloudflare, через который работает Supabase, — из браузера всё грузится по 10+ секунд.
Браузер ходит на российский сервер, а сервер — в Supabase (между серверами связь нормальная).

## 1. Настройка nginx на сервере

Внутрь блока `server { … }` того домена, что уже работает по https (файл обычно в `/etc/nginx/sites-available/` или `/etc/nginx/conf.d/`):

```nginx
# Клубок: проброс к Supabase
location /klubok-api/ {
    proxy_pass https://exjpqpmfdumjqzgehtpg.supabase.co/;
    proxy_ssl_server_name on;
    proxy_set_header Host exjpqpmfdumjqzgehtpg.supabase.co;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    client_max_body_size 20m;
    proxy_read_timeout 180s;
    proxy_send_timeout 180s;
}

# Клубок: картинки — с запоминанием на сервере на 30 дней (второй и следующие показы — мгновенно)
location /klubok-api/storage/v1/object/public/ {
    proxy_pass https://exjpqpmfdumjqzgehtpg.supabase.co/storage/v1/object/public/;
    proxy_ssl_server_name on;
    proxy_set_header Host exjpqpmfdumjqzgehtpg.supabase.co;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_cache klubok;
    proxy_cache_valid 200 30d;
    proxy_ignore_headers Cache-Control Expires Set-Cookie;
    add_header Cache-Control "public, max-age=2592000";
}
```

И отдельный файл `/etc/nginx/conf.d/klubok-cache.conf` (одна строка — место для запомненных картинок, до 2 ГБ):

```nginx
proxy_cache_path /var/cache/nginx/klubok levels=1:2 keys_zone=klubok:10m max_size=2g inactive=30d use_temp_path=off;
```

Проверить и применить:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Проверка в браузере: `https://ВАШ-ДОМЕН/klubok-api/storage/v1/object/public/images/demo/101.jpg` — должна открыться картинка сырников.

## 2. Сайт

В `.env` проекта: `VITE_API_URL=https://ВАШ-ДОМЕН/klubok-api` → коммит в `main` → сайт сам пересоберётся.
Адреса картинок в базе остаются адресами Supabase; сайт сам показывает их через проброс (`src/supabase.ts`: `viaApi`, `canonical`).
