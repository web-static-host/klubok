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
 * Открытые данные (лента, авторы, отзывы) — простым запросом: ключ в адресе, без особых заголовков.
 * Так браузер не делает перед каждым запросом предварительный (минус один круг до Supabase).
 * Первые запросы index.html запускает сам, ещё до загрузки кода сайта, — тогда берём уже начатые.
 */
export const PUBLIC_QUERIES = [
  'profiles?select=*',
  'posts?select=*&order=created_at.desc&limit=1000',
  'tries?select=*&order=created_at.desc&limit=5000',
  'try_replies?select=*&order=created_at.asc&limit=10000',
] as const

declare global {
  interface Window {
    __klubokPre?: Record<string, Promise<unknown>>
  }
}

/** Связь иногда обрывается — повторяем сразу, а не ждём */
const RETRIES = [300, 1000, 2500]

export async function restGet<T>(path: string): Promise<T> {
  const pre = window.__klubokPre?.[path]
  if (pre) {
    delete window.__klubokPre![path]
    try {
      return (await pre) as T
    } catch {
      /* начатый заранее запрос оборвался — спросим заново */
    }
  }
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const url = `${API_URL}/rest/v1/${path}${path.includes('?') ? '&' : '?'}apikey=${key}`
  for (let i = 0; ; i++) {
    let r: Response | null = null
    try {
      r = await fetch(url)
    } catch {
      /* обрыв связи */
    }
    if (r?.ok) return (await r.json()) as T
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
