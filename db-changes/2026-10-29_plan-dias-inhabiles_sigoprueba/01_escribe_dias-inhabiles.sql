-- Que hace: carga en plan_dias_inhabiles los 7 dias de descanso obligatorio de nov-2026 a nov-2027 con su motivo en descripcion (on conflict do nothing); escribe y hace commit. Es el mismo archivo para SIGOprueba y produccion.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf) y despues PRODUCCIÓN (rtwjwfpaturmbmegwtys). Reversa: db-changes/2026-10-29_plan-dias-inhabiles_reversa.sql.
-- Resultado esperado: sin filas y sin error. Si una fecha ya existia, se conserva la fila anterior (el 00 debe haber dado ya_cargadas = 0).
-- Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-10-29
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-10-29

begin;

insert into public.plan_dias_inhabiles (fecha, descripcion) values
  ('2026-11-16', 'Aniversario de la Revolución Mexicana (descanso obligatorio, tercer lunes de noviembre)'),
  ('2026-12-25', 'Navidad (descanso obligatorio)'),
  ('2027-01-01', 'Año Nuevo (descanso obligatorio)'),
  ('2027-02-01', 'Día de la Constitución (descanso obligatorio, primer lunes de febrero)'),
  ('2027-03-15', 'Natalicio de Benito Juárez (descanso obligatorio, tercer lunes de marzo)'),
  ('2027-09-16', 'Día de la Independencia (descanso obligatorio)'),
  ('2027-11-15', 'Aniversario de la Revolución Mexicana (descanso obligatorio, tercer lunes de noviembre)')
on conflict (fecha) do nothing;

commit;
