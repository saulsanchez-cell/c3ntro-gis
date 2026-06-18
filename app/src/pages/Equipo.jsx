import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ACTIVOS = ['Asignada','En Proceso','En Validacion']

function inicioMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}
function inicioTrimestre() {
  const d = new Date()
  const q = Math.floor(d.getMonth() / 3) * 3
  return new Date(d.getFullYear(), q, 1).toISOString().split('T')[0]
}

export default function Equipo() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  useEffect(() => {
    if (profile && profile.rol !== 'coordinador') navigate('/')
  }, [profile])
  const [equipo, setEquipo] = useState([])
  const [uos, setUos] = useState([])
  const [checklistResultados, setChecklistResultados] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEval, setShowEval] = useState(null)
  const [periodo, setPeriodo] = useState('mes')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [{ data: perfiles }, { data: uosData }, { data: checklistData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('activo', true),
      supabase.from('unidades_operativas').select('id,estado,prioridad,referencia_operativa,nombre,digitalizador_id,analista_qa_id,sla_validacion,dias_proceso,no_revision,fecha_asignacion,fecha_carga_final').eq('es_historico', false),
      supabase.from('checklist_resultados').select('*'),
    ])
    setEquipo(perfiles || [])
    setUos(uosData || [])
    setChecklistResultados(checklistData || [])
    setLoading(false)
  }

  function exportCSV(rows, nombre) {
    if (!rows.length) return
    const headers = Object.keys(rows[0]).join(',')
    const lines = rows.map(r => Object.values(r).map(v => `"${v ?? ''}"`).join(','))
    const csv = [headers, ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${nombre}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function calcularEvaluacion(persona, desde) {
    const comoDigitalizador = uos.filter(u => u.digitalizador_id === persona.id && u.fecha_asignacion >= desde)
    const comoQA = uos.filter(u => u.analista_qa_id === persona.id && u.fecha_asignacion >= desde)
    const validadas = comoQA.filter(u => u.estado === 'Validada').length
    const rechazadas = comoQA.filter(u => u.estado === 'Rechazada').length
    const enCorreccion = comoQA.filter(u => u.estado === 'En Correccion').length
    const totalQA = comoQA.length

    const cargados = comoDigitalizador.filter(u => u.fecha_carga_final).length
    const diasProcesoValidos = comoDigitalizador.filter(u => u.dias_proceso !== null && u.dias_proceso !== undefined)
    const promedioDias = diasProcesoValidos.length > 0
      ? (diasProcesoValidos.reduce((s,u) => s + u.dias_proceso, 0) / diasProcesoValidos.length).toFixed(1)
      : null

    const sumNoRevision = comoDigitalizador.reduce((s,u) => s + (u.no_revision || 0), 0)
    const promNoRevision = comoDigitalizador.length > 0 ? (sumNoRevision / comoDigitalizador.length).toFixed(2) : 0

    const checklistsPersona = checklistResultados.filter(c => c.analista_id === persona.id && c.fecha_revision >= desde)
    const scorePromedio = checklistsPersona.length > 0
      ? (checklistsPersona.reduce((s,c) => s + (c.score_porcentaje || 0), 0) / checklistsPersona.length).toFixed(1)
      : null

    const slaVencido = [...comoDigitalizador, ...comoQA].filter(u => u.sla_validacion > 3).length

    return {
      nombre: persona.nombre,
      rol: persona.rol,
      uos_como_digitalizador: comoDigitalizador.length,
      uos_cargadas_completas: cargados,
      dias_proceso_promedio: promedioDias ?? '---',
      promedio_no_revision: promNoRevision,
      uos_como_qa: totalQA,
      validadas, rechazadas, en_correccion: enCorreccion,
      tasa_aprobacion: totalQA > 0 ? ((validadas/totalQA)*100).toFixed(1)+'%' : '---',
      score_checklist_promedio: scorePromedio ? scorePromedio+'%' : '---',
      checklists_revisados: checklistsPersona.length,
      uos_sla_vencido: slaVencido,
    }
  }

  if (loading) return <div style={{padding:'40px',fontFamily:'var(--mono)',fontSize:'11px',color:'var(--muted2)'}}>Cargando...</div>

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
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'6px',marginBottom:'10px'}}>
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
                {p.rol !== 'coordinador' && (
                  <button onClick={() => setShowEval(p)}
                    style={{ width:'100%', padding:'7px 0', borderRadius:'5px', border:'0.5px solid rgba(249,115,22,0.3)', background:'rgba(249,115,22,0.08)', color:'var(--orange)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer', marginBottom:'10px' }}>
                    EVALUAR
                  </button>
                )}
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

      {showEval && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'var(--surface)', border:'0.5px solid var(--border)', borderRadius:'10px', padding:'24px', width:'520px', maxHeight:'85vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:'14px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:'700', fontSize:'15px' }}>Evaluacion · {showEval.nombre}</div>
                <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>{showEval.rol.replace('_',' ').toUpperCase()}</div>
              </div>
              <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'6px', padding:'2px', gap:'1px' }}>
                {['mes','trimestre'].map(per => (
                  <button key={per} onClick={() => setPeriodo(per)}
                    style={{ padding:'4px 10px', borderRadius:'4px', fontSize:'9px', border:'none', fontFamily:'var(--mono)',
                      background: periodo===per ? 'var(--surface4)' : 'none',
                      color: periodo===per ? 'var(--text)' : 'var(--muted2)' }}>
                    {per.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const desde = periodo === 'mes' ? inicioMes() : inicioTrimestre()
              const ev = calcularEvaluacion(showEval, desde)
              return (
                <>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)' }}>
                    Periodo desde {desde}
                  </div>

                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.1em', marginTop:'4px' }}>COMO DIGITALIZADOR</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                    {[
                      { label:'UOs ASIGNADAS', val: ev.uos_como_digitalizador },
                      { label:'CARGAS COMPLETAS', val: ev.uos_cargadas_completas },
                      { label:'DIAS PROCESO PROM.', val: ev.dias_proceso_promedio },
                      { label:'PROM. NO REVISION', val: ev.promedio_no_revision },
                    ].map(m => (
                      <div key={m.label} style={{ background:'var(--surface2)', borderRadius:'6px', padding:'8px 10px' }}>
                        <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'4px' }}>{m.label}</div>
                        <div style={{ fontSize:'16px', fontWeight:'600' }}>{m.val}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.1em', marginTop:'4px' }}>COMO ANALISTA QA</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                    {[
                      { label:'UOs REVISADAS', val: ev.uos_como_qa },
                      { label:'TASA APROBACION', val: ev.tasa_aprobacion },
                      { label:'VALIDADAS', val: ev.validadas, color:'var(--green)' },
                      { label:'RECHAZADAS', val: ev.rechazadas, color:'var(--red)' },
                      { label:'EN CORRECCION', val: ev.en_correccion, color:'var(--blue)' },
                      { label:'SCORE CHECKLIST PROM.', val: ev.score_checklist_promedio },
                    ].map(m => (
                      <div key={m.label} style={{ background:'var(--surface2)', borderRadius:'6px', padding:'8px 10px' }}>
                        <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'4px' }}>{m.label}</div>
                        <div style={{ fontSize:'16px', fontWeight:'600', color: m.color }}>{m.val}</div>
                      </div>
                    ))}
                  </div>

                  {ev.uos_sla_vencido > 0 && (
                    <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--red)', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:'5px', padding:'8px 12px' }}>
                      {ev.uos_sla_vencido} UO(s) con SLA vencido actualmente
                    </div>
                  )}

                  <button onClick={() => exportCSV([ev], `evaluacion_${showEval.nombre.replace(/\s+/g,'_')}_${periodo}`)}
                    style={{ padding:'8px 0', borderRadius:'5px', border:'0.5px solid var(--border)', background:'none', color:'var(--muted2)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
                    EXPORTAR CSV
                  </button>
                </>
              )
            })()}

            <button onClick={() => setShowEval(null)}
              style={{ padding:'7px 0', borderRadius:'5px', border:'none', background:'var(--surface2)', color:'var(--muted2)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
              CERRAR
            </button>
          </div>
        </div>
      )}
    </div>
  )
}