# Опыт: видит ли ГигаЧат надпись поверх картинки, или только молчит про мат.
# Берёт картинку идеи, делает копию, где вместо надписи — обычное слово «привет», и задаёт ГигаЧату вопросы (действие admin-ask).
# В журнал — только «нашёл / не нашёл» и длины, без текста с картинок (репозиторий открытый).
import base64, io, json, os, sys, urllib.request
from PIL import Image, ImageDraw, ImageFont

REF = 'exjpqpmfdumjqzgehtpg'
TOKEN = os.environ['SUPABASE_ACCESS_TOKEN']
FN = f'https://{REF}.supabase.co/functions/v1/publish'
SRC, BOX = os.environ['SRC'], [int(x) for x in os.environ['BOX'].split(',')]

def ask(img, what, model=''):
    out = io.BytesIO()
    img.save(out, 'JPEG', quality=92)
    body = json.dumps({'action': 'admin-ask', 'ask': what, 'model': model, 'image': base64.b64encode(out.getvalue()).decode()}).encode()
    req = urllib.request.Request(FN, data=body, headers={'Content-Type': 'application/json', 'x-admin-token': TOKEN})
    return json.load(urllib.request.urlopen(req, timeout=120))

orig = Image.open(io.BytesIO(urllib.request.urlopen(SRC).read())).convert('RGB')
probe = orig.copy()
d = ImageDraw.Draw(probe)
d.rectangle(BOX, fill=orig.getpixel((BOX[0] - 2, BOX[1])))
d.text((BOX[0], BOX[1]), 'привет', fill=(230, 30, 30), font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18))
if len(sys.argv) > 1:
    probe.save(sys.argv[1])
    sys.exit()

for name, img in [('с матом', orig), ('с «привет»', probe)]:
    for model in ['GigaChat-2-Max', 'GigaChat-2-Pro']:
        o = ask(img, 'ocr', model)
        t = (o.get('text') or '').lower()
        print(f'{name:12} {model:15} переписал текст: {len(t)} букв, мат по нашему списку: {"ЕСТЬ" if o.get("mat") else "нет"}, «привет» {"ЕСТЬ" if "привет" in t else "нет"}, '
              f'«быстрый доступ» {"есть" if "быстрый доступ" in t else "нет"}, отказ фильтра: {o.get("blocked")}')
