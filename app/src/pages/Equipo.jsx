import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { hoyMexico } from '../lib/fechas'
import { calcularKpis, sumarDias } from '../lib/kpisEvaluacion'
import { leerTodas } from '../lib/consultas'
import { generarPDFEvaluacion } from '../lib/certificado'

const ACTIVOS = ['Asignada','En Proceso','En Validacion']

// Semáforo de los KPIs (mismos textos en el CSV y el PDF)
const ESTADOS_KPI = {
  cumple:    { texto: 'CUMPLE',      color: 'var(--green)' },
  cerca:     { texto: 'CERCA',       color: 'var(--yellow)' },
  abajo:     { texto: 'ABAJO',       color: 'var(--red)' },
  pocos:     { texto: 'POCOS DATOS', color: 'var(--muted2)' },
  sin_datos: { texto: 'SIN DATOS',   color: 'var(--muted2)' },
  fijo:      { texto: '---',         color: 'var(--muted2)' },
}

// Las secciones nuevas fallan en silencio: null si la consulta da error
async function consultar(consulta) {
  try {
    const { data, error } = await consulta
    return error ? null : (data || [])
  } catch {
    return null
  }
}

const esReapertura = h => (h.estado_anterior === 'Validada' && h.estado_nuevo === 'En Correccion')
  || (h.estado_anterior === 'Cerrada' && h.estado_nuevo === 'En Proceso')

