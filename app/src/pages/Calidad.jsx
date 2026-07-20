import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const ICONS = {
  clipboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="4" width="14" height="17" rx="1.5"/><path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><path d="M9 11h6M9 15h6"/></svg>,
  alerta: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>,
  gauge: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 12L16 8"/><circle cx="12" cy="12" r="9"/><path d="M12 21a9 9 0 01-9-9"/></svg>,
  target: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>,
}

function Kpi({ icon, label, value, color = 'var(--text)', small = false }) {
  return (
    <div className="glass" style={{ borderRadius:'10px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
      <div style={{ width:32, height:32, flexShrink:0, borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center',
        background:'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(56,189,248,0.16))', border:'1px solid rgba(139,92,246,0.25)', color:'var(--accent-a)' }}>
        <div style={{ width:17, height:17 }}>{icon}</div>
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', letterSpacing:'0.1em', marginBottom:'3px' }}>{label}</div>
        <div style={{ fontFamily:'var(--disp)', fontSize: small ? '13px' : '26px', fontWeight:800, color, lineHeight:1.15, whiteSpace: small ? 'nowrap' : 'normal', overflow: small ? 'hidden' : 'visible', textOverflow: small ? 'ellipsis' : 'clip' }}>{value}</div>
      </div>
    </div>
  )
}

function TasaBar({ tasa }) {
  const color = tasa > 0.5 ? 'var(--red)' : tasa > 0.3 ? 'var(--yellow)' : 'var(--green)'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
      <div style={{ flex:1, height:'4px', background:'var(--border2)', borderRadius:'2px', overflow:'hidden' }}>
        <div style={{ height:'100%', width:(tasa*100)+'%', borderRadius:'2px', background:color }} />
      </div>
      <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color, minWidth:'32px' }}>{(tasa*100).toFixed(0)}%</span>
    </div>
  )
}

function FamiliaPill({ children }) {
  const color = 'var(--accent-a)'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:999, fontSize:7.5, fontFamily:'var(--mono)', fontWeight:600, background:color+'1A', color, border:'1px solid '+color+'40' }}>
      {children}
    </span>
  )
}

