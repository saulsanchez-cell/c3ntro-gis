-- Que hace: resumen por UO del seed (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). NUNCA en produccion.
-- Resultado esperado: 8 filas; jornadas 2.29/0.5/1.8/0.67/0.57/1.5/0.5/0.5; hechas 001=3, 002=1; atrasadas 001=1, 002=3; ajustadas 004=1; el resto 0.
-- Corrido en SIGOprueba (iadojhaibxpnirzijivf) el 2026-10-26: resultado esperado.

-- 2a. Resumen por UO
select u.referencia_operativa,
       p.nombre                                                    as digitalizador,
       (select sum(c.jornadas) from public.plan_carga_uo c where c.uo_id = u.id) as jornadas,
       (select min(c.fecha)    from public.plan_carga_uo c where c.uo_id = u.id) as desde,
       (select max(c.fecha)    from public.plan_carga_uo c where c.uo_id = u.id) as hasta,
       (select count(*) from public.actividades_uo a where a.uo_id = u.id and a.completada_en is not null) as hechas,
       (select count(*) from public.actividades_uo a
         where a.uo_id = u.id and a.completada_en is null and a.fecha_programada < public.plan_hoy()) as atrasadas,
       (select count(*) from public.actividades_uo a where a.uo_id = u.id and a.fecha_origen = 'ajustada') as ajustadas
  from public.unidades_operativas u
  left join public.profiles p on p.id = u.digitalizador_id
 where u.referencia_operativa like 'SEED-PLAN-%'
 order by u.referencia_operativa;
