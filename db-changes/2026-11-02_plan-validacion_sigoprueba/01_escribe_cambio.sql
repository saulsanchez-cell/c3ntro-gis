-- Que hace: planea la validacion de calidad del analista QA en el plan semanal (entrega 2); escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual (ver ../2026-11-02_plan-validacion_produccion/README.md).
-- Reversa: db-changes/2026-11-02_plan-validacion_reversa.sql (antes, revertir el frontend de la entrega 3 si ya se fusiono).
-- Resultado esperado: sin filas y sin error. Si aborta por una huella distinta o porque algo ya existe, no queda nada escrito: mandar el mensaje completo.
-- Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-11-02
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-11-02
--
-- Requiere: 2026-10-26_plan-semanal.sql, 2026-10-29_plan-inicio-asignacion y
-- 2026-11-02_renombrar-paso-4 aplicados.
--
-- Crea:
--   parametro jornadas_validacion_uo = 0.5 (plan_parametros)
--   tabla     plan_carga_actividad (capacidad reservada por actividad y dia;
--             hoy solo la usa la validacion)
--   funciones proponer_validacion_uo (interna, SECURITY DEFINER)
--             plan_inconsistencias_validacion (interna)
--             reasignar_validacion_uo, cerrar_validacion_uo (triggers)
--   triggers  trg_reasignar_validacion_uo, trg_cerrar_validacion_uo en unidades_operativas
-- Modifica:
--   plantilla "Validación de calidad" pasa a activa (nombre, orden 5 y momento 'validacion' sin cambios)
--   plan_carga_persona        suma plan_carga_uo y plan_carga_actividad
--   generar_actividades_uo    crea tambien la validacion (responsable = analista_qa_id)
--                             y propone su fecha en una subtransaccion aparte
--   reprogramar_actividad     la validacion mueve solo su carga; un paso del
--                             digitalizador arrastra la validacion y su carga
--   marcar_actividad,
--   desmarcar_actividad       rechazan la validacion: solo se cierra sola
-- CREATE OR REPLACE conserva dueño y permisos; los REVOKE/GRANT se repiten.
-- No toca: Checklist.jsx, la maquina de estados, proteger_km_teoricos,
-- profiles.rol, logs_actividad, plan_carga_uo ni plan_inconsistencias.
-- El check "nadie se autovalida" va aparte: 06_escribe_check-no-autovalidacion.sql.
--
-- -----------------------------------------------------------------------------
-- MODELO
-- -----------------------------------------------------------------------------
--   La validacion es una actividad mas de la UO (orden 5, ronda 1), con
--   responsable = unidades_operativas.analista_qa_id. Se crea al pasar a
--   Asignada, aunque todavia no haya analista (queda sin responsable, sin
--   fecha y sin carga hasta que se elija).
--   Su carga va en plan_carga_actividad, no en plan_carga_uo: la llave
--   (uo_id, fecha) de plan_carga_uo chocaria con la del digitalizador el mismo
--   dia, y R4 (suma = jornadas de la UO) dejaria de cumplirse.
--   El analista tambien digitaliza: plan_carga_persona suma las dos tablas, asi
--   que la validacion ocupa el mismo dia que su trabajo de digitalizacion.
--
-- PROPUESTA (proponer_validacion_uo)
--   jornadas = jornadas_validacion_uo vigente (0.5). No se parte entre dias.
--   inicio   = greatest(fecha del paso 4, coalesce(p_inicio, hoy en Mexico)).
--   dia      = primer dia desde el inicio con libre >= jornadas para el analista.
--   No hace nada si ya tiene carga, si no hay analista, si el paso 4 no tiene
--   fecha o si la validacion ya esta completada. Candado por persona, el mismo
--   de proponer_fechas_uo.
--
-- CAMBIO DE ANALISTA (trg_reasignar_validacion_uo, espejo de reasignar)
--   La validacion pendiente pasa al analista nuevo y su carga de hoy en
--   adelante tambien, con la misma fecha. Si no tenia carga, se propone. Si
--   la validacion aun no existe (UO sin asignar), no hace nada.
--   En la asignacion corre en el mismo UPDATE despues de trg_generar (orden
--   alfabetico de triggers) y no cambia nada: es idempotente.
--
-- CIERRE (trg_cerrar_validacion_uo)
--   Solo al pasar de 'En Validacion' a 'Validada': completada_en = now(),
--   completada_por = auth.uid() y evento 'marcar'. Sin sesion no la cierra
--   (RAISE WARNING). En Correccion y Rechazada la dejan abierta: se ve
--   atrasada y se reprograma. La carga reservada se queda (igual que con los
--   pasos del digitalizador).
--
-- REPROGRAMAR
--   Validacion: mueve solo su fila de plan_carga_actividad a la fecha nueva; la
--   regla "no anterior al paso previo" ya impide dejarla antes del paso 4.
--   Paso del digitalizador: como antes, y la validacion (orden 5) se recorre
--   los mismos dias habiles con su carga.
--
-- REGLAS (plan_inconsistencias_validacion; sin filas = consistente)
--   V1  Una validacion con fecha tiene exactamente una fila de carga, en ese
--       dia; sin fecha no tiene carga; no hay carga en actividades que no son
--       validacion.
--   V2  La validacion no vence antes del paso 4 de su ronda.
--   V3  Su carga es igual a jornadas_validacion_uo vigente ese dia.
--   V4  Si esta pendiente, su carga de hoy en adelante esta a nombre de su
--       responsable.
--
-- SEGURIDAD
--   plan_carga_actividad: RLS, REVOKE ALL a public, anon y authenticated, y
--   solo SELECT para authenticated. Nadie escribe desde el cliente.
--   Funciones nuevas: SET search_path = '', nombres calificados, sin EXECUTE
--   para public, anon ni authenticated.
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.plan_carga_actividad') is not null then
    raise exception 'La tabla plan_carga_actividad ya existe. Abortado.';
  end if;
  if exists (select 1 from public.plan_parametros where clave = 'jornadas_validacion_uo') then
    raise exception 'El parametro jornadas_validacion_uo ya existe. Abortado.';
  end if;
  if (select count(*) from public.plantillas_actividad
       where nombre = 'Validación de calidad' and orden = 5 and momento_creacion = 'validacion' and not activa) <> 1 then
    raise exception 'No hay exactamente una plantilla "Validación de calidad" (orden 5, validacion) inactiva. Abortado.';
  end if;
  if exists (select 1 from public.actividades_uo a
               join public.plantillas_actividad p on p.id = a.plantilla_id
              where p.momento_creacion = 'validacion') then
    raise exception 'Ya hay actividades de validacion. Abortado.';
  end if;
  if md5(replace(pg_get_functiondef('public.generar_actividades_uo()'::regprocedure), E'\r', ''))
       is distinct from '0f2874819268a01fadb35fbb4ad6c6d3' then
    raise exception 'generar_actividades_uo no es la version medida el 2026-11-02 (md5 distinto). Abortado.';
  end if;
  if md5(replace(pg_get_functiondef('public.reprogramar_actividad(uuid,date,text)'::regprocedure), E'\r', ''))
       is distinct from 'db6d767ef97245ec68883363e4bf300f' then
    raise exception 'reprogramar_actividad no es la version medida el 2026-11-02 (md5 distinto). Abortado.';
  end if;
  if md5(replace(pg_get_functiondef('public.plan_carga_persona(uuid,date)'::regprocedure), E'\r', ''))
       is distinct from 'a9fb0fe579ac9b8b6d97da7d2a16da9d' then
    raise exception 'plan_carga_persona no es la version medida el 2026-11-02 (md5 distinto). Abortado.';
  end if;
  if md5(replace(pg_get_functiondef('public.marcar_actividad(uuid,timestamptz,text)'::regprocedure), E'\r', ''))
       is distinct from 'c057db26a154dc081337b6af97ac9b0d' then
    raise exception 'marcar_actividad no es la version medida el 2026-11-02 (md5 distinto). Abortado.';
  end if;
  if md5(replace(pg_get_functiondef('public.desmarcar_actividad(uuid,text)'::regprocedure), E'\r', ''))
       is distinct from '4a42e6ba2c11c2d058995daef8711b4c' then
    raise exception 'desmarcar_actividad no es la version medida el 2026-11-02 (md5 distinto). Abortado.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Parametro, plantilla y tabla
