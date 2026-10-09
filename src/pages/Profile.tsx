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
import { Bone, FoldersSkeleton, MasonrySkeleton, ProfileHeadSkeleton } from '../components/Skeleton'

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
        {!self && (
          <div className="mb-2 px-1">
            <Bone className="h-10 w-10 rounded-2xl" />
          </div>
        )}
        <ProfileHeadSkeleton self={self} />
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
        <ThemeSettings label />
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
      {/* шапка — в ширину: карточка автора (с кнопкой «Изменить профиль» / «Подписаться»), цифры; у себя ниже — настройки. На телефоне — столбиком */}
      <section className="fade-up flex flex-col gap-2 md:flex-row md:flex-wrap">
        <div className="card flex min-w-0 items-center gap-3 p-3 md:min-w-[280px] md:flex-1">
          <Avatar user={u} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl leading-7 font-bold">{u.name}</h1>
            <p className="truncate text-sm">@{u.handle}</p>
            {u.bio && <p className="mt-1 line-clamp-2 text-sm leading-snug">{u.bio}</p>}
          </div>
          {mine ? (
            <Button
              kind="neutral"
              size="sm"
              icon={Pencil}
              className="shrink-0"
              aria-label="Изменить профиль"
              onClick={() => setEditing(true)}
            >
              <span className="max-sm:hidden">Изменить профиль</span>
            </Button>
          ) : (
            <Button
              kind={s.follows.includes(u.id) ? 'neutral' : 'primary'}
              size="sm"
              className="shrink-0"
              onClick={() => s.toggleFollow(u.id)}
            >
              {s.follows.includes(u.id) ? 'Вы подписаны' : 'Подписаться'}
            </Button>
          )}
        </div>
        <dl className="grid grid-cols-3 gap-2 md:flex">
          {[
            { v: posts.length, l: plural(posts.length, 'публикация', 'публикации', 'публикаций') },
            { v: followers, l: plural(followers, 'подписчик', 'подписчика', 'подписчиков') },
            { v: repeated, l: 'раз повторили' },
          ].map((x) => (
            <div key={x.l} className="card flex flex-col justify-center px-3 py-2 text-center md:min-w-[120px]">
              <dd className="text-lg leading-6 font-bold">{num(x.v)}</dd>
              <dt className="text-xs">{x.l}</dt>
            </div>
          ))}
        </dl>
      </section>
      {mine && (
        <section className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-[1fr_auto_auto]" aria-label="Настройки">
          <div className="col-span-2 md:col-span-1">
            <ThemeSettings />
          </div>
          <Link to="/rules" className="card flex min-h-12 items-center justify-between gap-4 px-4 text-sm font-semibold hover:bg-active">
            Правила Клубка <ChevronRight size={18} />
          </Link>
          <div className="card flex min-h-12 items-center justify-center gap-3 p-1.5 sm:justify-start sm:pl-4">
            {/* на телефоне почта не помещается — только «Выйти» */}
            <p className="hidden min-w-0 flex-1 truncate text-sm sm:block md:max-w-[260px]">{s.email}</p>
            <Button kind="neutral" size="sm" icon={LogOut} onClick={() => s.signOut()}>
              Выйти
            </Button>
          </div>
        </section>
      )}
      <div className="mx-auto mt-4 w-full max-w-sm">
        <Segmented value={tab} onChange={setTab} options={tabs} />
      </div>

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

      {mine && editing && <EditProfile onClose={() => setEditing(false)} />}
    </div>
  )
}

/** Тема: в профиле — без заголовка (в ряду настроек), под формой входа — с заголовком */
function ThemeSettings({ label }: { label?: boolean }) {
  const s = useStore()
  return (
    <div>
      {label && <h2 className="section-label mt-6 mb-2">Внешний вид</h2>}
      <Segmented<ThemeMode>
        value={s.theme}
        onChange={s.setTheme}
        options={[
          { id: 'system', label: 'Системная', icon: Monitor },
          { id: 'light', label: 'Светлая', icon: Sun },
          { id: 'dark', label: 'Тёмная', icon: Moon },
        ]}
      />
    </div>
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
