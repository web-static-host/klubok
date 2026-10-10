import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { TOPICS, topicLabel, type Topic } from '../data/types'
import { homeKey, useStore, type PostRow } from '../store'
import { TOPICS_QUERY, accessToken, feedQuery, restGet } from '../supabase'
import { MobileTop } from '../components/Layout'
import { Masonry } from '../components/Masonry'
import { MoreLoader, usePaged } from '../components/Paged'
import { Chip, Empty } from '../components/ui'
import { ScrollRow } from '../components/ScrollRow'
import { ChipsSkeleton, MasonrySkeleton } from '../components/Skeleton'

/** категории, в которых есть идеи, — запоминаем, чтобы при следующем заходе показать сразу */
const TOPICS_CACHE = 'klubok.topics'
function cachedTopics(): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(TOPICS_CACHE) ?? 'null')
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

/**
 * «Для вас» — лента-плитка по интересам (функция базы feed): в каждых 10 идеях 7 — по интересам, 2 — свежее и популярное,
 * 1 — случайное. Гостю — свежее и популярное. Подгружается порциями, когда долистали до конца.
 */
/** когда загружена первая порция каждой ленты */
const startedAt: Record<string, number> = {}

export function Home() {
  const { me, authReady, feedSeed, notInterested, hiddenNow } = useStore()
  const [topic, setTopic] = useState<Topic | null>(null)
  const [used, setUsed] = useState<string[] | null>(cachedTopics)
  useEffect(() => {
    restGet<string[]>(TOPICS_QUERY)
      .then((t) => {
        setUsed(t)
        try {
          localStorage.setItem(TOPICS_CACHE, JSON.stringify(t))
        } catch {
          /* не страшно */
        }
      })
      .catch(() => setUsed((u) => u ?? []))
  }, [])
  // таблетки — только категории, в которых есть идеи: сначала из списка, потом свои
  const topics = used
    ? [...TOPICS.map((x) => x.id).filter((t) => used.includes(t)), ...used.filter((t) => !TOPICS.some((x) => x.id === t))]
    : null

  const uid = me.id || null
  const { posts, list, more, retry } = usePaged(
    homeKey(topic, uid),
    async (offset, limit) => {
      // следующие порции — на момент первой (чтобы идеи при прокрутке не повторялись и не терялись)
      const key = homeKey(topic, uid)
      if (!offset) startedAt[key] = Date.now()
      const age = offset && startedAt[key] ? (Date.now() - startedAt[key]) / 1000 : undefined
      return restGet<PostRow[]>(feedQuery(feedSeed, offset, limit, topic, age), uid ? await accessToken() : undefined)
    },
    { enabled: authReady, refresh: true },
  )
  // скрытые в этот заход остаются на месте — с вопросом «Что не так?»
  const shown = posts.filter((p) => !p.hidden && (!notInterested.has(p.id) || hiddenNow[p.id]))

  return (
    <>
      <MobileTop />
      {/* полоска категорий — ровно по ширине ленты */}
      <div className="px-2 pt-1 pb-3 sm:px-3 md:px-4 md:pt-4 lg:px-6">
        {topics ? (
          <ScrollRow label="Категории">
            <Chip active={topic === null} onClick={() => setTopic(null)}>
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
      <div className="px-2 sm:px-3 md:px-4 lg:px-6">
        {!list?.loaded ? (
          list?.error ? (
            <MoreLoader list={{ ...list, loaded: true }} onMore={more} onRetry={retry} />
          ) : (
            <MasonrySkeleton />
          )
        ) : shown.length ? (
          <>
            <Masonry posts={shown} source="home" />
            <MoreLoader list={list} onMore={more} onRetry={retry} />
          </>
        ) : (
          <Empty icon={Sparkles}>Здесь пока пусто. Загляните позже — идеи появляются каждый день.</Empty>
        )}
      </div>
    </>
  )
}
