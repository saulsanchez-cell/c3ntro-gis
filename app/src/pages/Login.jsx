import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signIn(email, password)
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ width:'100%', maxWidth:'380px' }}>
        <div style={{ textAlign:'center', marginBottom:'32px' }}>
         <img src="/logo_sigo_small.png" alt="SIGO" style={{ width:'48px', height:'auto', margin:'0 auto 16px', display:'block' }} />
          <div style={{ fontFamily:'var(--disp)', fontWeight:'800', fontSize:'22px', letterSpacing:'0.07em', marginBottom:'4px' }}>
            SIGO
          </div>
          <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)', letterSpacing:'0.12em' }}>
            SISTEMA INTEGRAL DE GESTION OPERATIVA
          </div>
          <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.1em', marginTop:'2px' }}>
            UNA HERRAMIENTA DE C3NTRO TELECOM
          </div>
        </div>
        <form onSubmit={handleSubmit} style={{ background:'var(--surface)', border:'0.5px solid var(--border)', borderRadius:'10px', padding:'24px', display:'flex', flexDirection:'column', gap:'14px' }}>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', letterSpacing:'0.09em', marginBottom:'6px' }}>CORREO</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@c3ntro.com" required />
          </div>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', letterSpacing:'0.09em', marginBottom:'6px' }}>CONTRASENA</div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && (
            <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--red)', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:'5px', padding:'8px 12px' }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} style={{ background:'var(--orange)', color:'#080808', border:'none', borderRadius:'6px', padding:'10px 0', fontFamily:'var(--mono)', fontWeight:'500', fontSize:'11px', letterSpacing:'0.08em', marginTop:'4px', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'INGRESANDO...' : 'INGRESAR'}
          </button>
        </form>
      </div>
    </div>
  )
}
