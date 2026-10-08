import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImageOff, MapPin, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { useStore, type ThemeMode } from '../store'
import { num, plural } from '../lib'
import { Masonry } from '../components/Masonry'
import { Avatar, Button, Empty, IconButton, Segmented } from '../components/ui'
import { FolderCard, NewFolderButton } from './Folders'

type Tab = 'posts' | 'folders' | 'tried'

export function Profile({ self }: { self?: boolean }) {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const s = useStore()
  const u = self ? s.me : s.user(id)
  const mine = u.id === s.me.id
  const [tab, setTab] = useState<Tab>('posts')

  const posts = s.posts.filter((p) => p.authorId === u.id).sort((a, b) => b.createdAt - a.createdAt)
  const triedIds = [...new Set(s.tries.filter((t) => t.userId === u.id).map((t) => t.postId))]
  const triedPosts = triedIds.map((pid) => s.post(pid)).filter((p) => !!p)
  const repeated = s.tries.filter((t) => posts.some((p) => p.id === t.postId)).length
  const followers = u.followers + (!mine && s.follows.includes(u.id) ? 1 : 0)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'posts', label: 'Публикации' },
    ...(mine ? [{ id: 'folders' as Tab, label: 'Папки' }] : []),
    { id: 'tried', label: 'Повторил' },
  ]

  return (
    <div className="px-2 pt-3 sm:px-3 md:px-4 md:pt-8 lg:px-6">
      {!self && (
        <div className="mb-2 px-1">
          <IconButton icon={ArrowLeft} label="Назад" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} />
        </div>
      )}
      <section className="fade-up mx-auto flex max-w-xl flex-col items-center text-center">
        <Avatar user={u} size={88} />
        <h1 className="mt-3 text-2xl font-bold">{u.name}</h1>
        <p className="text-sm">@{u.handle}</p>
        {u.bio && <p className="mt-2 max-w-md text-sm leading-relaxed">{u.bio}</p>}
        {u.city && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs">
            <MapPin size={12} /> {u.city}
          </p>
        )}
        <dl className="mt-4 grid w-full max-w-sm grid-cols-3 gap-2">
          {[
            { v: posts.length, l: plural(posts.length, 'публикация', 'публикации', 'публикаций') },
            { v: followers, l: plural(followers, 'подписчик', 'подписчика', 'подписчиков') },
            { v: repeated, l: 'раз повторили' },
          ].map((x) => (
            <div key={x.l} className="card px-2 py-2.5">
              <dd className="text-lg leading-6 font-bold">{num(x.v)}</dd>
              <dt className="text-xs">{x.l}</dt>
            </div>
          ))}
        </dl>
        {!mine && (
          <Button
            className="mt-4 w-full max-w-sm"
            kind={s.follows.includes(u.id) ? 'neutral' : 'primary'}
            onClick={() => s.toggleFollow(u.id)}
          >
            {s.follows.includes(u.id) ? 'Вы подписаны' : 'Подписаться'}
          </Button>
        )}
        <div className="mt-5 w-full max-w-sm">
          <Segmented value={tab} onChange={setTab} options={tabs} />
        </div>
      </section>

      <div className="mt-5">
        {tab === 'posts' &&
          (posts.length ? (
            <Masonry posts={posts} />
          ) : (
            <Empty icon={ImageOff}>
              {mine ? 'Вы ещё ничего не публиковали. Нажмите «Создать» и поделитесь своей идеей.' : 'Публикаций пока нет.'}
            </Empty>
          ))}
        {tab === 'tried' &&
          (triedPosts.length ? (
            <Masonry posts={triedPosts} />
          ) : (
            <Empty icon={ImageOff}>Здесь появятся идеи, которые {mine ? 'вы повторили' : 'повторил автор'}.</Empty>
          ))}
        {tab === 'folders' && (
          <>
            <div className="mb-3 flex justify-end">
              <NewFolderButton />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {s.folders.map((f) => (
                <FolderCard key={f.id} f={f} />
              ))}
            </div>
          </>
        )}
      </div>

      {mine && (
        <section className="mx-auto mt-10 max-w-xl px-1" aria-labelledby="settings-h">
          <h2 id="settings-h" className="section-label mb-2">
            Внешний вид
          </h2>
          <Segmented<ThemeMode>
            value={s.theme}
            onChange={s.setTheme}
            options={[
              { id: 'system', label: 'Системная', icon: Monitor },
              { id: 'light', label: 'Светлая', icon: Sun },
              { id: 'dark', label: 'Тёмная', icon: Moon },
            ]}
          />
          <h2 className="section-label mt-6 mb-2">Тестовая версия</h2>
          <div className="card p-4">
            <p className="text-sm leading-relaxed">
              Это прототип: данные хранятся только в этом браузере. Картинки — временные заглушки со стоков.
            </p>
            <Button
              kind="neutral"
              size="sm"
              icon={RotateCcw}
              className="mt-3"
              onClick={() => {
                if (confirm('Вернуть тестовые данные? Ваши публикации и отметки удалятся.')) s.reset()
              }}
            >
              Сбросить тестовые данные
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
