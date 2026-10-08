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
