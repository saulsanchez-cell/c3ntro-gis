-- =============================================================================
-- *** APLICADO EN SIGOPRUEBA, PENDIENTE EN PRODUCCIÓN ***
-- Plan semanal (fase 1): fechas programadas por actividad y capacidad por día.
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-10-26
-- Aplicado en producción (rtwjwfpaturmbmegwtys): PENDIENTE
--
-- Requiere: 2026-10-23_actividades-uo.sql aplicado.
-- Reversa:  2026-10-26_plan-semanal_reversa.sql
-- Pruebas:  2026-10-26_plan-semanal_pruebas.sql (termina en rollback); corridas en SIGOprueba el 2026-10-26: OK (52)
-- Seed:     2026-10-26_plan-semanal_seed-sigoprueba.sql (SOLO SIGOPRUEBA)
-- Backfill: 2026-10-26_plan-semanal_backfill.sql (partes A, B y C)
--
-- Crea:
--   tablas    plan_rendimientos, plan_capacidad, plan_parametros (con vigencia),
--             plan_dias_inhabiles (vacía), plan_integrantes, plan_carga_uo
--   columnas  actividades_uo.fecha_programada, actividades_uo.fecha_origen
--             actividades_uo_eventos.fecha_anterior, .fecha_nueva
--             y el evento 'reprogramar' en el check de actividades_uo_eventos
--   funciones plan_hoy, plan_capacidad_dia, plan_parametro, plan_rendimiento,
--             plan_jornadas_uo, plan_carga_persona, plan_sumar_dias_habiles,
--             plan_dias_habiles_entre, plan_inconsistencias (internas)
--             proponer_fechas_uo (interna, SECURITY DEFINER)
--             reprogramar_actividad (RPC, SECURITY DEFINER, EXECUTE solo authenticated)
-- Modifica (CREATE OR REPLACE; los permisos se conservan):
--   generar_actividades_uo    al final propone fechas; si falla, RAISE WARNING
--                             y la asignación se guarda sin fechas
--   reasignar_actividades_uo  además pasa la carga de hoy en adelante al nuevo
--                             digitalizador (mismas fechas, sin proponer de nuevo)
--
-- -----------------------------------------------------------------------------
-- MODELO Y REGLA DE CONSISTENCIA
-- -----------------------------------------------------------------------------
-- Dos datos con papeles distintos:
--   actividades_uo.fecha_programada  vencimiento de cada paso. Define el atraso:
--                                    atrasada = fecha_programada < hoy (México)
--                                    y completada_en is null.
--   plan_carga_uo                    capacidad reservada por UO, persona y día.
--                                    Alimenta la vista Carga y el cálculo de
--                                    espacio libre al proponer.
--
-- Reglas que deben cumplirse siempre (plan_inconsistencias() las revisa; solo
-- considera actividades cuya plantilla es de momento 'asignacion'):
--   R1  Una UO tiene filas en plan_carga_uo si y solo si sus pasos tienen fecha,
--       y o todos sus pasos tienen fecha o ninguno.
--   R2  El último paso (mayor orden, el pulido) vence el último día con carga.
--   R3  Las fechas no bajan al avanzar el orden de los pasos.
--   R4  La suma de la carga reservada es igual a las jornadas totales de la UO
--       (plan_jornadas_uo, con los parámetros vigentes el primer día con carga).
--       Reprogramar no cambia la suma. Si después se corrige km_teoricos o el
--       método, R4 lo marca: la carga reservada ya no corresponde a la UO.
--
-- Ya no se exige "no hay carga antes del primer paso": en una UO larga el
-- bloque de pasos 1 a 3 puede ocupar dos días y esos pasos vencen el último
-- día del bloque, así que hay carga antes de su fecha.
--
-- jornadas_estimadas (propuesta en el plan) SE ELIMINÓ: la capacidad vive solo
-- en plan_carga_uo y las fechas solo en actividades_uo. Guardar además una
-- parte de jornadas por actividad sería un tercer dato que mantener en
-- consistencia sin que ninguna vista lo necesite.
--
-- -----------------------------------------------------------------------------
-- PROPUESTA DE FECHAS (proponer_fechas_uo)
-- -----------------------------------------------------------------------------
--   jornadas UO = greatest(jornada_minima_uo, km_teoricos / km_por_jornada del
--                 método), redondeado a 2 decimales. Sin método o sin rendimiento
--                 vigente: jornada_minima_uo y RAISE WARNING.
--   inicio      = hoy en México (servidor). Solo pruebas y backfill pasan otra.
--   día libre   = plan_capacidad_dia(fecha) - carga ya reservada de la persona.
--                 plan_capacidad_dia es 0 en sábado, domingo y plan_dias_inhabiles.
--   UO corta (jornadas <= 1.0, una jornada completa): nunca se parte. Va
--                 completa al primer día con libre >= jornadas; sus 4 pasos
--                 vencen ese día. Ej.: viernes con 0.25 libres y UO de 0.5 -> lunes.
--   UO larga (jornadas > 1.0):
--     bloque de pasos 1 a 3 = jornadas_pasos_1_3_uo_larga (1.0, tiempo casi
--                 fijo, no proporcional a los km; tope: las jornadas de la UO).
--                 Se reserva desde el primer día con libre > 0, tomando lo libre
--                 de cada día, así que puede ocupar dos días (viernes 0.75 +
--                 lunes 0.25, o un día ya cargado). Los pasos 1 a 3 vencen el
--                 último día del bloque.
--     pulido      = jornadas - bloque. Empieza el día hábil siguiente al último
--                 día del bloque (lo que sobre ese día queda libre para otras
--                 UOs), se reparte según lo libre de cada día y vence el último
--                 día reservado.
--   La suma de la carga reservada es igual a las jornadas de la UO (R4).
--   No se recalcula sola: si la UO ya tiene carga, no hace nada.
--   Candado pg_advisory_xact_lock por persona, para que dos asignaciones
--   simultáneas no reserven el mismo hueco.
--   No escribe eventos: actividades_uo_eventos.usuario_id es obligatorio y en el
--   backfill no hay sesión. fecha_origen = 'propuesta' basta como rastro.
--
-- -----------------------------------------------------------------------------
-- REPROGRAMAR (reprogramar_actividad)
-- -----------------------------------------------------------------------------
--   Solo coordinador (es_coordinador()), motivo de 10 caracteres o más, fecha
--   hábil, no anterior a hoy, distinta de la actual y no anterior al paso previo.
--   La actividad no puede estar completada.
--   Mueve esa actividad y las siguientes de la misma UO y ronda el mismo número
--   de días hábiles, y desplaza igual la carga reservada:
--     - si es el primer paso de la UO, toda su carga (incluido el inicio del
--       bloque 1 a 3 que cae antes de su fecha, p. ej. el viernes);
--     - si no, la carga con fecha >= la fecha anterior de esa actividad.
--   La suma de la carga no cambia. No revisa capacidad del destino: la sobrecarga
--   se ve en la vista Carga. Escribe un evento 'reprogramar' por actividad
--   movida (fecha anterior, fecha nueva, usuario, motivo, timestamp) y marca
--   fecha_origen = 'ajustada'.
--
-- -----------------------------------------------------------------------------
-- SEGURIDAD
-- -----------------------------------------------------------------------------
--   Tablas nuevas: RLS, REVOKE ALL a public, anon y authenticated, y solo SELECT
--   para authenticated. Nadie escribe desde el cliente.
--   La pantalla es "solo coordinador" únicamente en el cliente: cualquier sesión
--   puede leer el plan. La restricción en el servidor depende de las políticas
--   por rol, pendientes. reprogramar_actividad sí valida el permiso adentro.
--
-- DEUDA TÉCNICA v2: es_coordinador() usa el UUID fijo del coordinador.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Tablas de parámetros (con vigencia: para recalibrar se inserta una fila nueva
-- con vigente_desde y se cierra la anterior con vigente_hasta)
-- -----------------------------------------------------------------------------

