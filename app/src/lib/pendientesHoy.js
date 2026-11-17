// "Pendientes de hoy" del Overview. Funciones puras: reciben los datos ya
// leídos (UOs activas, actividades_uo, carga del plan, días inhábiles,
// ausencias y revisiones del checklist) y devuelven qué le toca hoy a cada
// persona y en qué orden.
//
// Reglas acordadas (2026-11-17):
// - Atrasado: un paso sin completar con fecha_programada anterior a hoy (la
//   misma regla del Plan semanal).
// - Orden: atrasado (el más viejo primero), luego lo que libera a otra persona,
//   luego prioridad (P1, P2, P3) y al final la fecha de entrega.
// - "Libera a": el último paso del digitalizador, la entrega a validación y la
//   corrección liberan al analista QA de la UO.
// - Corrección: no tiene pasos propios. Vence a los mismos días hábiles que el
//   KPI de corrección (3, +1 por cada 30 km arriba de 30) desde el último
//   rechazo del checklist.
// - Validación en espera (el digitalizador no ha entregado): se muestra aparte
//   y no cuenta como atraso del analista.
// - Las UOs sin pasos planeados (detenidas por dependencias externas) no
//   aparecen: no tienen actividades ni carga.
// - Sin pendientes para hoy: se sugiere adelantar lo siguiente (mientras se
//   calibran los tiempos puede sobrar tiempo en el día).
// - Solo se consulta: los pasos se marcan en la ficha de la UO.
// Todas las fechas son días de México en texto 'YYYY-MM-DD'.

import { diaMexico } from './fechas'
import { esHabil, sumarHabiles, sumarDias, diasObjetivo } from './kpisEvaluacion'

export const ESTADOS_ACTIVOS = ['Asignada', 'En Proceso', 'En Validacion', 'En Correccion']
const EN_DIGITALIZACION = ['Asignada', 'En Proceso']
const DIAS_PROXIMOS = 3
const MAX_ADELANTAR = 3
const ORDEN_PRIORIDAD = { P1: 1, P2: 2, P3: 3 }
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const esValidacion = a => a?.plantilla?.momento_creacion === 'validacion'

function partes(dia) { return dia.split('-').map(Number) }
function diaSemana(dia) { const [y, m, d] = partes(dia); return new Date(Date.UTC(y, m - 1, d)).getUTCDay() }

// 'vie 13 nov'
export function fechaCorta(dia) {
  if (!dia) return ''
  const [, m, d] = partes(dia)
  return `${DIAS_SEMANA[diaSemana(dia)]} ${d} ${MESES[m - 1]}`
}