-- -----------------------------------------------------------------------------

insert into public.plan_parametros (clave, valor, descripcion, vigente_desde) values
  ('jornadas_validacion_uo', 0.5,
   'Jornadas de la validacion de calidad de una UO. No se parte entre dias. Si se extiende, se reprograma.', '2026-01-01');

update public.plantillas_actividad
   set activa = true
 where nombre = 'Validación de calidad' and orden = 5 and momento_creacion = 'validacion';

-- Capacidad reservada por actividad y dia (hoy solo la validacion)
create table public.plan_carga_actividad (
  actividad_id   uuid not null references public.actividades_uo(id) on delete cascade,
  fecha          date not null,
  responsable_id uuid references public.profiles(id),  -- null si la UO se queda sin analista
  jornadas       numeric not null check (jornadas > 0),
  created_at     timestamptz not null default now(),
  primary key (actividad_id, fecha)
);

create index plan_carga_actividad_responsable_fecha_idx on public.plan_carga_actividad (responsable_id, fecha);

alter table public.plan_carga_actividad enable row level security;

create policy plan_carga_actividad_select on public.plan_carga_actividad
  for select to authenticated using (true);

-- Los default privileges de Supabase dan ALL a anon y authenticated en tablas nuevas.
revoke all on table public.plan_carga_actividad from public, anon, authenticated;
grant select on table public.plan_carga_actividad to authenticated;

