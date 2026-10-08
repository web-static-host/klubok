export type PostType = 'photo' | 'recipe' | 'hack' | 'beforeafter'
/** Категория: id из списка TOPICS или своя, вписанная автором (хранится как текст) */
export type Topic = string

/** Картинка: в прототипе — заглушка из фотостока по теме и номеру; в настоящем сайте — ссылка на файл в хранилище */
export interface Img {
  /** готовый адрес (свои загрузки — data:URL) */
  src?: string
  /** номер для заглушки */
  seed?: number
  /** тема заглушки: food, kitchen, interior … */
  tag?: string
  /** пропорция высота/ширина */
  ratio: number
}

export interface User {
  id: string
  name: string
  handle: string
  bio: string
  colors: [string, string]
  followers: number
  city?: string
}

export interface Recipe {
  time: string
  servings: number
  difficulty: 'Легко' | 'Средне' | 'Сложно'
  ingredients: string[]
  steps: string[]
}

export interface Step {
  text: string
  img?: Img
}

export interface Post {
  id: string
  type: PostType
  topic: Topic
  title: string
  text: string
  authorId: string
  createdAt: number
  images: Img[]
  recipe?: Recipe
  steps?: Step[]
  likes: number
  tags: string[]
}

export interface Try {
  id: string
  postId: string
  userId: string
  ok: boolean
  text?: string
  img?: Img
  createdAt: number
}

export interface Folder {
  id: string
  name: string
  postIds: string[]
  done: string[]
}

/** Готовые категории. Если ничего не подходит, автор вписывает свою. */
export const TOPICS: { id: Topic; label: string }[] = [
  { id: 'recipes', label: 'Рецепты' },
  { id: 'baking', label: 'Выпечка' },
  { id: 'desserts', label: 'Десерты' },
  { id: 'breakfast', label: 'Завтраки' },
  { id: 'drinks', label: 'Напитки' },
  { id: 'preserves', label: 'Заготовки' },
  { id: 'grill', label: 'Мангал и костёр' },
  { id: 'hacks', label: 'Лайфхаки' },
  { id: 'cleaning', label: 'Уборка' },
  { id: 'storage', label: 'Хранение' },
  { id: 'home', label: 'Дом и уют' },
  { id: 'interior', label: 'Интерьер' },
  { id: 'repair', label: 'Ремонт' },
  { id: 'diy', label: 'Своими руками' },
  { id: 'crafts', label: 'Рукоделие' },
  { id: 'knitting', label: 'Вязание' },
  { id: 'sewing', label: 'Шитьё' },
  { id: 'decor', label: 'Декор' },
  { id: 'holidays', label: 'Праздники' },
  { id: 'gifts', label: 'Подарки' },
  { id: 'garden', label: 'Сад и огород' },
  { id: 'plants', label: 'Комнатные растения' },
  { id: 'kids', label: 'Для детей' },
  { id: 'pets', label: 'Питомцы' },
]

/** Название категории: из списка или своя как есть */
export const topicLabel = (t: Topic) => TOPICS.find((x) => x.id === t)?.label ?? t

export const TYPE_META: Record<PostType, { label: string; colors: [string, string] }> = {
  photo: { label: 'Фото', colors: ['#38BDF8', '#2563EB'] },
  recipe: { label: 'Рецепт', colors: ['#FB923C', '#F97316'] },
  hack: { label: 'Лайфхак', colors: ['#2DD4BF', '#0891B2'] },
  beforeafter: { label: 'До и после', colors: ['#A855F7', '#6366F1'] },
}
