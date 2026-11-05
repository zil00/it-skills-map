import { HashRouter, Route, Routes } from 'react-router-dom'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="*" element={<p className="p-8">IT Skills Map — coming soon</p>} />
      </Routes>
    </HashRouter>
  )
}
