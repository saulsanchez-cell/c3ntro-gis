-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- REVERSA de 2026-10-23_actividades-uo.sql
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD  <-- completar
-- Aplicado en producción (rtwjwfpaturmbmegwtys): AAAA-MM-DD  <-- completar
--
-- ATENCIÓN: borra las tablas con todos sus datos, incluido el rastro de
-- auditoría de actividades_uo_eventos. Si hay datos que conservar, exportarlos
-- antes.
-- =============================================================================

begin;

drop trigger if exists trg_reasignar_actividades_uo on public.unidades_operativas;
drop trigger if exists trg_generar_actividades_uo   on public.unidades_operativas;

-- Las RPC devuelven el tipo public.actividades_uo: se borran antes que la tabla.
drop function if exists public.ajustar_hora_actividad(uuid, timestamptz, text);
drop function if exists public.desmarcar_actividad(uuid, text);
drop function if exists public.marcar_actividad(uuid, timestamptz, text);

-- Los triggers de actividades_uo_eventos se van con la tabla.
drop table if exists public.actividades_uo_eventos;
drop table if exists public.actividades_uo;
drop table if exists public.plantillas_actividad;

drop function if exists public.reasignar_actividades_uo();
drop function if exists public.generar_actividades_uo();
drop function if exists public.validar_hora_actividad(timestamptz, timestamptz);
drop function if exists public.validar_motivo_actividad(text);
drop function if exists public.es_coordinador();
drop function if exists public.bloquear_modificacion_eventos();

commit;
