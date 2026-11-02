// Día de negocio de hoy en Ciudad de México ('YYYY-MM-DD'), sin importar la zona
// del navegador. No usar toISOString().split('T')[0]: da el día en UTC y
// desfasa después de las 6 pm.
const FORMATO_DIA_MX = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function hoyMexico() {
  const p = Object.fromEntries(FORMATO_DIA_MX.formatToParts(new Date()).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
