import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Ban,
  Check,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  Flag,
  LogOut,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react'
import { supabase } from '../supabase'
import { cx, num, timeAgo } from '../lib'
import { REPORT_REASONS, type Img } from '../data/types'
import { Avatar, Button, Logo, Picture, Segmented } from '../components/ui'
import { Bone } from '../components/Skeleton'
import { Columns, Tile } from '../pages/Stats'

/**
 * Админка — отдельный адрес (admin.html), ссылок на неё на сайте нет. Вход — обычный аккаунт.
 * Права проверяет база (таблица admins): без них функции admin_* отвечают «нет доступа», действия — функция publish.
 */

const IMG = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/images/`
const site = (hash: string) => `./#${hash}`
const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.id === r)?.label ?? r
const when = (iso: string) => timeAgo(Date.parse(iso))

interface Who {
  id: string
  name: string
  handle: string
  blocked?: boolean
}
type Target = 'post' | 'try' | 'reply' | 'profile'

/** Действие модератора — через функцию publish (там проверка, что вы админ) */
async function act(op: string, type: Target, id: string, note = ''): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('publish', { body: { action: 'admin', op, type, id, note } })
  if (error) {
    try {
      return ((await (error as { context?: Response }).context?.json())?.reasons ?? ['Ошибка']).join('. ')
    } catch {
      return 'Нет связи'
    }
  }
  return data?.ok ? null : (data?.reasons ?? ['Ошибка']).join('. ')
}

function useRpc<T>(fn: string, args: Record<string, unknown>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    setErr('')
    supabase.rpc(fn, args).then(({ data, error }) => {
      if (!live) return
      if (error) setErr(error.message)
      else setData(data as T)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n])
  return { data, err, reload: () => setN((x) => x + 1) }
}

function WhoLink({ who }: { who: Who }) {
  return (
    <a
      href={site(`/u/${who.id}`)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-semibold hover:underline"
    >
      {who.name} <span className="font-normal text-muted">@{who.handle}</span>
      {who.blocked && <span className="rounded-full bg-rose-500/10 px-1.5 text-[10px] font-bold text-rose-500">заблокирован</span>}
    </a>
  )
}

function Images({ images }: { images: Img[] }) {
  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
      {images.map((im, i) => (
        <a key={i} href={im.src} target="_blank" rel="noreferrer" className="shrink-0">
          <Picture img={{ ...im, ratio: 1 }} w={200} className="h-24 w-24 rounded-xl" />
        </a>
      ))}
    </div>
  )
}

/** Кнопки действия: с подтверждением результата и сообщением об ошибке */
function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-2">{children}</div>
}
function useAct(onDone: () => void) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const run = async (key: string, op: string, type: Target, id: string, note: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(key)
    setMsg('')
    const e = await act(op, type, id, note)
    setBusy('')
    if (e) setMsg(e)
    else onDone()
  }
  return { busy, msg, run }
}

// ─── Жалобы ───
interface ReportGroup {
  type: Target
  id: string
  count: number
  first: string
  last: string
  reasons: { reason: string; comment: string | null; link: string | null; at: string; reporter: Who }[]
  target: {
    title?: string
    images?: Img[]
    hidden?: boolean
    hidden_reason?: string
    text?: string
    img?: Img | null
    ok?: boolean
    post_id?: string
    name?: string
    handle?: string
    bio?: string
    avatar_url?: string | null
    blocked?: boolean
    author: Who
  } | null
}

