import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { generarPDFEvaluacion } from '../lib/certificado'

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
function hoy() { return new Date().toISOString().split('T')[0] }

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
  const [rangoPersonalizado, setRangoPersonalizado] = useState({ desde: '', hasta: '' })

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

  function calcularEvaluacion(persona, desde, hasta) {
    const comoDigitalizador = uos.filter(u => u.digitalizador_id === persona.id && u.fecha_asignacion >= desde && u.fecha_asignacion <= hasta)
    const comoQA = uos.filter(u => u.analista_qa_id === persona.id && u.fecha_asignacion >= desde && u.fecha_asignacion <= hasta)
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

    const checklistsPersona = checklistResultados.filter(c => c.analista_id === persona.id && c.fecha_revision >= desde && c.fecha_revision <= hasta)
    const scorePromedio = checklistsPersona.length > 0
      ? (checklistsPersona.reduce((s,c) => s + (c.score_porcentaje || 0), 0) / checklistsPersona.length).toFixed(1)
      : null

    const incluyeHoy = hasta >= hoy()
    const slaVencido = incluyeHoy ? [...comoDigitalizador, ...comoQA].filter(u => u.sla_validacion > 3).length : null

    const rutaCritica = comoDigitalizador
      .filter(u => u.fecha_entrega_programada && u.fecha_carga_final)
      .map(u => {
        const programada = new Date(u.fecha_entrega_programada).getTime()
        const real = new Date(u.fecha_carga_final).getTime()
        const desviacionDias = Math.round((real - programada) / (1000 * 60 * 60 * 24))
        return { referencia: u.referencia_operativa, desviacionDias, aTiempo: desviacionDias <= 0, cero: 0 }
      })
      .sort((a, b) => a.referencia.localeCompare(b.referencia))

    const rutaCriticaPctATiempo = rutaCritica.length > 0 ? (rutaCritica.filter(r => r.aTiempo).length / rutaCritica.length) * 100 : null
    const rutaCriticaDesviacionProm = rutaCritica.length > 0 ? rutaCritica.reduce((s, r) => s + r.desviacionDias, 0) / rutaCritica.length : null

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
      ruta_critica: rutaCritica,
      ruta_critica_pct_a_tiempo: rutaCriticaPctATiempo,
      ruta_critica_desviacion_prom: rutaCriticaDesviacionProm,
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
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'6px' }}>
                <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'6px', padding:'2px', gap:'1px' }}>
                  {['mes','trimestre','personalizado'].map(per => (
                    <button key={per} onClick={() => setPeriodo(per)}
                      style={{ padding:'4px 10px', borderRadius:'4px', fontSize:'9px', border:'none', fontFamily:'var(--mono)',
                        background: periodo===per ? 'var(--surface4)' : 'none',
                        color: periodo===per ? 'var(--text)' : 'var(--muted2)' }}>
                      {per.toUpperCase()}
                    </button>
                  ))}
                </div>
                {periodo === 'personalizado' && (
                  <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                    <input type="date" value={rangoPersonalizado.desde} onChange={e => setRangoPersonalizado(r => ({ ...r, desde: e.target.value }))}
                      style={{ padding:'4px 6px', fontSize:'9px' }} />
                    <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)' }}>a</span>
                    <input type="date" value={rangoPersonalizado.hasta} onChange={e => setRangoPersonalizado(r => ({ ...r, hasta: e.target.value }))}
                      style={{ padding:'4px 6px', fontSize:'9px' }} />
                  </div>
                )}
              </div>
            </div>

            {(() => {
              const desde = periodo === 'mes' ? inicioMes() : periodo === 'trimestre' ? inicioTrimestre() : (rangoPersonalizado.desde || inicioMes())
              const hasta = periodo === 'personalizado' ? (rangoPersonalizado.hasta || hoy()) : hoy()
              const ev = calcularEvaluacion(showEval, desde, hasta)
              return (
                <>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)' }}>
                    Periodo: {desde} a {hasta}
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

                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'4px' }}>RUTA CRITICA (PROGRAMADA VS. REAL)</div>
                  {ev.ruta_critica.length === 0 ? (
                    <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)', padding:'12px 0', textAlign:'center', background:'var(--surface2)', borderRadius:'6px' }}>
                      Sin UOs con fecha programada y fecha real en este periodo.
                    </div>
                  ) : (
                    <div style={{ background:'var(--surface2)', borderRadius:'6px', padding:'8px 4px 2px 4px' }}>
                      <div style={{ display:'flex', gap:'12px', padding:'0 8px 4px 8px', fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)' }}>
                        <span>A tiempo: <b style={{ color: ev.ruta_critica_pct_a_tiempo >= 90 ? 'var(--green)' : 'var(--yellow)' }}>{ev.ruta_critica_pct_a_tiempo.toFixed(0)}%</b></span>
                        <span>Desviacion prom.: <b style={{ color: ev.ruta_critica_desviacion_prom <= 0 ? 'var(--green)' : 'var(--red)' }}>{ev.ruta_critica_desviacion_prom > 0 ? '+' : ''}{ev.ruta_critica_desviacion_prom.toFixed(1)}d</b></span>
                      </div>
                      <ResponsiveContainer width="100%" height={140}>
                        <LineChart data={ev.ruta_critica} margin={{ left:4, right:10, bottom:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="referencia" tick={{ fontSize:7, fill:'var(--muted2)' }} hide={ev.ruta_critica.length > 8} />
                          <YAxis tick={{ fontSize:8, fill:'var(--muted2)' }} width={26} />
                          <Tooltip contentStyle={{ background:'#161b22', border:'0.5px solid #30363d', fontSize:'10px' }}
                            formatter={(v) => [(v > 0 ? '+' : '') + v + ' dia(s)', 'Desviacion']} />
                          <Line type="monotone" dataKey="cero" stroke="var(--yellow)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                          <Line type="monotone" dataKey="desviacionDias" stroke="#6B7280" strokeWidth={1.5}
                            dot={(props) => {
                              const { cx, cy, payload, index } = props
                              const color = payload.aTiempo ? 'var(--green)' : 'var(--red)'
                              return <circle key={`dot-${index}`} cx={cx} cy={cy} r={3} fill={color} stroke={color} />
                            }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

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

                  {ev.uos_sla_vencido !== null && ev.uos_sla_vencido > 0 && (
                    <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--red)', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:'5px', padding:'8px 12px' }}>
                      {ev.uos_sla_vencido} UO(s) con SLA vencido actualmente
                    </div>
                  )}

                  <div style={{ display:'flex', gap:'8px' }}>
                    <button onClick={() => exportCSV([ev], `evaluacion_${showEval.nombre.replace(/\s+/g,'_')}_${desde}_${hasta}`)}
                      style={{ flex:1, padding:'8px 0', borderRadius:'5px', border:'0.5px solid var(--border)', background:'none', color:'var(--muted2)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
                      EXPORTAR CSV
                    </button>
                    <button onClick={() => generarPDFEvaluacion({ persona: showEval, ev, desde, hasta })}
                      style={{ flex:1, padding:'8px 0', borderRadius:'5px', border:'0.5px solid rgba(249,115,22,0.3)', background:'rgba(249,115,22,0.08)', color:'var(--orange)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
                      DESCARGAR PDF
                    </button>
                  </div>
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