// KPIs de evaluación aprobados por Gerencia y RH (Technical Digitalizer y
// Analista GIS & Calidad). Funciones puras: reciben los datos ya leídos y
// devuelven las cifras que muestran la ventana EVALUAR de Equipo y su PDF.
//
// Reglas acordadas (2026-11-09):
// - Aceptada a la primera: aprobada en la primera revisión, aunque el analista
//   haya corregido errores no críticos.
// - Tiempo objetivo: 3 días hábiles en UOs de hasta 30 km; 1 día hábil más por
//   cada 30 km adicionales.
// - Liberación: se cuenta desde que el digitalizador termina el último paso.
// - Producción: jornadas asignadas por el plan en el periodo y terminadas al
//   cierre del periodo; la puntualidad se mide en Entregables.
// - Calidad de la información: liberada sin advertencias críticas y sin
//   reapertura posterior.
// Todas las fechas son días de México en texto 'YYYY-MM-DD'.

import { diaMexico } from './fechas'

export const METAS = {
  calidadCaptura: 90,
  produccion: 95,
  entregables: 95,
  registro: 100,
  correccion: 95,
  calidadInformacion: 90,
  liberacion: 95,
  integridad: 100,
  milestones: 95,
  productividad: 95,
}

export const MIN_CASOS = 5
export const MARGEN_CERCA = 10
export const INICIO_PLAN = '2026-10-26'
export const INICIO_VALIDACION_PLANEADA = '2026-11-02'

// ---------------------------------------------------------------------------
// Días hábiles (aritmética de fechas sin zona horaria)
// ---------------------------------------------------------------------------

