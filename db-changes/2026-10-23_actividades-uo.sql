-- =============================================================================
-- *** APLICADO EN SIGOPRUEBA, PENDIENTE EN PRODUCCIÓN ***
-- Actividades por UO (fase 1): seguimiento granular dentro de cada UO.
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-10-23
-- Aplicado en producción (rtwjwfpaturmbmegwtys): PENDIENTE
--
-- Reversa:  2026-10-23_actividades-uo_reversa.sql
-- Pruebas:  2026-10-23_actividades-uo_pruebas.sql (termina en rollback)
--
-- Crea:
--   tablas    plantillas_actividad, actividades_uo, actividades_uo_eventos
--   funciones es_coordinador, marcar_actividad, desmarcar_actividad,
--             ajustar_hora_actividad (RPC, EXECUTE solo authenticated)
--             validar_motivo_actividad, validar_hora_actividad (internas)
--             generar_actividades_uo, reasignar_actividades_uo,
--             bloquear_modificacion_eventos (triggers)
--   triggers  trg_generar_actividades_uo, trg_reasignar_actividades_uo
--             en unidades_operativas; trg_eventos_sin_update y
--             trg_eventos_sin_truncate en actividades_uo_eventos
--
-- No toca: profiles.rol, proteger_km_teoricos, transiciones_permitidas,
-- logs_actividad ni políticas existentes.
--
-- RIESGO ACEPTADO: DELETE sobre unidades_operativas sigue abierto para
-- authenticated (política auth_all_uo) y borra por cascada actividades_uo y
-- actividades_uo_eventos, es decir, también el rastro de auditoría. Se acepta
-- hasta que existan políticas por rol. El app hoy no borra UOs.
--
-- SECURITY ADVISOR, ACEPTADO POR DISEÑO: las 3 alertas sobre funciones
-- SECURITY DEFINER ejecutables por authenticated (marcar_actividad,
-- desmarcar_actividad, ajustar_hora_actividad) son intencionales. Deben ser
-- SECURITY DEFINER porque el cliente no tiene escritura directa en
-- actividades_uo ni en actividades_uo_eventos: solo así el rastro de
-- auditoría no depende de que el cliente escriba en las tablas. Cada una
-- valida sesión, permiso (responsable o coordinador) y fija search_path = ''.
--
-- DEUDA TÉCNICA v2: es_coordinador() usa el UUID fijo del coordinador.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------

create table public.plantillas_actividad (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  orden            int  not null,
  rol_responsable  public.user_role not null,
  momento_creacion text not null
                   check (momento_creacion in ('asignacion', 'validacion', 'notificacion')),
  activa           boolean not null default true,
  tipo_proyecto    public.tipo_proyecto,  -- null = aplica a todos
  created_at       timestamptz not null default now()
);

create table public.actividades_uo (
  id               uuid primary key default gen_random_uuid(),
  uo_id            uuid not null references public.unidades_operativas(id) on delete cascade,
  plantilla_id     uuid not null references public.plantillas_actividad(id),
  nombre           text not null,
  orden            int  not null,
  rol_responsable  public.user_role not null,
  responsable_id   uuid references public.profiles(id),
  ronda            int  not null default 1,
  completada_en    timestamptz,            -- hora efectiva; null = pendiente
  completada_por   uuid references public.profiles(id),
  registrada_en    timestamptz,            -- hora del servidor al registrar
  registrada_tarde boolean not null default false,
  motivo_ajuste    text,
  created_at       timestamptz not null default now(),  -- límite inferior de la hora real
  unique (uo_id, plantilla_id, ronda),
  check ((completada_en is null) = (completada_por is null)),
  check ((completada_en is null) = (registrada_en is null)),
  check (not registrada_tarde or motivo_ajuste is not null)
);

create index actividades_uo_uo_id_idx on public.actividades_uo (uo_id);

