import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
// Los 4 pasos de asignación, por orden: insumos, preparación (Vertex), carga en Vetro, pulido en Vetro
const PASOS = [1, 2, 3, 4]
const EPS = 0.005
const VISTAS = [{ key:'plan', label:'PLAN DE ACTIVIDADES' }, { key:'carga', label:'CARGA DE TRABAJO' }]

const ICONS = {
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>,
  reloj: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  alerta: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>,
  gauge: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 12L16 8"/><circle cx="12" cy="12" r="9"/><path d="M12 21a9 9 0 01-9-9"/></svg>,
}

function Kpi({ icon, label, value, color = 'var(--text)', sub }) {
  return (
    <div className="glass" style={{ borderRadius:'10px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
      <div style={{ width:32, height:32, flexShrink:0, borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center',
        background:'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(56,189,248,0.16))', border:'1px solid rgba(139,92,246,0.25)', color:'var(--accent-a)' }}>
        <div style={{ width:17, height:17 }}>{icon}</div>
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', letterSpacing:'0.1em', marginBottom:'3px' }}>{label}</div>
        <div style={{ fontFamily:'var(--disp)', fontSize:'26px', fontWeight:800, color, lineHeight:1.15 }}>{value}</div>
        {sub && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'2px' }}>{sub}</div>}
      </div>
    </div>
  )
}

