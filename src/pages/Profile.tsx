import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Camera,
  Flag,
  Loader2,
  ChevronRight,
  ImageOff,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  Settings,
  Sun,
  UserX,
} from 'lucide-react'
import { useStore, type PostRow, type ProfileRow, type ThemeMode } from '../store'
import { num, plural } from '../lib'
import { accessToken, restGet } from '../supabase'
import { trackProfile } from '../track'
import { useUi } from '../ui-context'
import type { Img } from '../data/types'
import { Masonry } from '../components/Masonry'
import { Avatar, Button, Empty, IconButton, Menu, Segmented } from '../components/ui'
import { MoreLoader, usePaged } from '../components/Paged'
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
  const { openReport } = useUi()
  const uid = self ? s.me.id : id
  const u = s.user(uid)
  const mine = s.authed && uid === s.me.id
  const [tab, setTab] = useState<Tab>('posts')
  // окно профиля: 'profile' — только данные профиля (компьютер), 'all' — профиль и настройки (телефон, шестерёнка)
  const [editing, setEditing] = useState<false | 'profile' | 'all'>(false)

  // профиль — свежий из базы (подписчики, фото); нет такого — «никого»
  const [missing, setMissing] = useState(false)
  const { addUserRows } = s
  useEffect(() => {
    if (!uid) return
    setMissing(false)
    let live = true
    restGet<ProfileRow[]>(`profiles?select=*&id=eq.${uid}`)
      .then((rows) => {
        if (!live) return
        addUserRows(rows)
        if (!rows.length) setMissing(true)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [uid, addUserRows])
  // статистика автора: зашли в профиль (свой не считается)
  useEffect(() => {
    if (uid && !mine && s.authReady) trackProfile(uid)
  }, [uid, mine, s.authReady])

  // цифры: публикаций (у себя — со скрытыми) и сколько раз повторили идеи автора
  const [summary, setSummary] = useState<{ posts: number; repeated: number } | null>(null)
  useEffect(() => {
    if (!uid || !s.authReady) return
    let live = true
    ;(async () =>
      restGet<{ posts: number; repeated: number }>(`rpc/profile_summary?p_user=${uid}`, mine ? await accessToken() : undefined))()
      .then((x) => live && setSummary(x))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [uid, mine, s.authReady])

  const own = usePaged(
    `profile:${uid}`,
    async (offset, limit) =>
      restGet<PostRow[]>(
        `posts?select=*&author_id=eq.${uid}${mine ? '' : '&hidden=is.false'}&order=created_at.desc&offset=${offset}&limit=${limit}`,
        mine ? await accessToken() : undefined,
      ),
    { enabled: !!uid && s.authReady, refresh: true },
  )
  const tried = usePaged(
    `tried:${uid}`,
    (offset, limit) => restGet<PostRow[]>(`rpc/tried_posts?p_user=${uid}&p_offset=${offset}&p_limit=${limit}`),
    { enabled: !!uid && tab === 'tried' },
  )

  // ещё не знаем, вошёл ли человек, или нет профиля — заглушка в разметке профиля (а не форма входа и не «никого»)
  if ((self && !s.authReady) || (uid && !s.hasUser(uid) && !missing))
    return (
      <div className="px-2 pt-2 sm:px-3 md:px-4 lg:px-6">
        <ProfileHeadSkeleton self={self} />
        <div className="mt-2">
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
  if (missing) return <Empty icon={UserX}>Такого профиля нет.</Empty>

  const posts = own.posts.filter((p) => mine || !p.hidden)
  const followers = u.followers
  const back = () => (window.history.length > 1 ? nav(-1) : nav('/'))
  const count = summary?.posts ?? posts.length

  const tabs: { id: Tab; label: string }[] = [
    { id: 'posts', label: 'Публикации' },
    ...(mine ? [{ id: 'folders' as Tab, label: 'Папки' }] : []),
    { id: 'tried', label: 'Повторил' },
  ]

  return (
    <div className="px-2 pt-2 sm:px-3 md:px-4 lg:px-6">
      {/* шапка — в ширину: карточка автора (с кнопками), цифры; у себя ниже — настройки. На телефоне — столбиком */}
      <div className="relative">
        {/* «Назад» — не отдельной строкой: на широком экране слева от шапки, на узком — в карточке автора */}
        <IconButton icon={ArrowLeft} label="Назад" className="absolute top-0 left-0 max-xl:hidden" onClick={back} />
        <section className="fade-up flex flex-col gap-2 md:flex-row md:flex-wrap md:justify-center">
          <div className="card flex min-w-0 items-center gap-3 p-3 md:max-w-[560px] md:py-2">
            <IconButton icon={ArrowLeft} label="Назад" className="xl:hidden" onClick={back} />
            <Avatar user={u} size={56} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl leading-7 font-bold">{u.name}</h1>
              <p className="truncate text-sm">@{u.handle}</p>
              {u.bio && <p className="mt-1 line-clamp-2 text-sm leading-snug">{u.bio}</p>}
            </div>
            {mine ? (
              <>
                {/* компьютер: «Изменить профиль», под ней «Выйти» */}
                <div className="ml-1 flex shrink-0 flex-col gap-1 max-md:hidden">
                  <Button kind="neutral" size="sm" icon={Pencil} className="h-8!" onClick={() => setEditing('profile')}>
                    Изменить профиль
                  </Button>
                  <Button kind="neutral" size="sm" icon={LogOut} className="h-8!" onClick={() => s.signOut()}>
                    Выйти
                  </Button>
                </div>
                {/* телефон: статистика и шестерёнка — профиль, тема, уведомления, правила и выход в одном окне */}
                <IconButton icon={BarChart3} label="Статистика" className="ml-1 md:hidden" onClick={() => nav('/stats')} />
                <IconButton icon={Settings} label="Профиль и настройки" className="md:hidden" onClick={() => setEditing('all')} />
              </>
            ) : (
              <>
                <Button
                  kind={s.follows.includes(u.id) ? 'neutral' : 'primary'}
                  size="sm"
                  className="ml-1 shrink-0 max-md:hidden"
                  onClick={() => s.toggleFollow(u.id)}
                >
                  {s.follows.includes(u.id) ? 'Вы подписаны' : 'Подписаться'}
                </Button>
                <Menu
                  label="Ещё"
                  items={[{ label: 'Пожаловаться', icon: Flag, danger: true, onClick: () => openReport('profile', u.id) }]}
                />
              </>
            )}
          </div>
          {/* телефон: «Подписаться» — под карточкой во всю ширину, чтобы не обрезать имя */}
          {!mine && (
            <Button kind={s.follows.includes(u.id) ? 'neutral' : 'primary'} className="md:hidden" onClick={() => s.toggleFollow(u.id)}>
              {s.follows.includes(u.id) ? 'Вы подписаны' : 'Подписаться'}
            </Button>
          )}
          <dl className="grid grid-cols-3 gap-2 md:flex">
            {[
              { v: count, l: plural(count, 'публикация', 'публикации', 'публикаций') },
              { v: followers, l: plural(followers, 'подписчик', 'подписчика', 'подписчиков') },
              { v: summary?.repeated ?? 0, l: 'раз повторили' },
            ].map((x) => (
              <div key={x.l} className="card flex flex-col justify-center px-3 py-2 text-center md:min-w-[120px]">
                <dd className="text-lg leading-6 font-bold">{num(x.v)}</dd>
                <dt className="text-xs">{x.l}</dt>
              </div>
            ))}
            {/* у себя на компьютере — подробная статистика */}
            {mine && (
              <Link
                to="/stats"
                className="card flex flex-col items-center justify-center gap-0.5 px-3 py-2 text-center hover:bg-active max-md:hidden md:min-w-[120px]"
              >
                <BarChart3 size={20} className="text-accent" />
                <span className="text-xs font-semibold">Статистика</span>
              </Link>
            )}
          </dl>
        </section>
        {/* у себя на компьютере — тема и правила сразу под шапкой (на телефоне — в окне за шестерёнкой) */}
        {mine && (
          <section className="mt-2 flex justify-center gap-2 max-md:hidden" aria-label="Настройки">
            <ThemeSettings />
            <RulesLink />
          </section>
        )}
      </div>
      <div className="mx-auto mt-2 w-full max-w-sm">
        <Segmented value={tab} onChange={setTab} options={tabs} />
      </div>

      <div className="mt-2">
        {tab === 'posts' &&
          (!own.list?.loaded ? (
            <MasonrySkeleton rows={2} />
          ) : posts.length ? (
            <>
              <Masonry posts={posts} source="profile" />
              <MoreLoader list={own.list} onMore={own.more} onRetry={own.retry} />
            </>
          ) : (
            <Empty icon={ImageOff}>
              {mine ? 'Вы ещё ничего не публиковали. Нажмите «Создать» и поделитесь своей идеей.' : 'Публикаций пока нет.'}
            </Empty>
          ))}
        {tab === 'tried' &&
          (!tried.list?.loaded ? (
            <MasonrySkeleton rows={2} />
          ) : tried.posts.length ? (
            <>
              <Masonry posts={tried.posts} source="profile" />
              <MoreLoader list={tried.list} onMore={tried.more} onRetry={tried.retry} />
            </>
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

      {mine && editing && <EditProfile withSettings={editing === 'all'} onClose={() => setEditing(false)} />}
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

function RulesLink() {
  return (
    <Link to="/rules" className="card flex min-h-12 items-center justify-between gap-4 px-4 text-sm font-semibold hover:bg-active">
      Правила Клубка <ChevronRight size={18} />
    </Link>
  )
}

const field = 'card w-full px-4 py-3 text-base outline-none placeholder:text-muted'

/** withSettings — с телефона (шестерёнка): ниже профиля ещё тема, правила и «Выйти» */
function EditProfile({ onClose, withSettings }: { onClose: () => void; withSettings?: boolean }) {
  const { me, updateProfile, signOut } = useStore()
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
    <Sheet open onClose={onClose} title={withSettings ? 'Профиль и настройки' : 'Профиль'}>
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
      {withSettings && (
        <div className="mt-2 flex flex-col gap-3">
          <ThemeSettings label />
          <Link
            to="/notifications?settings=1"
            onClick={onClose}
            className="card flex min-h-12 items-center justify-between gap-4 px-4 text-sm font-semibold hover:bg-active"
          >
            <span className="inline-flex items-center gap-2">
              <Bell size={18} /> Уведомления
            </span>
            <ChevronRight size={18} />
          </Link>
          <RulesLink />
          <Button kind="neutral" icon={LogOut} onClick={() => signOut()}>
            Выйти
          </Button>
        </div>
      )}
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
