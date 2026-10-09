import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { useStore, type PostRow, type ProfileRow } from '../store'
import { TOPICS } from '../data/types'
import { num } from '../lib'
import { restGet } from '../supabase'
import { SearchBox } from '../components/Layout'
import { Masonry } from '../components/Masonry'
import { MoreLoader, usePaged } from '../components/Paged'
import { Avatar, Empty } from '../components/ui'
import { MasonrySkeleton } from '../components/Skeleton'

const SUGGEST = ['сырники', 'хранение', 'дача', 'выпечка', 'уборка', 'вязание', 'без сахара', 'маленькая квартира']

/** Поиск в базе (функция search_posts): название, категории, скрытые слова и текст с картинок, имя автора. Порциями. */
export function Search() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim().toLowerCase()
  const { me, user, addUserRows } = useStore()
  // категории, чьё название подходит под запрос (названия знает только сайт)
  const topicIds = TOPICS.filter((t) => t.label.toLowerCase().includes(q)).map((t) => t.id)
  const { posts, list, more, retry } = usePaged(
    `search:${q}`,
    (offset, limit) =>
      restGet<PostRow[]>(
        `rpc/search_posts?p_q=${encodeURIComponent(q)}&p_topics=${encodeURIComponent(`{${topicIds.join(',')}}`)}&p_offset=${offset}&p_limit=${limit}`,
      ),
    { enabled: q.length > 1 },
  )

  // люди: по имени и нику
  const [people, setPeople] = useState<string[]>([])
  useEffect(() => {
    setPeople([])
    const safe = q.replace(/[^\p{L}\p{N}_ -]/gu, '').trim()
    if (safe.length < 2) return
    let live = true
    const pat = encodeURIComponent(`*${safe}*`)
    restGet<ProfileRow[]>(`profiles?select=*&or=(name.ilike.${pat},handle.ilike.${pat})&order=followers_count.desc&limit=20`)
      .then((rows) => {
        if (!live) return
        addUserRows(rows)
        setPeople(rows.map((r) => r.id))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [q, addUserRows])
  const shownPeople = people.filter((id) => id !== me.id).map(user)
  const found = posts.filter((p) => !p.hidden)

  return (
    <div className="px-2 pt-3 sm:px-3 md:px-4 md:pt-6 lg:px-6">
      <SearchBox key={q} className="mb-3 md:hidden" />
      {q.length < 2 ? (
        <div className="mx-auto max-w-xl px-1 pt-4">
          <p className="section-label mb-2">Часто ищут</p>
          <div className="flex flex-wrap gap-2">
            {SUGGEST.map((s) => (
              <Link
                key={s}
                to={`/search?q=${encodeURIComponent(s)}`}
                className="press rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-semibold hover:bg-active"
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <>
          <h1 className="mb-3 px-1 text-lg font-bold">«{params.get('q')}»</h1>
          {shownPeople.length > 0 && (
            <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto px-1">
              {shownPeople.map((u) => (
                <Link key={u.id} to={`/u/${u.id}`} className="press card flex shrink-0 items-center gap-2 py-2 pr-4 pl-2 hover:bg-active">
                  <Avatar user={u} size={32} />
                  <span>
                    <span className="block text-sm font-semibold">{u.name}</span>
                    <span className="block text-xs">{num(u.followers)} подписчиков</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
          {!list?.loaded ? (
            list?.error ? (
              <MoreLoader list={{ ...list, loaded: true }} onMore={more} onRetry={retry} />
            ) : (
              <MasonrySkeleton rows={2} />
            )
          ) : found.length ? (
            <>
              <Masonry posts={found} source="search" />
              <MoreLoader list={list} onMore={more} onRetry={retry} />
            </>
          ) : (
            <Empty icon={SearchX}>Ничего не нашлось. Попробуйте другое слово.</Empty>
          )}
        </>
      )}
    </div>
  )
}