-- -----------------------------------------------------------------------------
-- Funciones auxiliares
-- -----------------------------------------------------------------------------

-- Ahora suma las dos tablas de carga: el analista tambien digitaliza.
create or replace function public.plan_carga_persona(p_persona uuid, p_fecha date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce((select sum(c.jornadas)
                     from public.plan_carga_uo c
                    where c.responsable_id = p_persona
                      and c.fecha = p_fecha), 0)
       + coalesce((select sum(c.jornadas)
                     from public.plan_carga_actividad c
                    where c.responsable_id = p_persona
                      and c.fecha = p_fecha), 0)
$$;

-- Revision de V1 a V4 (encabezado). Sin filas = consistente.
create function public.plan_inconsistencias_validacion()
returns table (uo_id uuid, referencia text, regla text)
language sql
stable
set search_path = ''
as $$
  with val as (
    select a.id, a.uo_id, a.ronda, a.fecha_programada, a.responsable_id, a.completada_en
      from public.actividades_uo a
      join public.plantillas_actividad p on p.id = a.plantilla_id
     where p.momento_creacion = 'validacion'
  ),
  paso4 as (
    select a.uo_id, a.ronda, (array_agg(a.fecha_programada order by a.orden desc))[1] as fecha
      from public.actividades_uo a
      join public.plantillas_actividad p on p.id = a.plantilla_id
     where p.momento_creacion = 'asignacion'
     group by a.uo_id, a.ronda
  ),
  carga as (
    select c.actividad_id, count(*) as dias, min(c.fecha) as desde, max(c.fecha) as hasta, sum(c.jornadas) as total
      from public.plan_carga_actividad c
     group by c.actividad_id
  ),
  reglas as (
    select v.uo_id, r.regla
      from val v
      left join carga c on c.actividad_id = v.id
      left join paso4 s on s.uo_id = v.uo_id and s.ronda = v.ronda
      cross join lateral (values
        (case when v.fecha_programada is null and c.actividad_id is not null
              then 'V1 carga sin fecha en la validacion' end),
        (case when v.fecha_programada is not null and c.actividad_id is null
              then 'V1 validacion con fecha sin carga reservada' end),
        (case when c.actividad_id is not null and v.fecha_programada is not null
                   and (c.dias <> 1 or c.desde <> v.fecha_programada)
              then 'V1 la carga no es un solo dia igual a la fecha de la validacion' end),
        (case when v.fecha_programada < s.fecha
              then 'V2 la validacion vence antes del paso 4' end),
        (case when c.actividad_id is not null
                   and c.total is distinct from public.plan_parametro('jornadas_validacion_uo', c.desde)
              then 'V3 la carga no es igual a jornadas_validacion_uo' end),
        (case when v.completada_en is null
                   and exists (select 1 from public.plan_carga_actividad x
                                where x.actividad_id = v.id
                                  and x.fecha >= public.plan_hoy()
                                  and x.responsable_id is distinct from v.responsable_id)
              then 'V4 la carga de hoy en adelante no esta a nombre del responsable' end)
      ) as r(regla)
     where r.regla is not null
    union all
    select a.uo_id, 'V1 carga en una actividad que no es validacion'
      from carga c
      join public.actividades_uo a on a.id = c.actividad_id
     where not exists (select 1 from val v where v.id = c.actividad_id)
  )
  select r.uo_id, u.referencia_operativa, r.regla
    from reglas r
    join public.unidades_operativas u on u.id = r.uo_id
   order by 2, 3
$$;

-- -----------------------------------------------------------------------------
-- Propuesta de la validacion (interna; la llaman los triggers y el backfill)
-- -----------------------------------------------------------------------------

create function public.proponer_validacion_uo(p_uo uuid, p_inicio date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_dias constant int := 366;
  v_ref      text;
  v_act      record;
  v_paso4    date;
  v_inicio   date;
  v_jornadas numeric;
  v_dia      date;
  v_iter     int := 0;
begin
  select u.referencia_operativa into v_ref
    from public.unidades_operativas u
   where u.id = p_uo;
  if not found then
    raise exception 'UO no encontrada' using errcode = 'P0002';
  end if;

  select a.id, a.ronda, a.responsable_id, a.completada_en
    into v_act
    from public.actividades_uo a
    join public.plantillas_actividad p on p.id = a.plantilla_id
   where a.uo_id = p_uo
     and p.momento_creacion = 'validacion'
   order by a.ronda desc
   limit 1;
  if not found then
    return;
  end if;
  if v_act.completada_en is not null then
    return;
  end if;

  -- No se recalcula sola
  if exists (select 1 from public.plan_carga_actividad c where c.actividad_id = v_act.id) then
    return;
  end if;

  if v_act.responsable_id is null then
    raise notice 'Plan semanal: la UO % no tiene analista QA; la validacion queda sin fecha', v_ref;
    return;
  end if;

  select (array_agg(a.fecha_programada order by a.orden desc))[1]
    into v_paso4
    from public.actividades_uo a
    join public.plantillas_actividad p on p.id = a.plantilla_id
   where a.uo_id = p_uo
     and a.ronda = v_act.ronda
     and p.momento_creacion = 'asignacion';
  if v_paso4 is null then
    raise notice 'Plan semanal: la UO % no tiene fecha en el paso 4; la validacion queda sin fecha', v_ref;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('plan_semanal:' || v_act.responsable_id::text, 0));

  v_inicio   := greatest(v_paso4, coalesce(p_inicio, public.plan_hoy()));
  v_jornadas := public.plan_parametro('jornadas_validacion_uo', v_inicio);
  if v_jornadas is null or v_jornadas <= 0 then
    raise exception 'Falta el parametro vigente valido jornadas_validacion_uo (> 0) en plan_parametros'
      using errcode = 'P0001';
  end if;

  -- Primer dia con espacio para la validacion completa, sin partir
  v_dia := v_inicio - 1;
  loop
    v_dia  := v_dia + 1;
    v_iter := v_iter + 1;
    if v_iter > c_max_dias then
      raise exception 'Sin capacidad para % jornadas en % dias desde %', v_jornadas, c_max_dias, v_inicio using errcode = 'P0001';
    end if;
    exit when public.plan_capacidad_dia(v_dia) - public.plan_carga_persona(v_act.responsable_id, v_dia) >= v_jornadas;
  end loop;

  insert into public.plan_carga_actividad (actividad_id, fecha, responsable_id, jornadas)
  values (v_act.id, v_dia, v_act.responsable_id, v_jornadas);

  update public.actividades_uo
     set fecha_programada = v_dia,
         fecha_origen     = 'propuesta'
   where id = v_act.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: reprogramar (CREATE OR REPLACE conserva dueño y permisos)
-- Cambios contra 2026-10-26_plan-semanal.sql: v_es_validacion; la carga de
-- plan_carga_uo solo se mueve si no es la validacion; en el ciclo de pasos,
-- la validacion movida lleva su carga de plan_carga_actividad.
-- -----------------------------------------------------------------------------

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
  v_es_validacion boolean;
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
  v_es_validacion := exists (select 1 from public.plantillas_actividad p
                              where p.id = v_act.plantilla_id
                                and p.momento_creacion = 'validacion');

  -- Carga del digitalizador que se desplaza igual que los pasos (la suma no cambia):
  --   primer paso -> toda la carga de la UO (incluye el inicio del bloque 1 a 3
  --                  que cae antes de su fecha, p. ej. el viernes)
  --   otro paso   -> la carga con fecha >= su fecha anterior
  --   validacion  -> nada de plan_carga_uo (su carga se mueve en el ciclo de abajo)
  -- La fila de la fecha anterior va exactamente a p_fecha.
  if not v_es_validacion then
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
  end if;

  -- Pasos: esta actividad y las siguientes de la misma UO y ronda.
  -- La validacion (de esta actividad o arrastrada) lleva su carga a su fecha nueva.
  for r in
    select a.id, a.fecha_programada, p.momento_creacion = 'validacion' as es_validacion
      from public.actividades_uo a
      join public.plantillas_actividad p on p.id = a.plantilla_id
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

      if r.es_validacion then
        with movidas as (
          delete from public.plan_carga_actividad c
           where c.actividad_id = r.id
          returning c.responsable_id, c.jornadas
        )
        insert into public.plan_carga_actividad (actividad_id, fecha, responsable_id, jornadas)
        select r.id, v_nueva, (array_agg(m.responsable_id))[1], sum(m.jornadas)
          from movidas m
        having count(*) > 0;
      end if;

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

-- -----------------------------------------------------------------------------
-- RPC: marcar y desmarcar (cuerpo de 2026-10-23_actividades-uo.sql; solo se
-- agrega el rechazo de la validacion despues de revisar el permiso)
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- Triggers en unidades_operativas
-- -----------------------------------------------------------------------------

-- Cambios contra 2026-10-26_plan-semanal.sql: crea tambien la validacion
-- (responsable = analista_qa_id) y propone su fecha despues de la del
-- digitalizador, en otra subtransaccion.
create or replace function public.generar_actividades_uo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.actividades_uo (uo_id, plantilla_id, nombre, orden, rol_responsable, responsable_id, ronda)
  select new.id, p.id, p.nombre, p.orden, p.rol_responsable,
         case when p.momento_creacion = 'validacion' then new.analista_qa_id
              when p.rol_responsable = 'digitalizador' then new.digitalizador_id end,
         1
    from public.plantillas_actividad p
   where p.activa
     and p.momento_creacion in ('asignacion', 'validacion')
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

  -- Validacion: si falla, las fechas del digitalizador se quedan.
  begin
    perform public.proponer_validacion_uo(new.id);
  exception when others then
    raise warning 'Plan semanal: no se pudo proponer la validacion de la UO % (%: %). Queda sin fecha; usar el backfill.',
      new.referencia_operativa, sqlstate, sqlerrm;
  end;

  return null;
end;
$$;

-- Al cambiar el analista QA: la validacion pendiente y su carga de hoy en
-- adelante pasan al nuevo (mismas fechas). Si no tenia carga, se propone.
create function public.reasignar_validacion_uo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.actividades_uo a
     set responsable_id = new.analista_qa_id
    from public.plantillas_actividad p
   where p.id = a.plantilla_id
     and p.momento_creacion = 'validacion'
     and a.uo_id = new.id
     and a.completada_en is null
     and a.responsable_id is distinct from new.analista_qa_id;

  update public.plan_carga_actividad c
     set responsable_id = new.analista_qa_id
    from public.actividades_uo a
    join public.plantillas_actividad p on p.id = a.plantilla_id
   where a.id = c.actividad_id
     and p.momento_creacion = 'validacion'
     and a.uo_id = new.id
     and a.completada_en is null
     and c.fecha >= public.plan_hoy()
     and c.responsable_id is distinct from new.analista_qa_id;

  if new.analista_qa_id is not null then
    begin
      perform public.proponer_validacion_uo(new.id);
    exception when others then
      raise warning 'Plan semanal: no se pudo proponer la validacion de la UO % (%: %). Queda sin fecha; usar el backfill.',
        new.referencia_operativa, sqlstate, sqlerrm;
    end;
  end if;

  return null;
end;
$$;

create trigger trg_reasignar_validacion_uo
  after update of analista_qa_id on public.unidades_operativas
  for each row
  when (new.analista_qa_id is distinct from old.analista_qa_id)
  execute function public.reasignar_validacion_uo();

-- Cierre automatico solo al pasar de En Validacion a Validada.
create function public.cerrar_validacion_uo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_hora timestamptz := now();
  r      record;
begin
  if v_uid is null then
    raise warning 'Plan semanal: la UO % paso a Validada sin sesion; la validacion de calidad queda abierta',
      new.referencia_operativa;
    return null;
  end if;

  for r in
    select a.id
      from public.actividades_uo a
      join public.plantillas_actividad p on p.id = a.plantilla_id
     where a.uo_id = new.id
       and p.momento_creacion = 'validacion'
       and a.completada_en is null
       for update of a
  loop
    update public.actividades_uo
       set completada_en    = v_hora,
           completada_por   = v_uid,
           registrada_en    = v_hora,
           registrada_tarde = false,
           motivo_ajuste    = null
     where id = r.id;

    insert into public.actividades_uo_eventos (actividad_id, usuario_id, evento, valor_anterior, valor_nuevo, motivo)
    values (r.id, v_uid, 'marcar', null, v_hora, 'Cierre automatico: la UO paso a Validada');
  end loop;

  return null;
end;
$$;

create trigger trg_cerrar_validacion_uo
  after update of estado on public.unidades_operativas
  for each row
  when (old.estado = 'En Validacion' and new.estado = 'Validada')
  execute function public.cerrar_validacion_uo();

-- -----------------------------------------------------------------------------
-- Permisos de funciones
-- Los default privileges de Supabase dan EXECUTE a anon en funciones nuevas.
-- -----------------------------------------------------------------------------

revoke all on function
  public.plan_carga_persona(uuid, date),
  public.plan_inconsistencias_validacion(),
  public.proponer_validacion_uo(uuid, date),
  public.reprogramar_actividad(uuid, date, text),
  public.marcar_actividad(uuid, timestamptz, text),
  public.desmarcar_actividad(uuid, text),
  public.generar_actividades_uo(),
  public.reasignar_validacion_uo(),
  public.cerrar_validacion_uo()
  from public, anon, authenticated;

grant execute on function
  public.reprogramar_actividad(uuid, date, text),
  public.marcar_actividad(uuid, timestamptz, text),
  public.desmarcar_actividad(uuid, text)
  to authenticated;

commit;
