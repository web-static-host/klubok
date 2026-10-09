import { useEffect, useRef } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import type { Post } from '../data/types'
import { useStore, type Loader, type PagedList } from '../store'
import { Button } from './ui'

/** Списки, которые уже обновили в этот заход (запомненная с прошлого раза лента обновляется один раз, а не при каждом возврате) */
const refreshed = new Set<string>()

/**
 * Список идей порциями: первая — сразу, следующие — когда долистали до конца (MoreLoader).
 * enabled — можно грузить (например, уже известно, вошёл ли человек); refresh — показанное из прошлого захода обновить один раз.
 */
export function usePaged(key: string, loader: Loader, opts: { enabled?: boolean; refresh?: boolean } = {}) {
  const { lists, loadMore, post } = useStore()
  const list = lists[key] as PagedList | undefined
  const loaderRef = useRef(loader)
  useEffect(() => {
    loaderRef.current = loader
  })
  const enabled = opts.enabled ?? true
  const load = (reset = false) => loadMore(key, (o, n) => loaderRef.current(o, n), reset)
  useEffect(() => {
    if (!enabled) return
    if (!list?.loaded && !list?.loading) load()
    else if (opts.refresh && !refreshed.has(key) && !list?.loading) load(true)
    refreshed.add(key)
    // список могли сбросить (например, «Подписки» после подписки) — тогда грузим заново
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, !list])
  const posts = (list?.ids ?? []).map(post).filter((p): p is Post => !!p)
  return { posts, list, more: () => enabled && load(), retry: () => load(!list?.ids.length) }
}

/** Низ списка: долистали — подгружаем следующую порцию; ошибка — «Повторить» */
export function MoreLoader({ list, onMore, onRetry }: { list?: PagedList; onMore: () => void; onRetry: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const more = useRef(onMore)
  useEffect(() => {
    more.current = onMore
  })
  const active = !!list?.loaded && !list.done && !list.error
  useEffect(() => {
    const el = box.current
    if (!el || !active) return
    // заранее, за полтора экрана до конца — чтобы человек не упирался в пустоту
    const io = new IntersectionObserver(([e]) => e.isIntersecting && more.current(), { rootMargin: '1200px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [active, list?.ids.length])
  if (!list || list.done) return null
  return (
    <div ref={box} className="flex justify-center py-6" aria-live="polite">
      {list.error ? (
        <Button kind="neutral" size="sm" icon={RotateCcw} onClick={onRetry}>
          Не загрузилось. Повторить
        </Button>
      ) : list.loaded && list.loading ? (
        <Loader2 size={24} className="animate-spin text-muted" aria-label="Загружаем ещё" />
      ) : null}
    </div>
  )
}
