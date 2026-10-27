-- Que hace: TEMPORAL. Restaura la definicion original de es_coordinador() (deshace 05); escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). NUNCA en produccion. Correr al terminar las pruebas de reprogramar.
-- Resultado esperado: sin filas y sin error; el coordinador de prueba vuelve a recibir "No tienes permiso para reprogramar actividades".

-- Definición copiada de SIGOprueba con pg_get_functiondef el 2026-10-27, antes
-- de aplicar 05. Único cambio: los finales de línea CRLF del original quedaron
-- como LF. CREATE OR REPLACE conserva dueño y permisos.

begin;

do $$
begin
  if exists (select 1 from public.unidades_operativas
              where referencia_operativa not like 'SEED-%'
                and referencia_operativa not like 'PRUEBA-%') then
    raise exception 'Hay UOs reales en esta base: esto no parece SIGOprueba. Abortado.';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.es_coordinador()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(auth.uid() = '7063db07-ed16-4ca5-8c98-53b63d128702'::uuid, false)
$function$;

commit;
