import { useMemo, useState } from 'react'
import { TOPICS, topicLabel, type Topic } from '../data/types'
import { useStore } from '../store'
import { MobileTop } from '../components/Layout'
import { Masonry } from '../components/Masonry'
import { Chip } from '../components/ui'
import { ScrollRow } from '../components/ScrollRow'
import { ChipsSkeleton, MasonrySkeleton } from '../components/Skeleton'

/** «Для вас» — лента-плитка. Порядок пока простой: свежее и часто сохраняемое вперемешку. */
export function Home() {
  const { posts, loaded } = useStore()
  const [topic, setTopic] = useState<Topic | 'all'>('all')
  // таблетки — только категории, в которых есть посты: сначала из списка, потом свои
  const topics = useMemo(() => {
    const used = new Set(posts.flatMap((p) => p.topics))
    const own = [...used].filter((t) => !TOPICS.some((x) => x.id === t))
    return [...TOPICS.map((x) => x.id).filter((t) => used.has(t)), ...own]
  }, [posts])
  const list = (topic === 'all' ? posts : posts.filter((p) => p.topics.includes(topic)))
    .filter((p) => !p.hidden)
    .map((p, i) => ({ p, score: p.saves / 5 + (posts.length - i) / 6 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p)

  return (
    <>
      <MobileTop />
      {/* полоска категорий — ровно по ширине ленты */}
      <div className="px-2 pt-1 pb-3 sm:px-3 md:px-4 md:pt-4 lg:px-6">
        {loaded ? (
          <ScrollRow label="Категории">
            <Chip active={topic === 'all'} onClick={() => setTopic('all')}>
              Все
            </Chip>
            {topics.map((t) => (
              <Chip key={t} active={topic === t} onClick={() => setTopic(t)}>
                {topicLabel(t)}
              </Chip>
            ))}
          </ScrollRow>
        ) : (
          <ChipsSkeleton />
        )}
      </div>
      <div className="px-2 sm:px-3 md:px-4 lg:px-6">{loaded ? <Masonry posts={list} /> : <MasonrySkeleton />}</div>
    </>
  )
}
