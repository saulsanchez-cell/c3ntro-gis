-- Que hace: mide como escribe hoy el equipo en las tablas que van a recibir politicas por rol (solo lectura). Cuenta, por persona, las escrituras de los ultimos 90 dias que una regla "solo coordinador, o el digitalizador o analista de la UO" habria bloqueado.
-- Proyecto: produccion (rtwjwfpaturmbmegwtys). Se corre como postgres en el SQL Editor.
-- Resultado esperado: una fila por persona y tipo de escritura. Mandar todas. Si una persona tiene "fuera_de_su_uo" > 0, la regla le bloquearia trabajo que hoy hace.
-- Corrido en produccion el 2026-11-03: los analistas no escriben fuera de sus UOs; Saul (coordinador) si; Edgar (1) y Martin (4) logs fuera de su UO: son cuentas de apoyo. Decision: logs propios en cualquier UO.

with desde as (select now() - interval '90 days' as t),
coord as (select '7063db07-ed16-4ca5-8c98-53b63d128702'::uuid as id),
escrituras as (
  -- Cambios de estado y asignaciones (historial)
  select 'historial_estados' as tipo, h.usuario_id, h.uo_id
    from public.historial_estados h, desde where h.created_at >= desde.t
  union all
  -- Logs de avance
  select 'logs_actividad', l.usuario_id, l.uo_id
    from public.logs_actividad l, desde where l.created_at >= desde.t
  union all
  -- Checklists enviados
  select 'checklist_resultados', r.analista_id, r.uo_id
    from public.checklist_resultados r, desde where r.created_at >= desde.t
)
select p.nombre,
       p.rol,
       e.tipo,
       count(*)                                                          as escrituras,
       count(*) filter (where e.usuario_id is distinct from u.digitalizador_id
                          and e.usuario_id is distinct from u.analista_qa_id) as fuera_de_su_uo,
       (e.usuario_id = (select id from coord))                            as es_el_coordinador_fijo
  from escrituras e
  join public.unidades_operativas u on u.id = e.uo_id
  left join public.profiles p on p.id = e.usuario_id
 group by p.nombre, p.rol, e.tipo, e.usuario_id
 order by 6 desc, 1, 3;
