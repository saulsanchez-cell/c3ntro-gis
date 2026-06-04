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
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 53px)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 20px', background:'var(--surface)', borderBottom:'0.5px solid var(--border2)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:'8px' }}>
          <span style={{ fontWeight:'700', fontSize:'14px' }}>Backlog operativo</span>
          <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{uosFiltradas.length} de {uos.length} UOs</span>
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
            {['kanban','lista'].map(v => (
              <button key={v} onClick={() => setVista(v)}
                style={{ padding:'4px 9px', borderRadius:'3px', fontSize:'9px', border:'none',
                  background: vista===v ? 'var(--surface4)' : 'none',
                  color: vista===v ? 'var(--text)' : 'var(--muted2)', letterSpacing:'0.05em' }}>
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
    <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:'8px', alignItems:'start', minWidth:'900px' }}>
      {columnas.map(estado => {
        const items = uos.filter(u => u.estado === estado)
        return (
          <div key={estado} style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', overflow:'hidden' }}>
            <div style={{ height:'2px', background: ESTADO_COLOR[estado] || 'var(--muted)' }} />
            <div style={{ padding:'9px 11px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'0.5px solid var(--border2)' }}>
              <span style={{ fontFamily:'var(--mono)', fontSize:'9px', letterSpacing:'0.1em', color:'var(--muted2)' }}>{estado.toUpperCase()}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color: ESTADO_COLOR[estado] }}>{items.length}</span>
            </div>
            <div style={{ padding:'8px', display:'flex', flexDirection:'column', gap:'6px', maxHeight:'500px', overflowY:'auto' }}>
              {items.slice(0,10).map(u => (
                <div key={u.id} onClick={() => navigate('/backlog/'+u.id)}
                  style={{ background:'var(--surface2)', border:'0.5px solid var(--border2)',
                    borderLeft:'2px solid '+(u.prioridad==='P1' ? 'var(--orange)' : u.sla_validacion > 3 ? 'var(--red)' : 'var(--border2)'),
                    borderRadius:'6px', padding:'9px 10px', cursor:'pointer' }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--orange)', marginBottom:'3px' }}>{u.referencia_operativa}</div>
                  <div style={{ fontSize:'10px', color:'var(--text)', lineHeight:'1.3', marginBottom:'6px' }}>{u.nombre}</div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', gap:'4px' }}>
                      {u.prioridad==='P1' && <span style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'2px 5px', borderRadius:'3px', background:'rgba(249,115,22,0.15)', color:'var(--orange)' }}>P1</span>}
                      {u.sla_validacion > 3 && <span style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'2px 5px', borderRadius:'3px', background:'rgba(239,68,68,0.13)', color:'var(--red)' }}>SLA {u.sla_validacion}d</span>}
                      <span style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'2px 5px', borderRadius:'3px', background:'rgba(120,120,120,0.1)', color:'var(--muted2)' }}>{u.tipo_proyecto}</span>
                    </div>
                    {u.digitalizador && <div style={{ width:'18px', height:'18px', borderRadius:'50%', background:'rgba(34,197,94,0.12)', color:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:'7px' }}>{u.digitalizador.iniciales}</div>}
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
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>{u.tipo_proyecto}</td>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'10px' }}>{u.km_teoricos}</td>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{u.digitalizador?.nombre ?? '---'}</td>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{u.analista_qa?.nombre ?? '---'}</td>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'10px', color: !u.sla_validacion ? 'var(--muted)' : u.sla_validacion > 3 ? 'var(--red)' : 'var(--green)' }}>{u.sla_validacion ? u.sla_validacion+'d' : '---'}</td>
                <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)' }}>
                  <span style={{ fontFamily:'var(--mono)', fontSize:'8px', padding:'2px 7px', borderRadius:'3px', background:'var(--surface3)', color: ESTADO_COLOR[u.estado] || 'var(--muted2)' }}>{u.estado}</span>
                </td>
              </tr>
            ))}
          </>
        ))}
      </tbody>
    </table>
  )
}
