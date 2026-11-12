import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { generarPDFPlanSemanal } from '../lib/certificado'

const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE']
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
// Los 4 pasos de asignación, por orden: insumos, preparación (Vertex), carga en Vetro, ajustes y autorrevisión en Vetro
const PASOS = [1, 2, 3, 4]
// La validación de calidad (orden 5) del analista QA; su carga va en plan_carga_actividad
const esValidacion = a => a?.plantilla?.momento_creacion === 'validacion'
const EPS = 0.005
const VISTAS = [{ key:'plan', label:'PLAN DE ACTIVIDADES' }, { key:'carga', label:'CARGA DE TRABAJO' }]
// Ausencias por persona (plan_ausencias): dia completo (1) o medio dia (0.5).
// La nota la leen todos los usuarios con sesion: sin motivos de salud.
const TIPOS_AUSENCIA = ['Vacaciones', 'Permiso', 'Otro']
const MAX_DIAS_AUSENCIA = 60
function textoAusencia(a) { return a.tipo + (Number(a.fraccion) < 1 ? ' ½ día' : '') }

const ICONS = {
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>,
  reloj: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  alerta: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>,
  gauge: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 12L16 8"/><circle cx="12" cy="12" r="9"/><path d="M12 21a9 9 0 01-9-9"/></svg>,
}

function Kpi({ icon, label, value, color = 'var(--text)', sub }) {
  return (
    <div className="glass" style={{ borderRadius:'10px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
      <div style={{ width:32, height:32, flexShrink:0, borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center',
        background:'linear-gradient(135deg, rgba(139,92,246,0.22), rgba(56,189,248,0.16))', border:'1px solid rgba(139,92,246,0.25)', color:'var(--accent-a)' }}>
        <div style={{ width:17, height:17 }}>{icon}</div>
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', letterSpacing:'0.1em', marginBottom:'3px' }}>{label}</div>
        <div style={{ fontFamily:'var(--disp)', fontSize:'26px', fontWeight:800, color, lineHeight:1.15 }}>{value}</div>
        {sub && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'2px' }}>{sub}</div>}
      </div>
    </div>
  )
}

