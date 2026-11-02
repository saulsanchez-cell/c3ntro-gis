-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- REVERSA de 2026-11-02_plan-validacion (validacion planeada en el plan semanal).
-- El cambio esta en 2026-11-02_plan-validacion_sigoprueba/01_escribe_cambio.sql
-- (y el check en 06_escribe_check-no-autovalidacion.sql).
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD
-- Aplicado en producción (rtwjwfpaturmbmegwtys): AAAA-MM-DD
--
-- ANTES DE CORRERLA HAY QUE REVERTIR EL FRONTEND de la entrega 3 si ya se
-- fusiono: lee plan_carga_actividad, que esta reversa borra.
--
-- Orden dentro del script:
--   1. Quita los triggers trg_reasignar_validacion_uo y trg_cerrar_validacion_uo.
--   2. generar_actividades_uo, reprogramar_actividad, plan_carga_persona,
--      marcar_actividad y desmarcar_actividad vuelven a sus cuerpos originales,
--      copiados tal cual de los archivos (comprobado el 2026-11-02: el texto del
--      repo da la misma huella que la base). CREATE OR REPLACE conserva dueño y
--      permisos; los REVOKE/GRANT se repiten por seguridad.
--   3. Borra las funciones nuevas.
--   4. Borra las actividades de validacion. ATENCION: por cascada se borran
--      tambien su carga y sus eventos (cierres automaticos y reprogramaciones),
--      es decir, ese rastro de auditoria. El NOTICE dice cuantas habia.
--   5. Borra plan_carga_actividad, el parametro jornadas_validacion_uo y
--      desactiva la plantilla "Validación de calidad".
--   6. Quita "nadie se autovalida" si se corrio el 06: los triggers
--      trg_analista_distinto_insert/_update y validar_analista_distinto_uo(),
--      y el check de la primera version si quedara.
--
-- Verificacion despues (cada una en su propia consulta):
--   select md5(replace(pg_get_functiondef('public.generar_actividades_uo()'::regprocedure), E'\r', ''));
--     -> 0f2874819268a01fadb35fbb4ad6c6d3
--   select md5(replace(pg_get_functiondef('public.reprogramar_actividad(uuid,date,text)'::regprocedure), E'\r', ''));
--     -> db6d767ef97245ec68883363e4bf300f
--   select md5(replace(pg_get_functiondef('public.plan_carga_persona(uuid,date)'::regprocedure), E'\r', ''));
--     -> a9fb0fe579ac9b8b6d97da7d2a16da9d
--   select md5(replace(pg_get_functiondef('public.marcar_actividad(uuid,timestamptz,text)'::regprocedure), E'\r', ''));
--     -> c057db26a154dc081337b6af97ac9b0d
--   select md5(replace(pg_get_functiondef('public.desmarcar_actividad(uuid,text)'::regprocedure), E'\r', ''));
--     -> 4a42e6ba2c11c2d058995daef8711b4c
--   select to_regclass('public.plan_carga_actividad');
--     -> null
--   select * from public.plan_inconsistencias();
--     -> 0 filas
-- =============================================================================

begin;

do $$
declare
  v_actividades int;
  v_eventos     int;
begin
  if to_regclass('public.plan_carga_actividad') is null then
    raise exception 'plan_carga_actividad no existe: el cambio no esta aplicado. Abortado.';
  end if;
  select count(*) into v_actividades
    from public.actividades_uo a
    join public.plantillas_actividad p on p.id = a.plantilla_id
   where p.momento_creacion = 'validacion';
  select count(*) into v_eventos
    from public.actividades_uo_eventos e
    join public.actividades_uo a on a.id = e.actividad_id
    join public.plantillas_actividad p on p.id = a.plantilla_id
   where p.momento_creacion = 'validacion';
  raise notice 'Se borran % actividades de validacion y % eventos suyos', v_actividades, v_eventos;
end $$;

-- 1. Triggers nuevos
drop trigger trg_reasignar_validacion_uo on public.unidades_operativas;
drop trigger trg_cerrar_validacion_uo on public.unidades_operativas;

-- 2. Cuerpos originales
-- generar_actividades_uo: de 2026-10-26_plan-semanal.sql, tal cual
create or replace function public.generar_actividades_uo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Plan semanal: si la propuesta falla, la asignación se guarda sin fechas
  -- (subtransacción: se deshace solo lo de la propuesta) y queda un WARNING.
  begin
    perform public.proponer_fechas_uo(new.id);
  exception when others then
    raise warning 'Plan semanal: no se pudieron proponer fechas para la UO % (%: %). La asignacion se guarda sin fechas; usar el backfill.',
      new.referencia_operativa, sqlstate, sqlerrm;
  end;

  return null;
end;
$$;

-- reprogramar_actividad: de 2026-10-26_plan-semanal.sql, tal cual
create or replace function public.reprogramar_actividad(p_actividad uuid, p_fecha date, p_motivo text)
returns setof public.actividades_uo
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_hoy      date := public.plan_hoy();
  v_act      public.actividades_uo;
  v_motivo   text;
  v_previa   date;
  v_anterior   date;
  v_es_primero boolean;
  v_n          int;
  v_nueva      date;
  v_movidas    jsonb;
  r            record;
