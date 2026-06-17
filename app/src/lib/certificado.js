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
  doc.roundedRect(margin, y, contentWidth, 60, 4, 4, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text('UNIDAD OPERATIVA', margin + 14, y + 16)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setColor(COLORS.dark)
  doc.text(uo.nombre, margin + 14, y + 32)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor(COLORS.gray)
  doc.text(`REF · ${uo.referencia_operativa}`, margin + 14, y + 46)

  const col2x = margin + contentWidth / 2 + 10
  const fields2 = [
    ['Tipo', uo.tipo_proyecto || '---'],
    ['Metodo constructivo', uo.metodo_constructivo || '---'],
    ['Entidad', uo.entidad_federativa || '---'],
    ['KM teoricos', uo.km_teoricos ? uo.km_teoricos + ' km' : '---'],
  ]
  fields2.forEach((f, i) => {
    const fx = col2x + (i % 2) * 130
    const fy = y + 16 + Math.floor(i / 2) * 22
    doc.setFontSize(7)
    setColor(COLORS.gray)
    doc.text(f[0], fx, fy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    setColor(COLORS.dark)
    doc.text(String(f[1]), fx, fy + 11)
    doc.setFont('helvetica', 'normal')
  })

  y += 75

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
  doc.setFontSize(9)
  setColor(COLORS.dark)
  doc.text('DETALLE POR SECCION', margin, y)
  y += 14

  const secciones = [...new Set(respuestas.map(r => r.item?.seccion).filter(Boolean))]
  doc.setFontSize(7.5)

  secciones.forEach(seccion => {
    if (y > 700) { doc.addPage(); y = 50 }
    doc.setFont('helvetica', 'bold')
    setColor(COLORS.gray)
    doc.text(seccion.toUpperCase(), margin, y)
    y += 12

    const itemsSec = respuestas.filter(r => r.item?.seccion === seccion)
    itemsSec.forEach(r => {
      if (y > 730) { doc.addPage(); y = 50 }
      doc.setFont('helvetica', 'normal')
      setColor(COLORS.dark)
      const nombre = (r.item?.nombre || '').substring(0, 55)
      doc.text(nombre, margin, y)
      doc.text(`x${r.item?.peso || ''}`, margin + 290, y, { align: 'right' })
      doc.text(String(r.puntos_esperados), margin + 340, y, { align: 'right' })
      doc.text(String(r.puntos_conformes), margin + 390, y, { align: 'right' })
      const cumplColor = r.cumplimiento_porcentaje >= 97 ? COLORS.green : r.cumplimiento_porcentaje >= 80 ? COLORS.yellow : COLORS.red
      setColor(cumplColor)
      doc.setFont('helvetica', 'bold')
      doc.text(r.cumplimiento_porcentaje.toFixed(0) + '%', margin + 440, y, { align: 'right' })
      y += 13
    })
    y += 6
  })

  y += 10
  if (y > 680) { doc.addPage(); y = 50 }

  // Equipo
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setColor(COLORS.dark)
  doc.text('EQUIPO', margin, y)
  y += 16

  const equipo = [
    ['Digitalizador', uo.digitalizador?.nombre || '---'],
    ['Analista QA', uo.analista_qa?.nombre || '---'],
  ]
  equipo.forEach((e, i) => {
    const ex = margin + i * 200
    doc.setFontSize(7)
    setColor(COLORS.gray)
    doc.text(e[0], ex, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    setColor(COLORS.dark)
    doc.text(e[1], ex, y + 13)
    doc.setFont('helvetica', 'normal')
  })

  y += 35
  setDraw(COLORS.border)
  doc.line(margin, y, pageWidth - margin, y)
  y += 16

  doc.setFontSize(7)
  setColor(COLORS.gray)
  const fechaGen = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
  doc.text(`Generado el ${fechaGen} · Version checklist v1.0`, margin, y)

  const resultColor = resultado.resultado === 'Aprobado' ? COLORS.green : COLORS.red
  setFill(resultColor)
  const badgeText = resultado.resultado
  doc.roundedRect(pageWidth - margin - 80, y - 12, 80, 18, 4, 4, 'F')
  doc.setTextColor(255,255,255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(badgeText, pageWidth - margin - 40, y - 1, { align: 'center' })

  doc.save(`Certificado_${uo.referencia_operativa}_Rev${resultado.no_revision_al_momento}.pdf`)
}