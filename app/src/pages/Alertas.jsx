import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const UMBRAL_SIN_AVANCE_DIAS = 2
const UMBRAL_SLA_DIAS = 5
const UMBRAL_TASA_ERROR = 0.30

const AVATAR_COLORS = ['#8B5CF6', '#38BDF8', '#F5A623', '#34D399', '#F2545B', '#EC4899', '#22D3EE', '#A78BFA']
function colorAvatar(seed) {
  if (!seed) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[Math.abs(hash)]
}

const ICONS = {
  sinAvance: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>,
  sla: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>,
  carga: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="8.5" r="2.6"/><path d="M15 14.5c2.6.4 4.5 2.3 4.5 5.5"/></svg>,
  errores: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
}

function Pill({ color, children }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:999, fontSize:7.5, fontFamily:'var(--mono)', fontWeight:600, background:color+'22', color, border:'1px solid '+color+'40' }}>
      {children}
    </span>
  )
}

export default function Alertas() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [sinAvance, setSinAvance] = useState([])
  const [slaVencido, setSlaVencido] = useState([])
  const [cargaAlta, setCargaAlta] = useState([])
  const [itemsConError, setItemsConError] = useState([])

  useEffect(() => { fetchAlertas() }, [])

  async function fetchAlertas() {
    setLoading(true)
    const hoy = new Date()
    const [{ data: uos }, { data: logs }, { data: perfiles }, { data: respuestas }] = await Promise.all([
      supabase.from('unidades_operativas')
        .select('*, digitalizador:profiles!digitalizador_id(id,nombre,iniciales), analista_qa:profiles!analista_qa_id(id,nombre,iniciales)')
        .eq('es_historico', false)
        .in('estado', ['Asignada','En Proceso','En Validacion','Bloqueada']),
      supabase.from('logs_actividad')
        .select('uo_id, fecha, porcentaje_avance, usuario_id')
        .order('fecha', { ascending: false }),
      supabase.from('profiles').select('*').eq('activo', true).neq('rol', 'coordinador'),
      supabase.from('checklist_respuestas')
        .select('*, item:checklist_items(nombre, seccion, familia)')
        .not('observacion_descripcion', 'is', null),
    ])
    const ultimoLogPorUO = {}
    ;(logs || []).forEach(l => { if (!ultimoLogPorUO[l.uo_id]) ultimoLogPorUO[l.uo_id] = l.fecha })
    const sinAvanceList = (uos || []).filter(u => {
      const ultimaFecha = ultimoLogPorUO[u.id]
      if (!ultimaFecha) {
        if (!u.fecha_asignacion) return false
        const dias = Math.floor((hoy - new Date(u.fecha_asignacion)) / (1000*60*60*24))
        return dias >= UMBRAL_SIN_AVANCE_DIAS
      }
      const dias = Math.floor((hoy - new Date(ultimaFecha)) / (1000*60*60*24))
      return dias >= UMBRAL_SIN_AVANCE_DIAS
    }).map(u => ({
      ...u,
      diasSinAvance: (() => {
        const ultimaFecha = ultimoLogPorUO[u.id] || u.fecha_asignacion
        return Math.floor((hoy - new Date(ultimaFecha)) / (1000*60*60*24))
      })()
    })).sort((a,b) => b.diasSinAvance - a.diasSinAvance)
    setSinAvance(sinAvanceList)

    const slaList = (uos || []).filter(u => u.sla_validacion > UMBRAL_SLA_DIAS)
      .sort((a,b) => (b.sla_validacion||0) - (a.sla_validacion||0))
    setSlaVencido(slaList)

    const cargaPorAnalista = {}
    ;(perfiles || []).forEach(p => { cargaPorAnalista[p.id] = { perfil: p, uos: [] } })
    ;(uos || []).forEach(u => {
      if (u.digitalizador_id && cargaPorAnalista[u.digitalizador_id]) {
        cargaPorAnalista[u.digitalizador_id].uos.push(u)
      }
    })
    const promedioGlobal = (uos || []).length / Math.max(Object.keys(cargaPorAnalista).length, 1)
    const cargaAltaList = Object.values(cargaPorAnalista)
      .filter(a => a.uos.length > promedioGlobal * 1.5)
      .sort((a,b) => b.uos.length - a.uos.length)
    setCargaAlta(cargaAltaList)

    const totalPorItem = {}
    const errorPorItem = {}
    ;(respuestas || []).forEach(r => {
      if (!r.item_id) return
      totalPorItem[r.item_id] = (totalPorItem[r.item_id] || 0) + 1
      if (r.cumplimiento_porcentaje < 100) {
        errorPorItem[r.item_id] = { count: (errorPorItem[r.item_id]?.count || 0) + 1, item: r.item }
      }
    })
    const itemsErrorList = Object.entries(errorPorItem)
      .map(([itemId, data]) => ({
        itemId, nombre: data.item?.nombre, seccion: data.item?.seccion, familia: data.item?.familia,
        errores: data.count, total: totalPorItem[itemId] || data.count,
        tasa: data.count / (totalPorItem[itemId] || data.count)
      }))
      .filter(i => i.tasa >= UMBRAL_TASA_ERROR && i.total >= 3)
      .sort((a,b) => b.tasa - a.tasa)
      .slice(0, 10)
    setItemsConError(itemsErrorList)
    setLoading(false)
  }

  const totalAlertas = sinAvance.length + slaVencido.length + cargaAlta.length + itemsConError.length

  if (loading) return <div style={{ padding:'40px', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--muted2)' }}>Cargando alertas...</div>

  const KPIS = [
    { label:'SIN AVANCE', count: sinAvance.length, color:'var(--yellow)', desc:`+${UMBRAL_SIN_AVANCE_DIAS} dias sin log`, icon:'sinAvance' },
    { label:'SLA VENCIDO', count: slaVencido.length, color:'var(--red)', desc:`+${UMBRAL_SLA_DIAS} dias habiles`, icon:'sla' },
    { label:'CARGA ALTA', count: cargaAlta.length, color:'var(--orange)', desc:'1.5x promedio del equipo', icon:'carga' },
    { label:'ERRORES RECURRENTES', count: itemsConError.length, color:'var(--accent-a)', desc:`+${UMBRAL_TASA_ERROR*100}% tasa de error`, icon:'errores' },
  ]

  return (
    <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:'16px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)', letterSpacing:'0.14em' }}>CENTRO DE ALERTAS</div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          {totalAlertas > 0 && <Pill color="var(--red)">{totalAlertas} alertas activas</Pill>}
          <button onClick={fetchAlertas} style={{ fontFamily:'var(--mono)', fontSize:'9px', padding:'4px 10px', borderRadius:'4px', border:'0.5px solid var(--border2)', background:'none', color:'var(--muted2)', cursor:'pointer' }}>ACTUALIZAR</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px' }}>
        {KPIS.map(k => (
          <div key={k.label} className="glass" style={{ borderRadius:'var(--radius-lg)', padding:'16px 17px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:'9.5px', color:'var(--muted2)', letterSpacing:'0.08em', fontWeight:600 }}>{k.label}</div>
              <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(56,189,248,0.16))', border:'1px solid rgba(139,92,246,0.25)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--accent-b)', flexShrink:0 }}>
                <span style={{ width:15, height:15, display:'block' }}>{ICONS[k.icon]}</span>
              </div>
            </div>
            <div style={{ fontFamily:'var(--disp)', fontSize:'26px', fontWeight:'800', color: k.count > 0 ? k.color : 'var(--text)', margin:'10px 0 4px 0' }}>{k.count}</div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>{k.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>

        <div className="glass" style={{ borderRadius:'8px', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'0.5px solid var(--border2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--yellow)', letterSpacing:'0.12em' }}>SIN AVANCE · {sinAvance.length}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)' }}>Umbral: {UMBRAL_SIN_AVANCE_DIAS} dias</span>
          </div>
          <div style={{ maxHeight:'280px', overflowY:'auto' }}>
            {sinAvance.length === 0 && <div style={{ padding:'20px 16px', fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin alertas</div>}
            {sinAvance.map(u => (
              <div key={u.id} onClick={() => navigate('/backlog/'+u.id)}
                style={{ padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                  {u.digitalizador && (
                    <div style={{ width:22, height:22, borderRadius:'50%', background:colorAvatar(u.digitalizador_id)+'2A', color:colorAvatar(u.digitalizador_id), display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:8, fontWeight:600, flexShrink:0 }}>
                      {u.digitalizador.iniciales}
                    </div>
                  )}
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--orange)', marginBottom:'2px' }}>{u.referencia_operativa}</div>
                    <div style={{ fontSize:'10px', color:'var(--text)' }}>{u.nombre}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'2px' }}>{u.digitalizador?.nombre || 'Sin asignar'}</div>
                  </div>
                </div>
                <Pill color="var(--yellow)">{u.diasSinAvance}d</Pill>
              </div>
            ))}
          </div>
        </div>

        <div className="glass" style={{ borderRadius:'8px', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'0.5px solid var(--border2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--red)', letterSpacing:'0.12em' }}>SLA VENCIDO · {slaVencido.length}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)' }}>Umbral: {UMBRAL_SLA_DIAS} dias</span>
          </div>
          <div style={{ maxHeight:'280px', overflowY:'auto' }}>
            {slaVencido.length === 0 && <div style={{ padding:'20px 16px', fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin alertas</div>}
            {slaVencido.map(u => (
              <div key={u.id} onClick={() => navigate('/backlog/'+u.id)}
                style={{ padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                  {u.digitalizador && (
                    <div style={{ width:22, height:22, borderRadius:'50%', background:colorAvatar(u.digitalizador_id)+'2A', color:colorAvatar(u.digitalizador_id), display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:8, fontWeight:600, flexShrink:0 }}>
                      {u.digitalizador.iniciales}
                    </div>
                  )}
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--orange)', marginBottom:'2px' }}>{u.referencia_operativa}</div>
                    <div style={{ fontSize:'10px', color:'var(--text)' }}>{u.nombre}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'2px' }}>{u.digitalizador?.nombre || 'Sin asignar'}</div>
                  </div>
                </div>
                <Pill color="var(--red)">{u.sla_validacion}d</Pill>
              </div>
            ))}
          </div>
        </div>

        <div className="glass" style={{ borderRadius:'8px', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'0.5px solid var(--border2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--orange)', letterSpacing:'0.12em' }}>CARGA ALTA · {cargaAlta.length}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)' }}>1.5x promedio del equipo</span>
          </div>
          <div style={{ maxHeight:'280px', overflowY:'auto' }}>
            {cargaAlta.length === 0 && <div style={{ padding:'20px 16px', fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin alertas</div>}
            {cargaAlta.map(a => (
              <div key={a.perfil.id} style={{ padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:colorAvatar(a.perfil.id)+'2A', color:colorAvatar(a.perfil.id), display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:'9px', fontWeight:600 }}>{a.perfil.iniciales}</div>
                  <div>
                    <div style={{ fontSize:'10px', color:'var(--text)' }}>{a.perfil.nombre}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'2px' }}>{a.uos.length} UOs activas</div>
                  </div>
                </div>
                <Pill color="var(--orange)">{a.uos.length}</Pill>
              </div>
            ))}
          </div>
        </div>

        <div className="glass" style={{ borderRadius:'8px', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'0.5px solid var(--border2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--accent-a)', letterSpacing:'0.12em' }}>ERRORES RECURRENTES · {itemsConError.length}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)' }}>+{UMBRAL_TASA_ERROR*100}% tasa de error</span>
          </div>
          <div style={{ maxHeight:'280px', overflowY:'auto' }}>
            {itemsConError.length === 0 && <div style={{ padding:'20px 16px', fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin alertas</div>}
            {itemsConError.map(item => (
              <div key={item.itemId} style={{ padding:'10px 16px', borderBottom:'0.5px solid var(--border2)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'8px' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'10px', color:'var(--text)', marginBottom:'4px', lineHeight:'1.3' }}>{item.nombre}</div>
                    <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
                      <Pill color="var(--accent-b)">{item.seccion}</Pill>
                      <span style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)' }}>{item.errores}/{item.total} revisiones</span>
                    </div>
                  </div>
                  <span style={{ fontFamily:'var(--mono)', fontSize:'11px', fontWeight:'700', color:'var(--accent-a)', flexShrink:0 }}>{(item.tasa*100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}