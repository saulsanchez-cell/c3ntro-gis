-- Que hace: TEMPORAL. Redefine es_coordinador() para aceptar tambien al coordinador de prueba; escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). NUNCA en produccion. Revertir con 06 al terminar las pruebas.
-- Resultado esperado: sin filas y sin error. Si falla con "invalid input syntax for type uuid", falta reemplazar PEGAR_UUID_COORDINADOR_PRUEBA.

-- Antes de ejecutar: reemplaza PEGAR_UUID_COORDINADOR_PRUEBA por el UUID del
-- coordinador de prueba (Authentication > Users). No lo guardes en el repo.
--
-- Efecto: mientras esté aplicado, el coordinador de prueba también pasa
-- es_coordinador() en marcar_actividad, desmarcar_actividad,
-- ajustar_hora_actividad y reprogramar_actividad.
-- CREATE OR REPLACE conserva dueño y permisos (EXECUTE para authenticated).

begin;

do $$
begin
  if exists (select 1 from public.unidades_operativas
              where referencia_operativa not like 'SEED-%'
                and referencia_operativa not like 'PRUEBA-%') then
    raise exception 'Hay UOs reales en esta base: esto no parece SIGOprueba. Abortado.';
  end if;
end $$;

create or replace function public.es_coordinador()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.uid() in ('7063db07-ed16-4ca5-8c98-53b63d128702'::uuid,
                                 'PEGAR_UUID_COORDINADOR_PRUEBA'::uuid), false)
$$;

commit;
