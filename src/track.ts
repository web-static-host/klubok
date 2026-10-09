import { API_URL, supabase } from './supabase'

/**
 * События для статистики автора и ленты «Для вас» (функция базы track): показы карточек, открытия идей,
 * до какой картинки долистали, сколько секунд смотрели, «Поделиться», заходы в профиль, подписки со страницы идеи.
 * Копим и отправляем пачкой раз в несколько секунд (и когда вкладку закрывают или прячут).
 * Кто именно смотрел, автор не видит: вошедший — по id, гость — по случайному номеру браузера (чтобы считать разных людей).
 */

/** откуда пришли: лента «Для вас», поиск, подписки, профиль, «Ещё идеи», папка, прямая ссылка */
export type Source = 'home' | 'search' | 'following' | 'profile' | 'more' | 'folder' | 'link'

interface Ev {
  k: 'view' | 'open' | 'slide' | 'dwell' | 'share' | 'profile' | 'follow_post'
  p?: string
  u?: string
  s?: Source
  v?: number
  d?: 'mobile' | 'desktop'
}

/** случайный номер этого браузера (гость) */
function anonId(): string {
  try {
    let id = localStorage.getItem('klubok.anon')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('klubok.anon', id)
    }
    return id
  } catch {
    return 'nostorage'
  }
}
const anon = anonId()

// пропуск вошедшего — чтобы событие легло на него (его лента «Для вас» учится на нём)
let token: string | undefined
supabase.auth.onAuthStateChange((_e, s) => {
  token = s?.access_token
})

// в одной вкладке показ и открытие одной идеи считаются один раз — прокрутка туда-обратно и обновление не накручивают
const SENT = 'klubok.tracked2'
let once: string[] = []
try {
  once = JSON.parse(sessionStorage.getItem(SENT) ?? '[]')
} catch {
  /* нет — начинаем заново */
}
const firstTime = (k: string) => {
  if (once.includes(k)) return false
  once.push(k)
  try {
    sessionStorage.setItem(SENT, JSON.stringify(once.slice(-2000)))
  } catch {
    /* не страшно */
  }
  return true
}

const queue: Ev[] = []
let timer: ReturnType<typeof setTimeout> | null = null
const device = () => (window.innerWidth < 768 ? 'mobile' : 'desktop')

function flush(leaving = false) {
  if (timer) clearTimeout(timer)
  timer = null
  if (!queue.length) return
  const batch = queue.splice(0, 200)
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  // keepalive — запрос уйдёт, даже если человек уже закрыл вкладку
  fetch(`${API_URL}/rest/v1/rpc/track?apikey=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ p_events: batch, p_anon: anon }),
    keepalive: leaving,
  }).catch(() => {})
  if (queue.length) flush(leaving)
}

function push(e: Ev) {
  queue.push({ ...e, d: device() })
  timer ??= setTimeout(flush, 4000)
}

/** карточку показали (видна хотя бы наполовину) */
export const trackView = (p: string, s: Source) => firstTime(`v:${p}`) && push({ k: 'view', p, s })
/** идею открыли */
export const trackOpen = (p: string, s: Source) => firstTime(`o:${p}`) && push({ k: 'open', p, s })
/** ушли со страницы идеи: сколько секунд смотрели и до какой картинки долистали (1 — первая) */
export function trackLeave(p: string, seconds: number, maxSlide: number) {
  if (seconds >= 1) push({ k: 'dwell', p, v: Math.round(seconds) })
  if (maxSlide >= 2) push({ k: 'slide', p, v: maxSlide })
}
export const trackShare = (p: string) => push({ k: 'share', p })
export const trackProfile = (u: string) => firstTime(`u:${u}`) && push({ k: 'profile', u })
export const trackFollowFromPost = (p: string) => push({ k: 'follow_post', p })

if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush(true))
