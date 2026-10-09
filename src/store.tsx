import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AiMeta, Folder, Img, Post, PostType, Reply, Topic, Try, User } from './data/types'
import { PUBLIC_QUERIES, canonical, restGet, supabase } from './supabase'

/**
 * Состояние сайта. Данные — в базе Supabase, тема оформления — в браузере.
 * Действия сразу меняют экран, а затем сохраняются в базе; при ошибке — сообщение и перезагрузка своих данных.
 */

export type ThemeMode = 'system' | 'light' | 'dark'

/** Новый пост: что заполняет автор */
export interface NewPost {
  type: PostType
  /** 1–5 категорий */
  topics: Topic[]
  title: string
  images: Img[]
}

interface Store {
  /** загрузка закончена: общие данные есть и известно, вошёл ли человек */
  ready: boolean
  /** общие данные (лента, авторы, отзывы) есть — из прошлого захода или уже загружены */
  loaded: boolean
  /** известно, вошёл ли человек */
  authReady: boolean
  /** свои данные (папки, подписки) загружены; гостю — сразу, как только известно, что он гость */
  mineReady: boolean
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
  theme: ThemeMode
  user: (id: string) => User
  post: (id: string) => Post | undefined
  triesOf: (postId: string) => Try[]
  repliesOf: (tryId: string) => Reply[]
  toggleFollow: (userId: string) => void
  addPost: (p: NewPost) => Promise<string>
  /** только что опубликованная идея — пару секунд подсвечена в списке */
  fresh: string | null
  /** удалить свою идею (вместе с отзывами и картинками); не вышло — исключение Rejected */
  deletePost: (id: string) => Promise<void>
  /** загрузить своё фото в хранилище (сразу после выбора) */
  uploadImg: (img: Img) => Promise<Img>
  /** проверить загруженную картинку по правилам; нет связи или старая функция — исключение */
  /** topics — категории, которые ИИ подобрал по картинке (до 5), title — название, которое он предлагает */
  checkImg: (
    img: Img,
    purpose: 'post' | 'avatar',
  ) => Promise<{ ok: boolean; reasons: string[]; topics: string[]; title: string; timing?: Record<string, number> }>
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
  ai_text: string | null
  ai_meta: AiMeta | null
  checked_by_ai: boolean
  /** категории (до обновления 007 — только topic) */
  topics?: string[]
  saves_count?: number
  hidden?: boolean
  hidden_reason?: string | null
  views_count?: number
  clicks_count?: number
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
  topics: r.topics?.length ? r.topics : [r.topic],
  title: r.title,
  authorId: r.author_id,
  createdAt: Date.parse(r.created_at),
  images: r.images,
  saves: r.saves_count ?? 0,
  hidden: r.hidden ? r.hidden_reason || 'Нарушает правила' : undefined,
  stats: { views: r.views_count ?? 0, clicks: r.clicks_count ?? 0 },
  tags: [...r.tags, ...(r.ai_tags ?? [])],
  ai: { tags: r.ai_tags ?? [], text: r.ai_text ?? '', checked: !!r.checked_by_ai, meta: r.ai_meta ?? null },
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

type PublicRows = [ProfileRow[], PostRow[], TryRow[], ReplyRow[]]
/** Последние загруженные лента, авторы и отзывы — при следующем заходе показываем сразу, а свежие подгружаем следом */
const CACHE = 'klubok.data.v1'
function loadCache(): PublicRows | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE) ?? 'null')
    return Array.isArray(v) && v.length === 4 && v.every(Array.isArray) ? (v as PublicRows) : null
  } catch {
    return null
  }
}
function saveCache(rows: PublicRows) {
  try {
    localStorage.setItem(CACHE, JSON.stringify(rows))
  } catch {
    /* места нет или запрещено — не страшно */
  }
}

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
  const [cached] = useState(loadCache)
  // данные есть (из прошлого захода или уже загружены)
  const [loaded, setLoaded] = useState(!!cached)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [uid, setUid] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [authKnown, setAuthKnown] = useState(false)
  const [users, setUsers] = useState<User[]>(() => cached?.[0].map(toUser) ?? [])
  const [posts, setPosts] = useState<Post[]>(() => cached?.[1].map(toPost) ?? [])
  const [tries, setTries] = useState<Try[]>(() => cached?.[2].map(toTry) ?? [])
  const [replies, setReplies] = useState<Reply[]>(() => cached?.[3].map(toReply) ?? [])
  const [folders, setFolders] = useState<Folder[]>([])
  const [follows, setFollows] = useState<string[]>([])
  const [theme, setThemeState] = useState<ThemeMode>(loadTheme)
  const [loginOpen, setLoginOpen] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(!!recovery)
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null)
  const [fresh, setFresh] = useState<string | null>(null)

  // кто вошёл: следим за входом и выходом
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user.id ?? null)
      setEmail(session?.user.email ?? '')
      setAuthKnown(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // общие данные: авторы, посты, отзывы. Грузятся сразу, не дожидаясь проверки входа (они одинаковы для всех).
  // Лента показывается, как только есть авторы, посты и отметки; ответы на отзывы (нужны только на странице идеи) — догружаются следом.
  const loadedRef = useRef(loaded)
  useEffect(() => {
    let live = true
    const rows: PublicRows = cached ? [...cached] : [[], [], [], []]
    let main = false
    let rest = false
    const remember = () => main && rest && saveCache(rows)
    Promise.all([restGet<ProfileRow[]>(PUBLIC_QUERIES[0]), restGet<PostRow[]>(PUBLIC_QUERIES[1]), restGet<TryRow[]>(PUBLIC_QUERIES[2])])
      .then(([u, p, t]) => {
        if (!live) return
        setUsers(u.map(toUser))
        setPosts(p.map(toPost))
        setTries(t.map(toTry))
        rows[0] = u
        rows[1] = p
        rows[2] = t
        main = true
        remember()
        setFailed(false)
        setLoaded(true)
        loadedRef.current = true
      })
      // показываем прошлые данные — ошибку обновления не показываем
      .catch(() => live && !loadedRef.current && setFailed(true))
    restGet<ReplyRow[]>(PUBLIC_QUERIES[3])
      .then((r) => {
        if (!live) return
        setReplies(r.map(toReply))
        rows[3] = r
        rest = true
        remember()
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [attempt, cached])

  // вошёл человек, которого нет среди авторов (только что зарегистрировался) — подгружаем профили ещё раз
  const askedProfile = useRef<string | null>(null)
  useEffect(() => {
    if (!uid || !loaded || users.some((u) => u.id === uid) || askedProfile.current === uid) return
    askedProfile.current = uid
    restGet<ProfileRow[]>(PUBLIC_QUERIES[0])
      .then((u) => setUsers(u.map(toUser)))
      .catch(() => {})
  }, [uid, loaded, users])

  // свои данные: папки, подписки
  const [mineAttempt, setMineAttempt] = useState(0)
  const [mineFor, setMineFor] = useState<string | null>(null)
  useEffect(() => {
    if (!uid) {
      setFolders([])
      setFollows([])
      return
    }
    let live = true
    Promise.all([
      supabase.from('folders').select('id, name').order('created_at'),
      supabase.from('folder_items').select('folder_id, post_id, done').order('added_at', { ascending: false }),
      supabase.from('follows').select('following_id').eq('follower_id', uid),
    ])
      .then(([f, fi, fo]) => {
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
        setMineFor(uid)
        // свои скрытые идеи: в общей ленте их нет (видит только автор) — добавляем, чтобы автор видел их и причину
        supabase
          .from('posts')
          .select('*')
          .eq('author_id', uid)
          .eq('hidden', true)
          .then(({ data }) => {
            if (!live || !data?.length) return
            const mine = (data as PostRow[]).map(toPost)
            setPosts((ps) => [...mine, ...ps.filter((p) => !mine.some((m) => m.id === p.id))])
          })
      })
      .catch(() => {
        if (!live) return
        setNotice('Не удалось загрузить ваши папки. Обновите страницу.')
        setMineFor(uid)
      })
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
    // имя файла всегда новое — браузер может хранить картинку у себя год и не переспрашивать
    check(await supabase.storage.from('images').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }))
    return { src: canonical(supabase.storage.from('images').getPublicUrl(path).data.publicUrl), ratio: img.ratio }
  }

  /** счётчик «в избранном» на сайте сразу, не дожидаясь базы (в базе его считает сама база) */
  const bumpSaves = (pid: string, d: number) =>
    setPosts((ps) => ps.map((p) => (p.id === pid ? { ...p, saves: Math.max(0, p.saves + d) } : p)))

  const value: Store = {
    // проверка входа идёт одновременно с загрузкой данных, ждём обе — чтобы не мигала кнопка «Войти»
    ready: loaded && authKnown,
    loaded,
    authReady: authKnown,
    mineReady: authKnown && (!uid || mineFor === uid),
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
    uploadImg: (img) => upload(img),
    checkImg: async (img, purpose) => {
      const { data, error } = await supabase.functions.invoke('publish', { body: { action: 'check-image', img, purpose } })
      if (error || typeof data?.ok !== 'boolean') throw new Error('проверка недоступна')
      return {
        ok: data.ok,
        reasons: data.reasons ?? [],
        topics: Array.isArray(data.topics) ? data.topics : [],
        title: typeof data.title === 'string' ? data.title : '',
        timing: data.timing,
      }
    },
    addPost: async (data) => {
      if (!uid) throw new Error('not signed in')
      const images = await Promise.all(data.images.map(upload))
      const p = toPost((await publish({ action: 'post', type: data.type, topics: data.topics, title: data.title, images })) as PostRow)
      setPosts((ps) => [p, ...ps])
      setFresh(p.id)
      setTimeout(() => setFresh((f) => (f === p.id ? null : f)), 3000)
      return p.id
    },
    fresh,
    deletePost: async (id) => {
      await publish({ action: 'delete-post', postId: id })
      setPosts((ps) => ps.filter((p) => p.id !== id))
      setTries((ts) => ts.filter((t) => t.postId !== id))
      setFolders((fs) => fs.map((f) => ({ ...f, postIds: f.postIds.filter((x) => x !== id), done: f.done.filter((x) => x !== id) })))
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
      if (!folders.some((f) => f.postIds.includes(pid))) bumpSaves(pid, 1)
      setFolders((fs) => fs.map((f) => (f.id === fid && !f.postIds.includes(pid) ? { ...f, postIds: [pid, ...f.postIds] } : f)))
      save(supabase.from('folder_items').upsert({ folder_id: fid, post_id: pid }, { ignoreDuplicates: true }))
    },
    unsaveFrom: (fid, pid) => {
      if (needLogin()) return
      if (!folders.some((f) => f.id !== fid && f.postIds.includes(pid)) && folders.some((f) => f.id === fid && f.postIds.includes(pid)))
        bumpSaves(pid, -1)
      setFolders((fs) =>
        fs.map((f) => (f.id === fid ? { ...f, postIds: f.postIds.filter((x) => x !== pid), done: f.done.filter((x) => x !== pid) } : f)),
      )
      save(supabase.from('folder_items').delete().eq('folder_id', fid).eq('post_id', pid))
    },
    createFolder: (name, pid) => {
      if (needLogin()) return ''
      const id = crypto.randomUUID()
      if (pid && !folders.some((f) => f.postIds.includes(pid))) bumpSaves(pid, 1)
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
