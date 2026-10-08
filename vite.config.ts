import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base — путь сайта на GitHub Pages: https://web-static-host.github.io/klubok/
export default defineConfig({
  base: '/klubok/',
  plugins: [react(), tailwindcss()],
})
