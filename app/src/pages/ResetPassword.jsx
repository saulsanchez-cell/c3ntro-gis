import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const { completarRecuperacion } = useAuth()
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (nueva.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    if (nueva !== confirmar) { setError('Las contraseñas no coinciden.'); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: nueva })
    setSaving(false)
    if (error) { setError(error.message); return }
    await completarRecuperacion()
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ width:'100%', maxWidth:'380px' }}>
        <div style={{ textAlign:'center', marginBottom:'32px' }}>
          <img src="/logo_sigo_small.png" alt="SIGO" style={{ width:'48px', height:'auto', margin:'0 auto 16px', display:'block' }} />
          <div style={{ fontFamily:'var(--disp)', fontWeight:'800', fontSize:'22px', letterSpacing:'0.07em', marginBottom:'4px' }}>SIGO</div>
          <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)', letterSpacing:'0.12em' }}>DEFINE TU NUEVA CONTRASEÑA</div>
        </div>
        <form onSubmit={handleSubmit} style={{ background:'var(--surface)', border:'0.5px solid var(--border)', borderRadius:'10px', padding:'24px', display:'flex', flexDirection:'column', gap:'14px' }}>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', letterSpacing:'0.09em', marginBottom:'6px' }}>NUEVA CONTRASEÑA</div>
            <input type="password" value={nueva} onChange={e => setNueva(e.target.value)} placeholder="Mínimo 6 caracteres" required />
          </div>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', letterSpacing:'0.09em', marginBottom:'6px' }}>CONFIRMAR CONTRASEÑA</div>
            <input type="password" value={confirmar} onChange={e => setConfirmar(e.target.value)} placeholder="Repite la contraseña" required />
          </div>
          {error && (
            <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--red)', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:'5px', padding:'8px 12px' }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={saving} style={{ background:'var(--orange)', color:'#080808', border:'none', borderRadius:'6px', padding:'10px 0', fontFamily:'var(--mono)', fontWeight:'500', fontSize:'11px', letterSpacing:'0.08em', marginTop:'4px', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'GUARDANDO...' : 'GUARDAR Y ENTRAR'}
          </button>
        </form>
      </div>
    </div>
  )
}