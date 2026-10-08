import type { MouseEvent, ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { RulesList } from '../pages/Rules'
import { useUi } from '../ui-context'
import { Sheet } from './Sheet'

/** Адрес страницы правил — для открытия в отдельной вкладке */
const RULES_URL = `${window.location.pathname}#/rules`

/** Правила поверх текущего окна (вход, создание поста) — то окно остаётся под ним */
export function RulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Правила Клубка" wide>
      <a
        href={RULES_URL}
        target="_blank"
        rel="noopener"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
      >
        <ExternalLink size={14} /> Открыть в отдельной вкладке
      </a>
      <RulesList />
    </Sheet>
  )
}

/** Ссылка «Правила»: обычное нажатие — окно поверх, Ctrl/колёсико — новая вкладка */
export function RulesLink({ children, className }: { children: ReactNode; className?: string }) {
  const { openRules } = useUi()
  const click = (e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    openRules()
  }
  return (
    <a href={RULES_URL} onClick={click} className={className}>
      {children}
    </a>
  )
}
