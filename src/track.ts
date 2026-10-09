import { API_URL } from './supabase'

/**
 * Статистика для автора: показы карточки в ленте и клики по ней.
 * Копим и отправляем пачкой раз в несколько секунд (и когда вкладку закрывают или прячут).
 * В одной вкладке одна и та же карточка считается один раз — прокрутка туда-обратно не накручивает.
 */
const SENT = 'klubok.tracked'
let seen: { v: string[]; c: string[] } = { v: [], c: [] }
try {
  seen = JSON.parse(sessionStorage.getItem(SENT) ?? '') ?? seen
} catch {
  /* нет — начинаем заново */
}
const views = new Set<string>()
const clicks = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

function flush() {
  if (timer) clearTimeout(timer)
  timer = null
  if (!views.size && !clicks.size) return
  const body = JSON.stringify({ views: [...views], clicks: [...clicks] })
  views.clear()
  clicks.clear()
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  // keepalive — запрос уйдёт, даже если человек уже закрыл вкладку
  fetch(`${API_URL}/rest/v1/rpc/track_posts?apikey=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}

function add(list: string[], into: Set<string>, id: string) {
  if (list.includes(id)) return
  list.push(id)
  into.add(id)
  try {
    sessionStorage.setItem(SENT, JSON.stringify(seen))
  } catch {
    /* не страшно */
  }
  timer ??= setTimeout(flush, 4000)
}

export const trackView = (postId: string) => add(seen.v, views, postId)
export const trackClick = (postId: string) => add(seen.c, clicks, postId)

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
