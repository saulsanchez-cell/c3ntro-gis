import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider, useAuth } from "./context/AuthContext"
import { useState } from "react"
import Sidebar from "./components/Sidebar"
import Login from "./pages/Login"
import Overview from "./pages/Overview"
import Backlog from "./pages/Backlog"
import FichaUO from "./pages/FichaUO"
import Equipo from "./pages/Equipo"
import NuevaUO from './pages/NuevaUO'
import Checklist from './pages/Checklist'
import Alertas from './pages/Alertas'
import Calidad from './pages/Calidad'
import ReporteKM from './pages/ReporteKM'
import PlanSemanal from './pages/PlanSemanal'
import ResetPassword from './pages/ResetPassword'

function ProtectedLayout() {
  const { user, loading, passwordRecovery } = useAuth()
  // Los hooks van antes de cualquier return
  const [sidebarOpen, setSidebarOpen] = useState(false)
  if (passwordRecovery) return <ResetPassword />
  if (loading) return <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ fontFamily:"var(--mono)", fontSize:"11px", color:"var(--muted2)" }}>CARGANDO...</div></div>
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="sigo-layout">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">☰</button>
      <main style={{ minWidth:0, overflowX:"hidden" }}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/backlog" element={<Backlog />} />
          <Route path="/backlog/nueva" element={<NuevaUO />} />
          <Route path="/backlog/:id" element={<FichaUO />} />
          <Route path="/backlog/:id/checklist" element={<Checklist />} />
          <Route path="/equipo" element={<Equipo />} />
          <Route path="/alertas" element={<Alertas />} />
          <Route path="/calidad" element={<Calidad />} />
          <Route path="/reportes" element={<ReporteKM />} />
          <Route path="/plan-semanal" element={<PlanSemanal />} />
          <Route path="/reporte-km" element={<Navigate to="/reportes" replace />} />
        </Routes>
      </main>
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