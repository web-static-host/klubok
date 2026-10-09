import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base — путь сайта на GitHub Pages: https://web-static-host.github.io/klubok/
// две страницы: сайт (index.html) и админка (admin.html — отдельный адрес, ссылок на неё на сайте нет)
export default defineConfig({
  base: '/klubok/',
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      input: { main: 'index.html', admin: 'admin.html' },
    },
  },
})
