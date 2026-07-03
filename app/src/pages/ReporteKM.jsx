import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { jsPDF } from 'jspdf'

const TIPOS_FIJOS = ['Tikva', 'Baseline', 'Active Line']
const COLOR_PENDIENTE = '#EF4444'
const COLOR_VALIDADO = '#22C55E'
const COLOR_RECHAZADO = '#9CA3AF'
const COLOR_EN_PROCESO = '#FACC15'
const UMBRAL_EVALUACION = 97

export default function ReporteKM() {
  const [loading, setLoading] = useState(true)
  const [uos, setUos] = useState([])
  const [checklists, setChecklists] = useState([])
  const [metas, setMetas] = useState({})
  const [agrupacion, setAgrupacion] = useState('entidad')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    let all = []
    let from = 0
    const size = 1000
    while (true) {
      const { data } = await supabase
        .from('unidades_operativas')
        .select('id, km_teoricos, tipo_proyecto, entidad_federativa, estado, digitalizador_id, created_at, digitalizador:profiles!digitalizador_id(nombre)')
        .eq('es_historico', false)
        .range(from, from + size - 1)
      if (!data || data.length === 0) break
      all = [...all, ...data]
      if (data.length < size) break
      from += size
    }
    setUos(all)

    const { data: cl } = await supabase
      .from('checklist_resultados')
      .select('uo_id, score_porcentaje')
      .order('created_at', { ascending: false })
    setChecklists(cl || [])

    const { data: metasData } = await supabase.from('metas_proyecto').select('*')
    const metasMap = {}
    ;(metasData || []).forEach(m => { metasMap[m.tipo_proyecto] = m.km_objetivo })
    setMetas(metasMap)

    setLoading(false)
  }

  const scorePorUO = useMemo(() => {
    const map = {}
    checklists.forEach(c => {
      if (!(c.uo_id in map)) map[c.uo_id] = c.score_porcentaje
    })
    return map
  }, [checklists])

  function evaluacionPromedio(lista) {
    const scores = lista.map(u => scorePorUO[u.id]).filter(s => s !== undefined && s !== null)
    if (scores.length === 0) return null
    return scores.reduce((a, b) => a + b, 0) / scores.length
  }

  const kpisGenerales = useMemo(() => {
    const kmTotal = uos.reduce((s, u) => s + (u.km_teoricos || 0), 0)
    const procesados = uos.filter(u => u.estado === 'Validada' || u.estado === 'Cerrada').length
    const evalProm = evaluacionPromedio(uos.filter(u => u.estado === 'Validada' || u.estado === 'Cerrada'))
    return { kmTotal, procesados, evalProm }
  }, [uos, scorePorUO])

  // Crecimiento de Active Line: km cargados este mes vs mes anterior, usando created_at
  const crecimientoActiveLine = useMemo(() => {
    const lista = uos.filter(u => u.tipo_proyecto === 'Active Line' && u.created_at)
    const hoy = new Date()
    const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)

    let kmMesActual = 0, kmMesAnterior = 0, clientesMesActual = 0
    lista.forEach(u => {
      const fecha = new Date(u.created_at)
      const km = u.km_teoricos || 0
      if (fecha >= inicioMesActual) { kmMesActual += km; clientesMesActual += 1 }
      else if (fecha >= inicioMesAnterior && fecha < inicioMesActual) { kmMesAnterior += km }
    })

    const deltaKm = kmMesActual - kmMesAnterior
    const deltaPct = kmMesAnterior > 0 ? (deltaKm / kmMesAnterior) * 100 : null

    return { kmMesActual, kmMesAnterior, clientesMesActual, deltaKm, deltaPct }
  }, [uos])

  const porTipo = useMemo(() => {
    return TIPOS_FIJOS.map(tipo => {
      const lista = uos.filter(u => u.tipo_proyecto === tipo)
      const validadas = lista.filter(u => u.estado === 'Validada' || u.estado === 'Cerrada')
      const kmProcesados = validadas.reduce((s, u) => s + (u.km_teoricos || 0), 0)
      const kmObjetivo = metas[tipo] || null
      const pctObjetivo = kmObjetivo ? Math.min(100, (kmProcesados / kmObjetivo) * 100) : null
      const kmFaltante = kmObjetivo ? Math.max(0, kmObjetivo - kmProcesados) : null
      return {
        tipo,
        kmProcesados,
        kmObjetivo,
        pctObjetivo,
        kmFaltante,
        totalUOs: lista.length,
        proyectos: validadas.length,
        proyectosValidados: validadas.length,
        evaluacion: evaluacionPromedio(validadas),
      }
    })
  }, [uos, scorePorUO, metas])

  const distribucionTotal = useMemo(() => {
    const pendientes = uos.filter(u => !['Validada','Cerrada','Rechazada'].includes(u.estado)).reduce((s,u) => s + (u.km_teoricos||0), 0)
    const validados = uos.filter(u => u.estado === 'Validada' || u.estado === 'Cerrada').reduce((s,u) => s + (u.km_teoricos||0), 0)
    const rechazados = uos.filter(u => u.estado === 'Rechazada').reduce((s,u) => s + (u.km_teoricos||0), 0)
    return { pendientes, validados, rechazados, total: pendientes + validados + rechazados }
  }, [uos])

  const dataAgrupada = useMemo(() => {
    let keyFn
    if (agrupacion === 'entidad') keyFn = u => u.entidad_federativa || 'Sin entidad'
    else if (agrupacion === 'tipo') keyFn = u => u.tipo_proyecto || 'Sin clasificar'
    else keyFn = u => u.digitalizador?.nombre || 'Sin asignar'

    const grupos = {}
    uos.forEach(u => {
      const key = keyFn(u)
      if (key === 'Sin entidad' || key === 'Sin clasificar' || key === 'Sin asignar') return
      if (!grupos[key]) grupos[key] = { nombre: key, pendientes: 0, validados: 0, rechazados: 0, total: 0 }
      const km = u.km_teoricos || 0
      grupos[key].total += km
      if (u.estado === 'Validada' || u.estado === 'Cerrada') grupos[key].validados += km
      else if (u.estado === 'Rechazada') grupos[key].rechazados += km
      else grupos[key].pendientes += km
    })

    return Object.values(grupos)
      .filter(g => g.total > 0)
      .map(g => ({ ...g, pctAvance: g.total > 0 ? (g.validados / g.total) * 100 : 0 }))
      .sort((a, b) => b.pctAvance - a.pctAvance)
  }, [uos, agrupacion])

  const donutData = [
    { name: 'Pendientes', value: distribucionTotal.pendientes, color: COLOR_PENDIENTE },
    { name: 'Validados', value: distribucionTotal.validados, color: COLOR_VALIDADO },
    { name: 'Rechazados', value: distribucionTotal.rechazados, color: COLOR_RECHAZADO },
  ].filter(d => d.value > 0)

  async function exportarPDF() {
    const html2canvas = (await import('html2canvas')).default
    const { jsPDF } = await import('jspdf')

    const el = document.getElementById('reporte-km-container')
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#0d1117', useCORS: true })
    const imgData = canvas.toDataURL('image/png')

    const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 24

    const imgWidth = pageWidth - margin * 2
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    let heightLeft = imgHeight
    let position = margin

    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
    heightLeft -= (pageHeight - margin * 2)

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + margin
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
      heightLeft -= (pageHeight - margin * 2)
    }

    pdf.save(`Reporte_KM_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  if (loading) return <div style={{ padding:'40px', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--muted2)' }}>Cargando reporte...</div>

  const fechaHoy = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' })

  return (
    <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:'16px' }} id="reporte-km-container">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)', letterSpacing:'0.14em' }}>REPORTE DE AVANCE POR KILOMETRAJE</div>
          <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', marginTop:'2px' }}>{fechaHoy}</div>
        </div>
        <button onClick={exportarPDF}
          style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid rgba(249,115,22,0.3)', background:'rgba(249,115,22,0.08)', color:'var(--orange)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
          DESCARGAR PDF
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' }}>
        {[
          { label:'KM TEORICOS TOTAL', val: kpisGenerales.kmTotal.toFixed(2)+' km', color:'var(--orange)' },
          { label:'PROYECTOS VALIDADOS', val: kpisGenerales.procesados, color:'var(--green)' },
          { label:'EVALUACION GENERAL PROMEDIO', val: kpisGenerales.evalProm !== null ? kpisGenerales.evalProm.toFixed(1)+'%' : '---', color:'var(--blue)', sub: 'Objetivo >'+UMBRAL_EVALUACION+'%' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'14px 16px' }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.1em', marginBottom:'8px' }}>{k.label}</div>
            <div style={{ fontSize:'24px', fontWeight:'700', color:k.color }}>{k.val}</div>
            {k.sub && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'4px' }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px' }}>
        {porTipo.map(t => (
          <div key={t.tipo} style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', overflow:'hidden' }}>
            <div style={{ padding:'9px 14px', borderBottom:'0.5px solid var(--border2)', background:'var(--surface2)' }}>
              <span style={{ fontWeight:'700', fontSize:'12px' }}>{t.tipo}</span>
            </div>

            {t.tipo === 'Active Line' ? (
              <div style={{ padding:'12px 14px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' }}>
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)', marginBottom:'4px' }}>KM ACUMULADOS</div>
                    <div style={{ fontSize:'16px', fontWeight:'700', color:'var(--orange)' }}>{t.kmProcesados.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)', marginBottom:'4px' }}>VALIDADOS / TOTAL</div>
                    <div style={{ fontSize:'16px', fontWeight:'700' }}>{t.proyectosValidados}<span style={{ fontSize:'10px', color:'var(--muted2)', fontWeight:'400' }}> / {t.totalUOs === undefined ? t.proyectos : t.totalUOs}</span></div>
                  </div>
                </div>
                <div style={{ borderTop:'0.5px solid var(--border2)', paddingTop:'10px', display:'flex', flexDirection:'column', gap:'4px' }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)' }}>CRECIMIENTO ESTE MES</div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:'6px' }}>
                    <span style={{ fontSize:'14px', fontWeight:'700', color: crecimientoActiveLine.deltaKm >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {crecimientoActiveLine.deltaKm >= 0 ? '+' : ''}{crecimientoActiveLine.deltaKm.toFixed(2)} km
                    </span>
                    {crecimientoActiveLine.deltaPct !== null && (
                      <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>
                        ({crecimientoActiveLine.deltaPct >= 0 ? '+' : ''}{crecimientoActiveLine.deltaPct.toFixed(0)}% vs mes anterior)
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)' }}>{crecimientoActiveLine.clientesMesActual} cliente(s) nuevo(s)</div>
                </div>
                <div style={{ marginTop:'10px' }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)', marginBottom:'4px' }}>EVALUACION</div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:'var(--green)' }}>{t.evaluacion !== null ? t.evaluacion.toFixed(1)+'%' : '---'}</div>
                </div>
              </div>
            ) : (
              <div style={{ padding:'12px 14px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom: t.kmObjetivo ? '8px' : '10px' }}>
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)', marginBottom:'4px' }}>KM PROCESADOS</div>
                    <div style={{ fontSize:'16px', fontWeight:'700', color:'var(--orange)' }}>
                      {t.kmProcesados.toFixed(2)}{t.kmObjetivo ? <span style={{ fontSize:'10px', color:'var(--muted2)', fontWeight:'400' }}> / {t.kmObjetivo} km</span> : ''}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)', marginBottom:'4px' }}>PROYECTOS</div>
                    <div style={{ fontSize:'16px', fontWeight:'700' }}>{t.proyectosValidados}</div>
                  </div>
                </div>

                {t.kmObjetivo ? (
                  <div style={{ marginBottom:'10px' }}>
                    <div style={{ height:'6px', background:'var(--border2)', borderRadius:'3px', overflow:'hidden', marginBottom:'4px' }}>
                      <div style={{ height:'100%', width:t.pctObjetivo+'%', borderRadius:'3px', background:'var(--orange)' }} />
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)' }}>{t.pctObjetivo.toFixed(1)}% del objetivo</span>
                      <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)' }}>Faltan {t.kmFaltante.toFixed(2)} km</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', marginBottom:'10px' }}>Objetivo sin definir</div>
                )}

                <div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)', marginBottom:'4px' }}>EVALUACION</div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color: t.evaluacion !== null && t.evaluacion >= UMBRAL_EVALUACION ? 'var(--green)' : 'var(--yellow)' }}>
                    {t.evaluacion !== null ? t.evaluacion.toFixed(1)+'%' : '---'}
                    <span style={{ fontSize:'9px', color:'var(--muted2)', fontWeight:'400' }}> (obj. &gt;{UMBRAL_EVALUACION}%)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)', letterSpacing:'0.12em' }}>RANKING DE AVANCE POR KILOMETRAJE</span>
        <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'6px', padding:'2px', gap:'1px' }}>
          {[{k:'entidad',l:'ENTIDAD'},{k:'tipo',l:'TIPO PROYECTO'},{k:'digitalizador',l:'DIGITALIZADOR'}].map(o => (
            <button key={o.k} onClick={() => setAgrupacion(o.k)}
              style={{ padding:'4px 10px', borderRadius:'4px', fontSize:'9px', border:'none', fontFamily:'var(--mono)',
                background: agrupacion===o.k ? 'var(--surface4)' : 'none',
                color: agrupacion===o.k ? 'var(--text)' : 'var(--muted2)' }}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'40px 1.4fr 90px 90px 70px 1fr', padding:'8px 16px', borderBottom:'0.5px solid var(--border2)', background:'var(--surface2)' }}>
          {['#','NOMBRE','KM VALID.','KM TOTAL','% AVANCE','PROGRESO'].map(h => (
            <span key={h} style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted)', letterSpacing:'0.1em' }}>{h}</span>
          ))}
        </div>
        {dataAgrupada.map((g, i) => (
          <div key={g.nombre} style={{ display:'grid', gridTemplateColumns:'40px 1.4fr 90px 90px 70px 1fr', padding:'9px 16px', borderBottom:'0.5px solid var(--border2)', alignItems:'center' }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{i+1}</span>
            <span style={{ fontSize:'11px' }}>{g.nombre}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'10px' }}>{g.validados.toFixed(2)}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{g.total.toFixed(2)}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'10px', fontWeight:'600', color: g.pctAvance >= 90 ? 'var(--green)' : g.pctAvance >= 50 ? 'var(--yellow)' : 'var(--red)' }}>{g.pctAvance.toFixed(1)}%</span>
            <div style={{ height:'10px', background:'var(--border2)', borderRadius:'4px', overflow:'hidden' }}>
              <div style={{ height:'100%', width:g.pctAvance+'%', borderRadius:'4px', background: g.pctAvance >= 90 ? 'var(--green)' : g.pctAvance >= 50 ? 'var(--yellow)' : 'var(--red)' }} />
            </div>
          </div>
        ))}
        {dataAgrupada.length === 0 && <div style={{ padding:'20px 16px', fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin datos para mostrar</div>}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:'10px' }}>
        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'14px 16px' }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'10px' }}>KM POR {agrupacion === 'entidad' ? 'ENTIDAD' : agrupacion === 'tipo' ? 'TIPO DE PROYECTO' : 'DIGITALIZADOR'}</div>
          <ResponsiveContainer width="100%" height={Math.max(240, dataAgrupada.length * 32)}>
            <BarChart data={dataAgrupada} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--muted2)' }} />
              <YAxis type="category" dataKey="nombre" width={110} tick={{ fontSize: 9, fill: 'var(--text)' }} />
              <Tooltip contentStyle={{ background:'#161b22', border:'0.5px solid #30363d', fontSize:'11px' }} />
              <Legend wrapperStyle={{ fontSize: '9px' }} />
              <Bar dataKey="pendientes" stackId="a" fill={COLOR_PENDIENTE} name="Pendientes" />
              <Bar dataKey="validados" stackId="a" fill={COLOR_VALIDADO} name="Validados" />
              <Bar dataKey="rechazados" stackId="a" fill={COLOR_RECHAZADO} name="Rechazados" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'14px 16px' }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'10px' }}>DISTRIBUCION TOTAL DE KM</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background:'#161b22', border:'0.5px solid #30363d', fontSize:'11px' }} formatter={(v) => v.toFixed(2)+' km'} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginTop:'10px' }}>
            {donutData.map(d => (
              <div key={d.name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                  <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:d.color }} />
                  <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>{d.name}</span>
                </div>
                <span style={{ fontFamily:'var(--mono)', fontSize:'9px' }}>{d.value.toFixed(2)} km</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
