import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AiMeta, Folder, Img, Notice, NoticeSettings, Post, PostType, Reply, ReportTarget, Topic, Try, User } from './data/types'
import { anonId, canonical, daySeed, restGet, supabase } from './supabase'
import { localCopy, shrink } from './lib'

/**
 * Состояние сайта. Данные — в базе Supabase, тема оформления — в браузере.
 * Идеи, авторы и отзывы подгружаются порциями — по мере надобности (лента, профиль, поиск, страница идеи),
 * всё загруженное складывается в общие справочники (postMap, userMap), списки хранят только порядок (lists).
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

/** Сколько идей в одной порции */
export const PAGE = 30

/** Список идей, подгружаемый порциями: порядок и состояние загрузки */
export interface PagedList {
  ids: string[]
  /** больше нечего подгружать */
  done: boolean
  loading: boolean
  error: boolean
  /** первая порция уже есть (или показана из прошлого захода) */
  loaded: boolean
}
/** Порция идей: с какого места и сколько */
export type Loader = (offset: number, limit: number) => Promise<PostRow[]>

/** Скрытая в этот заход идея: варианты «Что не так?» (null — ещё не пришли) и ответ */
export interface HiddenNow {
  options: string[] | null
  answer?: string
}

/** Ключ ленты «Для вас»: у каждого человека своя (по интересам), с категорией — отдельный список */
export const homeKey = (topic: string | null, uid: string | null) => `home:${uid ?? 'guest'}:${topic ?? 'all'}`

interface Store {
  /** известно, вошёл ли человек */
  authReady: boolean
  /** свои данные (папки, подписки) загружены; гостю — сразу, как только известно, что он гость */
  mineReady: boolean
  /** вошёл ли пользователь */
  authed: boolean
  email: string
  me: User
  folders: Folder[]
  follows: string[]
  theme: ThemeMode
  user: (id: string) => User
  /** профиль уже загружен */
  hasUser: (id: string) => boolean
  post: (id: string) => Post | undefined
  /** подгрузить недостающие идеи и профили (по id) */
  ensurePosts: (ids: string[]) => void
  ensureUsers: (ids: string[]) => void
  /** идеи из базы → в справочник (и их авторов) */
  addPostRows: (rows: PostRow[]) => void
  /** профили из базы → в справочник */
  addUserRows: (rows: ProfileRow[]) => void

  // ─── списки порциями ───
  lists: Record<string, PagedList>
  /** следующая порция (reset — заново с начала) */
  loadMore: (key: string, loader: Loader, reset?: boolean) => void
  /** порядок ленты «Для вас» на этот заход (тот же — при подгрузке следующих порций) */
  feedSeed: string

  // ─── отзывы ───
  /** отзывы к идее; undefined — ещё не загружены */
  triesOf: (postId: string) => Try[] | undefined
  repliesOf: (tryId: string) => Reply[]
  loadTries: (postId: string) => void

  toggleFollow: (userId: string) => void
  addPost: (p: NewPost) => Promise<string>
  /** только что опубликованная идея — пару секунд подсвечена в списке */
  fresh: string | null
  /** удалить свою идею (вместе с отзывами и картинками); не вышло — исключение Rejected */
  deletePost: (id: string) => Promise<void>
  /** загрузить своё фото в хранилище (сразу после выбора) */
  uploadImg: (img: Img, withThumb?: boolean) => Promise<Img>
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

  // ─── «Не интересно» и жалобы ───
  notInterested: Set<string>
  /** скрытые в этот заход: на месте карточки — «Что не так?» */
  hiddenNow: Record<string, HiddenNow>
  /** убрать идею из ленты и меньше показывать похожие (чем она отличается от того, что нравится) */
  markNotInterested: (postId: string) => void
  /** ответ «Что не так?»: признак из вариантов или 'seen' — уже попадалось */
  answerNotInterested: (postId: string, feature: string) => void
  undoNotInterested: (postId: string) => void
  /** пожаловаться; вернёт null, 'already' (уже жаловались) или текст ошибки */
  report: (type: ReportTarget, id: string, reason: string, comment: string, link: string) => Promise<null | 'already' | string>

