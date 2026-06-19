import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Topbar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const NAV_ALL = [
    { label: 'OVERVIEW', path: '/' },
    { label: 'BACKLOG', path: '/backlog' },
    { label: 'EQUIPO', path: '/equipo', soloCoordinador: true },
    { label: 'CALIDAD', path: '/calidad' },
    { label: 'REPORTES', path: '/reportes', soloCoordinador: true },
    { label: 'ALERTAS', path: '/alertas' },
  ]

  const NAV = NAV_ALL.filter(n => !n.soloCoordinador || profile?.rol === 'coordinador')


  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'11px 20px', background:'var(--surface)', borderBottom:'0.5px solid var(--border)',
      position:'sticky', top:0, zIndex:100 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <img src="/logo_sigo_small.png" alt="SIGO" style={{ width:26, height:'auto', flexShrink:0 }} />
        <div>
          <div style={{ fontFamily:'var(--disp)', fontWeight:800, fontSize:15, letterSpacing:'0.06em' }}>
            SIGO
          </div>
          <div style={{ fontFamily:'var(--mono)', fontSize:8, color:'var(--muted2)', letterSpacing:'0.1em' }}>
            SISTEMA INTEGRAL DE GESTION OPERATIVA · {profile?.rol?.toUpperCase() ?? '—'}
          </div>
        </div>
      </div>
      <div style={{ display:'flex', gap:1, background:'var(--surface2)', borderRadius:6, padding:3 }}>
        {NAV.map(n => (
          <button key={n.path} onClick={() => navigate(n.path)}
            style={{ padding:'4px 10px', borderRadius:4, fontSize:9, color: location.pathname === n.path ? 'var(--text)' : 'var(--muted2)',
              background: location.pathname === n.path ? 'var(--surface3)' : 'none',
              border:'none', letterSpacing:'0.05em' }}>
            {n.label}
          </button>
        ))}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:5,
          fontFamily:'var(--mono)', fontSize:8, color:'var(--muted2)',
          border:'0.5px solid var(--border)', borderRadius:4, padding:'3px 8px' }}>
          <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--green)' }} />
          EN VIVO
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <div style={{ width:26, height:26, borderRadius:'50%', background:'rgba(249,115,22,0.15)',
            color:'var(--orange)', display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily:'var(--mono)', fontSize:10, fontWeight:500 }}>
            {profile?.iniciales ?? '??'}
          </div>
          <button onClick={signOut} style={{ fontFamily:'var(--mono)', fontSize:9,
            color:'var(--muted2)', background:'none', border:'0.5px solid var(--border)',
            borderRadius:4, padding:'3px 8px' }}>
            SALIR
          </button>
        </div>
      </div>
    </div>
  )
}
