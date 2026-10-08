import type { Img } from './data/types'

/** Адрес картинки. Заглушки — фотосток по теме (loremflickr), запасной — picsum. */
export function imgSrc(img: Img, w = 600): string {
  if (img.src) return img.src
  const h = Math.round(w * img.ratio)
  return `https://loremflickr.com/${w}/${h}/${encodeURIComponent(img.tag ?? 'food')}?lock=${img.seed ?? 1}`
}
export function imgFallback(img: Img, w = 600): string {
  const h = Math.round(w * img.ratio)
  return `https://picsum.photos/seed/klubok${img.seed ?? 1}/${w}/${h}`
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

/** Чтение выбранного файла в data:URL с уменьшением до maxW, чтобы влезало в хранилище браузера */
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
        resolve({ src: c.toDataURL('image/jpeg', 0.8), ratio: image.height / image.width })
      }
      image.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')
