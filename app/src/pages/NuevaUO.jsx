import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const TIPOS_PROYECTO = ['Baseline','Active Line','Tikva','Enterprise','Data Center','IRU','Backbone','AsBuilt','Reingenieria']
const TIPOS_INFRA = ['Backbone','Lateral','Drop','Long Haul','IRU','Inactivo','Jumper','Sin clasificar']
const ENTIDADES = ['Aguascalientes','Baja California','Campeche','Chiapas','Chihuahua','CDMX','Coahuila','Colima','Durango','Estado de Mexico','Guanajuato','Guerrero','Hidalgo','Jalisco','Michoacan','Morelos','Nayarit','Nuevo Leon','Oaxaca','Puebla','Queretaro','Quintana Roo','San Luis Potosi','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatan','Zacatecas']

export default function NuevaUO() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    referencia_operativa: '',
    nombre: '',
    tipo_proyecto: 'Baseline',
    tipo_infraestructura: 'Sin clasificar',
    entidad_federativa: '',
    km_teoricos: '',
    prioridad: 'P3',
    id_basecamp: '',
    proyecto_vetro: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function guardar() {
    if (!form.referencia_operativa || !form.nombre || !form.tipo_proyecto) {
      setError('Referencia, nombre y tipo de proyecto son obligatorios.')
      return
    }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('unidades_operativas').insert({
      referencia_operativa: form.referencia_operativa.trim(),
      nombre: form.nombre.trim(),
      tipo_proyecto: form.tipo_proyecto,
      tipo_infraestructura: form.tipo_infraestructura,
      entidad_federativa: form.entidad_federativa || null,
      km_teoricos: form.km_teoricos ? parseFloat(form.km_teoricos) : 0,
      prioridad: form.prioridad,
      id_basecamp: form.id_basecamp || null,
      proyecto_vetro: form.proyecto_vetro || null,
      estado: 'Pendiente',
      es_historico: false,
    })
    if (err) { setError(err.message); setSaving(false) }
    else navigate('/backlog')
  }

  return (
    <div style={{ padding:'16px 20px', maxWidth:'700px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'16px' }}>
        <span onClick={() => navigate('/backlog')} style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--muted2)', cursor:'pointer' }}>Backlog</span>
        <span style={{ color:'var(--muted)', fontSize:'9px' }}>&gt;</span>
        <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'var(--orange)' }}>Nueva UO</span>
      </div>
      <div style={{ background:'var(--surface)', border:'0.5px solid var(--border)', borderRadius:'10px', padding:'20px', display:'flex', flexDirection:'column', gap:'14px' }}>
        <div style={{ fontWeight:'700', fontSize:'16px', marginBottom:'4px' }}>Nueva Unidad Operativa</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'5px' }}>REFERENCIA OPERATIVA *</div>
            <input value={form.referencia_operativa} onChange={e => set('referencia_operativa', e.target.value)} placeholder="ej. 0115.61" />
          </div>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'5px' }}>NOMBRE *</div>
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre descriptivo" />
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'5px' }}>TIPO DE PROYECTO *</div>
            <select value={form.tipo_proyecto} onChange={e => set('tipo_proyecto', e.target.value)}>
              {TIPOS_PROYECTO.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'5px' }}>TIPO DE INFRAESTRUCTURA</div>
            <select value={form.tipo_infraestructura} onChange={e => set('tipo_infraestructura', e.target.value)}>
              {TIPOS_INFRA.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px' }}>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'5px' }}>ENTIDAD FEDERATIVA</div>
            <select value={form.entidad_federativa} onChange={e => set('entidad_federativa', e.target.value)}>
              <option value="">Seleccionar...</option>
              {ENTIDADES.map(e => <option key={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'5px' }}>KM TEORICOS</div>
            <input type="number" step="0.001" value={form.km_teoricos} onChange={e => set('km_teoricos', e.target.value)} placeholder="0.000" />
          </div>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'5px' }}>PRIORIDAD</div>
            <select value={form.prioridad} onChange={e => set('prioridad', e.target.value)}>
              {['P1','P2','P3'].map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'5px' }}>ID BASECAMP</div>
            <input value={form.id_basecamp} onChange={e => set('id_basecamp', e.target.value)} placeholder="ID en Basecamp" />
          </div>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginBottom:'5px' }}>PROYECTO VETRO</div>
            <input value={form.proyecto_vetro} onChange={e => set('proyecto_vetro', e.target.value)} placeholder="Referencia en Vetro" />
          </div>
        </div>
        {error && <div style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--red)', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:'5px', padding:'8px 12px' }}>{error}</div>}
        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'4px' }}>
          <button onClick={() => navigate('/backlog')} style={{ padding:'8px 16px', borderRadius:'5px', border:'0.5px solid var(--border)', background:'none', color:'var(--muted2)', fontSize:'10px', fontFamily:'var(--mono)' }}>CANCELAR</button>
          <button onClick={guardar} disabled={saving} style={{ padding:'8px 20px', borderRadius:'5px', border:'none', background:'var(--orange)', color:'#080808', fontSize:'10px', fontFamily:'var(--mono)', fontWeight:'500', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'GUARDANDO...' : 'CREAR UO'}
          </button>
        </div>
      </div>
    </div>
  )
}