import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Folder, LogIn, Plus, RotateCcw, Search, Sparkles, User as UserIcon, Users, WifiOff, type LucideIcon } from 'lucide-react'
import { useStore } from '../store'
import { useUi } from '../ui-context'
import { cx } from '../lib'
import { Avatar, Button, Empty, Logo } from './ui'

const TABS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Для вас', icon: Sparkles, end: true },
  { to: '/following', label: 'Подписки', icon: Users },
  { to: '/folders', label: 'Папки', icon: Folder },
  { to: '/me', label: 'Профиль', icon: UserIcon },
]

function SearchBox({ className }: { className?: string }) {
  const nav = useNavigate()
  const loc = useLocation()
  const [q, setQ] = useState(() => new URLSearchParams(loc.search).get('q') ?? '')
  return (
    <form
      role="search"
      className={cx('card flex items-center gap-2 px-3', className)}
      onSubmit={(e) => {
        e.preventDefault()
        nav(`/search?q=${encodeURIComponent(q.trim())}`)
      }}
    >
      <Search size={18} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Рецепты, лайфхаки, идеи…"
        aria-label="Поиск"
        className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
      />
    </form>
  )
}

/** Шапка для компьютера — DESIGN_WEB 2 */
function Header() {
  const { me, authed, setLoginOpen } = useStore()
  const { openCreate } = useUi()
  return (
    <header className="glass sticky top-0 z-40 hidden border-x-0 border-t-0 md:block">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 lg:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2 rounded-xl" aria-label="Клубок — на главную">
          <Logo size={32} />
          <span className="text-xl font-bold">Клубок</span>
        </Link>
        <nav className="flex shrink-0 items-center gap-1" aria-label="Разделы">
          {TABS.slice(0, 3).map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx(
                  'press rounded-2xl border px-3.5 py-2 text-sm font-semibold',
                  isActive ? 'chip-on' : 'border-transparent hover:bg-active',
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <SearchBox className="mx-auto w-full max-w-xl" />
        <Button size="sm" icon={Plus} onClick={openCreate} className="shrink-0">
          Создать
        </Button>
        {authed ? (
          <Link to="/me" className="shrink-0 rounded-full" aria-label="Мой профиль">
            <Avatar user={me} size={36} />
          </Link>
        ) : (
          <Button size="sm" kind="secondary" icon={LogIn} onClick={() => setLoginOpen(true)} className="shrink-0">
            Войти
          </Button>
        )}
      </div>
    </header>
  )
}

/** Нижнее меню-«пилюля» и FAB для телефона — DESIGN_SYSTEM 7.1, 7.4 */
function BottomNav() {
  const { openCreate } = useUi()
  const { pathname } = useLocation()
  const onPost = pathname.startsWith('/p/')
  return (
    <>
      {!onPost && (
        <button
          type="button"
          onClick={openCreate}
          aria-label="Создать"
          className="press grad fixed right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg md:hidden"
          style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 6px) + 54px + 12px)' }}
        >
          <Plus size={26} strokeWidth={2.4} />
        </button>
      )}
      <nav aria-label="Разделы" className="fixed inset-x-2 z-40 md:hidden" style={{ bottom: 'max(env(safe-area-inset-bottom), 6px)' }}>
        <div className="glass flex h-[54px] gap-1 rounded-2xl p-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx(
                  'press flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border',
                  isActive ? 'chip-on' : 'border-transparent',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <t.icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
                  <span className="text-[10px] leading-[10px] font-semibold">{t.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}

/** Шапка главного экрана на телефоне: логотип и поиск */
export function MobileTop({ title }: { title?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-3 pb-2 md:hidden">
      {title ? (
        <h1 className="flex-1 text-2xl font-bold">{title}</h1>
      ) : (
        <Link to="/" className="flex flex-1 items-center gap-2">
          <Logo size={30} />
          <span className="text-xl font-bold">Клубок</span>
        </Link>
      )}
      <Link to="/search" aria-label="Поиск" className="press card inline-flex h-9 w-9 items-center justify-center">
        <Search size={18} />
      </Link>
    </div>
  )
}

/** Пока грузятся данные — пульсирующие плитки; нет связи — кнопка «Повторить» */
function Loading() {
  const { failed, retry } = useStore()
  if (failed)
    return (
      <div className="flex flex-col items-center">
        <Empty icon={WifiOff}>Не удалось загрузить идеи. Проверьте интернет.</Empty>
        <Button kind="secondary" size="sm" icon={RotateCcw} onClick={retry}>
          Повторить
        </Button>
      </div>
    )
  return (
    <div
      className="grid grid-cols-2 gap-2 px-2 pt-16 sm:grid-cols-3 md:px-4 md:pt-16 lg:grid-cols-5 lg:px-6"
      aria-label="Загрузка"
      role="status"
    >
      {[1.3, 1, 1.4, 1.1, 1.2, 0.9, 1.3, 1, 1.2, 1.4].map((r, i) => (
        <div key={i} className="animate-pulse rounded-2xl bg-elevated" style={{ aspectRatio: `1 / ${r}` }} />
      ))}
    </div>
  )
}

export function Layout() {
  const { ready } = useStore()
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-3 focus:py-2"
      >
        К содержимому
      </a>
      <Header />
      <main id="main" className="mx-auto max-w-[1600px] pb-32 md:pb-12">
        {ready ? <Outlet /> : <Loading />}
      </main>
      <BottomNav />
    </>
  )
}

export { SearchBox }
