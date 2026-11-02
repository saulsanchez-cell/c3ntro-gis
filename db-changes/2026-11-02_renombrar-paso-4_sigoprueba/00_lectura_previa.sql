-- Que hace: parte A (solo lectura). Cuenta la plantilla y las actividades que se llaman "Revisión y pulido en Vetro" y confirma que nada se llama todavia "Ajustes y autorrevisión en Vetro".
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf).
-- Resultado esperado: 1 fila con plantillas_viejo = 1, plantillas_nuevo = 0, actividades_nuevo = 0, actividades_otro_nombre = 0 y todo_listo = true. Mandar actividades_viejo (es lo que el 01 va a renombrar). Si todo_listo = false, NO seguir: mandar la fila.
-- Corrido en SIGOprueba el 2026-11-02: resultado esperado (actividades_viejo = 14)

select (select count(*) from public.plantillas_actividad
         where nombre = 'Revisión y pulido en Vetro')                        as plantillas_viejo,
       (select count(*) from public.plantillas_actividad
         where nombre = 'Ajustes y autorrevisión en Vetro')                  as plantillas_nuevo,
       (select count(*) from public.actividades_uo
         where nombre = 'Revisión y pulido en Vetro')                        as actividades_viejo,
       (select count(*) from public.actividades_uo
         where nombre = 'Ajustes y autorrevisión en Vetro')                  as actividades_nuevo,
       -- actividades del paso 4 cuyo nombre no es el viejo (alguien lo cambio a mano)
       (select count(*) from public.actividades_uo a
          join public.plantillas_actividad p on p.id = a.plantilla_id
         where p.momento_creacion = 'asignacion' and p.orden = 4
           and a.nombre <> 'Revisión y pulido en Vetro')                     as actividades_otro_nombre,
       (select count(*) from public.plantillas_actividad
         where nombre = 'Revisión y pulido en Vetro'
           and orden = 4 and momento_creacion = 'asignacion') = 1
       and not exists (select 1 from public.plantillas_actividad
                        where nombre = 'Ajustes y autorrevisión en Vetro')
       and not exists (select 1 from public.actividades_uo
                        where nombre = 'Ajustes y autorrevisión en Vetro')
       and not exists (select 1 from public.actividades_uo a
                         join public.plantillas_actividad p on p.id = a.plantilla_id
                        where p.momento_creacion = 'asignacion' and p.orden = 4
                          and a.nombre <> 'Revisión y pulido en Vetro')     as todo_listo;
