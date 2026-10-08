import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { BookOpen, ChefHat, Image as ImageIcon, Lightbulb, SplitSquareHorizontal, type LucideIcon } from 'lucide-react'
import type { Img, PostType, User } from '../data/types'
import { TYPE_META } from '../data/types'
import { cx, imgFallback, imgSrc } from '../lib'

export function Picture({
  img,
  w = 600,
  className,
  alt = '',
  fill,
}: {
  img: Img
  w?: number
  className?: string
  alt?: string
  fill?: boolean
}) {
  const [src, setSrc] = useState(() => imgSrc(img, w))
  const [loaded, setLoaded] = useState(false)
  return (
    <div className={cx('relative overflow-hidden bg-elevated', className)} style={fill ? undefined : { aspectRatio: `1 / ${img.ratio}` }}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          const fb = imgFallback(img, w)
          if (src !== fb) setSrc(fb)
        }}
        className={cx('absolute inset-0 h-full w-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
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

const TYPE_ICON: Record<PostType, LucideIcon> = {
  photo: ImageIcon,
  recipe: ChefHat,
  hack: Lightbulb,
  beforeafter: SplitSquareHorizontal,
}
export const typeIcon = (t: PostType) => TYPE_ICON[t] ?? BookOpen

export function TypeBadge({ type, className }: { type: PostType; className?: string }) {
  const Icon = typeIcon(type)
  return (
    <span
      className={cx(
        'glass-strong inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-xs font-semibold text-ink',
        className,
      )}
    >
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white"
        style={{ backgroundImage: `linear-gradient(135deg, ${TYPE_META[type].colors[0]}, ${TYPE_META[type].colors[1]})` }}
      >
        <Icon size={11} strokeWidth={2.4} />
      </span>
      {TYPE_META[type].label}
    </span>
  )
}

export function IconTile({ icon: Icon, colors, size = 40 }: { icon: LucideIcon; colors: [string, string]; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-2xl text-white"
      style={{ width: size, height: size, backgroundImage: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
    >
      <Icon size={size * 0.5} strokeWidth={2.2} />
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