// 'Martes 17 de noviembre'
export function fechaLarga(dia) {
  const [, m, d] = partes(dia)
  const nombre = DIAS_LARGOS[diaSemana(dia)]
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${d} de ${MESES_LARGOS[m - 1]}`
}

export function fmtJornadas(n) {
  const v = Number(Number(n || 0).toFixed(2))
  return `${v} jornada${v === 1 ? '' : 's'}`
}

// Días hábiles después de `desde` hasta `hasta` inclusive.
function habilesEntre(desde, hasta, inhabiles) {
  let n = 0
  for (let d = sumarDias(desde, 1); d <= hasta; d = sumarDias(d, 1)) if (esHabil(d, inhabiles)) n++
  return n
}

function siguienteHabil(dia, inhabiles) {
  let d = sumarDias(dia, 1)
  for (let i = 0; i < 60 && !esHabil(d, inhabiles); i++) d = sumarDias(d, 1)
  return d
}

function nombreCorto(nombres, id) {
  const n = nombres.get(id)
  return n ? n.split(' ')[0] : 'el analista'
}

// Último día de rechazo del checklist por UO
function ultimosRechazos(checklists) {
  const por = new Map()
  for (const c of checklists || []) {
    if (c.resultado !== 'Rechazado') continue
    const dia = diaMexico(c.fecha_revision) || diaMexico(c.created_at)
    if (dia && (!por.has(c.uo_id) || dia > por.get(c.uo_id))) por.set(c.uo_id, dia)
  }
  return por
}

// Pasos del digitalizador y validación de la ronda más alta de cada UO
function actividadesPorUo(actividades) {
  const por = new Map()
  for (const a of actividades || []) {
    if (!por.has(a.uo_id)) por.set(a.uo_id, [])
    por.get(a.uo_id).push(a)
  }
  const res = new Map()
  for (const [uoId, lista] of por) {
    const pasosTodos = lista.filter(a => !esValidacion(a))
    const vals = lista.filter(esValidacion)
    const rondaPasos = Math.max(0, ...pasosTodos.map(a => a.ronda || 1))
    const rondaVal = Math.max(0, ...vals.map(a => a.ronda || 1))
    res.set(uoId, {
      pasos: pasosTodos.filter(a => (a.ronda || 1) === rondaPasos).sort((a, b) => a.orden - b.orden),
      validacion: vals.find(a => (a.ronda || 1) === rondaVal) || null,
    })
  }
  return res
}

function compararItems(a, b) {
  if (a.atrasado !== b.atrasado) return a.atrasado ? -1 : 1
  if (a.atrasado && a.fecha !== b.fecha) return (a.fecha || '') < (b.fecha || '') ? -1 : 1
  if (Boolean(a.libera) !== Boolean(b.libera)) return a.libera ? -1 : 1
  const pa = ORDEN_PRIORIDAD[a.uo.prioridad] ?? 9, pb = ORDEN_PRIORIDAD[b.uo.prioridad] ?? 9
  if (pa !== pb) return pa - pb
  const ea = a.uo.fecha_entrega_programada || '9999', eb = b.uo.fecha_entrega_programada || '9999'
  if (ea !== eb) return ea < eb ? -1 : 1
  return String(a.uo.referencia_operativa).localeCompare(String(b.uo.referencia_operativa))
}

function textoVence(fecha, hoy, atrasado) {
  if (!fecha) return 'Sin fecha planeada'
  if (atrasado) return `Vencía el ${fechaCorta(fecha)}`
  if (fecha === hoy) return 'Vence hoy'
  return `Vence el ${fechaCorta(fecha)}`
}

// Prepara lo que comparten todas las personas
export function prepararDatos({ uos, actividades, cargaUo, cargaActividad, inhabiles, ausencias, checklists, perfiles }) {
  return {
    uos: uos || [],
    porUo: actividadesPorUo(actividades),
    cargaUo: cargaUo || [],
    cargaActividad: cargaActividad || [],
    inhabiles: new Set((inhabiles || []).map(d => d.fecha)),
    ausencias: ausencias || [],
    rechazos: ultimosRechazos(checklists),
    nombres: new Map((perfiles || []).map(p => [p.id, p.nombre || ''])),
  }
}

// Pendientes de una persona para hoy
export function pendientesPersona(persona, hoy, datos) {
  const { uos, porUo, inhabiles, nombres } = datos
  const ausPersona = datos.ausencias.filter(a => a.profile_id === persona)
  const ausenciaDe = dia => ausPersona.find(a => a.fecha === dia) || null
  const inhabilesPersona = new Set([...inhabiles, ...ausPersona.filter(a => Number(a.fraccion) >= 1).map(a => a.fecha)])

  // Jornadas planeadas por día y UO para esta persona
  const carga = new Map()
  const sumar = (fecha, uoId, j) => {
    if (!carga.has(fecha)) carga.set(fecha, new Map())
    const m = carga.get(fecha)
    m.set(uoId, (m.get(uoId) || 0) + Number(j || 0))
  }
  datos.cargaUo.filter(c => c.responsable_id === persona).forEach(c => sumar(c.fecha, c.uo_id, c.jornadas))
  datos.cargaActividad.filter(c => c.responsable_id === persona && c.uo_id).forEach(c => sumar(c.fecha, c.uo_id, c.jornadas))
  const cargaHoy = carga.get(hoy) || new Map()

  const atrasoDe = fecha => fecha && fecha < hoy ? habilesEntre(fecha, hoy, inhabilesPersona) : 0
  const items = []
  const espera = []
  const adelantar = []   // lo siguiente que ya se puede empezar, para quien termina antes

  for (const uo of uos) {
    const act = porUo.get(uo.id) || { pasos: [], validacion: null }
    const val = act.validacion && !act.validacion.completada_en ? act.validacion : null
    const analistaId = val?.responsable_id || uo.analista_qa_id
    const libera = analistaId && analistaId !== persona ? nombreCorto(nombres, analistaId) : null
    const jornadas = cargaHoy.get(uo.id) || 0

    // Pasos del digitalizador
    if (EN_DIGITALIZACION.includes(uo.estado)) {
      const mios = act.pasos.filter(p => p.responsable_id === persona)
      const pendientes = mios.filter(p => !p.completada_en)
      if (pendientes.length > 0) {
        const sig = pendientes[0]
        const fechas = pendientes.map(p => p.fecha_programada).filter(Boolean).sort()
        const masVieja = fechas[0] || null
        const atrasado = Boolean(masVieja && masVieja < hoy)
        const esUltimo = act.pasos[act.pasos.length - 1]?.id === sig.id
        const deHoy = atrasado || jornadas > 0 || (sig.fecha_programada && sig.fecha_programada <= hoy)
        if (!deHoy) {
          adelantar.push({
            clave: 'paso-' + sig.id, tipo: 'paso', uo,
            titulo: `Paso ${sig.orden} de ${act.pasos.length} · ${sig.nombre}`,
            fecha: sig.fecha_programada, vence: textoVence(sig.fecha_programada, hoy, false),
          })
        } else {
          items.push({
            clave: 'paso-' + sig.id, tipo: 'paso', uo,
            titulo: `Paso ${sig.orden} de ${act.pasos.length} · ${sig.nombre}`,
            fecha: atrasado ? masVieja : sig.fecha_programada, atrasado, diasAtraso: atrasoDe(masVieja),
            vence: textoVence(atrasado ? masVieja : sig.fecha_programada, hoy, atrasado) + (esUltimo && libera ? ` · después sigue la validación de ${libera}` : ''),
            libera: esUltimo ? libera : null, jornadas,
          })
        }
      } else if (mios.length > 0 && uo.digitalizador_id === persona) {
        // Pasos completos, falta pasar la UO a En Validacion
        const fecha = val?.fecha_programada || hoy
        const atrasado = fecha < hoy
        items.push({
          clave: 'entrega-' + uo.id, tipo: 'entrega', uo,
          titulo: 'Entregar a validación',
          fecha, atrasado, diasAtraso: atrasoDe(fecha),
          vence: 'Los pasos están completos; falta cambiar el estado a En validación'
            + (val?.fecha_programada && libera ? ` · ${libera} la tiene planeada el ${fechaCorta(val.fecha_programada)}` : ''),
          libera, jornadas,
        })
      }
    }

    // Corrección (sin pasos propios)
    if (uo.estado === 'En Correccion' && uo.digitalizador_id === persona) {
      const rechazo = datos.rechazos.get(uo.id)
      const fecha = rechazo ? sumarHabiles(rechazo, diasObjetivo(uo.km_teoricos), inhabilesPersona) : null
      const atrasado = Boolean(fecha && fecha < hoy)
      items.push({
        clave: 'correccion-' + uo.id, tipo: 'correccion', uo,
        titulo: 'Corregir observaciones de QA',
        fecha, atrasado, diasAtraso: atrasoDe(fecha),
        vence: (fecha ? textoVence(fecha, hoy, atrasado) : 'Sin fecha de rechazo') + (libera ? ` · después la revalida ${libera}` : ''),
        libera, jornadas,
      })
    }

    // Validación de calidad del analista
    if (val && val.responsable_id === persona) {
      const digId = act.pasos[act.pasos.length - 1]?.responsable_id || uo.digitalizador_id
      const dig = nombreCorto(nombres, digId)
      const fecha = val.fecha_programada
      if (uo.estado === 'En Validacion') {
        const atrasado = Boolean(fecha && fecha < hoy)
        if (atrasado || jornadas > 0 || !fecha || fecha <= hoy) {
          items.push({
            clave: 'validacion-' + val.id, tipo: 'validacion', uo,
            titulo: 'Validación de calidad',
            fecha, atrasado, diasAtraso: atrasoDe(fecha),
            vence: (fecha ? (atrasado ? `Planeada para el ${fechaCorta(fecha)}` : textoVence(fecha, hoy, false)) : 'Sin fecha planeada')
              + (digId && digId !== persona ? ` · digitalizó ${dig}` : ''),
            libera: null, jornadas,
          })
        } else {
          adelantar.push({
            clave: 'validacion-' + val.id, tipo: 'validacion', uo,
            titulo: 'Validación de calidad', fecha, vence: textoVence(fecha, hoy, false),
          })
        }
      } else if (fecha && fecha <= hoy) {
        // Planeada para hoy o antes, pero el digitalizador no ha entregado
        let motivo
        if (uo.estado === 'En Correccion') motivo = `${dig} está corrigiendo las observaciones.`
        else {
          const pend = act.pasos.filter(p => !p.completada_en)
          if (pend.length > 0) {
            const p = pend[0]
            const atr = p.fecha_programada && p.fecha_programada < hoy
            motivo = `Falta que ${dig} termine el paso ${p.orden} (${p.nombre})` + (atr ? `, atrasado desde el ${fechaCorta(p.fecha_programada)}.` : '.')
          } else motivo = `${dig} ya terminó los pasos; falta que la entregue a validación.`
        }
        espera.push({ clave: 'espera-' + val.id, tipo: 'espera', uo, titulo: 'Validación de calidad', motivo, jornadas, digId })
      }
    }
  }

  items.sort(compararItems)
  // Lo más próximo primero; a igual fecha, el mismo orden de la lista de hoy
  adelantar.sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999')
    || compararItems({ ...a, atrasado: false }, { ...b, atrasado: false }))

  // Próximos días hábiles
  const proximos = []
  let d = hoy
  for (let i = 0; i < DIAS_PROXIMOS; i++) {
    d = siguienteHabil(d, inhabiles)
    const m = carga.get(d) || new Map()
    const refs = [...m.keys()].map(id => uos.find(u => u.id === id)?.referencia_operativa).filter(Boolean)
    proximos.push({
      dia: d,
      jornadas: [...m.values()].reduce((s, v) => s + v, 0),
      refs,
      ausencia: ausenciaDe(d),
    })
  }

  const ausenciaHoy = ausenciaDe(hoy)
  return {
    items,
    espera,
    adelantar: adelantar.slice(0, MAX_ADELANTAR),
    proximos,
    jornadasHoy: [...cargaHoy.values()].reduce((s, v) => s + v, 0),
    ausenciaHoy,
    regresa: ausenciaHoy && Number(ausenciaHoy.fraccion) >= 1 ? siguienteHabil(hoy, inhabilesPersona) : null,
    atrasados: items.filter(i => i.atrasado),
  }
}
