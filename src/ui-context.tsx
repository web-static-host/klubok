import { createContext, useContext, useState, type ReactNode } from 'react'
import { SaveSheet } from './components/SaveSheet'
import { TriedSheet } from './components/TriedSheet'
import { CreateSheet } from './components/CreateSheet'

/** Общие окна: «Сохранить в папку», «Я попробовал», «Создать». Открываются из любого места. */
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

  const toast = (text: string) => {
    setToastText(text)
    window.setTimeout(() => setToastText((t) => (t === text ? null : t)), 2600)
  }

  return (
    <Ctx.Provider value={{ openSave: setSave, openTried: setTried, openCreate: () => setCreate(true), toast }}>
      {children}
      <SaveSheet postId={save} onClose={() => setSave(null)} />
      <TriedSheet postId={tried} onClose={() => setTried(null)} />
      <CreateSheet open={create} onClose={() => setCreate(false)} />
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
