import { useState } from 'react'
import { Eye, EyeOff, MailCheck } from 'lucide-react'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { cx } from '../lib'
import { Sheet } from './Sheet'
import { RulesLink } from './RulesSheet'
import { Button, Segmented } from './ui'

type Mode = 'signin' | 'signup' | 'forgot'

const field = 'card w-full px-4 py-3 text-base outline-none placeholder:text-muted'
const MIN = 8

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoComplete: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="card flex items-center pr-1.5">
      <input
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}
        className="press inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-active"
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

/** Вход и регистрация по почте и паролю, «Забыли пароль?» — письмо со ссылкой */
export function LoginForm({ hint, onDone }: { hint?: string; onDone?: () => void }) {
  const { signIn, signUp, resetPassword } = useStore()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState<null | { to: string; what: 'confirm' | 'reset' }>(null)
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
          {sent.what === 'confirm'
            ? 'Чтобы закончить регистрацию, откройте ссылку из письма'
            : 'Чтобы задать новый пароль, откройте ссылку из письма'}
          , отправленного на <b>{sent.to}</b>. Письма нет — загляните в «Спам».
        </p>
        <Button
          kind="neutral"
          size="sm"
          onClick={() => {
            setSent(null)
            setMode('signin')
          }}
        >
          Вернуться ко входу
        </Button>
      </div>
    )

  const submit = async () => {
    const v = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(v)) return setErr('Проверьте адрес почты')
    if (mode !== 'forgot' && password.length < MIN) return setErr(`Пароль — не меньше ${MIN} символов`)
    setBusy(true)
    setErr('')
    if (mode === 'forgot') {
      const error = await resetPassword(v)
      setBusy(false)
      if (error) setErr(error)
      else setSent({ to: v, what: 'reset' })
      return
    }
    const res = mode === 'signin' ? await signIn(v, password) : await signUp(v, password)
    setBusy(false)
    if (res === 'confirm') setSent({ to: v, what: 'confirm' })
    else if (res) setErr(res)
    else onDone?.()
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {mode === 'forgot' ? (
        <p className="text-sm leading-relaxed">Введите почту — пришлём ссылку, чтобы задать новый пароль.</p>
      ) : (
        <>
          {hint && <p className="text-sm leading-relaxed">{hint}</p>}
          <Segmented<Mode>
            value={mode}
            onChange={(m) => {
              setMode(m)
              setErr('')
            }}
            options={[
              { id: 'signin', label: 'Вход' },
              { id: 'signup', label: 'Регистрация' },
            ]}
          />
        </>
      )}
      <input
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          setErr('')
        }}
        placeholder="Почта"
        aria-label="Почта"
        className={field}
      />
      {mode !== 'forgot' && (
        <PasswordInput
          value={password}
          onChange={(v) => {
            setPassword(v)
            setErr('')
          }}
          placeholder={mode === 'signup' ? `Придумайте пароль (от ${MIN} символов)` : 'Пароль'}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        />
      )}
      {err && (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">
          {err}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? 'Подождите…' : mode === 'signin' ? 'Войти' : mode === 'signup' ? 'Зарегистрироваться' : 'Получить ссылку'}
      </Button>
      <div className={cx('flex text-xs font-semibold', mode === 'signin' ? 'justify-between' : 'justify-center')}>
        {mode === 'signin' && (
          <button type="button" className="press text-accent hover:underline" onClick={() => setMode('forgot')}>
            Забыли пароль?
          </button>
        )}
        {mode === 'forgot' ? (
          <button type="button" className="press text-accent hover:underline" onClick={() => setMode('signin')}>
            Вернуться ко входу
          </button>
        ) : (
          <RulesLink className="hover:underline">Правила Клубка</RulesLink>
        )}
      </div>
      {mode === 'signup' && <p className="text-center text-[11px] leading-relaxed">Регистрируясь, вы соглашаетесь с правилами Клубка.</p>}
    </form>
  )
}

export function LoginSheet() {
  const { loginOpen, setLoginOpen } = useStore()
  return (
    <Sheet open={loginOpen} onClose={() => setLoginOpen(false)} title="Вход в Клубок">
      <LoginForm
        hint="Чтобы публиковать идеи, сохранять их в папки и отмечать «Я попробовал», войдите или зарегистрируйтесь."
        onDone={() => setLoginOpen(false)}
      />
    </Sheet>
  )
}

/** «Новый пароль» — открывается после ссылки «забыли пароль» из письма */
export function NewPasswordSheet() {
  const { recoveryOpen, setRecoveryOpen, setPassword } = useStore()
  const { toast } = useUi()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <Sheet open={recoveryOpen} onClose={() => setRecoveryOpen(false)} title="Новый пароль">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (pw.length < MIN) return setErr(`Пароль — не меньше ${MIN} символов`)
          setBusy(true)
          const error = await setPassword(pw)
          setBusy(false)
          if (error) return setErr(error)
          setRecoveryOpen(false)
          toast('Пароль изменён')
        }}
      >
        <PasswordInput value={pw} onChange={setPw} placeholder={`Новый пароль (от ${MIN} символов)`} autoComplete="new-password" />
        {err && (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500" role="alert">
            {err}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить пароль'}
        </Button>
      </form>
    </Sheet>
  )
}
