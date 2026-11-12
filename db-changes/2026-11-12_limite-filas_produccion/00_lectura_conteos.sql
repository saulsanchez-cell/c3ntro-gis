-- Que hace: cuenta cuantas filas devuelve hoy cada consulta de la app que lee una tabla completa, sin paginar (solo lectura).
-- Proyecto: produccion (rtwjwfpaturmbmegwtys). Tambien sirve en SIGOprueba.
-- Resultado esperado: 8 filas. La API de Supabase devuelve como maximo 1000 filas por consulta (Max Rows):
--   las que pasen de 1000 ya estan cortando datos en la pantalla indicada; las cercanas lo haran pronto.
-- Mandar el resultado completo.
-- Corrido en produccion el 2026-11-12 (reportado por Saul): checklist_respuestas 11452 (Calidad cortaba en 1000),
--   UOs no historicas 1468 (Equipo cortaba en 1000), respuestas con observacion 617, logs 370, checklist_resultados 296,
--   eventos de reprogramar 31, UOs activas 23, reaperturas 8. Se corrigio con lib/consultas.js (leerTodas).

select 'Calidad: checklist_respuestas (todas)' as consulta, count(*) as filas, 1000 as limite
  from public.checklist_respuestas
union all
select 'Calidad, Equipo y Reporte KM: checklist_resultados (todos)', count(*), 1000
  from public.checklist_resultados
union all
select 'Alertas: checklist_respuestas con observacion', count(*), 1000
  from public.checklist_respuestas where observacion_descripcion is not null
union all
select 'Alertas: logs_actividad (todos)', count(*), 1000
  from public.logs_actividad
union all
select 'Equipo: unidades_operativas no historicas', count(*), 1000
  from public.unidades_operativas where es_historico = false
union all
select 'Alertas: UOs activas (Asignada, En Proceso, En Validacion, Bloqueada)', count(*), 1000
  from public.unidades_operativas
 where es_historico = false and estado in ('Asignada', 'En Proceso', 'En Validacion', 'Bloqueada')
union all
select 'Equipo: historial de reaperturas', count(*), 1000
  from public.historial_estados
 where estado_anterior in ('Validada', 'Cerrada') and estado_nuevo in ('En Correccion', 'En Proceso')
union all
select 'Equipo: eventos de reprogramar', count(*), 1000
  from public.actividades_uo_eventos where evento = 'reprogramar'
order by 2 desc;
