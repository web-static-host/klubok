import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { finishEmailLink } from './supabase'

// сначала забираем вход из ссылки в письме (если пришли по ней), потом показываем сайт
finishEmailLink().then(({ error, recovery }) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App linkError={error} recovery={recovery} />
    </StrictMode>,
  ),
)
