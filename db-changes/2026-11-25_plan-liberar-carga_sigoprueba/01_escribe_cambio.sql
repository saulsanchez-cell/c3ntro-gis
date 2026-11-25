-- Que hace: libera sola la carga futura de una UO cuando se completan sus 4 pasos, la devuelve si se desmarca un paso, y deja registro en plan_carga_liberada; escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual (ver ../2026-11-25_plan-liberar-carga_produccion/README.md).
-- Reversa: db-changes/2026-11-25_plan-liberar-carga_reversa.sql (antes, revertir el frontend si ya se fusiono).
-- Resultado esperado: sin filas y sin error. Si aborta porque la base no esta como en el 00, no queda nada escrito: mandar el mensaje completo.
-- Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-11-25 (03 con ok = true y auditoria con 0 filas, verificados por MCP)
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-11-25 (03 con ok = true y las mismas huellas)
-- Huellas tras el cambio: marcar_actividad a4ae7396e16ac1b76340de3ce436aec1, desmarcar_actividad 5f9dc13ccd46630f0d1202b1bb4e3a97,
--   plan_inconsistencias e5509825b1b0dc8e41b112055b607e9b
--
-- Decisiones de Saul (2026-11-25):
--   - Cuando el digitalizador completa sus 4 pasos antes de lo planeado, la carga que
--     quedaba reservada lo hacia ver ocupado semanas (p. ej. 12.82 jornadas de la
--     2025-DUR-FED-127). Se libera sola al completar el ultimo paso.
--   - Se libera desde manana (fecha > plan_hoy()). La de hoy y la de dias pasados se queda:
--     es el trabajo hecho y el credito del KPI de produccion.
--   - No se tocan las fechas de los pasos (puntualidad) ni la carga de la validacion
--     (plan_carga_actividad: es del analista y sigue pendiente).
--   - Registro de solo insercion en plan_carga_liberada: movimiento 'liberada' al
--     completar y 'devuelta' al desmarcar. Sirve de rastro y para devolver la carga.
--   - Al desmarcar un paso de una UO que libero carga, se devuelve la carga liberada
--     cuya fecha sigue siendo de manana en adelante, al digitalizador actual de la UO.
--     La de dias que ya pasaron no regresa: ese paso se acomoda con REPROGRAMAR.
--   - plan_inconsistencias(): R1 (actividades con fecha sin carga), R2 y R4 dejan de
--     revisar las UOs con todos sus pasos completados.
--
-- Cambios en funciones (cuerpo de 2026-11-02_plan-validacion; solo se agrega el bloque
-- marcado "liberar carga" / "devolver carga"):
--   marcar_actividad, desmarcar_actividad, plan_inconsistencias.
-- Las 3 UOs liberadas a mano el 2026-11-25 (04b de 2026-11-25_plan-recalibracion) no
-- estan en plan_carga_liberada: si se desmarca un paso suyo, no se devuelve nada.
--
-- Huellas despues del cambio: ver 03_lectura_permisos.sql.

begin;

do $$
begin
  if to_regclass('public.plan_carga_liberada') is not null then
    raise exception 'plan_carga_liberada ya existe. Abortado.';
  end if;
  if md5(replace(pg_get_functiondef('public.marcar_actividad(uuid,timestamptz,text)'::regprocedure), E'\r', ''))
       <> 'b59dca6f4cc4878d94f700cc8cccca41'
     or md5(replace(pg_get_functiondef('public.desmarcar_actividad(uuid,text)'::regprocedure), E'\r', ''))
       <> '7e8e44851fd265638dd62864d28a86c8' then
    raise exception 'marcar_actividad o desmarcar_actividad no son las de 2026-11-02. Abortado.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Registro de carga liberada y devuelta (solo insercion, desde las funciones)
-- -----------------------------------------------------------------------------

create table public.plan_carga_liberada (
  id             uuid primary key default gen_random_uuid(),
  uo_id          uuid not null references public.unidades_operativas(id) on delete cascade,
  fecha          date not null,
  responsable_id uuid references public.profiles(id),
  jornadas       numeric not null check (jornadas > 0),
  movimiento     text not null check (movimiento in ('liberada', 'devuelta')),
  actividad_id   uuid not null references public.actividades_uo(id) on delete cascade,
  usuario_id     uuid not null,
  created_at     timestamptz not null default now()
);

create index plan_carga_liberada_uo_idx on public.plan_carga_liberada (uo_id, fecha);