create table public.actividades_uo_eventos (
  id             uuid primary key default gen_random_uuid(),
  actividad_id   uuid not null references public.actividades_uo(id) on delete cascade,
  usuario_id     uuid not null references public.profiles(id),
  evento         text not null check (evento in ('marcar', 'desmarcar', 'ajustar_hora')),
  valor_anterior timestamptz,  -- completada_en antes del evento
  valor_nuevo    timestamptz,  -- completada_en después del evento
  motivo         text,
  created_at     timestamptz not null default now()
);

create index actividades_uo_eventos_actividad_id_idx on public.actividades_uo_eventos (actividad_id);

-- -----------------------------------------------------------------------------
-- Plantilla inicial
-- -----------------------------------------------------------------------------

insert into public.plantillas_actividad (nombre, orden, rol_responsable, momento_creacion, activa) values
  ('Revisión de insumos',              1, 'digitalizador', 'asignacion',   true),
  ('Preparación de archivos (Vertex)', 2, 'digitalizador', 'asignacion',   true),
  ('Carga en Vetro',                   3, 'digitalizador', 'asignacion',   true),
  ('Revisión y pulido en Vetro',       4, 'digitalizador', 'asignacion',   true),
  -- fase 2: no se generan todavía
  ('Validación de calidad',            5, 'analista_gis',  'validacion',   false),
  ('Notificación a conectividad',      6, 'coordinador',   'notificacion', false);

-- -----------------------------------------------------------------------------
-- RLS y permisos de tablas
-- Solo lectura para authenticated. Toda escritura del cliente pasa por las RPC.
-- -----------------------------------------------------------------------------

alter table public.plantillas_actividad   enable row level security;
alter table public.actividades_uo         enable row level security;
alter table public.actividades_uo_eventos enable row level security;

create policy plantillas_actividad_select on public.plantillas_actividad
  for select to authenticated using (true);
create policy actividades_uo_select on public.actividades_uo
  for select to authenticated using (true);
create policy actividades_uo_eventos_select on public.actividades_uo_eventos
  for select to authenticated using (true);

-- Los default privileges de Supabase dan ALL a anon y authenticated en tablas nuevas.
revoke all on table public.plantillas_actividad, public.actividades_uo, public.actividades_uo_eventos
  from public, anon, authenticated;
grant select on table public.plantillas_actividad, public.actividades_uo, public.actividades_uo_eventos
  to authenticated;

-- -----------------------------------------------------------------------------
-- Eventos: solo inserción
-- UPDATE y TRUNCATE se bloquean para todos (incluido postgres) con trigger.
-- DELETE se bloquea solo por permisos, para no romper el on delete cascade.
-- -----------------------------------------------------------------------------

create function public.bloquear_modificacion_eventos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'actividades_uo_eventos es de solo insercion (% no permitido)', tg_op
    using errcode = '42501';
end;
$$;

create trigger trg_eventos_sin_update
  before update on public.actividades_uo_eventos
  for each row execute function public.bloquear_modificacion_eventos();

create trigger trg_eventos_sin_truncate
  before truncate on public.actividades_uo_eventos
  for each statement execute function public.bloquear_modificacion_eventos();

-- -----------------------------------------------------------------------------
-- Funciones auxiliares
-- -----------------------------------------------------------------------------

-- Deuda técnica v2: reemplazar por verificación de rol.
create function public.es_coordinador()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.uid() = '7063db07-ed16-4ca5-8c98-53b63d128702'::uuid, false)
$$;

