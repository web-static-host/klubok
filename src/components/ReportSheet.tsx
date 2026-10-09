import { useState } from 'react'
import { Flag } from 'lucide-react'
import { REPORT_REASONS, type ReportTarget } from '../data/types'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { cx } from '../lib'
import { Sheet } from './Sheet'
import { Button } from './ui'

const WHAT: Record<ReportTarget, string> = {
  post: 'на идею',
  try: 'на отзыв',
  reply: 'на ответ',
  profile: 'на профиль',
}

/** «Пожаловаться»: причина обязательна; «Это моя картинка» — со ссылкой, где она опубликована раньше. Смотрит модератор. */
export function ReportSheet({ target, onClose }: { target: { type: ReportTarget; id: string } | null; onClose: () => void }) {
  const { report } = useStore()
  const { toast } = useUi()
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [link, setLink] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const reasons = target?.type === 'profile' ? REPORT_REASONS.filter((r) => r.id !== 'people') : REPORT_REASONS

  const close = () => {
    if (busy) return
    setReason('')
    setComment('')
    setLink('')
    setErr('')
    onClose()
  }
  const send = async () => {
    if (!target) return
    if (!reason) return setErr('Выберите причину')
    if (reason === 'stolen' && !link.trim()) return setErr('Укажите ссылку, где картинка опубликована раньше')
    if (reason === 'other' && !comment.trim()) return setErr('Напишите, что не так')
    setBusy(true)
    const res = await report(target.type, target.id, reason, comment, link)
    setBusy(false)
    if (res && res !== 'already') return setErr(res)
    toast(res === 'already' ? 'Вы уже жаловались — модератор посмотрит' : 'Спасибо! Модератор посмотрит')
    setBusy(false)
    close()
  }

  return (
    <Sheet open={!!target} onClose={close} title={`Пожаловаться ${target ? WHAT[target.type] : ''}`}>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Причина">
        {reasons.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={reason === r.id}
            onClick={() => {
              setReason(r.id)
              setErr('')
            }}
            className={cx(
              'press flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold',
              reason === r.id ? 'chip-on' : 'border-line bg-surface hover:bg-active',
            )}
          >
            <span
              className={cx('h-4 w-4 shrink-0 rounded-full border-2', reason === r.id ? 'border-accent bg-accent' : 'border-line-strong')}
              aria-hidden
            />
            {r.label}
          </button>
        ))}
      </div>
      {reason === 'stolen' && (
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          maxLength={500}
          inputMode="url"
          placeholder="Ссылка, где картинка опубликована раньше"
          aria-label="Ссылка на оригинал"
          className="card mt-3 w-full px-4 py-3 text-base outline-none placeholder:text-muted"
        />
      )}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder={reason === 'other' ? 'Что не так' : 'Комментарий для модератора (по желанию)'}
        aria-label="Комментарий"
        className="card mt-3 w-full resize-none px-4 py-3 text-base outline-none placeholder:text-muted"
      />
      {err && (
        <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">
          {err}
        </p>
      )}
      <Button className="mt-4 w-full" icon={Flag} onClick={send} disabled={busy}>
        {busy ? 'Отправляем…' : 'Отправить жалобу'}
      </Button>
    </Sheet>
  )
}
