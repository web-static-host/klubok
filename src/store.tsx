import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Folder, Img, Post, PostType, Reply, Topic, Try, User } from './data/types'
import { supabase } from './supabase'

/**
 * Состояние сайта. Данные — в базе Supabase, тема оформления — в браузере.
 * Действия сразу меняют экран, а затем сохраняются в базе; при ошибке — сообщение и перезагрузка своих данных.
 */

export type ThemeMode = 'system' | 'light' | 'dark'

/** Новый пост: что заполняет автор */
export interface NewPost {
  type: PostType
  topic: Topic
  title: string
  images: Img[]
}

interface Store {
  /** загрузка закончена */
  ready: boolean
  /** не удалось загрузить данные */
  failed: boolean
  retry: () => void
  /** вошёл ли пользователь */
  authed: boolean
  email: string
  me: User
  users: User[]
  posts: Post[]
  tries: Try[]
  replies: Reply[]
  folders: Folder[]
  follows: string[]
  likes: string[]
  theme: ThemeMode
  user: (id: string) => User
  post: (id: string) => Post | undefined
  triesOf: (postId: string) => Try[]
  repliesOf: (tryId: string) => Reply[]
  toggleFollow: (userId: string) => void
  toggleLike: (postId: string) => void
  addPost: (p: NewPost) => Promise<string>
  addTry: (postId: string, ok: boolean, text?: string, img?: Img) => Promise<void>
  /** ответ на отзыв; гостю — окно входа */
  addReply: (tryId: string, text: string) => Promise<void>
  saveTo: (folderId: string, postId: string) => void
  unsaveFrom: (folderId: string, postId: string) => void
  createFolder: (name: string, postId?: string) => string
  toggleDone: (folderId: string, postId: string) => void
  savedIn: (postId: string) => Folder[]
  setTheme: (t: ThemeMode) => void
  /** вход: письмо со ссылкой; вернёт текст ошибки или null */
  /** вход, регистрация, «забыли пароль», новый пароль; вернут текст ошибки или null */
  signIn: (email: string, password: string) => Promise<string | null>
  /** 'confirm' — нужно подтвердить почту по письму */
  signUp: (email: string, password: string, name: string, handle: string) => Promise<string | 'confirm' | null>
  resetPassword: (email: string) => Promise<string | null>
  setPassword: (password: string) => Promise<string | null>
  /** окно «Новый пароль» после ссылки из письма */
  recoveryOpen: boolean
  setRecoveryOpen: (v: boolean) => void
  signOut: () => Promise<void>
  /** изменить свой профиль; вернёт текст ошибки или null */
  /** avatar: не передан — без изменений, null — убрать фото, картинка — новое фото */
  updateProfile: (p: Pick<User, 'name' | 'handle' | 'bio'> & { avatar?: Img | null }) => Promise<string | null>
  /** окно входа: открывается, когда гость пытается что-то сделать */
  loginOpen: boolean
  setLoginOpen: (v: boolean) => void
  /** сообщение для всплывашки */
  notice: string | null
  clearNotice: () => void
}

const Ctx = createContext<Store | null>(null)

const GUEST: User = { id: '', name: 'Гость', handle: '', bio: '', colors: ['#94A3B8', '#64748B'], followers: 0 }

// ─── Строки базы → типы сайта ───────────────────────────────
interface ProfileRow {
  id: string
  name: string
  handle: string
  bio: string
  colors: string[]
  avatar_url: string | null
  followers_count: number
}
interface PostRow {
  id: string
  author_id: string
  type: PostType
  topic: string
  title: string
  images: Img[]
  tags: string[]
  ai_tags: string[]
  likes_count: number
  created_at: string
}
interface TryRow {
  id: string
  post_id: string
  user_id: string
  ok: boolean
  text: string | null
  img: Img | null
  created_at: string
}

const toUser = (r: ProfileRow): User => ({
  id: r.id,
  name: r.name || r.handle,
  handle: r.handle,
  bio: r.bio,
  colors: [r.colors[0] ?? GUEST.colors[0], r.colors[1] ?? GUEST.colors[1]],
  avatar: r.avatar_url ?? undefined,
  followers: r.followers_count,
})
const toPost = (r: PostRow): Post => ({
  id: r.id,
  type: r.type === 'beforeafter' ? 'beforeafter' : 'photo',
  topic: r.topic,
  title: r.title,
  authorId: r.author_id,
  createdAt: Date.parse(r.created_at),
  images: r.images,
  likes: r.likes_count,
  tags: [...r.tags, ...(r.ai_tags ?? [])],
})
interface ReplyRow {
  id: string
  try_id: string
  user_id: string
  text: string
  created_at: string
}
const toReply = (r: ReplyRow): Reply => ({
  id: r.id,
  tryId: r.try_id,
  userId: r.user_id,
  text: r.text,
  createdAt: Date.parse(r.created_at),
})

