-- Que hace: agrega a Ademir Marquez, Miguel Angel Sanchez y Uziel Alarcon a plan_integrantes (orden 1, 2, 3), buscandolos por nombre exacto; escribe y hace commit.
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: sin filas y sin error. Si ya estaban, no cambia nada. Si aborta, mandar el mensaje de error completo.

-- Nunca por UUID: los UUID de usuarios de Authentication no se escriben en el
-- repo (CLAUDE.md). Aborta sin escribir si algun nombre no aparece exactamente
-- una vez entre los perfiles activos, o si hay perfiles Seed% o UOs
-- SEED-/PRUEBA- (eso indicaria que no es produccion).

begin;

do $$
declare
  v_lista text;
begin
  if to_regclass('public.plan_integrantes') is null then
    raise exception 'Primero aplica 2026-10-26_plan-semanal.sql';
  end if;

  if exists (select 1 from public.profiles where nombre ilike 'Seed%') then
    raise exception 'Hay perfiles Seed%%: esto no parece produccion. Abortado.';
  end if;
  if exists (select 1 from public.unidades_operativas
              where referencia_operativa like 'SEED-%' or referencia_operativa like 'PRUEBA-%') then
    raise exception 'Hay UOs SEED- o PRUEBA-: esto no parece produccion. Abortado.';
  end if;

  select string_agg(n.nombre || ' (' || (select count(*) from public.profiles p
                                          where p.nombre = n.nombre and p.activo is true) || ')', ', ')
    into v_lista
    from (values ('Ademir Marquez'), ('Miguel Angel Sanchez'), ('Uziel Alarcon')) as n(nombre)
   where (select count(*) from public.profiles p where p.nombre = n.nombre and p.activo is true) <> 1;
  if v_lista is not null then
    raise exception 'Cada nombre debe existir exactamente una vez entre los perfiles activos. Revisar: %', v_lista;
  end if;

  insert into public.plan_integrantes (profile_id, orden)
  select p.id, n.orden
    from (values ('Ademir Marquez', 1), ('Miguel Angel Sanchez', 2), ('Uziel Alarcon', 3)) as n(nombre, orden)
    join public.profiles p on p.nombre = n.nombre and p.activo is true
  on conflict (profile_id) do nothing;
end $$;

commit;
