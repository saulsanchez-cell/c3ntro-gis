import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const ESTADOS = ['Pendiente','Asignada','En Proceso','En Validacion','Validada','Rechazada','Bloqueada','En Correccion']
const ESTADO_COLOR = { Pendiente:'var(--muted2)', Asignada:'var(--orange)', 'En Proceso':'var(--yellow)', 'En Validacion':'var(--yellow)', Validada:'var(--green)', Rechazada:'var(--red)', Bloqueada:'var(--red)', 'En Correccion':'var(--blue)' }

export default function Backlog() {
  const navigate = useNavigate()
  const [uos, setUos] = useState([])
  const [filtro, setFiltro] = useState({ tipo:'', prioridad:'', busqueda:'' })
  const [vista, setVista] = useState('kanban')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchUOs() }, [])

  async function fetchUOs() {
    const { data } = await supabase
      .from('unidades_operativas')
      .select(`*, digitalizador:profiles!digitalizador_id(nombre,iniciales), analista_qa:profiles!analista_qa_id(nombre,iniciales)`)
      .eq('es_historico', false)
      .order('sla_validacion', { ascending: false, nullsFirst: false })
    setUos(data || [])
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

  if (loading) return <div style={{ padding:40, fontFamily:'var(--mono)', fontSize:11, color:'var(--muted2)' }}>Cargando backlog...</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 53px)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 20px', background:'var(--surface)', borderBottom:'0.5px solid var(--border2)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
          <span style={{ fontFamily:'var(--disp)', fontWeight:700, fontSize:14 }}>Backlog operativo</span>
          <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted2)' }}>{uos.length} UOs</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <input placeholder="Buscar referencia o nombre..." value={filtro.busqueda}
            onChange={e => setFiltro(f => ({ ...f, busqueda: e.target.value }))}
            style={{ width:220, padding:'5px 10px', fontSize:10 }} />
          <select value={filtro.tipo} onChange={e => setFiltro(f => ({ ...f, tipo: e.target.value }))}
            style={{ width:130, padding:'5px 8px', fontSize:10 }}>
            <option value="">Todos los tipos</option>
            {['Baseline','Active Line','Tikva','Enterprise','IRU','Backbone','AsBuilt','Reingenieria'].map(t => <option key={t}>{t}</option>)}
          </select>
          <select value={filtro.prioridad} onChange={e => setFiltro(f => ({ ...f, prioridad: e.target.value }))}
            style={{ width:110, padding:'5px 8px', fontSize:10 }}>
            <option value="">Prioridad</option>
            {['P1','P2','P3'].map(p => <option key={p}>{p}</option>)}
          </select>
          <div style={{ display:'flex', background:'var(--surface2)', borderRadius:5, padding:2, gap:1 }}>
            {['kanban','lista'].map(v => (
              <button key={v} onClick={() => setVista(v)}
                style={{ padding:'4px 9px', borderRadius:3, fontSize:9, border:'none',
                  background: vista === v ? 'var(--surface4)' : 'none',
                  color: vista === v ? 'var(--text)' : 'var(--muted2)', letterSpacing:'0.05em' }}>
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ flex:1, overflow:'auto', padding:'14px 20px' }}>
        {vista === 'kanban' ? <KanbanView uos={uosFiltradas} navigate={navigate} /> : <ListView uos={uosFiltradas} navigate={navigate} />}
      </div>
    </div>
  )
}

