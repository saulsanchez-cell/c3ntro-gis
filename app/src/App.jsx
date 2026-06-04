import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Topbar from './components/Topbar'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Backlog from './pages/Backlog'
import FichaUO from './pages/FichaUO'

function ProtectedLayout() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--muted2)', letterSpacing:'0.1em' }}>CARGANDO...</div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return (
    <div style={{ minHeight:'100vh' }}>
      <Topbar />
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/backlog" element={<Backlog />} />
        <Route path="/backlog/:id" element={<FichaUO />} />
        <Route path="/equipo" element={<ComingSoon title="Equipo" />} />
        <Route path="/calidad" element={<ComingSoon title="Calidad" />} />
        <Route path="/reportes" element={<ComingSoon title="Reportes" />} />
      </Routes>
    </div>
  )
}

function ComingSoon({ title }) {
  return (
    <div style={{ padding:40, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', gap:12 }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)', letterSpacing:'0.14em' }}>PRÓXIMAMENTE</div>
      <div style={{ fontFamily:'var(--disp)', fontWeight:700, fontSize:24 }}>{title}</div>
      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted2)' }}>Esta sección está en construcción.</div>
    </div>
  )
}

function LoginGuard() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/" replace />
  return <Login />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginGuard />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
