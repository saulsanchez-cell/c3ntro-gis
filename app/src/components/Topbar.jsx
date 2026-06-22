import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Topbar() {
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
          <button onClick={() => setShowPasswordModal(true)} style={{ fontFamily:'var(--mono)', fontSize:9,
            color:'var(--muted2)', background:'none', border:'0.5px solid var(--border)',
            borderRadius:4, padding:'3px 8px' }}>
            CONTRASEÑA
          </button>
          <button onClick={signOut} style={{ fontFamily:'var(--mono)', fontSize:9,
            color:'var(--muted2)', background:'none', border:'0.5px solid var(--border)',
            borderRadius:4, padding:'3px 8px' }}>
            SALIR
          </button>
       </div>
      </div>

      {showPasswordModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'var(--surface)', border:'0.5px solid var(--border)', borderRadius:'10px', padding:'24px', width:'380px', display:'flex', flexDirection:'column', gap:'14px' }}>
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
    </div>
  )
}
