# Уменьшенные копии (600 px) для старых картинок идей, которые шире ~660 px.
# Картинки публичные; копию кладёт функция publish (действие admin-thumb), пропуская только с ключом доступа Supabase.
# В журнал — только числа.
import base64, io, json, os, urllib.request
from PIL import Image

REF = 'exjpqpmfdumjqzgehtpg'
TOKEN = os.environ['SUPABASE_ACCESS_TOKEN']
FN = f'https://{REF}.supabase.co/functions/v1/publish'
W = 600

def sql(q):
    req = urllib.request.Request(f'https://api.supabase.com/v1/projects/{REF}/database/query', data=json.dumps({'query': q}).encode(),
                                 headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json', 'User-Agent': 'klubok-thumbs'})
    return json.load(urllib.request.urlopen(req))

rows = sql('select images from posts')
todo = {i['src'] for r in rows for i in r['images'] if 'thumb' not in i and i['src'].endswith('.jpg')}
print('картинок без копии:', len(todo))
done = skipped = failed = 0
before = after = 0
for src in sorted(todo):
    try:
        raw = urllib.request.urlopen(urllib.request.Request(src, headers={'User-Agent': 'klubok-thumbs'})).read()
        im = Image.open(io.BytesIO(raw))
        if im.width <= W * 1.1:
            skipped += 1
            continue
        im = im.convert('RGB').resize((W, round(im.height * W / im.width)), Image.LANCZOS)
        out = io.BytesIO()
        im.save(out, 'JPEG', quality=85, optimize=True, progressive=True)
        body = json.dumps({'action': 'admin-thumb', 'src': src, 'thumb': base64.b64encode(out.getvalue()).decode()}).encode()
        res = json.load(urllib.request.urlopen(urllib.request.Request(FN, data=body, headers={'Content-Type': 'application/json', 'x-admin-token': TOKEN})))
        if not res.get('ok') or not res.get('posts'):
            raise RuntimeError(res)
        done += 1
        before += len(raw)
        after += out.tell()
    except Exception as e:
        failed += 1
        print('ошибка:', str(e)[:200])
print(f'сделано копий: {done}, не нужно (узкие): {skipped}, ошибок: {failed}')
if done:
    print(f'вес этих картинок в ленте: было {before // 1024} КБ, стало {after // 1024} КБ')
