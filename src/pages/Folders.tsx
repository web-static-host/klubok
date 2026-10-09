import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Folder as FolderIcon, FolderPlus, SearchX } from 'lucide-react'
import type { Folder } from '../data/types'
import { useStore } from '../store'
import { plural } from '../lib'
import { MobileTop } from '../components/Layout'
import { Masonry } from '../components/Masonry'
import { Sheet } from '../components/Sheet'
import { Button, Empty, IconButton, Picture } from '../components/ui'
import { LoginForm } from '../components/LoginSheet'
import { Bone, FoldersSkeleton, MasonrySkeleton } from '../components/Skeleton'

/** Обложка папки — коллаж из трёх картинок (DESIGN_WEB 3.7) */
export function FolderCard({ f }: { f: Folder }) {
  const { post } = useStore()
  const imgs = f.postIds
    .slice(0, 3)
    .map((id) => post(id)?.images[0])
    .filter(Boolean)
  const cell = (i: number, cls: string) =>
    imgs[i] ? (
      <Picture fill img={{ ...imgs[i]!, ratio: 1 }} w={300} className={`${cls} h-full`} />
    ) : (
      <span className={`${cls} block h-full bg-elevated`} />
    )
  return (
    <Link to={`/folders/${f.id}`} className="group fade-up block rounded-2xl">
      <div className="grid aspect-[4/3] grid-cols-[2fr_1fr] grid-rows-2 gap-0.5 overflow-hidden rounded-2xl transition-opacity group-hover:opacity-90">
        <div className="row-span-2">{cell(0, '')}</div>
        <div>{cell(1, '')}</div>
        <div>{cell(2, '')}</div>
      </div>
      <p className="mt-2 truncate px-1 text-sm font-semibold">{f.name}</p>
      <p className="px-1 text-xs">
        {f.postIds.length} {plural(f.postIds.length, 'идея', 'идеи', 'идей')}
        {f.done.length > 0 && ` · ${f.done.length} сделано`}
      </p>
    </Link>
  )
}

export function NewFolderButton() {
  const { createFolder } = useStore()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  return (
    <>
      <Button size="sm" kind="secondary" icon={FolderPlus} onClick={() => setOpen(true)}>
        Новая папка
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Новая папка">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            const id = createFolder(name.trim())
            setName('')
            setOpen(false)
            nav(`/folders/${id}`)
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Например, «Идеи на Новый год»"
            aria-label="Название папки"
            className="card w-full px-4 py-3 text-base outline-none placeholder:text-muted"
          />
          <Button type="submit" disabled={!name.trim()}>
            Создать
          </Button>
        </form>
      </Sheet>
    </>
  )
}

export function Folders() {
  const { folders, authed, authReady, mineReady } = useStore()
  if (authReady && !authed)
    return (
      <>
        <MobileTop title="Папки" />
        <div className="mx-auto max-w-sm px-3 pt-4 md:pt-16">
          <h1 className="mb-3 hidden text-2xl font-bold md:block">Мои папки</h1>
          <LoginForm hint="Папки — ваши подборки идей: «Хочу приготовить», «Для дачи»… Войдите, чтобы их вести." />
        </div>
      </>
    )
  return (
    <>
      <MobileTop title="Папки" />
      <div className="px-3 md:px-4 md:pt-6 lg:px-6">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="hidden flex-1 text-2xl font-bold md:block">Мои папки</h1>
          <div className="flex-1 md:hidden" />
          <NewFolderButton />
        </div>
        {!mineReady ? (
          <FoldersSkeleton />
        ) : folders.length ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {folders.map((f) => (
              <FolderCard key={f.id} f={f} />
            ))}
          </div>
        ) : (
          <Empty icon={FolderIcon}>Сохраняйте идеи в папки: «Хочу приготовить», «Для дачи»… Нажмите «Сохранить» на любой картинке.</Empty>
        )}
      </div>
    </>
  )
}

export function FolderPage() {
  const { id = '' } = useParams()
  const { folders, post, mineReady } = useStore()
  const nav = useNavigate()
  const f = folders.find((x) => x.id === id)
  // идеи папки подгружает хранилище (по списку сохранённого); пока нет ни одной — заглушка
  const list = f ? f.postIds.map((pid) => post(pid)).filter((p) => !!p) : []
  if ((!f && !mineReady) || (f && f.postIds.length > 0 && !list.length))
    return (
      <div className="px-2 pt-3 sm:px-3 md:px-4 md:pt-6 lg:px-6" role="status" aria-label="Загрузка">
        <div className="mb-4 flex items-center gap-3 px-1">
          <Bone className="h-10 w-10 rounded-2xl" />
          <div>
            <Bone className="h-6 w-40" />
            <Bone className="mt-1.5 h-3 w-28" />
          </div>
        </div>
        <MasonrySkeleton rows={2} />
      </div>
    )
  if (!f) return <Empty icon={SearchX}>Папка не найдена.</Empty>
  return (
    <div className="px-2 pt-3 sm:px-3 md:px-4 md:pt-6 lg:px-6">
      <div className="mb-4 flex items-center gap-3 px-1">
        <IconButton icon={ArrowLeft} label="Назад" onClick={() => nav('/folders')} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{f.name}</h1>
          <p className="text-xs">
            {list.length} {plural(list.length, 'идея', 'идеи', 'идей')} · сделано {f.done.length} из {list.length}
          </p>
        </div>
      </div>
      {list.length ? (
        <Masonry posts={list} folderId={f.id} source="folder" />
      ) : (
        <Empty icon={FolderIcon}>Папка пустая. Сохраняйте сюда идеи из ленты.</Empty>
      )}
    </div>
  )
}
