-- Que hace: revisa, antes del cambio, la estructura de transiciones_permitidas y que todavia no existan Pendiente -> Bloqueada ni Pendiente -> Cerrada (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual (ver ../2026-11-23_transiciones-desde-pendiente_produccion/README.md).
-- Resultado esperado: 1 fila con todo_listo = true. Si sale false, no seguir y mandar la fila completa.
--   salidas_de_pendiente: en produccion "Pendiente -> Asignada"; en SIGOprueba vacio (la tabla no tiene filas).
--   triggers_uo: para confirmar que ningun trigger revisa las transiciones (hoy solo las usa el frontend).

select
  to_regclass('public.transiciones_permitidas') is not null
    and (select count(*) from pg_attribute a
          where a.attrelid = 'public.transiciones_permitidas'::regclass
            and a.attname in ('estado_origen', 'estado_destino', 'solo_coordinador', 'requiere_motivo')
            and a.attnum > 0 and not a.attisdropped) = 4
    and not exists (select 1 from public.transiciones_permitidas t
                     where t.estado_origen::text = 'Pendiente'
                       and t.estado_destino::text in ('Bloqueada', 'Cerrada'))
    and exists (select 1 from pg_attribute a
                 where a.attrelid = 'public.unidades_operativas'::regclass
                   and a.attname in ('tipo_validacion') and not a.attisdropped)
    as todo_listo,
  (select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                       || case when a.attnotnull then ' not null' else '' end
                       || case when d.adbin is not null then ' (default)' else '' end, ', ' order by a.attnum)
     from pg_attribute a
     left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.transiciones_permitidas'::regclass
      and a.attnum > 0 and not a.attisdropped) as columnas,
  (select string_agg(t.estado_origen || ' -> ' || t.estado_destino, ', ' order by t.estado_destino)
     from public.transiciones_permitidas t
    where t.estado_origen::text = 'Pendiente') as salidas_de_pendiente,
  (select string_agg(tg.tgname, ', ' order by tg.tgname)
     from pg_trigger tg
    where tg.tgrelid = 'public.unidades_operativas'::regclass
      and not tg.tgisinternal) as triggers_uo;
