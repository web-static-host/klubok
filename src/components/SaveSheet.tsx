import { useState } from 'react'
import { Check, FolderPlus } from 'lucide-react'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { cx, plural } from '../lib'
import { Sheet } from './Sheet'
import { Button, Picture } from './ui'

/** «Сохранить в папку» — DESIGN_WEB 3.7. Сохранение — это ссылка на оригинал, автор всегда виден. */
export function SaveSheet({ postId, onClose }: { postId: string | null; onClose: () => void }) {
  const { folders, post, saveTo, unsaveFrom, createFolder } = useStore()
  const { toast } = useUi()
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  const close = () => {
    setName('')
    setAdding(false)
    onClose()
  }

  return (
    <Sheet open={!!postId} onClose={close} title="Сохранить в папку">
      <div className="flex flex-col gap-2">
        {folders.map((f) => {
          const on = !!postId && f.postIds.includes(postId)
          const cover = post(f.postIds[0] ?? '')?.images[0]
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                if (!postId) return
                if (on) unsaveFrom(f.id, postId)
                else {
                  saveTo(f.id, postId)
                  toast(`Сохранено в «${f.name}»`)
                }
              }}
              className={cx('press card flex items-center gap-3 p-2.5 pr-3 text-left', on && 'chip-on')}
            >
              {cover ? (
                <Picture img={{ ...cover, ratio: 1 }} w={120} className="h-10 w-10 shrink-0 rounded-xl" />
              ) : (
                <span className="h-10 w-10 shrink-0 rounded-xl bg-elevated" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{f.name}</span>
                <span className="block text-xs">
                  {f.postIds.length} {plural(f.postIds.length, 'идея', 'идеи', 'идей')}
                </span>
              </span>
              {on && (
                <span className="grad inline-flex h-6 w-6 items-center justify-center rounded-full">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
            </button>
          )
        })}

        {adding ? (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const n = name.trim()
              if (!n || !postId) return
              createFolder(n, postId)
              toast(`Папка «${n}» создана`)
              setName('')
              setAdding(false)
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Название папки"
              aria-label="Название папки"
              className="card min-w-0 flex-1 px-4 py-3 text-base outline-none placeholder:text-muted"
            />
            <Button type="submit" disabled={!name.trim()}>
              Создать
            </Button>
          </form>
        ) : (
          <Button kind="secondary" icon={FolderPlus} className="mt-2" onClick={() => setAdding(true)}>
            Новая папка
          </Button>
        )}
      </div>
    </Sheet>
  )
}
