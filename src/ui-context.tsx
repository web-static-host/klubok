import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { SaveSheet } from './components/SaveSheet'
import { TriedSheet } from './components/TriedSheet'
import { CreateSheet } from './components/CreateSheet'
import { LoginSheet } from './components/LoginSheet'
import { useStore } from './store'

/** Общие окна: «Сохранить в папку», «Я попробовал», «Создать», «Вход». Открываются из любого места; гостю — сначала вход. */
interface Ui {
  openSave: (postId: string) => void
  openTried: (postId: string) => void
  openCreate: () => void
  toast: (text: string) => void
}
const Ctx = createContext<Ui | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [save, setSave] = useState<string | null>(null)
  const [tried, setTried] = useState<string | null>(null)
  const [create, setCreate] = useState(false)
  const [toastText, setToastText] = useState<string | null>(null)

  const { authed, setLoginOpen, notice, clearNotice, post, me } = useStore()

  const toast = (text: string) => {
    setToastText(text)
    window.setTimeout(() => setToastText((t) => (t === text ? null : t)), 3200)
  }

  // сообщения стора (ошибки сохранения, вход по ссылке) — всплывашкой
  useEffect(() => {
    if (!notice) return
    setToastText(notice)
    clearNotice()
    window.setTimeout(() => setToastText((t) => (t === notice ? null : t)), 4000)
  }, [notice, clearNotice])

  const guard =
    <A extends unknown[]>(fn: (...a: A) => void) =>
    (...a: A) =>
      authed ? fn(...a) : setLoginOpen(true)

  return (
    <Ctx.Provider
      value={{
        openSave: guard(setSave),
        openTried: guard((id: string) =>
          post(id)?.authorId === me.id ? toast('Это ваша идея — отзывы оставляют те, кто её повторил') : setTried(id),
        ),
        openCreate: guard(() => setCreate(true)),
        toast,
      }}
    >
      {children}
      <SaveSheet postId={save} onClose={() => setSave(null)} />
      <TriedSheet postId={tried} onClose={() => setTried(null)} />
      <CreateSheet open={create} onClose={() => setCreate(false)} />
      <LoginSheet />
      {toastText && (
        <div
          role="status"
          className="scale-in glass-strong fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg md:bottom-8"
        >
          {toastText}
        </div>
      )}
    </Ctx.Provider>
  )
}

export function useUi() {
  const v = useContext(Ctx)
  if (!v) throw new Error('UiProvider missing')
  return v
}