function ReportCard({ g, onDone, open }: { g: ReportGroup; onDone: () => void; open: boolean }) {
  const [note, setNote] = useState('')
  const { busy, msg, run } = useAct(onDone)
  const t = g.target
  const what = { post: 'Идея', try: 'Отзыв «Я попробовал»', reply: 'Ответ на отзыв', profile: 'Профиль' }[g.type]
  const B = (
    key: string,
    op: string,
    label: string,
    icon: typeof Ban,
    kind: 'neutral' | 'danger' = 'neutral',
    type: Target = g.type,
    id = g.id,
    confirm?: string,
  ) => (
    <Button size="sm" kind={kind} icon={icon} disabled={!!busy} onClick={() => run(key, op, type, id, note, confirm)}>
      {busy === key ? '…' : label}
    </Button>
  )
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border chip-on px-2 py-0.5 font-bold">{what}</span>
        <span className="font-bold text-rose-500">
          {g.count} {g.count === 1 ? 'жалоба' : g.count < 5 ? 'жалобы' : 'жалоб'}
        </span>
        <span className="text-muted">последняя {when(g.last)}</span>
      </div>
      {!t ? (
        <p className="mt-2 text-sm text-muted">Уже удалено.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {g.type === 'post' && (
            <>
              <a
                href={site(`/p/${g.id}`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-bold hover:underline"
              >
                {t.title} <ExternalLink size={13} />
              </a>
              {t.hidden && <p className="text-xs text-rose-500">Уже скрыта: {t.hidden_reason}</p>}
              <Images images={t.images ?? []} />
            </>
          )}
          {(g.type === 'try' || g.type === 'reply') && (
            <>
              <p className="text-xs text-muted">
                к идее{' '}
                <a href={site(`/p/${t.post_id}?tab=tries`)} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                  «{t.title}»
                </a>
              </p>
              {g.type === 'try' && <p className="text-xs font-bold">{t.ok ? 'Получилось' : 'Не получилось'}</p>}
              {t.text && <p className="rounded-xl bg-elevated px-3 py-2 whitespace-pre-wrap">{t.text}</p>}
              {t.img && <Images images={[t.img]} />}
            </>
          )}
          {g.type === 'profile' && (
            <div className="flex items-center gap-3">
              <Avatar
                user={{
                  id: g.id,
                  name: t.name ?? '',
                  handle: t.handle ?? '',
                  bio: '',
                  colors: ['#94A3B8', '#64748B'],
                  followers: 0,
                  avatar: t.avatar_url ?? undefined,
                }}
                size={56}
              />
              <div>
                <p className="font-bold">{t.name}</p>
                <p className="text-xs text-muted">@{t.handle}</p>
                {t.bio && <p className="mt-1 text-sm">{t.bio}</p>}
              </div>
            </div>
          )}
          <p className="text-xs">
            Автор: <WhoLink who={t.author} />
          </p>
        </div>
      )}
      <ul className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-xs">
        {g.reasons.map((r, i) => (
          <li key={i}>
            <b>{reasonLabel(r.reason)}</b> — <WhoLink who={r.reporter} /> · {when(r.at)}
            {r.comment && <span className="mt-0.5 block whitespace-pre-wrap text-muted">«{r.comment}»</span>}
            {r.link && (
              <span className="mt-0.5 block break-all">
                Оригинал:{' '}
                <a href={r.link} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline">
                  {r.link}
                </a>
              </span>
            )}
          </li>
        ))}
      </ul>
      {open && t && (
        <>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Причина для автора (по желанию)"
            className="card mt-3 w-full px-3 py-2 text-sm outline-none placeholder:text-muted"
          />
          <Actions>
            {g.type === 'post' && B('hide', 'hide', 'Скрыть', EyeOff, 'danger')}
            {g.type === 'post' && B('del', 'delete', 'Удалить', Trash2, 'danger', 'post', g.id, 'Удалить идею насовсем?')}
            {(g.type === 'try' || g.type === 'reply') && B('del', 'delete', 'Удалить', Trash2, 'danger', g.type, g.id, 'Удалить насовсем?')}
            {g.type === 'profile' && B('clear', 'clear', 'Сбросить имя, описание, фото', Eraser, 'danger')}
            {!t.author.blocked &&
              B('block', 'block', 'Заблокировать автора', Ban, 'danger', 'profile', t.author.id, `Заблокировать @${t.author.handle}?`)}
            {B('reject', 'reject', 'Нарушения нет', Check)}
          </Actions>
        </>
      )}
      {msg && <p className="mt-2 text-xs font-semibold text-rose-500">{msg}</p>}
    </li>
  )
}

function Reports() {
  const [status, setStatus] = useState<'open' | 'accepted' | 'rejected'>('open')
  const { data, err, reload } = useRpc<ReportGroup[]>('admin_reports', { p_status: status }, [status])
  return (
    <>
      <div className="mb-3 max-w-md">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { id: 'open', label: 'Новые' },
            { id: 'accepted', label: 'Приняты' },
            { id: 'rejected', label: 'Отклонены' },
          ]}
        />
      </div>
      <List data={data} err={err} empty={status === 'open' ? 'Новых жалоб нет' : 'Пусто'}>
        {(data ?? []).map((g) => (
          <ReportCard key={g.type + g.id} g={g} onDone={reload} open={status === 'open'} />
        ))}
      </List>
    </>
  )
}

