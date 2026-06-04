import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Equipo() {
  const navigate = useNavigate()
  const [equipo, setEquipo] = useState([])
  const [uos, setUos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [{ data: perfiles }, { data: uosData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('activo', true),
      supabase.from('unidades_operativas').select('id,estado,prioridad,referencia_operativa,nombre,digitalizador_id,analista_qa_id,sla_validacion').eq('es_historico', false)
    ])
    setEquipo(perfiles || [])
    setUos(uosData || [])
    setLoading(false)
  }

  if (loading) return <div style={{padding:'40px',fontFamily:'var(--mono)',fontSize:'11px',color:'var(--muted2)'}}>Cargando...</div>

  const ACTIVOS = ['Asignada','En Proceso','En Validacion']

  return (
    <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:'14px'}}>
      <div style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--muted)',letterSpacing:'0.14em'}}>GESTION DE EQUIPO</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))',gap:'10px'}}>
        {equipo.map(p => {
          const dig = uos.filter(u => u.digitalizador_id === p.id)
          const qa = uos.filter(u => u.analista_qa_id === p.id)
          const activas_dig = dig.filter(u => ACTIVOS.includes(u.estado))
          const activas_qa = qa.filter(u => ACTIVOS.includes(u.estado))
          const validadas = qa.filter(u => u.estado === 'Validada').length
          const rechazadas = qa.filter(u => u.estado === 'Rechazada').length
          const sla_alto = [...activas_dig,...activas_qa].filter(u => u.sla_validacion > 3).length
          const col = p.rol === 'coordinador' ? 'var(--orange)' : p.rol === 'analista_gis' ? 'var(--green)' : 'var(--blue)'
          return (
            <div key={p.id} style={{background:'var(--surface)',border:'0.5px solid var(--border2)',borderRadius:'10px',overflow:'hidden'}}>
              <div style={{height:'2px',background:col}} />
              <div style={{padding:'14px 16px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'}}>
                  <div style={{width:'40px',height:'40px',borderRadius:'50%',background:'var(--surface2)',color:col,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--mono)',fontSize:'14px',fontWeight:'500',flexShrink:0,border:'0.5px solid var(--border)'}}>
                    {p.iniciales}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:'600',fontSize:'13px'}}>{p.nombre}</div>
                    <div style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--muted2)',marginTop:'2px'}}>{p.rol.replace('_',' ').toUpperCase()}</div>
                  </div>
                  {sla_alto > 0 && <div style={{fontFamily:'var(--mono)',fontSize:'8px',padding:'3px 8px',borderRadius:'4px',background:'rgba(239,68,68,0.12)',color:'var(--red)'}}>{sla_alto} SLA</div>}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'6px',marginBottom:'14px'}}>
                  {[
                    {label:'CARGA',val:activas_dig.length,color:'var(--orange)'},
                    {label:'QA',val:activas_qa.length,color:'var(--yellow)'},
                    {label:'OK',val:validadas,color:'var(--green)'},
                    {label:'RECH',val:rechazadas,color:'var(--red)'},
                  ].map(s => (
                    <div key={s.label} style={{background:'var(--surface2)',borderRadius:'6px',padding:'8px',textAlign:'center'}}>
                      <div style={{fontSize:'20px',fontWeight:'700',color:s.val > 0 ? s.color : 'var(--muted)',lineHeight:'1'}}>{s.val}</div>
                      <div style={{fontFamily:'var(--mono)',fontSize:'7px',color:'var(--muted)',marginTop:'4px'}}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {activas_dig.length > 0 && (
                  <div style={{marginBottom:'8px'}}>
                    <div style={{fontFamily:'var(--mono)',fontSize:'8px',color:'var(--muted)',letterSpacing:'0.1em',marginBottom:'6px'}}>EN CARGA</div>
                    {activas_dig.slice(0,4).map(u => (
                      <div key={u.id} onClick={() => navigate('/backlog/'+u.id)}
                        style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--surface2)',border:'0.5px solid var(--border2)',borderLeft:'2px solid '+(u.prioridad==='P1'?'var(--orange)':'var(--border2)'),borderRadius:'5px',padding:'5px 8px',cursor:'pointer',marginBottom:'4px'}}>
                        <span style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--orange)'}}>{u.referencia_operativa}</span>
                        <span style={{fontFamily:'var(--mono)',fontSize:'7px',color:'var(--muted2)'}}>{u.estado}</span>
                      </div>
                    ))}
                    {activas_dig.length > 4 && <div style={{fontFamily:'var(--mono)',fontSize:'8px',color:'var(--muted)',padding:'2px 8px'}}>+ {activas_dig.length-4} mas</div>}
                  </div>
                )}
                {activas_qa.length > 0 && (
                  <div>
                    <div style={{fontFamily:'var(--mono)',fontSize:'8px',color:'var(--muted)',letterSpacing:'0.1em',marginBottom:'6px'}}>EN VALIDACION</div>
                    {activas_qa.slice(0,4).map(u => (
                      <div key={u.id} onClick={() => navigate('/backlog/'+u.id)}
                        style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--surface2)',border:'0.5px solid var(--border2)',borderLeft:'2px solid var(--yellow)',borderRadius:'5px',padding:'5px 8px',cursor:'pointer',marginBottom:'4px'}}>
                        <span style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--orange)'}}>{u.referencia_operativa}</span>
                        <span style={{fontFamily:'var(--mono)',fontSize:'7px',color:'var(--yellow)'}}>{u.estado}</span>
                      </div>
                    ))}
                    {activas_qa.length > 4 && <div style={{fontFamily:'var(--mono)',fontSize:'8px',color:'var(--muted)',padding:'2px 8px'}}>+ {activas_qa.length-4} mas</div>}
                  </div>
                )}
                {activas_dig.length === 0 && activas_qa.length === 0 && (
                  <div style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--muted)',textAlign:'center',padding:'10px 0'}}>Sin UOs activas</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}