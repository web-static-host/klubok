import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Ban,
  Bell,
  Bookmark,
  CircleCheck,
  EyeOff,
  Eye,
  Flag,
  MessageCircle,
  Settings,
  ShieldAlert,
  Trash2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import type { Notice, NoticeSettings } from '../data/types'
import { useStore } from '../store'
import { cx, plural, timeAgo } from '../lib'
import { MobileTop } from '../components/Layout'
import { Avatar, Empty, Segmented, Toggle } from '../components/ui'
import { LoginForm } from '../components/LoginSheet'
import { Bone } from '../components/Skeleton'

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const quote = (t: string) => (t ? `«${t}»` : '')

/** Текст, значок и ссылка уведомления. Кто сохранил идею — не показываем (только числа), остальное — с именем */
function describe(n: Notice, name: string): { icon: LucideIcon; text: string; to?: string; bad?: boolean } {
  const d = n.data
  const title = quote(str(d.title))
  const post = n.postId ? `/p/${n.postId}` : undefined
  const reason = str(d.reason)
  switch (n.kind) {
    case 'tried':
      return {
        icon: CircleCheck,
        text: `${name} повторяет вашу идею ${title} — ${d.ok ? 'получилось' : 'не получилось'}`,
        to: post && `${post}?tab=tries`,
      }
    case 'reply':
      return {
        icon: MessageCircle,
        text: `${d.mine ? 'Ответ на ваш отзыв' : 'Ответ на отзыв к вашей идее'} ${title} от ${name}: ${quote(str(d.text))}`,
        to: post && `${post}?tab=tries`,
      }
    case 'follower':
      return { icon: UserPlus, text: `Новый подписчик: ${name}`, to: n.actorId && `/u/${n.actorId}` }
    case 'saved':
      return { icon: Bookmark, text: `Вашу идею ${title} сохранили в папку`, to: post }
    case 'saves_daily': {
      const c = Number(d.count) || 0
      const titles = (Array.isArray(d.titles) ? d.titles : []).map(String).slice(0, 3).map(quote).join(', ')
      const day = str(d.date) ? new Date(str(d.date)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : ''
      return {
        icon: Bookmark,
        text: `За ${day} ваши идеи сохранили ${c} ${plural(c, 'раз', 'раза', 'раз')}${titles ? `: ${titles}` : ''}`,
        to: '/stats',
      }
    }
    case 'hidden':
      return {
        icon: EyeOff,
        bad: true,
        text: `Идея ${title} скрыта${d.by === 'moderator' ? ' модератором' : ''}${reason ? `: ${reason}` : ''}`,
        to: post,
      }
    case 'restored':
      return { icon: Eye, text: `Идея ${title} снова видна всем`, to: post }
    case 'removed': {
      const what = d.what === 'try' ? 'ваш отзыв к идее' : d.what === 'reply' ? 'ваш ответ к идее' : 'вашу идею'
      return {
        icon: Trash2,
        bad: true,
        text: `Модератор удалил ${what} ${title}${reason ? `: ${reason}` : ''}`,
        to: d.what !== 'post' ? post : undefined,
      }
    }
    case 'report_done':
      return {
        icon: Flag,
        text:
          d.status === 'accepted'
            ? `Ваша жалоба рассмотрена: меры приняты${str(d.what) ? ` (${str(d.what)})` : ''}. Спасибо!`
            : 'Ваша жалоба рассмотрена: нарушений не нашли',
      }
    case 'blocked':
      return {
        icon: Ban,
        bad: true,
        text: `Ваш аккаунт заблокирован за нарушение правил Клубка${reason ? `: ${reason}` : ''}`,
        to: '/rules',
      }
    case 'unblocked':
      return { icon: ShieldAlert, text: 'Ваш аккаунт разблокирован' }
    case 'profile_cleared':
      return {
        icon: ShieldAlert,
        bad: true,
        text: `Модератор сбросил имя, описание и фото профиля${reason ? `: ${reason}` : ''}`,
        to: '/me',
      }
  }
  return { icon: Bell, text: 'Уведомление' }
}

function Item({ n }: { n: Notice }) {
  const { user } = useStore()
  const actor = n.actorId ? user(n.actorId) : undefined
  // кто сохранил — не показываем
  const showActor = actor && n.kind !== 'saved'
  const { icon: Icon, text, to, bad } = describe(n, actor?.name ?? 'Кто-то')
  const body = (
    <>
      <span className="relative shrink-0">
        {showActor ? (
          <Avatar user={actor} size={40} />
        ) : (
          <span
            className={cx(
              'inline-flex h-10 w-10 items-center justify-center rounded-full',
              bad ? 'bg-rose-500/10 text-rose-500' : 'chip-on border',
            )}
          >
            <Icon size={20} />
          </span>
        )}
        {showActor && (
          <span className="absolute -right-1 -bottom-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface">
            <Icon size={12} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-snug">{text}</span>
        <span className="mt-0.5 block text-xs">{timeAgo(n.createdAt)}</span>
      </span>
      {!n.read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-label="Новое" />}
    </>
  )
  const cls = cx('flex items-start gap-3 rounded-2xl p-3', !n.read && 'bg-accent/5')
  return (
    <li>
      {to ? (
        <Link to={to} className={cx(cls, 'press hover:bg-active')}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  )
}

/** Какие уведомления присылать. Сохранения — каждое, сводкой за день или никогда */
function SettingsPanel() {
  const { noticeSettings: s, saveNoticeSettings: set } = useStore()
  const toggle = (k: keyof Omit<NoticeSettings, 'saves'>, label: string, hint?: string) => (
    <Toggle checked={s[k]} onChange={(v) => set({ [k]: v })} label={label} hint={hint} />
  )
  return (
    <section className="card mb-4 flex flex-col gap-2 p-3" aria-label="Настройки уведомлений">
      <p className="section-label px-1">Присылать</p>
      {toggle('tried', 'Кто-то повторил вашу идею', '«Я попробовал»: получилось или нет')}
      {toggle('reply', 'Ответы на отзывы', 'На ваш отзыв и на отзывы к вашим идеям')}
      {toggle('follower', 'Новые подписчики')}
      {toggle('moderation', 'Решения модератора', 'Идея скрыта или возвращена, жалоба рассмотрена')}
      <div className="px-1 pt-2">
        <p className="mb-2 text-sm font-medium">Сохранения ваших идей в папки</p>
        <Segmented<NoticeSettings['saves']>
          value={s.saves}
          onChange={(v) => set({ saves: v })}
          options={[
            { id: 'each', label: 'Каждое' },
            { id: 'daily', label: 'Раз в день' },
            { id: 'off', label: 'Не надо' },
          ]}
        />
        <p className="mt-1.5 text-xs text-muted">«Раз в день» — одно уведомление: сколько раз сохранили за прошедший день.</p>
      </div>
    </section>
  )
}

export function Notifications() {
  const { authed, authReady, notices, noticesLoaded, loadNotices, markNoticesRead } = useStore()
  const [params] = useSearchParams()
  const [settings, setSettings] = useState(params.get('settings') === '1')
  useEffect(() => {
    if (authed) loadNotices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed])
  // посмотрел — прочитано (через пару секунд, чтобы новые успели выделиться)
  useEffect(() => {
    if (!noticesLoaded) return
    const t = setTimeout(markNoticesRead, 2500)
    return () => clearTimeout(t)
  }, [noticesLoaded, markNoticesRead])

  if (authReady && !authed)
    return (
      <>
        <MobileTop title="Уведомления" />
        <div className="mx-auto max-w-sm px-3 pt-4 md:pt-16">
          <LoginForm hint="Войдите, чтобы видеть, кто повторил ваши идеи и ответил на отзывы." />
        </div>
      </>
    )

  return (
    <>
      <MobileTop title="Уведомления" />
      <div className="mx-auto max-w-[640px] px-3 md:pt-6">
        <div className="mb-3 flex items-center gap-2">
          <h1 className="hidden flex-1 text-2xl font-bold md:block">Уведомления</h1>
          <div className="flex-1 md:hidden" />
          <button
            type="button"
            aria-expanded={settings}
            onClick={() => setSettings((v) => !v)}
            className={cx(
              'press inline-flex h-9 items-center gap-1.5 rounded-2xl border px-3 text-sm font-semibold',
              settings ? 'chip-on' : 'border-line bg-surface hover:bg-active',
            )}
          >
            <Settings size={16} /> Настройки
          </button>
        </div>
        {settings && <SettingsPanel />}
        {!noticesLoaded && !notices.length ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Загрузка">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Bone className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1">
                  <Bone className="h-3.5 w-4/5" />
                  <Bone className="mt-2 h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : notices.length ? (
          <ul className="card flex flex-col p-1">
            {notices.map((n) => (
              <Item key={n.id} n={n} />
            ))}
          </ul>
        ) : (
          <Empty icon={Bell}>Пока тихо. Здесь появится, кто повторил ваши идеи, ответил на отзыв или подписался на вас.</Empty>
        )}
      </div>
    </>
  )
}