begin
  if v_uid is null then
    raise exception 'Sesion requerida' using errcode = '42501';
  end if;
  if not public.es_coordinador() then
    raise exception 'No tienes permiso para reprogramar actividades' using errcode = '42501';
  end if;

  select * into v_act from public.actividades_uo where id = p_actividad;
  if not found then
    raise exception 'Actividad no encontrada' using errcode = 'P0002';
  end if;

  -- Bloquea todos los pasos de la UO mientras se mueven
  perform 1 from public.actividades_uo where uo_id = v_act.uo_id for update;
  select * into v_act from public.actividades_uo where id = p_actividad;

  if v_act.completada_en is not null then
    raise exception 'La actividad ya esta completada' using errcode = 'P0001';
  end if;
  if v_act.fecha_programada is null then
    raise exception 'La actividad no tiene fecha programada' using errcode = 'P0001';
  end if;
  if p_fecha is null then
    raise exception 'La fecha es obligatoria' using errcode = '22023';
  end if;

  v_motivo := public.validar_motivo_actividad(p_motivo);

  if p_fecha < v_hoy then
    raise exception 'La fecha no puede ser anterior a hoy (%)', v_hoy using errcode = '22023';
  end if;
  if public.plan_capacidad_dia(p_fecha) <= 0 then
    raise exception 'La fecha no es un dia habil (%)', p_fecha using errcode = '22023';
  end if;
  if p_fecha = v_act.fecha_programada then
    raise exception 'La actividad ya tiene esa fecha' using errcode = '22023';
  end if;

  select max(a.fecha_programada) into v_previa
    from public.actividades_uo a
   where a.uo_id = v_act.uo_id
     and a.ronda = v_act.ronda
     and a.orden < v_act.orden;
  if v_previa is not null and p_fecha < v_previa then
    raise exception 'La fecha no puede ser anterior al paso previo (%)', v_previa using errcode = '22023';
  end if;

  v_anterior   := v_act.fecha_programada;
  v_n          := public.plan_dias_habiles_entre(v_anterior, p_fecha);
  v_es_primero := not exists (select 1 from public.actividades_uo a
                               where a.uo_id = v_act.uo_id
                                 and a.ronda = v_act.ronda
                                 and a.orden < v_act.orden);

  -- Carga que se desplaza igual que los pasos (la suma no cambia):
  --   primer paso -> toda la carga de la UO (incluye el inicio del bloque 1 a 3
  --                  que cae antes de su fecha, p. ej. el viernes)
  --   otro paso   -> la carga con fecha >= su fecha anterior
  -- La fila de la fecha anterior va exactamente a p_fecha.
  select coalesce(jsonb_agg(jsonb_build_object(
           'fecha',          case when c.fecha = v_anterior then p_fecha
                                  else public.plan_sumar_dias_habiles(c.fecha, v_n) end,
           'responsable_id', c.responsable_id,
           'jornadas',       c.jornadas)), '[]'::jsonb)
    into v_movidas
    from public.plan_carga_uo c
   where c.uo_id = v_act.uo_id
     and (v_es_primero or c.fecha >= v_anterior);

  delete from public.plan_carga_uo c
   where c.uo_id = v_act.uo_id
     and (v_es_primero or c.fecha >= v_anterior);

  insert into public.plan_carga_uo as c (uo_id, fecha, responsable_id, jornadas)
  select v_act.uo_id,
         (m->>'fecha')::date,
         (array_agg((m->>'responsable_id')::uuid))[1],
         sum((m->>'jornadas')::numeric)
    from jsonb_array_elements(v_movidas) m
   group by (m->>'fecha')::date
  on conflict (uo_id, fecha) do update
     set jornadas = c.jornadas + excluded.jornadas;

  -- Pasos: esta actividad y las siguientes de la misma UO y ronda
  for r in
    select a.id, a.fecha_programada
      from public.actividades_uo a
     where a.uo_id = v_act.uo_id
       and a.ronda = v_act.ronda
       and a.orden >= v_act.orden
       and a.fecha_programada is not null
     order by a.orden
  loop
    v_nueva := case when r.id = v_act.id then p_fecha
                    else public.plan_sumar_dias_habiles(r.fecha_programada, v_n) end;
    if v_nueva is distinct from r.fecha_programada then
      update public.actividades_uo
         set fecha_programada = v_nueva,
             fecha_origen     = 'ajustada'
       where id = r.id;

      insert into public.actividades_uo_eventos
        (actividad_id, usuario_id, evento, fecha_anterior, fecha_nueva, motivo)
      values (r.id, v_uid, 'reprogramar', r.fecha_programada, v_nueva, v_motivo);
    end if;
  end loop;

  return query
    select * from public.actividades_uo a
     where a.uo_id = v_act.uo_id
     order by a.ronda, a.orden;
end;
$$;