create function public.validar_motivo_actividad(p_motivo text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_motivo is null or char_length(btrim(p_motivo)) < 10 then
    raise exception 'El motivo es obligatorio (minimo 10 caracteres)' using errcode = '22023';
  end if;
  return btrim(p_motivo);
end;
$$;

-- p_minimo = actividades_uo.created_at (momento de la asignación)
create function public.validar_hora_actividad(p_hora timestamptz, p_minimo timestamptz)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_hora is null then
    raise exception 'La hora es obligatoria' using errcode = '22023';
  end if;
  if p_hora > now() then
    raise exception 'La hora no puede ser futura' using errcode = '22023';
  end if;
  if p_hora < p_minimo then
    raise exception 'La hora no puede ser anterior a la asignacion de la UO (%)',
      to_char(p_minimo at time zone 'America/Mexico_City', 'YYYY-MM-DD HH24:MI')
      using errcode = '22023';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: marcar, desmarcar, ajustar hora
-- -----------------------------------------------------------------------------

-- Sin p_hora_real usa now() del servidor. Con p_hora_real exige motivo y
-- límites, y marca registrada_tarde.
create function public.marcar_actividad(
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

-- Regresa la actividad a pendiente. El historial queda en los eventos.
create function public.desmarcar_actividad(p_actividad uuid, p_motivo text)
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

-- Corrige la hora de una actividad ya completada. Conserva completada_por
-- (quien hizo el trabajo); registrada_en pasa a ser la hora del ajuste.
create function public.ajustar_hora_actividad(p_actividad uuid, p_hora timestamptz, p_motivo text)
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
    raise exception 'Solo se puede ajustar la hora de una actividad completada' using errcode = 'P0001';
  end if;

  v_motivo := public.validar_motivo_actividad(p_motivo);
  perform public.validar_hora_actividad(p_hora, v_act.created_at);
  v_anterior := v_act.completada_en;

  update public.actividades_uo
     set completada_en    = p_hora,
         registrada_en    = now(),
         registrada_tarde = true,
         motivo_ajuste    = v_motivo
   where id = p_actividad
  returning * into v_act;

  insert into public.actividades_uo_eventos (actividad_id, usuario_id, evento, valor_anterior, valor_nuevo, motivo)
  values (p_actividad, v_uid, 'ajustar_hora', v_anterior, p_hora, v_motivo);

  return v_act;
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggers en unidades_operativas
-- -----------------------------------------------------------------------------

-- Genera las actividades de 'asignacion' cuando la UO pasa a Asignada.
-- Idempotente por unique (uo_id, plantilla_id, ronda). Ronda siempre 1 en fase 1.
create function public.generar_actividades_uo()
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
  return null;
end;
$$;

create trigger trg_generar_actividades_uo
  after update of estado on public.unidades_operativas
  for each row
  when (new.estado = 'Asignada' and old.estado is distinct from 'Asignada')
  execute function public.generar_actividades_uo();

-- Al cambiar el digitalizador, pasa las actividades pendientes de ese rol
-- (incluidas las de responsable nulo) al nuevo. Las completadas no se tocan.
create function public.reasignar_actividades_uo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.actividades_uo
     set responsable_id = new.digitalizador_id
   where uo_id = new.id
     and rol_responsable = 'digitalizador'
     and completada_en is null;
  return null;
end;
$$;

create trigger trg_reasignar_actividades_uo
  after update of digitalizador_id on public.unidades_operativas
  for each row
  when (new.digitalizador_id is distinct from old.digitalizador_id)
  execute function public.reasignar_actividades_uo();

-- -----------------------------------------------------------------------------
-- Permisos de funciones
-- Los default privileges de Supabase dan EXECUTE a anon en funciones nuevas.
-- -----------------------------------------------------------------------------

revoke all on function
  public.es_coordinador(),
  public.validar_motivo_actividad(text),
  public.validar_hora_actividad(timestamptz, timestamptz),
  public.marcar_actividad(uuid, timestamptz, text),
  public.desmarcar_actividad(uuid, text),
  public.ajustar_hora_actividad(uuid, timestamptz, text),
  public.generar_actividades_uo(),
  public.reasignar_actividades_uo(),
  public.bloquear_modificacion_eventos()
  from public, anon, authenticated;

grant execute on function
  public.es_coordinador(),
  public.marcar_actividad(uuid, timestamptz, text),
  public.desmarcar_actividad(uuid, text),
  public.ajustar_hora_actividad(uuid, timestamptz, text)
  to authenticated;

commit;
