import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as mock from './data/mock'
import type { Folder, Img, Post, Try, User } from './data/types'

/**
 * Состояние прототипа. Всё хранится в браузере (localStorage), сервера пока нет.
 * В настоящем сайте эти функции станут запросами к API.
 */

export type ThemeMode = 'system' | 'light' | 'dark'

interface Persisted {
  myPosts: Post[]
  myTries: Try[]
  folders: Folder[]
  follows: string[]
  likes: string[]
  theme: ThemeMode
}

const KEY = 'klubok.state.v1'

function load(): Persisted {
  const base: Persisted = { myPosts: [], myTries: [], folders: mock.folders, follows: mock.follows, likes: [], theme: 'system' }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...base, ...JSON.parse(raw) }
  } catch {
    /* браузер без хранилища — работаем без сохранения */
  }
  return base
}

interface Store {
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
  addPost: (p: Omit<Post, 'id' | 'authorId' | 'createdAt' | 'likes'>) => string
  addTry: (postId: string, ok: boolean, text?: string, img?: Img) => void
  saveTo: (folderId: string, postId: string) => void
  unsaveFrom: (folderId: string, postId: string) => void
  createFolder: (name: string, postId?: string) => string
  toggleDone: (folderId: string, postId: string) => void
  savedIn: (postId: string) => Folder[]
  setTheme: (t: ThemeMode) => void
  reset: () => void
}

const Ctx = createContext<Store | null>(null)

const uid = () => Math.random().toString(36).slice(2, 9)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Persisted>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
      localStorage.setItem('klubok.theme', s.theme)
    } catch {
      /* переполнено или запрещено — не страшно */
    }
  }, [s])

  // применяем тему
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = s.theme === 'dark' || (s.theme === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [s.theme])

  const posts = useMemo(() => [...s.myPosts, ...mock.posts], [s.myPosts])
  const tries = useMemo(() => [...s.myTries, ...mock.tries], [s.myTries])

  const user = useCallback((id: string) => mock.users.find((u) => u.id === id) ?? mock.users[0], [])
  const post = useCallback((id: string) => posts.find((p) => p.id === id), [posts])
  const triesOf = useCallback(
    (postId: string) => tries.filter((t) => t.postId === postId).sort((a, b) => b.createdAt - a.createdAt),
    [tries],
  )

  const value: Store = {
    me: mock.users[0],
    users: mock.users,
    posts,
    tries,
    folders: s.folders,
    follows: s.follows,
    likes: s.likes,
    theme: s.theme,
    user,
    post,
    triesOf,
    toggleFollow: (id) => setS((p) => ({ ...p, follows: p.follows.includes(id) ? p.follows.filter((x) => x !== id) : [...p.follows, id] })),
    toggleLike: (id) => setS((p) => ({ ...p, likes: p.likes.includes(id) ? p.likes.filter((x) => x !== id) : [...p.likes, id] })),
    addPost: (data) => {
      const id = 'my-' + uid()
      setS((p) => ({ ...p, myPosts: [{ ...data, id, authorId: mock.ME, createdAt: Date.now(), likes: 0 }, ...p.myPosts] }))
      return id
    },
    addTry: (postId, ok, text, img) =>
      setS((p) => ({
        ...p,
        myTries: [{ id: 't-' + uid(), postId, userId: mock.ME, ok, text, img, createdAt: Date.now() }, ...p.myTries],
      })),
    saveTo: (fid, pid) =>
      setS((p) => ({
        ...p,
        folders: p.folders.map((f) => (f.id === fid && !f.postIds.includes(pid) ? { ...f, postIds: [pid, ...f.postIds] } : f)),
      })),
    unsaveFrom: (fid, pid) =>
      setS((p) => ({
        ...p,
        folders: p.folders.map((f) =>
          f.id === fid ? { ...f, postIds: f.postIds.filter((x) => x !== pid), done: f.done.filter((x) => x !== pid) } : f,
        ),
      })),
    createFolder: (name, pid) => {
      const id = 'f-' + uid()
      setS((p) => ({ ...p, folders: [...p.folders, { id, name, postIds: pid ? [pid] : [], done: [] }] }))
      return id
    },
    toggleDone: (fid, pid) =>
      setS((p) => ({
        ...p,
        folders: p.folders.map((f) =>
          f.id === fid ? { ...f, done: f.done.includes(pid) ? f.done.filter((x) => x !== pid) : [...f.done, pid] } : f,
        ),
      })),
    savedIn: (pid) => s.folders.filter((f) => f.postIds.includes(pid)),
    setTheme: (theme) => setS((p) => ({ ...p, theme })),
    reset: () => setS({ myPosts: [], myTries: [], folders: mock.folders, follows: mock.follows, likes: [], theme: s.theme }),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('StoreProvider missing')
  return v
}
