import { HashRouter, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './store'
import { UiProvider } from './ui-context'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Following } from './pages/Following'
import { PostPage } from './pages/PostPage'
import { FolderPage, Folders } from './pages/Folders'
import { Profile } from './pages/Profile'
import { Search } from './pages/Search'

// HashRouter: адреса вида /klubok/#/p/1 — работают на GitHub Pages без настройки сервера
export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <UiProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="following" element={<Following />} />
              <Route path="p/:id" element={<PostPage />} />
              <Route path="folders" element={<Folders />} />
              <Route path="folders/:id" element={<FolderPage />} />
              <Route path="u/:id" element={<Profile />} />
              <Route path="me" element={<Profile self />} />
              <Route path="search" element={<Search />} />
              <Route path="*" element={<Home />} />
            </Route>
          </Routes>
        </UiProvider>
      </HashRouter>
    </StoreProvider>
  )
}