const toTry = (r: TryRow): Try => ({
  id: r.id,
  postId: r.post_id,
  userId: r.user_id,
  ok: r.ok,
  text: r.text ?? undefined,
  img: r.img ?? undefined,
  createdAt: Date.parse(r.created_at),
})

/** Ошибка запроса → исключение */
function check<T extends { error: unknown }>(res: T): T {
  if (res.error) throw res.error
  return res
}

/** Отказ проверки: причины — для показа пользователю */
export class Rejected extends Error {
  reasons: string[]
  constructor(reasons: string[]) {
    super(reasons.join('; '))
    this.reasons = reasons
  }
}

/** Всё, что пишут пользователи, уходит в серверную функцию publish: там проверка правил (в том числе ИИ) и запись в базу */
async function publish(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('publish', { body })
  if (error) {
    let reasons: string[] | undefined
    try {
      reasons = (await (error as { context?: Response }).context?.json())?.reasons
    } catch {
      /* ответа нет — нет связи */
    }
    throw new Rejected(reasons ?? ['Не получилось отправить. Проверьте интернет и попробуйте ещё раз.'])
  }
  if (!data?.ok) throw new Rejected(data?.reasons ?? ['Не получилось отправить'])
  return data.row
}

/** Ошибки входа — по-русски */
function authError(e: { code?: string; status?: number; message: string }): string {
  switch (e.code) {
    case 'invalid_credentials':
      return 'Неверная почта или пароль'
    case 'user_already_exists':
    case 'email_exists':
      return 'Эта почта уже зарегистрирована — войдите'
    case 'weak_password':
      return 'Пароль слишком простой: нужно не меньше 8 символов'
    case 'email_not_confirmed':
      return 'Почта не подтверждена — откройте ссылку из письма'
    case 'email_address_invalid':
      return 'Проверьте адрес почты'
    case 'same_password':
      return 'Новый пароль совпадает со старым'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Слишком много попыток. Подождите немного и попробуйте снова'
  }
  if (e.status === 429) return 'Слишком много попыток. Подождите немного и попробуйте снова'
  return 'Не получилось. Проверьте данные и попробуйте ещё раз'
}

function loadTheme(): ThemeMode {
  try {
    const t = localStorage.getItem('klubok.theme')
    if (t === 'light' || t === 'dark' || t === 'system') return t
  } catch {
    /* браузер без хранилища */
  }
  return 'system'
}

