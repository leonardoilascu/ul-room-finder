import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Viewer2D from './pages/Viewer2D'
import Viewer3D from './pages/Viewer3D'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/2d-viewer" element={<Viewer2D />} />
      <Route path="/3d-viewer" element={<Viewer3D />} />
    </Routes>
  )
}

export default App