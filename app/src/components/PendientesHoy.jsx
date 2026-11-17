import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { leerTodas } from '../lib/consultas'
import { hoyMexico } from '../lib/fechas'
import { sumarDias } from '../lib/kpisEvaluacion'
import {
  ESTADOS_ACTIVOS, prepararDatos, pendientesPersona, fechaCorta, fechaLarga, fmtJornadas,
} from '../lib/pendientesHoy'

// "Pendientes de hoy" del Overview: qué le toca hoy a cada quien y en qué orden,
// con aviso de atrasos. Solo consulta; los pasos se marcan en la ficha de la UO.
// Reglas en lib/pendientesHoy.js. Si una consulta falla, la sección no se muestra.

const CAMPOS_UO = 'id, referencia_operativa, nombre, prioridad, estado, link_archivos, digitalizador_id, analista_qa_id, km_teoricos, fecha_entrega_programada'
const ESTADO_LABEL = { Asignada:'Asignada', 'En Proceso':'En proceso', 'En Validacion':'En validación', 'En Correccion':'En corrección' }
const BLOQUE_IDS = 100

const ROJO = '#F87171'
const AZUL_CLARO = '#7DD3FC'

function chip(fondo, color) {
  return { fontFamily:'var(--mono)', fontSize:'9px', padding:'2px 7px', borderRadius:'4px', background:fondo, color, whiteSpace:'nowrap', letterSpacing:'0.04em' }
}
const LABEL = { fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', letterSpacing:'0.14em' }
const BTN = { fontFamily:'var(--mono)', fontSize:'10px', letterSpacing:'0.06em', padding:'7px 12px', borderRadius:'5px', border:'0.5px solid var(--border)', background:'var(--surface3)', color:'var(--text)' }

const ICONO_ALERTA = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>
const ICONO_CHECK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
const ICONO_SOL = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>

// Lectura que lanza error para que la sección falle completa y en silencio
async function todas(crear) {
  const { data, error } = await leerTodas(crear)
  if (error) throw error
  return data
}

async function porBloquesDeIds(ids, crear) {
  const res = []
  for (let i = 0; i < ids.length; i += BLOQUE_IDS) {
    const bloque = ids.slice(i, i + BLOQUE_IDS)
    res.push(...await todas((desde, hasta) => crear(bloque).range(desde, hasta)))
  }
  return res
}

// personaId = null lee a todo el equipo (vista del coordinador)
async function cargarDatos(personaId, hoy) {
  const desde = sumarDias(hoy, -60)
  const hasta = sumarDias(hoy, 21)
  const filtrar = q => personaId ? q.eq('responsable_id', personaId) : q

  const uos = await todas((d, h) => {
    let q = supabase.from('unidades_operativas').select(CAMPOS_UO)
      .in('estado', ESTADOS_ACTIVOS).eq('es_historico', false)
    if (personaId) q = q.or(`digitalizador_id.eq.${personaId},analista_qa_id.eq.${personaId}`)
    return q.order('id').range(d, h)
  })
  const ids = uos.map(u => u.id)
  const idsCorreccion = uos.filter(u => u.estado === 'En Correccion').map(u => u.id)

  const [actividades, cargaUo, cargaAct, inhabiles, ausencias, checklists, perfiles, integrantes] = await Promise.all([
    porBloquesDeIds(ids, b => supabase.from('actividades_uo')
      .select('id,uo_id,nombre,orden,ronda,responsable_id,fecha_programada,completada_en,plantilla:plantillas_actividad(momento_creacion)')
      .in('uo_id', b).order('id')),
    todas((d, h) => filtrar(supabase.from('plan_carga_uo').select('uo_id,fecha,responsable_id,jornadas')
      .gte('fecha', hoy).lte('fecha', hasta)).order('uo_id').order('fecha').range(d, h)),
    todas((d, h) => filtrar(supabase.from('plan_carga_actividad').select('actividad_id,fecha,responsable_id,jornadas,actividad:actividades_uo(uo_id)')
      .gte('fecha', hoy).lte('fecha', hasta)).order('actividad_id').order('fecha').range(d, h)),
    todas((d, h) => supabase.from('plan_dias_inhabiles').select('fecha').order('fecha').range(d, h)),
    todas((d, h) => {
      let q = supabase.from('plan_ausencias').select('profile_id,fecha,fraccion,tipo').gte('fecha', desde).lte('fecha', hasta)
      if (personaId) q = q.eq('profile_id', personaId)
      return q.order('profile_id').order('fecha').range(d, h)
    }),
    porBloquesDeIds(idsCorreccion, b => supabase.from('checklist_resultados')
      .select('id,uo_id,resultado,fecha_revision,created_at').in('uo_id', b).order('id')),
    todas((d, h) => supabase.from('profiles').select('id,nombre').order('id').range(d, h)),
    personaId ? Promise.resolve([]) : todas((d, h) => supabase.from('plan_integrantes')
      .select('profile_id,orden,perfil:profiles(id,nombre)').eq('activo', true).order('orden').order('profile_id').range(d, h)),
  ])

  return {
    datos: prepararDatos({
      uos, actividades, cargaUo, inhabiles, ausencias, checklists, perfiles,
      cargaActividad: cargaAct.map(c => ({ ...c, uo_id: c.actividad?.uo_id })),
    }),
    integrantes,
  }
}

function plural(n, uno, varios) { return `${n} ${n === 1 ? uno : varios}` }

function textoAusencia(a) {
  return (Number(a.fraccion) < 1 ? 'Medio día · ' : '') + a.tipo
}

export default function PendientesHoy({ profile }) {
  const esCoordinador = profile?.rol === 'coordinador' && profile?.activo !== false
  const [estado, setEstado] = useState({ cargando: true, error: false, datos: null, integrantes: [] })
  const hoy = hoyMexico()

  useEffect(() => {
    if (!profile?.id) return
    let vigente = true
    cargarDatos(esCoordinador ? null : profile.id, hoy)
      .then(r => { if (vigente) setEstado({ cargando: false, error: false, ...r }) })
      .catch(() => { if (vigente) setEstado({ cargando: false, error: true, datos: null, integrantes: [] }) })
    return () => { vigente = false }
  }, [profile?.id, esCoordinador, hoy])

  if (estado.cargando || estado.error || !estado.datos) return null
  return esCoordinador
    ? <VistaEquipo hoy={hoy} datos={estado.datos} integrantes={estado.integrantes} />
    : <VistaPersona hoy={hoy} datos={estado.datos} persona={profile.id} />
}

// ---------------------------------------------------------------------------
// Vista de cada persona
// ---------------------------------------------------------------------------

function VistaPersona({ hoy, datos, persona }) {
  const navigate = useNavigate()
  const [verTodas, setVerTodas] = useState(false)
  const r = pendientesPersona(persona, hoy, datos)
  const sinPlan = datos.uos.length === 0 && r.jornadasHoy === 0 && r.proximos.every(p => p.jornadas === 0)
  if (sinPlan) return null   // cuentas sin UOs ni carga (apoyo, consulta)

  const ausenteHoy = r.ausenciaHoy && Number(r.ausenciaHoy.fraccion) >= 1
  const bloqueados = [...new Set(r.atrasados.filter(i => i.libera).map(i => i.libera))]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
      {!ausenteHoy && r.atrasados.length > 0 && (
        <div role="alert" style={{ display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap', background:'rgba(239,68,68,0.10)', border:'0.5px solid rgba(239,68,68,0.45)', borderRadius:'8px', padding:'12px 16px' }}>
          <span style={{ width:20, height:20, color:ROJO, flexShrink:0 }}>{ICONO_ALERTA}</span>
          <div style={{ flex:'1 1 320px' }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:ROJO, letterSpacing:'0.08em', fontWeight:500 }}>
              {plural(r.atrasados.length, 'PENDIENTE ATRASADO', 'PENDIENTES ATRASADOS')}
            </div>
            <div style={{ fontSize:'12px', marginTop:'2px' }}>
              {bloqueados.length > 0
                ? <>Detiene{r.atrasados.length === 1 ? '' : 'n'} a <b>{bloqueados.join(' y ')}</b>. Termínalo{r.atrasados.length === 1 ? '' : 's'} antes de empezar lo de hoy.</>
                : <>Termínalo{r.atrasados.length === 1 ? '' : 's'} antes de empezar lo de hoy.</>}
            </div>
          </div>
        </div>
      )}

      <div className="glass" style={{ borderRadius:'var(--radius-lg)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'10px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'8px' }}>
          <span style={{ ...LABEL, color:'var(--text)' }}>{ausenteHoy ? 'HOY' : 'PENDIENTES DE HOY · EN ESTE ORDEN'}</span>
          <span style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            {r.ausenciaHoy && !ausenteHoy && <span style={chip('rgba(148,163,184,0.16)', 'var(--muted2)')}>{textoAusencia(r.ausenciaHoy).toUpperCase()}</span>}
            <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>
              {fechaLarga(hoy)}{!ausenteHoy && r.jornadasHoy > 0 ? ` · ${fmtJornadas(r.jornadasHoy)} planeada${r.jornadasHoy === 1 ? '' : 's'}` : ''}
            </span>
          </span>
        </div>

        {ausenteHoy ? (
          <Mensaje icono={ICONO_SOL} color="var(--accent-b)"
            titulo={r.ausenciaHoy.tipo === 'Vacaciones' ? 'Estás de vacaciones' : 'Hoy tienes el día libre'}
            texto={`Aquí no hay nada pendiente para ti. Tu lista vuelve el ${fechaLarga(r.regresa).toLowerCase()}.`} />
        ) : r.items.length === 0 ? (
          <>
            <Mensaje icono={ICONO_CHECK} color="var(--green)"
              titulo="Sin pendientes para hoy"
              texto={r.adelantar.length > 0 ? 'Vas al día. Si te queda tiempo, puedes adelantar:' : 'Vas al día. Lo que sigue lo ves en Próximos días.'} />
            {r.adelantar.map(a => (
              <div key={a.clave} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px', flexWrap:'wrap', background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'8px 12px' }}>
                <div style={{ minWidth:0, display:'flex', flexDirection:'column', gap:'2px' }}>
                  <span style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
                    <span style={{ fontFamily:'var(--mono)', fontSize:'11px', fontWeight:500 }}>{a.uo.referencia_operativa}</span>
                    <span style={{ fontSize:'12px', fontWeight:600 }}>{a.titulo}</span>
                  </span>
                  <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{a.vence}</span>
                </div>
                <button onClick={() => navigate('/backlog/' + a.uo.id)} style={BTN}>ABRIR UO</button>
              </div>
            ))}
          </>
        ) : (
          r.items.map((it, i) => <TarjetaPendiente key={it.clave} it={it} num={i + 1} hoy={hoy} onAbrir={() => navigate('/backlog/' + it.uo.id)} />)
        )}

        {!ausenteHoy && r.espera.map(e => (
          <div key={e.clave} style={{ display:'flex', gap:'12px', alignItems:'flex-start', flexWrap:'wrap', border:'0.5px dashed rgba(255,255,255,0.2)', borderRadius:'8px', padding:'10px 12px' }}>
            <div style={{ width:24, height:24, borderRadius:'50%', border:'0.5px dashed rgba(255,255,255,0.3)', color:'var(--muted2)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:'10px', flexShrink:0 }}>—</div>
            <div style={{ flex:'1 1 320px', minWidth:0, display:'flex', flexDirection:'column', gap:'4px' }}>
              <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontFamily:'var(--mono)', fontSize:'11px', color:'var(--muted2)' }}>{e.uo.referencia_operativa}</span>
                <span style={chip('rgba(145,152,161,0.12)', 'var(--muted2)')}>EN ESPERA</span>
              </div>
              <div style={{ fontSize:'12px', fontWeight:600, color:'var(--muted2)' }}>{e.titulo}</div>
              <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{e.motivo} Cuando se entregue, aparece aquí.</div>
            </div>
            {e.jornadas > 0 && <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{fmtJornadas(e.jornadas)} reservada{e.jornadas === 1 ? '' : 's'}</span>}
          </div>
        ))}

        {!ausenteHoy && r.items.length > 0 && (
          <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', lineHeight:1.6 }}>
            Orden: primero lo atrasado, luego lo que libera a otra persona, luego prioridad y fecha de entrega. Si terminas antes, adelanta lo que sigue. Los pasos se marcan dentro de la ficha de la UO.
          </div>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'12px' }}>
        <div className="glass" style={{ borderRadius:'var(--radius-lg)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'8px' }}>
          <span style={LABEL}>PRÓXIMOS DÍAS</span>
          {r.proximos.map(p => (
            <div key={p.dia} style={{ display:'flex', justifyContent:'space-between', gap:'10px', borderTop:'0.5px solid var(--border2)', paddingTop:'8px' }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:'11px', color:'var(--text)' }}>{fechaCorta(p.dia)}</div>
                <div style={{ fontSize:'11px', color:'var(--muted2)', marginTop:'2px' }}>
                  {p.ausencia && <span style={{ ...chip('rgba(148,163,184,0.16)', 'var(--muted2)'), marginRight:'6px' }}>{textoAusencia(p.ausencia).toUpperCase()}</span>}
                  {p.refs.length > 0 ? p.refs.join(' · ') : (p.ausencia && Number(p.ausencia.fraccion) >= 1 ? '' : 'Sin carga planeada')}
                </div>
              </div>
              {p.jornadas > 0 && <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)', whiteSpace:'nowrap' }}>{fmtJornadas(p.jornadas)}</span>}
            </div>
          ))}
        </div>

        <div className="glass" style={{ borderRadius:'var(--radius-lg)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'8px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'8px' }}>
            <span style={LABEL}>TODAS MIS ASIGNACIONES · {plural(datos.uos.length, 'UO', 'UOs')}</span>
            <button onClick={() => setVerTodas(v => !v)} style={{ ...BTN, background:'none', color:'var(--muted2)' }}>{verTodas ? 'OCULTAR' : 'MOSTRAR'}</button>
          </div>
          {verTodas && datos.uos.map(u => (
            <div key={u.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'8px', background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:'6px', padding:'7px 10px' }}>
              <button onClick={() => navigate('/backlog/' + u.id)} style={{ background:'none', border:'none', padding:0, color:'var(--text)', textAlign:'left', minWidth:0 }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:'10px' }}>{u.referencia_operativa}</div>
                <div style={{ fontSize:'10px', color:'var(--muted2)', fontWeight:400 }}>{u.nombre}</div>
              </button>
              <span style={{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 }}>
                {u.link_archivos && <a href={u.link_archivos} target="_blank" rel="noreferrer" style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--blue)', textDecoration:'underline' }}>ARCHIVOS</a>}
                <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>{ESTADO_LABEL[u.estado] || u.estado}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Mensaje({ icono, color, titulo, texto }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'14px', padding:'14px 4px' }}>
      <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--surface3)', color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <span style={{ width:20, height:20 }}>{icono}</span>
      </div>
      <div>
        <div style={{ fontSize:'15px', fontWeight:700 }}>{titulo}</div>
        <div style={{ fontSize:'12px', color:'var(--muted2)', marginTop:'2px' }}>{texto}</div>
      </div>
    </div>
  )
}

function TarjetaPendiente({ it, num, hoy, onAbrir }) {
  const p1 = it.uo.prioridad === 'P1'
  const colorVence = it.atrasado ? ROJO : it.fecha === hoy ? 'var(--yellow)' : 'var(--muted2)'
  return (
    <div style={{ display:'flex', gap:'12px', alignItems:'flex-start', flexWrap:'wrap', background:'var(--surface2)', border:'0.5px solid ' + (it.atrasado ? 'rgba(239,68,68,0.55)' : 'var(--border2)'), borderRadius:'8px', padding:'10px 12px' }}>
      <div style={{ width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:'10px', flexShrink:0,
        background: it.atrasado ? 'rgba(239,68,68,0.18)' : 'var(--surface4)', color: it.atrasado ? ROJO : 'var(--text)' }}>{num}</div>
      <div style={{ flex:'1 1 320px', minWidth:0, display:'flex', flexDirection:'column', gap:'4px' }}>
        <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontFamily:'var(--mono)', fontSize:'11px', fontWeight:500 }}>{it.uo.referencia_operativa}</span>
          {it.uo.prioridad && <span style={chip(p1 ? 'rgba(249,115,22,0.2)' : 'rgba(145,152,161,0.12)', p1 ? 'var(--orange)' : 'var(--muted2)')}>{it.uo.prioridad}</span>}
          {it.atrasado && <span style={chip('rgba(239,68,68,0.15)', ROJO)}>ATRASADO{it.diasAtraso > 0 ? ` · ${plural(it.diasAtraso, 'DÍA HÁB.', 'DÍAS HÁB.')}` : ''}</span>}
          {it.libera && <span style={chip('rgba(56,189,248,0.12)', AZUL_CLARO)}>LIBERA A {it.libera.toUpperCase()}</span>}
          {it.tipo === 'correccion' && <span style={chip('rgba(250,204,21,0.12)', 'var(--yellow)')}>CORRECCIÓN</span>}
        </div>
        <div style={{ fontSize:'10.5px', color:'var(--muted2)' }}>{it.uo.nombre}</div>
        <div style={{ fontSize:'13px', fontWeight:600 }}>{it.titulo}</div>
        <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:colorVence }}>{it.vence}</div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'6px', flexShrink:0 }}>
        {it.jornadas > 0 && <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{fmtJornadas(it.jornadas)} hoy</span>}
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {it.uo.link_archivos && <a href={it.uo.link_archivos} target="_blank" rel="noreferrer" style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--blue)', textDecoration:'underline' }}>ARCHIVOS</a>}
          <button onClick={onAbrir} style={BTN}>ABRIR UO</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vista del coordinador
