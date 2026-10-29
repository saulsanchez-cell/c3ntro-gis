-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- REVERSA de 2026-10-29_plan-dias-inhabiles (7 días de descanso obligatorio).
-- El cambio está en 2026-10-29_plan-dias-inhabiles_sigoprueba/01_escribe_dias-inhabiles.sql.
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD  <-- completar
-- Aplicado en producción (rtwjwfpaturmbmegwtys): AAAA-MM-DD  <-- completar
--
-- Borra solo esas 7 fechas, y solo si la descripción es la que puso el 01: si
-- una fecha ya existía con otro texto (el 01 la dejó intacta por el on conflict
-- do nothing), no es de este cambio y no se borra.
--
-- No mueve nada: las fechas y la carga que se propusieron saltando estos días
-- se quedan como están. No hay frontend que revertir antes.
--
-- Verificación después (en su propia consulta):
--   select count(*) from public.plan_dias_inhabiles
--    where fecha in ('2026-11-16', '2026-12-25', '2027-01-01', '2027-02-01',
--                    '2027-03-15', '2027-09-16', '2027-11-15');
--     -> 0
-- =============================================================================

begin;

delete from public.plan_dias_inhabiles i
 using (values
   ('2026-11-16'::date, 'Aniversario de la Revolución Mexicana (descanso obligatorio, tercer lunes de noviembre)'),
   ('2026-12-25'::date, 'Navidad (descanso obligatorio)'),
   ('2027-01-01'::date, 'Año Nuevo (descanso obligatorio)'),
   ('2027-02-01'::date, 'Día de la Constitución (descanso obligatorio, primer lunes de febrero)'),
   ('2027-03-15'::date, 'Natalicio de Benito Juárez (descanso obligatorio, tercer lunes de marzo)'),
   ('2027-09-16'::date, 'Día de la Independencia (descanso obligatorio)'),
   ('2027-11-15'::date, 'Aniversario de la Revolución Mexicana (descanso obligatorio, tercer lunes de noviembre)')
 ) as f(fecha, descripcion)
 where i.fecha = f.fecha
   and i.descripcion = f.descripcion;

commit;
