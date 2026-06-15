import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const SECCIONES_ORDEN = ['General','Aereo','Subterraneo','Expenses','Empalmes','Cable','Drop']

function seccionesActivas(metodo) {
  const base = ['General','Empalmes','Cable']
  if (metodo === 'Aereo') return [...base, 'Aereo']
  if (metodo === 'Subterraneo') return [...base, 'Subterraneo']
  if (metodo === 'Mixto') return [...base, 'Aereo', 'Subterraneo']
  return base
}

export default function Checklist() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [uo, setUo] = useState(null)
  const [items, setItems] = useState([])
  const [catalogo, setCatalogo] = useState([])
  const [respuestas, setRespuestas] = useState({})
  const [dropAplica, setDropAplica] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [modalData, setModalData] = useState(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [noRevision, setNoRevision] = useState(1)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    const [{ data: uoData }, { data: itemsData }, { data: catData }, { data: revData }] = await Promise.all([
      supabase.from('unidades_operativas').select('*, digitalizador:profiles!digitalizador_id(nombre), analista_qa:profiles!analista_qa_id(id,nombre,iniciales)').eq('id', id).single(),
      supabase.from('checklist_items').select('*').eq('activo', true).order('orden'),
      supabase.from('catalogo_observaciones_qa').select('*').order('familia').order('categoria'),
      supabase.from('checklist_resultados').select('id').eq('uo_id', id),
    ])
    setUo(uoData)
    setItems(itemsData || [])
    setCatalogo(catData || [])
    setNoRevision((revData?.length || 0) + 1)
    const init = {}
    itemsData?.forEach(item => {
      init[item.id] = { esperados: '', conformes: '', obs_familia: '', obs_categoria: '', obs_descripcion: '' }
    })
    setRespuestas(init)
    setLoading(false)
  }

  const activas = useMemo(() => {
    if (!uo) return []
    const secs = seccionesActivas(uo.metodo_constructivo)
    if (dropAplica) secs.push('Drop')
    return secs
  }, [uo, dropAplica])

  const itemsActivos = useMemo(() => {
    return items.filter(item => {
      if (!activas.includes(item.seccion)) return false
      if (item.condicion_activacion === 'condicional_qa') return dropAplica
      return true
    })
  }, [items, activas, dropAplica])

  const score = useMemo(() => {
    let pesoTotal = 0, scoreSum = 0, bloqueantesWarning = 0
    itemsActivos.forEach(item => {
      const r = respuestas[item.id]
      if (!r) return
      const esp = parseInt(r.esperados)
      const conf = parseInt(r.conformes)
      if (!esp || isNaN(esp)) return
      const cumpl = Math.min(100, Math.round((Math.min(conf || 0, esp) / esp) * 100))
      pesoTotal += item.peso
      scoreSum += (cumpl / 100) * item.peso
      if (item.es_bloqueante && cumpl < 80) bloqueantesWarning++
    })
    const pct = pesoTotal > 0 ? Math.round((scoreSum / pesoTotal) * 10000) / 100 : 0
    return { pct, pesoTotal, bloqueantesWarning }
  }, [respuestas, itemsActivos])

  function updateRespuesta(itemId, field, value) {
    setRespuestas(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }))
  }

  function familias() {
    return [...new Set(catalogo.map(c => c.familia))]
  }

  function categorias(familia) {
    return catalogo.filter(c => c.familia === familia).map(c => c.categoria)
  }

  async function handleEnviar() {
    const itemsSinDescripcion = itemsActivos.filter(item => {
  const r = respuestas[item.id]
  if (!r) return false
  const esp = parseInt(r.esperados)
  const conf = parseInt(r.conformes)
  if (!esp || isNaN(esp)) return false
  const cumpl = Math.min(100, Math.round((Math.min(conf || 0, esp) / esp) * 100))
  return cumpl < 100 && (!r.obs_descripcion || r.obs_descripcion.trim().length < 10)
})

if (itemsSinDescripcion.length > 0) {
  alert(`Hay ${itemsSinDescripcion.length} item(s) con error sin descripcion del hallazgo. Completa la descripcion antes de enviar.`)
  return
}
    const passes = score.pct >= 97
    if (!passes) {
      setModalData({ caso: 'C' })
      setShowModal(true)
      return
    }
    if (score.bloqueantesWarning > 0 && profile.id !== uo.analista_qa_id) {
      setModalData({ caso: 'B' })
      setShowModal(true)
      return
    }
    setModalData({ caso: 'A' })
    setShowModal(true)
  }

  async function confirmarEnvio(opcion) {
    setSending(true)
    const fecha = new Date().toISOString().split('T')[0]
    let estadoNuevo = 'Validada'
    let resolucion = null
    let motivoHist = null

    if (modalData.caso === 'C') {
      estadoNuevo = 'Rechazada'
      resolucion = null
    } else if (opcion === 'correccion') {
      estadoNuevo = 'En Correccion'
      resolucion = 'enviada_a_digitalizador'
    } else if (opcion === 'validada') {
      estadoNuevo = 'Validada'
      resolucion = 'resuelta_en_revision'
    }

    if (modalData.caso === 'B') {
      motivoHist = `Aprobado con ${score.bloqueantesWarning} advertencias de items criticos`
    }

    const { data: resultado, error: errRes } = await supabase.from('checklist_resultados').insert({
      uo_id: id,
      version_id: items[0]?.version_id,
      analista_id: profile.id,
      fecha_revision: fecha,
      metodo_constructivo: uo.metodo_constructivo,
      drop_aplica: dropAplica,
      peso_total_activo: score.pesoTotal,
      score_porcentaje: score.pct,
      resultado: score.pct >= 97 ? 'Aprobado' : 'Rechazado',
      aprobado_con_advertencias: modalData.caso === 'B',
      advertencias_bloqueantes: score.bloqueantesWarning,
      resolucion,
      motivo_rechazo: modalData.caso === 'C' ? motivoRechazo : null,
      no_revision_al_momento: noRevision,
    }).select().single()

    if (!errRes && resultado) {
      const respRows = itemsActivos.map(item => {
        const r = respuestas[item.id] || {}
        const esp = parseInt(r.esperados) || 0
        const conf = Math.min(parseInt(r.conformes) || 0, esp)
        const cumpl = esp > 0 ? Math.round((conf / esp) * 10000) / 100 : 0
        return {
          resultado_id: resultado.id,
          item_id: item.id,
          puntos_esperados: esp,
          puntos_conformes: conf,
          cumplimiento_porcentaje: cumpl,
          observacion_familia: r.obs_familia || null,
          observacion_categoria: r.obs_categoria || null,
          observacion_descripcion: r.obs_descripcion || null,
          resuelta_en_revision: resolucion === 'resuelta_en_revision',
        }
      })
      await supabase.from('checklist_respuestas').insert(respRows)
    }

    const estadoAnterior = uo.estado
    const updates = { estado: estadoNuevo, resultado_checklist: score.pct / 100 }
    if (modalData.caso === 'C') updates.no_revision = (uo.no_revision || 0) + 1

    await supabase.from('unidades_operativas').update(updates).eq('id', id)
    await supabase.from('historial_estados').insert({
      uo_id: id,
      usuario_id: profile.id,
      estado_anterior: estadoAnterior,
      estado_nuevo: estadoNuevo,
      motivo_texto: motivoHist || (modalData.caso === 'C' ? motivoRechazo : null),
      categoria_error: modalData.caso === 'C' ? 'Rechazo QA' : null,
      rol_responsable: profile.rol,
    })

    setSending(false)
    setShowModal(false)
    navigate(`/backlog/${id}`)
  }

  if (loading) return <div style={{ padding: '40px', fontFamily: 'var(--mono)', color: 'var(--muted2)' }}>Cargando checklist...</div>
  if (!uo) return <div style={{ padding: '40px', fontFamily: 'var(--mono)', color: 'var(--red)' }}>UO no encontrada</div>

  const esQA = profile?.id === uo.analista_qa_id
  const esCoord = profile?.rol === 'coordinador'

  if (!esQA && !esCoord) return (
    <div style={{ padding: '40px', fontFamily: 'var(--mono)', color: 'var(--muted2)' }}>
      Solo el Analista QA asignado puede completar este checklist.
    </div>
  )

  const seccionesAgrupadas = SECCIONES_ORDEN.filter(s => activas.includes(s))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ padding: '8px 20px', background: 'var(--surface)', borderBottom: '0.5px solid var(--border2)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span onClick={() => navigate(`/backlog/${id}`)} style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted2)', cursor: 'pointer' }}>Backlog</span>
        <span style={{ color: 'var(--muted)', fontSize: '9px' }}>&gt;</span>
        <span onClick={() => navigate(`/backlog/${id}`)} style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted2)', cursor: 'pointer' }}>{uo.referencia_operativa}</span>
        <span style={{ color: 'var(--muted)', fontSize: '9px' }}>&gt;</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--orange)' }}>Checklist QA</span>
      </div>

      <div style={{ padding: '14px 20px', background: 'var(--surface)', borderBottom: '0.5px solid var(--border2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--orange)', marginBottom: 3 }}>CHECKLIST QA · {uo.referencia_operativa} · Revision #{noRevision}</div>
            <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: 6 }}>{uo.nombre}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[uo.tipo_proyecto, uo.metodo_constructivo, uo.tipo_infraestructura].filter(Boolean).map(t => (
                <span key={t} style={{ fontFamily: 'var(--mono)', fontSize: '8px', padding: '2px 8px', borderRadius: '3px', background: 'rgba(120,120,120,0.15)', color: 'var(--muted2)' }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--muted2)', marginBottom: 2 }}>SCORE ACTUAL</div>
              <div style={{ fontFamily: 'var(--disp)', fontWeight: 800, fontSize: '28px', color: score.pct >= 97 ? 'var(--green)' : 'var(--red)', lineHeight: 1 }}>{score.pct.toFixed(1)}%</div>
              {score.bloqueantesWarning > 0 && <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--red)', marginTop: 2 }}>{score.bloqueantesWarning} item(s) critico(s)</div>}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 20px', background: 'var(--surface)', borderBottom: '0.5px solid var(--border2)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted2)' }}>MODULOS ACTIVOS:</span>
        {['General','Expenses','Empalmes','Cable'].map(s => (
          <span key={s} style={{ fontFamily: 'var(--mono)', fontSize: '9px', padding: '2px 8px', borderRadius: '3px', background: 'rgba(34,197,94,0.1)', color: 'var(--green)', border: '0.5px solid rgba(34,197,94,0.2)' }}>{s} ✓</span>
        ))}
        {(uo.metodo_constructivo === 'Aereo' || uo.metodo_constructivo === 'Mixto') && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', padding: '2px 8px', borderRadius: '3px', background: 'rgba(249,115,22,0.1)', color: 'var(--orange)', border: '0.5px solid rgba(249,115,22,0.2)' }}>Aereo ✓</span>}
        {(uo.metodo_constructivo === 'Subterraneo' || uo.metodo_constructivo === 'Mixto') && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', padding: '2px 8px', borderRadius: '3px', background: 'rgba(59,130,246,0.1)', color: 'var(--blue)', border: '0.5px solid rgba(59,130,246,0.2)' }}>Subterraneo ✓</span>}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted2)' }}>
          <input type="checkbox" checked={dropAplica} onChange={e => setDropAplica(e.target.checked)} style={{ accentColor: 'var(--orange)' }} />
          Activar seccion Drop
        </label>
      </div>

      <div style={{ flex: 1, padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {seccionesAgrupadas.map(seccion => {
          const itemsSec = itemsActivos.filter(i => i.seccion === seccion)
          if (!itemsSec.length) return null
          const secColor = { General: 'var(--muted2)', Aereo: 'var(--orange)', Subterraneo: 'var(--blue)', Expenses: 'var(--muted2)', Empalmes: 'var(--yellow)', Cable: 'var(--green)', Drop: 'var(--orange)' }[seccion] || 'var(--muted2)'

          return (
            <div key={seccion} style={{ background: 'var(--surface)', border: '0.5px solid var(--border2)', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ height: '2px', background: secColor }} />
              <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: secColor, letterSpacing: '0.08em' }}>{seccion.toUpperCase()}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted2)' }}>{itemsSec.length} items</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {itemsSec.map((item, idx) => {
                  const r = respuestas[item.id] || {}
                  const esp = parseInt(r.esperados)
                  const conf = parseInt(r.conformes)
                  const cumpl = esp > 0 && !isNaN(conf) ? Math.min(100, Math.round((Math.min(conf, esp) / esp) * 100)) : null
                  const tieneError = cumpl !== null && cumpl < 100
                  const esCritico = item.es_bloqueante && cumpl !== null && cumpl < 80

                  return (
                    <div key={item.id} style={{ borderBottom: idx < itemsSec.length - 1 ? '0.5px solid var(--border2)' : 'none', background: esCritico ? 'rgba(239,68,68,0.04)' : tieneError ? 'rgba(250,204,21,0.02)' : 'none' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 90px 70px', gap: 8, padding: '10px 14px', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {item.es_bloqueante && <span style={{ fontFamily: 'var(--mono)', fontSize: '7px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(239,68,68,0.12)', color: 'var(--red)', flexShrink: 0 }}>CRIT</span>}
                            {item.nombre}
                          </div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--muted)', marginTop: 2 }}>{item.familia} · ×{item.peso}</div>
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted2)', textAlign: 'center' }}>×{item.peso}</div>
                        <div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--muted2)', marginBottom: 3 }}>ESPERADOS</div>
                          <input type="number" min="0" value={r.esperados} onChange={e => updateRespuesta(item.id, 'esperados', e.target.value)}
                            style={{ width: '100%', padding: '4px 6px', fontSize: '11px', textAlign: 'right', background: 'var(--surface2)', border: '0.5px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--muted2)', marginBottom: 3 }}>CONFORMES</div>
                          <input type="number" min="0" max={r.esperados || 999999} value={r.conformes} onChange={e => updateRespuesta(item.id, 'conformes', e.target.value)}
                            style={{ width: '100%', padding: '4px 6px', fontSize: '11px', textAlign: 'right', background: 'var(--surface2)', border: '0.5px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }} />
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--muted2)', marginBottom: 3 }}>CUMPLIM.</div>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 500, color: cumpl === null ? 'var(--muted)' : cumpl >= 97 ? 'var(--green)' : cumpl >= 80 ? 'var(--yellow)' : 'var(--red)' }}>
                            {cumpl === null ? '—' : cumpl + '%'}
                          </div>
                        </div>
                      </div>

                      {esCritico && (
                        <div style={{ margin: '0 14px 8px', padding: '6px 10px', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: '5px', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)' }}>
                          Item critico con cumplimiento por debajo del 80% — requiere atencion del coordinador antes de aprobar.
                        </div>
                      )}

                      {tieneError && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8, padding: '0 14px 10px' }}>
                          <div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--muted2)', marginBottom: 3 }}>FAMILIA</div>
                            <select value={r.obs_familia} onChange={e => { updateRespuesta(item.id, 'obs_familia', e.target.value); updateRespuesta(item.id, 'obs_categoria', '') }}
                              style={{ width: '100%', padding: '4px 6px', fontSize: '10px', background: 'var(--surface2)', border: '0.5px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}>
                              <option value="">Seleccionar...</option>
                              {familias().map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--muted2)', marginBottom: 3 }}>CATEGORIA</div>
                            <select value={r.obs_categoria} onChange={e => updateRespuesta(item.id, 'obs_categoria', e.target.value)}
                              style={{ width: '100%', padding: '4px 6px', fontSize: '10px', background: 'var(--surface2)', border: '0.5px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}>
                              <option value="">Seleccionar...</option>
                              {categorias(r.obs_familia).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--muted2)', marginBottom: 3 }}>DESCRIPCION DEL HALLAZGO *</div>
                            <input value={r.obs_descripcion} onChange={e => updateRespuesta(item.id, 'obs_descripcion', e.target.value)}
                              placeholder="Describe el hallazgo (min. 10 caracteres)..."
                              style={{ width: '100%', padding: '4px 6px', fontSize: '10px', background: 'var(--surface2)', border: `0.5px solid ${r.obs_descripcion?.length >= 10 ? 'var(--border)' : 'rgba(239,68,68,0.3)'}`, borderRadius: '4px', color: 'var(--text)' }} />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: 'var(--surface)', borderTop: '0.5px solid var(--border)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 800, fontSize: '24px', color: score.pct >= 97 ? 'var(--green)' : 'var(--red)' }}>{score.pct.toFixed(1)}%</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted2)' }}>
            {score.pct >= 97 ? 'Supera el minimo de 97%' : 'Por debajo del 97% requerido'}
          </div>
          {score.bloqueantesWarning > 0 && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)' }}>
              {score.bloqueantesWarning} item(s) critico(s) activo(s)
            </div>
          )}
        </div>
        <button onClick={handleEnviar} disabled={sending}
          style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: score.pct >= 97 ? 'var(--green)' : 'var(--red)', color: '#080808', fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 500, cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
          {sending ? 'ENVIANDO...' : 'ENVIAR REVISION'}
        </button>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '24px', width: '440px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {modalData?.caso === 'A' && (
              <>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>Revision aprobada · {score.pct.toFixed(1)}%</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted2)' }}>Selecciona como cerrar esta revision:</div>
                <button onClick={() => confirmarEnvio('validada')}
                  style={{ padding: '12px', borderRadius: '6px', border: '0.5px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: '10px', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>Correcciones menores resueltas en esta revision</div>
                  <div style={{ fontSize: '9px', color: 'var(--muted2)' }}>La UO pasa a Validada. Las observaciones quedan como resueltas.</div>
                </button>
                <button onClick={() => confirmarEnvio('correccion')}
                  style={{ padding: '12px', borderRadius: '6px', border: '0.5px solid rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.08)', color: 'var(--orange)', fontFamily: 'var(--mono)', fontSize: '10px', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>Requiere correccion por digitalizador</div>
                  <div style={{ fontSize: '9px', color: 'var(--muted2)' }}>La UO pasa a En Correccion. El digitalizador ve los hallazgos pendientes.</div>
                </button>
              </>
            )}

            {modalData?.caso === 'B' && (
              <>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--yellow)' }}>Advertencia — items criticos</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted2)', background: 'rgba(250,204,21,0.06)', border: '0.5px solid rgba(250,204,21,0.2)', borderRadius: '6px', padding: '10px' }}>
                  Existen {score.bloqueantesWarning} item(s) critico(s) con cumplimiento menor al 80%. Solo el coordinador puede confirmar la aprobacion.
                </div>
                {esCoord && (
                  <>
                    <button onClick={() => confirmarEnvio('validada')} style={{ padding: '10px', borderRadius: '6px', border: '0.5px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: '10px', cursor: 'pointer' }}>
                      Confirmar aprobacion con advertencias
                    </button>
                    <button onClick={() => confirmarEnvio('correccion')} style={{ padding: '10px', borderRadius: '6px', border: '0.5px solid rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.08)', color: 'var(--orange)', fontFamily: 'var(--mono)', fontSize: '10px', cursor: 'pointer' }}>
                      Enviar a correccion
                    </button>
                  </>
                )}
                {!esCoord && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted2)' }}>Contacta al coordinador para confirmar esta revision.</div>}
              </>
            )}

            {modalData?.caso === 'C' && (
              <>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--red)' }}>Score insuficiente · {score.pct.toFixed(1)}%</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted2)' }}>La UO sera rechazada. Indica el motivo general:</div>
                <textarea rows={4} value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)}
                  placeholder="Motivo general del rechazo (min. 20 caracteres)..."
                  style={{ resize: 'vertical', fontSize: '11px', background: 'var(--surface2)', border: '0.5px solid var(--border)', borderRadius: '6px', padding: '8px', color: 'var(--text)', fontFamily: 'var(--mono)' }} />
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: motivoRechazo.length >= 20 ? 'var(--green)' : 'var(--muted2)' }}>{motivoRechazo.length}/20 caracteres minimo</div>
                <button onClick={() => confirmarEnvio('rechazada')} disabled={motivoRechazo.length < 20 || sending}
                  style={{ padding: '8px', borderRadius: '6px', border: 'none', background: 'var(--red)', color: '#fff', fontFamily: 'var(--mono)', fontSize: '10px', cursor: 'pointer', opacity: motivoRechazo.length >= 20 ? 1 : 0.4 }}>
                  CONFIRMAR RECHAZO
                </button>
              </>
            )}

            <button onClick={() => setShowModal(false)} style={{ padding: '6px', borderRadius: '5px', border: '0.5px solid var(--border)', background: 'none', color: 'var(--muted2)', fontFamily: 'var(--mono)', fontSize: '9px', cursor: 'pointer' }}>
              CANCELAR
            </button>
          </div>
        </div>
      )}
    </div>
  )
}