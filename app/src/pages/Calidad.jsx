import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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
        <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)', letterSpacing:'0.14em' }}>VISTA DE CALIDAD</div>
        <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>{totalRevisiones} revisiones en total</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
        {[
          { label:'ITEMS REVISADOS', val: itemsError.length, color:'var(--text)' },
          { label:'CON ERRORES', val: itemsError.filter(i => i.errores > 0).length, color:'var(--red)' },
          { label:'TASA PROMEDIO', val: itemsError.length > 0 ? (itemsError.reduce((s,i) => s+i.tasa, 0) / itemsError.length * 100).toFixed(1)+'%' : '---', color:'var(--yellow)' },
          { label:'ITEM MAS PROBLEMATICO', val: itemsError[0]?.nombre?.substring(0,20)+'...' || '---', color:'var(--orange)', small: true },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'14px 16px' }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'8px' }}>{k.label}</div>
            <div style={{ fontSize: k.small ? '11px' : '24px', fontWeight:'700', color: k.color, lineHeight:'1.2' }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'6px', padding:'2px', gap:'1px', width:'fit-content' }}>
        {VISTAS.map(v => (
          <button key={v.key} onClick={() => setVistaActiva(v.key)}
            style={{ padding:'5px 12px', borderRadius:'4px', fontSize:'9px', border:'none', fontFamily:'var(--mono)',
              background: vistaActiva===v.key ? 'var(--surface4)' : 'none',
              color: vistaActiva===v.key ? 'var(--text)' : 'var(--muted2)', cursor:'pointer' }}>
            {v.label}
          </button>
        ))}
      </div>

      {vistaActiva === 'items' && (
        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 100px', padding:'8px 16px', borderBottom:'0.5px solid var(--border2)', background:'var(--surface2)' }}>
            {['ITEM','SECCION','ERRORES','TOTAL','TASA'].map(h => (
              <span key={h} style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted)', letterSpacing:'0.1em' }}>{h}</span>
            ))}
          </div>
          {itemsError.map((item, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 100px', padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:'10px', color:'var(--text)', marginBottom:'2px' }}>{item.nombre}</div>
                <span style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'1px 5px', borderRadius:'3px', background:'rgba(120,120,120,0.1)', color:'var(--muted2)' }}>{item.familia}</span>
              </div>
              <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>{item.seccion}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--red)', fontWeight:'600' }}>{item.errores}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{item.total}</span>
              <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                <div style={{ flex:1, height:'4px', background:'var(--border2)', borderRadius:'2px', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:(item.tasa*100)+'%', borderRadius:'2px', background: item.tasa > 0.5 ? 'var(--red)' : item.tasa > 0.3 ? 'var(--yellow)' : 'var(--green)' }} />
                </div>
                <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color: item.tasa > 0.5 ? 'var(--red)' : item.tasa > 0.3 ? 'var(--yellow)' : 'var(--green)', minWidth:'32px' }}>{(item.tasa*100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {vistaActiva === 'familia' && (
        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 100px', padding:'8px 16px', borderBottom:'0.5px solid var(--border2)', background:'var(--surface2)' }}>
            {['FAMILIA','ERRORES','TOTAL','TASA'].map(h => (
              <span key={h} style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted)', letterSpacing:'0.1em' }}>{h}</span>
            ))}
          </div>
          {erroresPorFamilia.map((f, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 100px', padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', alignItems:'center' }}>
              <span style={{ fontSize:'10px', color:'var(--text)' }}>{f.nombre}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--red)', fontWeight:'600' }}>{f.errores}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{f.total}</span>
              <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                <div style={{ flex:1, height:'4px', background:'var(--border2)', borderRadius:'2px', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:(f.tasa*100)+'%', borderRadius:'2px', background: f.tasa > 0.5 ? 'var(--red)' : f.tasa > 0.3 ? 'var(--yellow)' : 'var(--green)' }} />
                </div>
                <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color: f.tasa > 0.5 ? 'var(--red)' : f.tasa > 0.3 ? 'var(--yellow)' : 'var(--green)', minWidth:'32px' }}>{(f.tasa*100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {vistaActiva === 'seccion' && (
        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 100px', padding:'8px 16px', borderBottom:'0.5px solid var(--border2)', background:'var(--surface2)' }}>
            {['SECCION','ERRORES','TOTAL','TASA'].map(h => (
              <span key={h} style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted)', letterSpacing:'0.1em' }}>{h}</span>
            ))}
          </div>
          {erroresPorSeccion.map((s, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 100px', padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', alignItems:'center' }}>
              <span style={{ fontSize:'10px', color:'var(--text)' }}>{s.nombre}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--red)', fontWeight:'600' }}>{s.errores}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{s.total}</span>
              <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                <div style={{ flex:1, height:'4px', background:'var(--border2)', borderRadius:'2px', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:(s.tasa*100)+'%', borderRadius:'2px', background: s.tasa > 0.5 ? 'var(--red)' : s.tasa > 0.3 ? 'var(--yellow)' : 'var(--green)' }} />
                </div>
                <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color: s.tasa > 0.5 ? 'var(--red)' : s.tasa > 0.3 ? 'var(--yellow)' : 'var(--green)', minWidth:'32px' }}>{(s.tasa*100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {vistaActiva === 'tipo' && (
        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 100px', padding:'8px 16px', borderBottom:'0.5px solid var(--border2)', background:'var(--surface2)' }}>
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
              <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                <div style={{ flex:1, height:'4px', background:'var(--border2)', borderRadius:'2px', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:(t.tasa*100)+'%', borderRadius:'2px', background: t.tasa > 0.5 ? 'var(--red)' : t.tasa > 0.3 ? 'var(--yellow)' : 'var(--green)' }} />
                </div>
                <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color: t.tasa > 0.5 ? 'var(--red)' : t.tasa > 0.3 ? 'var(--yellow)' : 'var(--green)', minWidth:'32px' }}>{(t.tasa*100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}