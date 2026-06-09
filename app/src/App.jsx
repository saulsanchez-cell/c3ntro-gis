import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider, useAuth } from "./context/AuthContext"
import Topbar from "./components/Topbar"
import Login from "./pages/Login"
import Overview from "./pages/Overview"
import Backlog from "./pages/Backlog"
import FichaUO from "./pages/FichaUO"
import Equipo from "./pages/Equipo"

function ProtectedLayout() {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ fontFamily:"var(--mono)", fontSize:"11px", color:"var(--muted2)" }}>CARGANDO...</div></div>
  return (
    <div style={{ minHeight:"100vh" }}>
      <Topbar />
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/backlog" element={<Backlog />} />
        <Route path="/backlog/nueva" element={<NuevaUO />} />
        <Route path="/backlog/:id" element={<FichaUO />} />
        <Route path="/equipo" element={<Equipo />} />
        <Route path="/calidad" element={<ComingSoon title="Calidad" />} />
        <Route path="/reportes" element={<ComingSoon title="Reportes" />} />
      </Routes>
    </div>
  )
}

function ComingSoon({ title }) {
  return <div style={{ padding:"40px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:"12px" }}><div style={{ fontFamily:"var(--mono)", fontSize:"9px", color:"var(--muted)" }}>PROXIMAMENTE</div><div style={{ fontWeight:"700", fontSize:"24px" }}>{title}</div></div>
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