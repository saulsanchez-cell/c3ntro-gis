-- Que hace: "nadie se autovalida" como trigger en unidades_operativas. Rechaza crear una UO, o cambiarle el digitalizador o el analista QA, si quedan la misma persona. Si existe el check de la version anterior de este archivo, lo quita. Escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual. Despues correr 06b_pruebas_rollback.sql (solo SIGOprueba).
-- Resultado esperado: sin filas y sin error. Si aborta porque el trigger ya existe, no queda nada escrito: mandar el mensaje.
-- Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-11-02 (version trigger; quito el check de la primera version)
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-11-02
--
-- Historia: la primera version de este archivo era un check
-- (analista_qa_id <> digitalizador_id), aplicado solo en SIGOprueba el
-- 2026-11-02. En produccion el 00 encontro 8 UOs viejas (7 Cerradas y 1
-- Validada) con analista = digitalizador. Un check, aun NOT VALID, se revisa
-- en cualquier UPDATE de la fila: no se podria pasar la Validada a Cerrada ni
-- guardar FichaUO de esas UOs (siempre manda los dos campos). El trigger
-- solo revisa cuando el digitalizador o el analista cambian de verdad, asi que
-- esas 8 se quedan como estan y se pueden seguir editando.
--
-- Mensaje (lo ve el alert de FichaUO):
--   El analista QA no puede ser el mismo digitalizador (nadie se autovalida)
-- Codigo 23514 (check_violation), el mismo que daria un check.

begin;

do $$
begin
  if exists (select 1 from pg_trigger
              where tgrelid = 'public.unidades_operativas'::regclass
                and tgname in ('trg_analista_distinto_insert', 'trg_analista_distinto_update')) then
    raise exception 'El trigger ya existe. Abortado.';
  end if;
end $$;

-- Version anterior (solo existe en SIGOprueba)
alter table public.unidades_operativas
  drop constraint if exists unidades_operativas_analista_distinto_digitalizador_check;

create function public.validar_analista_distinto_uo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.analista_qa_id = new.digitalizador_id then
    raise exception 'El analista QA no puede ser el mismo digitalizador (nadie se autovalida)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- En INSERT el WHEN no puede usar OLD: por eso son dos triggers.
create trigger trg_analista_distinto_insert
  before insert on public.unidades_operativas
  for each row
  when (new.analista_qa_id = new.digitalizador_id)
  execute function public.validar_analista_distinto_uo();

create trigger trg_analista_distinto_update
  before update of analista_qa_id, digitalizador_id on public.unidades_operativas
  for each row
  when ((new.analista_qa_id is distinct from old.analista_qa_id
         or new.digitalizador_id is distinct from old.digitalizador_id)
        and new.analista_qa_id = new.digitalizador_id)
  execute function public.validar_analista_distinto_uo();

revoke all on function public.validar_analista_distinto_uo() from public, anon, authenticated;

commit;