alter table public.plan_carga_liberada enable row level security;
revoke all on public.plan_carga_liberada from public, anon, authenticated;
grant select on public.plan_carga_liberada to authenticated;
create policy plan_carga_liberada_select on public.plan_carga_liberada
  for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- marcar_actividad: + liberar carga
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

  -- liberar carga: con todos los pasos completados, la carga desde manana ya no se necesita
  if exists (select 1 from public.plantillas_actividad p
              where p.id = v_act.plantilla_id and p.momento_creacion = 'asignacion')
     and not exists (select 1
                       from public.actividades_uo a
                       join public.plantillas_actividad p on p.id = a.plantilla_id
                      where a.uo_id = v_act.uo_id
                        and p.momento_creacion = 'asignacion'
                        and a.completada_en is null) then
    with borradas as (
      delete from public.plan_carga_uo c
       where c.uo_id = v_act.uo_id
         and c.fecha > public.plan_hoy()
      returning c.uo_id, c.fecha, c.responsable_id, c.jornadas
    )
    insert into public.plan_carga_liberada (uo_id, fecha, responsable_id, jornadas, movimiento, actividad_id, usuario_id)
    select b.uo_id, b.fecha, b.responsable_id, b.jornadas, 'liberada', p_actividad, v_uid
      from borradas b;
  end if;

  return v_act;
end;
$$;

-- -----------------------------------------------------------------------------
-- desmarcar_actividad: + devolver carga
-- -----------------------------------------------------------------------------

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

  -- devolver carga: lo liberado (neto de lo ya devuelto) con fecha de manana en adelante,
  -- al digitalizador actual de la UO
  with neto as (
    select l.fecha, sum(case l.movimiento when 'liberada' then l.jornadas else -l.jornadas end) as jornadas
      from public.plan_carga_liberada l
     where l.uo_id = v_act.uo_id
       and l.fecha > public.plan_hoy()
     group by l.fecha
    having sum(case l.movimiento when 'liberada' then l.jornadas else -l.jornadas end) > 0
  ),
  repuesta as (
    insert into public.plan_carga_uo as c (uo_id, fecha, responsable_id, jornadas)
    select v_act.uo_id, n.fecha, u.digitalizador_id, n.jornadas
      from neto n
      join public.unidades_operativas u on u.id = v_act.uo_id
    on conflict (uo_id, fecha) do update
       set jornadas = c.jornadas + excluded.jornadas
    returning c.fecha
  )
  insert into public.plan_carga_liberada (uo_id, fecha, responsable_id, jornadas, movimiento, actividad_id, usuario_id)
  select v_act.uo_id, n.fecha, u.digitalizador_id, n.jornadas, 'devuelta', p_actividad, v_uid
    from neto n
    join public.unidades_operativas u on u.id = v_act.uo_id
   where n.fecha in (select r.fecha from repuesta r);

  return v_act;
end;
$$;

-- -----------------------------------------------------------------------------
-- plan_inconsistencias: R1 (sin carga), R2 y R4 no revisan UOs con todos los pasos completados
-- -----------------------------------------------------------------------------

create or replace function public.plan_inconsistencias()
returns table (uo_id uuid, referencia text, regla text)
language sql
stable
set search_path = ''
as $$
  with pasos as (
    select a.uo_id, a.ronda, a.orden, a.fecha_programada, a.completada_en
      from public.actividades_uo a
      join public.plantillas_actividad p on p.id = a.plantilla_id
     where p.momento_creacion = 'asignacion'
  ),
  por_uo as (
    select s.uo_id,
           count(*) filter (where s.fecha_programada is not null) as con_fecha,
           count(*) filter (where s.fecha_programada is null)     as sin_fecha,
           bool_and(s.completada_en is not null)                  as terminada,
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
        (case when coalesce(u.con_fecha, 0) > 0 and c.uo_id is null and not coalesce(u.terminada, false)
              then 'R1 actividades con fecha sin carga reservada' end),
        (case when coalesce(u.con_fecha, 0) > 0 and u.sin_fecha > 0
              then 'R1 actividades con y sin fecha en la misma UO' end),
        (case when c.uo_id is not null and u.ultimo_paso is distinct from c.hasta and not coalesce(u.terminada, false)
              then 'R2 el ultimo paso no vence el ultimo dia de carga' end),
        (case when c.uo_id is not null and c.total is distinct from public.plan_jornadas_uo(c.uo_id, c.desde)
                   and not coalesce(u.terminada, false)
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

commit;
