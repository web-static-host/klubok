import { createClient } from '@supabase/supabase-js'

/** Подключение к тестовой базе. Адрес и открытый ключ — в файле .env */
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)

/**
 * Возврат по ссылке из письма: адрес вида /klubok/#access_token=… или #error=….
 * Ждём, пока библиотека заберёт вход из адреса, и чистим адрес, чтобы его не принял за страницу HashRouter.
 * Возвращает текст ошибки, если ссылка не сработала.
 */
export async function finishEmailLogin(): Promise<string | null> {
  const hash = window.location.hash
  if (!/access_token=|error=/.test(hash)) return null
  const params = new URLSearchParams(hash.slice(1))
  const { error } = await supabase.auth.getSession()
  window.history.replaceState(null, '', window.location.pathname + '#/')
  if (params.get('error_code') === 'otp_expired') return 'Ссылка для входа устарела. Запросите новую.'
  if (params.get('error') || error) return 'Не получилось войти по ссылке. Запросите новую.'
  return null
}
