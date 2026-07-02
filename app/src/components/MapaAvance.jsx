import { useEffect, useRef, useState } from 'react'

const ESTADO_COLOR = {
  'Pendiente':     '#6B7280',
  'Asignada':      '#F97316',
  'En Proceso':    '#FACC15',
  'En Validacion': '#FACC15',
  'Validada':      '#22C55E',
  'Cerrada':       '#22C55E',
  'Rechazada':     '#EF4444',
  'Bloqueada':     '#EF4444',
  'En Correccion': '#3B82F6',
}

const TIPOS_PROYECTO = ['Tikva', 'Baseline', 'Active Line']
const ESTADOS_FILTRO = ['Pendiente', 'Asignada', 'En Proceso', 'En Validacion', 'Validada', 'Cerrada', 'Rechazada', 'Bloqueada', 'En Correccion']

export default function MapaAvance({ uos }) {
  const mapRef           = useRef(null)
  const mapInstanceRef   = useRef(null)
  const markersLayerRef  = useRef(null)

  const [filtroEstado, setFiltroEstado]   = useState([])
  const [filtroTipo,   setFiltroTipo]     = useState([])

  // ── 1. Inicializar mapa UNA sola vez ──────────────────────────────────────
  useEffect(() => {
    if (mapInstanceRef.current) return

    import('leaflet').then(L => {
      if (mapInstanceRef.current) return

      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      const map = L.map(mapRef.current, {
        center: [22.5, -102],
        zoom: 5,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map)

      // Capa de marcadores independiente del mapa base
      markersLayerRef.current = L.layerGroup().addTo(map)
      mapInstanceRef.current  = map
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        markersLayerRef.current = null
      }
    }
  }, [])

  // ── 2. Redibujar marcadores cuando cambian filtros o datos ────────────────
  useEffect(() => {
    if (!markersLayerRef.current) return

    import('leaflet').then(L => {
      if (!markersLayerRef.current) return

      // Limpiar marcadores anteriores sin tocar el mapa base
      markersLayerRef.current.clearLayers()

      const uosFiltradas = uos.filter(u => {
        if (!u.latitud || !u.longitud) return false
        if (filtroEstado.length > 0 && !filtroEstado.includes(u.estado)) return false
        if (filtroTipo.length   > 0 && !filtroTipo.includes(u.tipo_proyecto)) return false
        return true
      })

      uosFiltradas.forEach(u => {
        const color  = ESTADO_COLOR[u.estado] || '#6B7280'
        const marker = L.circleMarker([u.latitud, u.longitud], {
          radius:      6,
          fillColor:   color,
          color:       '#000',
          weight:      0.5,
          opacity:     0.8,
          fillOpacity: 0.85,
        })
        marker.bindPopup(`
          <div style="font-family:monospace;font-size:11px;line-height:1.6">
            <div style="font-weight:bold;color:#F97316">${u.referencia_operativa}</div>
            <div>${u.nombre}</div>
            <div style="margin-top:4px;color:#888">${u.tipo_proyecto} · ${u.estado}</div>
            ${u.metodo_constructivo ? `<div style="color:#888">${u.metodo_constructivo}</div>` : ''}
          </div>
        `)
        markersLayerRef.current.addLayer(marker)
      })
    })
  }, [uos, filtroEstado, filtroTipo])

  function toggleFiltro(arr, setArr, valor) {
    setArr(prev => prev.includes(valor) ? prev.filter(v => v !== valor) : [...prev, valor])
  }

  function limpiarFiltros() {
    setFiltroEstado([])
    setFiltroTipo([])
  }

  const hayFiltros = filtroEstado.length > 0 || filtroTipo.length > 0

  const uosConCoords   = uos.filter(u => u.latitud && u.longitud)
  const uosMostradas   = uosConCoords.filter(u => {
    if (filtroEstado.length > 0 && !filtroEstado.includes(u.estado)) return false
    if (filtroTipo.length   > 0 && !filtroTipo.includes(u.tipo_proyecto)) return false
    return true
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />

      {/* ── Controles de filtro ── */}
      <div style={{ display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>

        <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
          <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.1em' }}>ESTADO</span>
          <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
            {ESTADOS_FILTRO.map(estado => {
              const activo = filtroEstado.includes(estado)
              return (
                <button key={estado} onClick={() => toggleFiltro(filtroEstado, setFiltroEstado, estado)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '3px 8px', borderRadius: '4px', cursor: 'pointer',
                    fontFamily: 'var(--mono)', fontSize: '8px',
                    border: activo ? `0.5px solid ${ESTADO_COLOR[estado]}` : '0.5px solid var(--border2)',
                    background: activo ? `${ESTADO_COLOR[estado]}22` : 'none',
                    color: activo ? '#fff' : 'var(--muted2)',
                  }}>
                  <div style={{ width:'6px', height:'6px', borderRadius:'50%', background: ESTADO_COLOR[estado], flexShrink:0 }} />
                  {estado}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ width:'0.5px', height:'40px', background:'var(--border2)', flexShrink:0 }} />

        <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
          <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted)', letterSpacing:'0.1em' }}>TIPO DE PROYECTO</span>
          <div style={{ display:'flex', gap:'4px' }}>
            {TIPOS_PROYECTO.map(tipo => {
              const activo = filtroTipo.includes(tipo)
              return (
                <button key={tipo} onClick={() => toggleFiltro(filtroTipo, setFiltroTipo, tipo)}
                  style={{
                    padding: '3px 8px', borderRadius: '4px', cursor: 'pointer',
                    fontFamily: 'var(--mono)', fontSize: '8px',
                    border: activo ? '0.5px solid var(--orange)' : '0.5px solid var(--border2)',
                    background: activo ? 'rgba(249,115,22,0.12)' : 'none',
                    color: activo ? 'var(--orange)' : 'var(--muted2)',
                  }}>
                  {tipo}
                </button>
              )
            })}
          </div>
        </div>

        {hayFiltros && (
          <button onClick={limpiarFiltros}
            style={{ padding:'3px 10px', borderRadius:'4px', border:'0.5px solid var(--border2)', background:'none', color:'var(--muted2)', fontFamily:'var(--mono)', fontSize:'8px', cursor:'pointer', marginTop:'12px' }}>
            Limpiar filtros
          </button>
        )}

        <span style={{ fontFamily:'var(--mono)', fontSize:'8px', color:'var(--muted2)', marginTop:'12px', marginLeft:'auto' }}>
          {uosMostradas.length} / {uosConCoords.length} UOs con coordenadas
        </span>
      </div>

      {/* ── Mapa ── */}
      <div style={{ position:'relative' }}>
        <div ref={mapRef} style={{ height:'360px', borderRadius:'8px', overflow:'hidden', zIndex:0 }} />

        {/* Leyenda de estados */}
        <div style={{ position:'absolute', bottom:'10px', left:'10px', background:'rgba(13,17,23,0.85)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:'6px', padding:'8px 10px', zIndex:1000 }}>
          {Object.entries(ESTADO_COLOR).filter((_, i) => i < 6).map(([estado, color]) => (
            <div key={estado} style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'3px' }}>
              <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:color, flexShrink:0,
                opacity: filtroEstado.length === 0 || filtroEstado.includes(estado) ? 1 : 0.25 }} />
              <span style={{ fontFamily:'var(--mono)', fontSize:'9px',
                color: filtroEstado.length === 0 || filtroEstado.includes(estado) ? '#ccc' : '#555' }}>
                {estado}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
