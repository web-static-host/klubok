/**
 * Клубок: публикация с проверкой.
 * Всё, что пишут пользователи (посты, отзывы «Я попробовал», ответы, профиль), проходит через эту функцию:
 * 1) быстрые проверки текста: ссылки (в том числе замаскированные), телефоны, мат;
 * 2) проверка ИИ GigaChat: текст и каждая картинка (нет людей, нет запрещённого), скрытые слова для поиска;
 * 3) запись в базу. Напрямую с сайта писать в эти таблицы нельзя.
 *
 * Секреты (Supabase → Edge Functions → Secrets): GIGACHAT_AUTH_KEY — «ключ авторизации» из личного кабинета GigaChat.
 * Проверка связи с GigaChat: открыть …/functions/v1/publish?check=1
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

// Корневой сертификат Минцифры (Russian Trusted Root CA): без него GigaChat не открывается
const RUSSIAN_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIFwjCCA6qgAwIBAgICEAAwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx
PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu
ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg
Q0EwHhcNMjIwMzAxMjEwNDE1WhcNMzIwMjI3MjEwNDE1WjBwMQswCQYDVQQGEwJS
VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg
YW5kIENvbW11bmljYXRpb25zMSAwHgYDVQQDDBdSdXNzaWFuIFRydXN0ZWQgUm9v
dCBDQTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAMfFOZ8pUAL3+r2n
qqE0Zp52selXsKGFYoG0GM5bwz1bSFtCt+AZQMhkWQheI3poZAToYJu69pHLKS6Q
XBiwBC1cvzYmUYKMYZC7jE5YhEU2bSL0mX7NaMxMDmH2/NwuOVRj8OImVa5s1F4U
zn4Kv3PFlDBjjSjXKVY9kmjUBsXQrIHeaqmUIsPIlNWUnimXS0I0abExqkbdrXbX
YwCOXhOO2pDUx3ckmJlCMUGacUTnylyQW2VsJIyIGA8V0xzdaeUXg0VZ6ZmNUr5Y
Ber/EAOLPb8NYpsAhJe2mXjMB/J9HNsoFMBFJ0lLOT/+dQvjbdRZoOT8eqJpWnVD
U+QL/qEZnz57N88OWM3rabJkRNdU/Z7x5SFIM9FrqtN8xewsiBWBI0K6XFuOBOTD
4V08o4TzJ8+Ccq5XlCUW2L48pZNCYuBDfBh7FxkB7qDgGDiaftEkZZfApRg2E+M9
G8wkNKTPLDc4wH0FDTijhgxR3Y4PiS1HL2Zhw7bD3CbslmEGgfnnZojNkJtcLeBH
BLa52/dSwNU4WWLubaYSiAmA9IUMX1/RpfpxOxd4Ykmhz97oFbUaDJFipIggx5sX
ePAlkTdWnv+RWBxlJwMQ25oEHmRguNYf4Zr/Rxr9cS93Y+mdXIZaBEE0KS2iLRqa
OiWBki9IMQU4phqPOBAaG7A+eP8PAgMBAAGjZjBkMB0GA1UdDgQWBBTh0YHlzlpf
BKrS6badZrHF+qwshzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qwshzAS
BgNVHRMBAf8ECDAGAQH/AgEEMA4GA1UdDwEB/wQEAwIBhjANBgkqhkiG9w0BAQsF
AAOCAgEAALIY1wkilt/urfEVM5vKzr6utOeDWCUczmWX/RX4ljpRdgF+5fAIS4vH
tmXkqpSCOVeWUrJV9QvZn6L227ZwuE15cWi8DCDal3Ue90WgAJJZMfTshN4OI8cq
W9E4EG9wglbEtMnObHlms8F3CHmrw3k6KmUkWGoa+/ENmcVl68u/cMRl1JbW2bM+
/3A+SAg2c6iPDlehczKx2oa95QW0SkPPWGuNA/CE8CpyANIhu9XFrj3RQ3EqeRcS
AQQod1RNuHpfETLU/A2gMmvn/w/sx7TB3W5BPs6rprOA37tutPq9u6FTZOcG1Oqj
C/B7yTqgI7rbyvox7DEXoX7rIiEqyNNUguTk/u3SZ4VXE2kmxdmSh3TQvybfbnXV
4JbCZVaqiZraqc7oZMnRoWrXRG3ztbnbes/9qhRGI7PqXqeKJBztxRTEVj8ONs1d
WN5szTwaPIvhkhO3CO5ErU2rVdUr89wKpNXbBODFKRtgxUT70YpmJ46VVaqdAhOZ
D9EUUn4YaeLaS8AjSF/h7UkjOibNc4qVDiPP+rkehFWM66PVnP1Msh93tc+taIfC
EYVMxjh8zNbFuoc7fzvvrFILLe7ifvEIUqSVIC/AzplM/Jxw7buXFeGP1qVCBEHq
391d/9RAfaZ12zkwFsl+IKwE/OZxW8AHa9i1p4GO0YSNuczzEm4=
-----END CERTIFICATE-----`

const SB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GC_KEY = (Deno.env.get('GIGACHAT_AUTH_KEY') ?? '').trim()
const GC_SCOPE = Deno.env.get('GIGACHAT_SCOPE') ?? 'GIGACHAT_API_PERS'
const GC_MODEL = Deno.env.get('GIGACHAT_MODEL') ?? 'GigaChat-2-Max'
const GC_API = 'https://gigachat.devices.sberbank.ru/api/v1'
const GC_OAUTH = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })

// ─── 1. Быстрые проверки текста ─────────────────────────────

/** Похожие латинские буквы и цифры → русские (обход мата через «xyй», «3», «0») */
const LOOKALIKE: Record<string, string> = {
  a: 'а', c: 'с', e: 'е', k: 'к', m: 'м', h: 'н', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', u: 'и', b: 'б',
  '0': 'о', '3': 'з', '6': 'б', '@': 'а', ё: 'е',
}
const MAT = new RegExp(
  '(?<![а-я])(' +
    [
      '(?:на|по|ни|о|от|до|за)?ху[йяеи]', 'пизд', 'пезд', '(?:за|на|вы|по|у|от|отъ|пере|до|при|раз|рас|под|об|въ)?еб(?:а|у|л|н)', 'бля(?!х)', 'бляд',
      'муд[ао]к', 'мудил', 'пид[оа]р', 'г[ао]ндон', 'залуп', 'шлюх', 'манд[аеуы](?![а-я])', 'сук[аи](?![а-я])', 'долбо[её]б', 'уеб',
    ].join('|') +
    ')',
  'u',
)

