-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- REVERSA de 2026-11-03_politicas-por-rol-fase2 (unidades_operativas). El
-- cambio esta en 2026-11-03_politicas-por-rol-fase2_sigoprueba/01_escribe_cambio.sql.
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD
-- Aplicado en producción (rtwjwfpaturmbmegwtys): AAAA-MM-DD
--
-- Si el frontend de la fase 2 ya se fusiono, revertirlo antes (solo oculta
-- botones: no se rompe nada si se corre primero, pero el orden es la regla).
-- Devuelve unidades_operativas a como estaba el 2026-11-03: quita
-- trg_proteger_columnas_uo, proteger_columnas_uo() y las 4 politicas uo_*, y
-- recrea auth_all_uo (ALL, TO authenticated, USING true, WITH CHECK true).
-- Vuelve a abrir la escritura y el DELETE de unidades_operativas: correrla solo
-- si la fase 2 rompio algo.
-- La fase 1 no cambia (para revertirla, despues correr su propia reversa).
-- =============================================================================

begin;

do $$
begin
  if to_regprocedure('public.proteger_columnas_uo()') is null then
    raise exception 'proteger_columnas_uo() no existe: la fase 2 no esta aplicada. Abortado.';
  end if;
end $$;

drop trigger trg_proteger_columnas_uo on public.unidades_operativas;
drop function public.proteger_columnas_uo();

drop policy uo_select on public.unidades_operativas;
drop policy uo_insert on public.unidades_operativas;
drop policy uo_update on public.unidades_operativas;
drop policy uo_delete on public.unidades_operativas;

create policy auth_all_uo on public.unidades_operativas
  for all to authenticated using (true) with check (true);

commit;