// ─── Скрытые ───
interface HiddenPost {
  id: string
  title: string
  images: Img[]
  reason: string
  by: string
  created_at: string
  author: Who
}
function HiddenCard({ p, onDone }: { p: HiddenPost; onDone: () => void }) {
  const { busy, msg, run } = useAct(onDone)
  return (
    <li className="card p-4 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cx('rounded-full px-2 py-0.5 font-bold', p.by === 'moderator' ? 'border chip-on' : 'bg-rose-500/10 text-rose-500')}
        >
          {p.by === 'moderator' ? 'скрыл модератор' : 'скрыл ИИ'}
        </span>
        <span className="text-muted">{when(p.created_at)}</span>
      </div>
      <a href={site(`/p/${p.id}`)} target="_blank" rel="noreferrer" className="font-bold hover:underline">
        {p.title}
      </a>
      <p className="mt-1 text-xs text-rose-500">{p.reason}</p>
      <div className="mt-2">
        <Images images={p.images} />
      </div>
      <p className="mt-2 text-xs">
        Автор: <WhoLink who={p.author} />
      </p>
      <Actions>
        <Button size="sm" icon={Eye} disabled={!!busy} onClick={() => run('restore', 'restore', 'post', p.id, '')}>
          {busy === 'restore' ? '…' : 'Ошибка — вернуть'}
        </Button>
        <Button size="sm" kind="neutral" icon={RefreshCw} disabled={!!busy} onClick={() => run('recheck', 'recheck', 'post', p.id, '')}>
          {busy === 'recheck' ? 'ИИ проверяет…' : 'Перепроверить ИИ'}
        </Button>
        <Button
          size="sm"
          kind="danger"
          icon={Trash2}
          disabled={!!busy}
          onClick={() => run('del', 'delete', 'post', p.id, p.reason, 'Удалить идею насовсем?')}
        >
          {busy === 'del' ? '…' : 'Удалить'}
        </Button>
      </Actions>
      {msg && <p className="mt-2 text-xs font-semibold text-rose-500">{msg}</p>}
    </li>
  )
}
function Hidden() {
  const { data, err, reload } = useRpc<HiddenPost[]>('admin_hidden', {}, [])
  return (
    <List data={data} err={err} empty="Скрытых идей нет">
      {(data ?? []).map((p) => (
        <HiddenCard key={p.id} p={p} onDone={reload} />
      ))}
    </List>
  )
}

// ─── Отказы ИИ ───
interface Refusal {
  path: string
  reasons: string[]
  strict: boolean
  by_ai: boolean
  created_at: string
  user: Who
}
function Refusals() {
  const { data, err } = useRpc<Refusal[]>('admin_refusals', { p_limit: 200 }, [])
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        Что ИИ не пропустил при загрузке и почему — чтобы видеть его ошибки. Картинки не опубликованы.
      </p>
      <List data={data} err={err} empty="Отказов нет" grid>
        {(data ?? []).map((r) => (
          <li key={r.path} className="card overflow-hidden text-xs">
            <a href={IMG + r.path} target="_blank" rel="noreferrer">
              <Picture img={{ src: IMG + r.path, ratio: 1 }} w={400} className="aspect-square w-full" />
            </a>
            <div className="p-3">
              <p className="font-semibold text-rose-500">{r.reasons.join('. ') || 'Без причины'}</p>
              <p className="mt-1">
                <WhoLink who={r.user} /> · {when(r.created_at)}
              </p>
              <p className="mt-0.5 text-muted">
                {r.strict ? 'идея' : 'аватар'}
                {r.by_ai ? ' · проверял ИИ' : ' · быстрые правила'}
              </p>
            </div>
          </li>
        ))}
      </List>
    </>
  )
}