  // ─── уведомления ───
  notices: Notice[]
  unread: number
  noticesLoaded: boolean
  loadNotices: () => void
  markNoticesRead: () => void
  noticeSettings: NoticeSettings
  saveNoticeSettings: (patch: Partial<NoticeSettings>) => void

  setTheme: (t: ThemeMode) => void
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
const DEFAULT_SETTINGS: NoticeSettings = { tried: true, reply: true, follower: true, saves: 'daily', moderation: true }

// ─── Строки базы → типы сайта ───────────────────────────────
export interface ProfileRow {
  id: string
  name: string
  handle: string
  bio: string
  colors: string[]
  avatar_url: string | null
  followers_count: number
}
export interface PostRow {
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
  tries_count?: number
  tries_ok_count?: number
  hidden?: boolean
  hidden_reason?: string | null
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
interface ReplyRow {
  id: string
  try_id: string
  user_id: string
  text: string
  created_at: string
}
interface NoticeRow {
  id: string
  kind: string
  actor_id: string | null
  post_id: string | null
  try_id: string | null
  data: Record<string, unknown> | null
  read: boolean
  created_at: string
}

const toUser = (r: ProfileRow): User => ({
  id: r.id,
  name: r.name || r.handle,
  handle: r.handle,
  bio: r.bio,
  colors: [r.colors?.[0] ?? GUEST.colors[0], r.colors?.[1] ?? GUEST.colors[1]],
  avatar: r.avatar_url ?? undefined,
  followers: r.followers_count,
})
export const toPost = (r: PostRow): Post => ({
  id: r.id,
  type: r.type === 'beforeafter' ? 'beforeafter' : 'photo',
  topics: r.topics?.length ? r.topics : [r.topic],
  title: r.title,
  authorId: r.author_id,
  createdAt: Date.parse(r.created_at),
  images: r.images,
  saves: r.saves_count ?? 0,
  tries: r.tries_count ?? 0,
  triesOk: r.tries_ok_count ?? 0,
  hidden: r.hidden ? r.hidden_reason || 'Нарушает правила' : undefined,
  tags: [...r.tags, ...(r.ai_tags ?? [])],
  ai: { tags: r.ai_tags ?? [], text: r.ai_text ?? '', checked: !!r.checked_by_ai, meta: r.ai_meta ?? null },
})
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
const toNotice = (r: NoticeRow): Notice => ({
  id: r.id,
  kind: r.kind,
  actorId: r.actor_id ?? undefined,
  postId: r.post_id ?? undefined,
  tryId: r.try_id ?? undefined,
  data: r.data ?? {},
  read: r.read,
  createdAt: Date.parse(r.created_at),
})

// ─── Запомненное в браузере ─────────────────────────────────
/** Первая порция ленты «Для вас» и её авторы — при следующем заходе показываем сразу, свежие подгружаем следом */
const CACHE = 'klubok.data.v2'
interface Cached {
  /** чья это лента (гость — null) */
  uid: string | null
  seed: string
  at: number
  posts: PostRow[]
  users: ProfileRow[]
}
function loadCache(): Cached | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE) ?? 'null')
    return v && Array.isArray(v.posts) && Array.isArray(v.users) && typeof v.seed === 'string' ? (v as Cached) : null
  } catch {
    return null
  }
}
function saveJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* места нет или запрещено — не страшно */
  }
}
/** «Не интересно» у гостя: в базе — по номеру браузера, здесь — чтобы сразу убрать из ленты */
const GUEST_NI = 'klubok.notInterested'
/** старые «Не интересно» гостя (до 10 октября были только в браузере) уже отправлены в базу */
const GUEST_NI_SYNCED = 'klubok.notInterested.synced'
function loadGuestNi(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(GUEST_NI) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(-500) : []
  } catch {
    return []
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
export async function publish(body: Record<string, unknown>): Promise<unknown> {
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

/** id вошедшего из запомненного браузером входа — без ожидания проверки (чтобы сразу показать своё) */
function bootUid(): string | null {
  try {
    const ref = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0]
    const s = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) ?? 'null')
    return typeof s?.user?.id === 'string' ? s.user.id : null
  } catch {
    return null
  }
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

const uniq = (ids: string[]) => [...new Set(ids.filter(Boolean))]
const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

