import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ERROR_ENTORNO } from './lib/supabase'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {ERROR_ENTORNO ? (
      <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px' }}>
        <div style={{ maxWidth:'560px', fontFamily:'var(--mono)', fontSize:'12px', color:'var(--red)', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.3)', borderRadius:'8px', padding:'16px 20px', lineHeight:1.6 }}>
          <div style={{ fontWeight:700, marginBottom:'6px' }}>SIGO NO ARRANCA EN DESARROLLO</div>
          {ERROR_ENTORNO}
        </div>
      </div>
    ) : <App />}
  </React.StrictMode>
)
