import { useRef, useState } from 'react'
import type { Img } from '../data/types'
import { useStore } from '../store'

/** Картинка в форме: загружается и проверяется по правилам сразу после выбора, в фоне */
export interface CheckedImg {
  key: string
  /** то, что выбрал человек (для показа) */
  preview: Img
  /** уже в хранилище */
  uploaded?: Img
  /** checking — загружаем/проверяем; ok — прошла; bad — нарушает правила; error — проверить не удалось (проверим при публикации) */
  status: 'checking' | 'ok' | 'bad' | 'error'
  reasons?: string[]
  /** категории, которые ИИ подобрал по этой картинке */
  topics?: string[]
  /** название, которое ИИ предложил по этой картинке */
  title?: string
  /** ТЕСТ: замеры, мс — на сайте (загрузка, ожидание очереди, весь запрос проверки) и на сервере (timing) */
  times?: { upload: number; wait: number; request: number; server?: Record<string, number> }
}

export function useCheckedImages(purpose: 'post' | 'avatar') {
  const { uploadImg, checkImg } = useStore()
  const [items, setItems] = useState<CheckedImg[]>([])
  // проверки по одной: у ИИ один поток
  const queue = useRef(Promise.resolve())

  const patch = (key: string, p: Partial<CheckedImg>) => setItems((a) => a.map((i) => (i.key === key ? { ...i, ...p } : i)))

  const add = (imgs: Img[]) => {
    const fresh: CheckedImg[] = imgs.map((preview) => ({ key: crypto.randomUUID(), preview, status: 'checking' }))
    setItems((a) => [...a, ...fresh])
    for (const it of fresh) {
      const t0 = performance.now()
      let upMs = 0
      const up = uploadImg(it.preview).then((u) => ((upMs = Math.round(performance.now() - t0)), u)) // загрузки — сразу все
      up.catch(() => {})
      queue.current = queue.current.then(async () => {
        try {
          const uploaded = await up
          patch(it.key, { uploaded })
          const t1 = performance.now()
          const r = await checkImg(uploaded, purpose)
          const times = { upload: upMs, wait: Math.round(t1 - t0) - upMs, request: Math.round(performance.now() - t1), server: r.timing }
          patch(it.key, r.ok ? { status: 'ok', topics: r.topics, title: r.title, times } : { status: 'bad', reasons: r.reasons, times })
        } catch {
          patch(it.key, { status: 'error' })
        }
      })
    }
  }

  return {
    items,
    add,
    remove: (key: string) => setItems((a) => a.filter((i) => i.key !== key)),
    move: (i: number, d: -1 | 1) =>
      setItems((a) => {
        const b = [...a]
        ;[b[i], b[i + d]] = [b[i + d], b[i]]
        return b
      }),
    reset: () => setItems([]),
    /** сколько ещё проверяется */
    pending: items.filter((i) => i.status === 'checking').length,
    bad: items.filter((i) => i.status === 'bad').length,
    /** что отправить при публикации */
    result: () => items.map((i) => i.uploaded ?? i.preview),
  }
}
