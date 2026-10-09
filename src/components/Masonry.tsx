import { useEffect, useState } from 'react'
import type { Post } from '../data/types'
import { PinCard } from './PinCard'
import type { Source } from '../track'

/** Колонки по ширине экрана — DESIGN_WEB 3.2 */
function columnsFor(w: number) {
  if (w >= 1536) return 6
  if (w >= 1280) return 5
  if (w >= 1024) return 4
  if (w >= 640) return 3
  return 2
}

export function useColumns() {
  const [n, setN] = useState(() => columnsFor(window.innerWidth))
  useEffect(() => {
    const on = () => setN(columnsFor(window.innerWidth))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return n
}

/** Плитка: каждая карточка идёт в самую короткую колонку, порядок сохраняется слева направо */
/** source — где показана плитка (для статистики автора) */
export function Masonry({ posts, folderId, source }: { posts: Post[]; folderId?: string; source: Source }) {
  const n = useColumns()
  const cols: Post[][] = Array.from({ length: n }, () => [])
  const heights = new Array(n).fill(0)
  for (const p of posts) {
    const i = heights.indexOf(Math.min(...heights))
    cols[i].push(p)
    heights[i] += (p.images[0]?.ratio ?? 1) + 0.28 // + подпись под картинкой
  }
  return (
    <div className="flex items-start gap-2 sm:gap-3">
      {cols.map((col, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-4 sm:gap-5">
          {col.map((p) => (
            <PinCard key={p.id} post={p} folderId={folderId} source={source} />
          ))}
        </div>
      ))}
    </div>
  )
}
