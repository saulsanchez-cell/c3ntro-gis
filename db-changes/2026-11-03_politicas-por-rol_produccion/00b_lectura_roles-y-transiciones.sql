-- Que hace: lista los perfiles por rol y las transiciones de estado permitidas (solo lectura), para decidir quien puede hacer que.
-- Proyecto: produccion (rtwjwfpaturmbmegwtys).
-- Resultado esperado: filas de dos tipos ('perfil' y 'transicion'). Mandar todas.
-- Corrido en produccion el 2026-11-03: 2 coordinadores (Saul, UUID fijo; Sergio Canales) y 8 analista_gis; 15 transiciones.

select 'perfil' as tipo,
       p.nombre || ' (' || p.rol || case when p.activo is false then ', inactivo' else '' end || ')' as detalle,
       (p.id = '7063db07-ed16-4ca5-8c98-53b63d128702'::uuid) as es_el_coordinador_fijo
  from public.profiles p
union all
select 'transicion',
       t.estado_origen || ' -> ' || t.estado_destino
         || case when t.solo_coordinador then '  [solo coordinador]' else '' end
         || case when t.requiere_motivo then '  [motivo]' else '' end,
       null
  from public.transiciones_permitidas t
order by 1, 2;
