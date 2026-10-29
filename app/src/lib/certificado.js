import { jsPDF } from 'jspdf'

const COLORS = {
  orange: [249, 115, 22],
  green: [34, 197, 94],
  red: [239, 68, 68],
  yellow: [250, 204, 21],
  blue: [59, 130, 246],
  dark: [17, 17, 17],
  gray: [136, 136, 136],
  lightGray: [245, 245, 245],
  border: [220, 220, 220],
}

export function generarCertificado({ uo, resultado, respuestas, esperaResolucion }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 50
  const contentWidth = pageWidth - margin * 2
  let y = 50

  function setColor(rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]) }
  function setFill(rgb) { doc.setFillColor(rgb[0], rgb[1], rgb[2]) }
  function setDraw(rgb) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]) }

  // Header
  setFill(COLORS.dark)
  doc.circle(margin + 10, y, 10, 'F')
  setColor(COLORS.dark)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('C3NTRO TELECOM', margin + 28, y - 2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text('GIS Operations', margin + 28, y + 9)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(COLORS.dark)
  doc.text('Certificado de revision GIS', pageWidth - margin, y - 2, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text(`No. REV-${uo.referencia_operativa}-${String(resultado.no_revision_al_momento).padStart(3,'0')}`, pageWidth - margin, y + 9, { align: 'right' })

  y += 30
  setDraw(COLORS.border)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 20

// Datos UO
  setFill(COLORS.lightGray)
  doc.roundedRect(margin, y, contentWidth, 56, 4, 4, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setColor(COLORS.gray)
  doc.text('UNIDAD OPERATIVA', margin + 14, y + 14)

  const nombreMaxWidth = contentWidth * 0.48
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(COLORS.dark)
  const nombreLines = doc.splitTextToSize(uo.nombre, nombreMaxWidth)
  doc.text(nombreLines.slice(0, 2), margin + 14, y + 28)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setColor(COLORS.gray)
  doc.text(`REF · ${uo.referencia_operativa}`, margin + 14, y + 48)

  const col2x = margin + contentWidth * 0.56
  const fields2 = [
    ['Tipo', uo.tipo_proyecto || '---'],
    ['Metodo constructivo', uo.metodo_constructivo || '---'],
    ['Entidad', uo.entidad_federativa || '---'],
    ['KM teoricos', uo.km_teoricos ? uo.km_teoricos + ' km' : '---'],
  ]
  fields2.forEach((f, i) => {
    const fx = col2x + (i % 2) * (contentWidth * 0.22)
    const fy = y + 14 + Math.floor(i / 2) * 22
    doc.setFontSize(6.5)
    setColor(COLORS.gray)
    doc.text(f[0], fx, fy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    setColor(COLORS.dark)
    doc.text(String(f[1]), fx, fy + 10)
    doc.setFont('helvetica', 'normal')
  })

  y += 70

  // Score banner
  const scoreCards = [
    ['Calificacion', resultado.score_porcentaje.toFixed(1) + '%', resultado.score_porcentaje >= 97 ? COLORS.green : COLORS.red],
    ['Pts conformes', String(respuestas.reduce((s,r) => s + r.puntos_conformes, 0)), COLORS.dark],
    ['Pts esperados', String(respuestas.reduce((s,r) => s + r.puntos_esperados, 0)), COLORS.dark],
    ['No. revision', '#' + resultado.no_revision_al_momento, COLORS.dark],
  ]
  const cardW = contentWidth / 4 - 6
  scoreCards.forEach((c, i) => {
    const cx = margin + i * (cardW + 8)
    setFill(COLORS.lightGray)
    doc.roundedRect(cx, y, cardW, 50, 4, 4, 'F')
    doc.setFontSize(7)
    setColor(COLORS.gray)
    doc.text(c[0], cx + cardW/2, y + 16, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    setColor(c[2])
    doc.text(c[1], cx + cardW/2, y + 36, { align: 'center' })
    doc.setFont('helvetica', 'normal')
  })

  y += 65

  // Barra de progreso
  setDraw(COLORS.border)
  setFill([230,230,230])
  doc.roundedRect(margin, y, contentWidth - 60, 8, 4, 4, 'F')
  const pct = Math.min(100, resultado.score_porcentaje)
  setFill(resultado.score_porcentaje >= 97 ? COLORS.green : COLORS.red)
  doc.roundedRect(margin, y, (contentWidth - 60) * (pct/100), 8, 4, 4, 'F')
  doc.setFontSize(7)
  setColor(COLORS.gray)
  doc.text('min. 97%', pageWidth - margin, y + 7, { align: 'right' })

  y += 28

// Detalle por seccion
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(COLORS.dark)
  doc.text('DETALLE POR SECCION', margin, y)
  y += 12

  const secciones = [...new Set(respuestas.map(r => r.item?.seccion).filter(Boolean))]
  doc.setFontSize(6.5)

  secciones.forEach(seccion => {
    if (y > 740) { doc.addPage(); y = 50 }
    doc.setFont('helvetica', 'bold')
    setColor(COLORS.gray)
    doc.text(seccion.toUpperCase(), margin, y)
    y += 10

    const itemsSec = respuestas.filter(r => r.item?.seccion === seccion)
    itemsSec.forEach(r => {
      if (y > 755) { doc.addPage(); y = 50 }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      setColor(COLORS.dark)
      const nombre = (r.item?.nombre || '').substring(0, 62)
      doc.text(nombre, margin, y)
      doc.text(`x${r.item?.peso || ''}`, margin + 300, y, { align: 'right' })
      doc.text(String(r.puntos_esperados), margin + 345, y, { align: 'right' })
      doc.text(String(r.puntos_conformes), margin + 390, y, { align: 'right' })
      const cumplColor = r.cumplimiento_porcentaje >= 97 ? COLORS.green : r.cumplimiento_porcentaje >= 80 ? COLORS.yellow : COLORS.red
      setColor(cumplColor)
      doc.setFont('helvetica', 'bold')
      doc.text(r.cumplimiento_porcentaje.toFixed(0) + '%', margin + 440, y, { align: 'right' })
      y += 9.5
    })
    y += 4
  })

  y += 6
  if (y > 730) { doc.addPage(); y = 50 }

  // Equipo
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(COLORS.dark)
  doc.text('EQUIPO', margin, y)
  y += 13

  const equipo = [
    ['Digitalizador', uo.digitalizador?.nombre || '---'],
    ['Analista QA', uo.analista_qa?.nombre || '---'],
  ]
  equipo.forEach((e, i) => {
    const ex = margin + i * 200
    doc.setFontSize(6.5)
    setColor(COLORS.gray)
    doc.text(e[0], ex, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(COLORS.dark)
    doc.text(e[1], ex, y + 11)
    doc.setFont('helvetica', 'normal')
  })

  y += 28
  setDraw(COLORS.border)
  doc.line(margin, y, pageWidth - margin, y)
  y += 14

  doc.setFontSize(6.5)
  setColor(COLORS.gray)
  const fechaGen = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
  doc.text(`Generado el ${fechaGen} · Version checklist v1.0`, margin, y)

  const resultColor = resultado.resultado === 'Aprobado' ? COLORS.green : COLORS.red
  setFill(resultColor)
  const badgeText = resultado.resultado
  doc.roundedRect(pageWidth - margin - 80, y - 11, 80, 16, 4, 4, 'F')
  doc.setTextColor(255,255,255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text(badgeText, pageWidth - margin - 40, y - 1, { align: 'center' })

  doc.save(`Certificado_${uo.referencia_operativa}_Rev${resultado.no_revision_al_momento}.pdf`)
}
export function generarCertificadoConectividad({ uo, resultado }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 50
  const contentWidth = pageWidth - margin * 2
  let y = 50

  function setColor(rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]) }
  function setFill(rgb) { doc.setFillColor(rgb[0], rgb[1], rgb[2]) }
  function setDraw(rgb) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]) }

  // Header
  setFill(COLORS.dark)
  doc.circle(margin + 10, y, 10, 'F')
  setColor(COLORS.dark)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('C3NTRO TELECOM', margin + 28, y - 2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text('GIS Operations', margin + 28, y + 9)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(COLORS.dark)
  doc.text('Aviso de validacion GIS', pageWidth - margin, y - 2, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text('Para: Conectividad', pageWidth - margin, y + 9, { align: 'right' })

  y += 30
  setDraw(COLORS.border)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 24

  // Datos UO principales
  setFill(COLORS.lightGray)
  doc.roundedRect(margin, y, contentWidth, 70, 4, 4, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text('UNIDAD OPERATIVA', margin + 16, y + 18)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  setColor(COLORS.dark)
  doc.text(uo.nombre, margin + 16, y + 36)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setColor(COLORS.gray)
  doc.text(`REF · ${uo.referencia_operativa}`, margin + 16, y + 52)

  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text('ID BASECAMP', margin + 280, y + 18)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(COLORS.dark)
  doc.text(String(uo.id_basecamp || '---'), margin + 280, y + 32)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text('PROYECTO VETRO', margin + 280, y + 48)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setColor(COLORS.dark)
  const proyectoVetro = uo.proyecto_vetro || '---'
  doc.text(proyectoVetro.length > 35 ? proyectoVetro.substring(0,35)+'...' : proyectoVetro, margin + 280, y + 60)

  y += 90

  // Resultado destacado
  const resultColor = resultado.resultado === 'Aprobado' ? COLORS.green : COLORS.red
  setFill(resultColor[0] === 34 ? [34,197,94,0.08] : COLORS.lightGray)
  doc.setFillColor(resultColor[0], resultColor[1], resultColor[2])
  doc.roundedRect(margin, y, contentWidth, 36, 6, 6, 'F')
  doc.setTextColor(255,255,255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(resultado.resultado === 'Aprobado' ? 'VALIDACION APROBADA' : 'VALIDACION RECHAZADA', pageWidth/2, y + 23, { align: 'center' })

  y += 56

  // Fechas y responsables
  const rows = [
    ['Fecha de carga', uo.fecha_carga_final || '---'],
    ['Fecha de validacion', resultado.fecha_revision || '---'],
    ['Cargado por', uo.digitalizador?.nombre || '---'],
    ['Revisado por', uo.analista_qa?.nombre || '---'],
    ['Metodo constructivo', uo.metodo_constructivo || '---'],
  ]
  rows.forEach(r => {
    setDraw(COLORS.border)
    doc.line(margin, y, pageWidth - margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setColor(COLORS.gray)
    doc.text(r[0], margin, y + 16)
    doc.setFont('helvetica', 'bold')
    setColor(COLORS.dark)
    doc.text(String(r[1]), pageWidth - margin, y + 16, { align: 'right' })
    y += 28
  })

  setDraw(COLORS.border)
  doc.line(margin, y, pageWidth - margin, y)
  y += 30

  doc.setFontSize(7)
  setColor(COLORS.gray)
  const fechaGen = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
  doc.text(`Generado el ${fechaGen} · Version checklist v1.0`, margin, y)

  doc.save(`Aviso_Conectividad_${uo.referencia_operativa}.pdf`)
}
export function generarPDFAsignacion({ uo }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 50
  const contentWidth = pageWidth - margin * 2
  let y = 50

  function setColor(rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]) }
  function setFill(rgb) { doc.setFillColor(rgb[0], rgb[1], rgb[2]) }
  function setDraw(rgb) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]) }

  // Header
  setFill(COLORS.dark)
  doc.circle(margin + 10, y, 10, 'F')
  setColor(COLORS.dark)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('C3NTRO TELECOM', margin + 28, y - 2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text('GIS Operations', margin + 28, y + 9)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(COLORS.dark)
  doc.text('Orden de asignacion', pageWidth - margin, y - 2, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text(`REF · ${uo.referencia_operativa}`, pageWidth - margin, y + 9, { align: 'right' })

  y += 30
  setDraw(COLORS.border)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 24

  // Datos UO
  setFill(COLORS.lightGray)
  doc.roundedRect(margin, y, contentWidth, 56, 4, 4, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setColor(COLORS.gray)
  doc.text('UNIDAD OPERATIVA', margin + 14, y + 14)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  setColor(COLORS.dark)
  doc.text(uo.nombre, margin + 14, y + 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setColor(COLORS.gray)
  doc.text(`${uo.tipo_proyecto || '---'} · ${uo.metodo_constructivo || 'Metodo sin definir'}`, margin + 14, y + 46)

  const col2x = margin + contentWidth * 0.62
  doc.setFontSize(7)
  setColor(COLORS.gray)
  doc.text('PRIORIDAD', col2x, y + 14)
  const prioColor = uo.prioridad === 'P1' ? COLORS.red : uo.prioridad === 'P2' ? COLORS.yellow : COLORS.gray
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  setColor(prioColor)
  doc.text(uo.prioridad || '---', col2x, y + 30)

  y += 76

  // Fechas clave
  const fechas = [
    ['Fecha de asignacion', uo.fecha_asignacion || '---'],
    ['Fecha de entrega programada', uo.fecha_entrega_programada || 'Sin definir'],
  ]
  const fw = contentWidth / 2 - 6
  fechas.forEach((f, i) => {
    const fx = margin + i * (fw + 12)
    setFill(COLORS.lightGray)
    doc.roundedRect(fx, y, fw, 46, 4, 4, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setColor(COLORS.gray)
    doc.text(f[0].toUpperCase(), fx + 12, y + 16)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    setColor(f[1] === '---' || f[1] === 'Sin definir' ? COLORS.gray : COLORS.dark)
    doc.text(String(f[1]), fx + 12, y + 34)
  })

  y += 66

  // Responsable
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(COLORS.dark)
  doc.text('RESPONSABLE ASIGNADO', margin, y)
  y += 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setColor(COLORS.dark)
  doc.text(uo.digitalizador?.nombre || 'Sin asignar', margin, y)

  y += 30
  setDraw(COLORS.border)
  doc.line(margin, y, pageWidth - margin, y)
  y += 20

  // Link de archivos
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(COLORS.dark)
  doc.text('INSUMOS Y HERRAMIENTAS', margin, y)
  y += 16
  if (uo.link_archivos) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setColor(COLORS.blue)
    doc.textWithLink(uo.link_archivos, margin, y, { url: uo.link_archivos })
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setColor(COLORS.gray)
    doc.text('Sin link de archivos registrado', margin, y)
  }
  y += 26

  // Comentario de asignacion
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(COLORS.dark)
  doc.text('COMENTARIO DE ASIGNACION', margin, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setColor(COLORS.dark)
  const obsLines = doc.splitTextToSize(uo.observaciones || 'Sin comentarios adicionales.', contentWidth)
  doc.text(obsLines, margin, y)
  y += obsLines.length * 12 + 20

  setDraw(COLORS.border)
  doc.line(margin, y, pageWidth - margin, y)
  y += 14

  doc.setFontSize(6.5)
  setColor(COLORS.gray)
  const fechaGen = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
  doc.text(`Generado el ${fechaGen}`, margin, y)

  doc.save(`Asignacion_${uo.referencia_operativa}.pdf`)
}

export function generarBitacoraUO({ uo, historial }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 50
  const contentWidth = pageWidth - margin * 2
  let y = 50

  function setColor(rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]) }
  function setFill(rgb) { doc.setFillColor(rgb[0], rgb[1], rgb[2]) }
  function setDraw(rgb) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]) }

  setFill(COLORS.dark)
  doc.circle(margin + 10, y, 10, 'F')
  setColor(COLORS.dark)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('C3NTRO TELECOM', margin + 28, y - 2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text('GIS Operations', margin + 28, y + 9)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(COLORS.dark)
  doc.text('Bitacora de estados', pageWidth - margin, y - 2, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text(`REF · ${uo.referencia_operativa}`, pageWidth - margin, y + 9, { align: 'right' })

  y += 30
  setDraw(COLORS.border)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 20

  setFill(COLORS.lightGray)
  doc.roundedRect(margin, y, contentWidth, 32, 4, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(COLORS.dark)
  doc.text(uo.nombre, margin + 14, y + 20)
  y += 48

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(COLORS.dark)
  doc.text('HISTORIAL COMPLETO', margin, y)
  y += 16

  const ordenado = [...(historial || [])].sort((a,b) => new Date(a.created_at) - new Date(b.created_at))

  if (ordenado.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setColor(COLORS.gray)
    doc.text('Sin cambios de estado registrados.', margin, y)
  }

  ordenado.forEach((h) => {
    if (y > 700) { doc.addPage(); y = 50 }
    const ETIQUETA_EVENTO = { 'Carga completa': 'Entrega reportada' }
    const etiquetaEvento = ETIQUETA_EVENTO[h.estado_nuevo] || h.estado_nuevo

    setFill(COLORS.lightGray)
    doc.roundedRect(margin, y, contentWidth, 6, 3, 3, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    setColor(COLORS.dark)
    doc.text(etiquetaEvento, margin, y + 16)

    const fechaH = new Date(h.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
    const horaH = new Date(h.created_at).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setColor(COLORS.gray)
    doc.text(`${fechaH} · ${horaH} · ${h.usuario?.nombre || 'Usuario'}`, pageWidth - margin, y + 16, { align: 'right' })

    y += 22

    if (h.motivo_texto) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      setColor(COLORS.dark)
      const motivoLines = doc.splitTextToSize(`"${h.motivo_texto}"`, contentWidth - 10)
      doc.text(motivoLines, margin + 10, y)
      y += motivoLines.length * 10 + 6
    }
    if (h.categoria_error) {
      setFill(COLORS.orange)
      const catW = doc.getTextWidth(h.categoria_error) + 12
      doc.roundedRect(margin + 10, y - 2, catW, 12, 3, 3, 'F')
      doc.setTextColor(255,255,255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      doc.text(h.categoria_error, margin + 16, y + 6)
      y += 18
    }

    setDraw(COLORS.border)
    doc.line(margin, y, pageWidth - margin, y)
    y += 14
  })

  if (y > 730) { doc.addPage(); y = 50 }
  doc.setFontSize(6.5)
  setColor(COLORS.gray)
  const fechaGen = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
  doc.text(`Generado el ${fechaGen} · ${ordenado.length} evento(s) registrado(s)`, margin, y)

  doc.save(`Bitacora_${uo.referencia_operativa}.pdf`)
}

export function generarPDFEvaluacion({ persona, ev, desde, hasta }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 50
  const contentWidth = pageWidth - margin * 2
  let y = 50

  function setColor(rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]) }
  function setFill(rgb) { doc.setFillColor(rgb[0], rgb[1], rgb[2]) }
  function setDraw(rgb) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]) }

  setFill(COLORS.dark)
  doc.circle(margin + 10, y, 10, 'F')
  setColor(COLORS.dark)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('C3NTRO TELECOM', margin + 28, y - 2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text('GIS Operations', margin + 28, y + 9)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(COLORS.dark)
  doc.text('Evaluacion de desempeño', pageWidth - margin, y - 2, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text(`${desde} a ${hasta}`, pageWidth - margin, y + 9, { align: 'right' })

  y += 30
  setDraw(COLORS.border)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 24

  setFill(COLORS.lightGray)
  doc.roundedRect(margin, y, contentWidth, 42, 4, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setColor(COLORS.dark)
  doc.text(persona.nombre, margin + 14, y + 24)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text((persona.rol || '').replace('_', ' ').toUpperCase(), pageWidth - margin - 14, y + 24, { align: 'right' })
  y += 62

  function kpiRow(titulo, items) {
    if (titulo) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      setColor(COLORS.dark)
      doc.text(titulo, margin, y)
      y += 12
    }
    const w = (contentWidth - (items.length - 1) * 8) / items.length
    items.forEach((it, i) => {
      const x = margin + i * (w + 8)
      setFill(COLORS.lightGray)
      doc.roundedRect(x, y, w, 44, 4, 4, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      setColor(COLORS.gray)
      const labelLines = doc.splitTextToSize(it.label, w - 12)
      doc.text(labelLines, x + 8, y + 14)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      setColor(it.color || COLORS.dark)
      doc.text(String(it.val), x + 8, y + 34)
    })
    y += 58
  }

  kpiRow('COMO DIGITALIZADOR', [
    { label: 'UOs asignadas', val: ev.uos_como_digitalizador },
    { label: 'Cargas completas', val: ev.uos_cargadas_completas },
    { label: 'Dias proceso prom.', val: ev.dias_proceso_promedio },
    { label: 'Prom. no revision', val: ev.promedio_no_revision },
  ])

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor(COLORS.dark)
  doc.text('RUTA CRITICA (PROGRAMADA VS. REAL)', margin, y)
  y += 12

  if (ev.ruta_critica.length === 0) {
    setFill(COLORS.lightGray)
    doc.roundedRect(margin, y, contentWidth, 30, 4, 4, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setColor(COLORS.gray)
    doc.text('Sin UOs con fecha programada y fecha real en este periodo.', margin + 12, y + 19)
    y += 44
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setColor(COLORS.gray)
    doc.text(`A tiempo: ${ev.ruta_critica_pct_a_tiempo.toFixed(0)}%   ·   Desviacion promedio: ${ev.ruta_critica_desviacion_prom > 0 ? '+' : ''}${ev.ruta_critica_desviacion_prom.toFixed(1)} dias`, margin, y)
    y += 14

    const chartH = 80, chartW = contentWidth, chartX = margin, chartY = y
    const zeroY = chartY + chartH / 2
    const n = ev.ruta_critica.length
    const stepX = n > 0 ? chartW / n : chartW
    const maxDev = Math.max(1, ...ev.ruta_critica.map(r => Math.abs(r.desviacionDias)))
    const halfH = chartH / 2 - 6
    const xFor = i => chartX + stepX * i + stepX / 2
    const yFor = dev => zeroY - (dev / maxDev) * halfH

    setDraw(COLORS.yellow); doc.setLineWidth(1.2); doc.setLineDashPattern([2, 2], 0)
    doc.line(chartX, zeroY, chartX + chartW, zeroY)
    doc.setLineDashPattern([], 0)

    setDraw(COLORS.gray); doc.setLineWidth(0.8)
    for (let i = 0; i < n - 1; i++) doc.line(xFor(i), yFor(ev.ruta_critica[i].desviacionDias), xFor(i + 1), yFor(ev.ruta_critica[i + 1].desviacionDias))

    ev.ruta_critica.forEach((r, i) => {
      setFill(r.aTiempo ? COLORS.green : COLORS.red)
      doc.circle(xFor(i), yFor(r.desviacionDias), 2, 'F')
    })

    doc.setFontSize(5)
    setColor(COLORS.gray)
    ev.ruta_critica.forEach((r, i) => {
      doc.text(String(r.referencia ?? '---'), xFor(i), zeroY + halfH + 10, { angle: -90 })
    })

    y = zeroY + halfH + 30
  }

  kpiRow('COMO ANALISTA QA', [
    { label: 'UOs revisadas', val: ev.uos_como_qa },
    { label: 'Tasa aprobacion', val: ev.tasa_aprobacion },
    { label: 'Score checklist prom.', val: ev.score_checklist_promedio },
  ])
  kpiRow('', [
    { label: 'Validadas', val: ev.validadas, color: COLORS.green },
    { label: 'Rechazadas', val: ev.rechazadas, color: COLORS.red },
    { label: 'En correccion', val: ev.en_correccion, color: COLORS.blue },
  ])

  if (ev.uos_sla_vencido !== null && ev.uos_sla_vencido > 0) {
    setFill([254, 242, 242])
    doc.roundedRect(margin, y, contentWidth, 24, 4, 4, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    setColor(COLORS.red)
    doc.text(`${ev.uos_sla_vencido} UO(s) con SLA vencido actualmente`, margin + 10, y + 16)
    y += 34
  }

  setDraw(COLORS.border)
  doc.line(margin, y, pageWidth - margin, y)
  y += 14
  doc.setFontSize(6.5)
  setColor(COLORS.gray)
  const fechaGen = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
  doc.text(`Generado el ${fechaGen}`, margin, y)

  doc.save(`Evaluacion_${persona.nombre.replace(/\s+/g,'_')}_${desde}_${hasta}.pdf`)
}

// Plan semanal (carta horizontal). Recibe los datos ya calculados por
// PlanSemanal.jsx (mismas cifras que la pantalla); aquí solo se dibuja.
export function generarPDFPlanSemanal({ semana, lunes, dias, kpis, plan, atrasos, carga, dondeAsignar }) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 36
  const contentWidth = pageWidth - margin * 2
  const bottom = pageHeight - 34
  const VIOLET = [139, 92, 246]
  const TONOS = { green: COLORS.green, orange: COLORS.orange, red: COLORS.red, blue: COLORS.blue, muted: COLORS.gray, dark: COLORS.dark }
  let y = 40

  function setColor(rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]) }
  function setFill(rgb) { doc.setFillColor(rgb[0], rgb[1], rgb[2]) }
  function setDraw(rgb) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]) }
  // Las fuentes estándar de jsPDF solo cubren Latin-1
  function limpiar(t) { return String(t ?? '').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\xFF]/g, '') }
  function texto(t, x, yy, opts) { doc.text(limpiar(t), x, yy, opts) }
  function recortar(t, maxW) {
    let s = limpiar(t)
    if (doc.getTextWidth(s) <= maxW) return s
    while (s.length > 0 && doc.getTextWidth(s + '...') > maxW) s = s.slice(0, -1)
    return s + '...'
  }
  function fuente(estilo, tam, rgb) { doc.setFont('helvetica', estilo); doc.setFontSize(tam); setColor(rgb) }

  function encabezado() {
    y = 40
    setFill(COLORS.dark)
    doc.circle(margin + 10, y, 10, 'F')
    fuente('bold', 13, COLORS.dark)
    doc.text('C3NTRO TELECOM', margin + 28, y - 2)
    fuente('normal', 8, COLORS.gray)
    doc.text('GIS Operations', margin + 28, y + 9)
    fuente('bold', 11, COLORS.dark)
    doc.text('Plan semanal', pageWidth - margin, y - 2, { align: 'right' })
    fuente('normal', 8, COLORS.gray)
    texto(semana, pageWidth - margin, y + 9, { align: 'right' })
    y += 24
    setDraw(COLORS.border)
    doc.setLineWidth(0.5)
    doc.line(margin, y, pageWidth - margin, y)
    y += 16
  }
  function nuevaPagina() { doc.addPage(); encabezado() }
  function asegurar(alto, alSaltar) {
    if (y + alto > bottom) { nuevaPagina(); if (alSaltar) alSaltar() }
  }
  function titulo(t) {
    asegurar(30)
    fuente('bold', 8, COLORS.dark)
    texto(t, margin, y)
    y += 8
  }
  function barra(x, yy, w, valor, total, rgb) {
    setFill(COLORS.border)
    doc.rect(x, yy, w, 3, 'F')
    const pct = total > 0 ? Math.min(1, valor / total) : (valor > 0 ? 1 : 0)
    if (pct > 0) { setFill(rgb); doc.rect(x, yy, w * pct, 3, 'F') }
  }

  // Columnas de las tablas por integrante: persona, LUN a VIE, semana
  const colPersona = 96, colSemana = 82
  const colDia = (contentWidth - colPersona - colSemana) / 5
  const xDia = i => margin + colPersona + i * colDia
  const xSemana = margin + colPersona + 5 * colDia

  function encabezadoTabla() {
    setFill(COLORS.lightGray)
    doc.rect(margin, y, contentWidth, 24, 'F')
    fuente('bold', 6.5, COLORS.gray)
    doc.text('INTEGRANTE', margin + 6, y + 10)
    dias.forEach((d, i) => {
      fuente('bold', 6.5, d.esHoy ? COLORS.orange : COLORS.gray)
      texto(d.etiqueta + (d.esHoy ? '  HOY' : ''), xDia(i) + 6, y + 10)
      if (d.nota) { fuente('normal', 6, COLORS.gray); texto(d.nota, xDia(i) + 6, y + 19) }
    })
    fuente('bold', 6.5, COLORS.gray)
    doc.text('SEMANA', xSemana + 6, y + 10)
    y += 24
  }
  function lineasFila(alto) {
    setDraw(COLORS.border)
    doc.setLineWidth(0.5)
    for (let i = 0; i < 5; i++) doc.line(xDia(i), y, xDia(i), y + alto)
    doc.line(xSemana, y, xSemana, y + alto)
    doc.line(margin, y + alto, pageWidth - margin, y + alto)
  }
  function nombrePersona(nombre) {
    fuente('bold', 7, COLORS.dark)
    doc.text(doc.splitTextToSize(limpiar(nombre), colPersona - 12).slice(0, 3), margin + 6, y + 11)
  }

  // ── Página 1: KPIs, plan, leyenda y atrasos ──────────────────────────────
  encabezado()
  const fechaGen = new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  fuente('normal', 7, COLORS.gray)
  texto(`Generado el ${fechaGen} (hora de Mexico)`, margin, y)
  y += 12

  if (kpis) {
    const w = (contentWidth - (kpis.length - 1) * 8) / kpis.length
    kpis.forEach((k, i) => {
      const x = margin + i * (w + 8)
      setFill(COLORS.lightGray)
      doc.roundedRect(x, y, w, 44, 4, 4, 'F')
      fuente('normal', 6.5, COLORS.gray)
      doc.text(k.label, x + 8, y + 12)
      fuente('bold', 14, TONOS[k.tono] || COLORS.dark)
      texto(k.val, x + 8, y + 29)
      fuente('normal', 6, COLORS.gray)
      texto(k.sub, x + 8, y + 39)
    })
    y += 56
  }

  const CARD_H = 30, GAP = 3, MAX_CARRILES = 4

  function tarjeta(it, x, w, cy) {
    if (it.tipo !== 'uo') {
      setDraw(COLORS.gray)
      doc.setLineWidth(0.6)
      doc.setLineDashPattern([2, 2], 0)
      doc.roundedRect(x, cy, w, CARD_H, 2, 2, 'S')
      doc.setLineDashPattern([], 0)
      fuente('bold', 6.5, COLORS.gray)
      texto(recortar(it.referencia, w - 8), x + 4, cy + 9)
      fuente('normal', 6.5, COLORS.gray)
      texto(recortar(it.nombre, w - 8), x + 4, cy + 18)
      return
    }
    setFill([252, 252, 252])
    setDraw(COLORS.border)
    doc.setLineWidth(0.5)
    doc.roundedRect(x, cy, w, CARD_H, 2, 2, 'FD')
    setFill(TONOS[it.tono] || COLORS.orange)
    doc.rect(x, cy, 2, CARD_H, 'F')

    fuente('bold', 6.5, COLORS.orange)
    const ref = recortar(it.referencia, w - 40)
    const anchoRef = doc.getTextWidth(ref)  // medir con la fuente de la referencia
    doc.text(ref, x + 5, cy + 8)
    fuente('normal', 6, COLORS.gray)
    doc.text(limpiar(it.km), x + 5 + anchoRef + 4, cy + 8)

    fuente('normal', 6.5, COLORS.dark)
    doc.text(recortar(it.nombre, w - 9), x + 5, cy + 17)

    // 4 cuadritos: hecha (palomita), atrasada (!), pendiente (vacío)
    const s = 7, sy = cy + 20
    it.estados.forEach((e, i) => {
      const sx = x + 5 + i * (s + 2)
      doc.setLineWidth(0.5)
      if (e === 'hecha') {
        setFill([220, 252, 231]); setDraw(COLORS.green)
        doc.rect(sx, sy, s, s, 'FD')
        doc.setLineWidth(0.9)
        doc.line(sx + 1.5, sy + 3.8, sx + 3, sy + 5.3)
        doc.line(sx + 3, sy + 5.3, sx + 5.7, sy + 1.8)
      } else if (e === 'atrasada') {
        setFill([254, 226, 226]); setDraw(COLORS.red)
        doc.rect(sx, sy, s, s, 'FD')
        fuente('bold', 6, COLORS.red)
        doc.text('!', sx + s / 2, sy + 5.6, { align: 'center' })
      } else {
        setDraw(COLORS.border)
        doc.rect(sx, sy, s, s, 'S')
      }
    })
    let xr = x + 5 + 4 * (s + 2) + 2
    if (it.ajustada) {
      fuente('bold', 6, VIOLET)
      doc.text('aj', xr, sy + 5.6)
      xr += doc.getTextWidth('aj') + 4
    }
    if (it.entrega) {
      fuente('bold', 5.5, COLORS.red)
      doc.text(recortar(it.entrega, x + w - 3 - xr), x + w - 3, sy + 5.6, { align: 'right' })
    }
  }

  if (!plan && !carga) {
    fuente('normal', 8, COLORS.gray)
    doc.text('No se pudieron leer los datos del plan para esta semana.', margin, y + 6)
  }

  if (plan) {
    titulo('PLAN DE ACTIVIDADES')
    asegurar(24 + CARD_H + 10)
    encabezadoTabla()
    if (plan.length === 0) {
      fuente('normal', 7, COLORS.gray)
      doc.text('Sin integrantes activos en plan_integrantes.', margin + 6, y + 12)
      y += 20
    }
    for (const fila of plan) {
      // Carriles según las tarjetas mismas (no depende de que fila.carriles venga bien)
      const usados = Math.max(fila.carriles || 1, ...fila.items.map(it => it.carril + 1))
      const carriles = Math.max(1, Math.min(usados, MAX_CARRILES))
      const ocultos = [0, 1, 2, 3, 4].map(i =>
        fila.items.filter(it => it.carril >= MAX_CARRILES && it.ini <= i && i <= it.fin).length)
      const hayMas = ocultos.some(n => n > 0)
      const alto = Math.max(carriles * (CARD_H + GAP) + GAP + (hayMas ? 9 : 0), 40)
      asegurar(alto, encabezadoTabla)
      lineasFila(alto)
      nombrePersona(fila.nombre)

      for (const it of fila.items) {
        if (it.carril >= MAX_CARRILES) continue
        tarjeta(it, xDia(it.ini) + 3, (it.fin - it.ini + 1) * colDia - 6, y + GAP + it.carril * (CARD_H + GAP))
      }
      ocultos.forEach((n, i) => {
        if (n > 0) { fuente('bold', 6, COLORS.gray); doc.text(`+${n} mas`, xDia(i) + 5, y + alto - 3) }
      })

      fuente('bold', 10, COLORS.dark)
      doc.text(`${fila.hechas} / ${fila.planeadas}`, xSemana + 6, y + 13)
      barra(xSemana + 6, y + 18, colSemana - 14, fila.hechas, fila.planeadas, COLORS.green)
      fuente('normal', 6.5, fila.atrasadas > 0 ? COLORS.red : COLORS.gray)
      doc.text(`${fila.atrasadas} atrasada${fila.atrasadas === 1 ? '' : 's'}`, xSemana + 6, y + 30)
      y += alto
    }
    y += 10

    // Leyenda
    asegurar(16)
    fuente('normal', 6.5, COLORS.gray)
    let xl = margin
    const muestra = (estado, etiqueta) => {
      const s = 7
      doc.setLineWidth(0.5)
      if (estado === 'hecha') {
        setFill([220, 252, 231]); setDraw(COLORS.green); doc.rect(xl, y - 6, s, s, 'FD')
        doc.setLineWidth(0.9); doc.line(xl + 1.5, y - 2.2, xl + 3, y - 0.7); doc.line(xl + 3, y - 0.7, xl + 5.7, y - 4.2)
      } else if (estado === 'atrasada') {
        setFill([254, 226, 226]); setDraw(COLORS.red); doc.rect(xl, y - 6, s, s, 'FD')
        fuente('bold', 6, COLORS.red); doc.text('!', xl + s / 2, y - 0.4, { align: 'center' })
      } else {
        setDraw(COLORS.border); doc.rect(xl, y - 6, s, s, 'S')
      }
      fuente('normal', 6.5, COLORS.gray)
      doc.text(etiqueta, xl + s + 4, y)
      xl += s + 4 + doc.getTextWidth(etiqueta) + 14
    }
    fuente('bold', 6.5, COLORS.dark)
    doc.text('LEYENDA', xl, y)
    xl += doc.getTextWidth('LEYENDA') + 10
    muestra('hecha', 'Hecha')
    muestra('atrasada', 'Atrasada')
    muestra('pendiente', 'Pendiente')
    const notas = [
      'Cuadritos en orden: insumos, preparacion (Vertex), carga en Vetro, pulido en Vetro',
      'aj = fecha ajustada a mano',
      'ENTREGA dd/mm = la ultima actividad cae despues de la entrega programada',
      'Punteada = validacion',
    ]
    fuente('normal', 6.5, COLORS.gray)
    for (const n of notas) {
      const w = doc.getTextWidth(n)
      if (xl + w > pageWidth - margin) { y += 10; xl = margin }
      if (n.startsWith('aj')) { fuente('bold', 6.5, VIOLET); doc.text('aj', xl, y); fuente('normal', 6.5, COLORS.gray); doc.text(n.slice(2), xl + doc.getTextWidth('aj'), y) }
      else doc.text(n, xl, y)
      xl += w + 14
    }
    y += 18
  }

  if (atrasos) {
    const cols = [
      { t: 'PERSONA', w: 110, k: 'persona' },
      { t: 'UO', w: 80, k: 'referencia' },
      { t: 'PROYECTO', w: 200, k: 'proyecto' },
      { t: 'ACTIVIDAD', w: 165, k: 'actividad' },
      { t: 'FECHA PROGRAMADA', w: 90, k: 'fecha' },
      { t: 'DIAS DE ATRASO', w: contentWidth - 645, k: 'dias' },
    ]
    const encabezadoAtrasos = () => {
      setFill(COLORS.lightGray)
      doc.rect(margin, y, contentWidth, 16, 'F')
      fuente('bold', 6.5, COLORS.gray)
      let x = margin
      for (const c of cols) { doc.text(c.t, x + 6, y + 10.5); x += c.w }
      y += 16
    }
    titulo(`ATRASOS A REVISAR · ${atrasos.length}`)
    asegurar(16 + 14)
    encabezadoAtrasos()
    if (atrasos.length === 0) {
      fuente('normal', 7, COLORS.gray)
      doc.text('Sin atrasos.', margin + 6, y + 10)
      y += 16
    }
    for (const a of atrasos) {
      asegurar(14, encabezadoAtrasos)
      let x = margin
      for (const c of cols) {
        if (c.k === 'referencia') fuente('bold', 7, COLORS.orange)
        else if (c.k === 'dias') fuente('bold', 7, COLORS.red)
        else fuente('normal', 7, COLORS.dark)
        doc.text(recortar(a[c.k], c.w - 10), x + 6, y + 9.5)
        x += c.w
      }
      setDraw(COLORS.border)
      doc.setLineWidth(0.5)
      doc.line(margin, y + 14, pageWidth - margin, y + 14)
      y += 14
    }
  }

  // ── Página 2: carga de trabajo ───────────────────────────────────────────
  if (carga) {
    nuevaPagina()
    titulo('CARGA DE TRABAJO (JORNADAS CONTRA CAPACIDAD)')
    encabezadoTabla()
    if (carga.length === 0) {
      fuente('normal', 7, COLORS.gray)
      doc.text('Sin integrantes activos en plan_integrantes.', margin + 6, y + 12)
      y += 20
    }
    const ALTO = 46
    for (const fila of carga) {
      asegurar(ALTO, encabezadoTabla)
      lineasFila(ALTO)
      nombrePersona(fila.nombre)
      fila.celdas.forEach((c, i) => {
        const x = xDia(i) + 6, w = colDia - 12
        fuente('bold', 8, COLORS.dark)
        texto(c.texto, x, y + 11)
        barra(x, y + 15, w, c.j, c.cap, TONOS[c.tono] || COLORS.gray)
        fuente('bold', 6.5, TONOS[c.tono] || COLORS.gray)
        texto(c.estado, x, y + 26)
        if (c.refs.length > 0) {
          fuente('normal', 5.5, COLORS.orange)
          doc.text(doc.splitTextToSize(limpiar(c.refs.join(' · ')), w).slice(0, 2), x, y + 34)
        }
      })
      const t = fila.total
      fuente('bold', 8, COLORS.dark)
      texto(t.texto, xSemana + 6, y + 11)
      barra(xSemana + 6, y + 15, colSemana - 14, t.j, t.cap, TONOS[t.tono] || COLORS.gray)
      fuente('bold', 6.5, COLORS.green)
      texto(t.libre, xSemana + 6, y + 26)
      if (t.sobrecarga) { fuente('bold', 6.5, COLORS.red); texto(t.sobrecarga, xSemana + 6, y + 35) }
      y += ALTO
    }
    y += 14

    if (dondeAsignar) {
      titulo('DONDE ASIGNAR MAS TRABAJO')
      y += 2
      for (const d of dondeAsignar) {
        asegurar(18)
        setFill(COLORS.lightGray)
        doc.roundedRect(margin, y, contentWidth, 16, 3, 3, 'F')
        fuente('bold', 7, COLORS.dark)
        texto(recortar(d.nombre, 150), margin + 8, y + 10.5)
        fuente('bold', 7, d.tieneLibre ? COLORS.green : COLORS.gray)
        texto(d.resumen, margin + 170, y + 10.5)
        fuente('normal', 6.5, COLORS.gray)
        texto(recortar(d.dias, contentWidth - 360), margin + 350, y + 10.5)
        y += 19
      }
    }
  }

  // Pie en todas las páginas
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    fuente('normal', 6.5, COLORS.gray)
    texto(`Plan semanal · ${semana} · Generado el ${fechaGen} · Pagina ${i} de ${total}`, pageWidth / 2, pageHeight - 18, { align: 'center' })
  }

  doc.save(`Plan_semanal_${lunes}.pdf`)
}
