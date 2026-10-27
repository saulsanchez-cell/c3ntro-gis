-- Que hace: agrega el perfil "Seed Digitalizador" a plan_integrantes (al final del orden); escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). NUNCA en produccion.
-- Resultado esperado: sin filas y sin error; despues aparece una cuarta fila en el Plan semanal. Si ya estaba, no cambia nada.

-- Busca el perfil por nombre: su UUID es de un usuario de Authentication y no
-- se escribe en el repo (CLAUDE.md).

begin;

do $$
declare
  v_n int;
begin
  if exists (select 1 from public.unidades_operativas
              where referencia_operativa not like 'SEED-%'
                and referencia_operativa not like 'PRUEBA-%') then
    raise exception 'Hay UOs reales en esta base: esto no parece SIGOprueba. Abortado.';
  end if;

  select count(*) into v_n from public.profiles where nombre = 'Seed Digitalizador';
  if v_n <> 1 then
    raise exception 'Se esperaba exactamente 1 perfil "Seed Digitalizador" y hay %', v_n;
  end if;

  insert into public.plan_integrantes (profile_id, orden)
  select p.id, (select coalesce(max(i.orden), 0) + 1 from public.plan_integrantes i)
    from public.profiles p
   where p.nombre = 'Seed Digitalizador'
  on conflict (profile_id) do nothing;
end $$;

commit;
