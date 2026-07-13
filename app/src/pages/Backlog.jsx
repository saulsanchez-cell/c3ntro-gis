import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const ESTADOS = ['Pendiente','Asignada','En Proceso','En Validacion','Validada','Rechazada','Bloqueada','En Correccion']
const ESTADO_COLOR = { Pendiente:'var(--muted2)', Asignada:'var(--orange)', 'En Proceso':'var(--blue)', 'En Validacion':'var(--accent-a)', Validada:'var(--green)', Rechazada:'var(--red)', Bloqueada:'var(--red)', 'En Correccion':'var(--yellow)' }
const ESTADO_LABEL = { Pendiente:'Pendiente', Asignada:'Asignada', 'En Proceso':'En proceso', 'En Validacion':'En validación', Validada:'Validada', Rechazada:'Rechazada', Bloqueada:'Bloqueada', 'En Correccion':'En corrección' }

const AVATAR_COLORS = ['#8B5CF6', '#38BDF8', '#F5A623', '#34D399', '#F2545B', '#EC4899', '#22D3EE', '#A78BFA']
function colorAvatar(seed) {
  if (!seed) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[Math.abs(hash)]
}

function Pill({ color, children }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:999, fontSize:7.5, fontFamily:'var(--mono)', fontWeight:600, background:color+'22', color, border:'1px solid '+color+'40' }}>
      {children}
    </span>
  )
}

function EstadoBadge({ estado, size = 'sm' }) {
  const color = ESTADO_COLOR[estado] || 'var(--muted2)'
  const label = ESTADO_LABEL[estado] || estado
  const fs = size === 'sm' ? 10 : 11
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding: size==='sm' ? '2px 8px' : '4px 10px', borderRadius:999, fontSize:fs, fontWeight:600, background:color+'1A', color, border:'1px solid '+color+'40' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:color }} />
      {label}
    </span>
  )
}

export default function Backlog() {
  const navigate = useNavigate()
  const [uos, setUos] = useState([])
  const [filtro, setFiltro] = useState({ tipo:'', prioridad:'', busqueda:'' })
  const [vista, setVista] = useState('kanban')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchUOs() }, [])

  async function fetchUOs() {
    let all = []
    let from = 0
    const size = 1000
    while (true) {
      const { data } = await supabase
        .from('unidades_operativas')
        .select('*, digitalizador:profiles!digitalizador_id(nombre,iniciales), analista_qa:profiles!analista_qa_id(nombre,iniciales)')
        .eq('es_historico', false)
        .order('prioridad', { ascending: true })
        .order('sla_validacion', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
        .range(from, from + size - 1)
      if (!data || data.length === 0) break
      all = [...all, ...data]
      if (data.length < size) break
      from += size
    }
    setUos(all)
    setLoading(false)
  }

  const uosFiltradas = uos.filter(u => {
    if (filtro.tipo && u.tipo_proyecto !== filtro.tipo) return false
    if (filtro.prioridad && u.prioridad !== filtro.prioridad) return false
    if (filtro.busqueda) {
      const q = filtro.busqueda.toLowerCase()
      return u.referencia_operativa?.toLowerCase().includes(q) || u.nombre?.toLowerCase().includes(q)
    }
    return true
  })

  if (loading) return <div style={{ padding:'40px', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--muted2)' }}>Cargando backlog...</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 20px', background:'var(--surface)', borderBottom:'0.5px solid var(--border2)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontWeight:'700', fontSize:'14px' }}>Backlog operativo</span>
          <button onClick={() => navigate('/backlog/nueva')} style={{ padding:'4px 10px', borderRadius:'4px', border:'0.5px solid rgba(249,115,22,0.3)', background:'rgba(249,115,22,0.08)', color:'var(--orange)', fontSize:'9px', fontFamily:'var(--mono)', marginLeft:'8px' }}>+ NUEVA UO</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <input placeholder="Buscar referencia o nombre..." value={filtro.busqueda}
            onChange={e => setFiltro(f => ({ ...f, busqueda: e.target.value }))}
            style={{ width:'220px', padding:'5px 10px', fontSize:'10px' }} />
          <select value={filtro.tipo} onChange={e => setFiltro(f => ({ ...f, tipo: e.target.value }))}
            style={{ width:'130px', padding:'5px 8px', fontSize:'10px' }}>
            <option value="">Todos los tipos</option>
            {['Baseline','Active Line','Tikva','Enterprise','IRU','Backbone','AsBuilt','Reingenieria'].map(t => <option key={t}>{t}</option>)}
          </select>
          <select value={filtro.prioridad} onChange={e => setFiltro(f => ({ ...f, prioridad: e.target.value }))}
            style={{ width:'110px', padding:'5px 8px', fontSize:'10px' }}>
            <option value="">Prioridad</option>
            {['P1','P2','P3'].map(p => <option key={p}>{p}</option>)}
          </select>
          <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'5px', padding:'2px', gap:'1px' }}>
            {['kanban','lista','cerradas'].map(v => (
              <button key={v} onClick={() => setVista(v)}
                style={{ padding:'4px 9px', borderRadius:'3px', fontSize:'9px', border:'none',
                  background: vista===v ? 'var(--surface4)' : 'none',
                  color: vista===v ? 'var(--text)' : 'var(--muted2)', letterSpacing:'0.05em' }}>
                {v === 'cerradas' ? 'CERRADAS' : v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ flex:1, overflow:'auto', padding:'14px 20px' }}>
        {vista === 'kanban' ? <KanbanView uos={uosFiltradas} navigate={navigate} /> :
 vista === 'cerradas' ? <ListView uos={uos.filter(u => u.estado === 'Cerrada' || u.estado === 'En Correccion')} navigate={navigate} /> :
 <ListView uos={uosFiltradas} navigate={navigate} />}
      </div>
    </div>
  )
}

