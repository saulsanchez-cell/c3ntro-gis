import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

const ICONS = {
  overview: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="9" rx="1.2"/><rect x="14" y="3" width="7" height="5" rx="1.2"/><rect x="14" y="12" width="7" height="9" rx="1.2"/><rect x="3" y="16" width="7" height="5" rx="1.2"/></svg>,
  backlog: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="9" rx="1.5"/></svg>,
  calidad: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  reporteKm: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>,
  alertas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>,
  equipo: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="8.5" r="2.6"/><path d="M15 14.5c2.6.4 4.5 2.3 4.5 5.5"/></svg>,
  reportes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V5a2 2 0 012-2h8l4 4v12a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M9 13h6M9 17h6M9 9h2"/></svg>,
}

export default function Sidebar({ open, onClose }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ nueva: '', confirmar: '' })
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  async function handleCambiarPassword() {
    setPasswordError('')
    if (passwordForm.nueva.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (passwordForm.nueva !== passwordForm.confirmar) {
      setPasswordError('Las contraseñas no coinciden.')
      return
    }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: passwordForm.nueva })
    setSavingPassword(false)
    if (error) {
      setPasswordError(error.message)
    } else {
      setPasswordSuccess(true)
      setPasswordForm({ nueva: '', confirmar: '' })
      setTimeout(() => {
        setShowPasswordModal(false)
        setPasswordSuccess(false)
      }, 1500)
    }
  }

  function irA(path) {
    navigate(path)
    if (onClose) onClose()
  }

  const GROUPS = [
    {
      label: 'Operación',
      items: [
        { label: 'Overview', path: '/', icon: 'overview' },
        { label: 'Backlog', path: '/backlog', icon: 'backlog' },
      ],
    },
    {
      label: 'Calidad y avance',
      items: [
        { label: 'Calidad', path: '/calidad', icon: 'calidad' },
        { label: 'Reporte KM', path: '/reporte-km', icon: 'reporteKm', soloCoordinador: true },
        { label: 'Alertas', path: '/alertas', icon: 'alertas' },
      ],
    },
    {
      label: 'Gestión',
      items: [
        { label: 'Equipo', path: '/equipo', icon: 'equipo', soloCoordinador: true },
        { label: 'Reportes', path: '/reportes', icon: 'reportes', soloCoordinador: true },
      ],
    },
  ]

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={'sigo-sidebar' + (open ? ' open' : '')}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 10px 14px 10px', borderBottom:'0.5px solid var(--border2)', marginBottom:4 }}>
          <img src="/logo_sigo_small.png" alt="SIGO" style={{ width:28, height:'auto', flexShrink:0 }} />
          <div>
            <div style={{ fontFamily:'var(--disp)', fontWeight:800, fontSize:15, letterSpacing:'0.04em' }}>SIGO</div>
            <div style={{ fontFamily:'var(--mono)', fontSize:8, color:'var(--muted2)', letterSpacing:'0.08em' }}>
              {profile?.rol?.toUpperCase() ?? '—'}
            </div>
          </div>
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Cerrar menú">✕</button>
        </div>

        {GROUPS.map(group => {
          const items = group.items.filter(i => !i.soloCoordinador || profile?.rol === 'coordinador')
          if (items.length === 0) return null
          return (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {items.map(item => (
                <button
                  key={item.path}
                  className={'nav-item' + (location.pathname === item.path ? ' active' : '')}
                  onClick={() => irA(item.path)}
                >
                  {ICONS[item.icon]}
                  {item.label}
                </button>
              ))}
            </div>
          )
        })}

        <div style={{ marginTop:'auto', display:'flex', flexDirection:'column', gap:10, padding:'10px 10px 4px 10px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(249,115,22,0.15)',
              color:'var(--orange)', display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:'var(--mono)', fontSize:10, fontWeight:500, flexShrink:0 }}>
              {profile?.iniciales ?? '??'}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:5, fontFamily:'var(--mono)', fontSize:8, color:'var(--muted2)' }}>
              <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--green)' }} />
              EN VIVO
            </div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={() => setShowPasswordModal(true)} style={{ flex:1, fontFamily:'var(--mono)', fontSize:8.5,
              color:'var(--muted2)', background:'none', border:'0.5px solid var(--border)',
              borderRadius:4, padding:'6px 4px' }}>
              CONTRASEÑA
            </button>
            <button onClick={signOut} style={{ flex:1, fontFamily:'var(--mono)', fontSize:8.5,
              color:'var(--muted2)', background:'none', border:'0.5px solid var(--border)',
              borderRadius:4, padding:'6px 4px' }}>
              SALIR
            </button>
          </div>
        </div>

        {showPasswordModal && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
            <div style={{ background:'var(--surface)', border:'0.5px solid var(--border)', borderRadius:'10px', padding:'24px', width:'380px', maxWidth:'90vw', display:'flex', flexDirection:'column', gap:'14px' }}>
              <div style={{ fontWeight:'700', fontSize:'14px' }}>Cambiar contraseña</div>
              {passwordSuccess ? (
                <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--green)', background:'rgba(34,197,94,0.08)', border:'0.5px solid rgba(34,197,94,0.2)', borderRadius:'5px', padding:'10px 12px' }}>
                  Contraseña actualizada correctamente.
                </div>
              ) : (
                <>
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'6px' }}>NUEVA CONTRASEÑA</div>
                    <input type="password" value={passwordForm.nueva} onChange={e => setPasswordForm(f => ({ ...f, nueva: e.target.value }))} placeholder="Mínimo 6 caracteres" />
                  </div>
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'6px' }}>CONFIRMAR CONTRASEÑA</div>
                    <input type="password" value={passwordForm.confirmar} onChange={e => setPasswordForm(f => ({ ...f, confirmar: e.target.value }))} placeholder="Repite la contraseña" />
                  </div>
                  {passwordError && (
                    <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--red)', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:'5px', padding:'8px 12px' }}>
                      {passwordError}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
                    <button onClick={() => { setShowPasswordModal(false); setPasswordForm({ nueva:'', confirmar:'' }); setPasswordError('') }}
                      style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid var(--border)', background:'none', color:'var(--muted2)', fontSize:'10px', fontFamily:'var(--mono)' }}>
                      CANCELAR
                    </button>
                    <button onClick={handleCambiarPassword} disabled={savingPassword}
                      style={{ padding:'7px 14px', borderRadius:'5px', border:'none', background:'var(--orange)', color:'#080808', fontSize:'10px', fontFamily:'var(--mono)', fontWeight:'500' }}>
                      {savingPassword ? 'GUARDANDO...' : 'GUARDAR'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}