/** Справочник: только изменившиеся записи — новый объект (иначе тот же — без лишней перерисовки) */
function merge<T>(map: Record<string, T>, items: [string, T][]): Record<string, T> {
  if (!items.length) return map
  const next = { ...map }
  for (const [k, v] of items) next[k] = v
  return next
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
  // кто вошёл — сразу из запомненного браузером входа (проверка входа подтвердит или сбросит)
  const [uid, setUid] = useState<string | null>(bootUid)
  const [email, setEmail] = useState('')
  const [authKnown, setAuthKnown] = useState(false)
  const [userMap, setUserMap] = useState<Record<string, User>>(() =>
    Object.fromEntries((cached?.users ?? []).map((r) => [r.id, toUser(r)])),
  )
  const [postMap, setPostMap] = useState<Record<string, Post>>(() =>
    Object.fromEntries((cached?.posts ?? []).map((r) => [r.id, toPost(r)])),
  )
  // порядок ленты «Для вас»: пока запомненная лента свежая (до 6 часов) — тот же, чтобы она не перемешивалась; иначе — порядок дня
  // (его же index.html начинает загружать заранее)
  const [feedSeed] = useState(() => (cached && Date.now() - cached.at < 6 * 3600_000 ? cached.seed : daySeed()))
  const [lists, setLists] = useState<Record<string, PagedList>>(() =>
    cached?.posts.length
      ? {
          [homeKey(null, cached.uid ?? null)]: {
            ids: cached.posts.map((p) => p.id),
            done: false,
            loading: false,
            error: false,
            loaded: true,
          },
        }
      : {},
  )
  const [triesMap, setTriesMap] = useState<Record<string, Try[]>>({})
  const [repliesMap, setRepliesMap] = useState<Record<string, Reply[]>>({})
  const [folders, setFolders] = useState<Folder[]>([])
  const [follows, setFollows] = useState<string[]>([])
  const [notInterested, setNotInterested] = useState<Set<string>>(() => new Set(loadGuestNi()))
  const [hiddenNow, setHiddenNow] = useState<Record<string, HiddenNow>>({})
  const [notices, setNotices] = useState<Notice[]>([])
  const [noticesLoaded, setNoticesLoaded] = useState(false)
  const [noticeSettings, setNoticeSettings] = useState<NoticeSettings>(DEFAULT_SETTINGS)
  const [theme, setThemeState] = useState<ThemeMode>(loadTheme)
  const [loginOpen, setLoginOpen] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(!!recovery)
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null)
  const [fresh, setFresh] = useState<string | null>(null)

  // свежие значения для обработчиков, которые живут дольше одной отрисовки
  const ref = useRef({ userMap, postMap, lists, triesMap, uid })
  useEffect(() => {
    ref.current = { userMap, postMap, lists, triesMap, uid }
  })

  // кто вошёл: следим за входом и выходом
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user.id ?? null)
      setEmail(session?.user.email ?? '')
      setAuthKnown(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // ─── справочники: профили и идеи ───
  const addUserRows = useCallback((rows: ProfileRow[]) => {
    setUserMap((m) =>
      merge(
        m,
        rows.map((r) => [r.id, toUser(r)]),
      ),
    )
  }, [])

  // недостающие профили собираем и спрашиваем пачкой (много карточек появляются одновременно)
  const wantUsers = useRef(new Set<string>())
  const askedUsers = useRef(new Set<string>())
  const userTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ensureUsers = useCallback(
    (ids: string[]) => {
      for (const id of ids) if (id && !ref.current.userMap[id] && !askedUsers.current.has(id)) wantUsers.current.add(id)
      if (!wantUsers.current.size || userTimer.current) return
      userTimer.current = setTimeout(() => {
        userTimer.current = null
        const all = [...wantUsers.current]
        wantUsers.current.clear()
        all.forEach((id) => askedUsers.current.add(id))
        for (const part of chunks(all, 80))
          restGet<ProfileRow[]>(`profiles?select=*&id=in.(${part.join(',')})`)
            .then(addUserRows)
            .catch(() => part.forEach((id) => askedUsers.current.delete(id)))
      }, 0)
    },
    [addUserRows],
  )

  const addPostRows = useCallback(
    (rows: PostRow[]) => {
      if (!rows.length) return
      setPostMap((m) =>
        merge(
          m,
          rows.map((r) => [r.id, toPost(r)]),
        ),
      )
      ensureUsers(rows.map((r) => r.author_id))
    },
    [ensureUsers],
  )

  const askedPosts = useRef(new Set<string>())
  const ensurePosts = useCallback(
    (ids: string[]) => {
      const need = uniq(ids).filter((id) => !ref.current.postMap[id] && !askedPosts.current.has(id))
      if (!need.length) return
      need.forEach((id) => askedPosts.current.add(id))
      for (const part of chunks(need, 80)) {
        // свои скрытые видит только автор — для вошедшего спрашиваем с его пропуском
        const q = ref.current.uid
          ? supabase
              .from('posts')
              .select('*')
              .in('id', part)
              .then((r) => check(r).data as PostRow[])
          : restGet<PostRow[]>(`posts?select=*&id=in.(${part.join(',')})`)
        Promise.resolve(q)
          .then(addPostRows)
          .catch(() => part.forEach((id) => askedPosts.current.delete(id)))
      }
    },
    [addPostRows],
  )

  // вошёл — свой профиль
  useEffect(() => {
    if (uid) ensureUsers([uid])
  }, [uid, ensureUsers])

  // ─── списки порциями ───
  const gen = useRef<Record<string, number>>({})
  const patchList = useCallback((key: string, fn: (l: PagedList) => Partial<PagedList>) => {
    setLists((all) => {
      const cur = all[key] ?? { ids: [], done: false, loading: false, error: false, loaded: false }
      const next = { ...all, [key]: { ...cur, ...fn(cur) } }
      ref.current.lists = next
      return next
    })
  }, [])

  const loadMore = useCallback(
    (key: string, loader: Loader, reset = false) => {
      const cur = ref.current.lists[key]
      if (!reset && (cur?.loading || cur?.done)) return
      const g = (gen.current[key] = (gen.current[key] ?? 0) + 1)
      const offset = reset ? 0 : (cur?.ids.length ?? 0)
      patchList(key, () => ({ loading: true, error: false }))
      loader(offset, PAGE)
        .then((rows) => {
          if (gen.current[key] !== g) return
          addPostRows(rows)
          const ids = rows.map((r) => r.id)
          patchList(key, (l) => ({
            ids: reset ? uniq(ids) : uniq([...l.ids, ...ids]),
            done: rows.length < PAGE,
            loading: false,
            loaded: true,
          }))
          // первая порция ленты «Для вас» — запоминаем для следующего захода (вместе с авторами)
          if (key === homeKey(null, ref.current.uid) && offset === 0) {
            const authors = uniq(rows.map((r) => r.author_id))
            const users = authors
              .map((id) => ref.current.userMap[id])
              .filter(Boolean)
              .map((u) => ({
                id: u.id,
                name: u.name,
                handle: u.handle,
                bio: u.bio,
                colors: u.colors,
                avatar_url: u.avatar ?? null,
                followers_count: u.followers,
              }))
            saveJson(CACHE, { uid: ref.current.uid, seed: feedSeed, at: Date.now(), posts: rows, users } satisfies Cached)
          }
        })
        .catch(() => {
          if (gen.current[key] !== g) return
          patchList(key, () => ({ loading: false, error: true }))
        })
    },
    [addPostRows, patchList, feedSeed],
  )

  /** убрать идею из всех списков (удалили, «не интересно») */
  const dropFromLists = useCallback((id: string, only?: (key: string) => boolean) => {
    setLists((all) => {
      const next: Record<string, PagedList> = {}
      for (const [k, l] of Object.entries(all))
        next[k] = (only ? only(k) : true) && l.ids.includes(id) ? { ...l, ids: l.ids.filter((x) => x !== id) } : l
      ref.current.lists = next
      return next
    })
  }, [])
  /** новая своя идея — в начало своего профиля и подписок */
  const prependTo = useCallback((keys: string[], id: string) => {
    setLists((all) => {
      const next = { ...all }
      for (const k of keys) if (next[k]) next[k] = { ...next[k], ids: uniq([id, ...next[k].ids]) }
      ref.current.lists = next
      return next
    })
  }, [])

  // ─── отзывы и ответы: только к открытой идее ───
  const askedTries = useRef(new Set<string>())
  const loadTries = useCallback(
    (postId: string) => {
      if (askedTries.current.has(postId)) return
      askedTries.current.add(postId)
      restGet<TryRow[]>(`tries?select=*&post_id=eq.${postId}&order=created_at.desc&limit=500`)
        .then(async (rows) => {
          const tries = rows.map(toTry)
          setTriesMap((m) => ({ ...m, [postId]: tries }))
          ensureUsers(tries.map((t) => t.userId))
          if (!tries.length) return
          const reps: ReplyRow[] = []
          for (const part of chunks(
            tries.map((t) => t.id),
            80,
          ))
            reps.push(...(await restGet<ReplyRow[]>(`try_replies?select=*&try_id=in.(${part.join(',')})&order=created_at.asc`)))
          setRepliesMap((m) => {
            const next = { ...m }
            for (const t of tries) next[t.id] = []
            for (const r of reps.map(toReply)) next[r.tryId] = [...(next[r.tryId] ?? []), r]
            return next
          })
          ensureUsers(reps.map((r) => r.user_id))
        })
        .catch(() => {
          askedTries.current.delete(postId)
          setTriesMap((m) => (m[postId] ? m : { ...m, [postId]: [] }))
        })
    },
    [ensureUsers],
  )

  // старые «Не интересно» гостя (раньше были только в браузере) — один раз в базу, чтобы лента училась и на них
  useEffect(() => {
    if (!authKnown || uid || !loadGuestNi().length) return
    try {
      if (localStorage.getItem(GUEST_NI_SYNCED) === '1') return
      localStorage.setItem(GUEST_NI_SYNCED, '1')
    } catch {
      return
    }
    for (const pid of loadGuestNi().slice(-30))
      supabase.rpc('not_interested_set', { p_post: pid, p_on: true, p_anon: anonId() }).then(() => {})
  }, [authKnown, uid])

  // ─── свои данные: папки, подписки, «не интересно», настройки уведомлений ───
  const [mineAttempt, setMineAttempt] = useState(0)
  const [mineFor, setMineFor] = useState<string | null>(null)
  useEffect(() => {
    if (!uid) {
      setFolders([])
      setFollows([])
      setNotices([])
      setNoticesLoaded(false)
      setNotInterested(new Set(loadGuestNi()))
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
      })
      .catch(() => {
        if (!live) return
        setNotice('Не удалось загрузить ваши папки. Обновите страницу.')
        setMineFor(uid)
      })
    supabase
      .from('not_interested')
      .select('post_id')
      .then(({ data }) => live && data && setNotInterested(new Set((data as { post_id: string }[]).map((x) => x.post_id))))
    supabase
      .from('notification_settings')
      .select('tried, reply, follower, saves, moderation')
      .maybeSingle()
      .then(({ data }) => live && setNoticeSettings(data ? (data as NoticeSettings) : DEFAULT_SETTINGS))
    // сколько непрочитанных — для колокольчика
    supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!live || !data) return
        const list = (data as NoticeRow[]).map(toNotice)
        setNotices(list)
        ensureUsers(list.map((n) => n.actorId ?? ''))
      })
    return () => {
      live = false
    }
  }, [uid, mineAttempt, ensureUsers])

  // идеи из папок — чтобы показать обложки и сами папки
  useEffect(() => {
    ensurePosts(folders.flatMap((f) => f.postIds))
  }, [folders, ensurePosts])

  // ─── живые обновления (Supabase Realtime, через проброс): что пришло — сразу на экран, без перезагрузки ───
  useEffect(() => {
    const bump = (postId: string, d: number, ok: boolean) =>
      setPostMap((m) =>
        m[postId]
          ? {
              ...m,
              [postId]: { ...m[postId], tries: Math.max(0, m[postId].tries + d), triesOk: Math.max(0, m[postId].triesOk + (ok ? d : 0)) },
            }
          : m,
      )
    const ch = supabase
      .channel('tries')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tries' }, ({ new: r }) => {
        const t = toTry(r as TryRow)
        if (ref.current.triesMap[t.postId]?.some((x) => x.id === t.id)) return
        bump(t.postId, 1, t.ok)
        setTriesMap((m) => (m[t.postId] ? { ...m, [t.postId]: [t, ...m[t.postId]] } : m))
        ensureUsers([t.userId])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tries' }, ({ old }) =>
        setTriesMap((m) => {
          for (const [pid, list] of Object.entries(m)) {
            const t = list.find((x) => x.id === old.id)
            if (t) {
              bump(pid, -1, t.ok)
              return { ...m, [pid]: list.filter((x) => x.id !== old.id) }
            }
          }
          return m
        }),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'try_replies' }, ({ new: r }) => {
        const x = toReply(r as ReplyRow)
        setRepliesMap((m) => (m[x.tryId] ? (m[x.tryId].some((y) => y.id === x.id) ? m : { ...m, [x.tryId]: [...m[x.tryId], x] }) : m))
        ensureUsers([x.userId])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'try_replies' }, ({ old }) =>
        setRepliesMap((m) => {
          for (const [tid, list] of Object.entries(m))
            if (list.some((x) => x.id === old.id)) return { ...m, [tid]: list.filter((x) => x.id !== old.id) }
          return m
        }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [ensureUsers])

  // свои идеи: проверка после публикации закончилась — появились теги или идея скрыта (тогда — сообщение с причиной);
  // новые уведомления — в колокольчик
  useEffect(() => {
    if (!uid) return
    const ch = supabase
      .channel(`mine-${uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts', filter: `author_id=eq.${uid}` }, ({ new: r }) => {
        const was = ref.current.postMap[r.id as string]
        if (was && !!r.hidden === !!was.hidden && was.ai?.meta) return
        supabase
          .from('posts')
          .select('*')
          .eq('id', r.id)
          .maybeSingle()
          .then(({ data }) => {
            if (!data) return
            const p = toPost(data as PostRow)
            setPostMap((m) => ({ ...m, [p.id]: p }))
            if (p.hidden && !was?.hidden) setNotice(`Идея «${p.title}» скрыта: ${p.hidden}`)
          })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, ({ new: r }) => {
        const n = toNotice(r as NoticeRow)
        setNotices((list) => (list.some((x) => x.id === n.id) ? list : [n, ...list]))
        if (n.actorId) ensureUsers([n.actorId])
      })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [uid, ensureUsers])

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

  const me: User = (uid && userMap[uid]) || (uid ? { ...GUEST, id: uid, name: email.split('@')[0] } : GUEST)
  const user = useCallback((id: string) => userMap[id] ?? { ...GUEST, id, name: 'Автор' }, [userMap])
  const hasUser = useCallback((id: string) => !!userMap[id], [userMap])
  const post = useCallback((id: string) => postMap[id], [postMap])
  const triesOf = useCallback((postId: string) => triesMap[postId], [triesMap])
  const repliesOf = useCallback((tryId: string) => repliesMap[tryId] ?? [], [repliesMap])
  const unread = useMemo(() => notices.filter((n) => !n.read).length, [notices])

  /** Сохранение в базе; при ошибке — сообщение и свежие свои данные с сервера */
  const save = (req: PromiseLike<{ error: unknown }>) => {
    Promise.resolve(req)
      .then(check)
      .catch(() => {
        setNotice('Не получилось сохранить. Проверьте интернет и попробуйте ещё раз.')
        setMineAttempt((n) => n + 1)
      })
  }

  /** Гость → окно входа */
  const needLogin = () => {
    if (uid) return false
    setLoginOpen(true)
    return true
  }

  /** Своё фото (data:URL) → файл в хранилище images/<id>/…; готовые адреса — как есть */
  /** withThumb — ещё и уменьшенная копия для ленты (только картинки идеи) */
  const upload = async (img: Img, withThumb = false): Promise<Img> => {
    if (!img.src?.startsWith('data:')) return img
    const name = `${uid}/${crypto.randomUUID()}`
    // имя файла всегда новое — браузер может хранить картинку у себя год и не переспрашивать
    const put = async (path: string, blob: Blob) => {
      check(await supabase.storage.from('images').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' }))
      const url = canonical(supabase.storage.from('images').getPublicUrl(path).data.publicUrl)
      localCopy.set(url, URL.createObjectURL(blob))
      return url
    }
    // оригинал и уменьшенная копия для ленты — одновременно
    const [src, thumb] = await Promise.all([
      fetch(img.src)
        .then((r) => r.blob())
        .then((b) => put(`${name}.jpg`, b)),
      withThumb ? shrink(img.src).then((b) => (b ? put(`${name}_s.jpg`, b) : undefined)) : undefined,
    ])
    return { src, ratio: img.ratio, ...(thumb ? { thumb } : {}) }
  }

  /** счётчик «в избранном» на сайте сразу, не дожидаясь базы (в базе его считает сама база) */
  const bumpSaves = (pid: string, d: number) =>
    setPostMap((m) => (m[pid] ? { ...m, [pid]: { ...m[pid], saves: Math.max(0, m[pid].saves + d) } } : m))

  const value: Store = {
    authReady: authKnown,
    mineReady: authKnown && (!uid || mineFor === uid),
    authed: !!uid,
    email,
    me,
    folders,
    follows,
    theme,
    user,
    hasUser,
    post,
    ensurePosts,
    ensureUsers,
    addPostRows,
    addUserRows,
    lists,
    loadMore,
    feedSeed,
    triesOf,
    repliesOf,
    loadTries,
    toggleFollow: (id) => {
      if (needLogin()) return
      const on = follows.includes(id)
      setFollows((f) => (on ? f.filter((x) => x !== id) : [...f, id]))
      setUserMap((m) => (m[id] ? { ...m, [id]: { ...m[id], followers: Math.max(0, m[id].followers + (on ? -1 : 1)) } } : m))
      // подписки изменились — лента подписок соберётся заново
      setLists((all) => {
        const next = { ...all }
        delete next.following
        ref.current.lists = next
        return next
      })
      save(
        on
          ? supabase.from('follows').delete().eq('follower_id', uid).eq('following_id', id)
          : supabase.from('follows').insert({ follower_id: uid, following_id: id }),
      )
    },
    uploadImg: (img, withThumb) => upload(img, withThumb),
    checkImg: async (img, purpose) => {
      const { data, error } = await supabase.functions.invoke('publish', { body: { action: 'check-image', img, purpose } })
      if (error) {
        // заблокирован и т. п. — причина от сервера
        let reasons: string[] | undefined
        try {
          reasons = (await (error as { context?: Response }).context?.json())?.reasons
        } catch {
          /* нет ответа */
        }
        if (reasons?.length) return { ok: false, reasons, topics: [], title: '' }
        throw new Error('проверка недоступна')
      }
      if (typeof data?.ok !== 'boolean') throw new Error('проверка недоступна')
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
      const images = await Promise.all(data.images.map((i) => upload(i, true)))
      const row = (await publish({ action: 'post', type: data.type, topics: data.topics, title: data.title, images })) as PostRow
      addPostRows([row])
      prependTo([`profile:${uid}`, 'following'], row.id)
      setFresh(row.id)
      setTimeout(() => setFresh((f) => (f === row.id ? null : f)), 3000)
      return row.id
    },
    fresh,
    deletePost: async (id) => {
      await publish({ action: 'delete-post', postId: id })
      dropFromLists(id)
      setPostMap((m) => {
        const next = { ...m }
        delete next[id]
        return next
      })
      setFolders((fs) => fs.map((f) => ({ ...f, postIds: f.postIds.filter((x) => x !== id), done: f.done.filter((x) => x !== id) })))
    },
    addTry: async (postId, ok, text, img) => {
      if (!uid) throw new Error('not signed in')
      const row = (await publish({ action: 'try', postId, ok, text: text ?? '', img: img ? await upload(img) : undefined })) as TryRow
      const t = toTry(row)
      if (!ref.current.triesMap[postId]?.some((x) => x.id === t.id)) {
        setTriesMap((m) => ({ ...m, [postId]: [t, ...(m[postId] ?? [])] }))
        setRepliesMap((m) => ({ ...m, [t.id]: [] }))
        setPostMap((m) =>
          m[postId] ? { ...m, [postId]: { ...m[postId], tries: m[postId].tries + 1, triesOk: m[postId].triesOk + (ok ? 1 : 0) } } : m,
        )
      }
    },
    addReply: async (tryId, text) => {
      if (!uid) {
        setLoginOpen(true)
        throw new Error('not signed in')
      }
      const r = toReply((await publish({ action: 'reply', tryId, text })) as ReplyRow)
      setRepliesMap((m) => ((m[tryId] ?? []).some((y) => y.id === r.id) ? m : { ...m, [tryId]: [...(m[tryId] ?? []), r] }))
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

    notInterested,
    hiddenNow,
    markNotInterested: (pid) => {
      setNotInterested((s) => new Set(s).add(pid))
      setHiddenNow((h) => ({ ...h, [pid]: { options: null } }))
      if (!uid) saveJson(GUEST_NI, [...loadGuestNi(), pid])
      supabase.rpc('not_interested_set', { p_post: pid, p_on: true, p_anon: anonId() }).then(({ data, error }) => {
        const options = !error && Array.isArray(data) ? (data as string[]) : []
        setHiddenNow((h) => (h[pid] ? { ...h, [pid]: { ...h[pid], options } } : h))
      })
    },
    answerNotInterested: (pid, feature) => {
      setHiddenNow((h) => (h[pid] ? { ...h, [pid]: { ...h[pid], answer: feature } } : h))
      save(supabase.rpc('not_interested_set', { p_post: pid, p_on: true, p_feature: feature, p_anon: anonId() }))
      // «не показывать автора» — его карточки из ленты убираем сразу
      if (feature.startsWith('u:')) {
        const author = feature.slice(2)
        const others = Object.values(postMap).filter((p) => p.authorId === author && p.id !== pid)
        for (const p of others) dropFromLists(p.id, (k) => k.startsWith('home:'))
      }
    },
    undoNotInterested: (pid) => {
      setNotInterested((s) => {
        const n = new Set(s)
        n.delete(pid)
        return n
      })
      setHiddenNow((h) => {
        const n = { ...h }
        delete n[pid]
        return n
      })
      save(supabase.rpc('not_interested_set', { p_post: pid, p_on: false, p_anon: anonId() }))
      if (!uid)
        saveJson(
          GUEST_NI,
          loadGuestNi().filter((x) => x !== pid),
        )
    },
    report: async (type, id, reason, comment, link) => {
      if (!uid) {
        setLoginOpen(true)
        return 'Нужно войти'
      }
      const { error } = await supabase.from('reports').insert({
        reporter_id: uid,
        target_type: type,
        target_id: id,
        reason,
        comment: comment.trim().slice(0, 500) || null,
        link: link.trim().slice(0, 500) || null,
      })
      if (!error) return null
      if (error.code === '23505') return 'already'
      if (error.code === '42501') return 'Ваш аккаунт заблокирован — жаловаться нельзя'
      return 'Не получилось отправить. Проверьте интернет и попробуйте ещё раз.'
    },

    notices,
    unread,
    noticesLoaded,
    loadNotices: () => {
      if (!uid) return
      // сначала база досчитывает сводку сохранений за прошедшие дни, потом берём список
      Promise.resolve(supabase.rpc('notifications_digest'))
        .catch(() => {})
        .then(() => supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100))
        .then((r) => {
          if (!r || r.error || !r.data) return
          const list = (r.data as NoticeRow[]).map(toNotice)
          setNotices(list)
          setNoticesLoaded(true)
          ensureUsers(list.map((n) => n.actorId ?? ''))
          ensurePosts(list.map((n) => n.postId ?? ''))
        })
    },
    markNoticesRead: () => {
      if (!uid || !notices.some((n) => !n.read)) return
      setNotices((list) => list.map((n) => (n.read ? n : { ...n, read: true })))
      save(supabase.from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false))
    },
    noticeSettings,
    saveNoticeSettings: (patch) => {
      if (needLogin()) return
      const next = { ...noticeSettings, ...patch }
      setNoticeSettings(next)
      save(supabase.from('notification_settings').upsert({ user_id: uid, ...next }, { onConflict: 'user_id' }))
    },

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
      addUserRows([row])
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
