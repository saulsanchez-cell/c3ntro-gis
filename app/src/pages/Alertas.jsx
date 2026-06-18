import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const UMBRAL_SIN_AVANCE_DIAS = 2
const UMBRAL_SLA_DIAS = 5
const UMBRAL_TASA_ERROR = 0.30

export default function Alertas() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [sinAvance, setSinAvance] = useState([])
  const [slaVencido, setSlaVencido] = useState([])
  const [cargaAlta, setCargaAlta] = useState([])
  const [itemsConError, setItemsConError] = useState([])

  useEffect(() => { fetchAlertas() }, [])

  async function fetchAlertas() {
    const hoy = new Date()
    const hoyStr = hoy.toISOString().split('T')[0]

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

    // 1. UOs sin avance en X dias
    const ultimoLogPorUO = {}
    ;(logs || []).forEach(l => {
      if (!ultimoLogPorUO[l.uo_id]) ultimoLogPorUO[l.uo_id] = l.fecha
    })
    const sinAvanceList = (uos || []).filter(u => {
      const ultimaFecha = ultimoLogPorUO[u.id]
      if (!ultimaFecha) {
        if (!u.fecha_asignacion) return false
        const diasDesdeAsignacion = Math.floor((hoy - new Date(u.fecha_asignacion)) / (1000*60*60*24))
        return diasDesdeAsignacion >= UMBRAL_SIN_AVANCE_DIAS
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

    // 2. SLA vencido
    const slaList = (uos || []).filter(u => u.sla_validacion > UMBRAL_SLA_DIAS)
      .sort((a,b) => (b.sla_validacion||0) - (a.sla_validacion||0))
    setSlaVencido(slaList)

    // 3. Carga alta por analista
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

    // 4. Items con tasa de error alta
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

  return (
    <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:'16px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)', letterSpacing:'0.14em' }}>CENTRO DE ALERTAS</div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          {totalAlertas > 0 && <span style={{ fontFamily:'var(--mono)', fontSize:'9px', padding:'3px 10px', borderRadius:'4px', background:'rgba(239,68,68,0.12)', color:'var(--red)' }}>{totalAlertas} alertas activas</span>}
          <button onClick={fetchAlertas} style={{ fontFamily:'var(--mono)', fontSize:'9px', padding:'4px 10px', borderRadius:'4px', border:'0.5px solid var(--border2)', background:'none', color:'var(--muted2)', cursor:'pointer' }}>ACTUALIZAR</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
        {[
          { label:'SIN AVANCE', count: sinAvance.length, color:'var(--yellow)', desc:`+${UMBRAL_SIN_AVANCE_DIAS} dias sin log` },
          { label:'SLA VENCIDO', count: slaVencido.length, color:'var(--red)', desc:`+${UMBRAL_SLA_DIAS} dias habiles` },
          { label:'CARGA ALTA', count: cargaAlta.length, color:'var(--orange)', desc:'1.5x promedio del equipo' },
          { label:'ERRORES RECURRENTES', count: itemsConError.length, color:'var(--blue)', desc:`+${UMBRAL_TASA_ERROR*100}% tasa de error` },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'14px 16px' }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'8px' }}>{k.label}</div>
            <div style={{ fontSize:'28px', fontWeight:'700', color: k.count > 0 ? k.color : 'var(--muted)', lineHeight:'1' }}>{k.count}</div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'6px' }}>{k.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>

        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'0.5px solid var(--border2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--yellow)', letterSpacing:'0.12em' }}>SIN AVANCE · {sinAvance.length}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)' }}>Umbral: {UMBRAL_SIN_AVANCE_DIAS} dias</span>
          </div>
          <div style={{ maxHeight:'280px', overflowY:'auto' }}>
            {sinAvance.length === 0 && <div style={{ padding:'20px 16px', fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin alertas</div>}
            {sinAvance.map(u => (
              <div key={u.id} onClick={() => navigate('/backlog/'+u.id)}
                style={{ padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--orange)', marginBottom:'2px' }}>{u.referencia_operativa}</div>
                  <div style={{ fontSize:'10px', color:'var(--text)' }}>{u.nombre}</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'2px' }}>{u.digitalizador?.nombre || 'Sin asignar'}</div>
                </div>
                <span style={{ fontFamily:'var(--mono)', fontSize:'11px', fontWeight:'700', color:'var(--yellow)', flexShrink:0 }}>{u.diasSinAvance}d</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'0.5px solid var(--border2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--red)', letterSpacing:'0.12em' }}>SLA VENCIDO · {slaVencido.length}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)' }}>Umbral: {UMBRAL_SLA_DIAS} dias</span>
          </div>
          <div style={{ maxHeight:'280px', overflowY:'auto' }}>
            {slaVencido.length === 0 && <div style={{ padding:'20px 16px', fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin alertas</div>}
            {slaVencido.map(u => (
              <div key={u.id} onClick={() => navigate('/backlog/'+u.id)}
                style={{ padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--orange)', marginBottom:'2px' }}>{u.referencia_operativa}</div>
                  <div style={{ fontSize:'10px', color:'var(--text)' }}>{u.nombre}</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'2px' }}>{u.digitalizador?.nombre || 'Sin asignar'}</div>
                </div>
                <span style={{ fontFamily:'var(--mono)', fontSize:'11px', fontWeight:'700', color:'var(--red)', flexShrink:0 }}>{u.sla_validacion}d</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'0.5px solid var(--border2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--orange)', letterSpacing:'0.12em' }}>CARGA ALTA · {cargaAlta.length}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)' }}>1.5x promedio del equipo</span>
          </div>
          <div style={{ maxHeight:'280px', overflowY:'auto' }}>
            {cargaAlta.length === 0 && <div style={{ padding:'20px 16px', fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin alertas</div>}
            {cargaAlta.map(a => (
              <div key={a.perfil.id} style={{ padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:'rgba(249,115,22,0.12)', color:'var(--orange)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:'9px' }}>{a.perfil.iniciales}</div>
                  <div>
                    <div style={{ fontSize:'10px', color:'var(--text)' }}>{a.perfil.nombre}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'2px' }}>{a.uos.length} UOs activas</div>
                  </div>
                </div>
                <span style={{ fontFamily:'var(--mono)', fontSize:'11px', fontWeight:'700', color:'var(--orange)', flexShrink:0 }}>{a.uos.length}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'0.5px solid var(--border2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--blue)', letterSpacing:'0.12em' }}>ERRORES RECURRENTES · {itemsConError.length}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)' }}>+{UMBRAL_TASA_ERROR*100}% tasa de error</span>
          </div>
          <div style={{ maxHeight:'280px', overflowY:'auto' }}>
            {itemsConError.length === 0 && <div style={{ padding:'20px 16px', fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin alertas</div>}
            {itemsConError.map(item => (
              <div key={item.itemId} style={{ padding:'10px 16px', borderBottom:'0.5px solid var(--border2)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'8px' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'10px', color:'var(--text)', marginBottom:'3px', lineHeight:'1.3' }}>{item.nombre}</div>
                    <div style={{ display:'flex', gap:'4px' }}>
                      <span style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'1px 5px', borderRadius:'3px', background:'rgba(59,130,246,0.1)', color:'var(--blue)' }}>{item.seccion}</span>
                      <span style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)' }}>{item.errores}/{item.total} revisiones</span>
                    </div>
                  </div>
                  <span style={{ fontFamily:'var(--mono)', fontSize:'11px', fontWeight:'700', color:'var(--blue)', flexShrink:0 }}>{(item.tasa*100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}