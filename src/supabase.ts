import { createClient } from '@supabase/supabase-js'

/** Адрес проекта Supabase (так хранятся адреса картинок в базе) */
const DIRECT: string = import.meta.env.VITE_SUPABASE_URL
/**
 * Через что сайт ходит к базе: проброс через российский сервер (VITE_API_URL), если задан, иначе напрямую.
 * Напрямую из России всё грузится по 10+ секунд — провайдеры душат Cloudflare, через который работает Supabase.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL || DIRECT).replace(/\/+$/, '')

/** Подключение к тестовой базе. Адреса и открытый ключ — в файле .env */
export const supabase = createClient(API_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  // вход хранится под одним именем, через что бы ни ходили — смена адреса не выкидывает из аккаунта
  auth: { storageKey: `sb-${new URL(DIRECT).hostname.split('.')[0]}-auth-token` },
})

/**
 * Открытые данные — простым запросом: ключ в адресе, без особых заголовков (вошедшему — ещё и его пропуск).
 * Первые запросы index.html запускает сам, ещё до загрузки кода сайта, — тогда берём уже начатые (адрес должен совпадать).
 */
/** Порядок ленты «Для вас» по умолчанию: один на день (так index.html может начать загрузку заранее) */
export const daySeed = () => new Date().toISOString().slice(0, 10)
/** Порция ленты «Для вас» (функция базы feed) */
export const feedQuery = (seed: string, offset: number, limit: number, topic?: string | null) =>
  `rpc/feed?p_seed=${encodeURIComponent(seed)}&p_offset=${offset}&p_limit=${limit}${topic ? `&p_topic=${encodeURIComponent(topic)}` : ''}`
/** Категории, в которых есть идеи */
export const TOPICS_QUERY = 'rpc/used_topics'

declare global {
  interface Window {
    __klubokPre?: Record<string, Promise<unknown>>
  }
}

/** Связь иногда обрывается — повторяем сразу, а не ждём */
const RETRIES = [300, 1000, 2500]
/** сколько ждать ответа, прежде чем спросить заново: первая попытка — недолго, следующие — дольше (медленный интернет) */
const TIMEOUTS = [5000, 10000, 15000, 20000]

/** token — пропуск вошедшего (лента по его интересам, свои скрытые идеи); без него — как гость */
export async function restGet<T>(path: string, token?: string): Promise<T> {
  // начатый заранее запрос — только если он был с тем же пропуском (или оба без)
  const preKey = path + (token ? '#auth' : '')
  const pre = window.__klubokPre?.[preKey]
  if (pre) {
    delete window.__klubokPre![preKey]
    try {
      // начатый заранее запрос тоже может зависнуть — ждём не дольше обычного
      return (await Promise.race([pre, new Promise((_, no) => setTimeout(() => no(new Error('долго')), TIMEOUTS[0]))])) as T
    } catch {
      /* оборвался или завис — спросим заново */
    }
  }
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const url = `${API_URL}/rest/v1/${path}${path.includes('?') ? '&' : '?'}apikey=${key}`
  for (let i = 0; ; i++) {
    let r: Response | null = null
    // зависший запрос (связь оборвалась, а браузер ещё ждёт) обрываем сами и спрашиваем заново
    const stop = new AbortController()
    const timer = setTimeout(() => stop.abort(), TIMEOUTS[Math.min(i + 1, TIMEOUTS.length - 1)])
    try {
      r = await fetch(url, { signal: stop.signal, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) })
      if (r.ok) return (await r.json()) as T
    } catch {
      /* обрыв связи (в том числе посреди ответа) или ждали слишком долго */
      r = null
    } finally {
      clearTimeout(timer)
    }
    if (r && r.status < 500) throw new Error(`запрос ${path}: ${r.status}`)
    if (i >= RETRIES.length) throw new Error(`запрос ${path}: нет ответа`)
    await new Promise((ok) => setTimeout(ok, RETRIES[i]))
  }
}

/** Картинка из базы (адрес Supabase) → показать через проброс */
export const viaApi = (url: string) => (url.startsWith(DIRECT) ? API_URL + url.slice(DIRECT.length) : url)
/** Адрес через проброс → как хранить в базе */
export const canonical = (url: string) => (url.startsWith(API_URL) ? DIRECT + url.slice(API_URL.length) : url)

/**
 * Возврат по ссылке из письма (подтверждение почты или «забыли пароль»): адрес вида /klubok/#access_token=…&type=… или #error=….
 * Ждём, пока библиотека заберёт вход из адреса, и чистим адрес, чтобы его не принял за страницу HashRouter.
 */
export async function finishEmailLink(): Promise<{ error: string | null; recovery: boolean }> {
  const hash = window.location.hash
  if (!/access_token=|error=/.test(hash)) return { error: null, recovery: false }
  const params = new URLSearchParams(hash.slice(1))
  const { error } = await supabase.auth.getSession()
  window.history.replaceState(null, '', window.location.pathname + '#/')
  if (params.get('error_code') === 'otp_expired') return { error: 'Ссылка из письма устарела. Запросите новую.', recovery: false }
  if (params.get('error') || error) return { error: 'Ссылка из письма не сработала. Запросите новую.', recovery: false }
  return { error: null, recovery: params.get('type') === 'recovery' }
}

/** Разбудить проверку заранее (открыли «Новая идея»): функция запускается и входит в ИИ, пока человек выбирает картинку */
export function warmChecks() {
  supabase.functions.invoke('publish', { body: { action: 'warm' } }).catch(() => {})
}

/** Пропуск вошедшего (для restGet); гостю — undefined */
export async function accessToken(): Promise<string | undefined> {
  return (await supabase.auth.getSession()).data.session?.access_token
}