// ─── Пользователи ───
interface UserRow {
  id: string
  name: string
  handle: string
  bio: string
  avatar_url: string | null
  blocked: boolean
  is_demo: boolean
  admin: boolean
  created_at: string
  followers: number
  posts: number
  hidden: number
  tries: number
  reports_against: number
  reports_by: number
  refusals: number
}
function UserCard({ u, onDone }: { u: UserRow; onDone: () => void }) {
  const { busy, msg, run } = useAct(onDone)
  return (
    <li className="card flex flex-wrap items-center gap-3 p-3 text-sm">
      <Avatar
        user={{
          id: u.id,
          name: u.name,
          handle: u.handle,
          bio: '',
          colors: ['#2DD4BF', '#0891B2'],
          followers: 0,
          avatar: u.avatar_url ?? undefined,
        }}
        size={44}
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <a href={site(`/u/${u.id}`)} target="_blank" rel="noreferrer" className="font-bold hover:underline">
            {u.name}
          </a>
          <span className="text-muted">@{u.handle}</span>
          {u.admin && <span className="rounded-full border chip-on px-1.5 text-[10px] font-bold">админ</span>}
          {u.is_demo && <span className="rounded-full bg-elevated px-1.5 text-[10px] font-bold">тестовый</span>}
          {u.blocked && <span className="rounded-full bg-rose-500/10 px-1.5 text-[10px] font-bold text-rose-500">заблокирован</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          с {new Date(u.created_at).toLocaleDateString('ru-RU')} · идей {u.posts}
          {u.hidden ? ` (скрыто ${u.hidden})` : ''} · отзывов {u.tries} · подписчиков {num(u.followers)} · жалоб на него{' '}
          <b className={u.reports_against ? 'text-rose-500' : ''}>{u.reports_against}</b> · его жалоб {u.reports_by} · отказов ИИ{' '}
          {u.refusals}
        </p>
        {msg && <p className="mt-1 text-xs font-semibold text-rose-500">{msg}</p>}
      </div>
      {!u.admin && (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            size="sm"
            kind="neutral"
            icon={Eraser}
            disabled={!!busy}
            onClick={() => run('clear', 'clear', 'profile', u.id, '', `Сбросить имя, описание и фото у @${u.handle}?`)}
          >
            Сбросить профиль
          </Button>
          {u.blocked ? (
            <Button size="sm" icon={UserCheck} disabled={!!busy} onClick={() => run('unblock', 'unblock', 'profile', u.id, '')}>
              Разблокировать
            </Button>
          ) : (
            <Button
              size="sm"
              kind="danger"
              icon={Ban}
              disabled={!!busy}
              onClick={() => run('block', 'block', 'profile', u.id, '', `Заблокировать @${u.handle}?`)}
            >
              Заблокировать
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
function Users() {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const { data, err, reload } = useRpc<UserRow[]>('admin_users', { p_q: query }, [query])
  return (
    <>
      <form
        className="card mb-3 flex max-w-md items-center gap-2 px-3"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(q.trim())
        }}
      >
        <Search size={18} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Имя или ник (пусто — новые)"
          className="h-10 min-w-0 flex-1 bg-transparent outline-none"
        />
      </form>
      <List data={data} err={err} empty="Никого не нашли">
        {(data ?? []).map((u) => (
          <UserCard key={u.id} u={u} onDone={reload} />
        ))}
      </List>
    </>
  )
}

// ─── Статистика сайта ───
interface SiteStats {
  totals: Record<'users' | 'posts' | 'hidden' | 'tries' | 'replies' | 'reports_open' | 'blocked', number>
  by_day: Record<string, number | string>[]
}
const SITE_METRICS: [string, string][] = [
  ['visitors', 'Посетители'],
  ['active', 'Вошедшие'],
  ['signups', 'Регистрации'],
  ['posts', 'Идеи'],
  ['tries', 'Отзывы'],
  ['replies', 'Ответы'],
  ['views', 'Показы'],
  ['reports', 'Жалобы'],
  ['refusals', 'Отказы ИИ'],
]
function SiteStatsView() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30')
  const [metric, setMetric] = useState('visitors')
  const { data, err } = useRpc<SiteStats>('admin_site_stats', { p_days: Number(days) }, [days])
  if (err) return <p className="text-sm text-rose-500">{err}</p>
  if (!data) return <Bone className="h-60 rounded-2xl" />
  const t = data.totals
  const series = data.by_day.map((d) => ({
    key: String(d.d),
    tip: new Date(String(d.d) + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
    tick: new Date(String(d.d) + 'T12:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
    value: Number(d[metric]) || 0,
  }))
  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-sm">
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
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile label="Пользователи" value={num(t.users)} sub={`заблокировано ${num(t.blocked)}`} />
        <Tile label="Идеи" value={num(t.posts)} sub={`скрыто ${num(t.hidden)}`} />
        <Tile label="Отзывы и ответы" value={num(t.tries)} sub={`ответов ${num(t.replies)}`} />
        <Tile label="Новые жалобы" value={num(t.reports_open)} />
      </div>
      <section className="card p-4">
        <h2 className="mb-3 text-base font-bold">По дням</h2>
        <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
          {SITE_METRICS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={metric === id}
              onClick={() => setMetric(id)}
              className={cx(
                'press shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold',
                metric === id ? 'chip-on' : 'border-line bg-surface hover:bg-active',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Columns data={series} label={`${SITE_METRICS.find((m) => m[0] === metric)?.[1]} по дням`} />
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted">Таблицей</summary>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[640px] text-xs tabular-nums">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 text-left font-semibold">День</th>
                  {SITE_METRICS.map(([id, label]) => (
                    <th key={id} className="py-1 text-right font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data.by_day].reverse().map((d) => (
                  <tr key={String(d.d)} className="border-t border-line">
                    <td className="py-1">{String(d.d)}</td>
                    {SITE_METRICS.map(([id]) => (
                      <td key={id} className="py-1 text-right">
                        {num(Number(d[id]) || 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  )
}

// ─── Журнал ───
interface LogRow {
  id: number
  action: string
  target_type: string
  target_id: string
  note: string | null
  created_at: string
  admin: Who
}
const ACTIONS: Record<string, string> = {
  hide: 'скрыл',
  restore: 'вернул',
  delete: 'удалил',
  reject: 'отклонил жалобы на',
  block: 'заблокировал',
  unblock: 'разблокировал',
  clear: 'сбросил профиль',
  recheck: 'перепроверил ИИ',
}
const TARGETS: Record<string, string> = { post: 'идею', try: 'отзыв', reply: 'ответ', profile: 'профиль' }
function Log() {
  const { data, err } = useRpc<LogRow[]>('admin_log_list', { p_limit: 300 }, [])
  return (
    <List data={data} err={err} empty="Действий пока не было">
      {(data ?? []).map((l) => (
        <li key={l.id} className="card px-4 py-3 text-sm">
          <b>{l.admin?.name ?? '—'}</b> {ACTIONS[l.action] ?? l.action}{' '}
          {l.target_type === 'post' || l.target_type === 'profile' ? (
            <a
              href={site(l.target_type === 'post' ? `/p/${l.target_id}` : `/u/${l.target_id}`)}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {TARGETS[l.target_type]}
            </a>
          ) : (
            (TARGETS[l.target_type] ?? l.target_type)
          )}
          {l.note && <span className="text-muted"> — {l.note}</span>}
          <span className="ml-2 text-xs text-muted">{new Date(l.created_at).toLocaleString('ru-RU')}</span>
        </li>
      ))}
    </List>
  )
}

function List({
  data,
  err,
  empty,
  grid,
  children,
}: {
  data: unknown[] | null
  err: string
  empty: string
  grid?: boolean
  children: ReactNode
}) {
  if (err) return <p className="text-sm text-rose-500">{err}</p>
  if (!data)
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Загрузка">
        <Bone className="h-28 rounded-2xl" />
        <Bone className="h-28 rounded-2xl" />
      </div>
    )
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">{empty}</p>
  return <ul className={grid ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4' : 'flex flex-col gap-3'}>{children}</ul>
}

// ─── Вход и разделы ───
function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  return (
    <form
      className="card mx-auto mt-16 flex max-w-sm flex-col gap-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault()
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setErr('Неверная почта или пароль')
      }}
    >
      <h1 className="text-xl font-bold">Админка Клубка</h1>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        autoComplete="email"
        placeholder="Почта"
        className="card px-4 py-3 outline-none"
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        autoComplete="current-password"
        placeholder="Пароль"
        className="card px-4 py-3 outline-none"
      />
      {err && <p className="text-xs font-semibold text-rose-500">{err}</p>}
      <Button type="submit">Войти</Button>
    </form>
  )
}

type Section = 'reports' | 'hidden' | 'refusals' | 'users' | 'stats' | 'log'
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'reports', label: 'Жалобы' },
  { id: 'hidden', label: 'Скрытые' },
  { id: 'refusals', label: 'Отказы ИИ' },
  { id: 'users', label: 'Пользователи' },
  { id: 'stats', label: 'Статистика' },
  { id: 'log', label: 'Журнал' },
]

export function Admin() {
  const [session, setSession] = useState<'unknown' | 'none' | 'in'>('unknown')
  const [admin, setAdmin] = useState<boolean | null>(null)
  const [section, setSection] = useState<Section>(() => SECTIONS.find((s) => s.id === location.hash.slice(1))?.id ?? 'reports')
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ? 'in' : 'none'))
    return () => data.subscription.unsubscribe()
  }, [])
  const checkAdmin = useCallback(() => {
    supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true))
  }, [])
  useEffect(() => {
    if (session === 'in') checkAdmin()
    else setAdmin(null)
  }, [session, checkAdmin])
  useEffect(() => {
    history.replaceState(null, '', `#${section}`)
  }, [section])

  if (session === 'unknown' || (session === 'in' && admin === null)) return <div className="p-6" />
  if (session === 'none') return <Login />
  if (!admin)
    return (
      <div className="mx-auto mt-16 max-w-sm p-5 text-center">
        <p className="text-lg font-bold">Нет доступа</p>
        <p className="mt-1 text-sm text-muted">Этот аккаунт не администратор.</p>
        <Button className="mt-4" kind="neutral" icon={LogOut} onClick={() => supabase.auth.signOut()}>
          Выйти
        </Button>
      </div>
    )

  return (
    <div className="mx-auto max-w-6xl px-3 pb-16">
      <header className="flex flex-wrap items-center gap-3 py-4">
        <a href="./" className="flex items-center gap-2">
          <Logo size={28} />
          <span className="text-lg font-bold">Клубок</span>
        </a>
        <span className="inline-flex items-center gap-1 rounded-full border chip-on px-2.5 py-1 text-xs font-bold">
          <ShieldCheck size={14} /> админка
        </span>
        <div className="flex-1" />
        <Button size="sm" kind="ghost" icon={RotateCcw} onClick={() => location.reload()}>
          Обновить
        </Button>
        <Button size="sm" kind="neutral" icon={LogOut} onClick={() => supabase.auth.signOut()}>
          Выйти
        </Button>
      </header>
      <nav className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1" aria-label="Разделы">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={section === s.id}
            onClick={() => setSection(s.id)}
            className={cx(
              'press inline-flex shrink-0 items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-sm font-semibold',
              section === s.id ? 'chip-on' : 'border-line bg-surface hover:bg-active',
            )}
          >
            {s.id === 'reports' && <Flag size={15} />}
            {s.label}
          </button>
        ))}
      </nav>
      {section === 'reports' && <Reports />}
      {section === 'hidden' && <Hidden />}
      {section === 'refusals' && <Refusals />}
      {section === 'users' && <Users />}
      {section === 'stats' && <SiteStatsView />}
      {section === 'log' && <Log />}
    </div>
  )
}
