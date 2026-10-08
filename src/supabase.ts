import { createClient } from '@supabase/supabase-js'

/** Подключение к тестовой базе. Адрес и открытый ключ — в файле .env */
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)

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
