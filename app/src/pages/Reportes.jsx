import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Reportes() {
  const { profile } = useAuth()
  const [uos, setUos] = useState([])
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState('coordinador')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    let all = []
    let from = 0
    while (true) {
      const { data } = await supabase
        .from('unidades_operativas')
        .select('*, digitalizador:profiles!digitalizador_id(nombre), analista_qa:profiles!analista_qa_id(nombre)')
        .eq('es_historico', false)
        .range(from, from + 999)
      if (!data || data.length === 0) break
      all = [...all, ...data]
      if (data.length < 1000) break
      from += 1000
    }
    setUos(all)
    setLoading(false)
  }

  function exportCSV(datos, nombre) {
    if (!datos.length) return
    const headers = Object.keys(datos[0]).join(',')
    const rows = datos.map(r => Object.values(r).map(v => `"${v ?? ''}"`).join(','))
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${nombre}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ padding:'40px', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--muted2)' }}>Cargando reportes...</div>

  const validadas = uos.filter(u => u.estado === 'Validada')
  const rechazadas = uos.filter(u => u.estado === 'Rechazada')
  const en_proceso = uos.filter(u => ['Asignada','En Proceso','En Validacion'].includes(u.estado))
  const pendientes = uos.filter(u => u.estado === 'Pendiente')
  const avance = uos.length > 0 ? ((validadas.length / uos.length) * 100).toFixed(1) : 0

  const por_tipo = {}
  uos.forEach(u => {
    if (!por_tipo[u.tipo_proyecto]) por_tipo[u.tipo_proyecto] = { total:0, validadas:0, en_proceso:0, pendientes:0 }
    por_tipo[u.tipo_proyecto].total++
    if (u.estado === 'Validada') por_tipo[u.tipo_proyecto].validadas++
    else if (['Asignada','En Proceso','En Validacion'].includes(u.estado)) por_tipo[u.tipo_proyecto].en_proceso++
    else if (u.estado === 'Pendiente') por_tipo[u.tipo_proyecto].pendientes++
  })

  const por_analista = {}
  uos.forEach(u => {
    const nombre = u.analista_qa?.nombre ?? 'Sin asignar'
    if (!por_analista[nombre]) por_analista[nombre] = { validadas:0, rechazadas:0, en_proceso:0 }
    if (u.estado === 'Validada') por_analista[nombre].validadas++
    else if (u.estado === 'Rechazada') por_analista[nombre].rechazadas++
    else if (['Asignada','En Proceso','En Validacion'].includes(u.estado)) por_analista[nombre].en_proceso++
  })

  return (
    <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)', letterSpacing:'0.14em' }}>REPORTES Y EXPORTACION</div>
        <div style={{ display:'flex', gap:'4px', background:'var(--surface2)', borderRadius:'6px', padding:'3px' }}>
          {['coordinador','manager','vp'].map(v => (
            <button key={v} onClick={() => setVista(v)}
              style={{ padding:'4px 10px', borderRadius:'4px', fontSize:'9px', border:'none', fontFamily:'var(--mono)',
                background: vista===v ? 'var(--surface4)' : 'none',
                color: vista===v ? 'var(--text)' : 'var(--muted2)', letterSpacing:'0.05em' }}>
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* VISTA COORDINADOR */}
      {vista === 'coordinador' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
            {[
              { label:'TOTAL INVENTARIO', val: uos.length, color:'var(--orange)' },
              { label:'AVANCE GLOBAL', val: avance+'%', color:'var(--yellow)' },
              { label:'VALIDADAS', val: validadas.length, color:'var(--green)' },
              { label:'RECHAZADAS', val: rechazadas.length, color:'var(--red)' },
            ].map(k => (
              <div key={k.label} style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'14px 15px' }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', marginBottom:'7px' }}>{k.label}</div>
                <div style={{ fontSize:'28px', fontWeight:'800', color:k.color, lineHeight:'1' }}>{k.val}</div>
              </div>
            ))}
          </div>

          <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em' }}>RENDIMIENTO POR ANALISTA</div>
              <button onClick={() => exportCSV(Object.entries(por_analista).map(([nombre, d]) => ({ analista:nombre, ...d })), 'rendimiento_analistas')}
                style={{ fontFamily:'var(--mono)', fontSize:'9px', padding:'4px 10px', borderRadius:'4px', border:'0.5px solid var(--border)', background:'none', color:'var(--muted2)' }}>
                EXPORTAR CSV
              </button>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['ANALISTA','VALIDADAS','RECHAZADAS','EN PROCESO'].map(h => (
                    <th key={h} style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', padding:'6px 10px', borderBottom:'0.5px solid var(--border2)', textAlign:'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(por_analista).map(([nombre, d]) => (
                  <tr key={nombre}>
                    <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontSize:'11px' }}>{nombre}</td>
                    <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--green)' }}>{d.validadas}</td>
                    <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--red)' }}>{d.rechazadas}</td>
                    <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--yellow)' }}>{d.en_proceso}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em' }}>AVANCE POR TIPO DE PROYECTO</div>
              <button onClick={() => exportCSV(Object.entries(por_tipo).map(([tipo, d]) => ({ tipo_proyecto:tipo, ...d, pct_avance: ((d.validadas/d.total)*100).toFixed(1)+'%' })), 'avance_por_tipo')}
                style={{ fontFamily:'var(--mono)', fontSize:'9px', padding:'4px 10px', borderRadius:'4px', border:'0.5px solid var(--border)', background:'none', color:'var(--muted2)' }}>
                EXPORTAR CSV
              </button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {Object.entries(por_tipo).map(([tipo, d]) => {
                const pct = ((d.validadas/d.total)*100).toFixed(1)
                return (
                  <div key={tipo}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                      <span style={{ fontSize:'12px' }}>{tipo}</span>
                      <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{d.validadas}/{d.total} · {pct}%</span>
                    </div>
                    <div style={{ height:'4px', background:'var(--border2)', borderRadius:'2px', overflow:'hidden' }}>
                      <div style={{ height:'100%', width: pct+'%', borderRadius:'2px', background:'linear-gradient(90deg,var(--orange),var(--yellow))' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <button onClick={() => exportCSV(uos.map(u => ({ referencia:u.referencia_operativa, nombre:u.nombre, tipo:u.tipo_proyecto, estado:u.estado, prioridad:u.prioridad, km:u.km_teoricos, digitalizador:u.digitalizador?.nombre??'', analista_qa:u.analista_qa?.nombre??'', fecha_asignacion:u.fecha_asignacion??'', fecha_carga:u.fecha_carga_final??'', sla:u.sla_validacion??'' })), 'inventario_completo')}
              style={{ fontFamily:'var(--mono)', fontSize:'10px', padding:'8px 16px', borderRadius:'5px', border:'0.5px solid rgba(249,115,22,0.3)', background:'rgba(249,115,22,0.08)', color:'var(--orange)' }}>
              EXPORTAR INVENTARIO COMPLETO (CSV)
            </button>
          </div>
        </div>
      )}

      {/* VISTA MANAGER */}
      {vista === 'manager' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
            {[
              { label:'AVANCE GLOBAL', val: avance+'%', sub: `${validadas.length} de ${uos.length} UOs`, color:'var(--yellow)' },
              { label:'EN PROCESO', val: en_proceso.length, sub: 'UOs activas ahora', color:'var(--orange)' },
              { label:'PENDIENTES', val: pendientes.length, sub: 'por iniciar', color:'var(--muted2)' },
            ].map(k => (
              <div key={k.label} style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'20px' }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', marginBottom:'8px' }}>{k.label}</div>
                <div style={{ fontSize:'32px', fontWeight:'800', color:k.color, lineHeight:'1', marginBottom:'6px' }}>{k.val}</div>
                <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>{k.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em' }}>CUMPLIMIENTO POR PROYECTO</div>
              <button onClick={() => exportCSV(Object.entries(por_tipo).map(([tipo, d]) => ({ tipo, total:d.total, validadas:d.validadas, en_proceso:d.en_proceso, pendientes:d.pendientes, avance: ((d.validadas/d.total)*100).toFixed(1)+'%' })), 'reporte_manager')}
                style={{ fontFamily:'var(--mono)', fontSize:'9px', padding:'4px 10px', borderRadius:'4px', border:'0.5px solid var(--border)', background:'none', color:'var(--muted2)' }}>
                EXPORTAR CSV
              </button>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['PROYECTO','TOTAL','VALIDADAS','EN PROCESO','PENDIENTES','AVANCE'].map(h => (
                    <th key={h} style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', padding:'6px 10px', borderBottom:'0.5px solid var(--border2)', textAlign:'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(por_tipo).map(([tipo, d]) => (
                  <tr key={tipo}>
                    <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontSize:'11px' }}>{tipo}</td>
                    <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'11px' }}>{d.total}</td>
                    <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--green)' }}>{d.validadas}</td>
                    <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--yellow)' }}>{d.en_proceso}</td>
                    <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--muted2)' }}>{d.pendientes}</td>
                    <td style={{ padding:'8px 10px', borderBottom:'0.5px solid var(--border2)', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--orange)' }}>{((d.validadas/d.total)*100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VISTA VP */}
      {vista === 'vp' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
            {[
              { label:'PROCESADAS', val: validadas.length, sub: `${avance}% del total`, color:'var(--green)' },
              { label:'EN PROCESO', val: en_proceso.length, sub: 'activas ahora', color:'var(--orange)' },
              { label:'PENDIENTES', val: pendientes.length, sub: `de ${uos.length} totales`, color:'var(--muted2)' },
            ].map(k => (
              <div key={k.label} style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'10px', padding:'24px' }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)', marginBottom:'10px', letterSpacing:'0.08em' }}>{k.label}</div>
                <div style={{ fontSize:'48px', fontWeight:'800', color:k.color, lineHeight:'1', marginBottom:'8px' }}>{k.val}</div>
                <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{k.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'20px' }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'16px' }}>AVANCE POR PROYECTO</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              {Object.entries(por_tipo).map(([tipo, d]) => {
                const pct = ((d.validadas/d.total)*100).toFixed(1)
                return (
                  <div key={tipo}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                      <span style={{ fontSize:'14px', fontWeight:'600' }}>{tipo}</span>
                      <span style={{ fontFamily:'var(--mono)', fontSize:'12px', color:'var(--orange)', fontWeight:'700' }}>{pct}%</span>
                    </div>
                    <div style={{ height:'6px', background:'var(--border2)', borderRadius:'3px', overflow:'hidden' }}>
                      <div style={{ height:'100%', width: pct+'%', borderRadius:'3px', background:'linear-gradient(90deg,var(--orange),var(--yellow))' }} />
                    </div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', marginTop:'4px' }}>{d.validadas} validadas · {d.en_proceso} en proceso · {d.pendientes} pendientes</div>
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <button onClick={() => exportCSV(Object.entries(por_tipo).map(([tipo, d]) => ({ proyecto:tipo, total:d.total, procesadas:d.validadas, en_proceso:d.en_proceso, pendientes:d.pendientes, avance: ((d.validadas/d.total)*100).toFixed(1)+'%' })), 'reporte_vp')}
              style={{ fontFamily:'var(--mono)', fontSize:'10px', padding:'8px 16px', borderRadius:'5px', border:'0.5px solid rgba(249,115,22,0.3)', background:'rgba(249,115,22,0.08)', color:'var(--orange)' }}>
              EXPORTAR REPORTE VP (CSV)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}