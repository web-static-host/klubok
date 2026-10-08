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
  wide?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className="fade-in absolute inset-0 bg-[var(--scrim)]" onClick={onClose} />
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
          wide ? 'md:max-w-2xl' : 'md:max-w-md',
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