function aFecha(dia) {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function aDia(fecha) {
  const y = fecha.getUTCFullYear()
  const m = String(fecha.getUTCMonth() + 1).padStart(2, '0')
  const d = String(fecha.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function sumarDias(dia, n) {
  const f = aFecha(dia)
  f.setUTCDate(f.getUTCDate() + n)
  return aDia(f)
}

export function esHabil(dia, inhabiles) {
  const ds = aFecha(dia).getUTCDay()
  return ds !== 0 && ds !== 6 && !inhabiles.has(dia)
}

// El día hábil número n después de `dia` (sin contar `dia`).
export function sumarHabiles(dia, n, inhabiles) {
  let actual = dia
  let cuenta = 0
  while (cuenta < n) {
    actual = sumarDias(actual, 1)
    if (esHabil(actual, inhabiles)) cuenta++
  }
  return actual
}

export function diasObjetivo(km) {
  const k = Number(km) || 0
  return k <= 30 ? 3 : 3 + Math.ceil((k - 30) / 30)
}

const enRango = (dia, desde, hasta) => !!dia && dia >= desde && dia <= hasta

// ---------------------------------------------------------------------------
// Resultado y semáforo
// ---------------------------------------------------------------------------

export function estadoKpi(ok, total, casos, meta) {
  if (!total) return 'sin_datos'
  if (casos < MIN_CASOS) return 'pocos'
  const pct = (ok / total) * 100
  if (pct >= meta) return 'cumple'
  if (pct >= meta - MARGEN_CERCA) return 'cerca'
  return 'abajo'
}

function kpi({ clave, nombre, meta, ok = 0, total = 0, casos, unidad = 'casos', nota = '', fijo = null }) {
  const n = casos ?? total
  if (fijo) return { clave, nombre, meta, ok: null, total: null, casos: 0, pct: null, estado: 'fijo', etiqueta: fijo, nota }
  const pct = total ? (ok / total) * 100 : null
  const etiqueta = !total ? 'Sin datos'
    : unidad === 'jornadas' ? `${ok.toFixed(1)}/${total.toFixed(1)} jor.`
    : `${ok}/${total}`
  return { clave, nombre, meta, ok, total, casos: n, pct, estado: estadoKpi(ok, total, n, meta), etiqueta, nota }
}

const sinDatos = (clave, nombre, meta, nota) => ({ clave, nombre, meta, ok: null, total: null, casos: 0, pct: null, estado: 'sin_datos', etiqueta: 'Sin datos', nota })

// ---------------------------------------------------------------------------
// Preparación de datos
// ---------------------------------------------------------------------------

function revisionesPorUo(checklists) {
  const por = new Map()
  for (const c of checklists) {
    const dia = diaMexico(c.fecha_revision) || diaMexico(c.created_at)
    if (!dia) continue
    const r = { ...c, dia }
    if (!por.has(c.uo_id)) por.set(c.uo_id, [])
    por.get(c.uo_id).push(r)
  }
  for (const lista of por.values()) {
    lista.sort((a, b) => a.dia.localeCompare(b.dia)
      || (a.no_revision_al_momento ?? 0) - (b.no_revision_al_momento ?? 0)
      || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
  }
  return por
}

const esValidacion = a => a?.plantilla?.momento_creacion === 'validacion'

// Último paso del digitalizador (mayor orden de la ronda más alta) por UO.
function pasosFinales(actividades) {
  const fin = new Map()
  for (const a of actividades) {
    if (esValidacion(a) || a?.plantilla?.momento_creacion !== 'asignacion') continue
    const previo = fin.get(a.uo_id)
    if (!previo || a.ronda > previo.ronda || (a.ronda === previo.ronda && a.orden > previo.orden)) fin.set(a.uo_id, a)
  }
  return fin
}

// Jornadas asignadas (fecha de carga en el periodo y antes de hoy) y las
// terminadas al cierre del periodo. responsableId null = todo el equipo.
function produccion({ responsableId, desde, hasta, hoy, cierre, cargaUo, cargaActividad, finales, actividadPorId }) {
  let ok = 0, total = 0
  const items = new Set()
  const hastaCarga = hasta < hoy ? hasta : sumarDias(hoy, -1)
  const terminadoAlCierre = act => {
    const dia = act ? diaMexico(act.completada_en) : null
    return !!dia && dia <= cierre
  }
  for (const c of cargaUo) {
    if (!c.responsable_id || (responsableId && c.responsable_id !== responsableId)) continue
    if (!enRango(c.fecha, desde, hastaCarga)) continue
    const j = Number(c.jornadas) || 0
    total += j
    items.add('uo:' + c.uo_id)
    if (terminadoAlCierre(finales.get(c.uo_id))) ok += j
  }
  for (const c of cargaActividad) {
    if (!c.responsable_id || (responsableId && c.responsable_id !== responsableId)) continue
    if (!enRango(c.fecha, desde, hastaCarga)) continue
    const j = Number(c.jornadas) || 0
    total += j
    items.add('act:' + c.actividad_id)
    if (terminadoAlCierre(actividadPorId.get(c.actividad_id))) ok += j
  }
  return { ok: Math.round(ok * 100) / 100, total: Math.round(total * 100) / 100, casos: items.size }
}

// ---------------------------------------------------------------------------
// Cálculo principal
// ---------------------------------------------------------------------------

/**
 * @param persona  perfil evaluado ({ id })
 * @param desde, hasta  periodo 'YYYY-MM-DD' (inclusive)
 * @param hoy  día de hoy en México
 * @param datos  { uos, checklists, reaperturas, actividades, reprogramadas,
 *                 cargaUo, cargaActividad, logs, inhabiles }
 *   Cada colección puede ser null si su consulta falló: los KPIs que la
 *   necesitan salen "Sin datos".
 */
export function calcularKpis({ persona, desde, hasta, hoy, datos }) {
  const pid = persona.id
  const cierre = hasta < hoy ? hasta : hoy
  const inhabiles = new Set((datos.inhabiles || []).map(d => d.fecha))
  const uos = datos.uos || []
  const uoPorId = new Map(uos.map(u => [u.id, u]))
  const revs = datos.checklists ? revisionesPorUo(datos.checklists) : null
  const actividades = datos.actividades || []
  const actividadPorId = new Map(actividades.map(a => [a.id, a]))
  const finales = pasosFinales(actividades)
  const hayPlan = datos.actividades && datos.cargaUo && datos.cargaActividad

  const dig = []
  const qa = []

  // 1. Calidad de captura
  if (revs) {
    let ok = 0, total = 0
    for (const [uoId, lista] of revs) {
      const u = uoPorId.get(uoId)
      const primera = lista[0]
      if (!u || u.digitalizador_id !== pid || (primera.no_revision_al_momento ?? 1) > 1) continue
      if (!enRango(primera.dia, desde, hasta)) continue
      total++
      if (primera.resultado === 'Aprobado') ok++
    }
    dig.push(kpi({ clave: 'calidadCaptura', nombre: 'Calidad de captura', meta: METAS.calidadCaptura, ok, total,
      nota: 'UOs aprobadas en la primera revision (incluye correcciones menores del analista).' }))
  } else dig.push(sinDatos('calidadCaptura', 'Calidad de captura', METAS.calidadCaptura))

  // 2. Cumplimiento de producción
  if (hayPlan) {
    const p = produccion({ responsableId: pid, desde, hasta, hoy, cierre, cargaUo: datos.cargaUo, cargaActividad: datos.cargaActividad, finales, actividadPorId })
    dig.push(kpi({ clave: 'produccion', nombre: 'Cumplimiento de produccion', meta: METAS.produccion, ...p, unidad: 'jornadas',
      nota: 'Jornadas asignadas por el plan (digitalizacion y validacion) terminadas al cierre del periodo.' }))
  } else dig.push(sinDatos('produccion', 'Cumplimiento de produccion', METAS.produccion))

  // 3. Cumplimiento de entregables
  if (datos.actividades) {
    let ok = 0, total = 0, reprog = 0
    const reprogramadas = new Set(datos.reprogramadas || [])
    for (const a of actividades) {
      if (a.responsable_id !== pid || esValidacion(a) || a?.plantilla?.momento_creacion !== 'asignacion') continue
      if (!a.fecha_programada || !enRango(a.fecha_programada, desde, hasta)) continue
      const hecho = diaMexico(a.completada_en)
      if (!hecho && a.fecha_programada >= hoy) continue
      total++
      if (hecho && hecho <= a.fecha_programada) ok++
      if (reprogramadas.has(a.id)) reprog++
    }
    dig.push(kpi({ clave: 'entregables', nombre: 'Cumplimiento de entregables', meta: METAS.entregables, ok, total,
      nota: `Pasos del plan terminados en su fecha compromiso.${reprog ? ` ${reprog} con fecha reprogramada.` : ''}` }))
  } else dig.push(sinDatos('entregables', 'Cumplimiento de entregables', METAS.entregables))

  // 4. Registro diario de avances
  if (hayPlan && datos.logs) {
    const diasCarga = new Set()
    const hastaReg = hasta < hoy ? hasta : sumarDias(hoy, -1)
    for (const c of [...datos.cargaUo, ...datos.cargaActividad]) {
      if (c.responsable_id === pid && enRango(c.fecha, desde, hastaReg) && esHabil(c.fecha, inhabiles)) diasCarga.add(c.fecha)
    }
    const diasRegistro = new Set()
    for (const l of datos.logs) if (l.usuario_id === pid) diasRegistro.add(diaMexico(l.fecha))
    for (const a of actividades) if (a.completada_por === pid) diasRegistro.add(diaMexico(a.registrada_en))
    let ok = 0
    for (const d of diasCarga) if (diasRegistro.has(d)) ok++
    dig.push(kpi({ clave: 'registro', nombre: 'Registro diario de avances', meta: METAS.registro, ok, total: diasCarga.size,
      nota: 'Dias habiles con trabajo planeado en los que hubo un log o un paso marcado.' }))
  } else dig.push(sinDatos('registro', 'Registro diario de avances', METAS.registro))

  // 5. Corrección de observaciones
  if (revs) {
    let ok = 0, total = 0
    for (const [uoId, lista] of revs) {
      const u = uoPorId.get(uoId)
      if (!u || u.digitalizador_id !== pid) continue
      lista.forEach((r, i) => {
        if (r.resultado !== 'Rechazado' || !enRango(r.dia, desde, hasta)) return
        const limite = sumarHabiles(r.dia, diasObjetivo(u.km_teoricos), inhabiles)
        const siguiente = lista[i + 1]
        if (!siguiente && limite >= hoy) return
        total++
        if (siguiente && siguiente.dia <= limite) ok++
      })
    }
    dig.push(kpi({ clave: 'correccion', nombre: 'Correccion de observaciones', meta: METAS.correccion, ok, total,
      nota: 'Del rechazo a la siguiente revision en 3 dias habiles (+1 por cada 30 km arriba de 30).' }))
  } else dig.push(sinDatos('correccion', 'Correccion de observaciones', METAS.correccion))

  // 6. Calidad de la información
  if (revs && datos.reaperturas) {
    const reab = new Map()
    for (const h of datos.reaperturas) {
      const d = diaMexico(h.created_at)
      if (!reab.has(h.uo_id)) reab.set(h.uo_id, [])
      reab.get(h.uo_id).push(d)
    }
    let ok = 0, total = 0
    for (const [uoId, lista] of revs) {
      const aprobadas = lista.filter(r => r.resultado === 'Aprobado')
      const ultima = aprobadas[aprobadas.length - 1]
      if (!ultima || ultima.analista_id !== pid || !enRango(ultima.dia, desde, hasta)) continue
      total++
      const reabierta = (reab.get(uoId) || []).some(d => d && d >= ultima.dia)
      if (!(Number(ultima.advertencias_bloqueantes) > 0) && !reabierta) ok++
    }
    qa.push(kpi({ clave: 'calidadInformacion', nombre: 'Calidad de la informacion', meta: METAS.calidadInformacion, ok, total,
      nota: 'UOs liberadas sin advertencias criticas y sin reapertura posterior.' }))
  } else qa.push(sinDatos('calidadInformacion', 'Calidad de la informacion', METAS.calidadInformacion))

  // 7. Tiempo de liberación
  if (revs && datos.actividades) {
    let ok = 0, total = 0
    const uosConValidacion = new Set()
    for (const a of actividades) {
      if (!esValidacion(a)) continue
      uosConValidacion.add(a.uo_id)
      if (a.responsable_id !== pid) continue
      const fin = finales.get(a.uo_id)
      const inicio = fin ? diaMexico(fin.completada_en) : null
      if (!inicio) continue
      const u = uoPorId.get(a.uo_id)
      const limite = sumarHabiles(inicio, diasObjetivo(u?.km_teoricos), inhabiles)
      const hecho = diaMexico(a.completada_en)
      if (hecho ? !enRango(hecho, desde, hasta) : (limite >= hoy || !enRango(limite, desde, hasta))) continue
      total++
      if (hecho && hecho <= limite) ok++
    }
    // UOs sin validación planeada (antes del 2026-11-02): carga final -> primera revisión
    for (const [uoId, lista] of revs) {
      if (uosConValidacion.has(uoId)) continue
      const u = uoPorId.get(uoId)
      const primera = lista[0]
      const carga = diaMexico(u?.fecha_carga_final)
      if (!u || !carga || primera.analista_id !== pid || (primera.no_revision_al_momento ?? 1) > 1) continue
      if (!enRango(primera.dia, desde, hasta) || primera.dia < carga) continue
      total++
      if (primera.dia <= sumarHabiles(carga, diasObjetivo(u.km_teoricos), inhabiles)) ok++
    }
    qa.push(kpi({ clave: 'liberacion', nombre: 'Tiempo de liberacion', meta: METAS.liberacion, ok, total,
      nota: 'Validacion en 3 dias habiles desde que termina el digitalizador (+1 por cada 30 km arriba de 30).' }))
  } else qa.push(sinDatos('liberacion', 'Tiempo de liberacion', METAS.liberacion))

  // 8 y 9. Fuera de SIGO o pendientes de definir
  qa.push(kpi({ clave: 'integridad', nombre: 'Integridad documental', meta: METAS.integridad, fijo: 'Fuera de SIGO',
    nota: 'El expediente se lleva fuera de SIGO.' }))
  qa.push(kpi({ clave: 'milestones', nombre: 'Cumplimiento de milestones', meta: METAS.milestones, fijo: 'Falta registrar hitos',
    nota: 'Hitos de proyecto (km validados por mes), medidos como equipo.' }))

  // 10. Productividad del equipo
  if (hayPlan) {
    const p = produccion({ responsableId: null, desde, hasta, hoy, cierre, cargaUo: datos.cargaUo, cargaActividad: datos.cargaActividad, finales, actividadPorId })
    qa.push(kpi({ clave: 'productividad', nombre: 'Productividad del equipo (equipo)', meta: METAS.productividad, ...p, unidad: 'jornadas',
      nota: 'Mismo calculo de produccion, sumado para todo el equipo.' }))
  } else qa.push(sinDatos('productividad', 'Productividad del equipo (equipo)', METAS.productividad))

  // Contexto
  const asignadas = uos.filter(u => u.digitalizador_id === pid && enRango(diaMexico(u.fecha_asignacion), desde, hasta))
  const cargadas = uos.filter(u => u.digitalizador_id === pid && enRango(diaMexico(u.fecha_carga_final), desde, hasta))
  const conDias = cargadas.filter(u => u.dias_proceso !== null && u.dias_proceso !== undefined)
  const revisados = (datos.checklists || []).filter(c => c.analista_id === pid && enRango(diaMexico(c.fecha_revision), desde, hasta))
  const contexto = {
    uos_asignadas: asignadas.length,
    uos_cargadas: cargadas.length,
    km_cargados: Math.round(cargadas.reduce((s, u) => s + (Number(u.km_teoricos) || 0), 0) * 100) / 100,
    dias_proceso_promedio: conDias.length ? Math.round(conDias.reduce((s, u) => s + u.dias_proceso, 0) / conDias.length * 10) / 10 : null,
    checklists_revisados: revisados.length,
  }

  const notas = []
  if (desde < INICIO_PLAN) notas.push(`Produccion, entregables y registro diario usan el plan semanal, que existe desde ${INICIO_PLAN}.`)
  if (desde < INICIO_VALIDACION_PLANEADA) notas.push(`Antes de ${INICIO_VALIDACION_PLANEADA} el tiempo de liberacion se mide de la carga final a la primera revision.`)
  notas.push(`Con menos de ${MIN_CASOS} casos el KPI se marca "pocos datos".`)

  return { digitalizador: dig, analista: qa, contexto, notas }
}
