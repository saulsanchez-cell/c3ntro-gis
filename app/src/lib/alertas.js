import { supabase } from './supabase'

export const UMBRAL_SIN_AVANCE_DIAS = 2
export const UMBRAL_SLA_DIAS = 5
export const UMBRAL_TASA_ERROR = 0.30

export async function contarAlertasActivas() {
  const hoy = new Date()

  const [{ data: uos }, { data: logs }, { data: perfiles }, { data: respuestas }] = await Promise.all([
    supabase.from('unidades_operativas')
      .select('id, sla_validacion, fecha_asignacion, digitalizador_id')
      .eq('es_historico', false)
      .in('estado', ['Asignada','En Proceso','En Validacion','Bloqueada']),
    supabase.from('logs_actividad').select('uo_id, fecha').order('fecha', { ascending: false }),
    supabase.from('profiles').select('id').eq('activo', true).neq('rol', 'coordinador'),
    supabase.from('checklist_respuestas').select('item_id, cumplimiento_porcentaje').not('observacion_descripcion', 'is', null),
  ])

  const ultimoLogPorUO = {}
  ;(logs || []).forEach(l => { if (!ultimoLogPorUO[l.uo_id]) ultimoLogPorUO[l.uo_id] = l.fecha })
  const sinAvanceCount = (uos || []).filter(u => {
    const ultimaFecha = ultimoLogPorUO[u.id]
    if (!ultimaFecha) {
      if (!u.fecha_asignacion) return false
      const dias = Math.floor((hoy - new Date(u.fecha_asignacion)) / (1000*60*60*24))
      return dias >= UMBRAL_SIN_AVANCE_DIAS
    }
    const dias = Math.floor((hoy - new Date(ultimaFecha)) / (1000*60*60*24))
    return dias >= UMBRAL_SIN_AVANCE_DIAS
  }).length

  const slaCount = (uos || []).filter(u => u.sla_validacion > UMBRAL_SLA_DIAS).length

  const cargaPorAnalista = {}
  ;(perfiles || []).forEach(p => { cargaPorAnalista[p.id] = 0 })
  ;(uos || []).forEach(u => {
    if (u.digitalizador_id && cargaPorAnalista[u.digitalizador_id] !== undefined) {
      cargaPorAnalista[u.digitalizador_id]++
    }
  })
  const promedioGlobal = (uos || []).length / Math.max(Object.keys(cargaPorAnalista).length, 1)
  const cargaAltaCount = Object.values(cargaPorAnalista).filter(n => n > promedioGlobal * 1.5).length

  const totalPorItem = {}
  const errorPorItem = {}
  ;(respuestas || []).forEach(r => {
    if (!r.item_id) return
    totalPorItem[r.item_id] = (totalPorItem[r.item_id] || 0) + 1
    if (r.cumplimiento_porcentaje < 100) errorPorItem[r.item_id] = (errorPorItem[r.item_id] || 0) + 1
  })
  const itemsErrorCount = Math.min(
    Object.keys(errorPorItem).filter(itemId => {
      const total = totalPorItem[itemId] || 0
      const tasa = errorPorItem[itemId] / total
      return tasa >= UMBRAL_TASA_ERROR && total >= 3
    }).length,
    10
  )

  return {
    total: sinAvanceCount + slaCount + cargaAltaCount + itemsErrorCount,
    sinAvanceCount, slaCount, cargaAltaCount, itemsErrorCount,
  }
}
