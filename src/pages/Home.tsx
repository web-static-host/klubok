import { useState } from 'react'
import { TOPICS, type Topic } from '../data/types'
import { useStore } from '../store'
import { MobileTop } from '../components/Layout'
import { Masonry } from '../components/Masonry'
import { Chip } from '../components/ui'

/** «Для вас» — лента-плитка. Порядок пока простой: свежее и популярное вперемешку. */
export function Home() {
  const { posts } = useStore()
  const [topic, setTopic] = useState<Topic | 'all'>('all')
  const list = (topic === 'all' ? posts : posts.filter((p) => p.topic === topic))
    .map((p, i) => ({ p, score: p.likes / 1000 + (posts.length - i) / 6 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p)

  return (
    <>
      <MobileTop />
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-2 pt-1 pb-3 sm:px-3 md:px-4 md:pt-4 lg:px-6">
        {TOPICS.map((t) => (
          <Chip key={t.id} active={topic === t.id} onClick={() => setTopic(t.id)}>
            {t.label}
          </Chip>
        ))}
      </div>
      <div className="px-2 sm:px-3 md:px-4 lg:px-6">
        <Masonry posts={list} />
      </div>
    </>
  )
}
