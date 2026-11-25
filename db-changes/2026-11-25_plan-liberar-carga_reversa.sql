-- Que hace: reversa de 2026-11-25_plan-liberar-carga: deja marcar_actividad, desmarcar_actividad y plan_inconsistencias como antes y quita plan_carga_liberada; escribe y hace commit.
-- Proyecto: el que se este revirtiendo (SIGOprueba o produccion).
-- ANTES: revertir el frontend del mismo PR si ya se fusiono (el cambio de PlanSemanal no depende del SQL, pero van juntos).
-- Resultado esperado: sin filas y sin error. Al final marcar_actividad vuelve a la huella b59dca6f4cc4878d94f700cc8cccca41,
--   desmarcar_actividad a 7e8e44851fd265638dd62864d28a86c8 y plan_inconsistencias a fd6ce5846deb798b67810cc3c35a8130
--   (huella previa medida en SIGOprueba el 2026-11-25; produccion debe dar la misma en el 00).
-- AVISO: la carga ya liberada NO regresa a plan_carga_uo y se pierde su registro. Antes de correrla, si hace falta,
--   guardar el resultado de: select * from public.plan_carga_liberada order by uo_id, fecha, created_at;
-- Los cuerpos de las funciones son copia literal de 2026-11-02_plan-validacion (marcar y desmarcar)
--   y de 2026-10-26_plan-semanal (plan_inconsistencias).
-- Estado: PROPUESTO, NO APLICADO

begin;

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
  if exists (select 1 from public.plantillas_actividad p
              where p.id = v_act.plantilla_id and p.momento_creacion = 'validacion') then
    raise exception 'La validacion de calidad no se marca a mano: se cierra sola cuando la UO pasa a Validada' using errcode = 'P0001';
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
  if exists (select 1 from public.plantillas_actividad p
              where p.id = v_act.plantilla_id and p.momento_creacion = 'validacion') then
    raise exception 'La validacion de calidad no se desmarca: se cierra sola cuando la UO pasa a Validada' using errcode = 'P0001';
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

-- Revisión de la regla de consistencia (R1 a R4 del encabezado). Sin filas = consistente.
create or replace function public.plan_inconsistencias()
returns table (uo_id uuid, referencia text, regla text)
language sql
stable
set search_path = ''
as $$
  with pasos as (
    select a.uo_id, a.ronda, a.orden, a.fecha_programada
      from public.actividades_uo a
      join public.plantillas_actividad p on p.id = a.plantilla_id
     where p.momento_creacion = 'asignacion'
  ),
  por_uo as (
    select s.uo_id,
           count(*) filter (where s.fecha_programada is not null) as con_fecha,
           count(*) filter (where s.fecha_programada is null)     as sin_fecha,
           (array_agg(s.fecha_programada order by s.ronda desc, s.orden desc))[1] as ultimo_paso
      from pasos s
     group by s.uo_id
  ),
  carga as (
    select c.uo_id, min(c.fecha) as desde, max(c.fecha) as hasta, sum(c.jornadas) as total
      from public.plan_carga_uo c
     group by c.uo_id
  ),
  reglas as (
    select coalesce(u.uo_id, c.uo_id) as uo_id, r.regla
      from por_uo u
      full join carga c on c.uo_id = u.uo_id
      cross join lateral (values
        (case when c.uo_id is not null and coalesce(u.con_fecha, 0) = 0
              then 'R1 carga sin fechas en las actividades' end),
        (case when coalesce(u.con_fecha, 0) > 0 and c.uo_id is null
              then 'R1 actividades con fecha sin carga reservada' end),
        (case when coalesce(u.con_fecha, 0) > 0 and u.sin_fecha > 0
              then 'R1 actividades con y sin fecha en la misma UO' end),
        (case when c.uo_id is not null and u.ultimo_paso is distinct from c.hasta
              then 'R2 el ultimo paso no vence el ultimo dia de carga' end),
        (case when c.uo_id is not null and c.total is distinct from public.plan_jornadas_uo(c.uo_id, c.desde)
              then 'R4 la suma de la carga no es igual a las jornadas de la UO' end)
      ) as r(regla)
     where r.regla is not null
    union all
    select a.uo_id, 'R3 pasos fuera de orden'
      from pasos a
      join pasos b on b.uo_id = a.uo_id and b.ronda = a.ronda and b.orden > a.orden
     where a.fecha_programada > b.fecha_programada
     group by a.uo_id
  )
  select r.uo_id, u.referencia_operativa, r.regla
    from reglas r
    join public.unidades_operativas u on u.id = r.uo_id
   order by 2, 3
$$;

drop table public.plan_carga_liberada;

commit;
