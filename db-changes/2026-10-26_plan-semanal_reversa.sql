-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- REVERSA de 2026-10-26_plan-semanal.sql
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD  <-- completar
-- Aplicado en producción (rtwjwfpaturmbmegwtys): AAAA-MM-DD  <-- completar
--
-- ATENCIÓN: borra las tablas del plan con sus datos (carga reservada,
-- integrantes, parámetros, días inhábiles) y las columnas fecha_programada y
-- fecha_origen de actividades_uo. Si hay datos que conservar, exportarlos antes.
--
-- Protege la auditoría: si ya existe algún evento 'reprogramar' en
-- actividades_uo_eventos, aborta sin cambiar nada. Esos eventos no se borran
-- desde aquí; decidir primero qué hacer con ellos.
--
-- generar_actividades_uo y reasignar_actividades_uo vuelven al cuerpo que tenían
-- en SIGOprueba el 2026-10-26, copiado con pg_get_functiondef. Único cambio:
-- los finales de línea CRLF del original quedaron como LF.
-- CREATE OR REPLACE conserva dueño y permisos.
-- =============================================================================

begin;

do $$
begin
  if exists (select 1 from public.actividades_uo_eventos where evento = 'reprogramar') then
    raise exception 'Hay eventos reprogramar en actividades_uo_eventos. La reversa no los borra: decidir antes que hacer con ellos.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Triggers: cuerpo anterior
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generar_actividades_uo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.actividades_uo (uo_id, plantilla_id, nombre, orden, rol_responsable, responsable_id, ronda)
  select new.id, p.id, p.nombre, p.orden, p.rol_responsable,
         case when p.rol_responsable = 'digitalizador' then new.digitalizador_id end,
         1
    from public.plantillas_actividad p
   where p.activa
     and p.momento_creacion = 'asignacion'
     and (p.tipo_proyecto is null or p.tipo_proyecto = new.tipo_proyecto)
  on conflict (uo_id, plantilla_id, ronda) do nothing;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reasignar_actividades_uo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.actividades_uo
     set responsable_id = new.digitalizador_id
   where uo_id = new.id
     and rol_responsable = 'digitalizador'
     and completada_en is null;
  return null;
end;
$function$;

-- -----------------------------------------------------------------------------
-- Funciones nuevas
-- -----------------------------------------------------------------------------

-- reprogramar_actividad devuelve el tipo public.actividades_uo; va antes de
-- quitar columnas de esa tabla.
drop function if exists public.reprogramar_actividad(uuid, date, text);
drop function if exists public.proponer_fechas_uo(uuid, date);
drop function if exists public.plan_inconsistencias();
drop function if exists public.plan_dias_habiles_entre(date, date);
drop function if exists public.plan_sumar_dias_habiles(date, int);
drop function if exists public.plan_carga_persona(uuid, date);
drop function if exists public.plan_jornadas_uo(uuid, date);
drop function if exists public.plan_rendimiento(text, date);
drop function if exists public.plan_parametro(text, date);
drop function if exists public.plan_capacidad_dia(date);
drop function if exists public.plan_hoy();

-- -----------------------------------------------------------------------------
-- Columnas
-- -----------------------------------------------------------------------------

alter table public.actividades_uo_eventos drop constraint actividades_uo_eventos_evento_check;
alter table public.actividades_uo_eventos add constraint actividades_uo_eventos_evento_check
  check (evento in ('marcar', 'desmarcar', 'ajustar_hora'));
alter table public.actividades_uo_eventos
  drop column if exists fecha_anterior,
  drop column if exists fecha_nueva;

drop index if exists public.actividades_uo_fecha_programada_idx;
alter table public.actividades_uo
  drop constraint if exists actividades_uo_fecha_programada_origen_check,
  drop column if exists fecha_origen,
  drop column if exists fecha_programada;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------

drop table if exists public.plan_carga_uo;
drop table if exists public.plan_integrantes;
drop table if exists public.plan_dias_inhabiles;
drop table if exists public.plan_parametros;
drop table if exists public.plan_capacidad;
drop table if exists public.plan_rendimientos;

commit;