export function StoreProvider({
  children,
  initialNotice,
  recovery,
}: {
  children: ReactNode
  initialNotice?: string | null
  /** пришли по ссылке «забыли пароль» */
  recovery?: boolean
}) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [uid, setUid] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [authKnown, setAuthKnown] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [tries, setTries] = useState<Try[]>([])
  const [replies, setReplies] = useState<Reply[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [follows, setFollows] = useState<string[]>([])
  const [likes, setLikes] = useState<string[]>([])
  const [theme, setThemeState] = useState<ThemeMode>(loadTheme)
  const [loginOpen, setLoginOpen] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(!!recovery)
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null)

  // кто вошёл: следим за входом и выходом
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user.id ?? null)
      setEmail(session?.user.email ?? '')
      setAuthKnown(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // общие данные: авторы, посты, отзывы. Перезагружаем и при входе — чтобы появился свой профиль.
  useEffect(() => {
    if (!authKnown) return
    let live = true
    Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('tries').select('*').order('created_at', { ascending: false }).limit(5000),
      supabase.from('try_replies').select('*').order('created_at').limit(10000),
    ])
      .then(([u, p, t, r]) => {
        if (!live) return
        setUsers((check(u).data as ProfileRow[]).map(toUser))
        setPosts((check(p).data as PostRow[]).map(toPost))
        setTries((check(t).data as TryRow[]).map(toTry))
        // ответов может не быть, пока в базе не запущено обновление 002 — сайт работает и без них
        setReplies(r.error ? [] : (r.data as ReplyRow[]).map(toReply))
        setFailed(false)
        setReady(true)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [authKnown, uid, attempt])

  // свои данные: папки, подписки, лайки
  const [mineAttempt, setMineAttempt] = useState(0)
  useEffect(() => {
    if (!uid) {
      setFolders([])
      setFollows([])
      setLikes([])
      return
    }
    let live = true
    Promise.all([
      supabase.from('folders').select('id, name').order('created_at'),
      supabase.from('folder_items').select('folder_id, post_id, done').order('added_at', { ascending: false }),
      supabase.from('follows').select('following_id').eq('follower_id', uid),
      supabase.from('likes').select('post_id').eq('user_id', uid),
    ])
      .then(([f, fi, fo, l]) => {
        if (!live) return
        const items = check(fi).data as { folder_id: string; post_id: string; done: boolean }[]
        setFolders(
          (check(f).data as { id: string; name: string }[]).map((x) => ({
            id: x.id,
            name: x.name,
            postIds: items.filter((i) => i.folder_id === x.id).map((i) => i.post_id),
            done: items.filter((i) => i.folder_id === x.id && i.done).map((i) => i.post_id),
          })),
        )
        setFollows((check(fo).data as { following_id: string }[]).map((x) => x.following_id))
        setLikes((check(l).data as { post_id: string }[]).map((x) => x.post_id))
      })
      .catch(() => live && setNotice('Не удалось загрузить ваши папки. Обновите страницу.'))
    return () => {
      live = false
    }
  }, [uid, mineAttempt])

  // тема
  useEffect(() => {
    try {
      localStorage.setItem('klubok.theme', theme)
    } catch {
      /* запрещено — не страшно */
    }
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const me: User = (uid && usersById.get(uid)) || (uid ? { ...GUEST, id: uid, name: email.split('@')[0] } : GUEST)

  const user = useCallback((id: string) => usersById.get(id) ?? { ...GUEST, id, name: 'Автор' }, [usersById])
  const post = useCallback((id: string) => posts.find((p) => p.id === id), [posts])
  const triesOf = useCallback(
    (postId: string) => tries.filter((t) => t.postId === postId).sort((a, b) => b.createdAt - a.createdAt),
    [tries],
  )
  const repliesOf = useCallback((tryId: string) => replies.filter((r) => r.tryId === tryId), [replies])

  /** Сохранение в базе; при ошибке — сообщение и свежие данные с сервера */
  const save = (req: PromiseLike<{ error: unknown }>) => {
    Promise.resolve(req)
      .then(check)
      .catch(() => {
        setNotice('Не получилось сохранить. Проверьте интернет и попробуйте ещё раз.')
        setMineAttempt((n) => n + 1)
        setAttempt((n) => n + 1)
      })
  }

  /** Гость → окно входа */
  const needLogin = () => {
    if (uid) return false
    setLoginOpen(true)
    return true
  }

  /** Своё фото (data:URL) → файл в хранилище images/<id>/…; готовые адреса — как есть */
  const upload = async (img: Img): Promise<Img> => {
    if (!img.src?.startsWith('data:')) return img
    const blob = await (await fetch(img.src)).blob()
    const path = `${uid}/${crypto.randomUUID()}.jpg`
    check(await supabase.storage.from('images').upload(path, blob, { contentType: 'image/jpeg' }))
    return { src: supabase.storage.from('images').getPublicUrl(path).data.publicUrl, ratio: img.ratio }
  }

  const value: Store = {
    ready,
    failed,
    retry: () => setAttempt((n) => n + 1),
    authed: !!uid,
    email,
    me,
    users,
    posts,
    tries,
    replies,
    folders,
    follows,
    likes,
    theme,
    user,
    post,
    triesOf,
    repliesOf,
    toggleFollow: (id) => {
      if (needLogin()) return
      const on = follows.includes(id)
      setFollows((f) => (on ? f.filter((x) => x !== id) : [...f, id]))
      setUsers((us) => us.map((u) => (u.id === id ? { ...u, followers: Math.max(0, u.followers + (on ? -1 : 1)) } : u)))
      save(
        on
          ? supabase.from('follows').delete().eq('follower_id', uid).eq('following_id', id)
          : supabase.from('follows').insert({ follower_id: uid, following_id: id }),
      )
    },
    toggleLike: (id) => {
      if (needLogin()) return
      const on = likes.includes(id)
      setLikes((l) => (on ? l.filter((x) => x !== id) : [...l, id]))
      setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, likes: Math.max(0, p.likes + (on ? -1 : 1)) } : p)))
      save(
        on
          ? supabase.from('likes').delete().eq('user_id', uid).eq('post_id', id)
          : supabase.from('likes').insert({ user_id: uid, post_id: id }),
      )
    },
    addPost: async (data) => {
      if (!uid) throw new Error('not signed in')
      const images = await Promise.all(data.images.map(upload))
      const p = toPost((await publish({ action: 'post', type: data.type, topic: data.topic, title: data.title, images })) as PostRow)
      setPosts((ps) => [p, ...ps])
      return p.id
    },
    addTry: async (postId, ok, text, img) => {
      if (!uid) throw new Error('not signed in')
      const row = await publish({ action: 'try', postId, ok, text: text ?? '', img: img ? await upload(img) : undefined })
      setTries((ts) => [toTry(row as TryRow), ...ts])
    },
    addReply: async (tryId, text) => {
      if (!uid) {
        setLoginOpen(true)
        throw new Error('not signed in')
      }
      const r = toReply((await publish({ action: 'reply', tryId, text })) as ReplyRow)
      setReplies((rs) => [...rs, r])
    },
    saveTo: (fid, pid) => {
      if (needLogin()) return
      setFolders((fs) => fs.map((f) => (f.id === fid && !f.postIds.includes(pid) ? { ...f, postIds: [pid, ...f.postIds] } : f)))
      save(supabase.from('folder_items').upsert({ folder_id: fid, post_id: pid }, { ignoreDuplicates: true }))
    },
    unsaveFrom: (fid, pid) => {
      if (needLogin()) return
      setFolders((fs) =>
        fs.map((f) => (f.id === fid ? { ...f, postIds: f.postIds.filter((x) => x !== pid), done: f.done.filter((x) => x !== pid) } : f)),
      )
      save(supabase.from('folder_items').delete().eq('folder_id', fid).eq('post_id', pid))
    },
    createFolder: (name, pid) => {
      if (needLogin()) return ''
      const id = crypto.randomUUID()
      setFolders((fs) => [...fs, { id, name, postIds: pid ? [pid] : [], done: [] }])
      save(
        supabase
          .from('folders')
          .insert({ id, owner_id: uid, name })
          .then((r) => (r.error || !pid ? r : supabase.from('folder_items').insert({ folder_id: id, post_id: pid }))),
      )
      return id
    },
    toggleDone: (fid, pid) => {
      if (needLogin()) return
      const done = !folders.find((f) => f.id === fid)?.done.includes(pid)
      setFolders((fs) => fs.map((f) => (f.id === fid ? { ...f, done: done ? [...f.done, pid] : f.done.filter((x) => x !== pid) } : f)))
      save(supabase.from('folder_items').update({ done }).eq('folder_id', fid).eq('post_id', pid))
    },
    savedIn: (pid) => folders.filter((f) => f.postIds.includes(pid)),
    setTheme: setThemeState,
    signIn: async (address, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email: address, password })
      return error ? authError(error) : null
    },
    signUp: async (address, password, name, handle) => {
      // имя и ник: сначала проверка правил и занятости ника, потом регистрация
      try {
        await publish({ action: 'check-profile', name, handle })
      } catch (e) {
        return e instanceof Rejected ? e.reasons.join('. ') : 'Не получилось проверить имя и ник'
      }
      const { data, error } = await supabase.auth.signUp({
        email: address,
        password,
        options: { emailRedirectTo: window.location.origin + window.location.pathname, data: { name, handle } },
      })
      if (error) return authError(error)
      return data.session ? null : 'confirm'
    },
    resetPassword: async (address) => {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: window.location.origin + window.location.pathname,
      })
      return error ? authError(error) : null
    },
    setPassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password })
      return error ? authError(error) : null
    },
    recoveryOpen,
    setRecoveryOpen,
    signOut: async () => {
      await supabase.auth.signOut()
    },
    updateProfile: async (p) => {
      if (!uid) return 'Нужно войти'
      let row: ProfileRow
      try {
        const avatar = p.avatar === undefined ? undefined : p.avatar === null ? null : await upload(p.avatar)
        row = (await publish({ action: 'profile', name: p.name, handle: p.handle, bio: p.bio, avatar })) as ProfileRow
      } catch (e) {
        return e instanceof Rejected ? e.reasons.join('. ') : 'Не получилось сохранить'
      }
      setUsers((us) => us.map((u) => (u.id === uid ? toUser(row) : u)))
      return null
    },
    loginOpen,
    setLoginOpen,
    notice,
    clearNotice: () => setNotice(null),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('StoreProvider missing')
  return v
}
