#!/usr/bin/env bash
# Клубок: настройка сервера-посредника (nginx) одной командой.
#   curl -fsSL https://raw.githubusercontent.com/web-static-host/klubok/main/server/setup-nginx.sh | sudo bash
# Что делает: сохраняет копию настроек; заменяет блоки «# Клубок: …» на актуальные (проброс к Supabase с постоянными
# соединениями, Realtime, картинки с запоминанием на 30 дней); проверяет nginx; при ошибке возвращает всё как было.
# Повторный запуск ничего не ломает. Подробности — docs/PROXY.md.
set -euo pipefail
SB=exjpqpmfdumjqzgehtpg.supabase.co
[ "$(id -u)" = 0 ] || { echo "Нужно запускать через sudo"; exit 1; }
command -v nginx >/dev/null || { echo "nginx не найден"; exit 1; }

# файл сайта: где стоит старый блок «# Клубок: проброс к Supabase» или уже наша строка include (настоящий путь, без повторов из sites-enabled)
FOUND=$(grep -rlE "# Клубок: проброс к Supabase|include /etc/nginx/klubok-locations.conf" /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null \
  | xargs -r -n1 readlink -f | sort -u || true)
COUNT=$(printf '%s' "$FOUND" | grep -c . || true)
[ "$COUNT" = 1 ] || { echo "Файл с настройкой Клубка: найдено $COUNT. Пришлите вывод: sudo grep -rn 'supabase' /etc/nginx/"; exit 1; }
SITE=$FOUND
echo "Файл сайта: $SITE"

STAMP=$(date +%Y%m%d-%H%M%S)
BK=/root/nginx-backup-$STAMP
mkdir -p "$BK"
cp -a /etc/nginx "$BK/"
echo "Копия настроек: $BK"
restore() { rm -rf /etc/nginx && cp -a "$BK/nginx" /etc/nginx; echo "Вернул настройки как было."; }

mkdir -p /var/cache/nginx/klubok
chown -R www-data:www-data /var/cache/nginx/klubok 2>/dev/null || true

# общее: место для картинок и постоянные соединения с Supabase
cat > /etc/nginx/conf.d/klubok-cache.conf <<CONF
# Клубок: место для запомненных картинок (до 2 ГБ, 30 дней)
proxy_cache_path /var/cache/nginx/klubok levels=1:2 keys_zone=klubok:10m max_size=2g inactive=30d use_temp_path=off;
# Клубок: постоянные соединения с Supabase (без нового рукопожатия на каждый запрос)
upstream supabase_api {
    server $SB:443;
    keepalive 32;
}
CONF

# блоки сайта
cat > /etc/nginx/klubok-locations.conf <<'CONF'
# Клубок: проброс к Supabase
location /api/ {
    proxy_pass https://supabase_api/;
    proxy_ssl_server_name on;
    proxy_ssl_name exjpqpmfdumjqzgehtpg.supabase.co;
    proxy_ssl_session_reuse on;
    proxy_set_header Host exjpqpmfdumjqzgehtpg.supabase.co;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    client_max_body_size 20m;
    proxy_read_timeout 180s;
    proxy_send_timeout 180s;
}

# Клубок: живые обновления (Realtime) — постоянное соединение
location /api/realtime/ {
    proxy_pass https://exjpqpmfdumjqzgehtpg.supabase.co/realtime/;
    proxy_ssl_server_name on;
    proxy_set_header Host exjpqpmfdumjqzgehtpg.supabase.co;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
}

# Клубок: картинки — запоминаются на сервере на 30 дней, браузер тоже хранит их у себя
location /api/storage/v1/object/public/ {
    proxy_pass https://supabase_api/storage/v1/object/public/;
    proxy_ssl_server_name on;
    proxy_ssl_name exjpqpmfdumjqzgehtpg.supabase.co;
    proxy_ssl_session_reuse on;
    proxy_set_header Host exjpqpmfdumjqzgehtpg.supabase.co;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_cache klubok;
    proxy_cache_valid 200 30d;
    proxy_cache_lock on;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_ignore_headers Cache-Control Expires Set-Cookie;
    proxy_hide_header Cache-Control;
    add_header Cache-Control "public, max-age=2592000, immutable" always;
    add_header X-Cache $upstream_cache_status always;
}
CONF

# в файле сайта: убрать старые блоки «# Клубок: …» и поставить одну строку include на их место
python3 - "$SITE" <<'PY'
import sys, re
path = sys.argv[1]
lines = open(path, encoding='utf-8').read().split('\n')
out, i, placed = [], 0, False
while i < len(lines):
    l = lines[i]
    if l.strip().startswith('include /etc/nginx/klubok-locations.conf'):
        if not placed:
            out.append(l); placed = True
        i += 1; continue
    if l.strip().startswith('# Клубок:'):
        j = i + 1
        while j < len(lines) and not lines[j].strip(): j += 1
        if j < len(lines) and lines[j].strip().startswith('location'):
            depth, k = 0, j
            while k < len(lines):
                depth += lines[k].count('{') - lines[k].count('}')
                k += 1
                if depth == 0 and '{' in ''.join(lines[j:k]): break
            if not placed:
                indent = re.match(r'\s*', l).group(0)
                out.append(indent + 'include /etc/nginx/klubok-locations.conf;'); placed = True
            i = k
            while i < len(lines) and not lines[i].strip(): i += 1
            continue
    out.append(l); i += 1
if not placed:
    sys.exit('Блоки Клубка не найдены в ' + path)
open(path, 'w', encoding='utf-8').write('\n'.join(out))
print('Блоки Клубка заменены строкой include в', path)
PY

if nginx -t 2>/tmp/klubok-nginx-test.txt; then
  systemctl reload nginx
  echo "ГОТОВО: nginx принял настройки и перезагружен. Напишите «готово» — я проверю."
else
  echo "nginx не принял настройки:"; cat /tmp/klubok-nginx-test.txt
  restore
  nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
  echo "Пришлите этот текст — разберусь."
  exit 1
fi
