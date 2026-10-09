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
const GC_MODELS = ['GigaChat-2', 'GigaChat-2-Pro', 'GigaChat-2-Max', 'GigaChat-Max', 'GigaChat-Pro']
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
  // телефон: +7 / 8 и 10 цифр группами (999) 123-45-67, или 10–12 цифр подряд.
  // Просто числа через пробел (номера шагов, граммовки) — не телефон.
  /(?:\+7|(?<!\d)8)[\s-]*\(?\d{3}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/,
  /\+\d{1,3}[\s-]*\(?\d{2,4}\)?(?:[\s-]*\d{2,4}){2,4}(?!\d)/,
  /(?<!\d)\d{10,12}(?!\d)/,
  // почта: name@site, name собака site
  /[a-z0-9._-]+\s*(?:@|\(at\)|\[at\]|\sсобака\s)\s*[a-z0-9-]+\s*(?:\.|\sточка\s)\s*[a-z]{2,}/i,
]

/** Текст, прочитанный ИИ с картинки: только явные ссылки и мат (числа, граммовки, «ст. л.» — не нарушение) */
const STRICT_LINKS = [/https?\s*:|www\s*\.|:\s*\/\//i, /\b[a-z0-9-]{2,}\.(?:ru|рф|su|com|net|org|info|io|me|online|site|store|shop|pro|club|xyz|ly|app|dev|link|top|by|kz|ua)\b/i, /\bt\.me\b|\bwa\.me\b|\bvk\.com\b/i]
export function imageTextCheck(text: string): string[] {
  const reasons: string[] = []
  if (!text.trim()) return reasons
  if (STRICT_LINKS.some((r) => r.test(text))) reasons.push('На картинке есть ссылка или адрес сайта')
  if (MAT.test(normalize(text))) reasons.push('На картинке есть нецензурная брань')
  return reasons
}

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

/**
 * Запрос в ГигаЧат с повтором, если он занят (429): у личного тарифа один поток, и подробный разбор прошлой идеи
 * в фоне может ещё идти. Ждём до ~60 с.
 */
async function gcFetchWait(url: string, init: RequestInit = {}) {
  const until = Date.now() + 60_000
  for (;;) {
    const res = await gcFetch(url, init)
    if (res.status !== 429 || Date.now() > until) return res
    await res.body?.cancel()
    await new Promise((ok) => setTimeout(ok, 1500))
  }
}

let token: { value: string; exp: number } | undefined
/**
 * Пропуск в ГигаЧат (действует ~30 минут). Supabase часто запускает для запроса новую копию функции,
 * и пропуск в памяти ей не достаётся, — поэтому он хранится ещё и в базе (ai_tokens): взять оттуда — ~0,05 с, войти заново — ~0,9 с.
 */
async function gcToken() {
  if (token && token.exp - 60_000 > Date.now()) return token.value
  const { data: saved } = await admin.from('ai_tokens').select('value, exp').eq('id', 'gigachat').maybeSingle()
  if (saved && Number(saved.exp) - 60_000 > Date.now()) {
    token = { value: saved.value, exp: Number(saved.exp) }
    return token.value
  }
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
  await admin.from('ai_tokens').upsert({ id: 'gigachat', value: token.value, exp: token.exp })
  return token.value
}

/**
 * Что изображено — разложено по полочкам (одинаково для рецептов, лайфхаков, интерьеров, рукоделия, сада…).
 * На этом строятся поиск и будущие рекомендации.
 */
export interface Meta {
  /** идея одной фразой: «креветки в сливочном соусе», «органайзер для проводов из прищепок» */
  idea: string
  /** вид: рецепт, лайфхак, интерьер, рукоделие… (см. KINDS) */
  kind: string
  /** главное, без чего идеи нет: креветки, сливки; пряжа, спицы; полка, доска */
  main: string[]
  /** способы и действия: жарка на сковороде, вязание спицами, покраска */
  techniques: string[]
  /** нужные инструменты и техника: сковорода, духовка, дрель */
  tools: string[]
  /** повод, время, место: ужин, на скорую руку, праздничный стол, дача, маленькая квартира, лето */
  occasion: string[]
  /** характер и стиль: сливочное, острое, постное; скандинавский, минимализм */
  style: string[]
  /** общие темы для рекомендаций: морепродукты, блюда на сковороде, хранение на кухне */
  related: string[]
  difficulty: '' | 'легко' | 'средне' | 'сложно'
  time: '' | 'быстро' | 'около часа' | 'долго'
  /** подходящие категории сайта (id из TOPICS), до 5 — сайт ставит их автору в форме, автор может поправить */
  topics: string[]
  /** название для идеи, как заголовок поста — сайт подставляет его автору в форме, автор может переписать */
  title: string
}
/** Категории сайта — как TOPICS в src/data/types.ts (менять вместе) */
const TOPICS: [string, string][] = [
  ['recipes', 'Рецепты'], ['baking', 'Выпечка'], ['desserts', 'Десерты'], ['breakfast', 'Завтраки'], ['drinks', 'Напитки'],
  ['preserves', 'Заготовки'], ['grill', 'Мангал и костёр'], ['hacks', 'Лайфхаки'], ['cleaning', 'Уборка'], ['storage', 'Хранение'],
  ['home', 'Дом и уют'], ['interior', 'Интерьер'], ['repair', 'Ремонт'], ['diy', 'Своими руками'], ['crafts', 'Рукоделие'],
  ['knitting', 'Вязание'], ['sewing', 'Шитьё'], ['decor', 'Декор'], ['holidays', 'Праздники'], ['gifts', 'Подарки'],
  ['garden', 'Сад и огород'], ['plants', 'Комнатные растения'], ['kids', 'Для детей'], ['pets', 'Питомцы'],
]
/** ИИ мог написать id или название — приводим к id; чужие слова отбрасываем */
function topicIds(v: unknown): string[] {
  const out = (Array.isArray(v) ? v : [])
    .map((t) => norm(t))
    .map((t) => TOPICS.find(([id, label]) => id === t || norm(label) === t)?.[0])
    .filter((t): t is string => !!t)
  return [...new Set(out)].slice(0, 5)
}
const LISTS = ['main', 'techniques', 'tools', 'occasion', 'style', 'related'] as const
const KINDS = [
  'рецепт', 'выпечка', 'десерт', 'напиток', 'заготовки', 'лайфхак', 'уборка', 'хранение', 'интерьер', 'ремонт',
  'своими руками', 'рукоделие', 'вязание', 'шитьё', 'декор', 'праздник', 'подарок', 'сад и огород', 'комнатные растения',
  'для детей', 'питомцы', 'другое',
]
/** Есть почти везде — для поиска и рекомендаций бесполезно */
const STOP = new Set([
  'соль', 'перец', 'черный перец', 'чёрный перец', 'соль и перец', 'вода', 'сахар', 'масло', 'растительное масло', 'подсолнечное масло',
  'мука', 'специи', 'приправы', 'приправа', 'зелень', 'посуда', 'тарелка', 'миска', 'ложка', 'вилка', 'нож', 'руки', 'рука', 'стол',
  'картинка', 'изображение', 'фото', 'фотография', 'текст', 'инструкция', 'пошаговая инструкция', 'схема', 'инфографика', 'идея',
  'еда', 'блюдо', 'продукты', 'ингредиенты', 'рецепт приготовления', 'по вкусу',
])
const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
const list = (v: unknown, max: number) =>
  [...new Set((Array.isArray(v) ? v : []).map(norm).filter((t) => t && t.length <= 60 && !STOP.has(t)))].slice(0, max)

export function parseMeta(v: Record<string, unknown>): Meta {
  const kind = norm(v.kind)
  const difficulty = norm(v.difficulty)
  const time = norm(v.time)
  return {
    idea: norm(v.idea).slice(0, 80),
    kind: KINDS.find((k) => norm(k) === kind) ?? (kind ? 'другое' : ''),
    main: list(v.main, 6),
    techniques: list(v.techniques, 4),
    tools: list(v.tools, 4),
    occasion: list(v.occasion, 4),
    style: list(v.style, 3),
    related: list(v.related, 6),
    difficulty: (['легко', 'средне', 'сложно'] as const).find((x) => x === difficulty) ?? '',
    time: (['быстро', 'около часа', 'долго'] as const).find((x) => time.startsWith(x)) ?? '',
    topics: topicIds(v.topics),
    title: String(v.title ?? '').replace(/["«»“”]/g, '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '').slice(0, 80),
  }
}
export const emptyMeta = (): Meta => parseMeta({})

/** Несколько картинок одной идеи → одна раскладка: идея и вид — с первой картинки, где они есть, списки — вместе */
export function mergeMeta(metas: Meta[]): Meta {
  const m = emptyMeta()
  for (const x of metas) {
    m.idea ||= x.idea
    m.kind ||= x.kind
    m.difficulty ||= x.difficulty
    m.time ||= x.time
    m.title ||= x.title
    m.topics = [...new Set([...m.topics, ...x.topics])].slice(0, 5)
    for (const k of LISTS) m[k] = [...new Set([...m[k], ...x[k]])]
  }
  for (const k of LISTS) m[k] = m[k].slice(0, k === 'main' || k === 'related' ? 10 : 6)
  return m
}

/** Плоский список для поиска: всё из раскладки, без повторов и «есть везде» */
export function metaTags(m: Meta): string[] {
  return [...new Set([m.idea, m.kind, ...LISTS.flatMap((k) => m[k])].filter((t) => t && !STOP.has(t)))].slice(0, 40)
}

interface Verdict {
  ok: boolean
  reasons: string[]
  meta: Meta
  text: string
  description: string
  /** только в подробном разборе: фильтр ГигаЧата отказался переписывать текст с картинки */
  textBlocked?: boolean
}

/** Ответ модели → объект; если модель отказалась отвечать (фильтр GigaChat) — это нарушение */
/** Доделать после ответа (на сервере Supabase — EdgeRuntime.waitUntil); где этого нет (тесты) — просто дождаться */
function later(p: PromiseLike<unknown>): Promise<unknown> | undefined {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime
  if (!rt?.waitUntil) return Promise.resolve(p)
  rt.waitUntil(Promise.resolve(p))
}

/** Замеры проверки, мс (и сколько слов-«токенов» прочитал и написал ИИ): видны на сайте в форме и пишутся в image_checks.timing */
export type Timing = Record<string, number>
const ms = (t: number) => Math.round(performance.now() - t)
let cold = true

const PEOPLE_REASON = 'На картинках не должно быть людей (руки в кадре можно)'
/**
 * Причину от ИИ показываем человеку — без служебных слов: бывает, ИИ пишет «Нарушение правил: people = true».
 * Про людей — наша понятная фраза; прочие служебные — убираем (останется общая «нарушает правила»).
 */
function humanReason(r: string): string {
  r = r.trim()
  if (/\b(people|ok|true|false|reasons|json)\b/i.test(r)) return /people/i.test(r) ? PEOPLE_REASON : ''
  // ИИ, отказывая, иногда переписывает строку из списка правил («мат и грубая брань…»), хотя этого на картинке нет, — без цитаты не верим
  if (isRuleCopy(r)) return ''
  return r.charAt(0).toUpperCase() + r.slice(1)
}
// строки правил (RULES объявлены ниже — считаем при первом обращении)
let ruleLines: string[] | undefined
function isRuleCopy(r: string) {
  if (/[«"„“]/.test(r)) return false
  ruleLines ??= RULES.split('\n')
    .filter((l) => l.startsWith('—'))
    .map((l) => norm(l.slice(1).replace(/\(.*?\)/g, '')))
  const x = norm(r).replace(/[.;:]+$/, '')
  return x.length >= 12 && ruleLines.some((l) => l.startsWith(x.slice(0, 20)) || x.startsWith(l.slice(0, 20)))
}

async function gcAsk(system: string, user: string, attachments: string[] = [], allowPeopleNow = false, tm?: Timing, model = GC_MODEL): Promise<Verdict> {
  const t = performance.now()
  const res = await gcFetchWait(`${GC_API}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await gcToken()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.01,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user, ...(attachments.length ? { attachments } : {}) },
      ],
    }),
  })
  if (!res.ok) throw new Error(`GigaChat: ошибка запроса (${res.status}) ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  if (tm) {
    tm.ai = ms(t)
    tm.tokens_in = Number(data.usage?.prompt_tokens) || 0
    tm.tokens_out = Number(data.usage?.completion_tokens) || 0
  }
  const choice = data.choices?.[0]
  if (choice?.finish_reason === 'blacklist') return { ok: false, reasons: ['Содержимое нарушает правила'], meta: emptyMeta(), text: '', description: '' }
  const content: string = choice?.message?.content ?? ''
  const m = content.match(/\{[\s\S]*\}/)
  if (!m) throw new Error(`GigaChat: непонятный ответ: ${content.slice(0, 200)}`)
  const v = JSON.parse(m[0])
  // есть ли люди — решаем по выбору «кто на картинке» (who), а не по общему «да/нет»: ИИ легко принимает картошку с лицом за человека
  const who = String(v.who ?? '').toLowerCase()
  const people = !allowPeopleNow && (who ? /человек на фото|нарисованный человек/.test(who) : v.people === true)
  const said = (Array.isArray(v.reasons) ? v.reasons.map(String).map(humanReason) : []).filter(Boolean)
  // причины «есть человек» при выборе «персонаж-не-человек»/«только руки» — отбрасываем (только у картинок: в тексте «оскорбление людей» — настоящее нарушение)
  const other = !who ? said : said.filter((r: string) => r !== PEOPLE_REASON && !/(человек|люд[иея]|лицо|лица|person|people)/i.test(r))
  const reasons = [...(people ? [PEOPLE_REASON] : []), ...other].filter((r, i, a) => a.indexOf(r) === i)
  // ИИ сказал «нельзя», но все его причины были про людей, а по выбору «кто на картинке» людей нет, — значит можно
  const overruled = !!who && v.ok === false && said.length > 0 && other.length === 0 && !people
  return {
    ok: reasons.length === 0 && (v.ok !== false || overruled),
    reasons,
    meta: parseMeta(v),
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

/** Пояснение для ИИ при проверке профиля: ник на нашем сайте — не контакт */
const PROFILE_NOTE = `Это имя и ник, которые человек выбирает себе на нашем сайте, и текст «о себе».
Ник на нашем сайте — НЕ контакт и НЕ ник в соцсети: любые сочетания латинских букв, цифр и _ разрешены (marina_cook, test_2024, proxy_zz, klubok_fan).
Отклоняй ник или имя только за мат, оскорбления, запрещённые темы или явную ссылку наружу (домен, t.me, телефон). Странный или бессмысленный ник — не нарушение.`

async function aiCheckText(text: string, note = ''): Promise<Verdict> {
  return gcAsk(
    `Ты — модератор. ${RULES}${note ? `\n${note}` : ''}\nОтветь только JSON без пояснений: {"ok": true или false, "reasons": ["коротко по-русски, что нарушено"]}`,
    `Проверь текст пользователя:\n"""${text}"""`,
  )
}

interface Prepared {
  bytes: ArrayBuffer
  type: string
  auth: string
}
/** Скачать картинку и взять пропуск в ГигаЧат — одновременно (src — только из нашего хранилища) */
function prepareImage(src: string, tm: Timing): Promise<Prepared> {
  const t0 = performance.now()
  return Promise.all([
    fetch(src).then(async (img) => {
      if (!img.ok) throw new Error(`не удалось скачать картинку ${src}`)
      const bytes = await img.arrayBuffer()
      tm.download = ms(t0)
      return { bytes, type: img.headers.get('content-type') ?? 'image/jpeg' }
    }),
    gcToken().then((a) => ((tm.login = ms(t0)), a)),
  ]).then(([{ bytes, type }, auth]) => {
    tm.kb = Math.round(bytes.byteLength / 1024)
    return { bytes, type, auth }
  })
}

/** Служебные действия пускаем, только если прислан действующий ключ доступа Supabase к этому проекту (он есть только в секретах GitHub) */
async function isAdmin(req: Request): Promise<boolean> {
  const ref = new URL(SB_URL).hostname.split('.')[0]
  const check = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions`, {
    headers: { Authorization: `Bearer ${req.headers.get('x-admin-token') ?? ''}` },
  })
  await check.body?.cancel()
  return check.ok
}

/**
 * Весь текст с картинки дословно — отдельной просьбой (по уже загруженной в ГигаЧат картинке); мат и ссылки в нём ищет наш список (imageTextCheck).
 * Опыт 9 октября: на вопрос «есть ли мат?» ГигаЧат отвечает «нет», даже когда видит слово, а переписать — переписывает;
 * а внутри подробного разбора переписывает только крупный текст. Длится ~0,05 с на слово-«токен» (обычно 2–5 с).
 * blocked — фильтр ГигаЧата отказался отвечать (обычно — из-за того, что на картинке). ИИ недоступен — пусто: разбор не срываем.
 */
async function readText(id: string, tm: Timing = {}, model = GC_MODEL): Promise<{ text: string; blocked: boolean }> {
  const st: Timing = {}
  try {
    const v = await gcAsk(
      `Перепиши дословно весь текст с картинки, каждую надпись с новой строки. Ничего не пропускай: мелкие надписи, текст от руки, надписи другим цветом и поверх других элементов. Ничего не исправляй и не смягчай, даже грубые слова.
Ответь только JSON без пояснений: {"text": "весь текст, или пусто"}`,
      'Перепиши текст с картинки.',
      [id],
      true,
      st,
      model,
    )
    return { text: v.text, blocked: !v.ok }
  } catch (e) {
    console.error('текст с картинки не прочитан:', e instanceof Error ? e.message : e)
    return { text: '', blocked: false }
  } finally {
    tm.text_ai = st.ai ?? 0
    tm.text_out = st.tokens_out ?? 0
  }
}

/**
 * Картинка → ГигаЧат. Время ответа почти целиком зависит от того, сколько он пишет (~0,05 с на токен), поэтому два вида:
 * quick — сразу при загрузке: можно ли по правилам, есть ли люди, название и категории (коротко, ~3–4 с);
 * full — после публикации, в фоне: раскладка идеи для поиска и рекомендаций (теги) и отдельной просьбой — весь текст с картинки (readText).
 */
async function aiCheckImage(
  src: string,
  allowPeople = false,
  tm: Timing = {},
  early?: Promise<Prepared>,
  mode: 'quick' | 'full' = 'quick',
): Promise<Verdict> {
  const id = await gcUpload(await (early ?? prepareImage(src, tm)), tm)
  try {
    return mode === 'quick'
      ? await gcAsk(
          `Ты — модератор картинок. ${RULES}
${
            allowPeople
              ? 'Это фото профиля (аватар): люди и лица на нём разрешены, остальные правила действуют. Поле people всегда false.'
              : 'Отдельно определи, кто на картинке, и запиши в поле who ровно одно из: «никого», «только руки», «персонаж-не-человек», «нарисованный человек», «человек на фото». «персонаж-не-человек» — это ожившая еда или предметы с лицами, руками и ногами (например, картофелина в плаще), мультяшные животные, маскоты, игрушки, а также иконки и человечки-значки. «нарисованный человек» — именно человек, нарисованный (мультяшный, аниме, иллюстрация). Про людей и персонажей пиши только в who, не в reasons.'
          }
Внимательно посмотри на весь текст на картинке: ссылка, адрес сайта, @ник, телефон, почта, QR-код, призыв написать или купить — это нарушение (ok = false).
В reasons пиши только то, что действительно есть на ЭТОЙ картинке, и что именно: «ссылка: „vk.com/…"», «мат: „…"», «реклама магазина». Не переписывай список правил.
ok = false ставь только при явном нарушении правил; рецепты, инструкции, инфографика с текстом и цифрами — это нормально.
Ответь коротко, только JSON без пояснений:
{"ok": true или false, "people": true или false, "reasons": ["коротко по-русски, что нарушено"],
 "who": "никого, только руки, персонаж-не-человек, нарисованный человек или человек на фото",
 "title": "название идеи для людей, 2–7 слов, с большой буквы, без кавычек и точки, как заголовок поста: «Сырники без муки», «Органайзер для проводов из прищепок»",
 "topics": ["1–5 подходящих категорий сайта, только из этого списка, пиши id: ${TOPICS.map(([id, label]) => `${id} — ${label}`).join(', ')}"]}`,
          'Проверь картинку по правилам и придумай ей название и категории.',
          [id],
          allowPeople,
          tm,
        )
      : await gcAsk(
          `Ты разбираешь картинку из соцсети идей (рецепты, лайфхаки, дом, сад, рукоделие) для поиска и рекомендаций.
Разложи, что за идея на картинке; одинаково для любых картинок. Слова — по-русски, строчными, в начальной форме.
В main, techniques, tools НЕ пиши то, что есть почти в любой такой идее: соль, перец, вода, сахар, масло, мука, специи, зелень, посуда, руки. Только то, что отличает именно эту идею.
Ответь только JSON без пояснений:
{"description": "одно предложение: что на картинке",
 "idea": "идея одной фразой, 2–6 слов: «креветки в сливочном соусе», «органайзер для проводов из прищепок», «спальня в скандинавском стиле»",
 "kind": "одно из: ${KINDS.join(', ')}",
 "main": ["2–6 главных объектов, без которых идеи нет"],
 "techniques": ["1–4 способа и действия: жарка на сковороде, тушение, вязание спицами, покраска, пересадка"],
 "tools": ["0–4 нужных инструмента и техники: сковорода, духовка, мультиварка, дрель, швейная машина"],
 "occasion": ["0–4 повод, время, место: ужин, завтрак, на скорую руку, праздничный стол, дача, маленькая квартира, лето"],
 "style": ["0–3 характер и стиль: сливочное, острое, постное, вегетарианское, полезное; скандинавский, минимализм, винтаж"],
 "related": ["3–6 общих тем, по которым человеку можно посоветовать похожее: морепродукты, блюда на сковороде, ужин за 30 минут, хранение на кухне"],
 "difficulty": "легко, средне или сложно",
 "time": "быстро, около часа или долго"}`,
          'Разбери картинку.',
          [id],
          true,
          tm,
        ).then(async (v) => {
          const r = await readText(id, tm)
          return { ...v, text: r.text, textBlocked: r.blocked }
        })
  } finally {
    gcDelete(id)
  }
}

/** Картинка → хранилище ГигаЧата (оттуда её прикладывают к вопросу); после вопросов — удалить */
async function gcUpload({ bytes, type, auth }: Prepared, tm: Timing = {}): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), 'image.jpg')
  form.append('purpose', 'general')
  const t = performance.now()
  const up = await gcFetchWait(`${GC_API}/files`, { method: 'POST', headers: { Authorization: `Bearer ${auth}` }, body: form })
  if (!up.ok) throw new Error(`GigaChat: картинка не загрузилась (${up.status}) ${(await up.text()).slice(0, 200)}`)
  tm.upload = ms(t)
  return (await up.json()).id
}
function gcDelete(id: string) {
  gcToken()
    .then((auth) => gcFetch(`${GC_API}/files/${id}/delete`, { method: 'POST', headers: { Authorization: `Bearer ${auth}` } }))
    .catch(() => {})
}

// ─── 3. Публикация ──────────────────────────────────────────

const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } })
const PUBLIC_PREFIX = `${SB_URL}/storage/v1/object/public/images/`

interface ImgIn {
  src: string
  ratio: number
  /** уменьшенная копия для ленты (600 px в ширину), делает сайт при загрузке */
  thumb?: string
}

/** Картинка должна лежать в хранилище сайта, в папке этого пользователя (никаких чужих адресов) */
/** …/storage/v1/object/public/images/… на любом адресе → тот же файл на адресе Supabase */
function canon(img: ImgIn): ImgIn {
  const fix = (u: unknown) => {
    const s = typeof u === 'string' ? u : ''
    const i = s.indexOf('/storage/v1/object/public/images/')
    return i < 0 ? s : SB_URL + s.slice(i)
  }
  if (!img || typeof img !== 'object') return img
  return { ...img, src: fix(img.src) || img.src, ...(img.thumb ? { thumb: fix(img.thumb) } : {}) }
}

function ownImage(img: ImgIn | undefined, uid: string): img is ImgIn {
  return !!img && typeof img.src === 'string' && img.src.startsWith(`${PUBLIC_PREFIX}${uid}/`) && Number(img.ratio) > 0 && Number(img.ratio) < 10
}

async function removeImages(imgs: ImgIn[]) {
  const paths = imgs.map((i) => i.src.slice(PUBLIC_PREFIX.length))
  if (paths.length) await admin.storage.from('images').remove(paths)
}

interface ImageCheck {
  /** результат взят из прошлой проверки (ИИ не спрашивали) */
  cached?: boolean
  ok: boolean
  reasons: string[]
  meta: Meta
  aiText: string
  ai: boolean
}

/**
 * Проверка одной картинки: ИИ (правила, «нет людей», текст на ней) + явные ссылки и мат в этом тексте.
 * Результат запоминается в image_checks: картинку проверяют сразу после загрузки, и при публикации ждать не нужно.
 */
async function checkImage(img: ImgIn, uid: string, allowPeople: boolean, tm: Timing = {}, early?: Promise<Prepared>): Promise<ImageCheck> {
  const path = img.src.slice(PUBLIC_PREFIX.length)
  let t = performance.now()
  const { data: saved } = await admin.from('image_checks').select('*').eq('path', path).maybeSingle()
  tm.lookup = ms(t)
  // проверка «без людей» годится и для аватара; проверка аватара для поста — нет
  // старые проверки без раскладки (meta) — проверяем заново
  if (saved && saved.user_id === uid && saved.by_ai && saved.meta && (saved.strict || allowPeople))
    return { ok: saved.ok, reasons: saved.reasons ?? [], meta: parseMeta(saved.meta), aiText: saved.ai_text ?? '', ai: true, cached: true }
  let res: ImageCheck
  try {
    const v = await aiCheckImage(img.src, allowPeople, tm, early)
    const reasons = [...(v.ok ? [] : v.reasons.length ? v.reasons : ['Картинка нарушает правила']), ...imageTextCheck(v.text)]
    res = {
      ok: reasons.length === 0,
      reasons: [...new Set(reasons)],
      meta: v.meta,
      aiText: [v.description, v.text].filter(Boolean).join('. '),
      ai: true,
    }
  } catch (e) {
    console.error('ИИ недоступен:', e instanceof Error ? e.message : e)
    return { ok: true, reasons: [], meta: emptyMeta(), aiText: '', ai: false }
  }
  t = performance.now()
  // сохраняем уже после ответа сайту — человеку ждать незачем
  await later(admin.from('image_checks').upsert({
    timing: tm,
    path,
    user_id: uid,
    strict: !allowPeople,
    ok: res.ok,
    reasons: res.reasons,
    tags: metaTags(res.meta),
    meta: res.meta,
    ai_text: res.aiText || null,
    by_ai: true,
  }).then(() => {
    tm.save = ms(t)
  }))
  return res
}

/**
 * Подробный разбор картинок идеи — уже после публикации, в фоне: весь текст с картинок и раскладка для поиска и рекомендаций.
 * Строгая проверка текста с картинки (ссылки, мат): нашлось — идея скрывается для всех, автор видит причину.
 * Картинки — по одной (у ИИ один поток); функция живёт ограниченное время, поэтому не дольше ~100 с.
 */
/** force — разобрать заново, даже если картинку уже разбирали (перепроверка старых идей); timings — сюда складываются замеры по картинкам */
async function describePost(postId: string, uid: string, images: ImgIn[], quick: Meta, words: string[] = [], force = false, timings?: Timing[]) {
  const start = performance.now()
  const metas: Meta[] = []
  const texts: string[] = []
  const bad: string[] = []
  // уменьшенные копии первых двух картинок (их видно в ленте) делает сайт — проверяем и их, чтобы в ленту не подсунули другое
  for (const [i, img] of images.slice(0, 2).entries()) {
    if (!img.thumb) continue
    const c = await checkImage({ src: img.thumb, ratio: img.ratio }, uid, false)
    if (!c.ok) bad.push(...c.reasons.map((r) => `Картинка ${i + 1} в ленте: ${r}`))
  }
  if (bad.length) await admin.from('posts').update({ hidden: true, hidden_reason: bad.join('. ') }).eq('id', postId)
  // название и категории — ИИ проверяет уже после публикации; нарушение — скрываем сразу, не дожидаясь разбора картинок
  if (words.length) {
    const t = await checkTexts(words)
    if (!t.ok) {
      bad.push(...t.reasons.map((r) => `Название или категории: ${r}`))
      await admin.from('posts').update({ hidden: true, hidden_reason: bad.join('. ') }).eq('id', postId)
    }
  }
  for (const [i, img] of images.entries()) {
    if (performance.now() - start > 100_000) break
    const path = img.src.slice(PUBLIC_PREFIX.length)
    const { data: saved } = await admin.from('image_checks').select('meta, ai_text').eq('path', path).maybeSingle()
    // эту картинку уже разбирали подробно (публиковали раньше) — берём готовое
    if (saved?.meta?.idea && !force) {
      metas.push(parseMeta(saved.meta))
      if (saved.ai_text) texts.push(saved.ai_text)
      continue
    }
    try {
      const tm: Timing = {}
      timings?.push(tm)
      const v = await aiCheckImage(img.src, true, tm, undefined, 'full')
      const meta: Meta = { ...v.meta, title: saved?.meta?.title ?? '', topics: topicIds(saved?.meta?.topics) }
      const text = [v.description, v.text].filter(Boolean).join('. ')
      const found = [...imageTextCheck(v.text), ...(v.textBlocked ? ['Текст на картинке нарушает правила'] : [])]
      // плохая картинка отмечается и в проверках — с ней больше не опубликуют
      await admin
        .from('image_checks')
        .update({ meta, ai_text: text || null, tags: metaTags(meta), ...(found.length ? { ok: false, reasons: found } : {}) })
        .eq('path', path)
      metas.push(meta)
      if (text) texts.push(text)
      bad.push(...found.map((r) => (images.length > 1 ? `Картинка ${i + 1}: ${r}` : r)))
    } catch (e) {
      console.error('подробный разбор не удался:', e instanceof Error ? e.message : e)
    }
  }
  if (!metas.length) return
  const meta = mergeMeta([quick, ...metas])
  await admin
    .from('posts')
    .update({
      ai_meta: meta,
      ai_tags: metaTags(meta),
      ai_text: texts.join('\n') || null,
      ...(bad.length ? { hidden: true, hidden_reason: [...new Set(bad)].join('. ') } : {}),
    })
    .eq('id', postId)
}

/** Только быстрые правила (ссылки, мат) — без ИИ */
function quickOnly(texts: string[]) {
  const reasons = quickTextCheck(texts.filter(Boolean).join('\n'))
  return reasons.length ? { ok: false, reasons, ai: false } : {}
}

/** Проверка текстов: быстрые правила, затем ИИ. ИИ недоступен — только быстрые правила */
/** profile — тексты профиля [имя, ник, о себе]: ИИ получает их с подписями и пояснением про ник */
async function checkTexts(texts: string[], profile = false): Promise<{ ok: boolean; reasons: string[]; ai: boolean }> {
  const text = texts.filter(Boolean).join('\n')
  const reasons = quickTextCheck(text)
  if (reasons.length) return { ok: false, reasons, ai: false }
  if (!text.trim()) return { ok: true, reasons: [], ai: true }
  try {
    const v = profile
      ? await aiCheckText(
          ['Имя', 'Ник', 'О себе'].map((l, i) => texts[i] && `${l}: ${texts[i]}`).filter(Boolean).join('\n'),
          PROFILE_NOTE,
        )
      : await aiCheckText(text)
    return { ok: v.ok, reasons: v.ok ? [] : v.reasons.length ? v.reasons : ['Текст нарушает правила'], ai: true }
  } catch (e) {
    console.error('ИИ недоступен:', e instanceof Error ? e.message : e)
    return { ok: true, reasons: [], ai: false }
  }
}

/** Тексты + картинки. Картинки по очереди: у личного тарифа GigaChat один поток */
export async function moderate(
  texts: string[],
  images: ImgIn[],
  uid: string,
  allowPeople = false,
  profile = false,
  tm: Timing = {},
  /** false — текст только по быстрым правилам (ссылки, мат), а ИИ проверит его уже после публикации */
  textAi = true,
) {
  let t0 = performance.now()
  const t = textAi ? await checkTexts(texts, profile) : { ok: true, reasons: [] as string[], ai: true, ...quickOnly(texts) }
  tm.texts = ms(t0)
  t0 = performance.now()
  if (!t.ok) return { ok: false, reasons: t.reasons, ai: t.ai, tags: [] as string[], meta: emptyMeta(), aiText: '' }
  const checks: ImageCheck[] = []
  for (const img of images) checks.push(await checkImage(img, uid, allowPeople))
  tm.images = ms(t0)
  const reasons = checks.flatMap((c, i) => (c.ok ? [] : c.reasons.map((r) => (images.length > 1 ? `Картинка ${i + 1}: ${r}` : r))))
  return {
    ok: reasons.length === 0,
    reasons,
    ai: t.ai && checks.every((c) => c.ai),
    ...(() => {
      const meta = mergeMeta(checks.map((c) => c.meta))
      return { meta, tags: metaTags(meta) }
    })(),
    aiText: checks.map((c) => c.aiText).filter(Boolean).join('\n'),
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

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  // замеры (ТЕСТ): запуск копии функции и проверка, кто вошёл, — до самой работы
  const boot = cold ? Math.round(performance.now()) : 0

  if (req.method === 'GET') {
    // проверка связи с GigaChat
    try {
      const auth = await gcToken()
      // какие модели доступны по нашему ключу (только названия)
      const res = await gcFetch(`${GC_API}/models`, { headers: { Authorization: `Bearer ${auth}`, Accept: 'application/json' } })
      const models = res.ok ? ((await res.json()).data ?? []).map((m: { id: string }) => m.id) : []
      return json({ gigachat: 'ok', model: GC_MODEL, models })
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

  // служебное: уменьшенная копия для старой картинки (делает GitHub — .github/scripts/thumbs.py).
  // Пускаем только с ключом доступа Supabase (isAdmin).
  if (body.action === 'admin-thumb') {
    if (!(await isAdmin(req))) return json({ ok: false, reasons: ['Нет доступа'] }, 403)
    const src = canon({ src: String(body.src ?? ''), ratio: 1 }).src
    if (!src.startsWith(PUBLIC_PREFIX) || !src.endsWith('.jpg') || src.endsWith('_s.jpg') || typeof body.thumb !== 'string')
      return json({ ok: false, reasons: ['Неверная картинка'] }, 400)
    const bytes = Uint8Array.from(atob(body.thumb), (c) => c.charCodeAt(0))
    if (bytes.length > 400_000) return json({ ok: false, reasons: ['Слишком большая копия'] }, 400)
    const path = src.slice(PUBLIC_PREFIX.length).replace(/\.jpg$/, '_s.jpg')
    const { error } = await admin.storage
      .from('images')
      .upload(path, bytes, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true })
    if (error) return json({ ok: false, reasons: [error.message] }, 500)
    const thumb = PUBLIC_PREFIX + path
    // прописываем копию во все идеи с этой картинкой
    // jsonb-массив ищем строкой JSON (.contains с массивом объектов формирует запрос для обычных массивов и не находит)
    const { data: posts, error: findError } = await admin.from('posts').select('id, images').filter('images', 'cs', JSON.stringify([{ src }]))
    if (findError) return json({ ok: false, reasons: [findError.message] }, 500)
    for (const p of posts ?? []) {
      const images = (p.images as ImgIn[]).map((i) => (i.src === src ? { ...i, thumb } : i))
      await admin.from('posts').update({ images }).eq('id', p.id)
    }
    return json({ ok: true, posts: posts?.length ?? 0 })
  }

  // служебное: заново разобрать идею после публикации (когда проверку улучшили) — .github/scripts/recheck.mjs. Отвечает только числами.
  if (body.action === 'admin-recheck') {
    if (!(await isAdmin(req))) return json({ ok: false, reasons: ['Нет доступа'] }, 403)
    const { data: p } = await admin.from('posts').select('id, author_id, images, ai_meta, hidden').eq('id', String(body.post ?? '')).maybeSingle()
    if (!p) return json({ ok: false, reasons: ['Нет такой идеи'] }, 404)
    const t = performance.now()
    const timings: Timing[] = []
    await describePost(p.id, p.author_id, p.images as ImgIn[], parseMeta(p.ai_meta ?? {}), [], true, timings)
    const { data: after } = await admin.from('posts').select('hidden').eq('id', p.id).single()
    return json({ ok: true, was_hidden: p.hidden, hidden: after?.hidden, total: ms(t), images: timings })
  }

  // служебное: опыт — задать ГигаЧату вопрос по присланной картинке (.github/scripts/ocr_probe.py). Текст с картинки — только для опыта.
  if (body.action === 'admin-ask') {
    if (!(await isAdmin(req))) return json({ ok: false, reasons: ['Нет доступа'] }, 403)
    const bytes = Uint8Array.from(atob(String(body.image ?? '')), (c) => c.charCodeAt(0))
    if (!bytes.length || bytes.length > 600_000) return json({ ok: false, reasons: ['Неверная картинка'] }, 400)
    const model = GC_MODELS.includes(String(body.model)) ? String(body.model) : GC_MODEL
    const id = await gcUpload({ bytes: bytes.buffer, type: 'image/jpeg', auth: await gcToken() })
    try {
      const v = await readText(id, {}, model)
      return json({ ok: true, text: v.text, mat: imageTextCheck(v.text).length > 0, blocked: v.blocked })
    } finally {
      gcDelete(id)
    }
  }

  // разогрев: сайт зовёт, когда открывают «Новая идею», — функция запускается и заранее входит в ГигаЧат,
  // чтобы первая проверка картинки не ждала запуска и входа. Вход запоминается на ~30 минут, так что лишних входов нет.
  if (body.action === 'warm') {
    const t = performance.now()
    const wasCold = cold
    cold = false
    try {
      await gcToken()
    } catch {
      /* ИИ недоступен — проверка потом сама скажет */
    }
    // boot — сколько копия функции запускалась до этого запроса (мс от старта процесса)
    return json({ ok: true, cold: wasCold, boot: wasCold ? Math.round(t) : 0, ms: ms(t) })
  }

  // проверка имени и ника перед регистрацией (входа ещё нет)
  if (body.action === 'check-profile') {
    const name = str(body.name, 50)
    const handle = str(body.handle, 30).toLowerCase()
    const bad = profileErrors(name, handle)
    if (bad.length) return json({ ok: false, reasons: bad })
    if (await handleTaken(handle)) return json({ ok: false, reasons: ['Такой ник уже занят — придумайте другой'] })
    const m = await checkTexts([name, handle], true)
    return json(m.ok ? { ok: true } : { ok: false, reasons: m.reasons })
  }

  // проверка картинки: пока выясняем, кто вошёл, уже скачиваем картинку и берём пропуск в ГигаЧат.
  // Скачиваем только из нашего хранилища; наружу (в ГигаЧат) ничего не уходит, пока вход не проверен.
  const earlyTm: Timing = {}
  let early: Promise<Prepared> | undefined
  if (body.action === 'check-image' && body.img && typeof body.img === 'object') {
    const src = canon(body.img as ImgIn).src
    if (typeof src === 'string' && src.startsWith(PUBLIC_PREFIX)) {
      early = prepareImage(src, earlyTm)
      early.catch(() => {})
    }
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const tAuth = performance.now()
  const { data: auth } = await admin.auth.getUser(jwt)
  const authMs = ms(tAuth)
  const uid = auth?.user?.id
  if (!uid) return json({ ok: false, reasons: ['Нужно войти'] }, 401)

  // адреса картинок могут прийти через проброс (российский сервер) — приводим к адресу Supabase
  for (const k of ['img', 'avatar'] as const) if (body[k] && typeof body[k] === 'object') body[k] = canon(body[k] as ImgIn)
  if (Array.isArray(body.images)) body.images = (body.images as ImgIn[]).map(canon)

  switch (body.action) {
    // проверка картинки сразу после загрузки (в фоне, пока человек заполняет остальное)
    case 'check-image': {
      const img = body.img as ImgIn | undefined
      if (!ownImage(img, uid)) return json({ ok: false, reasons: ['Неверная картинка'] }, 400)
      const tm: Timing = earlyTm
      // первый запрос после простоя: функция только что запустилась («холодный старт»)
      if (cold) {
        tm.cold = 1
        tm.boot = boot
      }
      tm.auth = authMs
      cold = false
      const t = performance.now()
      // картинка из запроса совпадает с той, что начали готовить, — берём готовое
      const c = await checkImage(img, uid, body.purpose === 'avatar', tm, early)
      tm.total = ms(t)
      if (c.cached) tm.cached = 1
      // topics и title — категории и название, которые ИИ предлагает по этой картинке (форма ставит их сама); timing — замеры (ТЕСТ)
      return json(
        c.ok
          ? { ok: true, ai: c.ai, topics: c.meta.topics, title: c.meta.title, timing: tm }
          : { ok: false, reasons: c.reasons, timing: tm },
      )
    }

    case 'post': {
      const title = str(body.title, 80)
      // категории: от 1 до 5 (старый сайт присылает одну — topic)
      const topics = [
        ...new Set((Array.isArray(body.topics) ? body.topics : [body.topic]).map((t) => str(t, 40)).filter(Boolean)),
      ].slice(0, 5)
      const images = (Array.isArray(body.images) ? body.images : []) as ImgIn[]
      // «до и после»: 1-я — до, 2-я — после, и хотя бы ещё одна картинка (как сделали)
      const type = body.type === 'beforeafter' && images.length >= 3 ? 'beforeafter' : 'photo'
      if (!title || !topics.length) return json({ ok: false, reasons: ['Нужны название и категория'] }, 400)
      if (images.length < 1 || images.length > 10 || !images.every((i) => ownImage(i, uid)))
        return json({ ok: false, reasons: ['Нужно от 1 до 10 своих картинок'] }, 400)
      // замеры публикации (ТЕСТ) — пишутся в posts.publish_timing
      const ptm: Timing = { auth: authMs }
      const pt0 = performance.now()
      // текст здесь — только быстрые правила; ИИ проверит название и категории уже после публикации (describePost)
      const m = await moderate([title, ...topics], images, uid, false, false, ptm, false)
      // картинки не удаляем: человек исправит название или уберёт плохую картинку и опубликует снова
      if (!m.ok) return json({ ok: false, reasons: m.reasons })
      const { data, error } = await admin
        .from('posts')
        .insert({
          author_id: uid,
          type,
          topic: topics[0],
          topics,
          title,
          // уменьшенную копию берём, только если она тоже из папки автора
          images: images.map((i) => ({
            src: i.src,
            ratio: Number(i.ratio),
            ...(typeof i.thumb === 'string' && i.thumb.startsWith(`${PUBLIC_PREFIX}${uid}/`) ? { thumb: i.thumb } : {}),
          })),
          ai_tags: m.tags,
          ai_meta: m.meta,
          ai_text: m.aiText || null,
          checked_by_ai: m.ai,
          publish_timing: { ...ptm, before_insert: ms(pt0) },
        })
        .select()
        .single()
      if (error) return json({ ok: false, reasons: ['Не получилось сохранить'], detail: error.message }, 500)
      // подробный разбор картинок — уже после ответа, человеку ждать незачем
      later(describePost(data.id, uid, data.images as ImgIn[], m.meta, [title, ...topics.filter((t) => !TOPICS.some(([id]) => id === t))]))
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
      const m = await moderate([text], img ? [img] : [], uid)
      if (!m.ok) return json({ ok: false, reasons: m.reasons })
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
      const m = await moderate([text], [], uid)
      if (!m.ok) return json({ ok: false, reasons: m.reasons })
      const { data, error } = await admin.from('try_replies').insert({ try_id: tryId, user_id: uid, text }).select().single()
      if (error) return json({ ok: false, reasons: ['Не получилось сохранить'], detail: error.message }, 500)
      return json({ ok: true, row: data })
    }

    // удалить свою идею: пост, отзывы и ответы к нему (каскадом в базе) и все картинки — свои и фото из отзывов
    case 'delete-post': {
      const id = str(body.postId, 40)
      const { data: post } = await admin.from('posts').select('author_id, images').eq('id', id).maybeSingle()
      if (!post) return json({ ok: true })
      if (post.author_id !== uid) return json({ ok: false, reasons: ['Удалить можно только свою идею'] }, 403)
      const { data: tries } = await admin.from('tries').select('img').eq('post_id', id)
      const own = ((post.images as ImgIn[]) ?? []).flatMap((i) => [i, ...(i.thumb ? [{ src: i.thumb, ratio: i.ratio }] : [])])
      const imgs = [...own, ...(tries ?? []).map((t) => t.img as ImgIn | null)].filter(
        (i): i is ImgIn => typeof i?.src === 'string' && i.src.startsWith(PUBLIC_PREFIX) && !i.src.startsWith(`${PUBLIC_PREFIX}demo/`),
      )
      const { error } = await admin.from('posts').delete().eq('id', id)
      if (error) return json({ ok: false, reasons: ['Не получилось удалить'], detail: error.message }, 500)
      await removeImages(imgs)
      if (imgs.length) await admin.from('image_checks').delete().in('path', imgs.map((i) => i.src.slice(PUBLIC_PREFIX.length)))
      return json({ ok: true, row: null })
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
      const m = await moderate([name, handle, bio], avatar ? [avatar] : [], uid, true, true)
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
