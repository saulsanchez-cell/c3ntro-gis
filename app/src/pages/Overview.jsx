import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import MapaAvance from '../components/MapaAvance'

const ESTADOS = ['Pendiente','Asignada','En Proceso','En Validacion','Validada','Rechazada']
const ESTADO_COLOR = { Pendiente:'var(--muted2)', Asignada:'var(--orange)', 'En Proceso':'var(--blue)', 'En Validacion':'var(--accent-a)', Validada:'var(--green)', Rechazada:'var(--red)', 'En Correccion':'var(--yellow)' }
const ESTADO_LABEL = { Pendiente:'Pendiente', Asignada:'Asignada', 'En Proceso':'En proceso', 'En Validacion':'En validación', Validada:'Validada', Rechazada:'Rechazada', 'En Correccion':'En corrección' }

const ICONS = {
  inventario: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="9" rx="1.2"/><rect x="14" y="3" width="7" height="5" rx="1.2"/><rect x="14" y="12" width="7" height="9" rx="1.2"/><rect x="3" y="16" width="7" height="5" rx="1.2"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>,
  avance: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
  star: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>,
  alerta: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>,
}

const AVATAR_COLORS = ['#8B5CF6', '#38BDF8', '#F5A623', '#34D399', '#F2545B', '#EC4899', '#22D3EE', '#A78BFA']

function colorAvatar(seed) {
  if (!seed) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[Math.abs(hash)]
}

