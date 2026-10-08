import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Folder, Img, Post, Recipe, Step, Topic, Try, User } from './data/types'
import { supabase } from './supabase'

/**
 * Состояние сайта. Данные — в базе Supabase, тема оформления — в браузере.
 * Действия сразу меняют экран, а затем сохраняются в базе; при ошибке — сообщение и перезагрузка своих данных.
 */

export type ThemeMode = 'system' | 'light' | 'dark'

/** Новый пост: что заполняет автор */
export interface NewPost {
  topic: Topic
  title: string
  text: string
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
  folders: Folder[]
  follows: string[]
  likes: string[]
  theme: ThemeMode
  user: (id: string) => User
  post: (id: string) => Post | undefined
  triesOf: (postId: string) => Try[]
  toggleFollow: (userId: string) => void
  toggleLike: (postId: string) => void
  addPost: (p: NewPost) => Promise<string>
  addTry: (postId: string, ok: boolean, text?: string, img?: Img) => Promise<void>
  saveTo: (folderId: string, postId: string) => void
  unsaveFrom: (folderId: string, postId: string) => void
  createFolder: (name: string, postId?: string) => string
  toggleDone: (folderId: string, postId: string) => void
  savedIn: (postId: string) => Folder[]
  setTheme: (t: ThemeMode) => void
  /** вход: письмо со ссылкой; вернёт текст ошибки или null */
  signIn: (email: string) => Promise<string | null>
  signOut: () => Promise<void>
  /** изменить свой профиль; вернёт текст ошибки или null */
  updateProfile: (p: Pick<User, 'name' | 'handle' | 'bio' | 'city'>) => Promise<string | null>
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
  city: string | null
  colors: string[]
  followers_count: number
}
interface PostRow {
  id: string
  author_id: string
  type: Post['type']
  topic: string
  title: string
  text: string
  images: Img[]
  recipe: Recipe | null
  steps: Step[] | null
  tags: string[]
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
  city: r.city ?? undefined,
  colors: [r.colors[0] ?? GUEST.colors[0], r.colors[1] ?? GUEST.colors[1]],
  followers: r.followers_count,
})
const toPost = (r: PostRow): Post => ({
  id: r.id,
  type: r.type,
  topic: r.topic,
  title: r.title,
  text: r.text,
  authorId: r.author_id,
  createdAt: Date.parse(r.created_at),
  images: r.images,
  recipe: r.recipe ?? undefined,
  steps: r.steps ?? undefined,
  likes: r.likes_count,
  tags: r.tags,
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

function loadTheme(): ThemeMode {
  try {
    const t = localStorage.getItem('klubok.theme')
    if (t === 'light' || t === 'dark' || t === 'system') return t
  } catch {
    /* браузер без хранилища */
  }
  return 'system'
}

export function StoreProvider({ children, initialNotice }: { children: ReactNode; initialNotice?: string | null }) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [uid, setUid] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [authKnown, setAuthKnown] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [tries, setTries] = useState<Try[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [follows, setFollows] = useState<string[]>([])
  const [likes, setLikes] = useState<string[]>([])
  const [theme, setThemeState] = useState<ThemeMode>(loadTheme)
  const [loginOpen, setLoginOpen] = useState(false)
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
    ])
      .then(([u, p, t]) => {
        if (!live) return
        setUsers((check(u).data as ProfileRow[]).map(toUser))
        setPosts((check(p).data as PostRow[]).map(toPost))
        setTries((check(t).data as TryRow[]).map(toTry))
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

  /** Своё фото (data:URL) → файл в хранилище images/<id>/…; заглушки и готовые адреса — как есть */
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
    folders,
    follows,
    likes,
    theme,
    user,
    post,
    triesOf,
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
      const res = await supabase
        .from('posts')
        .insert({ author_id: uid, type: 'photo', topic: data.topic, title: data.title, text: data.text, images })
        .select()
        .single()
      const p = toPost(check(res).data as PostRow)
      setPosts((ps) => [p, ...ps])
      return p.id
    },
    addTry: async (postId, ok, text, img) => {
      if (!uid) throw new Error('not signed in')
      const res = await supabase
        .from('tries')
        .insert({ post_id: postId, user_id: uid, ok, text: text ?? null, img: img ? await upload(img) : null })
        .select()
        .single()
      const t = toTry(check(res).data as TryRow)
      setTries((ts) => [t, ...ts])
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
    signIn: async (address) => {
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      })
      if (!error) return null
      if (error.status === 429) return 'Слишком много писем подряд. Подождите немного и попробуйте снова.'
      return 'Не получилось отправить письмо. Проверьте адрес.'
    },
    signOut: async () => {
      await supabase.auth.signOut()
    },
    updateProfile: async (p) => {
      if (!uid) return 'Нужно войти'
      const { error } = await supabase
        .from('profiles')
        .update({ name: p.name, handle: p.handle, bio: p.bio, city: p.city || null })
        .eq('id', uid)
      if (error) return error.code === '23505' ? 'Такой ник уже занят' : 'Не получилось сохранить'
      setUsers((us) => us.map((u) => (u.id === uid ? { ...u, ...p, city: p.city || undefined } : u)))
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