export default function Calidad() {
  const [loading, setLoading] = useState(true)
  const [vistaActiva, setVistaActiva] = useState('items')
  const [itemsError, setItemsError] = useState([])
  const [erroresPorFamilia, setErroresPorFamilia] = useState([])
  const [erroresPorSeccion, setErroresPorSeccion] = useState([])
  const [erroresPorTipo, setErroresPorTipo] = useState([])
  const [totalRevisiones, setTotalRevisiones] = useState(0)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [{ data: respuestas }, { data: resultados }] = await Promise.all([
      supabase.from('checklist_respuestas')
        .select('*, item:checklist_items(nombre, seccion, familia, peso)'),
      supabase.from('checklist_resultados')
        .select('*, uo:unidades_operativas(tipo_proyecto, referencia_operativa)'),
    ])

    setTotalRevisiones((resultados || []).length)

    const tiposPorResultado = {}
    ;(resultados || []).forEach(r => {
      tiposPorResultado[r.id] = r.uo?.tipo_proyecto || 'Sin clasificar'
    })

    // Errores por item
    const porItem = {}
    ;(respuestas || []).forEach(r => {
      if (!r.item_id) return
      if (!porItem[r.item_id]) porItem[r.item_id] = { nombre: r.item?.nombre, seccion: r.item?.seccion, familia: r.item?.familia, peso: r.item?.peso, total: 0, errores: 0 }
      porItem[r.item_id].total++
      if (r.cumplimiento_porcentaje < 100) porItem[r.item_id].errores++
    })
    const itemsList = Object.values(porItem)
      .filter(i => i.total >= 2)
      .map(i => ({ ...i, tasa: i.errores / i.total }))
      .sort((a,b) => b.tasa - a.tasa)
    setItemsError(itemsList)

    // Errores por familia
    const porFamilia = {}
    ;(respuestas || []).forEach(r => {
      const fam = r.item?.familia || 'Sin familia'
      if (!porFamilia[fam]) porFamilia[fam] = { total: 0, errores: 0 }
      porFamilia[fam].total++
      if (r.cumplimiento_porcentaje < 100) porFamilia[fam].errores++
    })
    const familiasList = Object.entries(porFamilia)
      .map(([nombre, d]) => ({ nombre, ...d, tasa: d.errores / d.total }))
      .sort((a,b) => b.errores - a.errores)
    setErroresPorFamilia(familiasList)

    // Errores por seccion
    const porSeccion = {}
    ;(respuestas || []).forEach(r => {
      const sec = r.item?.seccion || 'Sin seccion'
      if (!porSeccion[sec]) porSeccion[sec] = { total: 0, errores: 0 }
      porSeccion[sec].total++
      if (r.cumplimiento_porcentaje < 100) porSeccion[sec].errores++
    })
    const seccionesList = Object.entries(porSeccion)
      .map(([nombre, d]) => ({ nombre, ...d, tasa: d.errores / d.total }))
      .sort((a,b) => b.errores - a.errores)
    setErroresPorSeccion(seccionesList)

    // Errores por tipo de proyecto
    const porTipo = {}
    ;(respuestas || []).forEach(r => {
      const tipo = tiposPorResultado[r.resultado_id] || 'Sin clasificar'
      if (!porTipo[tipo]) porTipo[tipo] = { total: 0, errores: 0, revisiones: new Set() }
      porTipo[tipo].total++
      porTipo[tipo].revisiones.add(r.resultado_id)
      if (r.cumplimiento_porcentaje < 100) porTipo[tipo].errores++
    })
    const tiposList = Object.entries(porTipo)
      .map(([nombre, d]) => ({ nombre, total: d.total, errores: d.errores, revisiones: d.revisiones.size, tasa: d.errores / d.total }))
      .sort((a,b) => b.errores - a.errores)
    setErroresPorTipo(tiposList)

    setLoading(false)
  }

  if (loading) return <div style={{ padding:'40px', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--muted2)' }}>Cargando datos de calidad...</div>

  const VISTAS = [
    { key:'items', label:'POR ITEM' },
    { key:'familia', label:'POR FAMILIA' },
    { key:'seccion', label:'POR SECCION' },
    { key:'tipo', label:'POR TIPO PROYECTO' },
  ]

  return (
    <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:'14px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:'var(--disp)', fontWeight:700, fontSize:'14px' }}>Vista de calidad</span>
        <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>{totalRevisiones} revisiones en total</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
        <Kpi icon={ICONS.clipboard} label="ITEMS REVISADOS" value={itemsError.length} />
        <Kpi icon={ICONS.alerta} label="CON ERRORES" value={itemsError.filter(i => i.errores > 0).length} color="var(--red)" />
        <Kpi icon={ICONS.gauge} label="TASA PROMEDIO" value={itemsError.length > 0 ? (itemsError.reduce((s,i) => s+i.tasa, 0) / itemsError.length * 100).toFixed(1)+'%' : '---'} color="var(--yellow)" />
        <Kpi icon={ICONS.target} label="ITEM MAS PROBLEMATICO" value={itemsError[0]?.nombre?.substring(0,20)+'...' || '---'} color="var(--orange)" small />
      </div>

      <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'6px', padding:'2px', gap:'1px', width:'fit-content' }}>
        {VISTAS.map(v => (
          <button key={v.key} onClick={() => setVistaActiva(v.key)}
            style={{ padding:'5px 12px', borderRadius:'4px', fontSize:'9px', border:'none', fontFamily:'var(--mono)',
              background: vistaActiva===v.key ? 'var(--accent-gradient)' : 'none',
              color: vistaActiva===v.key ? '#fff' : 'var(--muted2)', cursor:'pointer' }}>
            {v.label}
          </button>
        ))}
      </div>

      {vistaActiva === 'items' && (
        <div className="glass" style={{ borderRadius:'10px', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 100px', padding:'8px 16px', borderBottom:'0.5px solid var(--border2)' }}>
            {['ITEM','SECCION','ERRORES','TOTAL','TASA'].map(h => (
              <span key={h} style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted)', letterSpacing:'0.1em' }}>{h}</span>
            ))}
          </div>
          {itemsError.map((item, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 100px', padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'10px', color:'var(--text)', marginBottom:'4px' }}>{item.nombre}</div>
                <FamiliaPill>{item.familia}</FamiliaPill>
              </div>
              <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>{item.seccion}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--red)', fontWeight:'600' }}>{item.errores}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{item.total}</span>
              <TasaBar tasa={item.tasa} />
            </div>
          ))}
        </div>
      )}

      {vistaActiva === 'familia' && (
        <div className="glass" style={{ borderRadius:'10px', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 100px', padding:'8px 16px', borderBottom:'0.5px solid var(--border2)' }}>
            {['FAMILIA','ERRORES','TOTAL','TASA'].map(h => (
              <span key={h} style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted)', letterSpacing:'0.1em' }}>{h}</span>
            ))}
          </div>
          {erroresPorFamilia.map((f, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 100px', padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', alignItems:'center' }}>
              <span style={{ fontSize:'10px', color:'var(--text)' }}>{f.nombre}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--red)', fontWeight:'600' }}>{f.errores}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{f.total}</span>
              <TasaBar tasa={f.tasa} />
            </div>
          ))}
        </div>
      )}

      {vistaActiva === 'seccion' && (
        <div className="glass" style={{ borderRadius:'10px', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 100px', padding:'8px 16px', borderBottom:'0.5px solid var(--border2)' }}>
            {['SECCION','ERRORES','TOTAL','TASA'].map(h => (
              <span key={h} style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted)', letterSpacing:'0.1em' }}>{h}</span>
            ))}
          </div>
          {erroresPorSeccion.map((s, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 100px', padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', alignItems:'center' }}>
              <span style={{ fontSize:'10px', color:'var(--text)' }}>{s.nombre}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--red)', fontWeight:'600' }}>{s.errores}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{s.total}</span>
              <TasaBar tasa={s.tasa} />
            </div>
          ))}
        </div>
      )}

      {vistaActiva === 'tipo' && (
        <div className="glass" style={{ borderRadius:'10px', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 100px', padding:'8px 16px', borderBottom:'0.5px solid var(--border2)' }}>
            {['TIPO PROYECTO','REVISIONES','ERRORES','TOTAL','TASA'].map(h => (
              <span key={h} style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted)', letterSpacing:'0.1em' }}>{h}</span>
            ))}
          </div>
          {erroresPorTipo.map((t, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 100px', padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', alignItems:'center' }}>
              <span style={{ fontSize:'10px', color:'var(--text)' }}>{t.nombre}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{t.revisiones}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--red)', fontWeight:'600' }}>{t.errores}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{t.total}</span>
              <TasaBar tasa={t.tasa} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}