import { useRef, useState } from 'react'
import { Camera, Loader2, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { Rejected, useStore } from '../store'
import { useUi } from '../ui-context'
import { cx, fileToImg } from '../lib'
import { Sheet } from './Sheet'
import { useCheckedImages } from './useCheckedImages'
import { Button } from './ui'

/** «Я попробовал» — DESIGN_WEB 3.6: результат обязателен, фото и комментарий — по желанию */
export function TriedSheet({ postId, onClose }: { postId: string | null; onClose: () => void }) {
  const { addTry, post } = useStore()
  const { toast } = useUi()
  const [ok, setOk] = useState<boolean | null>(null)
  const [text, setText] = useState('')
  // фото загружается и проверяется сразу после выбора
  const pics = useCheckedImages('post')
  const photo = pics.items[0]
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const p = postId ? post(postId) : undefined

  const close = () => {
    if (busy) return
    setOk(null)
    setText('')
    pics.reset()
    setErr('')
    onClose()
  }

  const submit = async () => {
    if (!postId) return
    if (ok === null) {
      setErr('Выберите результат: получилось или нет')
      return
    }
    if (photo?.status === 'bad') return setErr('Уберите фото — оно не прошло проверку')
    setBusy(true)
    try {
      await addTry(postId, ok, text.trim() || undefined, pics.result()[0])
    } catch (e) {
      setBusy(false)
      setErr(
        e instanceof Rejected
          ? `Не отправлено: ${e.reasons.join('. ')}`
          : 'Не получилось отправить. Проверьте интернет и попробуйте ещё раз.',
      )
      return
    }
    setBusy(false)
    setOk(null)
    setText('')
    pics.reset()
    onClose()
    toast(ok ? 'Отлично! Ваш результат добавлен' : 'Спасибо, это поможет другим')
  }

  return (
    <Sheet open={!!postId} onClose={close} title="Я попробовал">
      {p && <p className="mb-3 line-clamp-1 text-sm">«{p.title}»</p>}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Результат">
        {[
          { v: true, label: 'Получилось', icon: ThumbsUp },
          { v: false, label: 'Не получилось', icon: ThumbsDown },
        ].map(({ v, label, icon: Icon }) => {
          const on = ok === v
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setOk(v)
                setErr('')
              }}
              className={cx(
                'press flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-sm font-bold',
                on
                  ? v
                    ? 'border-accent/40 bg-accent/15 text-ink'
                    : 'border-rose-500/40 bg-rose-500/12 text-ink'
                  : 'border-line bg-surface hover:bg-active',
              )}
            >
              <span
                className={cx(
                  'inline-flex h-11 w-11 items-center justify-center rounded-2xl',
                  on ? (v ? 'grad' : 'bg-gradient-to-br from-[#FB7185] to-[#E11D48] text-white') : 'bg-elevated',
                )}
              >
                <Icon size={22} strokeWidth={on ? 2.4 : 2} />
              </span>
              {label}
            </button>
          )
        })}
      </div>
      {err && (
        <p className="mt-2 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">
          {err}
        </p>
      )}

      <p className="section-label mt-5 mb-2">Фото результата · по желанию</p>
      {photo ? (
        <div className="flex items-start gap-3">
          <div className="relative w-28 shrink-0">
            <img
              src={photo.preview.src}
              alt="Ваше фото"
              className={cx('h-28 w-28 rounded-2xl object-cover', photo.status === 'bad' && 'opacity-40')}
            />
            {photo.status === 'checking' && (
              <span className="glass-strong absolute inset-x-1.5 top-1/2 inline-flex -translate-y-1/2 items-center justify-center gap-1 rounded-full py-1 text-[11px] font-bold">
                <Loader2 size={13} className="animate-spin" /> Проверяем…
              </span>
            )}
            <button
              type="button"
              aria-label="Убрать фото"
              onClick={() => pics.reset()}
              className="press glass-strong absolute -top-2 -right-2 inline-flex h-7 w-7 items-center justify-center rounded-full"
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          </div>
          {photo.status === 'bad' && (
            <p className="text-xs leading-relaxed font-semibold text-rose-500" role="alert">
              Фото не прошло проверку: {photo.reasons?.join('. ')}
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => file.current?.click()}
          className="press flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-5 text-sm font-semibold hover:bg-active"
        >
          <Camera size={18} /> Добавить фото
        </button>
      )}
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) pics.add([await fileToImg(f, 900)])
        }}
      />

      <p className="section-label mt-5 mb-2">Комментарий · по желанию</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Что получилось, что бы сделали иначе"
        className="card w-full resize-none px-4 py-3 text-base outline-none placeholder:text-muted"
      />

      <Button className="mt-4 w-full" onClick={submit} disabled={busy || pics.pending > 0}>
        {busy ? 'Отправляем…' : pics.pending ? 'Проверяем фото…' : 'Отправить'}
      </Button>
    </Sheet>
  )
}