// Periodos con el día de hoy en México (lib/fechas), como texto 'YYYY-MM-DD'
function inicioMes() {
  return hoyMexico().slice(0, 8) + '01'
}
function inicioTrimestre() {
  const [y, m] = hoyMexico().split('-').map(Number)
  const q = Math.floor((m - 1) / 3) * 3 + 1
  return `${y}-${String(q).padStart(2, '0')}-01`
}
function hoy() { return hoyMexico() }

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
  const [datosPlan, setDatosPlan] = useState(null)
  const [cargandoPlan, setCargandoPlan] = useState(false)

  const desde = periodo === 'mes' ? inicioMes() : periodo === 'trimestre' ? inicioTrimestre() : (rangoPersonalizado.desde || inicioMes())
  const hasta = periodo === 'personalizado' ? (rangoPersonalizado.hasta || hoy()) : hoy()

  // Datos del plan semanal, logs y reaperturas del periodo (solo al evaluar)
  async function fetchDatosPlan(d, h) {
    setCargandoPlan(true)
    const [actividades, eventos, cargaUo, cargaActividad, logs, historial, inhabiles, ausencias] = await Promise.all([
      consultar(supabase.from('actividades_uo')
        .select('id,uo_id,orden,ronda,responsable_id,fecha_programada,completada_en,completada_por,registrada_en,plantilla:plantillas_actividad(momento_creacion)')
        .gte('fecha_programada', sumarDias(d, -60)).lte('fecha_programada', sumarDias(h, 60))),
      consultar(supabase.from('actividades_uo_eventos').select('actividad_id').eq('evento', 'reprogramar')),
      consultar(supabase.from('plan_carga_uo').select('uo_id,fecha,responsable_id,jornadas').gte('fecha', d).lte('fecha', h)),
      consultar(supabase.from('plan_carga_actividad').select('actividad_id,fecha,responsable_id,jornadas').gte('fecha', d).lte('fecha', h)),
      consultar(supabase.from('logs_actividad').select('usuario_id,fecha').gte('fecha', d).lte('fecha', h)),
      consultar(supabase.from('historial_estados').select('uo_id,estado_anterior,estado_nuevo,created_at')
        .in('estado_anterior', ['Validada', 'Cerrada']).in('estado_nuevo', ['En Correccion', 'En Proceso'])),
      consultar(supabase.from('plan_dias_inhabiles').select('fecha')),
      // Ausencias: no cuentan en el registro diario ni en los plazos de quien estuvo ausente
      consultar(supabase.from('plan_ausencias').select('profile_id,fecha,fraccion')
        .gte('fecha', sumarDias(d, -60)).lte('fecha', sumarDias(h, 60))),
    ])
    setDatosPlan({
      actividades, cargaUo, cargaActividad, logs, inhabiles, ausencias,
      reprogramadas: eventos ? eventos.map(e => e.actividad_id) : null,
      reaperturas: historial ? historial.filter(esReapertura) : null,
    })
    setCargandoPlan(false)
  }

  useEffect(() => {
    if (showEval) fetchDatosPlan(desde, hasta)
  }, [showEval, desde, hasta])

  async function fetchData() {
    const [{ data: perfiles }, { data: uosData }, { data: checklistData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('activo', true),
      // Más de 1000 filas: se leen por bloques (lib/consultas)
      leerTodas((desde, hasta) => supabase.from('unidades_operativas')
        .select('id,estado,prioridad,referencia_operativa,nombre,digitalizador_id,analista_qa_id,sla_validacion,dias_proceso,no_revision,fecha_asignacion,fecha_carga_final,fecha_entrega_programada,km_teoricos')
        .eq('es_historico', false).order('id').range(desde, hasta)),
      leerTodas((desde, hasta) => supabase.from('checklist_resultados').select('*').order('id').range(desde, hasta)),
    ])
    setEquipo(perfiles || [])
    setUos(uosData || [])
    setChecklistResultados(checklistData || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  function exportCSV(rows, nombre) {
    if (!rows.length) return
    const headers = Object.keys(rows[0]).join(',')
    const lines = rows.map(r => Object.values(r).map(v => `"${v ?? ''}"`).join(','))
    const csv = [headers, ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${nombre}_${hoyMexico()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function calcularEvaluacion(persona) {
    return calcularKpis({
      persona, desde, hasta, hoy: hoy(),
      datos: { uos, checklists: checklistResultados, ...(datosPlan || {}) },
    })
  }

  function filasCSV(persona, ev) {
    return [['Technical Digitalizer', ev.digitalizador], ['Analista GIS & Calidad', ev.analista]].flatMap(([rol, lista]) =>
      lista.map(k => ({
        persona: persona.nombre, desde, hasta, rol, kpi: k.nombre, meta_pct: k.meta,
        cumplen: k.ok ?? '', total: k.total ?? '', resultado_pct: k.pct === null ? '' : k.pct.toFixed(1),
        estado: k.estado === 'fijo' ? k.etiqueta : ESTADOS_KPI[k.estado].texto,
      })))
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
          <div style={{ background:'var(--surface)', border:'0.5px solid var(--border)', borderRadius:'10px', padding:'24px', width:'640px', maxWidth:'calc(100vw - 32px)', maxHeight:'85vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:'14px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
              <div>
                <div style={{ fontWeight:'700', fontSize:'15px' }}>Evaluacion · {showEval.nombre}</div>
                <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>KPIS TECHNICAL DIGITALIZER Y ANALISTA GIS &amp; CALIDAD</div>
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
              const ev = calcularEvaluacion(showEval)
              const tablaKpis = (titulo, color, lista) => (
                <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.1em', borderLeft:'2px solid '+color, paddingLeft:'6px', marginBottom:'2px' }}>{titulo}</div>
                  {lista.map(k => {
                    const est = ESTADOS_KPI[k.estado]
                    return (
                      <div key={k.clave} title={k.nota}
                        style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 52px 64px 92px 84px', alignItems:'center', gap:'8px', background:'var(--surface2)', borderRadius:'6px', padding:'7px 10px' }}>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:'11px', fontWeight:'600' }}>{k.nombre}</div>
                          <div style={{ fontFamily:'var(--mono)', fontSize:'7.5px', color:'var(--muted2)', marginTop:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{k.nota}</div>
                        </div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', textAlign:'right' }}>meta {k.meta}%</div>
                        <div style={{ fontSize:'15px', fontWeight:'700', textAlign:'right', color: k.pct === null ? 'var(--muted)' : 'var(--text)' }}>
                          {k.pct === null ? '---' : `${k.pct.toFixed(0)}%`}
                        </div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', textAlign:'right' }}>{k.estado === 'fijo' ? '' : k.etiqueta}</div>
                        <div style={{ textAlign:'right' }}>
                          {k.estado === 'fijo' ? (
                            <span style={{ fontFamily:'var(--mono)', fontSize:'7.5px', color:'var(--muted2)' }}>{k.etiqueta}</span>
                          ) : (
                            <span style={{ fontFamily:'var(--mono)', fontSize:'7.5px', padding:'2px 6px', borderRadius:'4px', border:'0.5px solid '+est.color, color: est.color, whiteSpace:'nowrap' }}>{est.texto}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
              return (
                <>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)' }}>
                    Periodo: {desde} a {hasta}{cargandoPlan ? ' · cargando datos del plan...' : ''}
                  </div>

                  {tablaKpis('TECHNICAL DIGITALIZER', 'var(--blue)', ev.digitalizador)}
                  {tablaKpis('ANALISTA GIS & CALIDAD', 'var(--orange)', ev.analista)}

                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.1em', marginTop:'4px' }}>CONTEXTO DEL PERIODO</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(5, minmax(0,1fr))', gap:'6px' }}>
                    {[
                      { label:'UOs ASIGNADAS', val: ev.contexto.uos_asignadas },
                      { label:'UOs CARGADAS', val: ev.contexto.uos_cargadas },
                      { label:'KM CARGADOS', val: ev.contexto.km_cargados },
                      { label:'DIAS PROCESO PROM.', val: ev.contexto.dias_proceso_promedio ?? '---' },
                      { label:'CHECKLISTS REVISADOS', val: ev.contexto.checklists_revisados },
                    ].map(m => (
                      <div key={m.label} style={{ background:'var(--surface2)', borderRadius:'6px', padding:'8px' }}>
                        <div style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)', marginBottom:'4px' }}>{m.label}</div>
                        <div style={{ fontSize:'14px', fontWeight:'600' }}>{m.val}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
                    {ev.notas.map(n => (
                      <div key={n} style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)' }}>· {n}</div>
                    ))}
                  </div>

                  <div style={{ display:'flex', gap:'8px' }}>
                    <button onClick={() => exportCSV(filasCSV(showEval, ev), `evaluacion_${showEval.nombre.replace(/\s+/g,'_')}_${desde}_${hasta}`)}
                      style={{ flex:1, padding:'8px 0', borderRadius:'5px', border:'0.5px solid var(--border)', background:'none', color:'var(--muted2)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
                      EXPORTAR CSV
                    </button>
                    <button disabled={cargandoPlan} onClick={() => generarPDFEvaluacion({ persona: showEval, ev, desde, hasta })}
                      style={{ flex:1, padding:'8px 0', borderRadius:'5px', border:'0.5px solid rgba(249,115,22,0.3)', background:'rgba(249,115,22,0.08)', color:'var(--orange)', fontSize:'9px', fontFamily:'var(--mono)', cursor: cargandoPlan ? 'wait' : 'pointer', opacity: cargandoPlan ? 0.5 : 1 }}>
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
