import type { Img } from './data/types'
import { viaApi } from './supabase'

/** Адрес картинки: файл в хранилище Supabase или только что выбранное фото (data:URL) */
export function imgSrc(img: Img): string {
  return viaApi(img.src ?? '')
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

export function num(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',') + ' млн'
  if (n >= 10_000) return Math.round(n / 1000) + ' тыс.'
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '').replace('.', ',') + ' тыс.'
  return String(n)
}

export function timeAgo(ts: number) {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

/** Выбранный файл → data:URL, уменьшенный до maxW (текст на картинке остаётся читаемым) */
export function fileToImg(file: File, maxW = 900): Promise<Img> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const image = new Image()
      image.onerror = reject
      image.onload = () => {
        const k = Math.min(1, maxW / image.width)
        const c = document.createElement('canvas')
        c.width = Math.round(image.width * k)
        c.height = Math.round(image.height * k)
        c.getContext('2d')!.drawImage(image, 0, 0, c.width, c.height)
        resolve({ src: c.toDataURL('image/jpeg', 0.85), ratio: image.height / image.width })
      }
      image.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/** Ширина копии для ленты: карточка — до ~270 точек, на чётких экранах ×2 — до ~540 px, так что 600 хватает без потери качества */
export const THUMB_W = 600

/** Уменьшенная копия картинки (data:URL) для ленты; картинка и так не шире — null */
export function shrink(dataUrl: string, maxW = THUMB_W): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onerror = reject
    image.onload = () => {
      if (image.width <= maxW * 1.1) return resolve(null)
      const c = document.createElement('canvas')
      c.width = maxW
      c.height = Math.round((image.height * maxW) / image.width)
      const g = c.getContext('2d')!
      g.imageSmoothingQuality = 'high'
      g.drawImage(image, 0, 0, c.width, c.height)
      c.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
    }
    image.src = dataUrl
  })
}

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')
