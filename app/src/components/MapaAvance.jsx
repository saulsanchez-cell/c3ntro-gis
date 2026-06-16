import { useEffect, useRef } from 'react'

const ESTADO_COLOR = {
  'Pendiente': '#6B7280',
  'Asignada': '#F97316',
  'En Proceso': '#FACC15',
  'En Validacion': '#FACC15',
  'Validada': '#22C55E',
  'Cerrada': '#22C55E',
  'Rechazada': '#EF4444',
  'Bloqueada': '#EF4444',
  'En Correccion': '#3B82F6',
}

export default function MapaAvance({ uos }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)

  useEffect(() => {
    if (mapInstanceRef.current) return

    import('leaflet').then(L => {
      if (mapInstanceRef.current) return

      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
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

      const uosConCoords = uos.filter(u => u.latitud && u.longitud)

      uosConCoords.forEach(u => {
        const color = ESTADO_COLOR[u.estado] || '#6B7280'
        const marker = L.circleMarker([u.latitud, u.longitud], {
          radius: 6,
          fillColor: color,
          color: '#000',
          weight: 0.5,
          opacity: 0.8,
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
        marker.addTo(map)
      })

      mapInstanceRef.current = map
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  return (
    <div style={{ position:'relative' }}>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
      <div ref={mapRef} style={{ height:'360px', borderRadius:'8px', overflow:'hidden', zIndex:0 }} />
      <div style={{ position:'absolute', bottom:'10px', left:'10px', background:'rgba(13,17,23,0.85)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:'6px', padding:'8px 10px', zIndex:1000 }}>
        {Object.entries(ESTADO_COLOR).filter((_, i) => i < 6).map(([estado, color]) => (
          <div key={estado} style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'3px' }}>
            <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:color, flexShrink:0 }} />
            <span style={{ fontFamily:'var(--mono)', fontSize:'9px', color:'#ccc' }}>{estado}</span>
          </div>
        ))}
      </div>
    </div>
  )
}