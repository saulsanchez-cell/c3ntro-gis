import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { generarCertificado } from '../lib/certificado'

const FASES = ['Preparacion','Carga parcial','Carga completa']
const PRIORIDADES = ['P1','P2','P3']

export default function FichaUO() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [ultimoChecklist, setUltimoChecklist] = useState(null)
  const [uo, setUo] = useState(null)
  const [logs, setLogs] = useState([])
  const [historial, setHistorial] = useState([])
  const [equipo, setEquipo] = useState([])
  const [transiciones, setTransiciones] = useState([])
  const [hallazgos, setHallazgos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showLogForm, setShowLogForm] = useState(false)
  const [logForm, setLogForm] = useState({ porcentaje_avance: 0, fase: 'Preparacion', nota: '', comentario_entrega: '' })
  const [logError, setLogError] = useState('')
  const [savingLog, setSavingLog] = useState(false)
  const [cambioEstado, setCambioEstado] = useState('')
  const [saving, setSaving] = useState(false)
  const [showMotivoModal, setShowMotivoModal] = useState(false)
  const [motivoPendiente, setMotivoPendiente] = useState({ estado: '', motivo: '' })
  const [asignacion, setAsignacion] = useState({
    digitalizador_id: '', analista_qa_id: '', prioridad: 'P3',
    link_archivos: '', observaciones: '', metodo_constructivo: '',
    latitud: '', longitud: ''
  })

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    const [{ data: uoData }, { data: logsData }, { data: histData }, { data: equipoData }] = await Promise.all([
      supabase.from('unidades_operativas').select('*, digitalizador:profiles!digitalizador_id(id,nombre,iniciales), analista_qa:profiles!analista_qa_id(id,nombre,iniciales)').eq('id', id).single(),
      supabase.from('logs_actividad').select('*, usuario:profiles(nombre,iniciales)').eq('uo_id', id).order('created_at', { ascending: false }),
      supabase.from('historial_estados').select('*, usuario:profiles(nombre,iniciales)').eq('uo_id', id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('activo', true).neq('rol', 'coordinador'),
    ])

    const { data: transData } = await supabase
      .from('transiciones_permitidas')
      .select('*')
      .eq('estado_origen', uoData?.estado || '')

    if (uoData?.estado === 'En Correccion') {
      const { data: resData } = await supabase
        .from('checklist_resultados')
        .select('id')
        .eq('uo_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
      if (resData && resData.length > 0) {
        const { data: hallazgosData } = await supabase
          .from('checklist_respuestas')
          .select('*, item:checklist_items(nombre, seccion, familia)')
          .eq('resultado_id', resData[0].id)
          .eq('resuelta_en_revision', false)
          .not('observacion_descripcion', 'is', null)
        setHallazgos(hallazgosData || [])
      } else {
        setHallazgos([])
      }
    } else {
      setHallazgos([])
    }

    if (uoData?.estado === 'Validada' || uoData?.estado === 'Cerrada') {
      const { data: resData2 } = await supabase
        .from('checklist_resultados')
        .select('*')
        .eq('uo_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
      if (resData2 && resData2.length > 0) {
        const { data: respData } = await supabase
          .from('checklist_respuestas')
          .select('*, item:checklist_items(nombre, seccion, familia, peso)')
          .eq('resultado_id', resData2[0].id)
        setUltimoChecklist({ resultado: resData2[0], respuestas: respData || [] })
      } else {
        setUltimoChecklist(null)
      }
    } else {
      setUltimoChecklist(null)
    }

    setUo(uoData)
    setLogs(logsData || [])
    setHistorial(histData || [])
    setEquipo(equipoData || [])
    setTransiciones(transData || [])
    if (uoData) {
      setAsignacion({
        digitalizador_id: uoData.digitalizador_id || '',
        analista_qa_id: uoData.analista_qa_id || '',
        prioridad: uoData.prioridad || 'P3',
        link_archivos: uoData.link_archivos || '',
        observaciones: uoData.observaciones || '',
        metodo_constructivo: uoData.metodo_constructivo || '',
        latitud: uoData.latitud || '',
        longitud: uoData.longitud || '',
      })
    }
    setLoading(false)
  }

  async function guardarAsignacion() {
    if (!asignacion.metodo_constructivo) { alert('Selecciona el metodo constructivo antes de guardar.'); return }
    setSaving(true)
    const updates = {
      digitalizador_id: asignacion.digitalizador_id || null,
      analista_qa_id: asignacion.analista_qa_id || null,
      prioridad: asignacion.prioridad,
      link_archivos: asignacion.link_archivos || null,
      observaciones: asignacion.observaciones || null,
      metodo_constructivo: asignacion.metodo_constructivo,
      latitud: asignacion.latitud ? parseFloat(asignacion.latitud) : null,
      longitud: asignacion.longitud ? parseFloat(asignacion.longitud) : null,
    }
    if (asignacion.digitalizador_id && !uo.fecha_asignacion) {
      updates.fecha_asignacion = new Date().toISOString().split('T')[0]
      updates.estado = 'Asignada'
      await supabase.from('historial_estados').insert({
        uo_id: id, usuario_id: profile.id,
        estado_anterior: uo.estado, estado_nuevo: 'Asignada', rol_responsable: 'coordinador'
      })
    }
    await supabase.from('unidades_operativas').update(updates).eq('id', id)
    setSaving(false)
    fetchAll()
  }

  async function guardarLog() {
    setLogError('')
    const ultimoPct = logs[0]?.porcentaje_avance ?? 0
    const noAvanza = logForm.porcentaje_avance <= ultimoPct && logs.length > 0
    if (noAvanza && !logForm.nota.trim()) { setLogError('Explica por que el avance no progreso.'); return }
    if (logForm.fase === 'Carga completa' && (!logForm.comentario_entrega.trim() || logForm.comentario_entrega.trim().length < 20)) {
      setLogError('Agrega un comentario de entrega para el validador (minimo 20 caracteres).'); return
    }
    setSavingLog(true)
    const hoy = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('logs_actividad').upsert({
      uo_id: id, usuario_id: profile.id, fecha: hoy,
      porcentaje_avance: logForm.porcentaje_avance, fase: logForm.fase, nota: logForm.nota,
    }, { onConflict: 'uo_id,fecha,usuario_id' })
    if (!error) {
      const updates = {}
      if (logForm.fase === 'Carga completa' && logForm.porcentaje_avance === 100) {
        updates.fecha_carga_final = hoy
        if (uo.fecha_asignacion) {
          const diff = Math.floor((new Date(hoy) - new Date(uo.fecha_asignacion)) / (1000 * 60 * 60 * 24))
          updates.dias_proceso = diff === 0 ? 0 : diff
        }
      } else if (!uo.dias_proceso && uo.fecha_asignacion) {
        const diff = Math.floor((new Date(hoy) - new Date(uo.fecha_asignacion)) / (1000 * 60 * 60 * 24))
        updates.dias_proceso = diff === 0 ? 0 : diff
      }
      if (Object.keys(updates).length > 0) await supabase.from('unidades_operativas').update(updates).eq('id', id)
      if (logForm.fase === 'Carga completa') {
        await supabase.from('historial_estados').insert({
          uo_id: id, usuario_id: profile.id, estado_anterior: uo.estado, estado_nuevo: 'Carga completa',
          motivo_texto: logForm.comentario_entrega.trim(), categoria_error: 'Comentario de entrega', rol_responsable: 'analista'
        })
      }
      setShowLogForm(false); setLogError(''); fetchAll()
    }
    setSavingLog(false)
  }

  async function cambiarEstado(nuevoEstado, motivo) {
    const estadoAnterior = uo.estado
    await supabase.from('unidades_operativas').update({ estado: nuevoEstado }).eq('id', id)
    await supabase.from('historial_estados').insert({
      uo_id: id, usuario_id: profile.id, estado_anterior: estadoAnterior, estado_nuevo: nuevoEstado,
      motivo_texto: motivo || null, rol_responsable: esCoordinador ? 'coordinador' : 'analista'
    })
    setCambioEstado(''); setShowMotivoModal(false); setMotivoPendiente({ estado: '', motivo: '' })
    fetchAll()
  }

  if (loading) return <div style={{ padding:'40px', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--muted2)' }}>Cargando ficha...</div>
  if (!uo) return <div style={{ padding:'40px', fontFamily:'var(--mono)', fontSize:'11px', color:'var(--red)' }}>No encontrada</div>

  const esCoordinador = profile?.rol === 'coordinador'
  const esQA = profile?.id === uo.analista_qa_id
  const pctAvance = logs[0]?.porcentaje_avance ?? 0
  const ultimoPct = logs[0]?.porcentaje_avance ?? 0
  const noAvanza = logForm.porcentaje_avance <= ultimoPct && logs.length > 0

  return (
    <div style={{ display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 20px', borderBottom:'0.5px solid var(--border2)', background:'var(--surface)' }}>
        <span onClick={() => navigate('/backlog')} style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', cursor:'pointer' }}>Backlog</span>
        <span style={{ color:'var(--muted)', fontSize:'9px' }}>&gt;</span>
        <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--orange)' }}>{uo.referencia_operativa}</span>
      </div>

      <div style={{ padding:'16px 20px', borderBottom:'0.5px solid var(--border2)', background:'var(--surface)' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'12px' }}>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'11px', color:'var(--orange)', letterSpacing:'0.06em', marginBottom:'4px' }}>REF · {uo.referencia_operativa}</div>
            <div style={{ fontWeight:'700', fontSize:'18px', marginBottom:'8px' }}>{uo.nombre}</div>
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
              {[uo.tipo_proyecto, uo.tipo_infraestructura].filter(Boolean).map(t => (
                <span key={t} style={{ fontFamily:'var(--mono)', fontSize:'8px', padding:'2px 8px', borderRadius:'3px', background:'rgba(120,120,120,0.15)', color:'var(--muted2)' }}>{t}</span>
              ))}
              {uo.metodo_constructivo && <span style={{ fontFamily:'var(--mono)', fontSize:'8px', padding:'2px 8px', borderRadius:'3px', background:'rgba(59,130,246,0.1)', color:'var(--blue)' }}>{uo.metodo_constructivo}</span>}
              <span style={{ fontFamily:'var(--mono)', fontSize:'8px', padding:'2px 8px', borderRadius:'3px',
                background: uo.prioridad==='P1' ? 'rgba(249,115,22,0.18)' : 'rgba(120,120,120,0.1)',
                color: uo.prioridad==='P1' ? 'var(--orange)' : 'var(--muted2)' }}>{uo.prioridad}</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
            {uo.estado === 'En Validacion' && (esQA || esCoordinador) && (
              <button onClick={() => navigate('/backlog/'+id+'/checklist')}
                style={{ padding:'6px 12px', borderRadius:'5px', border:'none', background:'var(--yellow)', color:'#080808', fontSize:'9px', fontFamily:'var(--mono)', fontWeight:500, cursor:'pointer' }}>
                INICIAR CHECKLIST
              </button>
            )}
            {(uo.estado === 'Validada' || uo.estado === 'Cerrada') && ultimoChecklist && (
              <button onClick={() => generarCertificado({ uo, resultado: ultimoChecklist.resultado, respuestas: ultimoChecklist.respuestas })}
                style={{ padding:'6px 12px', borderRadius:'5px', border:'0.5px solid rgba(34,197,94,0.3)', background:'rgba(34,197,94,0.08)', color:'var(--green)', fontSize:'9px', fontFamily:'var(--mono)', fontWeight:500, cursor:'pointer' }}>
                DESCARGAR CERTIFICADO
              </button>
            )}
            {transiciones.length > 0 ? (
              <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                <select value={cambioEstado} onChange={e => setCambioEstado(e.target.value)} style={{ width:'160px', padding:'5px 8px', fontSize:'10px' }}>
                  <option value="">Cambiar estado...</option>
                  {transiciones.filter(t => !t.solo_coordinador || esCoordinador).map(t => <option key={t.estado_destino} value={t.estado_destino}>{t.estado_destino}</option>)}
                </select>
                <button onClick={() => {
                  if (!cambioEstado) return
                  const trans = transiciones.find(t => t.estado_destino === cambioEstado)
                  if (trans?.requiere_motivo) { setMotivoPendiente({ estado: cambioEstado, motivo: '' }); setShowMotivoModal(true) }
                  else cambiarEstado(cambioEstado, null)
                }} disabled={!cambioEstado}
                  style={{ padding:'6px 12px', borderRadius:'5px', border:'0.5px solid rgba(249,115,22,0.3)', background:'rgba(249,115,22,0.12)', color:'var(--orange)', fontSize:'9px', opacity: cambioEstado ? 1 : 0.4 }}>
                  APLICAR
                </button>
              </div>
            ) : (
              <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted)', padding:'6px 10px', border:'0.5px solid var(--border2)', borderRadius:'5px' }}>Sin transiciones disponibles</div>
            )}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', border:'0.5px solid var(--border2)', borderRadius:'7px', overflow:'hidden' }}>
          {[
            { label:'KM TEORICOS', val: uo.km_teoricos ? uo.km_teoricos + ' km' : '---', color:'var(--orange)' },
            { label:'FECHA ASIGNACION', val: uo.fecha_asignacion ?? '---' },
            { label:'FECHA CARGA', val: uo.fecha_carga_final ?? '---' },
            { label:'DIAS PROCESO', val: uo.dias_proceso === 0 ? 'Mismo dia' : uo.dias_proceso ? uo.dias_proceso + 'd' : '---', color: uo.dias_proceso > 3 ? 'var(--red)' : undefined },
            { label:'SLA OBJETIVO', val: '3d habiles' },
            { label:'NO REVISION', val: uo.no_revision ?? 0 },
          ].map((m,i) => (
            <div key={i} style={{ padding:'9px 12px', borderRight: i < 5 ? '0.5px solid var(--border2)' : 'none' }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.09em', marginBottom:'4px' }}>{m.label}</div>
              <div style={{ fontFamily:'var(--mono)', fontSize:'11px', color: m.color || 'var(--text)' }}>{m.val}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding:'12px 20px', borderBottom:'0.5px solid var(--border2)', background:'var(--surface)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'5px' }}>
          <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>AVANCE DECLARADO</span>
          <span style={{ fontWeight:'700', fontSize:'14px', color:'var(--yellow)' }}>{pctAvance}%</span>
        </div>
        <div style={{ height:'6px', background:'var(--border2)', borderRadius:'3px', overflow:'hidden' }}>
          <div style={{ height:'100%', width: pctAvance+'%', borderRadius:'3px', background:'linear-gradient(90deg,var(--orange),var(--yellow))' }} />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px' }}>
        <div style={{ borderRight:'0.5px solid var(--border2)' }}>

          {uo.estado === 'En Correccion' && hallazgos.length > 0 && (
            <div style={{ padding:'14px 20px', borderBottom:'0.5px solid var(--border2)', background:'rgba(239,68,68,0.03)' }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--red)', letterSpacing:'0.12em', marginBottom:'10px' }}>
                CORRECCIONES PENDIENTES · {hallazgos.length} hallazgo(s)
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {hallazgos.map(h => (
                  <div key={h.id} style={{ background:'var(--surface2)', border:'0.5px solid rgba(239,68,68,0.2)', borderLeft:'2px solid var(--red)', borderRadius:'6px', padding:'10px 12px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'4px' }}>
                      <span style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'1px 6px', borderRadius:'3px', background:'rgba(239,68,68,0.12)', color:'var(--red)' }}>{h.item?.seccion}</span>
                      <span style={{ fontFamily:'var(--mono)', fontSize:'7px', color:'var(--muted2)' }}>{h.item?.familia}</span>
                    </div>
                    <div style={{ fontSize:'11px', color:'var(--text)', marginBottom:'4px', fontWeight:'500' }}>{h.item?.nombre}</div>
                    {h.observacion_familia && (
                      <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', marginBottom:'3px' }}>
                        {h.observacion_familia}{h.observacion_categoria ? ' · ' + h.observacion_categoria : ''}
                      </div>
                    )}
                    <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--red)', fontStyle:'italic' }}>"{h.observacion_descripcion}"</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', marginTop:'4px' }}>
                      Cumplimiento: {h.cumplimiento_porcentaje?.toFixed(1)}% · {h.puntos_conformes}/{h.puntos_esperados} conformes
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding:'14px 20px', borderBottom:'0.5px solid var(--border2)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em' }}>LOG DE AVANCE DIARIO</span>
              <button onClick={() => { setShowLogForm(!showLogForm); setLogError('') }}
                style={{ fontFamily:'var(--mono)', fontSize:'9px', padding:'4px 10px', borderRadius:'4px', border:'0.5px solid rgba(249,115,22,0.3)', background:'rgba(249,115,22,0.08)', color:'var(--orange)' }}>
                + REGISTRAR HOY
              </button>
            </div>
            {showLogForm && (
              <div style={{ background:'var(--surface2)', border:'0.5px solid rgba(249,115,22,0.2)', borderRadius:'7px', padding:'14px', marginBottom:'10px', display:'flex', flexDirection:'column', gap:'10px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'4px' }}>AVANCE (%)</div>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <input type="range" min="0" max="100" step="5" value={logForm.porcentaje_avance}
                        onChange={e => setLogForm(f => ({ ...f, porcentaje_avance: parseInt(e.target.value) }))}
                        style={{ flex:1, background:'none', border:'none', padding:0, accentColor:'var(--orange)' }} />
                      <span style={{ fontWeight:'700', fontSize:'16px', color:'var(--yellow)', minWidth:'40px' }}>{logForm.porcentaje_avance}%</span>
                    </div>
                    {noAvanza && logs.length > 0 && <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--yellow)', marginTop:'4px' }}>Ultimo registro: {ultimoPct}% — nota obligatoria</div>}
                  </div>
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'4px' }}>FASE</div>
                    <select value={logForm.fase} onChange={e => setLogForm(f => ({ ...f, fase: e.target.value }))}>
                      {FASES.map(f => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color: noAvanza ? 'var(--orange)' : 'var(--muted2)', marginBottom:'4px' }}>NOTA {noAvanza ? '* OBLIGATORIA' : '(opcional)'}</div>
                  <textarea rows={2} value={logForm.nota} onChange={e => setLogForm(f => ({ ...f, nota: e.target.value }))}
                    placeholder={noAvanza ? 'Explica por que el avance no progreso...' : 'Nota opcional...'}
                    style={{ resize:'vertical', fontSize:'11px' }} />
                </div>
                {logForm.fase === 'Carga completa' && (
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--orange)', marginBottom:'4px' }}>COMENTARIO DE ENTREGA * OBLIGATORIO</div>
                    <textarea rows={3} value={logForm.comentario_entrega} onChange={e => setLogForm(f => ({ ...f, comentario_entrega: e.target.value }))}
                      placeholder="Que debe saber el validador antes de revisar esta UO?"
                      style={{ resize:'vertical', fontSize:'11px' }} />
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color: logForm.comentario_entrega.trim().length >= 20 ? 'var(--green)' : 'var(--muted2)', marginTop:'3px' }}>
                      {logForm.comentario_entrega.trim().length}/20 caracteres minimo
                    </div>
                  </div>
                )}
                {logError && <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--red)', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:'5px', padding:'8px 12px' }}>{logError}</div>}
                <div style={{ display:'flex', gap:'6px', justifyContent:'flex-end' }}>
                  <button onClick={() => { setShowLogForm(false); setLogError('') }} style={{ padding:'5px 12px', borderRadius:'4px', border:'0.5px solid var(--border)', background:'none', color:'var(--muted2)', fontSize:'9px' }}>CANCELAR</button>
                  <button onClick={guardarLog} disabled={savingLog} style={{ padding:'5px 12px', borderRadius:'4px', border:'none', background:'var(--orange)', color:'#080808', fontSize:'9px', fontWeight:'500' }}>
                    {savingLog ? 'GUARDANDO...' : 'GUARDAR'}
                  </button>
                </div>
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {logs.length === 0 && <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)', padding:'12px 0' }}>Sin registros aun.</div>}
              {logs.map(log => (
                <div key={log.id} style={{ background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:'6px', padding:'10px 12px', display:'grid', gridTemplateColumns:'80px 1fr auto', gap:'10px' }}>
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>{log.fecha}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'2px' }}>{log.usuario?.nombre}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', marginBottom:'3px' }}>Fase: <span style={{ color:'var(--yellow)' }}>{log.fase}</span></div>
                    {log.nota && <div style={{ fontSize:'10px', color:'var(--text)', lineHeight:'1.4' }}>{log.nota}</div>}
                  </div>
                  <div style={{ fontWeight:'700', fontSize:'18px', color:'var(--yellow)' }}>{log.porcentaje_avance}%</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding:'14px 20px' }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'10px' }}>HISTORIAL DE ESTADOS</div>
            {historial.length === 0 && <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin cambios registrados.</div>}
            {historial.map((h, i) => (
              <div key={h.id} style={{ display:'grid', gridTemplateColumns:'16px 1fr', gap:'10px', paddingBottom:'10px' }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                  <div style={{ width:'8px', height:'8px', borderRadius:'50%', marginTop:'3px', background: i===0 ? 'var(--orange)' : 'var(--muted)' }} />
                  {i < historial.length-1 && <div style={{ width:'0.5px', flex:1, background:'var(--border2)', marginTop:'3px' }} />}
                </div>
                <div style={{ paddingBottom:'10px', borderBottom: i < historial.length-1 ? '0.5px solid var(--border2)' : 'none' }}>
                  <div style={{ fontSize:'10px', color: i===0 ? 'var(--orange)' : 'var(--text)', marginBottom:'2px' }}>
                    {h.estado_nuevo}{i===0 && <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--orange)', marginLeft:'6px' }}>ACTUAL</span>}
                  </div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom: h.motivo_texto ? '4px' : '0' }}>
                    {h.usuario?.nombre} · {new Date(h.created_at).toLocaleDateString('es-MX')}
                  </div>
                  {h.motivo_texto && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
                      {h.categoria_error && <span style={{ fontFamily:'var(--mono)', fontSize:'7px', padding:'1px 6px', borderRadius:'3px', background:'rgba(249,115,22,0.12)', color:'var(--orange)', display:'inline-block', width:'fit-content' }}>{h.categoria_error}</span>}
                      <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', fontStyle:'italic' }}>"{h.motivo_texto}"</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background:'var(--surface)' }}>
          {esCoordinador && (
            <div style={{ padding:'14px 16px', borderBottom:'0.5px solid var(--border2)' }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'10px' }}>ASIGNACION</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                <div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'4px' }}>METODO CONSTRUCTIVO *</div>
                  <select value={asignacion.metodo_constructivo} onChange={e => setAsignacion(a => ({ ...a, metodo_constructivo: e.target.value }))}
                    style={{ borderColor: !asignacion.metodo_constructivo ? 'rgba(239,68,68,0.4)' : undefined }}>
                    <option value="">Seleccionar...</option>
                    <option value="Aereo">Aereo</option>
                    <option value="Subterraneo">Subterraneo</option>
                    <option value="Mixto">Mixto</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'4px' }}>DIGITALIZADOR</div>
                  <select value={asignacion.digitalizador_id} onChange={e => setAsignacion(a => ({ ...a, digitalizador_id: e.target.value }))}>
                    <option value="">Sin asignar</option>
                    {equipo.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'4px' }}>ANALISTA QA</div>
                  <select value={asignacion.analista_qa_id} onChange={e => setAsignacion(a => ({ ...a, analista_qa_id: e.target.value }))}>
                    <option value="">Sin asignar</option>
                    {equipo.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'4px' }}>PRIORIDAD</div>
                  <select value={asignacion.prioridad} onChange={e => setAsignacion(a => ({ ...a, prioridad: e.target.value }))}>
                    {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'4px' }}>LINK DE ARCHIVOS</div>
                  <input value={asignacion.link_archivos || ''} onChange={e => setAsignacion(a => ({ ...a, link_archivos: e.target.value }))} placeholder="https://..." />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'4px' }}>LATITUD</div>
                    <input type="number" step="0.0000001" value={asignacion.latitud || ''} onChange={e => setAsignacion(a => ({ ...a, latitud: e.target.value }))} placeholder="ej. 19.432608" />
                  </div>
                  <div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'4px' }}>LONGITUD</div>
                    <input type="number" step="0.0000001" value={asignacion.longitud || ''} onChange={e => setAsignacion(a => ({ ...a, longitud: e.target.value }))} placeholder="ej. -99.133209" />
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'4px' }}>OBSERVACIONES</div>
                  <textarea rows={3} value={asignacion.observaciones || ''} onChange={e => setAsignacion(a => ({ ...a, observaciones: e.target.value }))} placeholder="Instrucciones para el analista..." style={{ resize:'vertical', fontSize:'11px' }} />
                </div>
                <button onClick={guardarAsignacion} disabled={saving}
                  style={{ padding:'7px 0', borderRadius:'5px', border:'none', background:'var(--orange)', color:'#080808', fontFamily:'var(--mono)', fontSize:'10px', fontWeight:'500', marginTop:'4px' }}>
                  {saving ? 'GUARDANDO...' : 'GUARDAR ASIGNACION'}
                </button>
              </div>
            </div>
          )}

          <div style={{ padding:'14px 16px', borderBottom:'0.5px solid var(--border2)' }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'10px' }}>EQUIPO ASIGNADO</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              {[
                { label:'DIGITALIZADOR', person: uo.digitalizador, color:'var(--green)' },
                { label:'ANALISTA QA', person: uo.analista_qa, color:'var(--orange)' },
              ].map(a => (
                <div key={a.label} style={{ background:'var(--surface2)', border:'0.5px solid var(--border2)', borderRadius:'6px', padding:'9px 11px' }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', marginBottom:'6px' }}>{a.label}</div>
                  {a.person
                    ? <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
                        <div style={{ width:'24px', height:'24px', borderRadius:'50%', background:'rgba(34,197,94,0.12)', color: a.color, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--mono)', fontSize:'9px' }}>{a.person.iniciales}</div>
                        <div style={{ fontSize:'11px' }}>{a.person.nombre}</div>
                      </div>
                    : <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--muted)' }}>Sin asignar</div>
                  }
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding:'14px 16px' }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.12em', marginBottom:'8px' }}>DATOS VETRO</div>
            {[
              { label:'ID BASECAMP', val: uo.id_basecamp },
              { label:'PROYECTO VETRO', val: uo.proyecto_vetro },
              { label:'METODO CONST.', val: uo.metodo_constructivo },
              { label:'CHECKLIST', val: uo.resultado_checklist ? (uo.resultado_checklist*100).toFixed(1)+'%' : '---' },
              { label:'ESTADO', val: uo.estado },
            ].map(d => (
              <div key={d.label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'0.5px solid var(--border2)' }}>
                <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>{d.label}</span>
                <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--text)' }}>{d.val ?? '---'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showMotivoModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'var(--surface)', border:'0.5px solid var(--border)', borderRadius:'10px', padding:'24px', width:'400px', display:'flex', flexDirection:'column', gap:'14px' }}>
            <div style={{ fontWeight:'700', fontSize:'14px' }}>Motivo requerido</div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)' }}>Transicion: {uo.estado} &gt; {motivoPendiente.estado}</div>
            <div>
              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'6px' }}>MOTIVO *</div>
              <textarea rows={4} value={motivoPendiente.motivo} onChange={e => setMotivoPendiente(m => ({ ...m, motivo: e.target.value }))}
                placeholder="Describe el motivo de esta transicion..."
                style={{ resize:'vertical', fontSize:'11px' }} />
              <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color: motivoPendiente.motivo.length >= 20 ? 'var(--green)' : 'var(--muted2)', marginTop:'3px' }}>
                {motivoPendiente.motivo.length}/20 caracteres minimo
              </div>
            </div>
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button onClick={() => { setShowMotivoModal(false); setCambioEstado('') }}
                style={{ padding:'7px 14px', borderRadius:'5px', border:'0.5px solid var(--border)', background:'none', color:'var(--muted2)', fontSize:'10px', fontFamily:'var(--mono)' }}>CANCELAR</button>
              <button onClick={() => { if (motivoPendiente.motivo.trim().length < 20) return; cambiarEstado(motivoPendiente.estado, motivoPendiente.motivo.trim()) }}
                disabled={motivoPendiente.motivo.trim().length < 20}
                style={{ padding:'7px 14px', borderRadius:'5px', border:'none', background:'var(--orange)', color:'#080808', fontSize:'10px', fontFamily:'var(--mono)', fontWeight:'500', opacity: motivoPendiente.motivo.trim().length >= 20 ? 1 : 0.4 }}>
                CONFIRMAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}