function KanbanView({ uos, navigate }) {
  const columnas = ['Pendiente','Asignada','En Proceso','En Validacion','Validada','Rechazada']
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, alignItems:'start', minWidth:900 }}>
      {columnas.map(estado => {
        const items = uos.filter(u => u.estado === estado)
        return (
          <div key={estado} style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:8, overflow:'hidden' }}>
            <div style={{ height:2, background: ESTADO_COLOR[estado] || 'var(--muted)' }} />
            <div style={{ padding:'9px 11px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'0.5px solid var(--border2)' }}>
              <span style={{ fontFamily:'var(--mono)', fontSize:9, letterSpacing:'0.1em', color:'var(--muted2)' }}>{estado.toUpperCase()}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:10, color: ESTADO_COLOR[estado] }}>{items.length}</span>
            </div>
            <div style={{ padding:8, display:'flex', flexDirection:'column', gap:6, maxHeight:500, overflowY:'auto' }}>
              {items.slice(0,8).map(u => (
                <div key={u.id} onClick={() => navigate(`/backlog/${u.id}`)}
                  style={{ background:'var(--surface2)', border:`0.5px solid var(--border2)`,
                    borderLeft:`2px solid ${u.prioridad==='P1' ? 'var(--orange)' : u.sla_validacion > 3 ? 'var(--red)' : 'var(--border2)'}`,
                    borderRadius:6, padding:'9px 10px', cursor:'pointer' }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--orange)', marginBottom:3 }}>{u.referencia_operativa}</div>
                  <div style={{ fontSize:10, color:'var(--text)', lineHeight:1.3, marginBottom:6 }}>{u.nombre}</div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      {u.prioridad === 'P1' && <span style={{ fontFamily:'var(--mono)', fontSize:7, padding:'2px 5px', borderRadius:3, background:'rgba(249,115,22,0.15)', color:'var(--orange)' }}>P1</span>}
                      {u.sla_validacion > 3 && <span style={{ fontFamily:'var(--mono)', fontSize:7, padding:'2px 5px', borderRadius:3, background:'rgba(239,68,68,0.13)', color:'var(--red)' }}>SLA {u.sla_validacion}d</span>}
                    </div>
                    {u.digitalizador && <div style={{ width:18, height:18, borderRadius:'50%', background:'rgba(34,197,94,0.12)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:7 }}>{u.digitalizador.iniciales}</div>}
                  </div>
                </div>
              ))}
              {items.length > 8 && <div style={{ fontFamily:'var(--mono)', fontSize:8, color:'var(--muted)', textAlign:'center', padding:'4px 0' }}>+ {items.length - 8} más</div>}
              {items.length === 0 && <div style={{ fontFamily:'var(--mono)', fontSize:8, color:'var(--muted)', textAlign:'center', padding:'12px 0' }}>Sin UOs</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListView({ uos, navigate }) {
  return (
    <table style={{ width:'100%', borderCollapse:'collapse' }}>
      <thead>
        <tr>
          {['PRIO','REFERENCIA','NOMBRE','TIPO','KM','DIGITALIZADOR','QA','SLA','ESTADO'].map(h => (
            <th key={h} style={{ fontFamily:'var(--mono)', fontSize:8, color:'var(--muted)', letterSpacing:'0.1em', padding:'7px 10px', borderBottom:'0.5px solid var(--border)', textAlign:'left', background:'var(--surface)', position:'sticky', top:0 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {uos.map(u => (
          <tr key={u.id} onClick={() => navigate(`/backlog/${u.id}`)} style={{ cursor:'pointer' }}>
            <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', display:'inline-block', background: u.prioridad==='P1' ? 'var(--orange)' : u.prioridad==='P2' ? 'var(--yellow)' : 'var(--muted)' }} />
            </td>
            <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:10, color:'var(--orange)' }}>{u.referencia_operativa}</td>
            <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontSize:10, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.nombre}</td>
            <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:9, color:'var(--muted2)' }}>{u.tipo_proyecto}</td>
            <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:10 }}>{u.km_teoricos}</td>
            <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:10, color:'var(--muted2)' }}>{u.digitalizador?.nombre ?? '—'}</td>
            <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:10, color:'var(--muted2)' }}>{u.analista_qa?.nombre ?? '—'}</td>
            <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:10, color: !u.sla_validacion ? 'var(--muted)' : u.sla_validacion > 3 ? 'var(--red)' : 'var(--green)' }}>{u.sla_validacion ? u.sla_validacion + 'd' : '—'}</td>
            <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)' }}>
              <span style={{ fontFamily:'var(--mono)', fontSize:8, padding:'2px 7px', borderRadius:3, background:'var(--surface2)', color: ESTADO_COLOR[u.estado] || 'var(--muted2)' }}>{u.estado}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
