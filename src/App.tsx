import { HashRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Quiz from './pages/Quiz'
import WrongBook from './pages/WrongBook'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/quiz/:bankId" element={<Quiz />} />
        <Route path="/wrong/:bankId" element={<WrongBook />} />
      </Routes>
    </HashRouter>
  )
}
