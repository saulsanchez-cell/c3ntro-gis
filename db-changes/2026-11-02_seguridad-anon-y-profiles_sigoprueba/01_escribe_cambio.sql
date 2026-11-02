-- Que hace: cierra el acceso de anon a las 13 tablas viejas, quita a authenticated TRUNCATE, REFERENCES y TRIGGER en esas tablas, pasa las 2 politicas de lectura de public a authenticated y deja la escritura de profiles solo al coordinador; escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual (ver ../2026-11-02_seguridad-anon-y-profiles_produccion/README.md).
-- Reversa: db-changes/2026-11-02_seguridad-anon-y-profiles_reversa.sql
-- Resultado esperado: sin filas y sin error. Si aborta porque la base no esta como en el 00, no queda nada escrito: mandar el mensaje completo.
-- Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-11-02
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-11-02
--
-- Por que (auditoria del 2026-11-02 con has_table_privilege):
--   - anon (cualquiera con la clave publica, que va en el bundle de la app)
--     tenia todos los privilegios en las 13 tablas viejas: el default de
--     Supabase, nunca revocado. Solo RLS lo contenia, y read_catalogo y
--     read_transiciones (TO public) si se podian leer sin sesion.
--   - authenticated y anon tenian TRUNCATE, que no pasa por RLS. PostgREST no
--     lo expone, pero es una capa menos.
--   - profiles tenia auth_all_profiles (ALL, USING true): cualquier sesion
--     podia cambiar el rol, nombre o activo de cualquiera, crear perfiles o
--     borrarlos (y por cascada su lugar en plan_integrantes y sus borradores).
--     La app nunca escribe en profiles: solo lee.
--
-- Cambios:
--   1. REVOKE ALL a public y anon en las 13 tablas.
--   2. REVOKE TRUNCATE, REFERENCES, TRIGGER a authenticated en las 13 tablas.
--      authenticated conserva SELECT, INSERT, UPDATE y DELETE (las politicas
--      siguen decidiendo, igual que antes).
--   3. read_catalogo y read_transiciones pasan a authenticated (es el antiguo
--      PROPUESTO_politicas-lectura-a-authenticated.sql). Solo las leen
--      Checklist y FichaUO, que siempre tienen sesion.
--   4. profiles: auth_all_profiles se reemplaza por
--        profiles_select  SELECT para authenticated, USING true (como hoy)
--        profiles_insert  INSERT  solo si es_coordinador()
--        profiles_update  UPDATE  solo si es_coordinador()
--        profiles_delete  DELETE  solo si es_coordinador()
--      Desde el SQL Editor (postgres) se sigue pudiendo todo: no aplica RLS.
--      Para otra sesion, un UPDATE o DELETE no da error: afecta 0 filas.
--
-- No toca: las otras 9 politicas de escritura abiertas (USING true) de las
-- tablas viejas; quedan para las politicas por rol. No las amplia.
-- DEUDA TECNICA v2: es_coordinador() usa el UUID fijo del coordinador.

begin;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                   and policyname = 'auth_all_profiles' and cmd = 'ALL' and roles = '{authenticated}' and qual = 'true')
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                  and policyname <> 'auth_all_profiles') then
    raise exception 'Las politicas de profiles no son las medidas el 2026-11-02. Abortado.';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'read_catalogo'
                   and tablename = 'catalogo_observaciones_qa' and roles = '{public}')
     or not exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'read_transiciones'
                      and tablename = 'transiciones_permitidas' and roles = '{public}') then
    raise exception 'read_catalogo o read_transiciones no estan TO public. Abortado.';
  end if;
  if not has_function_privilege('authenticated', 'public.es_coordinador()', 'execute') then
    raise exception 'authenticated no puede ejecutar es_coordinador(): las politicas nuevas lo necesitan. Abortado.';
  end if;
end $$;

-- 1 y 2. Privilegios
revoke all on table
  public.catalogo_observaciones_qa, public.checklist_borradores, public.checklist_items,
  public.checklist_respuestas, public.checklist_resultados, public.checklist_versiones,
  public.historial_estados, public.log_distancia, public.logs_actividad, public.metas_proyecto,
  public.profiles, public.transiciones_permitidas, public.unidades_operativas
  from public, anon;

revoke truncate, references, trigger on table
  public.catalogo_observaciones_qa, public.checklist_borradores, public.checklist_items,
  public.checklist_respuestas, public.checklist_resultados, public.checklist_versiones,
  public.historial_estados, public.log_distancia, public.logs_actividad, public.metas_proyecto,
  public.profiles, public.transiciones_permitidas, public.unidades_operativas
  from authenticated;

-- 3. Lectura de catalogos solo con sesion
alter policy read_catalogo     on public.catalogo_observaciones_qa to authenticated;
alter policy read_transiciones on public.transiciones_permitidas   to authenticated;

-- 4. profiles: todos leen, solo el coordinador escribe
drop policy auth_all_profiles on public.profiles;

create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_insert on public.profiles
  for insert to authenticated with check (public.es_coordinador());
create policy profiles_update on public.profiles
  for update to authenticated using (public.es_coordinador()) with check (public.es_coordinador());
create policy profiles_delete on public.profiles
  for delete to authenticated using (public.es_coordinador());

commit;
