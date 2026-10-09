import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'
import type { Img, Topic, User } from '../data/types'
import { topicLabel } from '../data/types'
import { THUMB_W, cx, imgSrc, localCopy } from '../lib'
import { viaApi } from '../supabase'

export function Picture({
  img,
  w,
  className,
  alt = '',
  fill,
  contain,
}: {
  img: Img
  /** нужная ширина: до 600 — берётся уменьшенная копия (img.thumb), если она есть */
  w?: number
  className?: string
  alt?: string
  fill?: boolean
  /** вписать целиком, без обрезки (картинки с текстом) */
  contain?: boolean
}) {
  const [loaded, setLoaded] = useState(false)
  // связь оборвалась — пробуем ещё раз (до двух раз)
  const [retry, setRetry] = useState(0)
  // в ленте и миниатюрах (до 600 px) — уменьшенная копия, если есть; крупно — оригинал. Копия не загрузилась — сразу оригинал
  const [noThumb, setNoThumb] = useState(false)
  const thumb = !noThumb && w && w <= THUMB_W && img.thumb
  const src = thumb ? (localCopy.get(img.thumb!) ?? viaApi(img.thumb!)) : imgSrc(img)
  return (
    <div className={cx('relative overflow-hidden bg-elevated', className)} style={fill ? undefined : { aspectRatio: `1 / ${img.ratio}` }}>
      <img
        src={retry ? `${src}${src.includes('?') ? '&' : '?'}r=${retry}` : src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => (thumb ? setNoThumb(true) : retry < 2 && setTimeout(() => setRetry((n) => n + 1), 500 * (retry + 1)))}
        className={cx(
          'absolute inset-0 h-full w-full transition-opacity duration-300',
          contain ? 'object-contain' : 'object-cover',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}

export function Avatar({ user, size = 32 }: { user: User; size?: number }) {
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
  if (user.avatar)
    return (
      <img
        src={viaApi(user.avatar)}
        alt=""
        aria-hidden
        loading="lazy"
        className="shrink-0 rounded-full bg-elevated object-cover"
        style={{ width: size, height: size }}
      />
    )
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.38),
        backgroundImage: `linear-gradient(135deg, ${user.colors[0]}, ${user.colors[1]})`,
      }}
    >
      {initials}
    </span>
  )
}

type BtnKind = 'primary' | 'secondary' | 'neutral' | 'danger' | 'ghost'
export function Button({
  kind = 'primary',
  icon: Icon,
  className,
  children,
  size = 'md',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; icon?: LucideIcon; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'press inline-flex items-center justify-center gap-2 rounded-2xl font-semibold whitespace-nowrap disabled:opacity-50 disabled:saturate-50',
        size === 'md' ? 'min-h-12 px-5 text-[15px]' : 'h-9 px-4 text-sm',
        kind === 'primary' && 'grad shadow-[0_8px_24px_-10px_rgba(8,145,178,0.6)]',
        kind === 'secondary' && 'border chip-on text-ink',
        kind === 'neutral' && 'card text-ink hover:bg-active',
        kind === 'danger' && 'bg-gradient-to-br from-[#EF4444] to-[#DC2626] text-white',
        kind === 'ghost' && 'text-ink hover:bg-active',
        className,
      )}
    >
      {Icon && <Icon size={size === 'md' ? 18 : 16} strokeWidth={2.2} />}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon,
  label,
  size = 40,
  className,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; size?: number; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        'press inline-flex shrink-0 items-center justify-center rounded-2xl border text-ink',
        active ? 'chip-on' : 'border-line bg-surface hover:bg-active',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Icon size={size >= 40 ? 20 : 18} strokeWidth={active ? 2.4 : 2} />
    </button>
  )
}

/** Плашка категории поверх картинки и в карточках */
export function TopicBadge({ topic, className }: { topic: Topic; className?: string }) {
  return (
    <span
      className={cx('glass-strong inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-semibold text-ink', className)}
    >
      <span className="truncate">{topicLabel(topic)}</span>
    </span>
  )
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'press shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold',
        active ? 'chip-on' : 'border-line bg-surface hover:bg-active',
      )}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { id: T; label: string; icon?: LucideIcon }[]
}) {
  return (
    <div className="card grid gap-1 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="tablist">
      {options.map((o) => {
        const on = o.id === value
        const Icon = o.icon
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange(o.id)}
            className={cx(
              'press flex items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-sm font-semibold',
              on ? 'chip-on' : 'border-transparent hover:bg-active',
            )}
          >
            {Icon && <Icon size={18} strokeWidth={on ? 2.4 : 1.8} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Empty({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="fade-up mx-auto flex max-w-sm flex-col items-center px-6 pt-16 text-center">
      <Icon size={48} strokeWidth={1.4} />
      <p className="mt-3 text-sm leading-relaxed">{children}</p>
    </div>
  )
}

export function Logo({ size = 32 }: { size?: number }) {
  return <img src={`${import.meta.env.BASE_URL}logo.svg`} width={size} height={size} alt="" className="rounded-[22%]" />
}

/** Переключатель — DESIGN_SYSTEM 7.15: подпись и описание слева, справа трек 44×24 (вкл — градиент), бегунок 20×20 */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  children?: ReactNode
}) {
  return (
    <label className="card flex cursor-pointer items-center gap-4 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-5 font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-4 text-muted">{hint}</span>}
        {children}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg',
          checked ? 'bg-gradient-to-r from-[#2DD4BF] to-[#06B6D4]' : 'bg-[rgba(71,85,105,.4)]',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-200',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </label>
  )
}