// ---------------------------------------------------------------------------

function VistaEquipo({ hoy, datos, integrantes }) {
  const navigate = useNavigate()
  const filas = integrantes.map(ig => {
    const r = pendientesPersona(ig.profile_id, hoy, datos)
    const proxAus = r.ausenciaHoy || r.proximos.find(p => p.ausencia)?.ausencia || null
    return {
      id: ig.profile_id,
      nombre: ig.perfil?.nombre || 'Sin nombre',
      r,
      ausencia: proxAus ? `${proxAus.fecha === hoy ? 'Hoy' : fechaCorta(proxAus.fecha)} · ${textoAusencia(proxAus).toLowerCase()}` : '—',
      detiene: [...new Set(r.atrasados.filter(i => i.libera).map(i => i.libera))],
    }
  })
  const atrasos = filas.flatMap(f => f.r.atrasados.map(i => ({ ...i, persona: f.nombre.split(' ')[0] })))
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
  const queDetienen = atrasos.filter(a => a.libera).length
  const TD = { padding:'10px 14px', borderBottom:'0.5px solid var(--border2)', fontSize:'11.5px' }
  const TH = { ...TD, fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', letterSpacing:'0.08em', fontWeight:500, textAlign:'left' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
      {atrasos.length > 0 && (
        <div role="alert" style={{ display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap', background:'rgba(239,68,68,0.10)', border:'0.5px solid rgba(239,68,68,0.45)', borderRadius:'8px', padding:'12px 16px' }}>
          <span style={{ width:20, height:20, color:ROJO, flexShrink:0 }}>{ICONO_ALERTA}</span>
          <div style={{ flex:'1 1 320px', fontFamily:'var(--mono)', fontSize:'10px', color:ROJO, letterSpacing:'0.08em', fontWeight:500 }}>
            {plural(atrasos.length, 'ATRASO', 'ATRASOS')} EN EL EQUIPO{queDetienen > 0 ? ` · ${queDetienen} ${queDetienen === 1 ? 'DETIENE' : 'DETIENEN'} A OTRA PERSONA` : ''}
          </div>
          <button onClick={() => navigate('/plan-semanal')} style={{ ...BTN, background:'none', color:ROJO, borderColor:'rgba(239,68,68,0.45)' }}>IR AL PLAN SEMANAL</button>
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'8px' }}>
        <span style={{ ...LABEL, color:'var(--text)' }}>EL EQUIPO HOY</span>
        <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{fechaLarga(hoy)}</span>
      </div>
      <div className="glass" style={{ borderRadius:'var(--radius-lg)', overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'620px' }}>
          <thead><tr>{['PERSONA', 'HOY', 'JORNADAS', 'ATRASADOS', 'DETIENE A', 'AUSENCIA'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.id}>
                <td style={{ ...TD, fontWeight:600 }}>{f.nombre}</td>
                <td style={{ ...TD, fontFamily:'var(--mono)' }}>
                  {f.r.ausenciaHoy && Number(f.r.ausenciaHoy.fraccion) >= 1 ? '—' : f.r.items.length === 0 ? 'Al día' : plural(f.r.items.length, 'pendiente', 'pendientes')}
                  {f.r.espera.length > 0 && <span style={{ color:'var(--muted2)' }}> + {f.r.espera.length} en espera</span>}
                </td>
                <td style={{ ...TD, fontFamily:'var(--mono)', color:'var(--muted2)' }}>{f.r.jornadasHoy > 0 ? fmtJornadas(f.r.jornadasHoy) : '—'}</td>
                <td style={TD}>
                  <span style={f.r.atrasados.length > 0 ? chip('rgba(239,68,68,0.15)', ROJO) : chip('rgba(34,197,94,0.12)', 'var(--green)')}>{f.r.atrasados.length}</span>
                </td>
                <td style={{ ...TD, fontFamily:'var(--mono)', color: f.detiene.length ? AZUL_CLARO : 'var(--muted2)' }}>{f.detiene.length ? f.detiene.join(', ') : '—'}</td>
                <td style={{ ...TD, fontFamily:'var(--mono)', color:'var(--muted2)' }}>{f.ausencia}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {atrasos.length > 0 && (
        <div className="glass" style={{ borderRadius:'var(--radius-lg)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'8px' }}>
          <span style={LABEL}>ATRASOS DEL EQUIPO · EL MÁS VIEJO PRIMERO</span>
          {atrasos.map(a => (
            <button key={a.clave} onClick={() => navigate('/backlog/' + a.uo.id)}
              style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px', flexWrap:'wrap', background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:'6px', padding:'8px 12px', color:'var(--text)', textAlign:'left' }}>
              <span style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
                <span style={{ fontFamily:'var(--mono)', fontSize:'11px' }}>{a.uo.referencia_operativa}</span>
                <span style={{ fontSize:'11px', color:'var(--muted2)', fontWeight:400 }}>{a.titulo} · {a.persona}</span>
                {a.libera && <span style={chip('rgba(56,189,248,0.12)', AZUL_CLARO)}>DETIENE A {a.libera.toUpperCase()}</span>}
              </span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:ROJO }}>
                {a.diasAtraso > 0 ? plural(a.diasAtraso, 'día hábil', 'días hábiles') + ' · ' : ''}desde {fechaCorta(a.fecha)}
              </span>
            </button>
          ))}
          <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>Para moverlos se usa REPROGRAMAR en el Plan semanal.</span>
        </div>
      )}
    </div>
  )
}
