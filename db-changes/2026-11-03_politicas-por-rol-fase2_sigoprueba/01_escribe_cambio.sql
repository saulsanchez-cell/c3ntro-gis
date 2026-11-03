-- Que hace: politicas por rol, fase 2: unidades_operativas. Reemplaza auth_all_uo (ALL, USING true) por politicas por rol y relacion con la UO, y agrega el trigger proteger_columnas_uo que limita que columnas cambia cada quien; escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual (ver ../2026-11-03_politicas-por-rol_produccion/README-fase2.md).
-- Reversa: db-changes/2026-11-03_politicas-por-rol-fase2_reversa.sql (antes, revertir el frontend de la fase 2 si ya se fusiono).
-- Resultado esperado: sin filas y sin error. Si aborta porque la base no esta como en el 00, no queda nada escrito: mandar el mensaje completo.
-- Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-11-03
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-11-03
-- Huella de proteger_columnas_uo() tras el cambio: a04e439e383ccf0e908a2cc8bdb1170d
--
-- Requiere la fase 1 (es_coordinador() por rol).
--
-- Politicas (decisiones de Saul, 2026-11-03):
--   uo_select  leer: todos (authenticated)
--   uo_insert  crear: solo el coordinador
--   uo_delete  borrar: solo el coordinador (cierra el DELETE abierto, que
--              borraba en cascada el historial y los eventos)
--   uo_update  editar: el coordinador, el digitalizador o el analista QA de la
--              UO, o quien tenga un log propio en ella (cuentas de apoyo como
--              Edgar Molina y Martin Alcantar). FichaUO guarda el log antes de
--              actualizar las fechas, asi que la condicion ya se cumple.
--
-- Trigger proteger_columnas_uo (BEFORE UPDATE): compara OLD y NEW y solo deja
-- cambiar estas columnas (las que no cambian no cuentan: FichaUO manda todas):
--   coordinador, o sin sesion (SQL Editor)   todas (km_teoricos sigue
--                                            protegido por proteger_km_teoricos)
--   digitalizador o analista QA de la UO     estado, no_revision, resultado_checklist,
--                                            fecha_inicio_real, fecha_carga_final, dias_proceso
--   cuenta de apoyo (log propio en la UO)    fecha_inicio_real, fecha_carga_final, dias_proceso
--   La relacion se toma de OLD (antes del cambio).
--   Error: 'No tienes permiso para cambiar: <columnas>' (42501).
-- No toca la maquina de estados (transiciones_permitidas) ni proteger_km_teoricos.
-- Las funciones SECURITY DEFINER y los triggers existentes no escriben en
-- unidades_operativas: no cambian.

begin;

do $$
begin
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'unidades_operativas') <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'unidades_operativas'
                      and policyname = 'auth_all_uo' and cmd = 'ALL' and roles = '{authenticated}' and qual = 'true') then
    raise exception 'unidades_operativas no tiene solo auth_all_uo abierta, como se midio el 2026-11-03. Abortado.';
  end if;
  if md5(replace(pg_get_functiondef('public.es_coordinador()'::regprocedure), E'\r', ''))
       is distinct from '9ed2b30dd261b6d3243aad357c727dad' then
    raise exception 'es_coordinador() no es la de la fase 1 (md5 distinto). Aplica primero la fase 1. Abortado.';
  end if;
  if to_regprocedure('public.proteger_columnas_uo()') is not null then
    raise exception 'proteger_columnas_uo() ya existe. Abortado.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Trigger de columnas
-- -----------------------------------------------------------------------------

create function public.proteger_columnas_uo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_apoyo  constant text[] := array['fecha_inicio_real', 'fecha_carga_final', 'dias_proceso'];
  c_equipo constant text[] := array['estado', 'no_revision', 'resultado_checklist',
                                    'fecha_inicio_real', 'fecha_carga_final', 'dias_proceso'];
  v_uid        uuid := auth.uid();
  v_permitidas text[];
  v_prohibidas text[];
begin
  -- SQL Editor (sin sesion) y coordinador: sin restriccion
  if v_uid is null or public.es_coordinador() then
    return new;
  end if;

  if v_uid = old.digitalizador_id or v_uid = old.analista_qa_id then
    v_permitidas := c_equipo;
  elsif exists (select 1 from public.logs_actividad l where l.uo_id = old.id and l.usuario_id = v_uid) then
    v_permitidas := c_apoyo;
  else
    v_permitidas := '{}';
  end if;

  select coalesce(array_agg(n.key order by n.key), '{}')
    into v_prohibidas
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key)
     and not (n.key = any (v_permitidas));

  if cardinality(v_prohibidas) > 0 then
    raise exception 'No tienes permiso para cambiar: %', array_to_string(v_prohibidas, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_proteger_columnas_uo
  before update on public.unidades_operativas
  for each row
  execute function public.proteger_columnas_uo();

revoke all on function public.proteger_columnas_uo() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Politicas
-- -----------------------------------------------------------------------------

drop policy auth_all_uo on public.unidades_operativas;

create policy uo_select on public.unidades_operativas
  for select to authenticated using (true);

create policy uo_insert on public.unidades_operativas
  for insert to authenticated with check (public.es_coordinador());

create policy uo_update on public.unidades_operativas
  for update to authenticated
  using (public.es_coordinador()
         or auth.uid() = digitalizador_id
         or auth.uid() = analista_qa_id
         or exists (select 1 from public.logs_actividad l
                     where l.uo_id = unidades_operativas.id and l.usuario_id = auth.uid()))
  with check (public.es_coordinador()
              or auth.uid() = digitalizador_id
              or auth.uid() = analista_qa_id
              or exists (select 1 from public.logs_actividad l
                          where l.uo_id = unidades_operativas.id and l.usuario_id = auth.uid()));

create policy uo_delete on public.unidades_operativas
  for delete to authenticated using (public.es_coordinador());

commit;