// Fechas de negocio como texto 'YYYY-MM-DD'. La aritmética usa Date.UTC sobre
// año, mes y día, así que no depende de la zona horaria del navegador.
const FORMATO_DIA_MX = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
})
function hoyMexico() {
  const p = Object.fromEntries(FORMATO_DIA_MX.formatToParts(new Date()).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
function partes(f) { return f.split('-').map(Number) }
function sumarDias(f, n) {
  const [y, m, d] = partes(f)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  const pad = v => String(v).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}
function diaSemanaIso(f) {
  const [y, m, d] = partes(f)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 + 1
}
function lunesDe(f) { return sumarDias(f, -(diaSemanaIso(f) - 1)) }
function diasEntre(a, b) {
  const [y1, m1, d1] = partes(a), [y2, m2, d2] = partes(b)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}
function ddmm(f) { const [, m, d] = partes(f); return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}` }
function textoSemana(lunes) {
  const [, m1, d1] = partes(lunes), [y2, m2, d2] = partes(sumarDias(lunes, 4))
  return m1 === m2
    ? `Semana del ${d1} al ${d2} de ${MESES[m2 - 1]} de ${y2}`
    : `Semana del ${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]} de ${y2}`
}
// Fila vigente en una fecha (plan_capacidad, plan_parametros)
function vigente(filas, fecha) {
  return filas
    .filter(r => r.vigente_desde <= fecha && (!r.vigente_hasta || r.vigente_hasta >= fecha))
    .sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1))[0]
}
function fmt(n) { return String(Number(Number(n).toFixed(2))) }

// Consulta que nunca rompe la pantalla: null si falla
async function consultar(consulta) {
  try {
    const { data, error } = await consulta
    return error ? null : (data || [])
  } catch {
    return null
  }
}

function estadoPaso(a, hoy) {
  if (!a) return 'sin'
  if (a.completada_en) return 'hecha'
  if (a.fecha_programada && a.fecha_programada < hoy) return 'atrasada'
  return 'pendiente'
}

function estadoCarga(j, cap) {
  const libre = cap - j
  if (cap <= EPS && j <= EPS) return { txt:'Sin capacidad', tono:'muted', color:'var(--muted)' }
  if (libre > EPS) return { txt:'Libre ' + fmt(libre), tono:'green', color:'var(--green)' }
  if (libre >= -EPS) return { txt:'Completo', tono:'orange', color:'var(--orange)' }
  return { txt:'Sobrecarga +' + fmt(-libre), tono:'red', color:'var(--red)' }
}

// km_teoricos llega como texto ('0.000' es verdadero en JS): sin km = nulo o <= 0.
// Con eso el plan solo reservó la jornada mínima.
function sinKm(uo) {
  return !(Number(uo.km_teoricos) > 0)
}

// Estado de una tarjeta de UO; lo usan la pantalla y el PDF
function resumenTarjeta(uo, pasos, hoy) {
  const estados = PASOS.map(o => estadoPaso(pasos[o], hoy))
  const ajustadas = PASOS.map(o => pasos[o]).filter(a => a && a.fecha_origen === 'ajustada')
  const fechas = PASOS.map(o => pasos[o]?.fecha_programada).filter(Boolean).sort()
  const ultima = fechas[fechas.length - 1]
  const tarde = Boolean(uo.fecha_entrega_programada && ultima && ultima > uo.fecha_entrega_programada)
  const tono = estados.includes('atrasada') ? 'red' : estados.every(e => e === 'hecha') ? 'green' : 'orange'
  return { estados, ajustadas, ultima, tarde, tono }
}

const TH = { textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--muted)', fontWeight:600, padding:'10px 16px', borderBottom:'0.5px solid var(--border2)' }
const TD = { padding:'10px 16px', borderBottom:'0.5px solid var(--border2)', fontSize:11 }
const COLUMNAS = '170px repeat(5, minmax(150px, 1fr)) 150px'

// ── Réplica en el cliente de las funciones SQL de 2026-10-26_plan-semanal.sql ──
// Solo alimentan la vista previa y los avisos; la base valida y decide.

// public.plan_capacidad_dia: 0 si el día es inhábil; si no, la capacidad vigente del día de la semana
function capacidadDia(f, capacidad, inhabiles) {
  if (inhabiles.has(f)) return 0
  const fila = vigente(capacidad.filter(r => r.dia_semana === diaSemanaIso(f)), f)
  return Number(fila?.jornadas ?? 0)
}

// public.plan_sumar_dias_habiles: p_n días hábiles hacia adelante o hacia atrás
function sumarDiasHabiles(f, n, cap) {
  let v = f, restantes = Math.abs(n), iter = 0
  const paso = Math.sign(n)
  while (restantes > 0) {
    v = sumarDias(v, paso)
    iter += 1
    if (iter > 3660) throw new Error(`No hay ${n} dias habiles a partir de ${f}`)
    if (cap(v) > 0) restantes -= 1
  }
  return v
}

// public.plan_dias_habiles_entre: cuenta (desde, hasta] hacia adelante o -[hasta, desde) hacia atrás
function diasHabilesEntre(desde, hasta, cap) {
  let n = 0
  if (hasta >= desde) {
    for (let d = sumarDias(desde, 1); d <= hasta; d = sumarDias(d, 1)) if (cap(d) > 0) n += 1
    return n
  }
  for (let d = hasta; d < desde; d = sumarDias(d, 1)) if (cap(d) > 0) n += 1
  return -n
}

// public.reprogramar_actividad, sin escribir: qué pasos y qué carga se moverían.
// cargaVal: carga de la validación de la UO (plan_carga_actividad), con actividad_id.
function simularReprogramacion(act, fecha, actsUo, cargaUo, cargaVal, cap) {
  const anterior = act.fecha_programada
  const n = diasHabilesEntre(anterior, fecha, cap)
  const esPrimero = !actsUo.some(a => a.ronda === act.ronda && a.orden < act.orden)
  // Si se mueve la validación, la carga del digitalizador no se toca
  const seMueve = c => !esValidacion(act) && (esPrimero || c.fecha >= anterior)
  const destino = f => (f === anterior ? fecha : sumarDiasHabiles(f, n, cap))

  // Carga: filas que no se mueven + filas movidas agrupadas por fecha nueva;
  // si caen en una fecha que ya tenía carga de la UO, se suman (on conflict)
  const nueva = {}
  for (const c of cargaUo.filter(c => !seMueve(c))) nueva[c.fecha] = { ...c, jornadas: Number(c.jornadas), movida: false }
  const agrupadas = {}
  for (const c of cargaUo.filter(seMueve)) {
    const f = destino(c.fecha)
    const g = (agrupadas[f] ||= { fecha: f, responsable_id: c.responsable_id, jornadas: 0, movida: true })
    g.jornadas += Number(c.jornadas)
  }
  for (const g of Object.values(agrupadas)) {
    if (nueva[g.fecha]) { nueva[g.fecha].jornadas += g.jornadas; nueva[g.fecha].movida = true }
    else nueva[g.fecha] = g
  }

  // Pasos: esta actividad y las siguientes de la misma UO y ronda, con fecha
  const pasos = actsUo
    .filter(a => a.ronda === act.ronda && a.orden >= act.orden && a.fecha_programada)
    .sort((a, b) => a.orden - b.orden)
    .map(a => ({ ...a, nueva: a.id === act.id ? fecha : sumarDiasHabiles(a.fecha_programada, n, cap) }))
    .filter(a => a.nueva !== a.fecha_programada)

  // La validación movida (ella misma o arrastrada por un paso) lleva su carga a su fecha nueva
  const nuevaVal = Object.fromEntries(pasos.filter(esValidacion).map(a => [a.id, a.nueva]))
  const carga = [
    ...Object.values(nueva),
    ...cargaVal.map(c => nuevaVal[c.actividad_id]
      ? { ...c, fecha: nuevaVal[c.actividad_id], jornadas: Number(c.jornadas), movida: true }
      : { ...c, jornadas: Number(c.jornadas), movida: false }),
  ]

  return { pasos, carga: carga.sort((a, b) => (a.fecha < b.fecha ? -1 : 1)) }
}

const LABEL = { fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'6px' }
const CAJA_ERROR = { fontFamily:'var(--mono)', fontSize:'10px', color:'var(--red)', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:'5px', padding:'8px 12px' }

function ModalReprogramar({ uo, actsUo, capacidad, nombres, hoy, actividadInicial, onCerrar, onGuardado }) {
  const elegibles = actsUo
    .filter(a => !a.completada_en && a.fecha_programada)
    .sort((a, b) => a.ronda - b.ronda || a.orden - b.orden)
  const [actividadId, setActividadId] = useState(
    elegibles.some(a => a.id === actividadInicial) ? actividadInicial : (elegibles[0]?.id ?? ''))
  const [fecha, setFecha] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [extra, setExtra] = useState(null)  // carga de la UO, días inhábiles y carga de las personas

  const idsValidacion = actsUo.filter(esValidacion).map(a => a.id)

  useEffect(() => {
    let actual = true
    ;(async () => {
      const [cargaUo, cargaVal, inhabiles] = await Promise.all([
        consultar(supabase.from('plan_carga_uo').select('uo_id,fecha,responsable_id,jornadas').eq('uo_id', uo.id)),
        idsValidacion.length === 0 ? [] : consultar(supabase.from('plan_carga_actividad')
          .select('actividad_id,fecha,responsable_id,jornadas').in('actividad_id', idsValidacion)),
        consultar(supabase.from('plan_dias_inhabiles').select('fecha')),
      ])
      let cargaPersonas = null, ausencias = null
      if (cargaUo && cargaVal) {
        const propias = [...cargaUo, ...cargaVal]
        const personas = [...new Set([...propias.map(c => c.responsable_id), ...actsUo.map(a => a.responsable_id)].filter(Boolean))]
        const desde = [hoy, ...propias.map(c => c.fecha)].sort()[0]
        if (personas.length === 0) { cargaPersonas = []; ausencias = new Map() }
        else {
          const [deUos, deActividades, deAusencias] = await Promise.all([
            consultar(supabase.from('plan_carga_uo')
              .select('uo_id,fecha,responsable_id,jornadas').in('responsable_id', personas).gte('fecha', desde)),
            consultar(supabase.from('plan_carga_actividad')
              .select('fecha,responsable_id,jornadas,actividad:actividades_uo(uo_id)').in('responsable_id', personas).gte('fecha', desde)),
            consultar(supabase.from('plan_ausencias')
              .select('profile_id,fecha,fraccion,tipo').in('profile_id', personas).gte('fecha', desde)),
          ])
          cargaPersonas = deUos && deActividades
            ? [...deUos, ...deActividades.map(c => ({ uo_id: c.actividad?.uo_id, fecha: c.fecha, responsable_id: c.responsable_id, jornadas: c.jornadas }))]
            : null
          ausencias = deAusencias ? new Map(deAusencias.map(a => [`${a.profile_id}|${a.fecha}`, a])) : null
        }
      }
      if (actual) setExtra({ cargaUo, cargaVal, inhabiles: inhabiles ? new Set(inhabiles.map(r => r.fecha)) : null, cargaPersonas, ausencias })
    })()
    return () => { actual = false }
  }, [uo.id, hoy, idsValidacion.join(',')])

  const act = elegibles.find(a => a.id === actividadId)
  const cap = extra?.inhabiles ? f => capacidadDia(f, capacidad, extra.inhabiles) : null
  const motivoOk = motivo.trim().length >= 10

  // Avisos del cliente (la base valida de nuevo)
  let aviso = ''
  if (act && fecha) {
    const previa = actsUo
      .filter(a => a.ronda === act.ronda && a.orden < act.orden && a.fecha_programada)
      .map(a => a.fecha_programada).sort().pop()
    if (fecha < hoy) aviso = `La fecha no puede ser anterior a hoy (${ddmm(hoy)})`
    else if (cap && cap(fecha) <= 0) aviso = `La fecha no es un dia habil (${ddmm(fecha)})`
    else if (fecha === act.fecha_programada) aviso = 'La actividad ya tiene esa fecha'
    else if (previa && fecha < previa) aviso = `La fecha no puede ser anterior al paso previo (${ddmm(previa)})`
  }

  let vista = null, errorVista = ''
  if (act && fecha && !aviso && cap && extra.cargaUo && extra.cargaVal) {
    try {
      vista = simularReprogramacion(act, fecha, actsUo, extra.cargaUo, extra.cargaVal, cap)
      vista.sobrecargas = extra.cargaPersonas
        ? vista.carga.filter(c => c.movida && c.responsable_id).map(c => {
            const otras = extra.cargaPersonas
              .filter(o => o.responsable_id === c.responsable_id && o.fecha === c.fecha && o.uo_id !== uo.id)
              .reduce((s, o) => s + Number(o.jornadas), 0)
            const fraccion = Number(extra.ausencias?.get(`${c.responsable_id}|${c.fecha}`)?.fraccion ?? 0)
            return { ...c, total: otras + c.jornadas, capacidad: cap(c.fecha) * (1 - fraccion) }
          }).filter(c => c.total > c.capacidad + EPS)
        : []
      // Fechas nuevas que caen en una ausencia del responsable (pasos movidos y su carga)
      const vistos = new Set()
      vista.ausencias = !extra.ausencias ? [] : [
        ...vista.pasos.map(p => ({ responsable_id: p.responsable_id, fecha: p.nueva })),
        ...vista.carga.filter(c => c.movida).map(c => ({ responsable_id: c.responsable_id, fecha: c.fecha })),
      ].flatMap(x => {
        const a = x.responsable_id && extra.ausencias.get(`${x.responsable_id}|${x.fecha}`)
        const k = `${x.responsable_id}|${x.fecha}`
        if (!a || vistos.has(k)) return []
        vistos.add(k)
        return [{ ...x, ausencia: a }]
      })
    } catch (e) {
      errorVista = e.message
    }
  }

  async function guardar() {
    if (saving || !act || !fecha || aviso || !motivoOk) return
    setError('')
    setSaving(true)
    const { error: rpcError } = await supabase.rpc('reprogramar_actividad', {
      p_actividad: act.id, p_fecha: fecha, p_motivo: motivo.trim(),
    })
    setSaving(false)
    if (rpcError) { setError(rpcError.message); return }
    onGuardado()
  }

  const puedeGuardar = act && fecha && !aviso && motivoOk && !saving

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'var(--surface)', border:'0.5px solid var(--border)', borderRadius:'10px', padding:'24px', width:'460px', maxWidth:'92vw', maxHeight:'90vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:'14px' }}>
        <div style={{ fontWeight:'700', fontSize:'15px' }}>Reprogramar actividad</div>
        <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>
          REF · {uo.referencia_operativa} · {uo.nombre}
        </div>

        {elegibles.length === 0 ? (
          <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>Esta UO no tiene actividades pendientes con fecha.</div>
        ) : (
          <>
            <div>
              <div style={LABEL}>PASO A REPROGRAMAR</div>
              <select value={actividadId} onChange={e => { setActividadId(e.target.value); setError('') }}>
                {elegibles.map(a => (
                  <option key={a.id} value={a.id}>{a.orden}. {a.nombre} · {ddmm(a.fecha_programada)}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={LABEL}>NUEVA FECHA *</div>
              <input type="date" value={fecha} min={hoy} onChange={e => { setFecha(e.target.value); setError('') }} />
              {aviso && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--red)', marginTop:'4px' }}>{aviso}</div>}
            </div>

            <div>
              <div style={LABEL}>MOTIVO *</div>
              <textarea rows={3} value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Por que se mueve la fecha..."
                style={{ resize:'vertical', fontSize:'11px' }} />
              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color: motivoOk ? 'var(--green)' : 'var(--muted2)', marginTop:'3px' }}>
                {motivo.trim().length}/10 caracteres minimo
              </div>
            </div>

            {vista && (
              <div style={{ background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:'7px', padding:'10px 12px', display:'flex', flexDirection:'column', gap:'6px' }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em' }}>VISTA PREVIA · LA BASE CONFIRMA AL GUARDAR</div>
                {vista.pasos.map(p => (
                  <div key={p.id} style={{ display:'flex', justifyContent:'space-between', gap:'8px', fontFamily:'var(--mono)', fontSize:'9px' }}>
                    <span style={{ color:'var(--text)' }}>{p.orden}. {p.nombre}</span>
                    <span style={{ color:'var(--muted2)', flexShrink:0 }}>{ddmm(p.fecha_programada)} → <span style={{ color:'var(--accent-a)' }}>{ddmm(p.nueva)}</span></span>
                  </div>
                ))}
                {vista.sobrecargas.map(s => (
                  <div key={s.fecha + (s.responsable_id || '')} style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--orange)' }}>
                    Aviso: {nombres[s.responsable_id] ?? 'el responsable'} quedaria con sobrecarga el {DIAS[diaSemanaIso(s.fecha) - 1] ?? ''} {ddmm(s.fecha)} ({fmt(s.total)} / {fmt(s.capacidad)}). Se puede guardar igual.
                  </div>
                ))}
                {vista.ausencias.map(s => (
                  <div key={'aus' + s.fecha + s.responsable_id} style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--orange)' }}>
                    Aviso: {nombres[s.responsable_id] ?? 'el responsable'} tiene {textoAusencia(s.ausencia)} el {DIAS[diaSemanaIso(s.fecha) - 1] ?? ''} {ddmm(s.fecha)}. Se puede guardar igual.
                  </div>
                ))}
              </div>
            )}
            {errorVista && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)' }}>No se pudo calcular la vista previa: {errorVista}</div>}
          </>
        )}

        {error && <div style={CAJA_ERROR}>{error}</div>}

        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <button onClick={onCerrar} disabled={saving}
            style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid var(--border)', background:'none', color:'var(--muted2)', fontSize:'10px', fontFamily:'var(--mono)' }}>
            CANCELAR
          </button>
          <button onClick={guardar} disabled={!puedeGuardar}
            style={{ padding:'7px 14px', borderRadius:'5px', border:'none', background:'var(--orange)', color:'#080808', fontSize:'10px', fontFamily:'var(--mono)', fontWeight:'500', opacity: puedeGuardar ? 1 : 0.4 }}>
            {saving ? 'GUARDANDO...' : 'REPROGRAMAR'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Agrupa ausencias de la misma persona en días hábiles seguidos, con el mismo tipo, fracción y nota
function agruparAusencias(lista, cap) {
  const orden = [...lista].sort((a, b) => a.profile_id.localeCompare(b.profile_id) || a.fecha.localeCompare(b.fecha))
  const grupos = []
  for (const a of orden) {
    const g = grupos[grupos.length - 1]
    const mismo = g && g.profile_id === a.profile_id && g.tipo === a.tipo && Number(g.fraccion) === Number(a.fraccion) && (g.nota || '') === (a.nota || '')
    if (mismo && sumarDiasHabiles(g.hasta, 1, cap) === a.fecha) { g.hasta = a.fecha; g.fechas.push(a.fecha) }
    else grupos.push({ ...a, desde: a.fecha, hasta: a.fecha, fechas: [a.fecha] })
  }
  return grupos.sort((a, b) => a.desde.localeCompare(b.desde) || (a.nombre || '').localeCompare(b.nombre || ''))
}

const BOTON_CHICO = { fontFamily:'var(--mono)', fontSize:'8px', padding:'4px 8px', borderRadius:'4px', border:'0.5px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.06)', color:'var(--red)', cursor:'pointer' }
const FILA_LISTA = { display:'flex', alignItems:'center', gap:'8px', background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:'6px', padding:'6px 10px', fontFamily:'var(--mono)', fontSize:'9px' }

// Ausencias por persona y feriados; solo el coordinador (la base lo valida con es_coordinador())
function ModalAusencias({ integrantes, capacidad, hoy, onCerrar, onCambio }) {
  const [datos, setDatos] = useState(null)  // { ausencias, inhabiles } o null mientras carga
  const [recarga, setRecarga] = useState(0)
  const [form, setForm] = useState({ persona: integrantes[0]?.id ?? '', desde: '', hasta: '', medio: false, tipo: 'Vacaciones', nota: '' })
  const [feriado, setFeriado] = useState({ fecha: '', descripcion: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let actual = true
    ;(async () => {
      const [ausencias, inhabiles] = await Promise.all([
        consultar(supabase.from('plan_ausencias')
          .select('profile_id,fecha,fraccion,tipo,nota,perfil:profiles!plan_ausencias_profile_id_fkey(nombre)')
          .gte('fecha', hoy).order('fecha')),
        consultar(supabase.from('plan_dias_inhabiles').select('fecha,descripcion').order('fecha')),
      ])
      if (actual) setDatos({ ausencias, inhabiles })
    })()
    return () => { actual = false }
  }, [hoy, recarga])

  const inhabilesSet = datos?.inhabiles ? new Set(datos.inhabiles.map(r => r.fecha)) : null
  const cap = inhabilesSet ? f => capacidadDia(f, capacidad, inhabilesSet) : null

  // Días hábiles del rango (sin fines de semana ni feriados) y los que la persona ya tiene registrados
  const hasta = form.hasta || form.desde
  let dias = [], avisoRango = ''
  if (form.desde && cap) {
    if (hasta < form.desde) avisoRango = 'La fecha final es anterior a la inicial'
    else if (form.desde < hoy) avisoRango = `No se registran ausencias antes de hoy (${ddmm(hoy)})`
    else if (diasEntre(form.desde, hasta) > MAX_DIAS_AUSENCIA) avisoRango = `El rango no puede pasar de ${MAX_DIAS_AUSENCIA} días`
    else for (let d = form.desde; d <= hasta; d = sumarDias(d, 1)) if (cap(d) > 0) dias.push(d)
  }
  const yaRegistradas = new Set((datos?.ausencias || []).filter(a => a.profile_id === form.persona).map(a => a.fecha))
  const nuevos = dias.filter(d => !yaRegistradas.has(d))
  const omitidos = dias.length - nuevos.length
  const notaOk = form.nota.trim().length <= 120
  const puedeGuardar = form.persona && nuevos.length > 0 && !avisoRango && notaOk && !saving

  async function guardarAusencia() {
    if (!puedeGuardar) return
    setError('')
    setSaving(true)
    const filas = nuevos.map(fecha => ({
      profile_id: form.persona, fecha, fraccion: form.medio ? 0.5 : 1, tipo: form.tipo, nota: form.nota.trim() || null,
    }))
    const { error: e } = await supabase.from('plan_ausencias').insert(filas)
    setSaving(false)
    if (e) { setError('No se pudo registrar la ausencia: ' + e.message); return }
    setForm(f => ({ ...f, desde: '', hasta: '', nota: '' }))
    setRecarga(r => r + 1)
    onCambio()
  }

  async function quitarAusencia(g) {
    const rango = g.desde === g.hasta ? ddmm(g.desde) : `${ddmm(g.desde)} al ${ddmm(g.hasta)}`
    if (!window.confirm(`¿Quitar la ausencia de ${g.perfil?.nombre ?? 'esta persona'} (${rango})?`)) return
    setError('')
    const { error: e } = await supabase.from('plan_ausencias').delete().eq('profile_id', g.profile_id).in('fecha', g.fechas)
    if (e) { setError('No se pudo quitar la ausencia: ' + e.message); return }
    setRecarga(r => r + 1)
    onCambio()
  }

  const descripcionOk = feriado.descripcion.trim().length >= 3 && feriado.descripcion.trim().length <= 80
  const feriadoRepetido = Boolean(feriado.fecha && inhabilesSet?.has(feriado.fecha))
  const puedeFeriado = feriado.fecha && feriado.fecha >= hoy && descripcionOk && !feriadoRepetido && !saving

  async function guardarFeriado() {
    if (!puedeFeriado) return
    setError('')
    setSaving(true)
    const { error: e } = await supabase.from('plan_dias_inhabiles').insert({ fecha: feriado.fecha, descripcion: feriado.descripcion.trim() })
    setSaving(false)
    if (e) { setError('No se pudo agregar el feriado: ' + e.message); return }
    setFeriado({ fecha: '', descripcion: '' })
    setRecarga(r => r + 1)
    onCambio()
  }

  async function quitarFeriado(f) {
    if (!window.confirm(`¿Quitar el feriado del ${ddmm(f.fecha)} (${f.descripcion})?`)) return
    setError('')
    const { error: e } = await supabase.from('plan_dias_inhabiles').delete().eq('fecha', f.fecha)
    if (e) { setError('No se pudo quitar el feriado: ' + e.message); return }
    setRecarga(r => r + 1)
    onCambio()
  }

  const grupos = datos?.ausencias && cap ? agruparAusencias(datos.ausencias, cap) : []
  const proximosFeriados = (datos?.inhabiles || []).filter(f => f.fecha >= hoy)
  const SECCION = { fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'var(--surface)', border:'0.5px solid var(--border)', borderRadius:'10px', padding:'24px', width:'560px', maxWidth:'92vw', maxHeight:'90vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:'14px' }}>
        <div style={{ fontWeight:'700', fontSize:'15px' }}>Ausencias y feriados</div>
        <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', lineHeight:1.5 }}>
          Al asignar, el plan ya no propone trabajo en los días de ausencia de cada persona. Lo que ya estaba programado en esos días no se mueve solo: se corrige con REPROGRAMAR.
        </div>

        {!datos ? (
          <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted2)' }}>Cargando...</div>
        ) : (!datos.ausencias || !datos.inhabiles) ? (
          <div style={CAJA_ERROR}>No se pudieron leer las ausencias o los feriados. Intenta de nuevo más tarde.</div>
        ) : (
          <>
            <div style={SECCION}>REGISTRAR AUSENCIA</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
              <div>
                <div style={LABEL}>PERSONA *</div>
                <select value={form.persona} onChange={e => setForm(f => ({ ...f, persona: e.target.value }))}>
                  {integrantes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <div style={LABEL}>TIPO *</div>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                  {TIPOS_AUSENCIA.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div style={LABEL}>DESDE *</div>
                <input type="date" value={form.desde} min={hoy} onChange={e => setForm(f => ({ ...f, desde: e.target.value }))} />
              </div>
              <div>
                <div style={LABEL}>HASTA (VACÍO = UN SOLO DÍA)</div>
                <input type="date" value={form.hasta} min={form.desde || hoy} onChange={e => setForm(f => ({ ...f, hasta: e.target.value }))} />
              </div>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:'8px', fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', cursor:'pointer' }}>
              <input type="checkbox" checked={form.medio} onChange={e => setForm(f => ({ ...f, medio: e.target.checked }))} style={{ width:'auto' }} />
              Medio día (cada día del rango)
            </label>
            <div>
              <div style={LABEL}>NOTA (OPCIONAL)</div>
              <input type="text" value={form.nota} maxLength={120} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))}
                placeholder="Visible para todo el equipo: no escribas motivos de salud" />
            </div>
            {form.desde && (
              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color: avisoRango ? 'var(--red)' : 'var(--muted2)', lineHeight:1.5 }}>
                {avisoRango || (nuevos.length === 0
                  ? 'No hay días hábiles nuevos en ese rango para esta persona.'
                  : `Se registran ${nuevos.length} día${nuevos.length === 1 ? '' : 's'} hábil${nuevos.length === 1 ? '' : 'es'}: ${nuevos.map(ddmm).join(', ')}` +
                    (omitidos > 0 ? ` · ${omitidos} ya registrado${omitidos === 1 ? '' : 's'}` : '') +
                    ' · sin fines de semana ni feriados')}
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button onClick={guardarAusencia} disabled={!puedeGuardar}
                style={{ padding:'7px 14px', borderRadius:'5px', border:'none', background:'var(--orange)', color:'#080808', fontSize:'10px', fontFamily:'var(--mono)', fontWeight:'500', opacity: puedeGuardar ? 1 : 0.4 }}>
                {saving ? 'GUARDANDO...' : 'REGISTRAR AUSENCIA'}
              </button>
            </div>

            <div style={SECCION}>PRÓXIMAS AUSENCIAS · {grupos.length}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
              {grupos.length === 0 && <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)' }}>Sin ausencias registradas desde hoy.</div>}
              {grupos.map(g => (
                <div key={g.profile_id + g.desde} style={FILA_LISTA}>
                  <span style={{ color:'var(--text)', minWidth:0, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                    title={g.nota || undefined}>
                    {g.perfil?.nombre ?? '---'} · {g.desde === g.hasta ? ddmm(g.desde) : `${ddmm(g.desde)} al ${ddmm(g.hasta)} (${g.fechas.length} días)`} · {textoAusencia(g)}{g.nota ? ` · ${g.nota}` : ''}
                  </span>
                  <button onClick={() => quitarAusencia(g)} style={BOTON_CHICO}>QUITAR</button>
                </div>
              ))}
            </div>

            <div style={SECCION}>FERIADOS (TODO EL EQUIPO)</div>
            <div style={{ display:'grid', gridTemplateColumns:'150px 1fr auto', gap:'8px', alignItems:'end' }}>
              <div>
                <div style={LABEL}>FECHA *</div>
                <input type="date" value={feriado.fecha} min={hoy} onChange={e => setFeriado(f => ({ ...f, fecha: e.target.value }))} />
              </div>
              <div>
                <div style={LABEL}>DESCRIPCIÓN *</div>
                <input type="text" value={feriado.descripcion} maxLength={80} onChange={e => setFeriado(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Ej. Día de la Revolución" />
              </div>
              <button onClick={guardarFeriado} disabled={!puedeFeriado}
                style={{ padding:'7px 12px', borderRadius:'5px', border:'0.5px solid var(--border2)', background:'none', color:'var(--text)', fontSize:'9px', fontFamily:'var(--mono)', opacity: puedeFeriado ? 1 : 0.4 }}>
                AGREGAR
              </button>
            </div>
            {feriadoRepetido && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--red)' }}>Ese día ya es feriado.</div>}
            <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
              {proximosFeriados.length === 0 && <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)' }}>Sin feriados desde hoy.</div>}
              {proximosFeriados.map(f => (
                <div key={f.fecha} style={FILA_LISTA}>
                  <span style={{ color:'var(--text)', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {DIAS[diaSemanaIso(f.fecha) - 1] ?? ''} {ddmm(f.fecha)}/{f.fecha.slice(0, 4)} · {f.descripcion}
                  </span>
                  <button onClick={() => quitarFeriado(f)} style={BOTON_CHICO}>QUITAR</button>
                </div>
              ))}
            </div>
          </>
        )}

        {error && <div style={CAJA_ERROR}>{error}</div>}

        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button onClick={onCerrar}
            style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid var(--border)', background:'none', color:'var(--muted2)', fontSize:'10px', fontFamily:'var(--mono)' }}>
            CERRAR
          </button>
        </div>
      </div>
    </div>
  )
}

async function cargarSemana(lun, hoy) {
  const vie = sumarDias(lun, 4)
  const [integrantes, capacidad, inhabiles, ausencias, carga, cargaActividad, parametros, atrasadas, actSemana] = await Promise.all([
    consultar(supabase.from('plan_integrantes').select('profile_id, orden, perfil:profiles(id,nombre,iniciales)').eq('activo', true).order('orden')),
    consultar(supabase.from('plan_capacidad').select('dia_semana,jornadas,etiqueta,vigente_desde,vigente_hasta')),
    consultar(supabase.from('plan_dias_inhabiles').select('fecha,descripcion').gte('fecha', lun).lte('fecha', vie)),
    consultar(supabase.from('plan_ausencias').select('profile_id,fecha,fraccion,tipo,nota').gte('fecha', lun).lte('fecha', vie)),
    consultar(supabase.from('plan_carga_uo').select('uo_id,fecha,responsable_id,jornadas').gte('fecha', lun).lte('fecha', vie)),
    consultar(supabase.from('plan_carga_actividad').select('actividad_id,fecha,responsable_id,jornadas,actividad:actividades_uo(uo_id)').gte('fecha', lun).lte('fecha', vie)),
    consultar(supabase.from('plan_parametros').select('clave,valor,vigente_desde,vigente_hasta').eq('clave', 'jornada_minima_uo')),
    consultar(supabase.from('actividades_uo').select('uo_id').lt('fecha_programada', hoy).is('completada_en', null)),
    consultar(supabase.from('actividades_uo').select('uo_id').gte('fecha_programada', lun).lte('fecha_programada', vie)),
  ])
  // Carga de la validación con el uo_id de su actividad; null si la consulta falló
  const cargaVal = cargaActividad
    ? cargaActividad.filter(c => c.actividad?.uo_id).map(c => ({ ...c, uo_id: c.actividad.uo_id }))
    : null

  const uoIds = [...new Set([...(carga || []), ...(cargaVal || []), ...(atrasadas || []), ...(actSemana || [])].map(r => r.uo_id))]
  let actividades = [], uos = []
  if (uoIds.length > 0) {
    ;[actividades, uos] = await Promise.all([
      consultar(supabase.from('actividades_uo')
        .select('id,uo_id,nombre,orden,ronda,responsable_id,fecha_programada,fecha_origen,completada_en,plantilla:plantillas_actividad(momento_creacion)')
        .in('uo_id', uoIds)),
      consultar(supabase.from('unidades_operativas')
        .select('id,referencia_operativa,nombre,km_teoricos,fecha_entrega_programada')
        .in('id', uoIds)),
    ])
  }

  return { lunes: lun, integrantes, capacidad, inhabiles, ausencias, carga, cargaVal, parametros, actividades, uos }
}

function Encabezado({ dias, etiquetaDia, hoy }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:COLUMNAS, borderBottom:'0.5px solid var(--border2)' }}>
      <div style={{ ...TH, borderBottom:'none' }}>Integrante</div>
      {dias.map((f, i) => (
        <div key={f} style={{ ...TH, borderBottom:'none', borderLeft:'0.5px solid var(--border2)', background: f === hoy ? 'rgba(249,115,22,0.06)' : 'none', minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <span>{DIAS[i]} {ddmm(f)}</span>
            {f === hoy && <span style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'1px 5px', borderRadius:'3px', background:'rgba(249,115,22,0.18)', color:'var(--orange)', letterSpacing:'0.08em' }}>HOY</span>}
          </div>
          {etiquetaDia[f] && <div title={etiquetaDia[f]} style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', textTransform:'none', letterSpacing:0, fontWeight:400, marginTop:'2px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{etiquetaDia[f]}</div>}
        </div>
      ))}
      <div style={{ ...TH, borderBottom:'none', borderLeft:'0.5px solid var(--border2)' }}>Semana</div>
    </div>
  )
}

function CeldaPersona({ p, filas }) {
  return (
    <div style={{ gridColumn:1, gridRow:`1 / span ${filas}`, padding:'10px 16px', display:'flex', alignItems:'flex-start', gap:'8px' }}>
      <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--surface2)', color:'var(--accent-a)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:'9px', flexShrink:0, border:'0.5px solid var(--border)' }}>{p.iniciales}</div>
      <div style={{ fontSize:'11px', fontWeight:600, lineHeight:1.3 }}>{p.nombre}</div>
    </div>
  )
}

// Fondo rayado y etiqueta abajo cuando la persona está ausente ese día
const FONDO_AUSENCIA = 'repeating-linear-gradient(135deg, rgba(148,163,184,0.10) 0 6px, transparent 6px 12px)'

function EtiquetaAusencia({ a }) {
  return (
    <span title={a.nota ? `${textoAusencia(a)} · ${a.nota}` : textoAusencia(a)}
      style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'1px 5px', borderRadius:'3px', background:'rgba(148,163,184,0.16)', color:'var(--muted2)', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>
      {textoAusencia(a).toUpperCase()}
    </span>
  )
}

function FondoDias({ dias, hoy, filas, ausencias = [] }) {
  return dias.map((f, i) => {
    const a = ausencias[i]
    return (
      <div key={f} style={{ gridColumn:i + 2, gridRow:`1 / span ${filas}`, borderLeft:'0.5px solid var(--border2)', display:'flex', alignItems:'flex-end', justifyContent:'flex-end', padding:'4px 6px',
        background: a ? FONDO_AUSENCIA : f === hoy ? 'rgba(249,115,22,0.04)' : 'none' }}>
        {a && <EtiquetaAusencia a={a} />}
      </div>
    )
  })
}

function TarjetaUo({ it, uo, pasos, hoy, onAbrir, onReprogramar }) {
  const { estados, ajustadas, ultima, tarde, tono } = resumenTarjeta(uo, pasos, hoy)
  const color = `var(--${tono})`
  return (
    <div onClick={onAbrir}
      style={{ gridColumn:`${it.ini + 2} / ${it.fin + 3}`, gridRow:it.carril + 1, position:'relative', zIndex:1, minWidth:0, margin:'4px 6px', cursor:'pointer',
        background:'var(--surface2)', border:'0.5px solid var(--border2)', borderLeft:'2px solid ' + color, borderRadius:'6px', padding:'6px 8px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', minWidth:0 }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--orange)', flexShrink:0 }}>{uo.referencia_operativa}</span>
        {sinKm(uo) ? (
          <span title="Sin km teóricos: el plan reservó solo la jornada mínima. Corrige el km en la ficha (solo el coordinador)."
            style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'1px 5px', borderRadius:'3px', background:'rgba(234,179,8,0.12)', color:'var(--yellow)', flexShrink:0 }}>
            SIN KM
          </span>
        ) : (
          <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', flexShrink:0 }}>{fmt(uo.km_teoricos)} km</span>
        )}
        {tarde && (
          <span title={`La ultima actividad (${ddmm(ultima)}) cae despues de la entrega programada (${ddmm(uo.fecha_entrega_programada)})`}
            style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'1px 5px', borderRadius:'3px', background:'rgba(239,68,68,0.12)', color:'var(--red)', flexShrink:0 }}>
            ENTREGA {ddmm(uo.fecha_entrega_programada)}
          </span>
        )}
      </div>
      <div title={uo.nombre} style={{ fontSize:'10px', color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', margin:'3px 0 5px 0' }}>{uo.nombre}</div>
      <div style={{ display:'flex', alignItems:'center', gap:'3px' }}>
        {PASOS.map((o, i) => {
          const a = pasos[o], e = estados[i]
          return (
            <div key={o} title={a ? `${a.nombre} · ${a.fecha_programada ? ddmm(a.fecha_programada) : 'sin fecha'} · ${e}` : 'Sin actividad'}
              style={{ width:14, height:14, borderRadius:'3px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:'9px', fontWeight:700,
                border:'0.5px solid ' + (e === 'hecha' ? 'var(--green)' : e === 'atrasada' ? 'var(--red)' : 'var(--border)'),
                background: e === 'hecha' ? 'rgba(34,197,94,0.18)' : e === 'atrasada' ? 'rgba(239,68,68,0.15)' : 'none',
                color: e === 'hecha' ? 'var(--green)' : 'var(--red)' }}>
              {e === 'hecha' ? '✓' : e === 'atrasada' ? '!' : ''}
            </div>
          )
        })}
        {ajustadas.length > 0 && (
          <span title={'Fecha ajustada a mano: ' + ajustadas.map(a => a.nombre).join(', ')}
            style={{ color:'var(--accent-a)', fontSize:'11px', marginLeft:'3px', lineHeight:1 }}>✎</span>
        )}
        {onReprogramar && (
          <button onClick={e => { e.stopPropagation(); onReprogramar() }} title="Reprogramar una actividad de esta UO"
            style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'2px 5px', borderRadius:'4px', border:'0.5px solid rgba(139,92,246,0.35)', background:'rgba(139,92,246,0.08)', color:'var(--accent-a)', cursor:'pointer', marginLeft:'auto' }}>
            REPROGRAMAR
          </button>
        )}
      </div>
    </div>
  )
}

// Validación de calidad: punteada; se completa sola cuando la UO pasa a Validada
function TarjetaValidacion({ it, uo, hoy, onAbrir, onReprogramar }) {
  const e = estadoPaso(it.act, hoy)
  const color = e === 'hecha' ? 'var(--green)' : e === 'atrasada' ? 'var(--red)' : 'var(--border)'
  return (
    <div onClick={onAbrir} title={`${it.act.nombre} · ${ddmm(it.act.fecha_programada)} · se completa al validar en el checklist`}
      style={{ gridColumn:`${it.ini + 2} / ${it.fin + 3}`, gridRow:it.carril + 1, position:'relative', zIndex:1, minWidth:0, margin:'4px 6px', cursor:'pointer',
        border:'1px dashed ' + color, borderRadius:'6px', padding:'6px 8px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', minWidth:0 }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', flexShrink:0 }}>{uo.referencia_operativa}</span>
        {e !== 'pendiente' && (
          <span style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'1px 5px', borderRadius:'3px', flexShrink:0,
            background: e === 'hecha' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color }}>
            {e === 'hecha' ? 'HECHA' : 'ATRASADA'}
          </span>
        )}
        {it.act.fecha_origen === 'ajustada' && (
          <span title="Fecha ajustada a mano" style={{ color:'var(--accent-a)', fontSize:'11px', lineHeight:1 }}>✎</span>
        )}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', marginTop:'3px' }}>
        <div style={{ fontSize:'10px', color:'var(--muted2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', minWidth:0 }}>{it.act.nombre}</div>
        {onReprogramar && !it.act.completada_en && (
          <button onClick={ev => { ev.stopPropagation(); onReprogramar() }} title="Reprogramar la validacion"
            style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'2px 5px', borderRadius:'4px', border:'0.5px solid rgba(139,92,246,0.35)', background:'rgba(139,92,246,0.08)', color:'var(--accent-a)', cursor:'pointer', marginLeft:'auto', flexShrink:0 }}>
            REPROGRAMAR
          </button>
        )}
      </div>
    </div>
  )
}

function Barra({ valor, total, color }) {
  const pct = total > 0 ? Math.min(100, (valor / total) * 100) : (valor > 0 ? 100 : 0)
  return (
    <div style={{ height:'5px', background:'var(--border2)', borderRadius:'3px', overflow:'hidden', margin:'4px 0' }}>
      <div style={{ height:'100%', width: pct + '%', background: color, borderRadius:'3px' }} />
    </div>
  )
}

export default function PlanSemanal() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [hoy] = useState(hoyMexico)
  const [lunes, setLunes] = useState(() => lunesDe(hoyMexico()))
  const [vista, setVista] = useState('plan')
  const [datos, setDatos] = useState(null)
  const [recarga, setRecarga] = useState(0)
  const [reprogramar, setReprogramar] = useState(null)  // { uoId, actividadId }
  const [verAusencias, setVerAusencias] = useState(false)

  useEffect(() => {
    if (profile && profile.rol !== 'coordinador') navigate('/')
  }, [profile])

  useEffect(() => {
    let actual = true
    cargarSemana(lunes, hoy).then(d => { if (actual) setDatos(d) })
    return () => { actual = false }
  }, [lunes, hoy, recarga])

  const loading = !datos || datos.lunes !== lunes
  // "Pendientes de hoy" solo tiene sentido en la semana que contiene hoy
  const esSemanaActual = lunes === lunesDe(hoy)

  const m = useMemo(() => {
    if (!datos) return null
    const dias = [0, 1, 2, 3, 4].map(i => sumarDias(lunes, i))
    const vie = dias[4]
    const enSemana = f => f && f >= lunes && f <= vie

    const integrantes = (datos.integrantes || []).filter(r => r.perfil).map(r => r.perfil)
    const ids = new Set(integrantes.map(p => p.id))

    const inhabil = Object.fromEntries((datos.inhabiles || []).map(r => [r.fecha, r.descripcion]))
    const capDia = {}, etiquetaDia = {}
    for (const f of dias) {
      const fila = datos.capacidad ? vigente(datos.capacidad.filter(r => r.dia_semana === diaSemanaIso(f)), f) : null
      capDia[f] = inhabil[f] ? 0 : Number(fila?.jornadas ?? 0)
      etiquetaDia[f] = inhabil[f] ? 'Inhábil · ' + inhabil[f] : (fila?.etiqueta || null)
    }

    // Ausencias de la semana por persona y día; la ausencia ocupa su parte de la
    // capacidad del día (igual que public.plan_carga_persona en la base)
    const ausencias = Object.fromEntries((datos.ausencias || []).map(a => [`${a.profile_id}|${a.fecha}`, a]))
    const ausenciaDe = (persona, f) => ausencias[`${persona}|${f}`] || null
    const capPersona = (persona, f) => capDia[f] * (1 - Number(ausenciaDe(persona, f)?.fraccion ?? 0))

    const uoPorId = Object.fromEntries((datos.uos || []).map(u => [u.id, u]))
    const actividades = (datos.actividades || []).filter(a => uoPorId[a.uo_id])
    const pasosPorUo = {}
    for (const a of actividades) {
      if (!PASOS.includes(a.orden)) continue
      ;(pasosPorUo[a.uo_id] ||= {})[a.orden] = a
    }

    // Vista Plan: tramos (UO x persona) con los días de la semana que ocupan
    const tramos = {}
    const agregarDia = (persona, uoId, f, tipo = 'uo', act = null) => {
      if (!ids.has(persona) || !enSemana(f)) return
      const key = tipo === 'uo' ? `${persona}|${uoId}` : `${persona}|${act.id}`
      const t = (tramos[key] ||= { persona, uoId, tipo, act, dias: new Set() })
      t.dias.add(dias.indexOf(f))
    }
    for (const c of (datos.carga || [])) if (uoPorId[c.uo_id]) agregarDia(c.responsable_id, c.uo_id, c.fecha)
    for (const a of actividades) {
      if (PASOS.includes(a.orden)) agregarDia(a.responsable_id, a.uo_id, a.fecha_programada)
      else if (esValidacion(a)) agregarDia(a.responsable_id, a.uo_id, a.fecha_programada, 'validacion', a)  // tarjeta punteada
    }
    const validacionesDe = id => actividades.filter(a => a.responsable_id === id && esValidacion(a) && enSemana(a.fecha_programada))

    const filasPlan = integrantes.map(p => {
      const items = Object.values(tramos)
        .filter(t => t.persona === p.id)
        .map(t => ({ ...t, ini: Math.min(...t.dias), fin: Math.max(...t.dias) }))
        .sort((a, b) => a.ini - b.ini || b.fin - a.fin)
      // Carriles: cada tramo va al primer carril donde no se encima con otro
      const finCarril = []
      for (const it of items) {
        let c = finCarril.findIndex(fin => fin < it.ini)
        if (c === -1) { c = finCarril.length; finCarril.push(it.fin) } else finCarril[c] = it.fin
        it.carril = c
      }
      const actsSemana = actividades.filter(a => a.responsable_id === p.id && PASOS.includes(a.orden) && enSemana(a.fecha_programada))
      const vals = validacionesDe(p.id)
      return {
        persona: p,
        items,
        ausencias: dias.map(f => ausenciaDe(p.id, f)),
        carriles: Math.max(finCarril.length, 1),
        planeadas: actsSemana.length,
        hechas: actsSemana.filter(a => a.completada_en).length,
        atrasadas: actsSemana.filter(a => estadoPaso(a, hoy) === 'atrasada').length,
        valPlaneadas: vals.length,
        valHechas: vals.filter(a => a.completada_en).length,
      }
    })

    // Vista Carga: suma la carga de las UOs y la de las validaciones (el analista también digitaliza)
    const cargaTotal = [
      ...(datos.carga || []),
      ...(datos.cargaVal || []).map(c => ({ ...c, validacion: true })),
    ]
    const filasCarga = integrantes.map(p => {
      const celdas = dias.map(f => {
        const filas = cargaTotal.filter(c => c.responsable_id === p.id && c.fecha === f)
        const j = filas.reduce((s, c) => s + Number(c.jornadas), 0)
        const refs = filas
          .filter(c => uoPorId[c.uo_id])
          .map(c => uoPorId[c.uo_id].referencia_operativa + (c.validacion ? ' (val)' : ''))
        return { fecha: f, j, cap: capPersona(p.id, f), refs, ausencia: ausenciaDe(p.id, f) }
      })
      const j = celdas.reduce((s, c) => s + c.j, 0)
      const cap = celdas.reduce((s, c) => s + c.cap, 0)
      const libre = celdas.reduce((s, c) => s + Math.max(0, c.cap - c.j), 0)
      const sobrecarga = celdas.reduce((s, c) => s + Math.max(0, c.j - c.cap), 0)
      return { persona: p, celdas, j, cap, libre, sobrecarga }
    })

    const minimo = datos.parametros ? Number(vigente(datos.parametros, hoy)?.valor) : NaN
    const dondeAsignar = Number.isFinite(minimo) && minimo > 0
      ? filasCarga
          .map(f => ({
            persona: f.persona,
            libre: f.libre,
            diasLibres: f.celdas.filter(c => c.cap - c.j > EPS).map(c => ({ fecha: c.fecha, libre: c.cap - c.j })),
            caben: f.celdas.reduce((s, c) => s + Math.floor(Math.max(0, c.cap - c.j) / minimo + 1e-9), 0),
          }))
          .sort((a, b) => b.libre - a.libre)
      : null

    // Carga que quedó en un día de ausencia y ya no cabe (no se mueve sola: REPROGRAMAR).
    // Una fila por persona, día y UO; la validación se reprograma por su actividad.
    const cargaEnAusencia = filasCarga.flatMap(f => f.celdas
      .filter(c => c.ausencia && c.j > c.cap + EPS)
      .flatMap(c => cargaTotal
        .filter(r => r.responsable_id === f.persona.id && r.fecha === c.fecha && uoPorId[r.uo_id])
        .map(r => ({
          key: `${f.persona.id}|${c.fecha}|${r.uo_id}|${r.validacion ? 'v' : 'u'}`,
          persona: f.persona, fecha: c.fecha, ausencia: c.ausencia,
          uoId: r.uo_id, uo: uoPorId[r.uo_id], validacion: Boolean(r.validacion),
          actividadId: r.validacion ? r.actividad_id : null, jornadas: Number(r.jornadas),
        }))))

    // Atrasos (de cualquier semana) de los integrantes
    const atrasos = actividades
      .filter(a => ids.has(a.responsable_id) && estadoPaso(a, hoy) === 'atrasada')
      .map(a => ({ ...a, uo: uoPorId[a.uo_id], persona: integrantes.find(p => p.id === a.responsable_id) }))
      .sort((a, b) => (a.fecha_programada < b.fecha_programada ? -1 : 1))

    // KPIs: los pasos del digitalizador y las validaciones van aparte
    const planeadas = filasPlan.reduce((s, f) => s + f.planeadas, 0)
    const kpis = {
      hechas: filasPlan.reduce((s, f) => s + f.hechas, 0),
      planeadas,
      pendientesHoy: actividades.filter(a => ids.has(a.responsable_id) && PASOS.includes(a.orden) && a.fecha_programada === hoy && !a.completada_en).length,
      atrasadas: atrasos.filter(a => !esValidacion(a)).length,
      valHechas: filasPlan.reduce((s, f) => s + f.valHechas, 0),
      valPlaneadas: filasPlan.reduce((s, f) => s + f.valPlaneadas, 0),
      valAtrasadas: atrasos.filter(esValidacion).length,
      jornadas: filasCarga.reduce((s, f) => s + f.j, 0),
      capacidad: filasCarga.reduce((s, f) => s + f.cap, 0),
    }

    // UOs con alguna actividad pendiente y con fecha (se pueden reprogramar)
    const reprogramables = new Set(actividades.filter(a => !a.completada_en && a.fecha_programada).map(a => a.uo_id))
    const nombres = Object.fromEntries(integrantes.map(p => [p.id, p.nombre]))

    return { dias, capDia, etiquetaDia, uoPorId, pasosPorUo, filasPlan, filasCarga, dondeAsignar, cargaEnAusencia, atrasos, kpis, reprogramables, nombres, integrantes }
  }, [datos, lunes, hoy])

  // Secciones que se muestran solo si sus consultas respondieron
  const okPlan = datos && datos.integrantes && datos.carga && datos.capacidad && datos.inhabiles && datos.actividades && datos.uos
  const okCarga = datos && datos.integrantes && datos.carga && datos.capacidad && datos.inhabiles && datos.uos
  const esCoordinador = profile?.rol === 'coordinador'

  function descargarPDF() {
    if (!m) return
    generarPDFPlanSemanal({
      semana: textoSemana(lunes),
      lunes,
      dias: m.dias.map((f, i) => ({ etiqueta: `${DIAS[i]} ${ddmm(f)}`, nota: m.etiquetaDia[f], esHoy: f === hoy })),
      kpis: okPlan ? [
        { label: 'ACTIVIDADES HECHAS', val: `${m.kpis.hechas} / ${m.kpis.planeadas}`, sub: 'Planeadas en la semana', tono: 'green' },
        esSemanaActual
          ? { label: 'PENDIENTES DE HOY', val: String(m.kpis.pendientesHoy), sub: 'Vencen el ' + ddmm(hoy), tono: 'orange' }
          : { label: 'PENDIENTES DE HOY', val: '-', sub: 'Solo en la semana actual', tono: 'dark' },
        { label: 'ATRASADAS', val: String(m.kpis.atrasadas), sub: 'De cualquier semana', tono: m.kpis.atrasadas > 0 ? 'red' : 'dark' },
        { label: 'VALIDACIONES', val: `${m.kpis.valHechas} / ${m.kpis.valPlaneadas}`,
          sub: m.kpis.valAtrasadas > 0 ? `${m.kpis.valAtrasadas} atrasada${m.kpis.valAtrasadas === 1 ? '' : 's'}` : 'Planeadas en la semana',
          tono: m.kpis.valAtrasadas > 0 ? 'red' : 'blue' },
        { label: 'JORNADAS PLANEADAS', val: `${fmt(m.kpis.jornadas)} / ${fmt(m.kpis.capacidad)}`, sub: 'Contra la capacidad de la semana', tono: 'blue' },
      ] : null,
      plan: okPlan ? m.filasPlan.map(f => ({
        nombre: f.persona.nombre,
        carriles: f.carriles,
        ausencias: f.ausencias.map(a => (a ? textoAusencia(a) : null)),
        hechas: f.hechas, planeadas: f.planeadas, atrasadas: f.atrasadas,
        items: f.items.map(it => {
          const uo = m.uoPorId[it.uoId]
          const base = { tipo: it.tipo, ini: it.ini, fin: it.fin, carril: it.carril, referencia: uo.referencia_operativa }
          if (it.tipo !== 'uo') return { ...base, nombre: it.act.nombre }
          const r = resumenTarjeta(uo, m.pasosPorUo[it.uoId] || {}, hoy)
          return {
            ...base,
            km: sinKm(uo) ? 'SIN KM' : fmt(uo.km_teoricos) + ' km',
            nombre: uo.nombre,
            estados: r.estados,
            ajustada: r.ajustadas.length > 0,
            entrega: r.tarde ? 'ENTREGA ' + ddmm(uo.fecha_entrega_programada) : null,
            tono: r.tono,
          }
        }),
      })) : null,
      atrasos: okPlan ? m.atrasos.map(a => ({
        persona: a.persona?.nombre ?? '---',
        referencia: a.uo?.referencia_operativa ?? '',
        proyecto: a.uo?.nombre ?? '',
        actividad: a.nombre,
        fecha: ddmm(a.fecha_programada),
        dias: String(diasEntre(a.fecha_programada, hoy)),
      })) : null,
      carga: okCarga ? m.filasCarga.map(f => ({
        nombre: f.persona.nombre,
        celdas: f.celdas.map(c => {
          const e = estadoCarga(c.j, c.cap)
          return { texto: `${fmt(c.j)} / ${fmt(c.cap)}`, j: c.j, cap: c.cap, estado: e.txt, tono: e.tono, refs: c.refs,
            ausencia: c.ausencia ? textoAusencia(c.ausencia) : null }
        }),
        total: {
          texto: `${fmt(f.j)} / ${fmt(f.cap)}`, j: f.j, cap: f.cap, tono: estadoCarga(f.j, f.cap).tono,
          libre: 'Libre ' + fmt(f.libre),
          sobrecarga: f.sobrecarga > EPS ? 'Sobrecarga +' + fmt(f.sobrecarga) : null,
        },
      })) : null,
      dondeAsignar: okCarga && m.dondeAsignar ? m.dondeAsignar.map(d => ({
        nombre: d.persona.nombre,
        resumen: `Libre ${fmt(d.libre)} · caben ${d.caben} UO${d.caben === 1 ? '' : 's'} cortas`,
        dias: d.diasLibres.length > 0
          ? d.diasLibres.map(x => `${DIAS[m.dias.indexOf(x.fecha)]} ${fmt(x.libre)}`).join(' · ')
          : 'Sin espacio libre esta semana',
        tieneLibre: d.libre > EPS,
      })) : null,
    })
  }

  return (
    <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:'16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <span style={{ fontFamily:'var(--disp)', fontWeight:700, fontSize:'14px' }}>Plan semanal</span>
          <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', marginTop:'2px' }}>{textoSemana(lunes)}</div>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={() => setLunes(l => sumarDias(l, -7))}
            style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid var(--border2)', background:'none', color:'var(--muted2)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
            ← SEMANA ANTERIOR
          </button>
          {lunes !== lunesDe(hoy) && (
            <button onClick={() => setLunes(lunesDe(hoy))}
              style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid var(--border2)', background:'none', color:'var(--muted2)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
              ESTA SEMANA
            </button>
          )}
          <button onClick={() => setLunes(l => sumarDias(l, 7))}
            style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid var(--border2)', background:'none', color:'var(--muted2)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer' }}>
            SEMANA SIGUIENTE →
          </button>
          {esCoordinador && (
            <button onClick={() => setVerAusencias(true)} disabled={loading || !m || !datos?.capacidad}
              style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid rgba(139,92,246,0.35)', background:'rgba(139,92,246,0.08)', color:'var(--accent-a)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer', opacity: loading || !m || !datos?.capacidad ? 0.4 : 1 }}>
              AUSENCIAS Y FERIADOS
            </button>
          )}
          <button onClick={descargarPDF} disabled={loading || !m}
            style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid var(--border2)', background:'none', color:'var(--muted2)', fontSize:'9px', fontFamily:'var(--mono)', cursor:'pointer', opacity: loading || !m ? 0.4 : 1 }}>
            DESCARGAR PDF
          </button>
          <div style={{ display:'flex', background:'var(--surface2)', borderRadius:'6px', padding:'2px', gap:'1px' }}>
            {VISTAS.map(v => (
              <button key={v.key} onClick={() => setVista(v.key)}
                style={{ padding:'5px 12px', borderRadius:'4px', fontSize:'9px', border:'none', fontFamily:'var(--mono)',
                  background: vista === v.key ? 'var(--accent-gradient)' : 'none',
                  color: vista === v.key ? '#fff' : 'var(--muted2)', cursor:'pointer' }}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading || !m ? (
        <div style={{ fontFamily:'var(--mono)', fontSize:'11px', color:'var(--muted2)', padding:'24px 0' }}>Cargando...</div>
      ) : (
        <>
          {okPlan && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'8px' }}>
              <Kpi icon={ICONS.check} label="ACTIVIDADES HECHAS" value={`${m.kpis.hechas} / ${m.kpis.planeadas}`} color="var(--green)" sub="Planeadas en la semana" />
              {esSemanaActual
                ? <Kpi icon={ICONS.reloj} label="PENDIENTES DE HOY" value={m.kpis.pendientesHoy} color="var(--orange)" sub={'Vencen el ' + ddmm(hoy)} />
                : <Kpi icon={ICONS.reloj} label="PENDIENTES DE HOY" value="—" color="var(--muted2)" sub="Solo en la semana actual" />}
              <Kpi icon={ICONS.alerta} label="ATRASADAS" value={m.kpis.atrasadas} color={m.kpis.atrasadas > 0 ? 'var(--red)' : 'var(--text)'} sub="De cualquier semana" />
              <Kpi icon={ICONS.check} label="VALIDACIONES" value={`${m.kpis.valHechas} / ${m.kpis.valPlaneadas}`} color="var(--accent-a)"
                sub={m.kpis.valAtrasadas > 0 ? `${m.kpis.valAtrasadas} atrasada${m.kpis.valAtrasadas === 1 ? '' : 's'}` : 'Planeadas en la semana'} />
              <Kpi icon={ICONS.gauge} label="JORNADAS PLANEADAS" value={`${fmt(m.kpis.jornadas)} / ${fmt(m.kpis.capacidad)}`} color="var(--blue)" sub="Contra la capacidad de la semana" />
            </div>
          )}

          {datos.ausencias === null && (
            <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>
              No se pudieron leer las ausencias: la capacidad mostrada no las descuenta.
            </div>
          )}

          {okCarga && m.cargaEnAusencia.length > 0 && (
            <div className="glass" style={{ borderRadius:'10px', padding:'12px 16px', display:'flex', flexDirection:'column', gap:'6px', borderLeft:'2px solid var(--orange)' }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--orange)', letterSpacing:'0.12em' }}>
                CARGA EN DÍAS DE AUSENCIA · {m.cargaEnAusencia.length} · NO SE MUEVE SOLA: CORRÍGELA CON REPROGRAMAR
              </div>
              {m.cargaEnAusencia.map(c => (
                <div key={c.key} style={{ display:'flex', alignItems:'center', gap:'10px', fontFamily:'var(--mono)', fontSize:'9px' }}>
                  <span style={{ minWidth:0, flex:1 }}>
                    {c.persona.nombre} · {DIAS[diaSemanaIso(c.fecha) - 1]} {ddmm(c.fecha)} ({textoAusencia(c.ausencia)}) ·{' '}
                    <span style={{ color:'var(--orange)' }}>{c.uo.referencia_operativa}</span>{c.validacion ? ' (validación)' : ''} · {fmt(c.jornadas)} jornadas
                  </span>
                  {esCoordinador && (
                    <button onClick={() => setReprogramar({ uoId: c.uoId, actividadId: c.actividadId })}
                      style={{ fontFamily:'var(--mono)', fontSize:'8px', padding:'4px 8px', borderRadius:'4px', border:'0.5px solid rgba(139,92,246,0.35)', background:'rgba(139,92,246,0.08)', color:'var(--accent-a)', cursor:'pointer', flexShrink:0 }}>
                      REPROGRAMAR
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {vista === 'plan' && okPlan && (
            <>
              <div className="glass" style={{ borderRadius:'var(--radius-lg)', overflowX:'auto' }}>
                <div style={{ minWidth:'1100px' }}>
                  <Encabezado dias={m.dias} etiquetaDia={m.etiquetaDia} hoy={hoy} />
                  {m.filasPlan.length === 0 && (
                    <div style={{ padding:'16px', fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)' }}>Sin integrantes activos en plan_integrantes.</div>
                  )}
                  {m.filasPlan.map(f => (
                    <div key={f.persona.id} style={{ display:'grid', gridTemplateColumns:COLUMNAS, gridAutoRows:'minmax(64px, auto)', borderBottom:'0.5px solid var(--border2)' }}>
                      <CeldaPersona p={f.persona} filas={f.carriles} />
                      <FondoDias dias={m.dias} hoy={hoy} filas={f.carriles} ausencias={f.ausencias} />
                      {f.items.map(it => it.tipo === 'uo'
                        ? <TarjetaUo key={it.persona + it.uoId} it={it} uo={m.uoPorId[it.uoId]} pasos={m.pasosPorUo[it.uoId] || {}} hoy={hoy}
                            onAbrir={() => navigate('/backlog/' + it.uoId)}
                            onReprogramar={esCoordinador && m.reprogramables.has(it.uoId) ? () => setReprogramar({ uoId: it.uoId, actividadId: null }) : null} />
                        : <TarjetaValidacion key={it.persona + it.act.id} it={it} uo={m.uoPorId[it.uoId]} hoy={hoy}
                            onAbrir={() => navigate('/backlog/' + it.uoId)}
                            onReprogramar={esCoordinador ? () => setReprogramar({ uoId: it.uoId, actividadId: it.act.id }) : null} />)}
                      <div style={{ gridColumn:7, gridRow:`1 / span ${f.carriles}`, borderLeft:'0.5px solid var(--border2)', padding:'10px 14px' }}>
                        <div style={{ fontFamily:'var(--disp)', fontSize:'16px', fontWeight:700 }}>{f.hechas} / {f.planeadas}</div>
                        <Barra valor={f.hechas} total={f.planeadas} color="var(--green)" />
                        <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color: f.atrasadas > 0 ? 'var(--red)' : 'var(--muted2)' }}>
                          {f.atrasadas} atrasada{f.atrasadas === 1 ? '' : 's'}
                        </div>
                        {f.valPlaneadas > 0 && (
                          <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'4px' }}>
                            Val. {f.valHechas} / {f.valPlaneadas}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass" style={{ borderRadius:'var(--radius-lg)', overflowX:'auto' }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', padding:'12px 16px 0 16px' }}>
                  ATRASOS A REVISAR · {m.atrasos.length}
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'760px' }}>
                  <thead>
                    <tr>{['Persona', 'UO', 'Proyecto', 'Actividad', 'Fecha programada', 'Dias de atraso', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {m.atrasos.length === 0 && (
                      <tr><td colSpan={7} style={{ ...TD, fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)' }}>Sin atrasos.</td></tr>
                    )}
                    {m.atrasos.map(a => (
                      <tr key={a.id}>
                        <td style={TD}>{a.persona?.nombre ?? '---'}</td>
                        <td style={{ ...TD, fontFamily:'var(--mono)', color:'var(--orange)' }}>{a.uo?.referencia_operativa}</td>
                        <td style={{ ...TD, maxWidth:'240px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={a.uo?.nombre}>{a.uo?.nombre}</td>
                        <td style={TD}>{a.nombre}</td>
                        <td style={{ ...TD, fontFamily:'var(--mono)' }}>{ddmm(a.fecha_programada)}</td>
                        <td style={{ ...TD, fontFamily:'var(--mono)', color:'var(--red)' }}>{diasEntre(a.fecha_programada, hoy)}</td>
                        <td style={{ ...TD, whiteSpace:'nowrap' }}>
                          {esCoordinador && (
                            <button onClick={() => setReprogramar({ uoId: a.uo_id, actividadId: a.id })}
                              style={{ fontFamily:'var(--mono)', fontSize:'8px', padding:'4px 8px', borderRadius:'4px', border:'0.5px solid rgba(139,92,246,0.35)', background:'rgba(139,92,246,0.08)', color:'var(--accent-a)', cursor:'pointer', marginRight:'6px' }}>
                              REPROGRAMAR
                            </button>
                          )}
                          <button onClick={() => navigate('/backlog/' + a.uo_id)}
                            style={{ fontFamily:'var(--mono)', fontSize:'8px', padding:'4px 8px', borderRadius:'4px', border:'0.5px solid rgba(249,115,22,0.3)', background:'rgba(249,115,22,0.08)', color:'var(--orange)', cursor:'pointer' }}>
                            VER FICHA
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {vista === 'carga' && okCarga && (
            <>
              {!datos.cargaVal && (
                <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>
                  No se pudo leer la carga de las validaciones: la carga mostrada solo incluye la de las UOs.
                </div>
              )}
              <div className="glass" style={{ borderRadius:'var(--radius-lg)', overflowX:'auto' }}>
                <div style={{ minWidth:'1100px' }}>
                  <Encabezado dias={m.dias} etiquetaDia={m.etiquetaDia} hoy={hoy} />
                  {m.filasCarga.length === 0 && (
                    <div style={{ padding:'16px', fontFamily:'var(--mono)', fontSize:10, color:'var(--muted)' }}>Sin integrantes activos en plan_integrantes.</div>
                  )}
                  {m.filasCarga.map(f => {
                    const total = estadoCarga(f.j, f.cap)
                    return (
                      <div key={f.persona.id} style={{ display:'grid', gridTemplateColumns:COLUMNAS, borderBottom:'0.5px solid var(--border2)' }}>
                        <CeldaPersona p={f.persona} filas={1} />
                        {f.celdas.map((c, i) => {
                          const e = estadoCarga(c.j, c.cap)
                          return (
                            <div key={c.fecha} style={{ gridColumn:i + 2, borderLeft:'0.5px solid var(--border2)', padding:'10px 12px', background: c.ausencia ? FONDO_AUSENCIA : c.fecha === hoy ? 'rgba(249,115,22,0.04)' : 'none' }}>
                              {c.ausencia && <div style={{ marginBottom:'4px' }}><EtiquetaAusencia a={c.ausencia} /></div>}
                              <div style={{ fontFamily:'var(--mono)', fontSize:'10px' }}>{fmt(c.j)} / {fmt(c.cap)}</div>
                              <Barra valor={c.j} total={c.cap} color={e.color} />
                              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:e.color }}>{e.txt}</div>
                              {c.refs.length > 0 && (
                                <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--orange)', marginTop:'4px', lineHeight:1.5 }}>{c.refs.join(' · ')}</div>
                              )}
                            </div>
                          )
                        })}
                        <div style={{ gridColumn:7, borderLeft:'0.5px solid var(--border2)', padding:'10px 14px' }}>
                          <div style={{ fontFamily:'var(--mono)', fontSize:'10px' }}>{fmt(f.j)} / {fmt(f.cap)}</div>
                          <Barra valor={f.j} total={f.cap} color={total.color} />
                          <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--green)' }}>Libre {fmt(f.libre)}</div>
                          {f.sobrecarga > EPS && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--red)' }}>Sobrecarga +{fmt(f.sobrecarga)}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {m.dondeAsignar && (
                <div className="glass" style={{ borderRadius:'10px', padding:'14px 16px' }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'10px' }}>DONDE ASIGNAR MAS TRABAJO</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                    {m.dondeAsignar.map(d => (
                      <div key={d.persona.id} style={{ display:'grid', gridTemplateColumns:'170px 120px 1fr', gap:'10px', alignItems:'center', background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:'6px', padding:'8px 12px' }}>
                        <div style={{ fontSize:'11px', fontWeight:600 }}>{d.persona.nombre}</div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color: d.libre > EPS ? 'var(--green)' : 'var(--muted)' }}>
                          Libre {fmt(d.libre)} · caben {d.caben} UO{d.caben === 1 ? '' : 's'} cortas
                        </div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)' }}>
                          {d.diasLibres.length > 0
                            ? d.diasLibres.map(x => `${DIAS[m.dias.indexOf(x.fecha)]} ${fmt(x.libre)}`).join(' · ')
                            : 'Sin espacio libre esta semana'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {reprogramar && m && datos?.capacidad && m.uoPorId[reprogramar.uoId] && (
        <ModalReprogramar
          key={reprogramar.uoId + (reprogramar.actividadId || '')}
          uo={m.uoPorId[reprogramar.uoId]}
          actsUo={(datos.actividades || []).filter(a => a.uo_id === reprogramar.uoId)}
          capacidad={datos.capacidad}
          nombres={m.nombres}
          hoy={hoy}
          actividadInicial={reprogramar.actividadId}
          onCerrar={() => setReprogramar(null)}
          onGuardado={() => { setReprogramar(null); setRecarga(r => r + 1) }}
        />
      )}

      {verAusencias && m && datos?.capacidad && (
        <ModalAusencias
          integrantes={m.integrantes}
          capacidad={datos.capacidad}
          hoy={hoy}
          onCerrar={() => setVerAusencias(false)}
          onCambio={() => setRecarga(r => r + 1)}
        />
      )}
    </div>
  )
}
