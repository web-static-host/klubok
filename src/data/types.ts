export type PostType = 'photo' | 'recipe' | 'hack' | 'beforeafter'
export type Topic = 'recipes' | 'hacks' | 'home' | 'crafts' | 'garden'

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

export const TOPICS: { id: Topic | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'recipes', label: 'Рецепты' },
  { id: 'hacks', label: 'Лайфхаки' },
  { id: 'home', label: 'Дом' },
  { id: 'crafts', label: 'Рукоделие' },
  { id: 'garden', label: 'Сад' },
]

export const TYPE_META: Record<PostType, { label: string; colors: [string, string] }> = {
  photo: { label: 'Фото', colors: ['#38BDF8', '#2563EB'] },
  recipe: { label: 'Рецепт', colors: ['#FB923C', '#F97316'] },
  hack: { label: 'Лайфхак', colors: ['#2DD4BF', '#0891B2'] },
  beforeafter: { label: 'До и после', colors: ['#A855F7', '#6366F1'] },
}
