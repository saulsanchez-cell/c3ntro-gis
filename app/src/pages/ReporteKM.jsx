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
async function exportarPDFCompleto() {
    const { jsPDF } = await import('jspdf')

    const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })
    const W = pdf.internal.pageSize.getWidth()
    const H = pdf.internal.pageSize.getHeight()
    const M = 36       // margen
    const COL = W - M * 2
    const fechaStr = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' })

    // Colores en RGB
    const C = {
      bg:      [13,  17,  23],
      surface: [22,  27,  34],
      border:  [48,  54,  61],
      orange:  [249, 115, 22],
      green:   [34,  197, 94],
      red:     [239, 68,  68],
      gray:    [156, 163, 175],
      muted:   [110, 118, 129],
      white:   [230, 237, 243],
      yellow:  [250, 204, 21],
      blue:    [59,  130, 246],
    }

    function setFill(rgb)   { pdf.setFillColor(...rgb) }
    function setDraw(rgb)   { pdf.setDrawColor(...rgb) }
    function setTxt(rgb)    { pdf.setTextColor(...rgb) }
    function rect(x,y,w,h) { pdf.rect(x,y,w,h,'F') }

    // Fondo negro en cada página
    function bgPage() {
      setFill(C.bg)
      rect(0, 0, W, H)
    }

    let y = M

    function checkPage(needed = 60) {
      if (y + needed > H - M) {
        pdf.addPage()
        bgPage()
        y = M
      }
    }

    function sectionTitle(txt) {
      checkPage(30)
      setTxt(C.muted)
      pdf.setFontSize(7)
      pdf.setFont('helvetica','bold')
      pdf.text(txt.toUpperCase(), M, y)
      y += 4
      setFill(C.border)
      rect(M, y, COL, 0.5)
      y += 10
    }

    function kpiCard(x, cardW, label, val, rgb) {
      setFill(C.surface)
      setDraw(C.border)
      pdf.roundedRect(x, y, cardW, 44, 3, 3, 'FD')
      setTxt(C.muted)
      pdf.setFontSize(6.5)
      pdf.setFont('helvetica','normal')
      pdf.text(label, x+8, y+13)
      setTxt(rgb)
      pdf.setFontSize(18)
      pdf.setFont('helvetica','bold')
      pdf.text(String(val), x+8, y+34)
    }

    function tipoCard(x, cardW, t) {
      const cardH = 70
      setFill(C.surface)
      setDraw(C.border)
      pdf.roundedRect(x, y, cardW, cardH, 3, 3, 'FD')

      // Header
      setFill(C.border)
      pdf.roundedRect(x, y, cardW, 16, 3, 3, 'F')
      rect(x, y+10, cardW, 6)
      setTxt(C.white)
      pdf.setFontSize(8)
      pdf.setFont('helvetica','bold')
      pdf.text(t.tipo, x+8, y+11)

      // KM procesados
      setTxt(C.muted)
      pdf.setFontSize(6)
      pdf.setFont('helvetica','normal')
      pdf.text('KM PROCESADOS', x+8, y+24)
      setTxt(C.orange)
      pdf.setFontSize(11)
      pdf.setFont('helvetica','bold')
      const kmTxt = t.kmProcesados.toFixed(2)
      pdf.text(kmTxt, x+8, y+34)
      if (t.kmObjetivo) {
        setTxt(C.muted)
        pdf.setFontSize(7)
        pdf.setFont('helvetica','normal')
        const kmW = pdf.getTextWidth(kmTxt)
        pdf.text(` / ${t.kmObjetivo} km`, x+8+kmW+1, y+34)
      }

      // Proyectos
      setTxt(C.muted)
      pdf.setFontSize(6)
      pdf.text(t.tipo === 'Active Line' ? 'VALIDADOS / TOTAL' : 'PROYECTOS VALIDADOS', x + cardW/2 + 4, y+24)
      setTxt(C.white)
      pdf.setFontSize(11)
      pdf.setFont('helvetica','bold')
      pdf.text(String(t.proyectosValidados) + (t.tipo === 'Active Line' ? ` / ${t.totalUOs ?? t.proyectos}` : ''), x + cardW/2 + 4, y+34)

      // Barra de progreso (Tikva y Baseline)
      if (t.kmObjetivo && t.pctObjetivo !== null) {
        setFill(C.border)
        rect(x+8, y+39, cardW-16, 4)
        setFill(C.orange)
        rect(x+8, y+39, Math.max(1,(cardW-16) * t.pctObjetivo / 100), 4)
        setTxt(C.muted)
        pdf.setFontSize(6)
        pdf.setFont('helvetica','normal')
        pdf.text(`${t.pctObjetivo.toFixed(1)}% del objetivo · Faltan ${t.kmFaltante.toFixed(2)} km`, x+8, y+49)
      }

      // Evaluacion
      setTxt(C.muted)
      pdf.setFontSize(6)
      pdf.setFont('helvetica','normal')
      pdf.text('EVALUACION', x+8, y+57)
      const evalColor = t.evaluacion !== null && t.evaluacion >= UMBRAL_EVALUACION ? C.green : C.yellow
      setTxt(evalColor)
      pdf.setFontSize(9)
      pdf.setFont('helvetica','bold')
      pdf.text(t.evaluacion !== null ? t.evaluacion.toFixed(1)+'%' : '---', x+8, y+66)
      setTxt(C.muted)
      pdf.setFontSize(6)
      pdf.setFont('helvetica','normal')
      pdf.text(`(obj. >${UMBRAL_EVALUACION}%)`, x+8+28, y+66)
    }

    function rankingSection(datos, titulo) {
      checkPage(20)
      sectionTitle(titulo)

      // Header tabla
      setFill(C.surface)
      rect(M, y, COL, 14)
      setTxt(C.muted)
      pdf.setFontSize(6)
      pdf.setFont('helvetica','bold')
      pdf.text('#',         M+4,       y+9)
      pdf.text('NOMBRE',   M+18,      y+9)
      pdf.text('KM VALID.', M+COL*0.55, y+9)
      pdf.text('KM TOTAL',  M+COL*0.68, y+9)
      pdf.text('% AVANCE',  M+COL*0.81, y+9)
      pdf.text('PROGRESO',  M+COL*0.90, y+9)
      y += 14

      datos.forEach((g, i) => {
        checkPage(14)
        // Fondo alternado
        if (i % 2 === 0) { setFill([18,23,30]); rect(M, y, COL, 13) }

        const pct = g.pctAvance
        const barColor = pct >= 90 ? C.green : pct >= 50 ? C.yellow : C.red

        setTxt(C.muted)
        pdf.setFontSize(7)
        pdf.setFont('helvetica','normal')
        pdf.text(String(i+1),              M+4,        y+9)
        setTxt(C.white)
        pdf.text(g.nombre.substring(0,30), M+18,       y+9)
        setTxt(C.white)
        pdf.text(g.validados.toFixed(2),   M+COL*0.55, y+9)
        setTxt(C.muted)
        pdf.text(g.total.toFixed(2),       M+COL*0.68, y+9)
        setTxt(barColor)
        pdf.setFont('helvetica','bold')
        pdf.text(pct.toFixed(1)+'%',       M+COL*0.81, y+9)

        // Mini barra
        const barX = M + COL*0.90
        const barW = COL*0.09
        setFill(C.border)
        rect(barX, y+4, barW, 5)
        setFill(barColor)
        rect(barX, y+4, Math.max(1, barW * pct/100), 5)

        y += 13
      })
      y += 10
    }

    function donaSeccion() {
      checkPage(100)
      sectionTitle('DISTRIBUCION TOTAL DE KM')

      const cx = M + 55, cy = y + 50, r = 40
      const total = distribucionTotal.pendientes + distribucionTotal.validados + distribucionTotal.rechazados
      const segmentos = [
        { val: distribucionTotal.validados,  color: C.green,  label: 'Validados' },
        { val: distribucionTotal.pendientes, color: C.red,    label: 'Pendientes' },
        { val: distribucionTotal.rechazados, color: C.gray,   label: 'Rechazados' },
      ].filter(s => s.val > 0)

      let startAngle = -Math.PI / 2
      segmentos.forEach(seg => {
        const slice = (seg.val / total) * 2 * Math.PI
        const endAngle = startAngle + slice
        // Dibuja arco como polígono aproximado
        const steps = Math.max(6, Math.round(slice * 20))
        const pts = [[cx, cy]]
        for (let s = 0; s <= steps; s++) {
          const a = startAngle + (slice * s / steps)
          pts.push([cx + Math.cos(a)*r, cy + Math.sin(a)*r])
        }
        setFill(seg.color)
        pdf.triangle(pts[0][0],pts[0][1], pts[1][0],pts[1][1], pts[2][0],pts[2][1],'F')
        for (let s = 2; s < pts.length-1; s++) {
          pdf.triangle(pts[0][0],pts[0][1], pts[s][0],pts[s][1], pts[s+1][0],pts[s+1][1],'F')
        }
        startAngle = endAngle
      })

      // Hueco central (dona)
      setFill(C.bg)
      pdf.circle(cx, cy, r*0.55, 'F')

      // Leyenda a la derecha
      let ly = y + 20
      segmentos.forEach(seg => {
        setFill(seg.color)
        rect(M+105, ly, 8, 8)
        setTxt(C.white)
        pdf.setFontSize(8)
        pdf.setFont('helvetica','normal')
        pdf.text(`${seg.label}: ${seg.val.toFixed(2)} km`, M+118, ly+7)
        ly += 16
      })

      y += 110
    }

    // ── PÁGINA 1: Portada + KPIs + Fichas por tipo ──────────────────────────
    bgPage()

    // Título
    setTxt(C.muted)
    pdf.setFontSize(8)
    pdf.setFont('helvetica','normal')
    pdf.text('REPORTE DE AVANCE POR KILOMETRAJE — COMPLETO', M, y)
    y += 12
    setTxt(C.muted)
    pdf.setFontSize(7)
    pdf.text(fechaStr, M, y)
    y += 20

    // KPIs generales
    const kpiW = (COL - 16) / 3
    kpiCard(M,              kpiW, 'KM TEORICOS TOTAL',       kpisGenerales.kmTotal.toFixed(2)+' km', C.orange)
    kpiCard(M+kpiW+8,       kpiW, 'PROYECTOS VALIDADOS',     String(kpisGenerales.procesados),       C.green)
    kpiCard(M+kpiW*2+16,    kpiW, 'EVALUACION GENERAL PROM.', kpisGenerales.evalProm !== null ? kpisGenerales.evalProm.toFixed(1)+'%' : '---', C.blue)
    y += 56

    // Fichas por tipo
    const tipoW = (COL - 16) / 3
    tipoCard(M,           tipoW, porTipo[0])
    tipoCard(M+tipoW+8,   tipoW, porTipo[1])
    tipoCard(M+tipoW*2+16,tipoW, porTipo[2])
    y += 82

    // Dona
    donaSeccion()

    // ── Rankings ─────────────────────────────────────────────────────────────
    const calcAgrupado = (keyFn, excluir) => {
      const grupos = {}
      uos.forEach(u => {
        const key = keyFn(u)
        if (excluir.includes(key)) return
        if (!grupos[key]) grupos[key] = { nombre: key, pendientes:0, validados:0, rechazados:0, total:0 }
        const km = u.km_teoricos || 0
        grupos[key].total += km
        if (u.estado === 'Validada' || u.estado === 'Cerrada') grupos[key].validados += km
        else if (u.estado === 'Rechazada') grupos[key].rechazados += km
        else grupos[key].pendientes += km
      })
      return Object.values(grupos)
        .filter(g => g.total > 0)
        .map(g => ({ ...g, pctAvance: g.total > 0 ? (g.validados/g.total)*100 : 0 }))
        .sort((a,b) => b.pctAvance - a.pctAvance)
    }

    const porEntidad     = calcAgrupado(u => u.entidad_federativa || 'Sin entidad',    ['Sin entidad'])
    const porTipoRanking = calcAgrupado(u => u.tipo_proyecto      || 'Sin clasificar', ['Sin clasificar'])
    const porDigit       = calcAgrupado(u => u.digitalizador?.nombre || 'Sin asignar', ['Sin asignar'])

    rankingSection(porEntidad,     'Ranking por Entidad Federativa')
    rankingSection(porTipoRanking, 'Ranking por Tipo de Proyecto')
    rankingSection(porDigit,       'Ranking por Digitalizador')

    pdf.save(`Reporte_KM_Completo_${new Date().toISOString().split('T')[0]}.pdf`)
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
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={exportarPDF}
            style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid var(--border2)', background:'none', color:'var(--muted2)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
            DESCARGAR PDF
          </button>
          <button onClick={exportarPDFCompleto}
            style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid rgba(249,115,22,0.3)', background:'rgba(249,115,22,0.08)', color:'var(--orange)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
            PDF COMPLETO
          </button>
        </div>
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
        <div style={{ fontSize:'16px', fontWeight:'700' }}>{t.proyectosValidados}<span style={{ fontSize:'10px', color:'var(--muted2)', fontWeight:'400' }}> / {t.totalUOs}</span></div>
      </div>
    </div>
    <div>
      <div style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)', marginBottom:'4px' }}>EVALUACION</div>
      <div style={{ fontSize:'16px', fontWeight:'700', color: t.evaluacion !== null && t.evaluacion >= UMBRAL_EVALUACION ? 'var(--green)' : 'var(--yellow)' }}>
        {t.evaluacion !== null ? t.evaluacion.toFixed(1)+'%' : '---'}
        <span style={{ fontSize:'9px', color:'var(--muted2)', fontWeight:'400' }}> (obj. &gt;{UMBRAL_EVALUACION}%)</span>
      </div>
    </div>
    <div style={{ marginTop:'10px', paddingTop:'8px', borderTop:'0.5px solid var(--border2)' }}>
      <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)' }}>
        Este mes: {crecimientoActiveLine.deltaKm >= 0 ? '+' : ''}{crecimientoActiveLine.deltaKm.toFixed(2)} km
        {crecimientoActiveLine.clientesMesActual > 0 && ` · ${crecimientoActiveLine.clientesMesActual} cliente(s) nuevo(s)`}
      </span>
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
