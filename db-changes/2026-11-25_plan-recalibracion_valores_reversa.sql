-- Que hace: reversa de 2026-11-25_plan-recalibracion (valores): quita los valores con vigencia desde el 2026-11-26 y reabre los anteriores; escribe y hace commit.
-- Proyecto: el que se este revirtiendo (SIGOprueba o produccion).
-- No hay frontend que revertir antes.
-- Resultado esperado: sin filas y sin error.
-- La carga que se haya propuesto con los valores nuevos se queda como esta (R4 la marcara);
--   se corrige UO por UO si hace falta.
-- Estado: PROPUESTO, NO APLICADO

begin;

delete from public.plan_rendimientos
 where vigente_desde = date '2026-11-26';

delete from public.plan_parametros
 where clave = 'jornada_minima_uo'
   and vigente_desde = date '2026-11-26';

update public.plan_rendimientos
   set vigente_hasta = null
 where vigente_hasta = date '2026-11-25';

update public.plan_parametros
   set vigente_hasta = null
 where clave = 'jornada_minima_uo'
   and vigente_hasta = date '2026-11-25';

commit;
