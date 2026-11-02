-- Que hace: lista las UOs donde el analista QA es el mismo digitalizador (solo lectura), con su estado y si el backfill 04b les crearia validacion.
-- Proyecto: produccion (rtwjwfpaturmbmegwtys). Se agrego porque el 00 en produccion dio uos_analista_igual_digitalizador = 8 (2026-11-02).
-- Resultado esperado: 8 filas. Mandar todas.
-- Corrido en produccion el 2026-11-02: 8 filas: 1447 Validada; 1104, 1132, 1594, 210, 251, 327 y 755 Cerradas; ninguna entra al backfill

select u.referencia_operativa,
       u.estado,
       u.es_historico,
       pr.nombre as persona,
       u.fecha_asignacion,
       u.estado in ('Asignada', 'En Proceso', 'En Correccion', 'En Validacion') as entra_al_backfill,
       exists (select 1 from public.actividades_uo a where a.uo_id = u.id) as tiene_actividades
  from public.unidades_operativas u
  left join public.profiles pr on pr.id = u.digitalizador_id
 where u.analista_qa_id = u.digitalizador_id
 order by entra_al_backfill desc, u.estado, u.referencia_operativa;
