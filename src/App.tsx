import { HashRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Quiz from './pages/Quiz'
import TextQuiz from './pages/TextQuiz'
import WrongBook from './pages/WrongBook'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/quiz/:bankId" element={<Quiz />} />
        <Route path="/explain/:bankId" element={<TextQuiz qType="explain" />} />
        <Route path="/short-answer/:bankId" element={<TextQuiz qType="short_answer" />} />
        <Route path="/wrong/:bankId" element={<WrongBook />} />
      </Routes>
    </HashRouter>
  )
}
