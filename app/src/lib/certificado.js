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