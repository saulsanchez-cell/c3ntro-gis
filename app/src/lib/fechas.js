// Día de negocio de hoy en Ciudad de México ('YYYY-MM-DD'), sin importar la zona
// del navegador. No usar toISOString().split('T')[0]: da el día en UTC y
// desfasa después de las 6 pm.
const FORMATO_DIA_MX = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
})

function diaDe(fecha) {
  const p = Object.fromEntries(FORMATO_DIA_MX.formatToParts(fecha).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

export function hoyMexico() {
  return diaDe(new Date())
}

// Día de México ('YYYY-MM-DD') de un valor guardado: una fecha sola se
// devuelve igual; un timestamp se convierte a la hora de Ciudad de México.
export function diaMexico(valor) {
  if (!valor) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? null : diaDe(fecha)
}
