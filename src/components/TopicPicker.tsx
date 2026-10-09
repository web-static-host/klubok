import { useId, useState } from 'react'
import { Plus, Search, Sparkles, X } from 'lucide-react'
import { TOPICS, topicLabel, type Topic } from '../data/types'
import { cx } from '../lib'

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

/**
 * Категории идеи (до max): выбранные — плашками с крестиком, добавить — поиск по списку категорий;
 * нет подходящей — можно добавить свою. auto — категории подобраны по картинкам (показываем подсказку).
 */
export function TopicPicker({
  value,
  onChange,
  auto,
  max = 5,
  locked,
}: {
  value: Topic[]
  onChange: (v: Topic[]) => void
  auto?: boolean
  max?: number
  /** поле заблокировано (картинка ещё не проверена) — текст вместо подсказки */
  locked?: string
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const listId = useId()
  const full = value.length >= max
  const off = full || !!locked

  const query = norm(q)
  const found = TOPICS.filter((t) => !value.includes(t.id) && (!query || norm(t.label).includes(query)))
  // своя категория — только если в списке ничего похожего нет (иначе выйдут почти одинаковые: «Сад» и «Сад и огород»)
  const own =
    query && !TOPICS.some((t) => norm(t.label).includes(query)) && !value.some((v) => norm(topicLabel(v)) === query)
      ? q
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/^./, (c) => c.toUpperCase())
      : null
  const options: { id: Topic; label: string; own?: boolean }[] = [
    ...found.map((t) => ({ id: t.id, label: t.label })),
    ...(own ? [{ id: own, label: own, own: true }] : []),
  ]

  const add = (t: Topic) => {
    if (full || value.includes(t)) return
    onChange([...value, t])
    setQ('')
    setHi(0)
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <p className="section-label">Категории</p>
        <span className="text-xs text-muted">
          {value.length} из {max}
        </span>
      </div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((t) => (
            <span key={t} className="chip-on inline-flex items-center gap-1 rounded-full border py-1.5 pr-1.5 pl-3 text-sm font-semibold">
              {topicLabel(t)}
              <button
                type="button"
                disabled={!!locked}
                aria-label={`Убрать «${topicLabel(t)}»`}
                onClick={() => onChange(value.filter((x) => x !== t))}
                className="press inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-active"
              >
                <X size={14} strokeWidth={2.4} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">{locked ? 'Подберём сами по картинке.' : 'Подберём сами по картинкам — или выберите ниже.'}</p>
      )}
      {auto && value.length > 0 && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted">
          <Sparkles size={13} className="text-accent" /> Подобрано по картинкам — уберите лишнее или добавьте своё
        </p>
      )}

      <div className="relative mt-3">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input
          value={q}
          disabled={off}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setHi(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setOpen(true)
              setHi((h) => (options.length ? (h + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length : 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const o = options[hi]
              if (open && o) add(o.id)
            } else if (e.key === 'Escape' && open) {
              // закрываем только список, а не всё окно
              e.stopPropagation()
              setOpen(false)
            }
          }}
          role="combobox"
          aria-expanded={open && !off}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Найти или добавить категорию"
          placeholder={locked || (full ? `Не больше ${max} категорий` : 'Найти или добавить категорию')}
          className="card w-full py-3 pr-4 pl-11 text-base outline-none placeholder:text-muted disabled:opacity-60"
        />
      </div>
      {open && !off && (
        <ul id={listId} role="listbox" className="card mt-2 max-h-64 overflow-y-auto p-1">
          {options.length ? (
            options.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={i === hi}
                // mousedown, а не click: иначе поле теряет фокус и список закрывается раньше нажатия
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(o.id)
                }}
                onMouseEnter={() => setHi(i)}
                className={cx(
                  'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold',
                  i === hi && 'bg-active',
                )}
              >
                {o.own ? (
                  <>
                    <Plus size={16} className="text-accent" /> Своя категория: «{o.label}»
                  </>
                ) : (
                  o.label
                )}
              </li>
            ))
          ) : (
            <li className="px-3 py-2.5 text-sm text-muted">Все категории уже выбраны</li>
          )}
        </ul>
      )}
    </div>
  )
}
