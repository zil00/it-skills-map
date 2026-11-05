import { HashRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { FilterProvider } from './lib/filters'
import About from './pages/About'
import BreakingIn from './pages/BreakingIn'
import Compare from './pages/Compare'
import Home from './pages/Home'
import Role from './pages/Role'
import Skills from './pages/Skills'

export default function App() {
  return (
    <FilterProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="roles/:slug" element={<Role />} />
            <Route path="compare" element={<Compare />} />
            <Route path="skills" element={<Skills />} />
            <Route path="breaking-in" element={<BreakingIn />} />
            <Route path="about" element={<About />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </HashRouter>
    </FilterProvider>
  )
}
