import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BarChart3 } from 'lucide-react'
import { useStore } from '../store'
import { cx, num, plural } from '../lib'
import { supabase } from '../supabase'
import type { Img } from '../data/types'
import { Empty, IconButton, Picture, Segmented } from '../components/ui'
import { LoginForm } from '../components/LoginSheet'
import { Bone } from '../components/Skeleton'

/** Ответ функции базы my_stats — только числа, кто именно смотрел — не показывается */
interface Stats {
  since: string
  totals: {
    views: number
    viewers: number
    opens: number
    openers: number
    dwell_avg: number
    dwell_median: number
    saves: number
    unsaves: number
    done: number
    shares: number
    profile_visits: number
    follows_from_post: number
    tries: number
    tries_ok: number
    tries_photo: number
    replies: number
  }
  profile: { followers: number; follows: number; unfollows: number; visits: number; visitors: number } | null
  by_source: Record<string, { views: number; opens: number }>
  by_device: Record<string, { views: number; opens: number }>
  slides: { n: number; people: number }[]
  by_day: { d: string; views: number; opens: number; saves: number; tries: number; follows: number }[]
  by_hour: { h: number; views: number }[]
  posts:
    | {
        id: string
        title: string
        images: Img[]
        hidden: boolean
        views: number
        opens: number
        saves: number
        tries: number
        saves_total: number
        tries_total: number
      }[]
    | null
}

