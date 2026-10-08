import type { Img } from './data/types'

/** Адрес картинки: файл в хранилище Supabase или только что выбранное фото (data:URL) */
export function imgSrc(img: Img): string {
  return img.src ?? ''
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

/** Фото профиля: квадрат из середины картинки, 192×192 (маленький файл — грузится быстро) */
export function fileToSquare(file: File, size = 192): Promise<Img> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onerror = reject
    image.onload = () => {
      const side = Math.min(image.width, image.height)
      const c = document.createElement('canvas')
      c.width = c.height = size
      c.getContext('2d')!.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve({ src: c.toDataURL('image/jpeg', 0.82), ratio: 1 })
    }
    image.src = url
  })
}

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')
