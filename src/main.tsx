import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { finishEmailLogin } from './supabase'

// сначала забираем вход из ссылки в письме (если пришли по ней), потом показываем сайт
finishEmailLogin().then((loginError) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App loginError={loginError} />
    </StrictMode>,
  ),
)
