import { useState } from 'react'
import { MailCheck } from 'lucide-react'
import { useStore } from '../store'
import { Sheet } from './Sheet'
import { Button } from './ui'

/** Вход по почте: письмо со ссылкой, без пароля */
export function LoginForm({ hint }: { hint?: string }) {
  const { signIn } = useStore()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (sent)
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <span className="grad inline-flex h-12 w-12 items-center justify-center rounded-2xl">
          <MailCheck size={24} strokeWidth={2.2} />
        </span>
        <p className="text-base font-bold">Проверьте почту</p>
        <p className="text-sm leading-relaxed">
          Отправили ссылку для входа на <b>{sent}</b>. Откройте её в этом же браузере. Письма нет — загляните в «Спам».
        </p>
        <Button kind="neutral" size="sm" onClick={() => setSent('')}>
          Другая почта
        </Button>
      </div>
    )

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        const v = email.trim()
        if (!/^\S+@\S+\.\S+$/.test(v)) return setErr('Проверьте адрес почты')
        setBusy(true)
        const error = await signIn(v)
        setBusy(false)
        if (error) setErr(error)
        else setSent(v)
      }}
    >
      <p className="text-sm leading-relaxed">{hint ?? 'Пароль не нужен: пришлём на почту ссылку для входа.'}</p>
      <input
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          setErr('')
        }}
        placeholder="Ваша почта"
        aria-label="Почта"
        className="card w-full px-4 py-3 text-base outline-none placeholder:text-muted"
      />
      {err && (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">
          {err}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? 'Отправляем…' : 'Получить ссылку'}
      </Button>
    </form>
  )
}

export function LoginSheet() {
  const { loginOpen, setLoginOpen } = useStore()
  return (
    <Sheet open={loginOpen} onClose={() => setLoginOpen(false)} title="Вход в Клубок">
      <LoginForm hint="Чтобы сохранять идеи, ставить лайки и делиться результатами, войдите. Пароль не нужен — пришлём ссылку на почту." />
    </Sheet>
  )
}
