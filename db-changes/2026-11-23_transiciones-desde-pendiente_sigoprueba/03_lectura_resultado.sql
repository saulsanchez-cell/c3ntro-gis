-- Que hace: lista las transiciones de Pendiente y Bloqueada despues del cambio (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf) y produccion.
-- Resultado esperado:
--   produccion: 5 filas
--     Bloqueada -> En Proceso
--     Bloqueada -> Pendiente  [solo coordinador]
--     Pendiente -> Asignada
--     Pendiente -> Bloqueada  [solo coordinador]  [motivo]
--     Pendiente -> Cerrada  [solo coordinador]
--   SIGOprueba: solo las 2 de Pendiente nuevas (la tabla no tenia filas).

select t.estado_origen || ' -> ' || t.estado_destino
         || case when t.solo_coordinador then '  [solo coordinador]' else '' end
         || case when t.requiere_motivo then '  [motivo]' else '' end as transicion
  from public.transiciones_permitidas t
 where t.estado_origen::text in ('Pendiente', 'Bloqueada')
 order by 1;
