import { createClient } from '@supabase/supabase-js'

/** Подключение к тестовой базе. Адрес и открытый ключ — в файле .env */
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
