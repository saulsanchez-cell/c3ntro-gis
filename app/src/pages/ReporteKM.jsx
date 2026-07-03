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
        tipo, kmProcesados, kmObjetivo, pctObjetivo, kmFaltante,
        totalUOs: lista.length,
        proyectos: validadas.length,
        proyectosValidados: validadas.length,
        evaluacion: evaluacionPromedio(validadas),
      }
    })
  }, [uos, scorePorUO, metas])

  const distribucionTotal = useMemo(() => {
    const pendientes = uos.filter(u => !['Validada','Cerrada','Rechazada'].includes(u.estado)).reduce((s,u) => s + (u.km_teoricos||0), 0)
    const validados  = uos.filter(u => u.estado === 'Validada' || u.estado === 'Cerrada').reduce((s,u) => s + (u.km_teoricos||0), 0)
    const rechazados = uos.filter(u => u.estado === 'Rechazada').reduce((s,u) => s + (u.km_teoricos||0), 0)
    return { pendientes, validados, rechazados }
  }, [uos])

  const dataAgrupada = useMemo(() => {
    let keyFn
    if (agrupacion === 'entidad') keyFn = u => u.entidad_federativa || 'Sin entidad'
    else if (agrupacion === 'tipo') keyFn = u => u.tipo_proyecto || 'Sin clasificar'
    else keyFn = u => u.digitalizador?.nombre || 'Sin asignar'
    const grupos = {}
    uos.forEach(u => {
      const key = keyFn(u)
      if (['Sin entidad','Sin clasificar','Sin asignar'].includes(key)) return
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
  }, [uos, agrupacion])

  const donutData = [
    { name:'Pendientes', value: distribucionTotal.pendientes, color: COLOR_PENDIENTE },
    { name:'Validados',  value: distribucionTotal.validados,  color: COLOR_VALIDADO  },
    { name:'Rechazados', value: distribucionTotal.rechazados, color: COLOR_RECHAZADO },
  ].filter(d => d.value > 0)

  // ── PDF vista actual (html2canvas) ────────────────────────────────────────
  async function exportarPDF() {
    const html2canvas = (await import('html2canvas')).default
    const { jsPDF } = await import('jspdf')
    const el = document.getElementById('reporte-km-container')
    const canvas = await html2canvas(el, { scale:2, backgroundColor:'#0d1117', useCORS:true })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ unit:'pt', format:'letter', orientation:'portrait' })
    const pageWidth  = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 24
    const imgWidth  = pageWidth - margin*2
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight, position = margin
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
    heightLeft -= (pageHeight - margin*2)
    while (heightLeft > 0) {
      position = heightLeft - imgHeight + margin
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
      heightLeft -= (pageHeight - margin*2)
    }
    pdf.save(`Reporte_KM_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  // ── PDF completo (jsPDF puro, sin DOM) ────────────────────────────────────
  async function exportarPDFCompleto() {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ unit:'pt', format:'letter', orientation:'portrait' })
    const W = pdf.internal.pageSize.getWidth()
    const H = pdf.internal.pageSize.getHeight()
    const M = 36
    const COL = W - M*2
    const fechaStr = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' })

    const C = {
      bg:     [13,  17,  23],
      surface:[22,  27,  34],
      border: [48,  54,  61],
      orange: [249,115,  22],
      green:  [34, 197,  94],
      red:    [239, 68,  68],
      gray:   [156,163, 175],
      muted:  [110,118, 129],
      white:  [230,237, 243],
      yellow: [250,204,  21],
      blue:   [59, 130, 246],
    }

    const sf = rgb => pdf.setFillColor(...rgb)
    const st = rgb => pdf.setTextColor(...rgb)
    const sd = rgb => pdf.setDrawColor(...rgb)
    const r  = (x,y,w,h) => pdf.rect(x,y,w,h,'F')

    let y = M

    function bgPage() { sf(C.bg); r(0,0,W,H) }

    function checkPage(need=50) {
      if (y+need > H-M) { pdf.addPage(); bgPage(); y=M }
    }

    function divider(label) {
      checkPage(22)
      st(C.muted); pdf.setFontSize(7); pdf.setFont('helvetica','bold')
      pdf.text(label.toUpperCase(), M, y)
      y += 4; sf(C.border); r(M,y,COL,0.5); y += 10
    }

    function kpiCard(x, w, label, val, rgb) {
      sf(C.surface); sd(C.border)
      pdf.roundedRect(x,y,w,42,3,3,'FD')
      st(C.muted); pdf.setFontSize(6.5); pdf.setFont('helvetica','normal')
      pdf.text(label, x+8, y+12)
      st(rgb); pdf.setFontSize(17); pdf.setFont('helvetica','bold')
      pdf.text(String(val), x+8, y+32)
    }

    function tipoCard(x, w, t) {
      sf(C.surface); sd(C.border)
      pdf.roundedRect(x,y,w,90,3,3,'FD')
      // header
      sf(C.border); pdf.roundedRect(x,y,w,16,3,3,'F'); r(x,y+10,w,6)
      st(C.white); pdf.setFontSize(8); pdf.setFont('helvetica','bold')
      pdf.text(t.tipo, x+8, y+12)
      // km procesados
      st(C.muted); pdf.setFontSize(6); pdf.setFont('helvetica','normal')
      pdf.text('KM PROCESADOS', x+8, y+25)
      st(C.orange); pdf.setFontSize(11); pdf.setFont('helvetica','bold')
      pdf.text(t.kmProcesados.toFixed(2), x+8, y+36)
      if (t.kmObjetivo) {
        st(C.muted); pdf.setFontSize(7); pdf.setFont('helvetica','normal')
        pdf.text(`/ ${t.kmObjetivo} km`, x+8, y+45)
      }
      // proyectos
      const midX = x + w/2 + 4
      st(C.muted); pdf.setFontSize(6); pdf.setFont('helvetica','normal')
      pdf.text(t.tipo === 'Active Line' ? 'VALIDADOS / TOTAL' : 'PROYECTOS VALIDADOS', midX, y+25)
      st(C.white); pdf.setFontSize(11); pdf.setFont('helvetica','bold')
      const projTxt = t.tipo === 'Active Line'
        ? `${t.proyectosValidados} / ${t.totalUOs}`
        : String(t.proyectosValidados)
      pdf.text(projTxt, midX, y+36)
      // barra progreso
      if (t.kmObjetivo && t.pctObjetivo !== null) {
        sf(C.border); r(x+8,y+51,w-16,4)
        sf(C.orange);  r(x+8,y+51,Math.max(1,(w-16)*t.pctObjetivo/100),4)
        st(C.muted); pdf.setFontSize(6); pdf.setFont('helvetica','normal')
        pdf.text(`${t.pctObjetivo.toFixed(1)}% del objetivo  ·  Faltan ${t.kmFaltante.toFixed(2)} km`, x+8, y+61)
      }
      // evaluacion
      st(C.muted); pdf.setFontSize(6); pdf.setFont('helvetica','normal')
      pdf.text('EVALUACION', x+8, y+70)
      const ec = t.evaluacion !== null && t.evaluacion >= UMBRAL_EVALUACION ? C.green : C.yellow
      st(ec); pdf.setFontSize(9); pdf.setFont('helvetica','bold')
      pdf.text(t.evaluacion !== null ? t.evaluacion.toFixed(1)+'%' : '---', x+8, y+80)
      st(C.muted); pdf.setFontSize(6); pdf.setFont('helvetica','normal')
      pdf.text(`(obj. >${UMBRAL_EVALUACION}%)`, x+8+28, y+80)
    }

    function dona() {
      checkPage(80)
      divider('Distribucion total de KM')
      const cx = M+42, cy = y+35, rad = 28
      const tot = distribucionTotal.pendientes + distribucionTotal.validados + distribucionTotal.rechazados
      const segs = [
        { val: distribucionTotal.validados,  col: C.green, label:'Validados'  },
        { val: distribucionTotal.pendientes, col: C.red,   label:'Pendientes' },
        { val: distribucionTotal.rechazados, col: C.gray,  label:'Rechazados' },
      ].filter(s => s.val > 0)
      let ang = -Math.PI/2
      segs.forEach(seg => {
        const slice = (seg.val/tot)*2*Math.PI
        const steps = Math.max(8, Math.round(slice*24))
        const pts = [[cx,cy]]
        for (let i=0;i<=steps;i++) {
          const a = ang+(slice*i/steps)
          pts.push([cx+Math.cos(a)*rad, cy+Math.sin(a)*rad])
        }
        sf(seg.col)
        for (let i=1;i<pts.length-1;i++)
          pdf.triangle(pts[0][0],pts[0][1], pts[i][0],pts[i][1], pts[i+1][0],pts[i+1][1],'F')
        ang += slice
      })
      sf(C.bg); pdf.circle(cx,cy,rad*0.52,'F')
      // leyenda
      const lx = M+85
      let ly = y+16
      segs.forEach(seg => {
        sf(seg.col); r(lx,ly,7,7)
        st(C.white); pdf.setFontSize(8); pdf.setFont('helvetica','normal')
        pdf.text(`${seg.label}: ${seg.val.toFixed(2)} km`, lx+10, ly+6)
        ly += 14
      })
      y += 76
    }

    function ranking(datos, titulo) {
      checkPage(22); divider(titulo)
      // header
      sf(C.surface); r(M,y,COL,13)
      st(C.muted); pdf.setFontSize(6); pdf.setFont('helvetica','bold')
      pdf.text('#',          M+4,        y+9)
      pdf.text('NOMBRE',     M+18,       y+9)
      pdf.text('KM VALID.',  M+COL*0.54, y+9)
      pdf.text('KM TOTAL',   M+COL*0.67, y+9)
      pdf.text('% AVANCE',   M+COL*0.80, y+9)
      pdf.text('PROGRESO',   M+COL*0.89, y+9)
      y += 13
      datos.forEach((g,i) => {
        checkPage(12)
        if (i%2===0) { sf([18,23,30]); r(M,y,COL,11) }
        const pct = g.pctAvance
        const bc = pct>=90 ? C.green : pct>=50 ? C.yellow : C.red
        st(C.muted);  pdf.setFontSize(6.5); pdf.setFont('helvetica','normal')
        pdf.text(String(i+1),               M+4,        y+8)
        st(C.white);  pdf.text(g.nombre.substring(0,32), M+18, y+8)
        pdf.text(g.validados.toFixed(2),    M+COL*0.54, y+8)
        st(C.muted);  pdf.text(g.total.toFixed(2),       M+COL*0.67, y+8)
        st(bc); pdf.setFont('helvetica','bold')
        pdf.text(pct.toFixed(1)+'%',        M+COL*0.80, y+8)
        const bx=M+COL*0.89, bw=COL*0.10
        sf(C.border); r(bx,y+3,bw,5)
        sf(bc);       r(bx,y+3,Math.max(1,bw*pct/100),5)
        y += 11
      })
      y += 8
    }

    function calcGrupo(keyFn, excluir) {
      const g = {}
      uos.forEach(u => {
        const k = keyFn(u)
        if (excluir.includes(k)) return
        if (!g[k]) g[k] = { nombre:k, pendientes:0, validados:0, rechazados:0, total:0 }
        const km = u.km_teoricos||0
        g[k].total += km
        if (u.estado==='Validada'||u.estado==='Cerrada') g[k].validados += km
        else if (u.estado==='Rechazada') g[k].rechazados += km
        else g[k].pendientes += km
      })
      return Object.values(g)
        .filter(x=>x.total>0)
        .map(x=>({...x, pctAvance: x.total>0?(x.validados/x.total)*100:0}))
        .sort((a,b)=>b.pctAvance-a.pctAvance)
    }

    // ── Construir el PDF ──────────────────────────────────────────────────────
    bgPage()

    // Título
    st(C.muted); pdf.setFontSize(8); pdf.setFont('helvetica','normal')
    pdf.text('REPORTE DE AVANCE POR KILOMETRAJE — COMPLETO', M, y); y+=11
    pdf.setFontSize(7); pdf.text(fechaStr, M, y); y+=18

    // KPIs
    const kw = (COL-16)/3
    kpiCard(M,       kw, 'KM TEORICOS TOTAL',       kpisGenerales.kmTotal.toFixed(2)+' km', C.orange)
    kpiCard(M+kw+8,  kw, 'PROYECTOS VALIDADOS',     String(kpisGenerales.procesados),        C.green)
    kpiCard(M+kw*2+16,kw,'EVALUACION GENERAL PROM.',kpisGenerales.evalProm!==null?kpisGenerales.evalProm.toFixed(1)+'%':'---', C.blue)
    y += 50

    // Fichas por tipo
    const tw = (COL-16)/3
    tipoCard(M,        tw, porTipo[0])
    tipoCard(M+tw+8,   tw, porTipo[1])
    tipoCard(M+tw*2+16,tw, porTipo[2])
    y += 98

    // Dona
    dona()

    // Rankings
    ranking(calcGrupo(u=>u.entidad_federativa||'Sin entidad',    ['Sin entidad']),    'Ranking por Entidad Federativa')
    ranking(calcGrupo(u=>u.tipo_proyecto||'Sin clasificar',       ['Sin clasificar']), 'Ranking por Tipo de Proyecto')
    ranking(calcGrupo(u=>u.digitalizador?.nombre||'Sin asignar',  ['Sin asignar']),    'Ranking por Digitalizador')

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
          { label:'KM TEORICOS TOTAL',       val: kpisGenerales.kmTotal.toFixed(2)+' km', color:'var(--orange)' },
          { label:'PROYECTOS VALIDADOS',      val: kpisGenerales.procesados,               color:'var(--green)'  },
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
                <div style={{ marginTop:'8px', paddingTop:'8px', borderTop:'0.5px solid var(--border2)' }}>
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
                    <div style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)', marginBottom:'4px' }}>PROYECTOS VALIDADOS</div>
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
        {dataAgrupada.map((g,i) => (
          <div key={g.nombre} style={{ display:'grid', gridTemplateColumns:'40px 1.4fr 90px 90px 70px 1fr', padding:'9px 16px', borderBottom:'0.5px solid var(--border2)', alignItems:'center' }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{i+1}</span>
            <span style={{ fontSize:'11px' }}>{g.nombre}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'10px' }}>{g.validados.toFixed(2)}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>{g.total.toFixed(2)}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:'10px', fontWeight:'600', color: g.pctAvance>=90?'var(--green)':g.pctAvance>=50?'var(--yellow)':'var(--red)' }}>{g.pctAvance.toFixed(1)}%</span>
            <div style={{ height:'10px', background:'var(--border2)', borderRadius:'4px', overflow:'hidden' }}>
              <div style={{ height:'100%', width:g.pctAvance+'%', borderRadius:'4px', background: g.pctAvance>=90?'var(--green)':g.pctAvance>=50?'var(--yellow)':'var(--red)' }} />
            </div>
          </div>
        ))}
        {dataAgrupada.length===0 && <div style={{ padding:'20px 16px', fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin datos para mostrar</div>}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:'10px' }}>
        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'14px 16px' }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'10px' }}>KM POR {agrupacion==='entidad'?'ENTIDAD':agrupacion==='tipo'?'TIPO DE PROYECTO':'DIGITALIZADOR'}</div>
          <ResponsiveContainer width="100%" height={Math.max(240, dataAgrupada.length*32)}>
            <BarChart data={dataAgrupada} layout="vertical" margin={{ left:10, right:20 }}>
              <XAxis type="number" tick={{ fontSize:9, fill:'var(--muted2)' }} />
              <YAxis type="category" dataKey="nombre" width={110} tick={{ fontSize:9, fill:'var(--text)' }} />
              <Tooltip contentStyle={{ background:'#161b22', border:'0.5px solid #30363d', fontSize:'11px' }} />
              <Legend wrapperStyle={{ fontSize:'9px' }} />
              <Bar dataKey="pendientes" stackId="a" fill={COLOR_PENDIENTE} name="Pendientes" />
              <Bar dataKey="validados"  stackId="a" fill={COLOR_VALIDADO}  name="Validados"  />
              <Bar dataKey="rechazados" stackId="a" fill={COLOR_RECHAZADO} name="Rechazados" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background:'var(--surface)', border:'0.5px solid var(--border2)', borderRadius:'8px', padding:'14px 16px' }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'10px' }}>DISTRIBUCION TOTAL DE KM</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                {donutData.map((d,i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background:'#161b22', border:'0.5px solid #30363d', fontSize:'11px' }} formatter={v => v.toFixed(2)+' km'} />
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
