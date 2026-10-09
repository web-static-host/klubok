import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, Loader2, ChevronRight, ImageOff, LogOut, Monitor, Moon, Pencil, Sun } from 'lucide-react'
import { useStore, type ThemeMode } from '../store'
import { num, plural } from '../lib'
import type { Img } from '../data/types'
import { Masonry } from '../components/Masonry'
import { Avatar, Button, Empty, IconButton, Segmented } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { LoginForm } from '../components/LoginSheet'
import { AvatarCropper } from '../components/AvatarCropper'
import { useCheckedImages } from '../components/useCheckedImages'
import { FolderCard, NewFolderButton } from './Folders'
import { FoldersSkeleton, MasonrySkeleton, ProfileHeadSkeleton } from '../components/Skeleton'

type Tab = 'posts' | 'folders' | 'tried'

export function Profile({ self }: { self?: boolean }) {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const s = useStore()
  const u = self ? s.me : s.user(id)
  const mine = s.authed && u.id === s.me.id
  const [tab, setTab] = useState<Tab>('posts')
  const [editing, setEditing] = useState(false)

  // ещё не знаем, вошёл ли человек, или нет данных — заглушка в разметке профиля (а не форма входа и не «никого»)
  if ((self && !s.authReady) || !s.loaded)
    return (
      <div className="px-2 pt-3 sm:px-3 md:px-4 md:pt-8 lg:px-6">
        {!self && <div className="mb-2 h-10" />}
        <ProfileHeadSkeleton />
        <div className="mt-5">
          <MasonrySkeleton rows={2} />
        </div>
      </div>
    )

  if (self && !s.authed)
    return (
      <div className="mx-auto max-w-sm px-3 pt-10 md:pt-16">
        <h1 className="mb-3 text-2xl font-bold">Вход</h1>
        <LoginForm hint="Войдите, чтобы публиковать идеи, сохранять их в папки и отмечать «Я попробовал»." />
        <ThemeSettings />
      </div>
    )

  const posts = s.posts.filter((p) => p.authorId === u.id).sort((a, b) => b.createdAt - a.createdAt)
  const triedIds = [...new Set(s.tries.filter((t) => t.userId === u.id).map((t) => t.postId))]
  const triedPosts = triedIds.map((pid) => s.post(pid)).filter((p) => !!p)
  const repeated = s.tries.filter((t) => posts.some((p) => p.id === t.postId)).length
  const followers = u.followers

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
        {mine && (
          <Button className="mt-4 w-full max-w-sm" kind="neutral" icon={Pencil} onClick={() => setEditing(true)}>
            Изменить профиль
          </Button>
        )}
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
            {s.mineReady ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {s.folders.map((f) => (
                  <FolderCard key={f.id} f={f} />
                ))}
              </div>
            ) : (
              <FoldersSkeleton />
            )}
          </>
        )}
      </div>

      {mine && (
        <section className="mx-auto mt-10 max-w-xl px-1">
          <ThemeSettings />
          <Link to="/rules" className="card mt-6 flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-active">
            Правила Клубка <ChevronRight size={18} />
          </Link>
          <h2 className="section-label mt-6 mb-2">Аккаунт</h2>
          <div className="card flex items-center gap-3 p-4">
            <p className="min-w-0 flex-1 truncate text-sm">{s.email}</p>
            <Button kind="neutral" size="sm" icon={LogOut} onClick={() => s.signOut()}>
              Выйти
            </Button>
          </div>
        </section>
      )}
      {mine && editing && <EditProfile onClose={() => setEditing(false)} />}
    </div>
  )
}

function ThemeSettings() {
  const s = useStore()
  return (
    <>
      <h2 className="section-label mt-6 mb-2">Внешний вид</h2>
      <Segmented<ThemeMode>
        value={s.theme}
        onChange={s.setTheme}
        options={[
          { id: 'system', label: 'Системная', icon: Monitor },
          { id: 'light', label: 'Светлая', icon: Sun },
          { id: 'dark', label: 'Тёмная', icon: Moon },
        ]}
      />
    </>
  )
}

const field = 'card w-full px-4 py-3 text-base outline-none placeholder:text-muted'

function EditProfile({ onClose }: { onClose: () => void }) {
  const { me, updateProfile } = useStore()
  const [name, setName] = useState(me.name)
  const [handle, setHandle] = useState(me.handle)
  const [bio, setBio] = useState(me.bio)
  // undefined — фото не меняли, null — убрали, картинка — новое (загружается и проверяется сразу)
  const [avatar, setAvatar] = useState<Img | null | undefined>(undefined)
  const pic = useCheckedImages('avatar')
  const fresh = pic.items[0]
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const shown = avatar === undefined ? me : { ...me, avatar: avatar?.src }
  return (
    <Sheet open onClose={onClose} title="Профиль">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return setErr('Напишите имя или название')
          if (!/^[a-z0-9_]{3,30}$/.test(handle)) return setErr('Ник: от 3 до 30 латинских букв, цифр или _')
          if (fresh?.status === 'bad') return setErr(`Фото не прошло проверку: ${fresh.reasons?.join('. ')}`)
          setBusy(true)
          const error = await updateProfile({
            name: name.trim(),
            handle,
            bio: bio.trim(),
            avatar: avatar === null ? null : fresh ? pic.result()[0] : undefined,
          })
          setBusy(false)
          if (error) setErr(error)
          else onClose()
        }}
      >
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <Avatar user={shown} size={72} />
            {fresh?.status === 'checking' && (
              <span
                className="absolute inset-0 inline-flex items-center justify-center rounded-full bg-black/40 text-white"
                title="Проверяем фото"
              >
                <Loader2 size={22} className="animate-spin" />
              </span>
            )}
          </div>
          <div className="flex flex-col items-start gap-1.5">
            <Button type="button" kind="secondary" size="sm" icon={Camera} onClick={() => file.current?.click()}>
              {shown.avatar ? 'Сменить фото' : 'Загрузить фото'}
            </Button>
            {shown.avatar && (
              <button
                type="button"
                className="press px-1 text-xs font-semibold text-rose-500 hover:underline"
                onClick={() => {
                  pic.reset()
                  setAvatar(null)
                }}
              >
                Убрать фото
              </button>
            )}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) setCropFile(f)
            }}
          />
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          placeholder="Имя или название"
          aria-label="Имя"
          className={field}
        />
        <div className="card flex items-center px-4">
          <span className="text-base text-muted">@</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            maxLength={30}
            placeholder="ник"
            aria-label="Ник"
            className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-muted"
          />
        </div>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="О себе"
          aria-label="О себе"
          className={`${field} resize-none`}
        />
        {err && (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">
            {err}
          </p>
        )}
        {fresh?.status === 'bad' && (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">
            Фото не прошло проверку: {fresh.reasons?.join('. ')}
          </p>
        )}
        <Button type="submit" disabled={busy || pic.pending > 0}>
          {busy ? 'Сохраняем…' : pic.pending ? 'Проверяем фото…' : 'Сохранить'}
        </Button>
      </form>
      <AvatarCropper
        file={cropFile}
        onCancel={() => setCropFile(null)}
        onDone={(img) => {
          pic.reset()
          pic.add([img])
          setAvatar(img)
          setCropFile(null)
        }}
      />
    </Sheet>
  )
}