function normalize(s: string) {
  let t = s.toLowerCase().replace(/[a-z0-9@ё]/g, (c) => LOOKALIKE[c] ?? c)
  // «х.у.й», «х-у-й», «х*й»: знаки между буквами убираем
  t = t.replace(/(?<=[а-я])[.\-_*'"`~|/\\,!?+]+(?=[а-я])/g, '')
  // «х у й»: одиночные буквы через пробел склеиваем
  t = t.replace(/(?<=(?:^|\s)[а-я])\s(?=[а-я](?:\s|$))/g, '')
  return t
}

const TLD = '(?:ru|рф|su|com|net|org|info|biz|io|me|online|site|store|shop|pro|club|xyz|ly|gl|cc|tv|app|dev|link|top|by|kz|ua|ру|ком|нет|орг)'
const LINK_PATTERNS = [
  /https?\s*:|www\s*\.|:\s*\/\//i,
  // site.ru, site . ru, site(.)ru, site[dot]ru, site точка ру
  new RegExp(`[a-zа-я0-9-]{2,}\\s*(?:\\.|\\(\\s*\\.\\s*\\)|\\[\\s*\\.\\s*\\]|\\(dot\\)|\\[dot\\]|\\sdot\\s|\\sточка\\s|\\s\\.\\s)\\s*${TLD}(?![a-zа-я])`, 'i'),
  /\bt\s*\.\s*me\b|\bwa\s*\.\s*me\b|\bvk\s*\.\s*(?:com|cc|me)\b/i,
  // телефон: 10+ цифр подряд с пробелами, скобками, дефисами
  /(?:\+?\d[\s\-()]*){10,}/,
  // почта: name@site, name собака site
  /[a-z0-9._-]+\s*(?:@|\(at\)|\[at\]|\sсобака\s)\s*[a-z0-9-]+\s*(?:\.|\sточка\s)\s*[a-z]{2,}/i,
]

/** Причины отказа по быстрым проверкам (пустой список — всё хорошо) */
export function quickTextCheck(text: string): string[] {
  const reasons: string[] = []
  if (!text.trim()) return reasons
  if (LINK_PATTERNS.some((r) => r.test(text))) reasons.push('Ссылки, адреса сайтов, телефоны и контакты публиковать нельзя (в том числе через точки и пробелы)')
  if (MAT.test(normalize(text))) reasons.push('Нецензурная брань запрещена')
  return reasons
}

// ─── 2. ИИ GigaChat ─────────────────────────────────────────

let tlsClient: Deno.HttpClient | undefined
function gcFetch(url: string, init: RequestInit = {}) {
  tlsClient ??= Deno.createHttpClient({ caCerts: [RUSSIAN_ROOT_CA] })
  return fetch(url, { ...init, client: tlsClient } as RequestInit)
}

let token: { value: string; exp: number } | undefined
async function gcToken() {
  if (token && token.exp - 60_000 > Date.now()) return token.value
  if (!GC_KEY) throw new Error('не задан секрет GIGACHAT_AUTH_KEY')
  const res = await gcFetch(GC_OAUTH, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${GC_KEY.replace(/^Basic\s+/i, '')}`,
      RqUID: crypto.randomUUID(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: `scope=${GC_SCOPE}`,
  })
  if (!res.ok) throw new Error(`GigaChat: вход не удался (${res.status}) ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  token = { value: data.access_token, exp: Number(data.expires_at) || Date.now() + 25 * 60_000 }
  return token.value
}

interface Verdict {
  ok: boolean
  reasons: string[]
  tags: string[]
  text: string
  description: string
}

/** Ответ модели → объект; если модель отказалась отвечать (фильтр GigaChat) — это нарушение */
async function gcAsk(system: string, user: string, attachments: string[] = [], allowPeopleNow = false): Promise<Verdict> {
  const res = await gcFetch(`${GC_API}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await gcToken()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      model: GC_MODEL,
      temperature: 0.01,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user, ...(attachments.length ? { attachments } : {}) },
      ],
    }),
  })
  if (!res.ok) throw new Error(`GigaChat: ошибка запроса (${res.status}) ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  const choice = data.choices?.[0]
  if (choice?.finish_reason === 'blacklist') return { ok: false, reasons: ['Содержимое нарушает правила'], tags: [], text: '', description: '' }
  const content: string = choice?.message?.content ?? ''
  const m = content.match(/\{[\s\S]*\}/)
  if (!m) throw new Error(`GigaChat: непонятный ответ: ${content.slice(0, 200)}`)
  const v = JSON.parse(m[0])
  return {
    ok: v.ok !== false && !(v.people === true && !allowPeopleNow),
    reasons: [
      ...(v.people === true && !allowPeopleNow ? ['На картинках не должно быть людей (руки в кадре можно)'] : []),
      ...(Array.isArray(v.reasons) ? v.reasons.map(String) : []),
    ].filter((r, i, a) => r && a.indexOf(r) === i),
    tags: Array.isArray(v.tags) ? v.tags.map((t: unknown) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 20) : [],
    text: typeof v.text === 'string' ? v.text.slice(0, 4000) : '',
    description: typeof v.description === 'string' ? v.description.slice(0, 500) : '',
  }
}

const RULES = `Правила соцсети «Клубок» (рецепты, лайфхаки, дом, сад, рукоделие). Запрещено:
— мат и грубая брань, в том числе замаскированные (буквы заменены символами, разбиты точками или пробелами);
— оскорбления, травля, угрозы, ненависть и дискриминация по любому признаку;
— сексуальный контент и нагота, в том числе намёки; материалы с участием детей в таком контексте;
— насилие, жестокость, кровь, издевательство над животными;
— терроризм, экстремизм, их символика и оправдание;
— наркотики и их пропаганда, продажа алкоголя и табака;
— оружие, взрывчатка, инструкции по причинению вреда;
— суицид и самоповреждение, их пропаганда;
— мошенничество, азартные игры, реклама, продажа товаров и услуг, спам;
— любые ссылки, адреса сайтов, QR-коды, контакты, ники в мессенджерах и соцсетях, номера телефонов, почта — в том числе замаскированные («сайт точка ру», «t . me», буквы через пробел);
— всё, что нарушает законодательство Российской Федерации.
Обычные бытовые вещи — не нарушение: кухонный нож, огонь мангала, уксус, спирт для протирки, вино в рецепте соуса и т.п.`

async function aiCheckText(text: string): Promise<Verdict> {
  return gcAsk(
    `Ты — модератор. ${RULES}\nОтветь только JSON без пояснений: {"ok": true или false, "reasons": ["коротко по-русски, что нарушено"]}`,
    `Проверь текст пользователя:\n"""${text}"""`,
  )
}

async function aiCheckImage(src: string, allowPeople = false): Promise<Verdict> {
  const img = await fetch(src)
  if (!img.ok) throw new Error(`не удалось скачать картинку ${src}`)
  const form = new FormData()
  form.append('file', new Blob([await img.arrayBuffer()], { type: img.headers.get('content-type') ?? 'image/jpeg' }), 'image.jpg')
  form.append('purpose', 'general')
  const up = await gcFetch(`${GC_API}/files`, { method: 'POST', headers: { Authorization: `Bearer ${await gcToken()}` }, body: form })
  if (!up.ok) throw new Error(`GigaChat: картинка не загрузилась (${up.status}) ${(await up.text()).slice(0, 200)}`)
  const { id } = await up.json()
  try {
    return await gcAsk(
      `Ты — модератор картинок. ${RULES}
${
        allowPeople
          ? 'Это фото профиля (аватар): люди и лица на нём разрешены, остальные правила действуют. Поле people всегда false.'
          : 'Отдельное правило: на картинках публикаций не должно быть людей — лиц, тел, фигур, селфи (руки в кадре можно; нарисованные схематичные человечки на инфографике — тоже можно).'
      }
Ответь только JSON без пояснений:
{"ok": true или false, "people": true или false, "reasons": ["коротко по-русски, что нарушено"], "text": "весь текст с картинки дословно, или пусто", "tags": ["5–15 слов по-русски: что изображено, продукты, предметы, действия"], "description": "одно предложение: что на картинке"}`,
      'Проверь картинку по правилам и опиши её.',
      [id],
      allowPeople,
    )
  } finally {
    gcFetch(`${GC_API}/files/${id}/delete`, { method: 'POST', headers: { Authorization: `Bearer ${await gcToken()}` } }).catch(() => {})
  }
}

// ─── 3. Публикация ──────────────────────────────────────────

const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } })
const PUBLIC_PREFIX = `${SB_URL}/storage/v1/object/public/images/`

interface ImgIn {
  src: string
  ratio: number
}

/** Картинка должна лежать в хранилище сайта, в папке этого пользователя (никаких чужих адресов) */
function ownImage(img: ImgIn | undefined, uid: string): img is ImgIn {
  return !!img && typeof img.src === 'string' && img.src.startsWith(`${PUBLIC_PREFIX}${uid}/`) && Number(img.ratio) > 0 && Number(img.ratio) < 10
}

async function removeImages(imgs: ImgIn[]) {
  const paths = imgs.map((i) => i.src.slice(PUBLIC_PREFIX.length))
  if (paths.length) await admin.storage.from('images').remove(paths)
}

/** Проверка текста и картинок. ИИ недоступен — остаются быстрые проверки, пост помечается как не проверенный ИИ */
export async function moderate(texts: string[], images: ImgIn[], allowPeople = false) {
  const text = texts.filter(Boolean).join('\n')
  const reasons = quickTextCheck(text)
  if (reasons.length) return { ok: false, reasons, ai: false, tags: [] as string[], aiText: '' }
  try {
    const verdicts: Verdict[] = []
    if (text.trim()) verdicts.push(await aiCheckText(text))
    for (const img of images) verdicts.push(await aiCheckImage(img.src, allowPeople)) // по очереди: у личного тарифа один поток
    const bad = verdicts.flatMap((v) => (v.ok ? [] : v.reasons.length ? v.reasons : ['Содержимое нарушает правила']))
    // текст на картинках — тоже через быстрые проверки
    const imgText = verdicts.map((v) => v.text).join('\n')
    bad.push(...quickTextCheck(imgText))
    return {
      ok: bad.length === 0,
      reasons: [...new Set(bad)],
      ai: true,
      tags: [...new Set(verdicts.flatMap((v) => v.tags))].slice(0, 40),
      aiText: verdicts.map((v) => [v.description, v.text].filter(Boolean).join('. ')).filter(Boolean).join('\n'),
    }
  } catch (e) {
    console.error('ИИ недоступен:', e instanceof Error ? e.message : e)
    return { ok: true, reasons: [], ai: false, tags: [] as string[], aiText: '' }
  }
}

/** Имя — любое (1–50 символов), ник — латиница, цифры и _ (3–30), уникальный */
function profileErrors(name: string, handle: string): string[] {
  const r: string[] = []
  if (!name) r.push('Напишите имя или название')
  if (!/^[a-z0-9_]{3,30}$/.test(handle)) r.push('Ник: от 3 до 30 латинских букв, цифр или _')
  return r
}

async function handleTaken(handle: string, exceptId?: string) {
  const { data } = await admin.from('profiles').select('id').eq('handle', handle).maybeSingle()
  return !!data && data.id !== exceptId
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '')

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (req.method === 'GET') {
    // проверка связи с GigaChat
    try {
      await gcToken()
      return json({ gigachat: 'ok', model: GC_MODEL })
    } catch (e) {
      return json({ gigachat: 'ошибка', detail: e instanceof Error ? e.message : String(e) }, 500)
    }
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, reasons: ['Неверный запрос'] }, 400)
  }

  // проверка имени и ника перед регистрацией (входа ещё нет)
  if (body.action === 'check-profile') {
    const name = str(body.name, 50)
    const handle = str(body.handle, 30).toLowerCase()
    const bad = profileErrors(name, handle)
    if (bad.length) return json({ ok: false, reasons: bad })
    if (await handleTaken(handle)) return json({ ok: false, reasons: ['Такой ник уже занят — придумайте другой'] })
    const m = await moderate([name, handle], [])
    return json(m.ok ? { ok: true } : { ok: false, reasons: m.reasons })
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await admin.auth.getUser(jwt)
  const uid = auth?.user?.id
  if (!uid) return json({ ok: false, reasons: ['Нужно войти'] }, 401)

  switch (body.action) {
    case 'post': {
      const title = str(body.title, 80)
      const topic = str(body.topic, 40)
      const images = (Array.isArray(body.images) ? body.images : []) as ImgIn[]
      const type = body.type === 'beforeafter' && images.length === 2 ? 'beforeafter' : 'photo'
      if (!title || !topic) return json({ ok: false, reasons: ['Нужны название и категория'] }, 400)
      if (images.length < 1 || images.length > 10 || !images.every((i) => ownImage(i, uid)))
        return json({ ok: false, reasons: ['Нужно от 1 до 10 своих картинок'] }, 400)
      const m = await moderate([title, topic], images)
      if (!m.ok) {
        await removeImages(images)
        return json({ ok: false, reasons: m.reasons })
      }
      const { data, error } = await admin
        .from('posts')
        .insert({
          author_id: uid,
          type,
          topic,
          title,
          images: images.map((i) => ({ src: i.src, ratio: Number(i.ratio) })),
          ai_tags: m.tags,
          ai_text: m.aiText || null,
          checked_by_ai: m.ai,
        })
        .select()
        .single()
      if (error) return json({ ok: false, reasons: ['Не получилось сохранить'], detail: error.message }, 500)
      return json({ ok: true, row: data })
    }

    case 'try': {
      const postId = str(body.postId, 64)
      const text = str(body.text, 500)
      const img = body.img as ImgIn | undefined
      if (img && !ownImage(img, uid)) return json({ ok: false, reasons: ['Неверная картинка'] }, 400)
      const { data: post } = await admin.from('posts').select('author_id').eq('id', postId).maybeSingle()
      if (!post) return json({ ok: false, reasons: ['Пост не найден'] }, 404)
      if (post.author_id === uid) return json({ ok: false, reasons: ['Это ваша идея — отзывы оставляют те, кто её повторил'] })
      const m = await moderate([text], img ? [img] : [])
      if (!m.ok) {
        if (img) await removeImages([img])
        return json({ ok: false, reasons: m.reasons })
      }
      const { data, error } = await admin
        .from('tries')
        .insert({ post_id: postId, user_id: uid, ok: body.ok === true, text: text || null, img: img ? { src: img.src, ratio: Number(img.ratio) } : null })
        .select()
        .single()
      if (error) return json({ ok: false, reasons: ['Не получилось сохранить'], detail: error.message }, 500)
      return json({ ok: true, row: data })
    }

    case 'reply': {
      const tryId = str(body.tryId, 64)
      const text = str(body.text, 500)
      if (!text) return json({ ok: false, reasons: ['Пустой ответ'] }, 400)
      const m = await moderate([text], [])
      if (!m.ok) return json({ ok: false, reasons: m.reasons })
      const { data, error } = await admin.from('try_replies').insert({ try_id: tryId, user_id: uid, text }).select().single()
      if (error) return json({ ok: false, reasons: ['Не получилось сохранить'], detail: error.message }, 500)
      return json({ ok: true, row: data })
    }

    case 'profile': {
      const name = str(body.name, 50)
      const handle = str(body.handle, 30).toLowerCase()
      const bio = str(body.bio, 200)
      // avatar: не передан — без изменений, null — убрать, { src, ratio } — новое фото (из своей папки)
      const avatar = body.avatar as ImgIn | null | undefined
      const bad = profileErrors(name, handle)
      if (bad.length) return json({ ok: false, reasons: bad })
      if (avatar && !ownImage(avatar, uid)) return json({ ok: false, reasons: ['Неверная картинка'] }, 400)
      if (await handleTaken(handle, uid)) {
        if (avatar) await removeImages([avatar])
        return json({ ok: false, reasons: ['Такой ник уже занят — придумайте другой'] })
      }
      const m = await moderate([name, handle, bio], avatar ? [avatar] : [], true)
      if (!m.ok) {
        if (avatar) await removeImages([avatar])
        return json({ ok: false, reasons: m.reasons })
      }
      const { data: before } = await admin.from('profiles').select('avatar_url').eq('id', uid).single()
      const patch: Record<string, unknown> = { name, handle, bio }
      if (avatar !== undefined) patch.avatar_url = avatar ? avatar.src : null
      const { data, error } = await admin.from('profiles').update(patch).eq('id', uid).select().single()
      if (error) return json({ ok: false, reasons: [error.code === '23505' ? 'Такой ник уже занят — придумайте другой' : 'Не получилось сохранить'] }, error.code === '23505' ? 200 : 500)
      // старое фото больше не нужно
      const old = before?.avatar_url as string | null
      if (avatar !== undefined && old && old !== data.avatar_url && old.startsWith(`${PUBLIC_PREFIX}${uid}/`)) await removeImages([{ src: old, ratio: 1 }])
      return json({ ok: true, row: data })
    }
  }
  return json({ ok: false, reasons: ['Неизвестное действие'] }, 400)
}

if (!Deno.env.get('KLUBOK_TEST')) Deno.serve(handle)