function KanbanView({ uos, navigate }) {
  const columnas = ['Pendiente','Asignada','En Proceso','En Validacion','Validada','Rechazada']
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:'8px', alignItems:'start', minWidth:'900px' }}>
      {columnas.map(estado => {
        const items = uos.filter(u => u.estado === estado)
        const color = ESTADO_COLOR[estado] || 'var(--muted)'
        return (
          <div key={estado} className="glass" style={{ borderRadius:'8px', overflow:'hidden' }}>
            <div style={{ height:'2px', background: color }} />
            <div style={{ padding:'9px 11px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'0.5px solid var(--border2)' }}>
              <span style={{ fontFamily:'var(--mono)', fontSize:'9px', letterSpacing:'0.1em', color:'var(--muted2)' }}>{estado.toUpperCase()}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color, background:color+'1A', borderRadius:999, padding:'1px 7px' }}>{items.length}</span>
            </div>
            <div style={{ padding:'8px', display:'flex', flexDirection:'column', gap:'6px', maxHeight:'500px', overflowY:'auto' }}>
              {items.slice(0,10).map(u => (
                <div key={u.id} onClick={() => navigate('/backlog/'+u.id)} className="glass"
                  style={{ borderLeft:'2px solid '+(u.prioridad==='P1' ? 'var(--orange)' : u.sla_validacion > 3 ? 'var(--red)' : 'var(--border2)'),
                    borderRadius:'6px', padding:'9px 10px', cursor:'pointer' }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--orange)', marginBottom:'3px' }}>{u.referencia_operativa}</div>
                  <div style={{ fontSize:'10px', color:'var(--text)', lineHeight:'1.3', marginBottom:'7px' }}>{u.nombre}</div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                      {u.prioridad==='P1' && <Pill color="var(--orange)">P1</Pill>}
                      {u.sla_validacion > 3 && <Pill color="var(--red)">SLA {u.sla_validacion}d</Pill>}
                      <Pill color="var(--muted2)">{u.tipo_proyecto}</Pill>
                    </div>
                    <div style={{ display:'flex', gap:'3px' }}>
                      {u.digitalizador && (
                        <div title={'Digitalizador: '+u.digitalizador.nombre}
                          style={{ width:'18px', height:'18px', borderRadius:'50%', background:colorAvatar(u.digitalizador_id)+'2A', color:colorAvatar(u.digitalizador_id), display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:'7px', fontWeight:600 }}>
                          {u.digitalizador.iniciales}
                        </div>
                      )}
                      {['En Validacion','Validada','Cerrada'].includes(u.estado) && u.analista_qa && (
                        <div title={'Analista QA: '+u.analista_qa.nombre}
                          style={{ width:'18px', height:'18px', borderRadius:'50%', background:colorAvatar(u.analista_qa_id)+'2A', color:colorAvatar(u.analista_qa_id), display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:'7px', fontWeight:600 }}>
                          {u.analista_qa.iniciales}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {items.length > 10 && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', textAlign:'center', padding:'4px 0' }}>+ {items.length-10} mas</div>}
              {items.length === 0 && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', textAlign:'center', padding:'12px 0' }}>Sin UOs</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListView({ uos, navigate }) {
  const grupos = [
    { label:'P1 + SLA CRITICO', items: uos.filter(u => u.prioridad==='P1' && u.sla_validacion > 3), color:'var(--red)' },
    { label:'P1 SIN ALERTA', items: uos.filter(u => u.prioridad==='P1' && !(u.sla_validacion > 3)), color:'var(--orange)' },
    { label:'SLA ALTO', items: uos.filter(u => u.prioridad!=='P1' && u.sla_validacion > 3), color:'var(--yellow)' },
    { label:'P2', items: uos.filter(u => u.prioridad==='P2' && !(u.sla_validacion > 3)), color:'var(--yellow)' },
    { label:'P3 PENDIENTE', items: uos.filter(u => u.prioridad==='P3' && !(u.sla_validacion > 3)), color:'var(--muted2)' },
  ].filter(g => g.items.length > 0)

  return (
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <thead>
        <tr>
          {['PRIO','REFERENCIA','NOMBRE','TIPO','KM','DIGITALIZADOR','QA','SLA','ESTADO'].map(h => (
            <th key={h} style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.1em', padding:'7px 10px', borderBottom:'0.5px solid var(--border)', textAlign:'left', background:'var(--surface)', position:'sticky', top:0 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grupos.map(g => (
          <>
            <tr key={g.label}>
              <td colSpan={9}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', background:'var(--surface)', borderBottom:'0.5px solid var(--border2)' }}>
                  <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color: g.color, letterSpacing:'0.12em' }}>{g.label} · {g.items.length}</span>
                  <div style={{ flex:1, height:'0.5px', background:'var(--border2)' }} />
                </div>
              </td>
            </tr>
            {g.items.map(u => (
              <tr key={u.id} onClick={() => navigate('/backlog/'+u.id)} style={{ cursor:'pointer' }}
                onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(td => td.style.background='var(--surface2)')}
                onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(td => td.style.background='')}>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)' }}>
                  <span style={{ width:'7px', height:'7px', borderRadius:'50%', display:'inline-block', background: u.prioridad==='P1' ? 'var(--orange)' : u.prioridad==='P2' ? 'var(--yellow)' : 'var(--muted)' }} />
                </td>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'10px', color:'var(--orange)' }}>{u.referencia_operativa}</td>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontSize:'10px', maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.nombre}</td>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)' }}><Pill color="var(--muted2)">{u.tipo_proyecto}</Pill></td>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'10px' }}>{u.km_teoricos}</td>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)' }}>
                  {u.digitalizador ? (
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:18, height:18, borderRadius:'50%', background:colorAvatar(u.digitalizador_id)+'2A', color:colorAvatar(u.digitalizador_id), display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:7, fontWeight:600, flexShrink:0 }}>{u.digitalizador.iniciales}</div>
                      <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{u.digitalizador.nombre}</span>
                    </div>
                  ) : <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>---</span>}
                </td>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)' }}>
                  {u.analista_qa ? (
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:18, height:18, borderRadius:'50%', background:colorAvatar(u.analista_qa_id)+'2A', color:colorAvatar(u.analista_qa_id), display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:7, fontWeight:600, flexShrink:0 }}>{u.analista_qa.iniciales}</div>
                      <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{u.analista_qa.nombre}</span>
                    </div>
                  ) : <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>---</span>}
                </td>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'10px', color: !u.sla_validacion ? 'var(--muted)' : u.sla_validacion > 3 ? 'var(--red)' : 'var(--green)' }}>{u.sla_validacion ? u.sla_validacion+'d' : '---'}</td>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)' }}>
                  <EstadoBadge estado={u.estado} />
                </td>
              </tr>
            ))}
          </>
        ))}
      </tbody>
    </table>
  )
}