-- plan_carga_persona: de 2026-10-26_plan-semanal.sql, tal cual
create or replace function public.plan_carga_persona(p_persona uuid, p_fecha date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(c.jornadas), 0)
    from public.plan_carga_uo c
   where c.responsable_id = p_persona
     and c.fecha = p_fecha
$$;

-- marcar_actividad: de 2026-10-23_actividades-uo.sql, tal cual
create or replace function public.marcar_actividad(
  p_actividad uuid,
  p_hora_real timestamptz default null,
  p_motivo    text        default null
)
returns public.actividades_uo
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_act    public.actividades_uo;
  v_hora   timestamptz := now();
  v_motivo text;
begin
  if v_uid is null then
    raise exception 'Sesion requerida' using errcode = '42501';
  end if;

  select * into v_act from public.actividades_uo where id = p_actividad for update;
  if not found then
    raise exception 'Actividad no encontrada' using errcode = 'P0002';
  end if;
  if v_act.responsable_id is distinct from v_uid and not public.es_coordinador() then
    raise exception 'No tienes permiso para modificar esta actividad' using errcode = '42501';
  end if;
  if v_act.completada_en is not null then
    raise exception 'La actividad ya esta completada' using errcode = 'P0001';
  end if;

  if p_hora_real is not null then
    v_motivo := public.validar_motivo_actividad(p_motivo);
    perform public.validar_hora_actividad(p_hora_real, v_act.created_at);
    v_hora := p_hora_real;
  end if;

  update public.actividades_uo
     set completada_en    = v_hora,
         completada_por   = v_uid,
         registrada_en    = now(),
         registrada_tarde = p_hora_real is not null,
         motivo_ajuste    = v_motivo
   where id = p_actividad
  returning * into v_act;

  insert into public.actividades_uo_eventos (actividad_id, usuario_id, evento, valor_anterior, valor_nuevo, motivo)
  values (p_actividad, v_uid, 'marcar', null, v_hora, v_motivo);

  return v_act;
end;
$$;

-- desmarcar_actividad: de 2026-10-23_actividades-uo.sql, tal cual
create or replace function public.desmarcar_actividad(p_actividad uuid, p_motivo text)
returns public.actividades_uo
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_act      public.actividades_uo;
  v_anterior timestamptz;
  v_motivo   text;
begin
  if v_uid is null then
    raise exception 'Sesion requerida' using errcode = '42501';
  end if;

  select * into v_act from public.actividades_uo where id = p_actividad for update;
  if not found then
    raise exception 'Actividad no encontrada' using errcode = 'P0002';
  end if;
  if v_act.responsable_id is distinct from v_uid and not public.es_coordinador() then
    raise exception 'No tienes permiso para modificar esta actividad' using errcode = '42501';
  end if;
  if v_act.completada_en is null then
    raise exception 'La actividad no esta completada' using errcode = 'P0001';
  end if;

  v_motivo   := public.validar_motivo_actividad(p_motivo);
  v_anterior := v_act.completada_en;

  update public.actividades_uo
     set completada_en    = null,
         completada_por   = null,
         registrada_en    = null,
         registrada_tarde = false,
         motivo_ajuste    = null
   where id = p_actividad
  returning * into v_act;

  insert into public.actividades_uo_eventos (actividad_id, usuario_id, evento, valor_anterior, valor_nuevo, motivo)
  values (p_actividad, v_uid, 'desmarcar', v_anterior, null, v_motivo);

  return v_act;
end;
$$;

-- 3. Funciones nuevas
drop function public.reasignar_validacion_uo();
drop function public.cerrar_validacion_uo();
drop function public.proponer_validacion_uo(uuid, date);
drop function public.plan_inconsistencias_validacion();

-- 4. Actividades de validacion (cascada: carga y eventos)
delete from public.actividades_uo a
 using public.plantillas_actividad p
 where p.id = a.plantilla_id
   and p.momento_creacion = 'validacion';

-- 5. Tabla, parametro y plantilla
drop table public.plan_carga_actividad;

delete from public.plan_parametros where clave = 'jornadas_validacion_uo';

update public.plantillas_actividad
   set activa = false
 where nombre = 'Validación de calidad' and orden = 5 and momento_creacion = 'validacion';

-- 6. "Nadie se autovalida" (solo si se corrio el 06)
drop trigger if exists trg_analista_distinto_insert on public.unidades_operativas;
drop trigger if exists trg_analista_distinto_update on public.unidades_operativas;
drop function if exists public.validar_analista_distinto_uo();
alter table public.unidades_operativas
  drop constraint if exists unidades_operativas_analista_distinto_digitalizador_check;

revoke all on function
  public.generar_actividades_uo(),
  public.reprogramar_actividad(uuid, date, text),
  public.plan_carga_persona(uuid, date),
  public.marcar_actividad(uuid, timestamptz, text),
  public.desmarcar_actividad(uuid, text)
  from public, anon, authenticated;

grant execute on function
  public.reprogramar_actividad(uuid, date, text),
  public.marcar_actividad(uuid, timestamptz, text),
  public.desmarcar_actividad(uuid, text)
  to authenticated;

commit;