const SOURCES: Record<string, string> = {
  home: 'Лента «Для вас»',
  search: 'Поиск',
  following: 'Подписки',
  profile: 'Ваш профиль',
  more: '«Ещё идеи» под другими',
  folder: 'Папки',
  link: 'По ссылке',
  other: 'Другое',
}
const DEVICES: Record<string, string> = { mobile: 'Телефон', desktop: 'Компьютер', other: 'Другое' }
type Metric = 'views' | 'opens' | 'saves' | 'tries' | 'follows'
const METRICS: { id: Metric; label: string }[] = [
  { id: 'views', label: 'Показы' },
  { id: 'opens', label: 'Открытия' },
  { id: 'saves', label: 'Сохранения' },
  { id: 'tries', label: 'Повторили' },
  { id: 'follows', label: 'Подписки' },
]

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—')
const secs = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} мин ${Math.round(s % 60)} с` : `${Math.round(s)} с`)
const dayLabel = (d: string, long = false) =>
  new Date(d + 'T12:00:00').toLocaleDateString(
    'ru-RU',
    long ? { day: 'numeric', month: 'long', weekday: 'short' } : { day: '2-digit', month: '2-digit' },
  )

/** «Круглые» деления оси: 0, 5, 10… — чтобы подписи читались */
function niceMax(v: number) {
  if (v <= 4) return 4
  const p = 10 ** Math.floor(Math.log10(v))
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p
  return 10 * p
}

/**
 * Столбики (один ряд данных — подпись не нужна, её говорит заголовок): ось с круглыми делениями,
 * подписи снизу — не у каждого столбика, значение — во всплывающей подсказке при наведении или фокусе.
 */
export function Columns({ data, label }: { data: { key: string; tip: string; tick: string; value: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const ticks = [0, max / 2, max]
  const every = Math.ceil(data.length / 8)
  return (
    <div className="relative" role="img" aria-label={label}>
      <div className="flex">
        {/* ось значений */}
        <div className="relative mr-2 h-40 w-8 shrink-0 text-right text-[11px] tabular-nums text-muted">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 leading-[14px]" style={{ bottom: `calc(${(t / max) * 100}% - 7px)` }}>
              {num(t)}
            </span>
          ))}
        </div>
        <div className="relative h-40 flex-1">
          {ticks.map((t) => (
            <span key={t} className="absolute inset-x-0 h-px bg-chart-grid" style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              <button
                key={d.key}
                type="button"
                aria-label={`${d.tip}: ${num(d.value)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
                className="group relative flex h-full flex-1 items-end justify-center outline-none"
              >
                <span
                  className={cx(
                    'block w-full max-w-6 rounded-t-[4px] bg-chart transition-opacity',
                    hover !== null && hover !== i && 'opacity-50',
                  )}
                  style={{ height: `${(d.value / max) * 100}%`, marginInline: 1, minHeight: d.value ? 2 : 0 }}
                />
              </button>
            ))}
          </div>
          {hover !== null && data[hover] && (
            <div
              className="glass-strong pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl px-2.5 py-1.5 text-center whitespace-nowrap shadow-lg"
              style={{ left: `${((hover + 0.5) / data.length) * 100}%`, bottom: 'calc(100% + 4px)' }}
            >
              <span className="block text-sm font-bold">{num(data[hover].value)}</span>
              <span className="block text-[11px] text-muted">{data[hover].tip}</span>
            </div>
          )}
        </div>
      </div>
      <div className="ml-10 flex text-[11px] text-muted">
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 truncate text-center">
            {i % every === 0 ? d.tick : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Полоски в строку: название, полоска, число (и подпись мельче) */
function Bars({ rows }: { rows: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <p className="text-sm text-muted">Пока нет данных</p>
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        // телефон: название и число — строкой, полоска — под ними во всю ширину; компьютер — всё в одну строку
        <li key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,8rem)_1fr_8rem]">
          <span className="truncate">{r.label}</span>
          <span className="order-last col-span-2 h-3 overflow-hidden rounded-r-[4px] bg-chart-grid sm:order-none sm:col-span-1">
            <span className="block h-full rounded-r-[4px] bg-chart" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right whitespace-nowrap tabular-nums">
            <b>{num(r.value)}</b>
            {r.sub && <span className="ml-1.5 text-xs text-muted">{r.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-2xl leading-8 font-bold">{value}</p>
      {sub && <p className="text-xs">{sub}</p>}
    </div>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="text-base font-bold">{title}</h2>
      {hint && <p className="mt-0.5 mb-3 text-xs text-muted">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  )
}

/** Статистика автора: по всем идеям (/stats) или по одной (/stats/:id). Только числа — кто смотрел, не показывается */
export function StatsPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { authed, authReady, post, ensurePosts } = useStore()
  const [days, setDays] = useState<'7' | '30' | '90'>('30')
  const [data, setData] = useState<Stats | null>(null)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState(false)
  const [metric, setMetric] = useState<Metric>('views')
  // смена периода: прежние цифры остаются (бледнее), пока не придут новые — без мигания
  const p = id ? post(id) : undefined

  useEffect(() => {
    if (id) ensurePosts([id])
  }, [id, ensurePosts])
  useEffect(() => {
    if (!authed) return
    let live = true
    setErr('')
    setPending(true)
    supabase.rpc('my_stats', { p_post: id ?? null, p_days: Number(days) }).then(({ data, error }) => {
      if (!live) return
      setPending(false)
      if (error)
        setErr(
          /не ваша/.test(error.message)
            ? 'Это не ваша идея — её статистику видит только автор.'
            : 'Не удалось загрузить статистику. Обновите страницу.',
        )
      else setData(data as Stats)
    })
    return () => {
      live = false
    }
  }, [authed, id, days])

  const byDay = useMemo(
    () => (data?.by_day ?? []).map((d) => ({ key: d.d, tip: dayLabel(d.d, true), tick: dayLabel(d.d), value: d[metric] })),
    [data, metric],
  )
  const byHour = useMemo(
    () => (data?.by_hour ?? []).map((h) => ({ key: String(h.h), tip: `${h.h}:00–${h.h}:59`, tick: `${h.h}`, value: h.views })),
    [data],
  )

  if (authReady && !authed)
    return (
      <div className="mx-auto max-w-sm px-3 pt-10 md:pt-16">
        <LoginForm hint="Войдите, чтобы видеть статистику своих идей." />
      </div>
    )
  if (err) return <Empty icon={BarChart3}>{err}</Empty>

  const t = data?.totals
  const pr = data?.profile
  const sources = Object.entries(data?.by_source ?? {})
    .map(([k, v]) => ({ label: SOURCES[k] ?? k, value: v.views, sub: `открыли ${num(v.opens)}` }))
    .sort((a, b) => b.value - a.value)
  const devices = Object.entries(data?.by_device ?? {})
    .map(([k, v]) => ({ label: DEVICES[k] ?? k, value: v.views, sub: `открыли ${num(v.opens)}` }))
    .sort((a, b) => b.value - a.value)
  const first = data?.slides.find((s) => s.n === 1)?.people ?? 0
  const slides = (data?.slides ?? []).map((s) => ({ label: `${s.n}-я картинка`, value: s.people, sub: pct(s.people, first) }))
  const loading = !data

  return (
    <div className={cx('mx-auto max-w-5xl px-3 pt-3 transition-opacity md:pt-6', pending && data && 'opacity-60')}>
      {/* заголовок и период — одной строкой над всем, что ниже */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <IconButton icon={ArrowLeft} label="Назад" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/me'))} />
        {id ? (
          <Link to={`/p/${id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl">
            {p && <Picture img={{ ...p.images[0], ratio: 1 }} w={120} className="h-10 w-10 shrink-0 rounded-xl" />}
            <span className="min-w-0">
              <span className="block text-xs text-muted">Статистика идеи</span>
              <span className="block truncate text-lg font-bold">{p?.title ?? '…'}</span>
            </span>
          </Link>
        ) : (
          <h1 className="min-w-0 flex-1 text-2xl font-bold">Статистика</h1>
        )}
        <div className="w-full sm:w-72">
          <Segmented
            value={days}
            onChange={setDays}
            options={[
              { id: '7', label: '7 дней' },
              { id: '30', label: '30 дней' },
              { id: '90', label: '90 дней' },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="status" aria-label="Загрузка">
          {Array.from({ length: 8 }, (_, i) => (
            <Bone key={i} className="h-[92px] rounded-2xl" />
          ))}
        </div>
      ) : (
        t && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Tile
                label="Показы в лентах"
                value={num(t.views)}
                sub={`${num(t.viewers)} ${plural(t.viewers, 'человек', 'человека', 'человек')}`}
              />
              <Tile label="Открыли идею" value={num(t.opens)} sub={`${pct(t.opens, t.views)} от показов`} />
              <Tile
                label="Смотрят идею"
                value={t.dwell_avg ? secs(t.dwell_avg) : '—'}
                sub={t.dwell_median ? `в среднем · обычно ${secs(t.dwell_median)}` : 'в среднем'}
              />
              <Tile label="Сохранили в папки" value={num(t.saves)} sub={`убрали ${num(t.unsaves)} · «Сделано» ${num(t.done)}`} />
              <Tile label="Повторили" value={num(t.tries)} sub={`получилось ${num(t.tries_ok)} · с фото ${num(t.tries_photo)}`} />
              <Tile label="Ответы на отзывы" value={num(t.replies)} />
              <Tile label="«Поделиться»" value={num(t.shares)} sub="скопировали ссылку" />
              <Tile label="Подписались со страницы идеи" value={num(t.follows_from_post)} />
              {pr && (
                <>
                  <Tile label="Подписчики" value={num(pr.followers)} sub={`+${num(pr.follows)} · −${num(pr.unfollows)} за период`} />
                  <Tile
                    label="Зашли в профиль"
                    value={num(pr.visits)}
                    sub={`${num(pr.visitors)} ${plural(pr.visitors, 'человек', 'человека', 'человек')}`}
                  />
                </>
              )}
            </div>

            <Card title="По дням">
              <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
                {METRICS.filter((m) => m.id !== 'follows' || !id).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={metric === m.id}
                    onClick={() => setMetric(m.id)}
                    className={cx(
                      'press shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold',
                      metric === m.id ? 'chip-on' : 'border-line bg-surface hover:bg-active',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <Columns data={byDay} label={`${METRICS.find((m) => m.id === metric)?.label} по дням`} />
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs font-semibold text-muted">Таблицей</summary>
                <table className="mt-2 w-full text-xs tabular-nums">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1 text-left font-semibold">День</th>
                      {METRICS.filter((m) => m.id !== 'follows' || !id).map((m) => (
                        <th key={m.id} className="py-1 text-right font-semibold">
                          {m.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...(data?.by_day ?? [])].reverse().map((d) => (
                      <tr key={d.d} className="border-t border-line">
                        <td className="py-1">{dayLabel(d.d)}</td>
                        {METRICS.filter((m) => m.id !== 'follows' || !id).map((m) => (
                          <td key={m.id} className="py-1 text-right">
                            {num(d[m.id])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </Card>

            <div className="grid gap-3 md:grid-cols-2">
              <Card title="Откуда приходят" hint="Где показали карточку и сколько оттуда открыли">
                <Bars rows={sources} />
              </Card>
              <Card title="До какой картинки долистали" hint="Сколько разных людей дошли до картинки (от открывших)">
                <Bars rows={slides} />
              </Card>
              <Card title="Когда смотрят" hint="Показы и открытия по часам (московское время)">
                <Columns data={byHour} label="Показы по часам" />
              </Card>
              <Card title="С чего смотрят">
                <Bars rows={devices} />
              </Card>
            </div>

            {data?.posts && (
              <Card title="По идеям" hint="За выбранный период; «всего» — за всё время">
                {data.posts.length ? (
                  <div className="-mx-1 overflow-x-auto px-1">
                    <table className="w-full min-w-[560px] text-sm whitespace-nowrap tabular-nums">
                      <thead className="text-xs text-muted">
                        <tr>
                          <th className="py-1.5 text-left font-semibold">Идея</th>
                          <th className="py-1.5 text-right font-semibold">Показы</th>
                          <th className="py-1.5 text-right font-semibold">Открыли</th>
                          <th className="py-1.5 text-right font-semibold">Доля</th>
                          <th className="py-1.5 text-right font-semibold">Сохранили</th>
                          <th className="py-1.5 text-right font-semibold">Повторили</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.posts.map((x) => (
                          <tr key={x.id} className="border-t border-line">
                            <td className="py-2 pr-3">
                              <Link to={`/stats/${x.id}`} className="flex items-center gap-2 hover:underline">
                                {x.images?.[0] && (
                                  <Picture img={{ ...x.images[0], ratio: 1 }} w={120} className="h-8 w-8 shrink-0 rounded-lg" />
                                )}
                                <span className="line-clamp-1">{x.title}</span>
                                {x.hidden && (
                                  <span className="shrink-0 rounded-full bg-rose-500/10 px-1.5 text-[10px] font-bold text-rose-500">
                                    скрыта
                                  </span>
                                )}
                              </Link>
                            </td>
                            <td className="py-2 text-right">{num(x.views)}</td>
                            <td className="py-2 text-right">{num(x.opens)}</td>
                            <td className="py-2 text-right">{pct(x.opens, x.views)}</td>
                            <td className="py-2 text-right">
                              {num(x.saves)} <span className="text-xs text-muted">/ {num(x.saves_total)}</span>
                            </td>
                            <td className="py-2 text-right">
                              {num(x.tries)} <span className="text-xs text-muted">/ {num(x.tries_total)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted">Вы ещё ничего не публиковали.</p>
                )}
              </Card>
            )}
            <p className="px-1 pb-4 text-xs text-muted">
              Свои просмотры не считаются. Показ — карточка была видна хотя бы наполовину; в одной вкладке одна идея считается один раз.
            </p>
          </div>
        )
      )}
    </div>
  )
}
