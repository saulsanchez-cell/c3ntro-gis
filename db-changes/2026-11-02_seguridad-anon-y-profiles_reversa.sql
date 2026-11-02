-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- REVERSA de 2026-11-02_seguridad-anon-y-profiles (cierre de anon y profiles
-- solo coordinador). El cambio esta en
-- 2026-11-02_seguridad-anon-y-profiles_sigoprueba/01_escribe_cambio.sql.
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD
-- Aplicado en producción (rtwjwfpaturmbmegwtys): AAAA-MM-DD
--
-- No depende de ningun cambio de frontend: se puede correr directo.
-- Devuelve la base a como estaba el 2026-11-02:
--   - GRANT ALL a anon en las 13 tablas (el default de Supabase).
--   - GRANT TRUNCATE, REFERENCES, TRIGGER a authenticated en las 13 tablas.
--   - read_catalogo y read_transiciones otra vez TO public.
--   - profiles: quita las 4 politicas nuevas y recrea auth_all_profiles
--     (ALL, TO authenticated, USING true).
-- Vuelve a abrir los huecos que cerro el cambio: correrla solo si el cambio
-- rompio algo, y despues volver a aplicarlo corregido.
--
-- Verificacion despues: 03_lectura_auditoria-seguridad.sql vuelve a dar las
-- 30 filas con conocido = false medidas el 2026-11-02 antes del cambio.
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                   and policyname = 'profiles_update') then
    raise exception 'profiles_update no existe: el cambio no esta aplicado. Abortado.';
  end if;
end $$;

drop policy profiles_select on public.profiles;
drop policy profiles_insert on public.profiles;
drop policy profiles_update on public.profiles;
drop policy profiles_delete on public.profiles;

create policy auth_all_profiles on public.profiles
  for all to authenticated using (true);

alter policy read_catalogo     on public.catalogo_observaciones_qa to public;
alter policy read_transiciones on public.transiciones_permitidas   to public;

grant truncate, references, trigger on table
  public.catalogo_observaciones_qa, public.checklist_borradores, public.checklist_items,
  public.checklist_respuestas, public.checklist_resultados, public.checklist_versiones,
  public.historial_estados, public.log_distancia, public.logs_actividad, public.metas_proyecto,
  public.profiles, public.transiciones_permitidas, public.unidades_operativas
  to authenticated;

grant all on table
  public.catalogo_observaciones_qa, public.checklist_borradores, public.checklist_items,
  public.checklist_respuestas, public.checklist_resultados, public.checklist_versiones,
  public.historial_estados, public.log_distancia, public.logs_actividad, public.metas_proyecto,
  public.profiles, public.transiciones_permitidas, public.unidades_operativas
  to anon;

commit;
