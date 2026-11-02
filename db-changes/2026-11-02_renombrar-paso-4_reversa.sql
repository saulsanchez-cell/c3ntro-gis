-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- REVERSA de 2026-11-02_renombrar-paso-4 (paso 4: "Ajustes y autorrevisión en Vetro").
-- El cambio está en 2026-11-02_renombrar-paso-4_sigoprueba/01_escribe_cambio.sql.
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD  <-- completar
-- Aplicado en producción (rtwjwfpaturmbmegwtys): AAAA-MM-DD  <-- completar
--
-- ANTES DE CORRERLA HAY QUE REVERTIR EL FRONTEND (leyenda del PDF), para que
-- el texto vuelva a coincidir con el nombre de la actividad.
--
-- Devuelve el nombre "Revisión y pulido en Vetro" a la plantilla del paso 4 y
-- a todas sus actividades, incluidas las creadas después del cambio (todas
-- vienen de la misma plantilla). No toca fechas, carga, eventos ni estados.
--
-- Verificación después (en su propia consulta):
--   select count(*) from public.actividades_uo where nombre = 'Ajustes y autorrevisión en Vetro';
--     -> 0
-- =============================================================================

begin;

do $$
declare
  v_plantilla   uuid;
  v_actividades int;
begin
  select p.id into strict v_plantilla
    from public.plantillas_actividad p
   where p.nombre = 'Ajustes y autorrevisión en Vetro'
     and p.orden = 4
     and p.momento_creacion = 'asignacion';

  update public.plantillas_actividad
     set nombre = 'Revisión y pulido en Vetro'
   where id = v_plantilla;

  update public.actividades_uo
     set nombre = 'Revisión y pulido en Vetro'
   where plantilla_id = v_plantilla
     and nombre = 'Ajustes y autorrevisión en Vetro';
  get diagnostics v_actividades = row_count;

  raise notice 'Reversa: 1 plantilla y % actividades vuelven a "Revisión y pulido en Vetro"', v_actividades;
end $$;

commit;
