/** Обычный пост — 1–10 картинок; «до и после» — ровно две, показываются рядом */
export type PostType = 'photo' | 'beforeafter'
/** Категория: id из списка TOPICS или своя, вписанная автором (хранится как текст) */
export type Topic = string

/** Картинка: ссылка на файл в хранилище Supabase (только что выбранное фото — data:URL) */
export interface Img {
  src?: string
  /** тестовые данные: номер файла images/demo/<номер>.jpg (в базе уже подставлен адрес) */
  seed?: number
  /** тестовые данные: о чём картинка */
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
  /** фото профиля (файл в хранилище); нет — кружок с буквами */
  avatar?: string
  followers: number
}

/** Пост: вся информация — на картинках, текста нет, только название */
export interface Post {
  id: string
  type: PostType
  topic: Topic
  title: string
  authorId: string
  createdAt: number
  /** 1–10 картинок, листаются */
  images: Img[]
  likes: number
  /** скрытые слова для поиска (свои и от ИИ); на сайте не показываются */
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

/** Ответ на отзыв «Я попробовал». Отвечать может любой; у автора поста — метка «автор» */
export interface Reply {
  id: string
  tryId: string
  userId: string
  text: string
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