function rangoMes(offset) {
  const d = new Date()
  const start = new Date(d.getFullYear(), d.getMonth() + offset, 1)
  const end = new Date(d.getFullYear(), d.getMonth() + offset + 1, 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

function bucketsPorSemana(fechas, semanas = 6) {
  const buckets = new Array(semanas).fill(0)
  const ahora = new Date()
  fechas.forEach(f => {
    const d = new Date(f)
    const diffSemanas = Math.floor((ahora - d) / (7 * 24 * 60 * 60 * 1000))
    if (diffSemanas >= 0 && diffSemanas < semanas) {
      buckets[semanas - 1 - diffSemanas]++
    }
  })
  return buckets
}

function promediosPorSemana(items, campoValor, semanas = 6) {
  const sumas = new Array(semanas).fill(0)
  const conteos = new Array(semanas).fill(0)
  const ahora = new Date()
  items.forEach(it => {
    const d = new Date(it.created_at)
    const diffSemanas = Math.floor((ahora - d) / (7 * 24 * 60 * 60 * 1000))
    if (diffSemanas >= 0 && diffSemanas < semanas) {
      const idx = semanas - 1 - diffSemanas
      sumas[idx] += it[campoValor] || 0
      conteos[idx]++
    }
  })
  return sumas.map((s, i) => conteos[i] > 0 ? s / conteos[i] : null)
}

function Sparkline({ data, color }) {
  const limpio = (data || []).map(v => v === null ? 0 : v)
  if (limpio.length < 2) return null
  const w = 60, h = 22
  const max = Math.max(...limpio, 1)
  const min = Math.min(...limpio, 0)
  const rango = (max - min) || 1
  const points = limpio.map((v, i) => {
    const x = (i / (limpio.length - 1)) * w
    const y = h - ((v - min) / rango) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flexShrink: 0 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

function Delta({ actual, anterior, sufijo }) {
  if (actual === null || actual === undefined || anterior === null || anterior === undefined) return null
  const diff = actual - anterior
  if (Math.abs(diff) < 0.05) return <span style={{ fontFamily:'var(--mono)', fontSize:'10.5px', color:'var(--muted2)' }}>— sin cambio</span>
  const positivo = diff > 0
  const color = positivo ? 'var(--green)' : 'var(--red)'
  const flecha = positivo ? '▲' : '▼'
  return <span style={{ fontFamily:'var(--mono)', fontSize:'10.5px', color, fontWeight:600 }}>{flecha} {Math.abs(diff).toFixed(1)}{sufijo}</span>
}

function Badge({ estado }) {
  const color = ESTADO_COLOR[estado] || 'var(--muted2)'
  const label = ESTADO_LABEL[estado] || estado
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:999, fontSize:11, fontWeight:600, background:color+'1A', color, border:'1px solid '+color+'40' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:color }} />
      {label}
    </span>
  )
}

function Prioridad({ p }) {
  const conf = p === 'P1' ? { label:'Alta', color:'var(--red)' } : p === 'P2' ? { label:'Media', color:'var(--yellow)' } : { label:'Baja', color:'var(--muted)' }
  return <span style={{ fontSize:11.5, fontWeight:600, color:conf.color }}>{conf.label}</span>
}

export default function Overview() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [stats, setStats] = useState({ total:0, validadas:0, sla_alto:0, pendientes:0, por_estado:{}, por_tipo:{} })
  const [comp, setComp] = useState({ nuevasEsteMes:null, nuevasMesPasado:null, validadasEsteMes:null, validadasMesPasado:null, scoreActual:null, scoreMesPasado:null })
  const [sparkInventario, setSparkInventario] = useState([])
  const [sparkValidadas, setSparkValidadas] = useState([])
  const [sparkScore, setSparkScore] = useState([])
  const [actividad, setActividad] = useState([])
  const [loading, setLoading] = useState(true)
  const [misUOs, setMisUOs] = useState([])
  const [uosConCoords, setUosConCoords] = useState([])

  const paraCargar = misUOs.filter(u => u.digitalizador_id === profile.id && (u.estado === 'Asignada' || u.estado === 'En Proceso' || u.estado === 'En Correccion'))
  const paraValidar = misUOs.filter(u => u.analista_qa_id === profile.id && u.estado === 'En Validacion')

  useEffect(() => { fetchData(); fetchComparativas(); fetchActividad() }, [])
  useEffect(() => { if (profile?.id) fetchMisUOs() }, [profile])

  async function fetchMisUOs() {
    const { data } = await supabase
      .from('unidades_operativas')
      .select('id, referencia_operativa, nombre, tipo_proyecto, prioridad, link_archivos, observaciones, digitalizador_id, analista_qa_id, estado')
      .or(`digitalizador_id.eq.${profile.id},analista_qa_id.eq.${profile.id}`)
      .in('estado', ['Asignada', 'En Proceso', 'En Validacion', 'En Correccion'])
      .eq('es_historico', false)
    setMisUOs(data || [])
  }

  async function fetchData() {
    let allUos = []
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data } = await supabase
        .from('unidades_operativas')
        .select('estado, tipo_proyecto, sla_validacion, referencia_operativa, nombre, prioridad, latitud, longitud, metodo_constructivo, id, created_at')
        .eq('es_historico', false)
        .range(from, from + pageSize - 1)
      if (!data || data.length === 0) break
      allUos = [...allUos, ...data]
      if (data.length < pageSize) break
      from += pageSize
    }
    const uo = allUos
    if (!uo.length) { setLoading(false); return }
    const por_estado = {}
    const por_tipo = {}
    ESTADOS.forEach(e => por_estado[e] = 0)
    uo.forEach(u => {
      por_estado[u.estado] = (por_estado[u.estado] || 0) + 1
      por_tipo[u.tipo_proyecto] = (por_tipo[u.tipo_proyecto] || 0) + 1
    })
    const sla_alto = uo.filter(u => u.sla_validacion > 3).length

    setStats({ total: uo.length, validadas: por_estado['Validada'] || 0, pendientes: por_estado['Pendiente'] || 0, sla_alto, por_estado, por_tipo })

    const esteMes = rangoMes(0)
    const mesPasado = rangoMes(-1)
    const nuevasEsteMes = uo.filter(u => u.created_at >= esteMes.start && u.created_at < esteMes.end).length
    const nuevasMesPasado = uo.filter(u => u.created_at >= mesPasado.start && u.created_at < mesPasado.end).length
    setComp(c => ({ ...c, nuevasEsteMes, nuevasMesPasado }))
    setSparkInventario(bucketsPorSemana(uo.map(u => u.created_at)))

    setUosConCoords(allUos.filter(u => u.latitud && u.longitud))
    setLoading(false)
  }

  async function fetchComparativas() {
    const esteMes = rangoMes(0)
    const mesPasado = rangoMes(-1)
    const hace6Semanas = new Date(Date.now() - 6 * 7 * 24 * 60 * 60 * 1000).toISOString()

    const { count: validadasEsteMes } = await supabase.from('historial_estados').select('id', { count:'exact', head:true }).eq('estado_nuevo','Validada').gte('created_at', esteMes.start).lt('created_at', esteMes.end)
    const { count: validadasMesPasado } = await supabase.from('historial_estados').select('id', { count:'exact', head:true }).eq('estado_nuevo','Validada').gte('created_at', mesPasado.start).lt('created_at', mesPasado.end)
    const { data: validacionesRecientes } = await supabase.from('historial_estados').select('created_at').eq('estado_nuevo','Validada').gte('created_at', hace6Semanas)
    setSparkValidadas(bucketsPorSemana((validacionesRecientes||[]).map(v => v.created_at)))

    const { data: scoreEsteMesData } = await supabase.from('checklist_resultados').select('score_porcentaje').gte('created_at', esteMes.start).lt('created_at', esteMes.end)
    const { data: scoreMesPasadoData } = await supabase.from('checklist_resultados').select('score_porcentaje').gte('created_at', mesPasado.start).lt('created_at', mesPasado.end)
    const { data: scoresRecientes } = await supabase.from('checklist_resultados').select('score_porcentaje, created_at').gte('created_at', hace6Semanas)
    setSparkScore(promediosPorSemana(scoresRecientes || [], 'score_porcentaje'))

    const avg = arr => (arr && arr.length) ? arr.reduce((s,r) => s + (r.score_porcentaje||0), 0) / arr.length : null

    setComp(c => ({ ...c, validadasEsteMes: validadasEsteMes||0, validadasMesPasado: validadasMesPasado||0, scoreActual: avg(scoreEsteMesData), scoreMesPasado: avg(scoreMesPasadoData) }))
  }

  async function fetchActividad() {
    const { data: hist } = await supabase.from('historial_estados').select('id, uo_id, usuario_id, estado_anterior, estado_nuevo, created_at, motivo_texto').order('created_at', { ascending:false }).limit(8)
    if (!hist || !hist.length) { setActividad([]); return }

    const uoIds = [...new Set(hist.map(h => h.uo_id))]
    const userIds = [...new Set(hist.map(h => h.usuario_id))]

    const { data: uosData } = await supabase.from('unidades_operativas').select('id, referencia_operativa, nombre, prioridad').in('id', uoIds)
    const { data: usersData } = await supabase.from('profiles').select('id, nombre, iniciales, rol').in('id', userIds)

    const uoMap = Object.fromEntries((uosData||[]).map(u => [u.id, u]))
    const userMap = Object.fromEntries((usersData||[]).map(u => [u.id, u]))

    setActividad(hist.map(h => ({ ...h, uo: uoMap[h.uo_id], user: userMap[h.usuario_id] })))
  }

  const avance = stats.total > 0 ? ((stats.validadas/stats.total)*100) : 0
  const avanceMesPasadoCalc = (stats.total - (comp.nuevasEsteMes||0)) > 0
    ? ((stats.validadas - (comp.validadasEsteMes||0)) / (stats.total - (comp.nuevasEsteMes||0))) * 100
    : null

  if (loading) return <div style={{ padding:'40px', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--muted2)' }}>Cargando datos...</div>

  const KPIS = [
    { label:'INVENTARIO TOTAL', val: stats.total.toLocaleString(), icon:'inventario', delta:null, spark: sparkInventario, sparkColor:'var(--accent-b)' },
    { label:'UOs VALIDADAS', val: stats.validadas.toLocaleString(), icon:'check',
      delta: comp.validadasMesPasado!==null ? <Delta actual={comp.validadasEsteMes} anterior={comp.validadasMesPasado} sufijo=' UOs' /> : null,
      spark: sparkValidadas, sparkColor:'var(--green)' },
    { label:'AVANCE GLOBAL', val: avance.toFixed(1)+'%', icon:'avance',
      delta: avanceMesPasadoCalc!==null ? <Delta actual={avance} anterior={avanceMesPasadoCalc} sufijo=' pts' /> : null,
      spark: null },
    { label:'PENDIENTES', val: stats.pendientes.toLocaleString(), icon:'clock', delta:null, spark:null },
    { label:'SCORE QA PROMEDIO', val: comp.scoreActual!==null ? comp.scoreActual.toFixed(1)+'%' : '—', icon:'star',
      delta: (comp.scoreActual!==null && comp.scoreMesPasado!==null) ? <Delta actual={comp.scoreActual} anterior={comp.scoreMesPasado} sufijo=' pts' /> : null,
      spark: sparkScore, sparkColor:'var(--accent-a)' },
    { label:'ALERTAS ACTIVAS', val: stats.sla_alto.toLocaleString(), icon:'alerta', delta:null, spark:null },
  ]

  return (
    <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>
      {uosConCoords.length > 0 && (
        <div className="glass" style={{ borderRadius:'10px', padding:'14px 16px' }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.14em', marginBottom:'10px', display:'flex', justifyContent:'space-between' }}>
            <span>MAPA DE AVANCE GEOGRAFICO</span>
            <span style={{ color:'var(--muted2)' }}>{uosConCoords.length} UOs con coordenadas</span>
          </div>
          <MapaAvance uos={uosConCoords} />
        </div>
      )}

      {(paraCargar.length > 0 || paraValidar.length > 0) && profile?.rol !== 'coordinador' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {paraCargar.length > 0 && (
            <div style={{ background:'rgba(34,197,94,0.08)', border:'0.5px solid rgba(34,197,94,0.3)', borderRadius:'8px', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'10px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'var(--green)', flexShrink:0 }} />
                <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--green)', letterSpacing:'0.08em' }}>PARA CARGAR · {paraCargar.length} UO{paraCargar.length > 1 ? 's' : ''}</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {paraCargar.map(u => (
                  <div key={u.id} onClick={() => navigate('/backlog/'+u.id)}
                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--surface2)', border:'0.5px solid var(--border2)', borderLeft:'2px solid var(--green)', borderRadius:'6px', padding:'8px 12px', cursor:'pointer' }}>
                    <div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--green)', marginBottom:'2px' }}>{u.referencia_operativa}</div>
                      <div style={{ fontSize:'10px', color:'var(--text)' }}>{u.nombre}</div>
                      {u.observaciones && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'3px' }}>{u.observaciones}</div>}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'4px' }}>
                      <span style={{ fontFamily:'var(--mono)', fontSize:'8px', padding:'2px 6px', borderRadius:'3px', background: u.prioridad==='P1' ? 'rgba(249,115,22,0.2)' : 'rgba(120,120,120,0.1)', color: u.prioridad==='P1' ? 'var(--orange)' : 'var(--muted2)' }}>{u.prioridad}</span>
                      {u.estado === 'En Correccion' && <span style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'2px 6px', borderRadius:'3px', background:'rgba(239,68,68,0.12)', color:'var(--red)' }}>CORRECCION</span>}
                      {u.link_archivos && <a href={u.link_archivos} target="_blank" rel="noreferrer" style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--blue)', textDecoration:'underline', fontWeight:'500' }} onClick={e => e.stopPropagation()}>VER ARCHIVOS</a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {paraValidar.length > 0 && (
            <div style={{ background:'rgba(250,204,21,0.08)', border:'0.5px solid rgba(250,204,21,0.3)', borderRadius:'8px', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'10px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'var(--yellow)', flexShrink:0 }} />
                <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--yellow)', letterSpacing:'0.08em' }}>PARA VALIDAR · {paraValidar.length} UO{paraValidar.length > 1 ? 's' : ''}</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {paraValidar.map(u => (
                  <div key={u.id} onClick={() => navigate('/backlog/'+u.id)}
                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--surface2)', border:'0.5px solid var(--border2)', borderLeft:'2px solid var(--yellow)', borderRadius:'6px', padding:'8px 12px', cursor:'pointer' }}>
                    <div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--yellow)', marginBottom:'2px' }}>{u.referencia_operativa}</div>
                      <div style={{ fontSize:'10px', color:'var(--text)' }}>{u.nombre}</div>
                      {u.observaciones && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'3px' }}>{u.observaciones}</div>}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'4px' }}>
                      <span style={{ fontFamily:'var(--mono)', fontSize:'8px', padding:'2px 6px', borderRadius:'3px', background: u.prioridad==='P1' ? 'rgba(249,115,22,0.2)' : 'rgba(120,120,120,0.1)', color: u.prioridad==='P1' ? 'var(--orange)' : 'var(--muted2)' }}>{u.prioridad}</span>
                      {u.link_archivos && <a href={u.link_archivos} target="_blank" rel="noreferrer" style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--blue)', textDecoration:'underline', fontWeight:'500' }} onClick={e => e.stopPropagation()}>VER ARCHIVOS</a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)', letterSpacing:'0.14em' }}>RESUMEN OPERATIVO</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px' }}>
        {KPIS.map(k => (
          <div key={k.label} className="glass" style={{ borderRadius:'var(--radius-lg)', padding:'16px 17px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)', letterSpacing:'0.08em', fontWeight:600 }}>{k.label}</div>
              <div style={{ width:32, height:32, borderRadius:9, background:'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(56,189,248,0.16))', border:'1px solid rgba(139,92,246,0.25)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--accent-b)', flexShrink:0 }}>
                <span style={{ width:16, height:16, display:'block' }}>{ICONS[k.icon]}</span>
              </div>
            </div>
            <div style={{ fontFamily:'var(--disp)', fontSize:'26px', fontWeight:'800', color:'var(--text)', margin:'10px 0 6px 0' }}>{k.val}</div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', minHeight:22 }}>
              <div>{k.delta}</div>
              {k.spark && k.spark.length > 1 && <Sparkline data={k.spark} color={k.sparkColor} />}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em' }}>FLUJO DE ESTADOS</div>
      <div className="glass" style={{ borderRadius:'8px', padding:'10px 12px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:'6px' }}>
          {ESTADOS.map(e => (
            <div key={e} onClick={() => navigate('/backlog')}
              style={{ background:'rgba(24,33,46,0.4)', borderRadius:'6px', padding:'8px 6px', textAlign:'center', cursor:'pointer' }}>
              <div style={{ fontFamily:'var(--disp)', fontSize:'16px', fontWeight:'700', color:ESTADO_COLOR[e]||'var(--muted2)' }}>{stats.por_estado[e]||0}</div>
              <div style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)', marginTop:'3px', letterSpacing:'0.05em' }}>{e.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)', letterSpacing:'0.14em' }}>ACTIVIDAD RECIENTE</div>
      <div className="glass" style={{ borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              {['UO','RESPONSABLE','ESTADO','PRIORIDAD','ACTUALIZADO'].map(h => (
                <th key={h} style={{ textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--muted)', fontWeight:600, padding:'10px 16px', borderBottom:'0.5px solid var(--border2)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {actividad.length === 0 && (
              <tr><td colSpan={5} style={{ padding:'16px', fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)' }}>Sin actividad reciente</td></tr>
            )}
            {actividad.map(a => (
              <tr key={a.id} onClick={() => navigate('/backlog/'+a.uo_id)} style={{ cursor:'pointer' }}>
                <td style={{ padding:'12px 16px', fontFamily:'var(--mono)', fontWeight:600, fontSize:12.5, borderBottom:'0.5px solid var(--border2)' }}>{a.uo?.referencia_operativa || a.uo_id}</td>
                <td style={{ padding:'12px 16px', borderBottom:'0.5px solid var(--border2)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                    <div style={{ width:24, height:24, borderRadius:'50%', background:colorAvatar(a.usuario_id)+'2A', color:colorAvatar(a.usuario_id), display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:10, fontWeight:600, flexShrink:0 }}>
                      {a.user?.iniciales || '??'}
                    </div>
                    <span style={{ fontSize:12.5, color:'var(--muted2)' }}>{a.user?.nombre || 'Usuario'} · {a.user?.rol ? a.user.rol.charAt(0).toUpperCase()+a.user.rol.slice(1) : ''}</span>
                  </div>
                </td>
                <td style={{ padding:'12px 16px', borderBottom:'0.5px solid var(--border2)' }}><Badge estado={a.estado_nuevo} /></td>
                <td style={{ padding:'12px 16px', borderBottom:'0.5px solid var(--border2)' }}><Prioridad p={a.uo?.prioridad} /></td>
                <td style={{ padding:'12px 16px', fontFamily:'var(--mono)', fontSize:11.5, color:'var(--muted)', borderBottom:'0.5px solid var(--border2)' }}>
                  {new Date(a.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short' })} · {new Date(a.created_at).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}