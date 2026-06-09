import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ESTADOS = ['Pendiente','Asignada','En Proceso','En Validacion','Validada','Rechazada']
const ESTADO_COLOR = { Pendiente:'var(--muted2)', Asignada:'var(--orange)', 'En Proceso':'var(--yellow)', 'En Validacion':'var(--yellow)', Validada:'var(--green)', Rechazada:'var(--red)' }

export default function Overview() {
 const navigate = useNavigate()
 const { profile } = useAuth()
  const [stats, setStats] = useState({ total:0, validadas:0, sla_alto:0, por_estado:{}, por_tipo:{} })
  const [alertas, setAlertas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [])
  const [misUOs, setMisUOs] = useState([])

useEffect(() => {
  if (profile?.id) fetchMisUOs()
}, [profile])

async function fetchMisUOs() {
  const { data } = await supabase
    .from('unidades_operativas')
    .select('id, referencia_operativa, nombre, tipo_proyecto, prioridad, link_archivos, observaciones')
    .or(`digitalizador_id.eq.${profile.id},analista_qa_id.eq.${profile.id}`)
    .in('estado', ['Asignada', 'En Proceso', 'En Validacion'])
    .eq('es_historico', false)
  setMisUOs(data || [])
}

useEffect(() => {
  if (profile?.id) fetchMisUOs()
}, [profile])

async function fetchMisUOs() {
  const { data } = await supabase
    .from('unidades_operativas')
    .select('id, referencia_operativa, nombre, tipo_proyecto, prioridad, link_archivos, observaciones')
    .or(`digitalizador_id.eq.${profile.id},analista_qa_id.eq.${profile.id}`)
    .in('estado', ['Asignada', 'En Proceso', 'En Validacion'])
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
      .select('estado, tipo_proyecto, sla_validacion, referencia_operativa, nombre, prioridad')
      .eq('es_historico', false)
      .range(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    allUos = [...allUos, ...data]
    if (data.length < pageSize) break
    from += pageSize
  }
  const uo = allUos
  if (!uo.length) return
  const por_estado = {}
  const por_tipo = {}
  ESTADOS.forEach(e => por_estado[e] = 0)
  uo.forEach(u => {
    por_estado[u.estado] = (por_estado[u.estado] || 0) + 1
    por_tipo[u.tipo_proyecto] = (por_tipo[u.tipo_proyecto] || 0) + 1
  })
  const sla_alto = uo.filter(u => u.sla_validacion > 3).length
  const alertas_list = uo.filter(u => u.sla_validacion > 3).sort((a,b) => (b.sla_validacion||0)-(a.sla_validacion||0)).slice(0,5)
  setStats({ total:uo.length, validadas:por_estado['Validada']||0, sla_alto, por_estado, por_tipo })
  setAlertas(alertas_list)
  setLoading(false)
}

  const avance = stats.total > 0 ? ((stats.validadas/stats.total)*100).toFixed(1) : 0

  if (loading) return <div style={{ padding:'40px', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--muted2)' }}>Cargando datos...</div>

  return (
    <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>
     {misUOs.length > 0 && profile?.rol !== 'coordinador' && (
  <div style={{ background:'rgba(249,115,22,0.08)', border:'0.5px solid rgba(249,115,22,0.3)', borderRadius:'8px', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'10px' }}>
    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
      <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'var(--orange)', flexShrink:0 }} />
      <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--orange)', letterSpacing:'0.08em' }}>TIENES {misUOs.length} UO{misUOs.length > 1 ? 's' : ''} ACTIVA{misUOs.length > 1 ? 'S' : ''}</span>
    </div>
    <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
      {misUOs.map(u => (
        <div key={u.id} onClick={() => navigate('/backlog/'+u.id)}
          style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--surface2)', border:'0.5px solid var(--border2)', borderLeft:'2px solid var(--orange)', borderRadius:'6px', padding:'8px 12px', cursor:'pointer' }}>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--orange)', marginBottom:'2px' }}>{u.referencia_operativa}</div>
            <div style={{ fontSize:'10px', color:'var(--text)' }}>{u.nombre}</div>
            {u.observaciones && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'3px' }}>{u.observaciones}</div>}
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'4px' }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:'8px', padding:'2px 6px', borderRadius:'3px', background: u.prioridad==='P1' ? 'rgba(249,115,22,0.2)' : 'rgba(120,120,120,0.1)', color: u.prioridad==='P1' ? 'var(--orange)' : 'var(--muted2)' }}>{u.prioridad}</span>
            {u.link_archivos && <a href={u.link_archivos} target="_blank" rel="noreferrer" style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--blue)' }} onClick={e => e.stopPropagation()}>VER ARCHIVOS</a>}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
      <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)', letterSpacing:'0.14em' }}>RESUMEN OPERATIVO</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
        {[
          { label:'INVENTARIO TOTAL', val:stats.total.toLocaleString(), color:'var(--orange)', accent:'linear-gradient(90deg,var(--orange),var(--yellow))' },
          { label:'AVANCE GLOBAL', val:avance+'%', color:'var(--yellow)', accent:'var(--yellow)' },
          { label:'VALIDADAS', val:stats.validadas, color:'var(--green)', accent:'var(--green)' },
          { label:'ALERTAS SLA', val:stats.sla_alto, color:'var(--red)', accent:'var(--red)' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'14px 15px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:'2px', background:k.accent }} />
            <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', letterSpacing:'0.09em', marginBottom:'7px' }}>{k.label}</div>
            <div style={{ fontFamily:'var(--disp)', fontSize:'28px', fontWeight:'800', color:k.color, lineHeight:'1' }}>{k.val}</div>
          </div>
        ))}
      </div>
      <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)', letterSpacing:'0.14em' }}>FLUJO DE ESTADOS</div>
      <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'13px 15px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:'6px' }}>
          {ESTADOS.map(e => (
            <div key={e} style={{ background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:'7px', padding:'11px 6px', textAlign:'center', cursor:'pointer' }}
              onClick={() => navigate('/backlog')}>
              <div style={{ fontFamily:'var(--disp)', fontSize:'22px', fontWeight:'800', color:ESTADO_COLOR[e]||'var(--muted2)' }}>
                {stats.por_estado[e]||0}
              </div>
              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'5px', letterSpacing:'0.07em' }}>
                {e.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:'8px' }}>
        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'13px 15px' }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'10px' }}>POR TIPO DE PROYECTO</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            {Object.entries(stats.por_tipo).map(([tipo, total]) => (
              <div key={tipo}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span style={{ fontSize:'12px' }}>{tipo}</span>
                  <span style={{ fontFamily:'var(--mono)', fontSize:'11px', color:'var(--muted2)' }}>{total} UOs</span>
                </div>
                <div style={{ height:'4px', background:'var(--border2)', borderRadius:'2px', overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:'2px', width:Math.round((total/stats.total)*100)+'%', background:'linear-gradient(90deg,var(--orange),var(--yellow))' }} />
                </div>
              </div>
            ))}
            {Object.keys(stats.por_tipo).length === 0 && <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin datos aun</div>}
          </div>
        </div>
        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'13px 15px' }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'10px' }}>ALERTAS SLA ACTIVAS</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
            {alertas.length === 0 && <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin alertas activas</div>}
            {alertas.map(u => (
              <div key={u.referencia_operativa} onClick={() => navigate('/backlog')}
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--surface2)', border:'0.5px solid var(--border2)', borderLeft:u.sla_validacion>=8?'2px solid var(--red)':'2px solid var(--yellow)', borderRadius:'6px', padding:'7px 10px', cursor:'pointer' }}>
                <span style={{ fontFamily:'var(--mono)', fontSize:'10px' }}>{u.referencia_operativa}</span>
                <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                  <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{u.sla_validacion}d</span>
                  <span style={{ fontFamily:'var(--mono)', fontSize:'8px', padding:'2px 7px', borderRadius:'3px', background:u.sla_validacion>=8?'rgba(239,68,68,0.13)':'rgba(250,204,21,0.1)', color:u.sla_validacion>=8?'var(--red)':'var(--yellow)' }}>SLA ALTO</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