create table public.plan_rendimientos (
  id                  uuid primary key default gen_random_uuid(),
  metodo_constructivo text not null check (metodo_constructivo in ('Aereo', 'Subterraneo', 'Mixto')),
  km_por_jornada      numeric not null check (km_por_jornada > 0),
  vigente_desde       date not null,
  vigente_hasta       date,
  created_at          timestamptz not null default now(),
  unique (metodo_constructivo, vigente_desde),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create table public.plan_capacidad (
  id            uuid primary key default gen_random_uuid(),
  dia_semana    int not null check (dia_semana between 1 and 7),  -- ISO: 1 = lunes, 7 = domingo
  jornadas      numeric not null check (jornadas >= 0),
  etiqueta      text,                                             -- p. ej. '9–15 h'
  vigente_desde date not null,
  vigente_hasta date,
  created_at    timestamptz not null default now(),
  unique (dia_semana, vigente_desde),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

create table public.plan_parametros (
  clave         text not null,
  valor         numeric not null,
  descripcion   text not null,
  vigente_desde date not null,
  vigente_hasta date,
  created_at    timestamptz not null default now(),
  primary key (clave, vigente_desde),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

-- Días sin capacidad (festivos, cierres). Vacía al crearla.
create table public.plan_dias_inhabiles (
  fecha       date primary key,
  descripcion text not null,
  created_at  timestamptz not null default now()
);

-- Quién aparece en el plan (no es columna de profiles: profiles tiene política abierta)
create table public.plan_integrantes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  activo     boolean not null default true,
  orden      int not null default 0,
  created_at timestamptz not null default now()
);

-- Capacidad reservada por UO y día
create table public.plan_carga_uo (
  uo_id          uuid not null references public.unidades_operativas(id) on delete cascade,
  fecha          date not null,
  responsable_id uuid references public.profiles(id),  -- null si la UO se queda sin digitalizador
  jornadas       numeric not null check (jornadas > 0),
  created_at     timestamptz not null default now(),
  primary key (uo_id, fecha)
);

create index plan_carga_uo_responsable_fecha_idx on public.plan_carga_uo (responsable_id, fecha);

insert into public.plan_rendimientos (metodo_constructivo, km_por_jornada, vigente_desde) values
  ('Aereo',       30,   '2026-01-01'),
  ('Subterraneo', 17.5, '2026-01-01'),
  ('Mixto',       5,    '2026-01-01');

insert into public.plan_capacidad (dia_semana, jornadas, etiqueta, vigente_desde) values
  (1, 1.0,  null,     '2026-01-01'),
  (2, 1.0,  null,     '2026-01-01'),
  (3, 1.0,  null,     '2026-01-01'),
  (4, 1.0,  null,     '2026-01-01'),
  (5, 0.75, '9–15 h', '2026-01-01'),
  (6, 0,    null,     '2026-01-01'),
  (7, 0,    null,     '2026-01-01');

insert into public.plan_parametros (clave, valor, descripcion, vigente_desde) values
  ('jornada_minima_uo', 0.5,
   'Jornadas mínimas de una UO, aunque sus km den menos', '2026-01-01'),
  ('jornadas_pasos_1_3_uo_larga', 1.0,
   'En una UO de más de 1.0 jornada, jornadas fijas del bloque de pasos 1 a 3 (no dependen de los km; tope: las jornadas de la UO). El resto es el pulido.', '2026-01-01');

-- -----------------------------------------------------------------------------
-- Columnas nuevas
-- -----------------------------------------------------------------------------

alter table public.actividades_uo
  add column fecha_programada date,
  add column fecha_origen     text check (fecha_origen in ('propuesta', 'ajustada')),
  add constraint actividades_uo_fecha_programada_origen_check check ((fecha_programada is null) = (fecha_origen is null));

create index actividades_uo_fecha_programada_idx on public.actividades_uo (fecha_programada);

-- Solo agrega columnas y amplía el check: no modifica filas existentes.
alter table public.actividades_uo_eventos
  add column fecha_anterior date,
  add column fecha_nueva    date;

alter table public.actividades_uo_eventos drop constraint actividades_uo_eventos_evento_check;
alter table public.actividades_uo_eventos add constraint actividades_uo_eventos_evento_check
  check (evento in ('marcar', 'desmarcar', 'ajustar_hora', 'reprogramar'));

-- -----------------------------------------------------------------------------
-- RLS y permisos de tablas nuevas
-- -----------------------------------------------------------------------------

alter table public.plan_rendimientos   enable row level security;
alter table public.plan_capacidad      enable row level security;
alter table public.plan_parametros     enable row level security;
alter table public.plan_dias_inhabiles enable row level security;
alter table public.plan_integrantes    enable row level security;
alter table public.plan_carga_uo       enable row level security;

create policy plan_rendimientos_select   on public.plan_rendimientos   for select to authenticated using (true);
create policy plan_capacidad_select      on public.plan_capacidad      for select to authenticated using (true);
create policy plan_parametros_select     on public.plan_parametros     for select to authenticated using (true);
create policy plan_dias_inhabiles_select on public.plan_dias_inhabiles for select to authenticated using (true);
create policy plan_integrantes_select    on public.plan_integrantes    for select to authenticated using (true);
create policy plan_carga_uo_select       on public.plan_carga_uo       for select to authenticated using (true);

-- Los default privileges de Supabase dan ALL a anon y authenticated en tablas nuevas.
revoke all on table
  public.plan_rendimientos, public.plan_capacidad, public.plan_parametros,
  public.plan_dias_inhabiles, public.plan_integrantes, public.plan_carga_uo
  from public, anon, authenticated;
grant select on table
  public.plan_rendimientos, public.plan_capacidad, public.plan_parametros,
  public.plan_dias_inhabiles, public.plan_integrantes, public.plan_carga_uo
  to authenticated;

-- -----------------------------------------------------------------------------
-- Funciones auxiliares (internas)
-- -----------------------------------------------------------------------------

-- Día de negocio de hoy en México
create function public.plan_hoy()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Mexico_City')::date
$$;

create function public.plan_capacidad_dia(p_fecha date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when exists (select 1 from public.plan_dias_inhabiles i where i.fecha = p_fecha) then 0
    else coalesce((
      select c.jornadas
        from public.plan_capacidad c
       where c.dia_semana = extract(isodow from p_fecha)::int
         and c.vigente_desde <= p_fecha
         and (c.vigente_hasta is null or c.vigente_hasta >= p_fecha)
       order by c.vigente_desde desc
       limit 1), 0)
  end
$$;

create function public.plan_parametro(p_clave text, p_fecha date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select p.valor
    from public.plan_parametros p
   where p.clave = p_clave
     and p.vigente_desde <= p_fecha
     and (p.vigente_hasta is null or p.vigente_hasta >= p_fecha)
   order by p.vigente_desde desc
   limit 1
$$;

create function public.plan_rendimiento(p_metodo text, p_fecha date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select r.km_por_jornada
    from public.plan_rendimientos r
   where r.metodo_constructivo = p_metodo
     and r.vigente_desde <= p_fecha
     and (r.vigente_hasta is null or r.vigente_hasta >= p_fecha)
   order by r.vigente_desde desc
   limit 1
$$;

-- Jornadas totales de una UO con los parámetros vigentes en p_fecha.
-- Misma fórmula para proponer_fechas_uo y para la regla R4.
create function public.plan_jornadas_uo(p_uo uuid, p_fecha date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when public.plan_rendimiento(u.metodo_constructivo, p_fecha) is null
      then public.plan_parametro('jornada_minima_uo', p_fecha)
    else round(greatest(public.plan_parametro('jornada_minima_uo', p_fecha),
                        coalesce(u.km_teoricos, 0) / public.plan_rendimiento(u.metodo_constructivo, p_fecha)), 2)
  end
    from public.unidades_operativas u
   where u.id = p_uo
$$;

create function public.plan_carga_persona(p_persona uuid, p_fecha date)
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

-- p_n días hábiles hacia adelante (p_n > 0) o hacia atrás (p_n < 0)
create function public.plan_sumar_dias_habiles(p_fecha date, p_n int)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fecha      date := p_fecha;
  v_paso       int  := sign(p_n)::int;
  v_restantes  int  := abs(p_n);
  v_iter       int  := 0;
begin
  while v_restantes > 0 loop
    v_fecha := v_fecha + v_paso;
    v_iter  := v_iter + 1;
    if v_iter > 3660 then
      raise exception 'No hay % dias habiles a partir de %', p_n, p_fecha using errcode = 'P0001';
    end if;
    if public.plan_capacidad_dia(v_fecha) > 0 then
      v_restantes := v_restantes - 1;
    end if;
  end loop;
  return v_fecha;
end;
$$;

-- Días hábiles con signo de p_desde a p_hasta: cuenta (p_desde, p_hasta] hacia
-- adelante o [p_hasta, p_desde) hacia atrás. Inversa de plan_sumar_dias_habiles
-- cuando p_hasta es hábil.
create function public.plan_dias_habiles_entre(p_desde date, p_hasta date)
returns int
language sql
stable
set search_path = ''
as $$
  select case
    when p_hasta >= p_desde then
      (select count(*)::int
         from generate_series((p_desde + 1)::timestamp, p_hasta::timestamp, interval '1 day') d
        where public.plan_capacidad_dia(d::date) > 0)
    else
      -(select count(*)::int
          from generate_series(p_hasta::timestamp, (p_desde - 1)::timestamp, interval '1 day') d
         where public.plan_capacidad_dia(d::date) > 0)
  end
$$;

-- Revisión de la regla de consistencia (R1 a R4 del encabezado). Sin filas = consistente.
create function public.plan_inconsistencias()
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

-- -----------------------------------------------------------------------------
-- Propuesta de fechas (interna; la llaman el trigger y el backfill)
-- -----------------------------------------------------------------------------

create function public.proponer_fechas_uo(p_uo uuid, p_inicio date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_dias constant int := 366;
  v_inicio   date := coalesce(p_inicio, public.plan_hoy());
  v_uo       record;
  v_minimo   numeric;
  v_bloque   numeric;
  v_total    numeric;
  v_dia      date;
  v_libre    numeric;
  v_tomar    numeric;
  v_restante numeric;
  v_fin_1_3  date;
  v_ultimo   date;
  v_iter     int := 0;
begin
  select u.id, u.referencia_operativa, u.digitalizador_id, u.metodo_constructivo, u.km_teoricos
    into v_uo
    from public.unidades_operativas u
   where u.id = p_uo;
  if not found then
    raise exception 'UO no encontrada' using errcode = 'P0002';
  end if;

  if v_uo.digitalizador_id is null then
    raise warning 'Plan semanal: la UO % no tiene digitalizador; no se proponen fechas', v_uo.referencia_operativa;
    return;
  end if;

  -- No se recalcula sola
  if exists (select 1 from public.plan_carga_uo c where c.uo_id = p_uo) then
    return;
  end if;

  if not exists (select 1 from public.actividades_uo a
                   join public.plantillas_actividad p on p.id = a.plantilla_id
                  where a.uo_id = p_uo and p.momento_creacion = 'asignacion') then
    raise notice 'Plan semanal: la UO % no tiene actividades de asignacion', v_uo.referencia_operativa;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('plan_semanal:' || v_uo.digitalizador_id::text, 0));

  v_minimo := public.plan_parametro('jornada_minima_uo', v_inicio);
  v_bloque := public.plan_parametro('jornadas_pasos_1_3_uo_larga', v_inicio);
  if v_minimo is null or v_minimo <= 0 or v_bloque is null or v_bloque <= 0 then
    raise exception 'Faltan parametros vigentes validos en plan_parametros (jornada_minima_uo > 0, jornadas_pasos_1_3_uo_larga > 0)'
      using errcode = 'P0001';
  end if;

  if public.plan_rendimiento(v_uo.metodo_constructivo, v_inicio) is null then
    raise warning 'Plan semanal: la UO % no tiene metodo constructivo con rendimiento vigente; se usan % jornadas',
      v_uo.referencia_operativa, v_minimo;
  end if;
  v_total := public.plan_jornadas_uo(p_uo, v_inicio);

  v_dia := v_inicio - 1;

  if v_total <= 1 then
    -- UO corta (hasta una jornada completa): en un solo día, sin partir
    loop
      v_dia  := v_dia + 1;
      v_iter := v_iter + 1;
      if v_iter > c_max_dias then
        raise exception 'Sin capacidad para % jornadas en % dias desde %', v_total, c_max_dias, v_inicio using errcode = 'P0001';
      end if;
      v_libre := public.plan_capacidad_dia(v_dia) - public.plan_carga_persona(v_uo.digitalizador_id, v_dia);
      exit when v_libre >= v_total;
    end loop;

    insert into public.plan_carga_uo (uo_id, fecha, responsable_id, jornadas)
    values (p_uo, v_dia, v_uo.digitalizador_id, v_total);
    v_fin_1_3 := v_dia;
    v_ultimo  := v_dia;
  else
    -- UO larga, bloque de pasos 1 a 3: jornadas fijas, tomando lo libre de cada
    -- día; puede ocupar dos días (p. ej. viernes 0.75 + lunes 0.25)
    v_bloque   := least(v_bloque, v_total);
    v_restante := v_bloque;
    while v_restante > 0 loop
      v_dia  := v_dia + 1;
      v_iter := v_iter + 1;
      if v_iter > c_max_dias then
        raise exception 'Sin capacidad en % dias desde %', c_max_dias, v_inicio using errcode = 'P0001';
      end if;
      v_libre := public.plan_capacidad_dia(v_dia) - public.plan_carga_persona(v_uo.digitalizador_id, v_dia);
      if v_libre > 0 then
        v_tomar := least(v_libre, v_restante);
        insert into public.plan_carga_uo (uo_id, fecha, responsable_id, jornadas)
        values (p_uo, v_dia, v_uo.digitalizador_id, v_tomar);
        v_restante := v_restante - v_tomar;
      end if;
    end loop;
    v_fin_1_3 := v_dia;
    v_ultimo  := v_dia;

    -- Pulido: el resto, desde el día siguiente al bloque, según lo libre de cada día
    v_restante := v_total - v_bloque;
    while v_restante > 0 loop
      v_dia  := v_dia + 1;
      v_iter := v_iter + 1;
      if v_iter > c_max_dias then
        raise exception 'Sin capacidad en % dias desde %', c_max_dias, v_inicio using errcode = 'P0001';
      end if;
      v_libre := public.plan_capacidad_dia(v_dia) - public.plan_carga_persona(v_uo.digitalizador_id, v_dia);
      if v_libre > 0 then
        v_tomar := least(v_libre, v_restante);
        insert into public.plan_carga_uo (uo_id, fecha, responsable_id, jornadas)
        values (p_uo, v_dia, v_uo.digitalizador_id, v_tomar);
        v_restante := v_restante - v_tomar;
      end if;
    end loop;
    v_ultimo := v_dia;
  end if;

  -- Último paso (pulido) vence el último día reservado; los demás, el último
  -- día del bloque 1 a 3 (en una UO corta, el mismo día)
  with pasos as (
    select a.id, a.orden, max(a.orden) over (partition by a.ronda) as orden_max
      from public.actividades_uo a
      join public.plantillas_actividad p on p.id = a.plantilla_id
     where a.uo_id = p_uo
       and p.momento_creacion = 'asignacion'
  )
  update public.actividades_uo a
     set fecha_programada = case when s.orden = s.orden_max then v_ultimo else v_fin_1_3 end,
         fecha_origen     = 'propuesta'
    from pasos s
   where a.id = s.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: reprogramar
-- -----------------------------------------------------------------------------

create function public.reprogramar_actividad(p_actividad uuid, p_fecha date, p_motivo text)
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

-- -----------------------------------------------------------------------------
-- Triggers existentes (CREATE OR REPLACE conserva dueño y permisos)
-- -----------------------------------------------------------------------------

-- Sin cambios hasta "on conflict ... do nothing;". Agrega la propuesta de fechas.
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

-- Sin cambios en el primer UPDATE. Agrega el paso de la carga de hoy en adelante.
create or replace function public.reasignar_actividades_uo()
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

  -- Plan semanal: la carga de hoy en adelante pasa al nuevo digitalizador,
  -- con las mismas fechas. Los días pasados se quedan con quien los tenía.
  update public.plan_carga_uo
     set responsable_id = new.digitalizador_id
   where uo_id = new.id
     and fecha >= public.plan_hoy();

  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de funciones nuevas
-- Los default privileges de Supabase dan EXECUTE a anon en funciones nuevas.
-- -----------------------------------------------------------------------------

revoke all on function
  public.plan_hoy(),
  public.plan_capacidad_dia(date),
  public.plan_parametro(text, date),
  public.plan_rendimiento(text, date),
  public.plan_jornadas_uo(uuid, date),
  public.plan_carga_persona(uuid, date),
  public.plan_sumar_dias_habiles(date, int),
  public.plan_dias_habiles_entre(date, date),
  public.plan_inconsistencias(),
  public.proponer_fechas_uo(uuid, date),
  public.reprogramar_actividad(uuid, date, text)
  from public, anon, authenticated;

grant execute on function public.reprogramar_actividad(uuid, date, text) to authenticated;

commit;
