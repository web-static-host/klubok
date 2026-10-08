/**
 * Собирает supabase/seed.sql из тестовых данных src/data/mock.ts.
 * Запуск: node --experimental-strip-types scripts/make-seed.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import type { Img } from '../src/data/types.ts'
import { posts, replies, tries, users, ME } from '../src/data/mock.ts'

/** Тестовые картинки лежат в хранилище Supabase: images/demo/<номер>.jpg (см. supabase/demo-images.json) */
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const base = env.match(/^VITE_SUPABASE_URL=(.+)$/m)![1].trim()
const pic = (img: Img): Img => (img.seed ? { src: `${base}/storage/v1/object/public/images/demo/${img.seed}.jpg`, ratio: img.ratio } : img)

const now = Date.now()

/** Постоянные id: u3 → …-8000-000000000003, p12 → …-9000-000000000012, t5 → …-a000-…, r2 → …-b000-… */
const fixed = (group: string) => (id: string) => `00000000-0000-4000-${group}-${id.replace(/\D/g, '').padStart(12, '0')}`
const userId = fixed('8000')
const postId = fixed('9000')
const tryId = fixed('a000')
const replyId = fixed('b000')

const q = (v: string | undefined | null) => (v == null ? 'null' : `'${v.replace(/'/g, "''")}'`)
const json = (v: unknown) => (v == null ? 'null' : `${q(JSON.stringify(v))}::jsonb`)
const arr = (v: string[]) => `array[${v.map(q).join(', ')}]::text[]`
const ago = (ts: number) => `now() - interval '${Math.round((now - ts) / 60000)} minutes'`

const out: string[] = [
  '-- Клубок: тестовое наполнение. Файл собран скриптом scripts/make-seed.ts — руками не править.',
  '-- Запуск: после schema.sql, в SQL Editor → Run. Повторный запуск заменяет тестовые данные.',
  '',
  '-- закрываем временную загрузку тестовых картинок (если была открыта)',
  'drop policy if exists "временно: загрузка демо-картинок" on storage.objects;',
  '',
  'delete from profiles where is_demo;',
  '',
]

const demo = users.filter((u) => u.id !== ME)
out.push('insert into profiles (id, name, handle, bio, colors, followers_count, is_demo) values')
out.push(
  demo
    .map((u) => `  (${q(userId(u.id))}, ${q(u.name)}, ${q(u.handle)}, ${q(u.bio)}, ${arr(u.colors)}, ${u.followers}, true)`)
    .join(',\n') + ';',
  '',
)

out.push('insert into posts (id, author_id, type, topic, title, images, tags, likes_count, created_at) values')
out.push(
  posts
    .map(
      (p) =>
        `  (${q(postId(p.id))}, ${q(userId(p.authorId))}, ${q(p.type)}, ${q(p.topic)}, ${q(p.title)}, ` +
        `${json(p.images.map(pic))}, ${arr(p.tags)}, ${p.likes}, ${ago(p.createdAt)})`,
    )
    .join(',\n') + ';',
  '',
)

const demoTries = tries.filter((t) => t.userId !== ME)
out.push('insert into tries (id, post_id, user_id, ok, text, img, created_at) values')
out.push(
  demoTries
    .map(
      (t) =>
        `  (${q(tryId(t.id))}, ${q(postId(t.postId))}, ${q(userId(t.userId))}, ${t.ok}, ${q(t.text)}, ${json(t.img && pic(t.img))}, ${ago(t.createdAt)})`,
    )
    .join(',\n') + ';',
  '',
)

out.push('insert into try_replies (id, try_id, user_id, text, created_at) values')
out.push(
  replies.map((r) => `  (${q(replyId(r.id))}, ${q(tryId(r.tryId))}, ${q(userId(r.userId))}, ${q(r.text)}, ${ago(r.createdAt)})`).join(',\n') + ';',
  '',
)

writeFileSync(new URL('../supabase/seed.sql', import.meta.url), out.join('\n'))
console.log(`seed.sql: ${demo.length} авторов, ${posts.length} постов, ${demoTries.length} отзывов, ${replies.length} ответов`)
