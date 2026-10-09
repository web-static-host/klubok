import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cx } from '../lib'

/**
 * Диалог: на телефоне — нижняя шторка (DESIGN_SYSTEM 7.12), на компьютере — окно по центру (DESIGN_WEB 2).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** шире обычного; 'xl' — для формы в две колонки (создание идеи) */
  wide?: boolean | 'xl'
}) {
  const panel = useRef<HTMLDivElement>(null)
  // onClose часто новая функция на каждое нажатие клавиши — храним последнюю, а не перезапускаем окно
  // (иначе окно заново забирает фокус и курсор слетает с поля ввода)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // окно поверх окна (например, правила поверх входа): закрывается только верхнее
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (dialogs[dialogs.length - 1] === panel.current) closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    // прокрутку страницы выключаем; чтобы страница не дёрнулась вправо, когда пропадёт полоса прокрутки,
    // на её место ставим такой же отступ (окно поверх окна — уже выключено, ничего не трогаем)
    const body = document.body.style
    const was = { overflow: body.overflow, paddingRight: body.paddingRight }
    if (body.overflow !== 'hidden') {
      const bar = window.innerWidth - document.documentElement.clientWidth
      if (bar > 0) body.paddingRight = `${bar}px`
      body.overflow = 'hidden'
    }
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      body.overflow = was.overflow
      body.paddingRight = was.paddingRight
      prev?.focus?.()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className="fade-in absolute inset-0 bg-[var(--scrim)] backdrop-blur-md" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'relative flex max-h-[90dvh] w-full flex-col bg-bg outline-none',
          'sheet-up rounded-t-3xl border-t border-white/5 shadow-[0_-8px_32px_rgba(0,0,0,0.4)]',
          'md:rounded-3xl md:border md:border-line md:shadow-2xl',
          wide === 'xl' ? 'md:max-w-5xl' : wide ? 'md:max-w-2xl' : 'md:max-w-md',
        )}
      >
        <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-ink/20 md:hidden" />
        <div className="flex items-center gap-3 px-4 py-2 md:px-5 md:pt-4">
          <h2 className="flex-1 truncate text-lg leading-7 font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="press glass inline-flex h-9 w-9 items-center justify-center rounded-full"
          >
            <X size={20} strokeWidth={2.2} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pt-2 pb-6 md:px-5" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
