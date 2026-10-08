import { Link, useSearchParams } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { useStore } from '../store'
import { num } from '../lib'
import { SearchBox } from '../components/Layout'
import { Masonry } from '../components/Masonry'
import { Avatar, Empty } from '../components/ui'

const SUGGEST = ['сырники', 'хранение', 'дача', 'выпечка', 'уборка', 'вязание', 'без сахара', 'маленькая квартира']

export function Search() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim().toLowerCase()
  const { posts, users, user } = useStore()

  const found = q
    ? posts.filter((p) =>
        [p.title, p.text, ...p.tags, user(p.authorId).name, ...(p.recipe?.ingredients ?? [])].join(' ').toLowerCase().includes(q),
      )
    : []
  const people = q ? users.filter((u) => u.id !== 'me' && (u.name + ' ' + u.handle).toLowerCase().includes(q)) : []

  return (
    <div className="px-2 pt-3 sm:px-3 md:px-4 md:pt-6 lg:px-6">
      <SearchBox key={q} className="mb-3 md:hidden" />
      {!q ? (
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
          <h1 className="mb-3 px-1 text-lg font-bold">
            «{params.get('q')}» · {found.length}
          </h1>
          {people.length > 0 && (
            <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto px-1">
              {people.map((u) => (
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
          {found.length ? <Masonry posts={found} /> : <Empty icon={SearchX}>Ничего не нашлось. Попробуйте другое слово.</Empty>}
        </>
      )}
    </div>
  )
}