// Fechas de negocio como texto 'YYYY-MM-DD'. La aritmética usa Date.UTC sobre
// año, mes y día, así que no depende de la zona horaria del navegador.
const FORMATO_DIA_MX = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
})
function hoyMexico() {
  const p = Object.fromEntries(FORMATO_DIA_MX.formatToParts(new Date()).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
function partes(f) { return f.split('-').map(Number) }
function sumarDias(f, n) {
  const [y, m, d] = partes(f)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  const pad = v => String(v).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}
function diaSemanaIso(f) {
  const [y, m, d] = partes(f)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 + 1
}
function lunesDe(f) { return sumarDias(f, -(diaSemanaIso(f) - 1)) }
function diasEntre(a, b) {
  const [y1, m1, d1] = partes(a), [y2, m2, d2] = partes(b)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}
function ddmm(f) { const [, m, d] = partes(f); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}` }
function textoSemana(lunes) {
  const [, m1, d1] = partes(lunes), [y2, m2, d2] = partes(sumarDias(lunes, 4))
  return m1 === m2
    ? `Semana del ${d1} al ${d2} de ${MESES[m2 - 1]} de ${y2}`
    : `Semana del ${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]} de ${y2}`
}
// Fila vigente en una fecha (plan_capacidad, plan_parametros)
function vigente(filas, fecha) {
  return filas
    .filter(r => r.vigente_desde <= fecha && (!r.vigente_hasta || r.vigente_hasta >= fecha))
    .sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1))[0]
}
function fmt(n) { return String(Number(Number(n).toFixed(2))) }

// Consulta que nunca rompe la pantalla: null si falla
async function consultar(consulta) {
  try {
    const { data, error } = await consulta
    return error ? null : (data || [])
  } catch {
    return null
  }
}

function estadoPaso(a, hoy) {
  if (!a) return 'sin'
  if (a.completada_en) return 'hecha'
  if (a.fecha_programada && a.fecha_programada < hoy) return 'atrasada'
  return 'pendiente'
}

function estadoCarga(j, cap) {
  const libre = cap - j
  if (cap <= EPS && j <= EPS) return { txt:'Sin capacidad', color:'var(--muted)' }
  if (libre > EPS) return { txt:'Libre ' + fmt(libre), color:'var(--green)' }
  if (libre >= -EPS) return { txt:'Completo', color:'var(--orange)' }
  return { txt:'Sobrecarga +' + fmt(-libre), color:'var(--red)' }
}

const TH = { textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--muted)', fontWeight:600, padding:'10px 16px', borderBottom:'0.5px solid var(--border2)' }
const TD = { padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', fontSize:11 }
const COLUMNAS = '170px repeat(5, minmax(150px, 1fr)) 150px'

async function cargarSemana(lun, hoy) {
  const vie = sumarDias(lun, 4)
  const [integrantes, capacidad, inhabiles, carga, parametros, atrasadas, actSemana] = await Promise.all([
    consultar(supabase.from('plan_integrantes').select('profile_id, orden, perfil:profiles(id,nombre,iniciales)').eq('activo', true).order('orden')),
    consultar(supabase.from('plan_capacidad').select('dia_semana,jornadas,etiqueta,vigente_desde,vigente_hasta')),
    consultar(supabase.from('plan_dias_inhabiles').select('fecha,descripcion').gte('fecha', lun).lte('fecha', vie)),
    consultar(supabase.from('plan_carga_uo').select('uo_id,fecha,responsable_id,jornadas').gte('fecha', lun).lte('fecha', vie)),
    consultar(supabase.from('plan_parametros').select('clave,valor,vigente_desde,vigente_hasta').eq('clave', 'jornada_minima_uo')),
    consultar(supabase.from('actividades_uo').select('uo_id').lt('fecha_programada', hoy).is('completada_en', null)),
    consultar(supabase.from('actividades_uo').select('uo_id').gte('fecha_programada', lun).lte('fecha_programada', vie)),
  ])

  const uoIds = [...new Set([...(carga || []), ...(atrasadas || []), ...(actSemana || [])].map(r => r.uo_id))]
  let actividades = [], uos = []
  if (uoIds.length > 0) {
    ;[actividades, uos] = await Promise.all([
      consultar(supabase.from('actividades_uo')
        .select('id,uo_id,nombre,orden,ronda,responsable_id,fecha_programada,fecha_origen,completada_en')
        .in('uo_id', uoIds)),
      consultar(supabase.from('unidades_operativas')
        .select('id,referencia_operativa,nombre,km_teoricos,fecha_entrega_programada')
        .in('id', uoIds)),
    ])
  }

  return { lunes: lun, integrantes, capacidad, inhabiles, carga, parametros, actividades, uos }
}

function Encabezado({ dias, etiquetaDia, hoy }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:COLUMNAS, borderBottom:'0.5px solid var(--border2)' }}>
      <div style={{ ...TH, borderBottom:'none' }}>Integrante</div>
      {dias.map((f, i) => (
        <div key={f} style={{ ...TH, borderBottom:'none', borderLeft:'0.5px solid var(--border2)', background: f === hoy ? 'rgba(249,115,22,0.06)' : 'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <span>{DIAS[i]} {ddmm(f)}</span>
            {f === hoy && <span style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'1px 5px', borderRadius:'3px', background:'rgba(249,115,22,0.18)', color:'var(--orange)', letterSpacing:'0.08em' }}>HOY</span>}
          </div>
          {etiquetaDia[f] && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', textTransform:'none', letterSpacing:0, fontWeight:400, marginTop:'2px' }}>{etiquetaDia[f]}</div>}
        </div>
      ))}
      <div style={{ ...TH, borderBottom:'none', borderLeft:'0.5px solid var(--border2)' }}>Semana</div>
    </div>
  )
}

function CeldaPersona({ p, filas }) {
  return (
    <div style={{ gridColumn:1, gridRow:`1 / span ${filas}`, padding:'10px 16px', display:'flex', alignItems:'flex-start', gap:'8px' }}>
      <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--surface2)', color:'var(--accent-a)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:'9px', flexShrink:0, border:'0.5px solid var(--border)' }}>{p.iniciales}</div>
      <div style={{ fontSize:'11px', fontWeight:600, lineHeight:1.3 }}>{p.nombre}</div>
    </div>
  )
}

function FondoDias({ dias, hoy, filas }) {
  return dias.map((f, i) => (
    <div key={f} style={{ gridColumn:i + 2, gridRow:`1 / span ${filas}`, borderLeft:'0.5px solid var(--border2)', background: f === hoy ? 'rgba(249,115,22,0.04)' : 'none' }} />
  ))
}

function TarjetaUo({ it, uo, pasos, hoy, onAbrir }) {
  const estados = PASOS.map(o => estadoPaso(pasos[o], hoy))
  const ajustadas = PASOS.map(o => pasos[o]).filter(a => a && a.fecha_origen === 'ajustada')
  const fechas = PASOS.map(o => pasos[o]?.fecha_programada).filter(Boolean).sort()
  const ultima = fechas[fechas.length - 1]
  const tarde = uo.fecha_entrega_programada && ultima && ultima > uo.fecha_entrega_programada
  const color = estados.includes('atrasada') ? 'var(--red)' : estados.every(e => e === 'hecha') ? 'var(--green)' : 'var(--orange)'
  return (
    <div onClick={onAbrir}
      style={{ gridColumn:`${it.ini + 2} / ${it.fin + 3}`, gridRow:it.carril + 1, position:'relative', zIndex:1, minWidth:0, margin:'4px 6px', cursor:'pointer',
        background:'var(--surface2)', border:'0.5px solid var(--border2)', borderLeft:'2px solid ' + color, borderRadius:'6px', padding:'6px 8px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', minWidth:0 }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--orange)', flexShrink:0 }}>{uo.referencia_operativa}</span>
        <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', flexShrink:0 }}>{uo.km_teoricos ? fmt(uo.km_teoricos) + ' km' : '--- km'}</span>
        {tarde && (
          <span title={`La ultima actividad (${ddmm(ultima)}) cae despues de la entrega programada (${ddmm(uo.fecha_entrega_programada)})`}
            style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'1px 5px', borderRadius:'3px', background:'rgba(239,68,68,0.12)', color:'var(--red)', flexShrink:0 }}>
            ENTREGA {ddmm(uo.fecha_entrega_programada)}
          </span>
        )}
      </div>
      <div title={uo.nombre} style={{ fontSize:'10px', color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', margin:'3px 0 5px 0' }}>{uo.nombre}</div>
      <div style={{ display:'flex', alignItems:'center', gap:'3px' }}>
        {PASOS.map((o, i) => {
          const a = pasos[o], e = estados[i]
          return (
            <div key={o} title={a ? `${a.nombre} · ${a.fecha_programada ? ddmm(a.fecha_programada) : 'sin fecha'} · ${e}` : 'Sin actividad'}
              style={{ width:14, height:14, borderRadius:'3px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:'9px', fontWeight:700,
                border:'0.5px solid ' + (e === 'hecha' ? 'var(--green)' : e === 'atrasada' ? 'var(--red)' : 'var(--border)'),
                background: e === 'hecha' ? 'rgba(34,197,94,0.18)' : e === 'atrasada' ? 'rgba(239,68,68,0.15)' : 'none',
                color: e === 'hecha' ? 'var(--green)' : 'var(--red)' }}>
              {e === 'hecha' ? '✓' : e === 'atrasada' ? '!' : ''}
            </div>
          )
        })}
        {ajustadas.length > 0 && (
          <span title={'Fecha ajustada a mano: ' + ajustadas.map(a => a.nombre).join(', ')}
            style={{ color:'var(--accent-a)', fontSize:'11px', marginLeft:'3px', lineHeight:1 }}>✎</span>
        )}
      </div>
    </div>
  )
}

function TarjetaValidacion({ it, uo, onAbrir }) {
  return (
    <div onClick={onAbrir} title={it.act.nombre}
      style={{ gridColumn:`${it.ini + 2} / ${it.fin + 3}`, gridRow:it.carril + 1, position:'relative', zIndex:1, minWidth:0, margin:'4px 6px', cursor:'pointer',
        border:'1px dashed var(--border)', borderRadius:'6px', padding:'6px 8px' }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>{uo.referencia_operativa}</div>
      <div style={{ fontSize:'10px', color:'var(--muted2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{it.act.nombre}</div>
    </div>
  )
}

function Barra({ valor, total, color }) {
  const pct = total > 0 ? Math.min(100, (valor / total) * 100) : (valor > 0 ? 100 : 0)
  return (
    <div style={{ height:'5px', background:'var(--border2)', borderRadius:'3px', overflow:'hidden', margin:'4px 0' }}>
      <div style={{ height:'100%', width: pct + '%', background: color, borderRadius:'3px' }} />
    </div>
  )
}

export default function PlanSemanal() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [hoy] = useState(hoyMexico)
  const [lunes, setLunes] = useState(() => lunesDe(hoyMexico()))
  const [vista, setVista] = useState('plan')
  const [datos, setDatos] = useState(null)

  useEffect(() => {
    if (profile && profile.rol !== 'coordinador') navigate('/')
  }, [profile])

  useEffect(() => {
    let actual = true
    cargarSemana(lunes, hoy).then(d => { if (actual) setDatos(d) })
    return () => { actual = false }
  }, [lunes, hoy])

  const loading = !datos || datos.lunes !== lunes

  const m = useMemo(() => {
    if (!datos) return null
    const dias = [0, 1, 2, 3, 4].map(i => sumarDias(lunes, i))
    const vie = dias[4]
    const enSemana = f => f && f >= lunes && f <= vie

    const integrantes = (datos.integrantes || []).filter(r => r.perfil).map(r => r.perfil)
    const ids = new Set(integrantes.map(p => p.id))

    const inhabil = Object.fromEntries((datos.inhabiles || []).map(r => [r.fecha, r.descripcion]))
    const capDia = {}, etiquetaDia = {}
    for (const f of dias) {
      const fila = datos.capacidad ? vigente(datos.capacidad.filter(r => r.dia_semana === diaSemanaIso(f)), f) : null
      capDia[f] = inhabil[f] ? 0 : Number(fila?.jornadas ?? 0)
      etiquetaDia[f] = inhabil[f] ? 'Inhábil' : (fila?.etiqueta || null)
    }

    const uoPorId = Object.fromEntries((datos.uos || []).map(u => [u.id, u]))
    const actividades = (datos.actividades || []).filter(a => uoPorId[a.uo_id])
    const pasosPorUo = {}
    for (const a of actividades) {
      if (!PASOS.includes(a.orden)) continue
      ;(pasosPorUo[a.uo_id] ||= {})[a.orden] = a
    }

    // Vista Plan: tramos (UO x persona) con los días de la semana que ocupan
    const tramos = {}
    const agregarDia = (persona, uoId, f, tipo = 'uo', act = null) => {
      if (!ids.has(persona) || !enSemana(f)) return
      const key = tipo === 'uo' ? `${persona}|${uoId}` : `${persona}|${act.id}`
      const t = (tramos[key] ||= { persona, uoId, tipo, act, dias: new Set() })
      t.dias.add(dias.indexOf(f))
    }
    for (const c of (datos.carga || [])) if (uoPorId[c.uo_id]) agregarDia(c.responsable_id, c.uo_id, c.fecha)
    for (const a of actividades) {
      if (PASOS.includes(a.orden)) agregarDia(a.responsable_id, a.uo_id, a.fecha_programada)
      else agregarDia(a.responsable_id, a.uo_id, a.fecha_programada, 'validacion', a)  // tarjeta punteada
    }

    const filasPlan = integrantes.map(p => {
      const items = Object.values(tramos)
        .filter(t => t.persona === p.id)
        .map(t => ({ ...t, ini: Math.min(...t.dias), fin: Math.max(...t.dias) }))
        .sort((a, b) => a.ini - b.ini || b.fin - a.fin)
      // Carriles: cada tramo va al primer carril donde no se encima con otro
      const finCarril = []
      for (const it of items) {
        let c = finCarril.findIndex(fin => fin < it.ini)
        if (c === -1) { c = finCarril.length; finCarril.push(it.fin) } else finCarril[c] = it.fin
        it.carril = c
      }
      const actsSemana = actividades.filter(a => a.responsable_id === p.id && PASOS.includes(a.orden) && enSemana(a.fecha_programada))
      return {
        persona: p,
        items,
        carriles: Math.max(finCarril.length, 1),
        planeadas: actsSemana.length,
        hechas: actsSemana.filter(a => a.completada_en).length,
        atrasadas: actsSemana.filter(a => estadoPaso(a, hoy) === 'atrasada').length,
      }
    })

    // Vista Carga
    const filasCarga = integrantes.map(p => {
      const celdas = dias.map(f => {
        const filas = (datos.carga || []).filter(c => c.responsable_id === p.id && c.fecha === f)
        const j = filas.reduce((s, c) => s + Number(c.jornadas), 0)
        return { fecha: f, j, cap: capDia[f], refs: filas.map(c => uoPorId[c.uo_id]?.referencia_operativa).filter(Boolean) }
      })
      const j = celdas.reduce((s, c) => s + c.j, 0)
      const cap = celdas.reduce((s, c) => s + c.cap, 0)
      const libre = celdas.reduce((s, c) => s + Math.max(0, c.cap - c.j), 0)
      const sobrecarga = celdas.reduce((s, c) => s + Math.max(0, c.j - c.cap), 0)
      return { persona: p, celdas, j, cap, libre, sobrecarga }
    })

    const minimo = datos.parametros ? Number(vigente(datos.parametros, hoy)?.valor) : NaN
    const dondeAsignar = Number.isFinite(minimo) && minimo > 0
      ? filasCarga
          .map(f => ({
            persona: f.persona,
            libre: f.libre,
            diasLibres: f.celdas.filter(c => c.cap - c.j > EPS).map(c => ({ fecha: c.fecha, libre: c.cap - c.j })),
            caben: f.celdas.reduce((s, c) => s + Math.floor(Math.max(0, c.cap - c.j) / minimo + 1e-9), 0),
          }))
          .sort((a, b) => b.libre - a.libre)
      : null

    // Atrasos (de cualquier semana) de los integrantes
    const atrasos = actividades
      .filter(a => ids.has(a.responsable_id) && estadoPaso(a, hoy) === 'atrasada')
      .map(a => ({ ...a, uo: uoPorId[a.uo_id], persona: integrantes.find(p => p.id === a.responsable_id) }))
      .sort((a, b) => (a.fecha_programada < b.fecha_programada ? -1 : 1))

    const planeadas = filasPlan.reduce((s, f) => s + f.planeadas, 0)
    const kpis = {
      hechas: filasPlan.reduce((s, f) => s + f.hechas, 0),
      planeadas,
      pendientesHoy: actividades.filter(a => ids.has(a.responsable_id) && PASOS.includes(a.orden) && a.fecha_programada === hoy && !a.completada_en).length,
      atrasadas: atrasos.length,
      jornadas: filasCarga.reduce((s, f) => s + f.j, 0),
      capacidad: filasCarga.reduce((s, f) => s + f.cap, 0),
    }

    return { dias, capDia, etiquetaDia, uoPorId, pasosPorUo, filasPlan, filasCarga, dondeAsignar, atrasos, kpis }
  }, [datos, lunes, hoy])

  // Secciones que se muestran solo si sus consultas respondieron
  const okPlan = datos && datos.integrantes && datos.carga && datos.capacidad && datos.inhabiles && datos.actividades && datos.uos
  const okCarga = datos && datos.integrantes && datos.carga && datos.capacidad && datos.inhabiles && datos.uos

  return (
    <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:'16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <span style={{ fontFamily:'var(--disp)', fontWeight:700, fontSize:'14px' }}>Plan semanal</span>
          <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', marginTop:'2px' }}>{textoSemana(lunes)}</div>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={() => setLunes(l => sumarDias(l, -7))}
            style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid var(--border2)', background:'none', color:'var(--muted2)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
            ← SEMANA ANTERIOR
          </button>
          {lunes !== lunesDe(hoy) && (
            <button onClick={() => setLunes(lunesDe(hoy))}
              style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid var(--border2)', background:'none', color:'var(--muted2)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
              ESTA SEMANA
            </button>
          )}
          <button onClick={() => setLunes(l => sumarDias(l, 7))}
            style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid var(--border2)', background:'none', color:'var(--muted2)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
            SEMANA SIGUIENTE →
          </button>
          <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'6px', padding:'2px', gap:'1px' }}>
            {VISTAS.map(v => (
              <button key={v.key} onClick={() => setVista(v.key)}
                style={{ padding:'5px 12px', borderRadius:'4px', fontSize:'9px', border:'none', fontFamily:'var(--mono)',
                  background: vista === v.key ? 'var(--accent-gradient)' : 'none',
                  color: vista === v.key ? '#fff' : 'var(--muted2)', cursor:'pointer' }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading || !m ? (
        <div style={{ fontFamily:'var(--mono)', fontSize:'11px', color:'var(--muted2)', padding:'24px 0' }}>Cargando...</div>
      ) : (
        <>
          {okPlan && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
              <Kpi icon={ICONS.check} label="ACTIVIDADES HECHAS" value={`${m.kpis.hechas} / ${m.kpis.planeadas}`} color="var(--green)" sub="Planeadas en la semana" />
              <Kpi icon={ICONS.reloj} label="PENDIENTES DE HOY" value={m.kpis.pendientesHoy} color="var(--orange)" sub={'Vencen el ' + ddmm(hoy)} />
              <Kpi icon={ICONS.alerta} label="ATRASADAS" value={m.kpis.atrasadas} color={m.kpis.atrasadas > 0 ? 'var(--red)' : 'var(--text)'} sub="De cualquier semana" />
              <Kpi icon={ICONS.gauge} label="JORNADAS PLANEADAS" value={`${fmt(m.kpis.jornadas)} / ${fmt(m.kpis.capacidad)}`} color="var(--blue)" sub="Contra la capacidad de la semana" />
            </div>
          )}

          {vista === 'plan' && okPlan && (
            <>
              <div className="glass" style={{ borderRadius:'var(--radius-lg)', overflowX:'auto' }}>
                <div style={{ minWidth:'1100px' }}>
                  <Encabezado dias={m.dias} etiquetaDia={m.etiquetaDia} hoy={hoy} />
                  {m.filasPlan.length === 0 && (
                    <div style={{ padding:'16px', fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)' }}>Sin integrantes activos en plan_integrantes.</div>
                  )}
                  {m.filasPlan.map(f => (
                    <div key={f.persona.id} style={{ display:'grid', gridTemplateColumns:COLUMNAS, gridAutoRows:'minmax(64px, auto)', borderBottom:'0.5px solid var(--border2)' }}>
                      <CeldaPersona p={f.persona} filas={f.carriles} />
                      <FondoDias dias={m.dias} hoy={hoy} filas={f.carriles} />
                      {f.items.map(it => it.tipo === 'uo'
                        ? <TarjetaUo key={it.persona + it.uoId} it={it} uo={m.uoPorId[it.uoId]} pasos={m.pasosPorUo[it.uoId] || {}} hoy={hoy}
                            onAbrir={() => navigate('/backlog/' + it.uoId)} />
                        : <TarjetaValidacion key={it.persona + it.act.id} it={it} uo={m.uoPorId[it.uoId]}
                            onAbrir={() => navigate('/backlog/' + it.uoId)} />)}
                      <div style={{ gridColumn:7, gridRow:`1 / span ${f.carriles}`, borderLeft:'0.5px solid var(--border2)', padding:'10px 14px' }}>
                        <div style={{ fontFamily:'var(--disp)', fontSize:'16px', fontWeight:700 }}>{f.hechas} / {f.planeadas}</div>
                        <Barra valor={f.hechas} total={f.planeadas} color="var(--green)" />
                        <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color: f.atrasadas > 0 ? 'var(--red)' : 'var(--muted2)' }}>
                          {f.atrasadas} atrasada{f.atrasadas === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass" style={{ borderRadius:'var(--radius-lg)', overflowX:'auto' }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', padding:'12px 16px 0 16px' }}>
                  ATRASOS A REVISAR · {m.atrasos.length}
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'760px' }}>
                  <thead>
                    <tr>{['Persona', 'UO', 'Proyecto', 'Actividad', 'Fecha programada', 'Dias de atraso', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {m.atrasos.length === 0 && (
                      <tr><td colSpan={7} style={{ ...TD, fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)' }}>Sin atrasos.</td></tr>
                    )}
                    {m.atrasos.map(a => (
                      <tr key={a.id}>
                        <td style={TD}>{a.persona?.nombre ?? '---'}</td>
                        <td style={{ ...TD, fontFamily:'var(--mono)', color:'var(--orange)' }}>{a.uo?.referencia_operativa}</td>
                        <td style={{ ...TD, maxWidth:'240px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={a.uo?.nombre}>{a.uo?.nombre}</td>
                        <td style={TD}>{a.nombre}</td>
                        <td style={{ ...TD, fontFamily:'var(--mono)' }}>{ddmm(a.fecha_programada)}</td>
                        <td style={{ ...TD, fontFamily:'var(--mono)', color:'var(--red)' }}>{diasEntre(a.fecha_programada, hoy)}</td>
                        <td style={TD}>
                          <button onClick={() => navigate('/backlog/' + a.uo_id)}
                            style={{ fontFamily:'var(--mono)', fontSize:'8px', padding:'4px 8px', borderRadius:'4px', border:'0.5px solid rgba(249,115,22,0.3)', background:'rgba(249,115,22,0.08)', color:'var(--orange)', cursor:'pointer' }}>
                            VER FICHA
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {vista === 'carga' && okCarga && (
            <>
              <div className="glass" style={{ borderRadius:'var(--radius-lg)', overflowX:'auto' }}>
                <div style={{ minWidth:'1100px' }}>
                  <Encabezado dias={m.dias} etiquetaDia={m.etiquetaDia} hoy={hoy} />
                  {m.filasCarga.length === 0 && (
                    <div style={{ padding:'16px', fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)' }}>Sin integrantes activos en plan_integrantes.</div>
                  )}
                  {m.filasCarga.map(f => {
                    const total = estadoCarga(f.j, f.cap)
                    return (
                      <div key={f.persona.id} style={{ display:'grid', gridTemplateColumns:COLUMNAS, borderBottom:'0.5px solid var(--border2)' }}>
                        <CeldaPersona p={f.persona} filas={1} />
                        {f.celdas.map((c, i) => {
                          const e = estadoCarga(c.j, c.cap)
                          return (
                            <div key={c.fecha} style={{ gridColumn:i + 2, borderLeft:'0.5px solid var(--border2)', padding:'10px 12px', background: c.fecha === hoy ? 'rgba(249,115,22,0.04)' : 'none' }}>
                              <div style={{ fontFamily:'var(--mono)', fontSize:'10px' }}>{fmt(c.j)} / {fmt(c.cap)}</div>
                              <Barra valor={c.j} total={c.cap} color={e.color} />
                              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:e.color }}>{e.txt}</div>
                              {c.refs.length > 0 && (
                                <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--orange)', marginTop:'4px', lineHeight:1.5 }}>{c.refs.join(' · ')}</div>
                              )}
                            </div>
                          )
                        })}
                        <div style={{ gridColumn:7, borderLeft:'0.5px solid var(--border2)', padding:'10px 14px' }}>
                          <div style={{ fontFamily:'var(--mono)', fontSize:'10px' }}>{fmt(f.j)} / {fmt(f.cap)}</div>
                          <Barra valor={f.j} total={f.cap} color={total.color} />
                          <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--green)' }}>Libre {fmt(f.libre)}</div>
                          {f.sobrecarga > EPS && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--red)' }}>Sobrecarga +{fmt(f.sobrecarga)}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {m.dondeAsignar && (
                <div className="glass" style={{ borderRadius:'10px', padding:'14px 16px' }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'10px' }}>DONDE ASIGNAR MAS TRABAJO</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                    {m.dondeAsignar.map(d => (
                      <div key={d.persona.id} style={{ display:'grid', gridTemplateColumns:'170px 120px 1fr', gap:'10px', alignItems:'center', background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:'6px', padding:'8px 12px' }}>
                        <div style={{ fontSize:'11px', fontWeight:600 }}>{d.persona.nombre}</div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color: d.libre > EPS ? 'var(--green)' : 'var(--muted)' }}>
                          Libre {fmt(d.libre)} · caben {d.caben} UO{d.caben === 1 ? '' : 's'} cortas
                        </div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)' }}>
                          {d.diasLibres.length > 0
                            ? d.diasLibres.map(x => `${DIAS[m.dias.indexOf(x.fecha)]} ${fmt(x.libre)}`).join(' · ')
                            : 'Sin espacio libre esta semana'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
